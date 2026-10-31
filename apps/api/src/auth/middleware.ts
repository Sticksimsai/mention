// Auth + roles middleware. All permission rules from docs/ROLES.md (v1) are
// enforced here and in route handlers — the frontend is cosmetic only.
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { users, staffRoles, bannedUsers, eq } from "@tribes/db";
import { verifyPrivyToken } from "./privy.js";

export interface AuthedUser {
  id: string;
  username: string;
  displayName: string;
  pfpUrl: string;
  role: "admin" | "moderator" | null;
  banned: boolean;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthedUser;
  }
}

/** Verify bearer token, upsert the user row, attach user to context. */
export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HTTPException(401, { message: "missing bearer token" });

  let identity;
  try {
    identity = await verifyPrivyToken(token);
  } catch {
    throw new HTTPException(401, { message: "invalid token" });
  }

  // Fast path: cached user row keyed by privy id (30s).
  const cacheKey = `authed:${identity.privyUserId}`;
  const hit = await redis.get(cacheKey).catch(() => null);
  if (hit) {
    c.set("user", JSON.parse(hit) as AuthedUser);
    return next();
  }

  // Upsert — profile fields follow X on every auth touch (v1 behavior).
  const [row] = await db
    .insert(users)
    .values({
      privyUserId: identity.privyUserId,
      username: identity.xUsername,
      displayName: identity.displayName,
      pfpUrl: identity.pfpUrl,
      xUserId: identity.xUserId,
    })
    .onConflictDoUpdate({
      target: users.privyUserId,
      set: {
        username: identity.xUsername,
        displayName: identity.displayName,
        pfpUrl: identity.pfpUrl,
        xUserId: identity.xUserId,
        updatedAt: new Date(),
      },
    })
    .returning();

  const [staff] = await db.select().from(staffRoles).where(eq(staffRoles.userId, row.id));
  const [ban] = await db.select().from(bannedUsers).where(eq(bannedUsers.userId, row.id));

  const user: AuthedUser = {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    pfpUrl: row.pfpUrl,
    role: staff?.role ?? null,
    banned: Boolean(ban),
  };
  await redis.set(cacheKey, JSON.stringify(user), "EX", 30).catch(() => {});
  c.set("user", user);
  return next();
}

/** Banned users are read-only everywhere. Staff bypass. */
export function requireNotBanned(c: Context) {
  const u = c.get("user");
  if (u.banned && !u.role) throw new HTTPException(403, { message: "account is banned" });
}

export function requireStaff(c: Context, roles: Array<"admin" | "moderator"> = ["admin", "moderator"]) {
  const u = c.get("user");
  if (!u.role || !roles.includes(u.role)) {
    throw new HTTPException(403, { message: "staff only" });
  }
}

/** Simple Redis fixed-window rate limit per user+bucket. */
export function rateLimit(bucket: string, max: number, windowSecs: number) {
  return async (c: Context, next: Next) => {
    const u = c.get("user");
    const id = u?.id ?? c.req.header("x-forwarded-for") ?? "anon";
    const key = `rl:${bucket}:${id}:${Math.floor(Date.now() / (windowSecs * 1000))}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSecs);
    if (n > max) throw new HTTPException(429, { message: "rate limited" });
    return next();
  };
}
