// Post mutations for both native ("n:<uuid>") and mirrored ("x:<uuid>") posts.
// Counts update inside the same transaction as the like/repost row — v1 raced.
import { z } from "zod";
import { nativeToView, xToView, decorate } from "./feed.js";
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

async function visiblePost(source: "native" | "x", id: string) {
  if (source === "native") {
    const [r] = await db.select({p:posts,u:users,c:communities}).from(posts).innerJoin(users,eq(posts.authorId,users.id)).leftJoin(communities,eq(posts.communityId,communities.id)).where(and(eq(posts.id,id),eq(posts.hidden,false),or(eq(communities.status,"approved"),and(isNull(posts.communityId),eq(posts.authorId,OFFICIAL_ACCOUNT_ID)))));
    if(!r)throw new HTTPException(404,{message:"Post not found"});
    return nativeToView(r.p,r.u,r.c);
  }
  const [r]=await db.select({p:xPosts,c:communities}).from(xPosts).leftJoin(xPostCommunities,eq(xPostCommunities.xPostId,xPosts.id)).leftJoin(communities,eq(xPostCommunities.communityId,communities.id)).where(and(eq(xPosts.id,id),eq(xPosts.hidden,false),or(eq(communities.status,"approved"),eq(xPosts.official,true)))).limit(1);
  if(!r)throw new HTTPException(404,{message:"Post not found"});
  const view=xToView(r.p,r.c?.id ?? "",r.c);
  const [count]=await db.select({count:sql<number>`count(*)::int`}).from(xPostReplies).where(and(eq(xPostReplies.xPostId,id),eq(xPostReplies.hidden,false)));
  return {...view,replies:view.replies+(count?.count??0)};
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
    id: r.id, content: r.content,
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
  if (!comm && (u.id !== OFFICIAL_ACCOUNT_ID || u.role !== "admin")) throw new HTTPException(403, { message: "Only the official account can publish sitewide posts" });

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

  // Determine crosspost eligibility: user opted in AND has an active write connection
  let crosspostStatus: "skipped" | "pending" = "skipped";
  if (body.crosspostToX) {
    const [conn] = await db.select().from(xConnections)
      .where(and(eq(xConnections.userId, u.id), eq(xConnections.writeEnabled, true)));
    if (conn) crosspostStatus = "pending";
  }

  const [post] = await db.insert(posts).values({
    communityId: comm?.id ?? null,
    authorId: u.id,
    content: body.content,
    mediaUrl: body.mediaUrl ?? null,
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
  return c.json({ ok: true });
});

// ── repost / unrepost ──
postsRoute.post("/:id/repost", rateLimit("repost", 30, 60), async (c) => {
  requireNotBanned(c);
  const u = c.get("user");
  const { source, id } = parseId(c.req.param("id")!);
  await db.transaction(async (tx) => {
    if (source === "native") {
      const ins = await tx.insert(postReposts).values({ postId: id, userId: u.id }).onConflictDoNothing().returning();
      if (ins.length) await tx.update(posts).set({ repostsCount: sql`${posts.repostsCount} + 1` }).where(eq(posts.id, id));
    } else {
      const ins = await tx.insert(xPostReposts).values({ xPostId: id, userId: u.id }).onConflictDoNothing().returning();
      if (ins.length) await tx.update(xPosts).set({ nativeRepostsCount: sql`${xPosts.nativeRepostsCount} + 1` }).where(eq(xPosts.id, id));
    }
  });
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
  return c.json({ ok: true });
});

// ── replies ──

postsRoute.post("/:id/replies", rateLimit("reply", 20, 60), zValidator("json", createReplySchema), async (c) => {
  requireNotBanned(c);
  const u = c.get("user");
  const { source, id } = parseId(c.req.param("id")!);
  const parent = await visiblePost(source,id);
  const { content } = c.req.valid("json");
  if (source === "native") {
    await db.transaction(async (tx) => {
      await tx.insert(postReplies).values({ postId: id, authorId: u.id, content });
      await tx.update(posts).set({ repliesCount: sql`${posts.repliesCount} + 1` }).where(eq(posts.id, id));
    });
  } else {
    await db.insert(xPostReplies).values({ xPostId: id, authorId: u.id, content });
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
