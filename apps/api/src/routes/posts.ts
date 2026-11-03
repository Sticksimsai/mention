import {xMediaSource} from '@mention/shared/x-media';
import {formatXPost} from '@mention/shared/x-post';
import { env } from "../env.js";
import { launchImages } from "@mention/db";
import { stickerPack } from "../lib/stickers.js";
// Post mutations for both native ("n:<uuid>") and mirrored ("x:<uuid>") posts.
// Counts update inside the same transaction as the like/repost row — v1 raced.
import { z } from "zod";
import { visiblePost, decorate } from "./feed.js";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { createPostSchema, createReplySchema, OFFICIAL_ACCOUNT_ID } from "@mention/shared";
import {
  posts, postLikes, postReposts, postReplies,
  xPosts, xPostLikes, xPostReposts, xPostReplies, xPostCommunities,
  communities, communityMembers, xConnections, users,
  eq, and, or, isNull, sql, desc,
} from "@mention/db";
import { db } from "../lib/db.js";
import { redis, queues } from "../lib/redis.js";
import { requireAuth, requireNotBanned, rateLimit } from "../auth/middleware.js";

export const postsRoute = new Hono();


function parseId(raw: string): { source: "native" | "x"; id: string } {
  if (!/^[nx]:/.test(raw) || !z.string().uuid().safeParse(raw.slice(2)).success) throw new HTTPException(400, { message: "Invalid post ID" });
  if (raw.startsWith("n:")) return { source: "native", id: raw.slice(2) };
  if (raw.startsWith("x:")) return { source: "x", id: raw.slice(2) };
  throw new HTTPException(400, { message: "bad post id" });
}

async function invalidateFeeds(communityId?: string | null) {
  const keys = ["feed:global", "feed:v3:markets:global", "feed:v3:posts:global"];
  if (communityId) keys.push(`feed:${communityId}`, `feed:v3:markets:${communityId}`, `feed:v3:posts:${communityId}`);
  await redis.del(...keys).catch(() => {});
}

postsRoute.get("/:id",async c=>{
 const {source,id}=parseId(c.req.param("id"));
 const viewer=c.req.query("viewerId");if(viewer&&!z.string().uuid().safeParse(viewer).success)throw new HTTPException(400,{message:"Invalid viewer ID"});
 return c.json((await decorate([await visiblePost(source,id)],viewer??null))[0]);
});
postsRoute.get("/:id/replies", async (c) => {
  const { source, id } = parseId(c.req.param("id")!);
  await visiblePost(source, id);
  const table = source === "native" ? postReplies : xPostReplies;
  const fk = source === "native" ? postReplies.postId : xPostReplies.xPostId;
  const rows = await db.select({ r: table, u: users })
    .from(table).innerJoin(users, eq((table as any).authorId, users.id))
    .where(and(eq(fk as any, id), eq((table as any).hidden, false)))
    .orderBy((table as any).createdAt).limit(200);
  return c.json(rows.map(({ r, u: au }: any) => ({
    id: r.id, content: r.content, mediaUrl:r.mediaUrl??null, sticker:r.stickerData?JSON.parse(r.stickerData):null,
    author: { id: au.id, username: au.username, name: au.displayName, pfpUrl: au.pfpUrl },
    createdAt: r.createdAt,
  })));
});

postsRoute.use("*", requireAuth);

// ── create post ──
postsRoute.post("/", rateLimit("post", 10, 60), zValidator("json", createPostSchema), async (c) => {
  requireNotBanned(c);
  const u = c.get("user");
  const body = c.req.valid("json");

  const [comm] = body.communityId ? await db.select().from(communities).where(eq(communities.id, body.communityId)) : [];
  if (body.communityId && (!comm || comm.status !== "approved")) throw new HTTPException(404, { message: "community not found" });
  if (body.quotePostId) { const q=parseId(body.quotePostId); await visiblePost(q.source,q.id); }
  if (!comm && !body.quotePostId && (u.id !== OFFICIAL_ACCOUNT_ID || u.role !== "admin")) throw new HTTPException(403, { message: "Only the official account can publish sitewide posts" });

  // must be a member (staff bypass, per v1 roles)
  if (!u.role && comm && comm.ownerId !== u.id) {
    const [m] = await db.select().from(communityMembers)
      .where(and(eq(communityMembers.communityId, comm.id), eq(communityMembers.userId, u.id)));
    if (!m) throw new HTTPException(403, { message: "join the community to post" });

    // per-tribe cooldown
    if (comm.postCooldownSecs > 0) {
      const [last] = await db.select({ createdAt: posts.createdAt }).from(posts)
        .where(and(eq(posts.communityId, comm.id), eq(posts.authorId, u.id)))
        .orderBy(desc(posts.createdAt)).limit(1);
      if (last && Date.now() - last.createdAt.getTime() < comm.postCooldownSecs * 1000) {
        throw new HTTPException(429, { message: "cooldown active in this community" });
      }
    }
  }

  const sticker=body.stickerId && comm ? (await stickerPack(comm)).find(s=>s.id===body.stickerId) : null;
  let stickerMediaUrl:string|undefined;
  if(body.stickerMediaId){
    const [asset]=await db.select().from(launchImages).where(and(eq(launchImages.id,body.stickerMediaId),eq(launchImages.userId,u.id)));
    if(!sticker||!asset||asset.mime!=="image/gif")throw new HTTPException(400,{message:"Choose a community GIF sticker"});
    const bytes=Buffer.from(asset.data,"base64");if(bytes.length<10||bytes.readUInt16LE(6)!==500||bytes.readUInt16LE(8)!==500)throw new HTTPException(400,{message:"Stickers must be 500 × 500 GIFs"});
    stickerMediaUrl=`${env.PUBLIC_ASSET_ORIGIN}/v1/media/${asset.id}`;
  }
  if(body.stickerId&&!sticker)throw new HTTPException(400,{message:"Choose a sticker from this community"});
  if(body.crosspostToX&&body.quotePostId)throw new HTTPException(400,{message:"Quote posts stay on Mentions for now"});
  const xMediaUrl=body.mediaUrl||stickerMediaUrl||sticker?.mediaUrl;
  if(body.crosspostToX&&(body.mediaUrl||sticker)){
    if(body.mediaUrl&&sticker)throw new HTTPException(400,{message:"Choose one image, GIF or sticker when posting to X."});
    if(!xMediaUrl)throw new HTTPException(400,{message:"Choose the sticker again to prepare its animation for X."});
    try {
      const source=xMediaSource(xMediaUrl,env.PUBLIC_ASSET_ORIGIN);
      if(source.kind==='upload'){
        const [asset]=await db.select().from(launchImages).where(and(eq(launchImages.id,source.id),eq(launchImages.userId,u.id)));
        if(!asset)throw new Error('Upload your own attachment before posting to X.');
      }
    } catch(error){throw new HTTPException(400,{message:(error as Error).message});}
  }

  // Determine crosspost eligibility: user opted in AND has an active write connection
  let crosspostStatus: "skipped" | "pending" = "skipped";
  if (body.crosspostToX) {
    try { formatXPost(body.content,Boolean(xMediaUrl)); } catch (error) { throw new HTTPException(400,{message:(error as Error).message}); }
    const [conn] = await db.select().from(xConnections)
      .where(and(eq(xConnections.userId, u.id), eq(xConnections.writeEnabled, true)));
    if (!conn) throw new HTTPException(400,{message:"Connect X and enable posting in Settings first."});
    if(xMediaUrl&&!conn.scopes.split(/\s+/).includes('media.write'))throw new HTTPException(400,{message:"Reconnect X in Settings to allow images, GIFs and stickers."});
    crosspostStatus = "pending";
  }

  const [post] = await db.insert(posts).values({
    communityId: comm?.id ?? null,
    authorId: u.id,
    content: body.content,
    mediaUrl: body.mediaUrl ?? null,
    quotePostId: body.quotePostId ?? null,
    stickerData: sticker ? JSON.stringify({...sticker,mediaUrl:stickerMediaUrl ?? sticker.mediaUrl}) : null,
    crosspostStatus,
  }).returning();

  if (crosspostStatus === "pending") {
    await queues.xWriteback.add("post", { postId: post.id }, {
      jobId: `xw-${post.id}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 10_000 },
    });
  }
  await invalidateFeeds(comm?.id);
  return c.json({ id: `n:${post.id}`, crosspostStatus }, 201);
});

// ── like / unlike ──
postsRoute.post("/:id/like", rateLimit("like", 60, 60), async (c) => {
  requireNotBanned(c);
  const u = c.get("user");
  const { source, id } = parseId(c.req.param("id")!);
  await db.transaction(async (tx) => {
    if (source === "native") {
      const ins = await tx.insert(postLikes).values({ postId: id, userId: u.id }).onConflictDoNothing().returning();
      if (ins.length) await tx.update(posts).set({ likesCount: sql`${posts.likesCount} + 1` }).where(eq(posts.id, id));
    } else {
      const ins = await tx.insert(xPostLikes).values({ xPostId: id, userId: u.id }).onConflictDoNothing().returning();
      if (ins.length) await tx.update(xPosts).set({ nativeLikesCount: sql`${xPosts.nativeLikesCount} + 1` }).where(eq(xPosts.id, id));
    }
  });
  await invalidateFeeds();
  return c.json({ ok: true });
});

postsRoute.post("/:id/unlike", async (c) => {
  const u = c.get("user");
  const { source, id } = parseId(c.req.param("id")!);
  await db.transaction(async (tx) => {
    if (source === "native") {
      const del = await tx.delete(postLikes).where(and(eq(postLikes.postId, id), eq(postLikes.userId, u.id))).returning();
      if (del.length) await tx.update(posts).set({ likesCount: sql`GREATEST(${posts.likesCount} - 1, 0)` }).where(eq(posts.id, id));
    } else {
      const del = await tx.delete(xPostLikes).where(and(eq(xPostLikes.xPostId, id), eq(xPostLikes.userId, u.id))).returning();
      if (del.length) await tx.update(xPosts).set({ nativeLikesCount: sql`GREATEST(${xPosts.nativeLikesCount} - 1, 0)` }).where(eq(xPosts.id, id));
    }
  });
  await invalidateFeeds();
  return c.json({ ok: true });
});

// ── repost / unrepost ──
postsRoute.post("/:id/repost", rateLimit("repost", 30, 60), async (c) => {
  requireNotBanned(c);
  const u = c.get("user");
  const { source, id } = parseId(c.req.param("id")!);
  await visiblePost(source,id);
  await db.transaction(async (tx) => {
    if (source === "native") {
      const ins = await tx.insert(postReposts).values({ postId: id, userId: u.id }).onConflictDoNothing().returning();
      if (ins.length) await tx.update(posts).set({ repostsCount: sql`${posts.repostsCount} + 1` }).where(eq(posts.id, id));
    } else {
      const ins = await tx.insert(xPostReposts).values({ xPostId: id, userId: u.id }).onConflictDoNothing().returning();
      if (ins.length) await tx.update(xPosts).set({ nativeRepostsCount: sql`${xPosts.nativeRepostsCount} + 1` }).where(eq(xPosts.id, id));
    }
  });
  await invalidateFeeds();
  return c.json({ ok: true });
});

postsRoute.post("/:id/unrepost", async (c) => {
  const u = c.get("user");
  const { source, id } = parseId(c.req.param("id")!);
  await db.transaction(async (tx) => {
    if (source === "native") {
      const del = await tx.delete(postReposts).where(and(eq(postReposts.postId, id), eq(postReposts.userId, u.id))).returning();
      if (del.length) await tx.update(posts).set({ repostsCount: sql`GREATEST(${posts.repostsCount} - 1, 0)` }).where(eq(posts.id, id));
    } else {
      const del = await tx.delete(xPostReposts).where(and(eq(xPostReposts.xPostId, id), eq(xPostReposts.userId, u.id))).returning();
      if (del.length) await tx.update(xPosts).set({ nativeRepostsCount: sql`GREATEST(${xPosts.nativeRepostsCount} - 1, 0)` }).where(eq(xPosts.id, id));
    }
  });
  await invalidateFeeds();
  return c.json({ ok: true });
});

// ── replies ──

postsRoute.post("/:id/replies", rateLimit("reply", 20, 60), zValidator("json", createReplySchema), async (c) => {
  requireNotBanned(c);
  const u = c.get("user");
  const { source, id } = parseId(c.req.param("id")!);
  const parent = await visiblePost(source,id);
  const body = c.req.valid("json");
  const {content,mediaUrl}=body;
  const [comm]=body.stickerId&&parent.communityId?await db.select().from(communities).where(eq(communities.id,parent.communityId)):[];
  const sticker=comm&&body.stickerId?(await stickerPack(comm)).find(s=>s.id===body.stickerId):null;
  if(body.stickerId&&!sticker)throw new HTTPException(400,{message:"Choose a sticker from this community"});
  let stickerMediaUrl:string|undefined;
  if(body.stickerMediaId){
    const [asset]=await db.select().from(launchImages).where(and(eq(launchImages.id,body.stickerMediaId),eq(launchImages.userId,u.id)));
    if(!sticker||!asset||asset.mime!=="image/gif")throw new HTTPException(400,{message:"Choose a community GIF sticker"});
    const bytes=Buffer.from(asset.data,"base64");
    if(bytes.length<10||bytes.readUInt16LE(6)!==500||bytes.readUInt16LE(8)!==500)throw new HTTPException(400,{message:"Stickers must be 500 × 500 GIFs"});
    stickerMediaUrl=`${env.PUBLIC_ASSET_ORIGIN}/v1/media/${asset.id}`;
  }
  const attachment={mediaUrl:mediaUrl??null,stickerData:sticker?JSON.stringify({...sticker,mediaUrl:stickerMediaUrl ?? sticker.mediaUrl}):null};
  if (source === "native") {
    await db.transaction(async (tx) => {
      await tx.insert(postReplies).values({ postId: id, authorId: u.id, content, ...attachment });
      await tx.update(posts).set({ repliesCount: sql`${posts.repliesCount} + 1` }).where(eq(posts.id, id));
    });
  } else {
    await db.transaction(async tx=>{
      await tx.insert(xPostReplies).values({ xPostId: id, authorId: u.id, content, ...attachment });
      await tx.update(xPosts).set({nativeRepliesCount:sql`${xPosts.nativeRepliesCount} + 1`}).where(eq(xPosts.id,id));
    });
  }
  await invalidateFeeds(parent.communityId);
  return c.json({ ok: true }, 201);
});

// ── delete (author, tribe owner, or staff) ──
postsRoute.delete("/:id", async (c) => {
  const u = c.get("user");
  const { source, id } = parseId(c.req.param("id")!);
  if (source === "native") {
    const [p] = await db.select({ p: posts, c: communities })
      .from(posts).leftJoin(communities, eq(posts.communityId, communities.id))
      .where(eq(posts.id, id));
    if (!p) throw new HTTPException(404, { message: "not found" });
    const allowed = p.p.authorId === u.id || p.c?.ownerId === u.id || u.role !== null;
    if (!allowed) throw new HTTPException(403, { message: "not allowed" });
    await db.delete(posts).where(eq(posts.id, id));
    await invalidateFeeds(p.p.communityId);
  } else {
    // mirrored tweets are hidden, never deleted (v1 behavior)
    if (!u.role) throw new HTTPException(403, { message: "staff only" });
    await db.update(xPosts).set({ hidden: true }).where(eq(xPosts.id, id));
    await invalidateFeeds();
  }
  await invalidateFeeds();
  return c.json({ ok: true });
});

// ── pin (tribe owner or admin) ──
postsRoute.post("/:id/pin", async (c) => {
  const u = c.get("user");
  const { source, id } = parseId(c.req.param("id")!);
  if (source !== "native") throw new HTTPException(400, { message: "only native posts can be pinned" });
  const [p] = await db.select({ p: posts, c: communities })
    .from(posts).leftJoin(communities, eq(posts.communityId, communities.id))
    .where(eq(posts.id, id));
  if (!p) throw new HTTPException(404, { message: "not found" });
  if (!p.p.communityId) throw new HTTPException(400, { message: "Use the sitewide pin control for official posts" });
  if (p.c?.ownerId !== u.id && u.role !== "admin") throw new HTTPException(403, { message: "owner or admin only" });
  await db.update(posts).set({ pinned: !p.p.pinned }).where(eq(posts.id, id));
  await invalidateFeeds(p.p.communityId);
  return c.json({ pinned: !p.p.pinned });
});
