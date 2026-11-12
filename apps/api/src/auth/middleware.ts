// Auth + roles middleware. All permission rules from docs/ROLES.md (v1) are
// enforced here and in route handlers — the frontend is cosmetic only.
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { users, staffRoles, bannedUsers, eq } from "@mention/db";
import { decodeProtectedHeader } from "jose";
import { verifyPrivyToken } from "./privy.js";
import { verifyWalletSession } from "./wallet.js";

export interface AuthedUser {
  id: string;
  username: string;
  displayName: string;
  pfpUrl: string;
  role: "admin" | "moderator" | null;
  banned: boolean;
  /** Set only for wallet sessions: the address that signed in. Absent for X (Privy) users. */
  wallet?: string;
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

/** Wallet-session accounts are stored as ordinary user rows under this prefix. */
export const WALLET_USER_PREFIX = "wallet:";
const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

async function walletUser(address: string): Promise<AuthedUser> {
  const cacheKey = `authed:wallet:${address}`;
  const hit = await redis.get(cacheKey).catch(() => null);
  if (hit) return JSON.parse(hit) as AuthedUser;

  const privyUserId = `${WALLET_USER_PREFIX}${address}`;
  let [row] = await db.select().from(users).where(eq(users.privyUserId, privyUserId));
  if (!row) {
    // Usernames are unique: prefer a short handle and fall back to the full address on a clash.
    const compact = `sol_${address.slice(0, 6)}${address.slice(-6)}`.toLowerCase();
    for (const username of [compact, `sol_${address.toLowerCase()}`]) {
      const inserted = await db.insert(users)
        .values({ privyUserId, username, displayName: shortAddress(address) })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) { row = inserted[0]; break; }
      [row] = await db.select().from(users).where(eq(users.privyUserId, privyUserId));
      if (row) break;
    }
    if (!row) throw new HTTPException(503, { message: "Could not start your wallet session. Try again." });
  }
  const [ban] = await db.select().from(bannedUsers).where(eq(bannedUsers.userId, row.id));
  const user: AuthedUser = {
    id: row.id, username: row.username, displayName: row.displayName, pfpUrl: row.pfpUrl,
    role: null, banned: Boolean(ban), wallet: address,
  };
  await redis.set(cacheKey, JSON.stringify(user), "EX", 30).catch(() => {});
  return user;
}

/**
 * Accepts either an X sign-in (Privy) or a wallet session. Use only on routes a
 * wallet-only visitor may reach — launching and the uploads/previews it needs.
 * Everything else stays on requireAuth, so posting and joining still need X.
 */
export async function requireAuthOrWallet(c: Context, next: Next) {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  let walletToken = false;
  try { walletToken = Boolean(token) && decodeProtectedHeader(token!).alg === "HS256"; } catch { /* not a JWT */ }
  if (!walletToken) return requireAuth(c, next);

  let address: string;
  try { address = await verifyWalletSession(token!); }
  catch { throw new HTTPException(401, { message: "Your wallet session expired. Reconnect your wallet." }); }
  c.set("user", await walletUser(address));
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

/**
 * Extra per-address limit for wallet sessions. A wallet account costs nothing to
 * create, so per-account limits alone would not bound uploads from one visitor.
 */
export function walletIpRateLimit(bucket: string, max: number, windowSecs: number) {
  return async (c: Context, next: Next) => {
    if (!c.get("user")?.wallet) return next();
    const ip = (c.req.header("x-forwarded-for") ?? "anon").split(",")[0].trim();
    const key = `rl:${bucket}:ip:${ip}:${Math.floor(Date.now() / (windowSecs * 1000))}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSecs);
    if (n > max) throw new HTTPException(429, { message: "Upload limit reached for now. Try again later, or sign in with X." });
    return next();
  };
}

/** Simple Redis fixed-window rate limit per user+bucket. */
export function rateLimit(bucket: string, max: number, windowSecs: number) {
  return async (c: Context, next: Next) => {
    const u = c.get("user");
    const id = u?.id ?? c.req.header("x-forwarded-for") ?? "anon";
    const key = `rl:${bucket}:${id}:${Math.floor(Date.now() / (windowSecs * 1000))}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSecs);
    if (n > max) {
      const retryAfter = Math.max(1, windowSecs - Math.floor(Date.now() / 1000) % windowSecs);
      throw new HTTPException(429, { res: new Response(`Too many attempts. Try again in ${retryAfter} seconds.`, { status: 429, headers: { "Retry-After": String(retryAfter) } }) });
    }
    return next();
  };
}
