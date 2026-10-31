// Site→X write-back: OAuth 2.0 PKCE flow against the official X API.
// Separate from Privy login — Privy proves who the user is; this grants
// tweet.write so the worker can mirror their Tribes posts to X.
//
// Flow:  GET /v1/x/connect (authed)  → returns authorize URL
//        GET /v1/x/callback          → exchanges code, stores encrypted tokens
//        GET /v1/x/status (authed)   → { connected, writeEnabled }
//        POST /v1/x/toggle (authed)  → enable/disable mirroring
//        DELETE /v1/x (authed)       → disconnect
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { randomBytes, createHash } from "node:crypto";
import { xConnections, eq } from "@mention/db";
import { db } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { encrypt } from "../lib/crypto.js";
import { env } from "../env.js";
import { requireAuth } from "../auth/middleware.js";

export const xRoute = new Hono();

const SCOPES = "tweet.read tweet.write users.read offline.access";

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

xRoute.get("/connect", requireAuth, async (c) => {
  if (!env.X_CLIENT_ID) throw new HTTPException(503, { message: "X write-back not configured" });
  const u = c.get("user");
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());

  await redis.set(`xoauth:${state}`, JSON.stringify({ userId: u.id, verifier }), "EX", 600);

  const url = new URL("https://x.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.X_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.X_REDIRECT_URI);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return c.json({ url: url.toString() });
});

xRoute.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) throw new HTTPException(400, { message: "missing code/state" });

  const raw = await redis.getdel(`xoauth:${state}`);
  if (!raw) throw new HTTPException(400, { message: "state expired — try again" });
  const { userId, verifier } = JSON.parse(raw) as { userId: string; verifier: string };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.X_REDIRECT_URI,
    code_verifier: verifier,
    client_id: env.X_CLIENT_ID,
  });
  const res = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString("base64"),
    },
    body,
  });
  if (!res.ok) {
    throw new HTTPException(502, { message: `token exchange failed: ${res.status}` });
  }
  const tok: any = await res.json();

  // whoami — confirm the X account
  const meRes = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  const me: any = meRes.ok ? await meRes.json() : { data: {} };

  await db.insert(xConnections).values({
    userId,
    xUserId: me.data?.id ?? "",
    accessTokenEnc: encrypt(tok.access_token),
    refreshTokenEnc: encrypt(tok.refresh_token ?? ""),
    scopes: tok.scope ?? SCOPES,
    expiresAt: new Date(Date.now() + (tok.expires_in ?? 7200) * 1000),
  }).onConflictDoUpdate({
    target: xConnections.userId,
    set: {
      xUserId: me.data?.id ?? "",
      accessTokenEnc: encrypt(tok.access_token),
      refreshTokenEnc: encrypt(tok.refresh_token ?? ""),
      scopes: tok.scope ?? SCOPES,
      expiresAt: new Date(Date.now() + (tok.expires_in ?? 7200) * 1000),
      updatedAt: new Date(),
    },
  });

  return c.redirect(`${env.WEB_ORIGIN}/settings?x=connected`);
});

xRoute.get("/status", requireAuth, async (c) => {
  const u = c.get("user");
  const [conn] = await db.select({
    writeEnabled: xConnections.writeEnabled,
    expiresAt: xConnections.expiresAt,
  }).from(xConnections).where(eq(xConnections.userId, u.id));
  return c.json({ connected: Boolean(conn), writeEnabled: conn?.writeEnabled ?? false });
});

xRoute.post("/toggle", requireAuth, async (c) => {
  const u = c.get("user");
  const { enabled } = await c.req.json<{ enabled: boolean }>();
  await db.update(xConnections).set({ writeEnabled: enabled, updatedAt: new Date() })
    .where(eq(xConnections.userId, u.id));
  return c.json({ ok: true });
});

xRoute.delete("/", requireAuth, async (c) => {
  const u = c.get("user");
  await db.delete(xConnections).where(eq(xConnections.userId, u.id));
  return c.json({ ok: true });
});
