import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { updateProfileSchema } from "@mention/shared";
import {
  users, follows, communities, communityMembers, xConnections, posts,
  eq, and, count, desc,
} from "@mention/db";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { env } from "../env.js";
import { redis } from "../lib/redis.js";
import { db } from "../lib/db.js";
import { requireAuth, requireNotBanned, rateLimit } from "../auth/middleware.js";

export const usersRoute = new Hono();

// current user (also used by web to get viewerId for feed decoration)
usersRoute.get("/me", requireAuth, async (c) => {
  const u = c.get("user");
  const [conn] = await db.select({ writeEnabled: xConnections.writeEnabled })
    .from(xConnections).where(eq(xConnections.userId, u.id));
  return c.json({ ...u, xWriteConnected: Boolean(conn), xWriteEnabled: conn?.writeEnabled ?? false });
});

usersRoute.patch("/me", requireAuth, zValidator("json", updateProfileSchema), async (c) => {
  requireNotBanned(c);
  const u = c.get("user");
  const body = c.req.valid("json");
  const [row] = await db.update(users).set({ ...body, updatedAt: new Date() })
    .where(eq(users.id, u.id)).returning();
  return c.json(row);
});

// Authenticated read-only mainnet balance and recent on-chain activity.
// This endpoint cannot sign or transfer funds. Wallet addresses are public.
usersRoute.get("/me/wallet", requireAuth, rateLimit("wallet-read", 30, 60), async (c) => {
  const address = c.req.query("address") ?? "";
  let key: PublicKey;
  try { key = new PublicKey(address); } catch { throw new HTTPException(400, { message: "Invalid Solana address" }); }
  const cacheKey = `wallet:mainnet:${key.toBase58()}`;
  c.header("Cache-Control", "private, no-store");
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return c.json(JSON.parse(cached));
  const connection = new Connection(env.SOLANA_RPC_URL, {
    commitment: "confirmed", disableRetryOnRateLimit: true,
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  });
  try {
    const [lamports, history] = await Promise.all([
      connection.getBalance(key),
      connection.getSignaturesForAddress(key, { limit: 10 }).catch(() => null),
    ]);
    const data = {
      address: key.toBase58(), balanceSol: lamports / LAMPORTS_PER_SOL,
      network: "mainnet-beta", updatedAt: new Date().toISOString(),
      historyAvailable: history !== null,
      transactions: (history ?? []).map((tx) => ({ signature: tx.signature, blockTime: tx.blockTime, failed: Boolean(tx.err) })),
    };
    await redis.set(cacheKey, JSON.stringify(data), "EX", 15).catch(() => {});
    return c.json(data);
  } catch { throw new HTTPException(503, { message: "Solana balance is temporarily unavailable. Please retry." }); }
});

// public profile
usersRoute.get("/:username", async (c) => {
  const username = c.req.param("username")!.toLowerCase();
  const [row] = await db.select().from(users).where(eq(users.username, username));
  if (!row) throw new HTTPException(404, { message: "not found" });
  const [[followers], [following], [memberships], owned, joined, [postCount]] = await Promise.all([
    db.select({ n: count() }).from(follows).where(eq(follows.followeeId, row.id)),
    db.select({ n: count() }).from(follows).where(eq(follows.followerId, row.id)),
    db.select({ n: count() }).from(communityMembers).where(eq(communityMembers.userId, row.id)),
    db.select().from(communities).where(eq(communities.ownerId, row.id)),
    db.select({ id: communities.id, name: communities.name, ticker: communities.ticker,
      pfpUrl: communities.pfpUrl, membersCount: communities.membersCount, ownerId: communities.ownerId })
      .from(communityMembers).innerJoin(communities, eq(communityMembers.communityId, communities.id))
      .where(eq(communityMembers.userId, row.id)).orderBy(desc(communityMembers.createdAt)).limit(100),
    db.select({ n: count() }).from(posts).where(and(eq(posts.authorId, row.id), eq(posts.hidden, false))),
  ]);
  return c.json({
    id: row.id, username: row.username, displayName: row.displayName,
    pfpUrl: row.pfpUrl, bannerUrl: row.bannerUrl, bio: row.bio,
    createdAt: row.createdAt,
    followers: followers?.n ?? 0, following: following?.n ?? 0, tribes: memberships?.n ?? 0,
    postCount: postCount?.n ?? 0,
    joinedCommunities: joined.map(({ ownerId, ...community }) => ({ ...community, isOwner: ownerId === row.id })),
    ownedTribes: owned.map((o) => ({ id: o.id, name: o.name, ticker: o.ticker, pfpUrl: o.pfpUrl })),
  });
});

usersRoute.post("/:username/follow", requireAuth, rateLimit("follow", 30, 60), async (c) => {
  requireNotBanned(c);
  const u = c.get("user");
  const [target] = await db.select().from(users)
    .where(eq(users.username, c.req.param("username")!.toLowerCase()));
  if (!target) throw new HTTPException(404, { message: "not found" });
  if (target.id === u.id) throw new HTTPException(400, { message: "cannot follow yourself" });
  await db.insert(follows).values({ followerId: u.id, followeeId: target.id }).onConflictDoNothing();
  return c.json({ ok: true });
});

usersRoute.post("/:username/unfollow", requireAuth, async (c) => {
  const u = c.get("user");
  const [target] = await db.select().from(users)
    .where(eq(users.username, c.req.param("username")!.toLowerCase()));
  if (!target) throw new HTTPException(404, { message: "not found" });
  await db.delete(follows).where(and(eq(follows.followerId, u.id), eq(follows.followeeId, target.id)));
  return c.json({ ok: true });
});
