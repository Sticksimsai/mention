import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { createCommunitySchema, updateCommunitySchema, type CommunityView } from "@mention/shared";
import {
  communities, communityMembers, users, transferRequests,
  eq, and, desc, sql,
} from "@mention/db";
import { db } from "../lib/db.js";
import { redis, queues } from "../lib/redis.js";
import { requireAuth, requireNotBanned, requireStaff, rateLimit } from "../auth/middleware.js";

export const communitiesRoute = new Hono();

function toView(c: any, owner: any, isMember?: boolean): CommunityView {
  return {
    id: c.id, name: c.name, ticker: c.ticker, ca: c.ca,
    bannerUrl: c.bannerUrl, pfpUrl: c.pfpUrl, details: c.details,
    owner: { id: owner?.id, username: owner?.username ?? "", name: owner?.displayName ?? "", pfpUrl: owner?.pfpUrl ?? "" },
    website: c.website, telegram: c.telegram, xCommunityUrl: c.xCommunityUrl,
    membersCount: c.membersCount, pinned: c.pinned,
    launchedViaTribes: c.launchedViaTribes,
    isMember, createdAt: c.createdAt.toISOString?.() ?? c.createdAt,
  };
}

// ── list (public, cached 10s) ──
communitiesRoute.get("/", async (c) => {
  const sort = c.req.query("sort") ?? "new"; // new | members | trending
  const cacheKey = `communities:list:${sort}`;
  const hit = await redis.get(cacheKey).catch(() => null);
  if (hit) return c.json(JSON.parse(hit));

  let rows;
  if (sort === "trending") {
    const trending = await redis.get("trending:communities").catch(() => null);
    const ids: string[] = trending ? JSON.parse(trending) : [];
    rows = ids.length
      ? await db.select({ c: communities, o: users })
          .from(communities).innerJoin(users, eq(communities.ownerId, users.id))
          .where(and(eq(communities.status, "approved"), sql`${communities.id} = ANY(${ids})`))
      : [];
    rows.sort((a, b) => ids.indexOf(a.c.id) - ids.indexOf(b.c.id));
  } else {
    rows = await db.select({ c: communities, o: users })
      .from(communities).innerJoin(users, eq(communities.ownerId, users.id))
      .where(eq(communities.status, "approved"))
      .orderBy(sort === "members" ? desc(communities.membersCount) : desc(communities.createdAt))
      .limit(100);
  }
  const out = rows.map((r) => toView(r.c, r.o));
  await redis.set(cacheKey, JSON.stringify(out), "EX", 10).catch(() => {});
  return c.json(out);
});

// ── get one (public) ──
communitiesRoute.get("/:id", async (c) => {
  const id = c.req.param("id")!;
  const [row] = await db.select({ c: communities, o: users })
    .from(communities).innerJoin(users, eq(communities.ownerId, users.id))
    .where(eq(communities.id, id));
  if (!row) throw new HTTPException(404, { message: "not found" });
  return c.json(toView(row.c, row.o));
});

// ── create (auth; ticker + CA mandatory, mirrors v1 rules) ──
communitiesRoute.post("/", requireAuth, rateLimit("community-create", 3, 3600),
  zValidator("json", createCommunitySchema), async (c) => {
    requireNotBanned(c);
    requireStaff(c); // tribes are created by launching a token (/v1/launch);
                     // manual creation is a staff-only escape hatch
    const u = c.get("user");
    const body = c.req.valid("json");

    const [created] = await db.transaction(async (tx) => {
      const [comm] = await tx.insert(communities).values({
        name: body.name,
        ticker: body.ticker.toUpperCase(),
        ca: body.ca,
        details: body.details,
        website: body.website ?? null,
        telegram: body.telegram ?? null,
        xCommunityUrl: body.xCommunityUrl ?? null,
        bannerUrl: body.bannerUrl ?? "",
        pfpUrl: body.pfpUrl ?? "",
        ownerId: u.id,
      }).returning();
      await tx.insert(communityMembers).values({ communityId: comm.id, userId: u.id });
      return [comm];
    }).catch((e: any) => {
      if (String(e?.message).includes("unique")) {
        throw new HTTPException(409, { message: "name or CA already taken" });
      }
      throw e;
    });

    // warm token stats + start mirroring the owner immediately
    await queues.tokenStats.add("refresh", { ca: created.ca }, { jobId: `ts:${created.ca}` }).catch(() => {});
    await queues.tweetSync.add("sync", { username: u.username }, { jobId: `tw:${u.username}:init` }).catch(() => {});
    return c.json(toView(created, { id: u.id, username: u.username, displayName: u.displayName, pfpUrl: u.pfpUrl }, true), 201);
  });

// ── update (owner or admin) ──
communitiesRoute.patch("/:id", requireAuth, zValidator("json", updateCommunitySchema), async (c) => {
  requireNotBanned(c);
  const u = c.get("user");
  const id = c.req.param("id")!;
  const [comm] = await db.select().from(communities).where(eq(communities.id, id));
  if (!comm) throw new HTTPException(404, { message: "not found" });
  if (comm.ownerId !== u.id && u.role !== "admin") {
    throw new HTTPException(403, { message: "owner or admin only" });
  }
  const body = c.req.valid("json");
  const clean = Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v ?? null]),
  ) as Record<string, string | null>;
  const set: Record<string, string> = {};
  for (const [k, v] of Object.entries(clean)) {
    if (["pfpUrl", "bannerUrl", "details", "name"].includes(k)) { if (v !== null) set[k] = v; }
  }
  const nullable = { website: clean.website, telegram: clean.telegram, xCommunityUrl: clean.xCommunityUrl };
  const [updated] = await db.update(communities).set({
    ...set,
    ...("website" in clean ? { website: nullable.website } : {}),
    ...("telegram" in clean ? { telegram: nullable.telegram } : {}),
    ...("xCommunityUrl" in clean ? { xCommunityUrl: nullable.xCommunityUrl } : {}),
  }).where(eq(communities.id, id)).returning();
  await redis.del("communities:list:new", "communities:list:members", "communities:list:trending").catch(() => {});
  return c.json(updated);
});

// ── delete (admin only — owners must transfer, per v1 rules) ──
communitiesRoute.delete("/:id", requireAuth, async (c) => {
  requireStaff(c, ["admin"]);
  await db.delete(communities).where(eq(communities.id, c.req.param("id")!));
  return c.json({ ok: true });
});

// ── join / leave ──
communitiesRoute.post("/:id/join", requireAuth, rateLimit("join", 30, 60), async (c) => {
  requireNotBanned(c);
  const u = c.get("user");
  const id = c.req.param("id")!;
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(communityMembers)
      .values({ communityId: id, userId: u.id })
      .onConflictDoNothing().returning();
    if (inserted.length) {
      await tx.update(communities)
        .set({ membersCount: sql`${communities.membersCount} + 1` })
        .where(eq(communities.id, id));
    }
  });
  // joining = this user's tweets get mirrored too
  await queues.tweetSync.add("sync", { username: u.username }, { jobId: `tw:${u.username}:join` }).catch(() => {});
  return c.json({ ok: true });
});

communitiesRoute.post("/:id/leave", requireAuth, async (c) => {
  const u = c.get("user");
  const id = c.req.param("id")!;
  await db.transaction(async (tx) => {
    const deleted = await tx.delete(communityMembers)
      .where(and(eq(communityMembers.communityId, id), eq(communityMembers.userId, u.id)))
      .returning();
    if (deleted.length) {
      await tx.update(communities)
        .set({ membersCount: sql`GREATEST(${communities.membersCount} - 1, 0)` })
        .where(eq(communities.id, id));
    }
  });
  return c.json({ ok: true });
});

// ── membership check ──
communitiesRoute.get("/:id/membership", requireAuth, async (c) => {
  const u = c.get("user");
  const [m] = await db.select().from(communityMembers)
    .where(and(eq(communityMembers.communityId, c.req.param("id")!), eq(communityMembers.userId, u.id)));
  return c.json({ isMember: Boolean(m) });
});

// ── ownership transfer (v1: owners can't delete, only transfer) ──
communitiesRoute.post("/:id/transfer", requireAuth, async (c) => {
  requireNotBanned(c);
  const u = c.get("user");
  const id = c.req.param("id")!;
  const { toUsername } = await c.req.json<{ toUsername: string }>();
  const [comm] = await db.select().from(communities).where(eq(communities.id, id));
  if (!comm) throw new HTTPException(404, { message: "not found" });
  if (comm.ownerId !== u.id) throw new HTTPException(403, { message: "owner only" });
  const [target] = await db.select().from(users).where(eq(users.username, toUsername.toLowerCase()));
  if (!target) throw new HTTPException(404, { message: "target user not found" });
  const [req_] = await db.insert(transferRequests)
    .values({ communityId: id, fromUserId: u.id, toUserId: target.id }).returning();
  return c.json(req_, 201);
});

communitiesRoute.post("/transfers/:transferId/accept", requireAuth, async (c) => {
  const u = c.get("user");
  const tid = c.req.param("transferId")!;
  const [t] = await db.select().from(transferRequests).where(eq(transferRequests.id, tid));
  if (!t || t.status !== "pending") throw new HTTPException(404, { message: "no pending transfer" });
  if (t.toUserId !== u.id) throw new HTTPException(403, { message: "not the transfer target" });
  await db.transaction(async (tx) => {
    await tx.update(communities).set({ ownerId: u.id }).where(eq(communities.id, t.communityId));
    await tx.update(transferRequests).set({ status: "accepted" }).where(eq(transferRequests.id, tid));
    await tx.insert(communityMembers)
      .values({ communityId: t.communityId, userId: u.id }).onConflictDoNothing();
  });
  return c.json({ ok: true });
});
