import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { updateProfileSchema } from "@mention/shared";
import {
  users, follows, communities, communityMembers, xConnections,
  eq, and, count,
} from "@mention/db";
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

// public profile
usersRoute.get("/:username", async (c) => {
  const username = c.req.param("username")!.toLowerCase();
  const [row] = await db.select().from(users).where(eq(users.username, username));
  if (!row) throw new HTTPException(404, { message: "not found" });
  const [[followers], [following], [memberships], owned] = await Promise.all([
    db.select({ n: count() }).from(follows).where(eq(follows.followeeId, row.id)),
    db.select({ n: count() }).from(follows).where(eq(follows.followerId, row.id)),
    db.select({ n: count() }).from(communityMembers).where(eq(communityMembers.userId, row.id)),
    db.select().from(communities).where(eq(communities.ownerId, row.id)),
  ]);
  return c.json({
    id: row.id, username: row.username, displayName: row.displayName,
    pfpUrl: row.pfpUrl, bannerUrl: row.bannerUrl, bio: row.bio,
    createdAt: row.createdAt,
    followers: followers?.n ?? 0, following: following?.n ?? 0, tribes: memberships?.n ?? 0,
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
