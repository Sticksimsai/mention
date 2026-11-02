// Admin/moderation endpoints — enforcement mirrors v1 docs/ROLES.md.
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { redis } from "../lib/redis.js";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  users, staffRoles, bannedUsers, siteAnnouncements, communities,
  modAuditLog, socialdataUsage, eq, desc,
} from "@mention/db";
import { db } from "../lib/db.js";
import { requireAuth, requireStaff } from "../auth/middleware.js";

export const adminRoute = new Hono();
adminRoute.use("*", requireAuth);

async function audit(actorId: string, action: string, targetType: string, targetId: string, meta: object = {}) {
  await db.insert(modAuditLog).values({ actorId, action, targetType, targetId, meta: JSON.stringify(meta) });
}

// ── bans (admin or moderator) ──
adminRoute.post("/bans", zValidator("json",z.object({username:z.string().regex(/^[A-Za-z0-9_]{1,15}$/),reason:z.string().max(1000).optional()})), async (c) => {
  requireStaff(c);
  const u = c.get("user");
  const { username, reason } = c.req.valid("json");
  const [target] = await db.select().from(users).where(eq(users.username, username.toLowerCase()));
  if (!target) throw new HTTPException(404, { message: "user not found" });
  const [targetStaff] = await db.select().from(staffRoles).where(eq(staffRoles.userId, target.id));
  if (targetStaff) throw new HTTPException(403, { message: "cannot ban staff" });
  await db.insert(bannedUsers).values({ userId: target.id, reason: reason ?? "", bannedBy: u.id }).onConflictDoNothing();
  await redis.del(`authed:${target.privyUserId}`);
  await audit(u.id, "ban", "user", target.id, { reason });
  return c.json({ ok: true });
});

adminRoute.delete("/bans/:username", async (c) => {
  requireStaff(c);
  const u = c.get("user");
  const [target] = await db.select().from(users).where(eq(users.username, c.req.param("username")!.toLowerCase()));
  if (!target) throw new HTTPException(404, { message: "user not found" });
  await db.delete(bannedUsers).where(eq(bannedUsers.userId, target.id));
  await redis.del(`authed:${target.privyUserId}`);
  await audit(u.id, "unban", "user", target.id);
  return c.json({ ok: true });
});

// ── staff management (admin only; admins can't remove admins — v1 rule) ──
adminRoute.get("/staff", async (c) => {
  requireStaff(c, ["admin"]);
  const rows = await db.select({ s: staffRoles, u: users })
    .from(staffRoles).innerJoin(users, eq(staffRoles.userId, users.id));
  return c.json(rows.map((r) => ({ username: r.u.username, role: r.s.role })));
});

adminRoute.post("/staff", zValidator("json", z.object({username:z.string().regex(/^[A-Za-z0-9_]{1,15}$/),role:z.enum(["admin","moderator"])})), async (c) => {
  requireStaff(c, ["admin"]);
  const u = c.get("user");
  const { username, role } = c.req.valid("json");
  const [target] = await db.select().from(users).where(eq(users.username, username.toLowerCase()));
  if (!target) throw new HTTPException(404, { message: "user not found" });
  const [existing] = await db.select().from(staffRoles).where(eq(staffRoles.userId, target.id));
  if(existing?.role === "admin" && role !== "admin") throw new HTTPException(403,{message:"Cannot demote admins"});
  await db.insert(staffRoles).values({ userId: target.id, role })
    .onConflictDoUpdate({ target: staffRoles.userId, set: { role } });
  await redis.del(`authed:${target.privyUserId}`);
  await audit(u.id, "staff.add", "user", target.id, { role });
  return c.json({ ok: true });
});

adminRoute.delete("/staff/:username", async (c) => {
  requireStaff(c, ["admin"]);
  const u = c.get("user");
  const [target] = await db.select().from(users).where(eq(users.username, c.req.param("username")!.toLowerCase()));
  if (!target) throw new HTTPException(404, { message: "user not found" });
  const [targetRole] = await db.select().from(staffRoles).where(eq(staffRoles.userId, target.id));
  if (targetRole?.role === "admin") throw new HTTPException(403, { message: "cannot remove admins" });
  await db.delete(staffRoles).where(eq(staffRoles.userId, target.id));
  await redis.del(`authed:${target.privyUserId}`);
  await audit(u.id, "staff.remove", "user", target.id);
  return c.json({ ok: true });
});

// ── community approval / pinning (admin) ──
adminRoute.post("/communities/:id/status", zValidator("json", z.object({status:z.enum(["approved","rejected","pending"])})), async (c) => {
  requireStaff(c, ["admin"]);
  const u = c.get("user");
  const { status } = c.req.valid("json");
  await db.update(communities).set({ status }).where(eq(communities.id, c.req.param("id")!));
  await redis.del("communities:list:new","communities:list:members","communities:list:trending","feed:v3:markets:global","feed:v3:posts:global");
  await audit(u.id, `community.${status}`, "community", c.req.param("id")!);
  return c.json({ ok: true });
});

adminRoute.post("/communities/:id/pin", async (c) => {
  requireStaff(c, ["admin"]);
  const [comm] = await db.select().from(communities).where(eq(communities.id, c.req.param("id")!));
  if (!comm) throw new HTTPException(404, { message: "not found" });
  await db.update(communities).set({ pinned: !comm.pinned }).where(eq(communities.id, comm.id));
  return c.json({ pinned: !comm.pinned });
});

// ── announcements (admin) ──
adminRoute.post("/announcements", zValidator("json",z.object({message:z.string().trim().min(1).max(1000)})), async (c) => {
  requireStaff(c, ["admin"]);
  const u = c.get("user");
  const { message } = c.req.valid("json");
  await db.update(siteAnnouncements).set({ active: false }).where(eq(siteAnnouncements.active, true));
  const [row] = await db.insert(siteAnnouncements).values({ message, createdBy: u.id }).returning();
  return c.json(row, 201);
});

adminRoute.delete("/announcements", async (c) => {
  requireStaff(c, ["admin"]);
  await db.update(siteAnnouncements).set({ active: false }).where(eq(siteAnnouncements.active, true));
  return c.json({ ok: true });
});

// ── spend telemetry (admin) — SocialData usage per job per day ──
adminRoute.get("/socialdata-usage", async (c) => {
  requireStaff(c, ["admin"]);
  const rows = await db.select().from(socialdataUsage)
    .orderBy(desc(socialdataUsage.day)).limit(200);
  return c.json(rows);
});

adminRoute.get("/audit-log", async (c) => {
  requireStaff(c, ["admin"]);
  const rows = await db.select().from(modAuditLog).orderBy(desc(modAuditLog.createdAt)).limit(200);
  return c.json(rows);
});
