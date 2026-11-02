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

import { marketActivity } from "../lib/market-activity.js";

export const feedRoute = new Hono();

const PAGE = 30;

export function nativeToView(p: any, author: any, comm: any): PostView {
  return {
    id: `n:${p.id}`, source: "native",
    content: p.content, mediaUrl: p.mediaUrl,
    author: { id: author.id, username: author.username, name: author.displayName, pfpUrl: author.pfpUrl },
    communityId: p.communityId ?? "", communityName: comm?.name, communityTicker: comm?.ticker,
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
    communityId: communityId ?? "", communityName: comm?.name, communityTicker: comm?.ticker,
    likes: x.likesCount + x.nativeLikesCount,
    reposts: x.repostsCount + x.nativeRepostsCount,
    replies: x.repliesCount, views: x.viewsCount,
    pinned: false, globalPinned: x.globalPinned, official: x.official, tweetUrl: x.tweetUrl,
    createdAt: (x.tweetCreatedAt.toISOString?.() ?? x.tweetCreatedAt) as string,
  };
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
  const nativeWhere = [eq(posts.hidden, false), lt(posts.createdAt, before), or(eq(communities.status, "approved"), and(isNull(posts.communityId), eq(posts.authorId, OFFICIAL_ACCOUNT_ID)))!];
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

  const [nativeRows, xRows, activity] = await Promise.all([nativeQ, xQ, opts.includeMarkets ? marketActivity({ ...opts, before }) : Promise.resolve([])]);

  const views: FeedItem[] = [
    ...activity,
    ...nativeRows.map((r) => nativeToView(r.p, r.u, r.c)),
    ...xRows.map((r) => xToView(r.x, r.link?.communityId ?? "", r.c)),
  ];
  // de-dupe mirrored tweets linked to multiple tribes in the global feed
  const seen = new Set<string>();
  const deduped = views.filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
  deduped.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return deduped.slice(0, PAGE);
}

/** Decorate posts with likedByMe/repostedByMe for an authed viewer. */
export async function decorate<T extends FeedItem>(items: T[], userId: string | null): Promise<T[]> {
  if (!userId || items.length === 0) return items;
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
  const nextCursor = items.length === PAGE ? items[items.length - 1].createdAt : null;
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
