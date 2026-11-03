import { HTTPException } from "hono/http-exception";
// Merged feed: native Tribes posts + mirrored X posts, newest first.
// Global feed is Redis-cached (5s) — this is the hottest path and the main
// fix for v1's "every pageview hammers Postgres" overload.
import { Hono } from "hono";
import { OFFICIAL_ACCOUNT_ID, type PostView, type FeedItem } from "@mention/shared";
import {
  posts, xPosts, xPostCommunities, communities, users, communityMembers,
  postLikes, postReposts, xPostLikes, xPostReposts,
  eq, and, or, isNull, desc, lt, inArray, sql,
} from "@mention/db";
import { db } from "../lib/db.js";
import { redis } from "../lib/redis.js";

import { xVerification } from "../lib/x-verification.js";
import { marketActivity } from "../lib/market-activity.js";

export const feedRoute = new Hono();

const PAGE = 30;

export function nativeToView(p: any, author: any, comm: any): PostView {
  return {
    id: `n:${p.id}`, source: "native",
    content: p.content, mediaUrl: p.mediaUrl,
    quotePostId:p.quotePostId, sticker:p.stickerData?JSON.parse(p.stickerData):null,
    author: { id: author.id, username: author.username, name: author.displayName, pfpUrl: author.pfpUrl },
    communityId: p.communityId ?? "", communitySlug: comm?.slug, communityName: comm?.name, communityTicker: comm?.ticker,
    likes: p.likesCount, reposts: p.repostsCount, replies: p.repliesCount, views: p.viewsCount,
    pinned: p.pinned, globalPinned: p.globalPinned, official: p.authorId === OFFICIAL_ACCOUNT_ID,
    tweetUrl: p.xTweetId ? `https://x.com/${author.username}/status/${p.xTweetId}` : undefined,
    crosspostStatus: p.crosspostStatus,
    createdAt: (p.createdAt.toISOString?.() ?? p.createdAt) as string,
  };
}

export function xToView(x: any, communityId: string, comm: any): PostView {
  return {
    id: `x:${x.id}`, source: "x",
    content: x.content, mediaUrl: x.imageUrl,
    author: { username: x.authorUsername, name: x.authorName || x.authorUsername, pfpUrl: x.authorPfpUrl },
    communityId: communityId ?? "", communitySlug: comm?.slug, communityName: comm?.name, communityTicker: comm?.ticker,
    likes: x.likesCount + x.nativeLikesCount,
    reposts: x.repostsCount + x.nativeRepostsCount,
    replies: x.repliesCount + (x.nativeRepliesCount ?? 0), views: x.viewsCount,
    pinned: false, globalPinned: x.globalPinned, official: x.official, tweetUrl: x.tweetUrl,
    createdAt: (x.tweetCreatedAt.toISOString?.() ?? x.tweetCreatedAt) as string,
  };
}

function chronology(p:FeedItem){return p.source!=="market"&&p.repostedAt?p.repostedAt:p.createdAt;}
async function repostViews(opts:{authorUsername?:string;communityId?:string;communityIds?:string[];before?:Date;pinsOnly?:boolean}):Promise<PostView[]>{
 if(opts.pinsOnly)return [];
 const before=opts.before??new Date(Date.now()+60000);
 const read=async(table:typeof postReposts|typeof xPostReposts,source:"n"|"x")=>{
  const native=source==="n";
  const base=native?posts:xPosts;
  const where=[lt(table.createdAt,before),eq(base.hidden,false),or(eq(communities.status,"approved"),native?and(isNull(posts.communityId),or(eq(posts.authorId,OFFICIAL_ACCOUNT_ID),sql`${posts.quotePostId} IS NOT NULL`)):eq(xPosts.official,true))!];
  if(opts.authorUsername)where.push(eq(users.username,opts.authorUsername));
  const cid=native?posts.communityId:xPostCommunities.communityId;
  if(opts.communityId)where.push(eq(cid,opts.communityId));
  if(opts.communityIds)where.push(or(inArray(cid,opts.communityIds),native?eq(posts.authorId,OFFICIAL_ACCOUNT_ID):eq(xPosts.official,true))!);
  let query=db.select({r:table,u:users}).from(table).innerJoin(users,eq(table.userId,users.id)).innerJoin(base,eq(native?postReposts.postId:xPostReposts.xPostId,base.id)).$dynamic();
  if(!native)query=query.leftJoin(xPostCommunities,eq(xPostCommunities.xPostId,xPosts.id));
  const rows=await query.leftJoin(communities,eq(cid,communities.id)).where(and(...where)).orderBy(desc(table.createdAt)).limit(PAGE);
  return rows.map(({r,u})=>({id:`${source}:${"postId" in r?r.postId:r.xPostId}`,at:r.createdAt.toISOString(),u}));
 };
 const rows=(await Promise.all([read(postReposts,"n"),read(xPostReposts,"x")])).flat();
 const originals=await visiblePosts(rows.map(r=>r.id));
 return rows.flatMap(r=>{const p=originals.find(p=>p.id===r.id);return p?[{...p,repostedAt:r.at,repostedBy:{id:r.u.id,username:r.u.username,name:r.u.displayName,pfpUrl:r.u.pfpUrl}}]:[];});
}

async function fetchMerged(opts: {
  communityId?: string;
  authorUsername?: string;
  /** limit to these communities (the viewer's joined tribes) */
  communityIds?: string[];
  before?: Date;
  includeMarkets?: boolean;
  pinsOnly?: boolean;
}): Promise<FeedItem[]> {
  const before = opts.before ?? new Date(Date.now() + 60_000);

  // native
  const nativeWhere = [eq(posts.hidden, false), lt(posts.createdAt, before), or(eq(communities.status, "approved"), and(isNull(posts.communityId), or(eq(posts.authorId, OFFICIAL_ACCOUNT_ID),sql`${posts.quotePostId} IS NOT NULL`)))!];
  if (opts.pinsOnly) nativeWhere.push(eq(opts.communityId ? posts.pinned : posts.globalPinned, true));
  if (opts.communityId) nativeWhere.push(eq(posts.communityId, opts.communityId));
  if (opts.communityIds) nativeWhere.push(or(inArray(posts.communityId, opts.communityIds), eq(posts.authorId, OFFICIAL_ACCOUNT_ID))!);
  let nativeQ = db.select({ p: posts, u: users, c: communities })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .leftJoin(communities, eq(posts.communityId, communities.id))
    .where(and(...nativeWhere, ...(opts.authorUsername ? [eq(users.username, opts.authorUsername)] : [])))
    .orderBy(desc(posts.createdAt)).limit(PAGE);

  // mirrored
  const xWhere = [eq(xPosts.hidden, false), lt(xPosts.tweetCreatedAt, before), or(eq(communities.status, "approved"), eq(xPosts.official, true))!];
  if (opts.pinsOnly) xWhere.push(opts.communityId ? sql`false` : eq(xPosts.globalPinned, true));
  if (opts.authorUsername) xWhere.push(eq(xPosts.authorUsername, opts.authorUsername));
  if (opts.communityId) xWhere.push(eq(xPostCommunities.communityId, opts.communityId));
  if (opts.communityIds) xWhere.push(or(inArray(xPostCommunities.communityId, opts.communityIds), eq(xPosts.official, true))!);
  const xQ = db.select({ x: xPosts, link: xPostCommunities, c: communities })
    .from(xPosts)
    .leftJoin(xPostCommunities, eq(xPostCommunities.xPostId, xPosts.id))
    .leftJoin(communities, eq(xPostCommunities.communityId, communities.id))
    .where(and(...xWhere))
    .orderBy(desc(xPosts.tweetCreatedAt)).limit(PAGE);

  const [nativeRows, xRows, reposts, activity] = await Promise.all([nativeQ, xQ, repostViews(opts), opts.includeMarkets ? marketActivity({ ...opts, before }) : Promise.resolve([])]);

  const views: FeedItem[] = [
    ...activity, ...reposts,
    ...nativeRows.map((r) => nativeToView(r.p, r.u, r.c)),
    ...xRows.map((r) => xToView(r.x, r.link?.communityId ?? "", r.c)),
  ];
  // de-dupe mirrored tweets linked to multiple tribes in the global feed
  views.sort((a,b)=>chronology(a)<chronology(b)?1:-1);
  const seen = new Set<string>();
  const deduped = views.filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));

  return deduped.slice(0, PAGE);
}

/** Decorate posts with likedByMe/repostedByMe for an authed viewer. */
export async function decorate<T extends FeedItem>(items: T[], userId: string | null, hydrateQuotes=true): Promise<T[]> {
  if (items.length === 0) return items;
  if(hydrateQuotes){
    const ids=[...new Set(items.flatMap(i=>i.source!=="market"&&i.quotePostId?[i.quotePostId]:[]))];
    const originals=await visiblePosts(ids);
    const decorated=await decorate(originals,null,false);
    items=items.map(i=>i.source!=="market"&&i.quotePostId?{...i,quotedPost:decorated.find(p=>p.id===i.quotePostId)??null}:i) as T[];
  }
  const handles=[...new Set(items.filter(i=>i.source!=="market").map(i=>(i as PostView).author.username.toLowerCase()))];
  const accounts=handles.length?await db.select().from(users).where(inArray(users.username,handles)):[];
  const badges=new Map<string,boolean>();
  await Promise.all(handles.map(async handle=>{
    const account=accounts.find(a=>a.username===handle);
    if(account)badges.set(handle,(await xVerification(account)).status==="verified");
    else badges.set(handle,(await redis.get(`x-author-verification:${handle}`).catch(()=>null))==="verified");
  }));
  items=items.map(i=>i.source==="market"?i:({...i,author:{...i.author,verified:badges.get(i.author.username.toLowerCase())===true}})) as T[];
  if (!userId) return items;
  const nIds = items.filter((i) => i.source === "native").map((i) => i.id.slice(2));
  const xIds = items.filter((i) => i.source === "x").map((i) => i.id.slice(2));
  const [nl, nr, xl, xr] = await Promise.all([
    nIds.length ? db.select().from(postLikes).where(and(eq(postLikes.userId, userId), inArray(postLikes.postId, nIds))) : [],
    nIds.length ? db.select().from(postReposts).where(and(eq(postReposts.userId, userId), inArray(postReposts.postId, nIds))) : [],
    xIds.length ? db.select().from(xPostLikes).where(and(eq(xPostLikes.userId, userId), inArray(xPostLikes.xPostId, xIds))) : [],
    xIds.length ? db.select().from(xPostReposts).where(and(eq(xPostReposts.userId, userId), inArray(xPostReposts.xPostId, xIds))) : [],
  ]);
  const liked = new Set([...nl.map((r) => `n:${r.postId}`), ...xl.map((r) => `x:${r.xPostId}`)]);
  const reposted = new Set([...nr.map((r) => `n:${r.postId}`), ...xr.map((r) => `x:${r.xPostId}`)]);
  return items.map((i) => i.source === "market" ? i : ({ ...i, likedByMe: liked.has(i.id), repostedByMe: reposted.has(i.id) }));
}

feedRoute.get("/", async (c) => {
  const communityId = c.req.query("communityId") || undefined;
  const includeMarkets = c.req.query("includeMarkets") === "true";
  const author = c.req.query("author")?.toLowerCase() || undefined;
  const cursor = c.req.query("cursor");
  const before = cursor ? new Date(cursor) : undefined;
  const viewerId = c.req.query("viewerId") || null; // optional, set by web after /me
  const scope = c.req.query("scope") || "all"; // all | joined (needs viewerId)

  // only cache the anonymous first page of global/community feeds
  const cacheable = !before && !author && !viewerId && scope === "all";
  const cacheKey = `feed:v3:${includeMarkets ? "markets" : "posts"}:${communityId ?? "global"}`;
  if (cacheable) {
    const hit = await redis.get(cacheKey).catch(() => null);
    if (hit) return c.json(JSON.parse(hit));
  }

  // "joined": only the viewer's tribes
  let communityIds: string[] | undefined;
  if (scope === "joined" && viewerId) {
    const memberships = await db.select({ id: communityMembers.communityId })
      .from(communityMembers).where(eq(communityMembers.userId, viewerId));
    communityIds = memberships.map((m) => m.id);
    // Official posts remain visible before someone joins a community.
  }

  let items = await fetchMerged({ communityId, authorUsername: author, communityIds, before, includeMarkets });
  const nextCursor = items.length === PAGE ? chronology(items[items.length - 1]) : null;
  // Pins do not alter the chronological pagination cursor.
  if (!before && !author) {
    const pinned = await fetchMerged({ communityId, pinsOnly: true });
    const ids = new Set(pinned.map(p => p.id));
    items = [...pinned, ...items.filter(p => !ids.has(p.id))];
  }
  items = await decorate(items, viewerId);
  const out = { items, nextCursor };
  if (cacheable) await redis.set(cacheKey, JSON.stringify(out), "EX", 5).catch(() => {});
  return c.json(out);
});

async function visiblePosts(ids:string[]):Promise<PostView[]> {
 const nativeIds=[...new Set(ids.filter(id=>id.startsWith("n:")).map(id=>id.slice(2)))];
 const xIds=[...new Set(ids.filter(id=>id.startsWith("x:")).map(id=>id.slice(2)))];
 const [nativeRows,xRows]=await Promise.all([
 nativeIds.length?db.select({p:posts,u:users,c:communities}).from(posts).innerJoin(users,eq(posts.authorId,users.id)).leftJoin(communities,eq(posts.communityId,communities.id)).where(and(inArray(posts.id,nativeIds),eq(posts.hidden,false),or(eq(communities.status,"approved"),and(isNull(posts.communityId),or(eq(posts.authorId,OFFICIAL_ACCOUNT_ID),sql`${posts.quotePostId} IS NOT NULL`))))):[],
 xIds.length?db.select({p:xPosts,c:communities}).from(xPosts).leftJoin(xPostCommunities,eq(xPostCommunities.xPostId,xPosts.id)).leftJoin(communities,eq(xPostCommunities.communityId,communities.id)).where(and(inArray(xPosts.id,xIds),eq(xPosts.hidden,false),or(eq(communities.status,"approved"),eq(xPosts.official,true)))):[]
 ]);
 return [...nativeRows.map(r=>nativeToView(r.p,r.u,r.c)),...xRows.map(r=>xToView(r.p,r.c?.id??"",r.c))];
}
export async function visiblePost(source:"native"|"x",id:string):Promise<PostView>{
 const [post]=await visiblePosts([`${source==="native"?"n":"x"}:${id}`]);
 if(!post)throw new HTTPException(404,{message:"Post not found"});
 return post;
}
