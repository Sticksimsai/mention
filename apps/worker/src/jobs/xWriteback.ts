// Site→X mirror: post one Tribes post to the author's X account via the
// official X API (OAuth2 user context, tweet.write). Handles token refresh.
// Jobs retry with exponential backoff (configured at enqueue time in the API).
import { createDecipheriv, createCipheriv, createHash, randomBytes } from "node:crypto";
import { posts, xConnections, users, eq } from "@mention/db";
import { db } from "../lib/context.js";
import { env } from "../env.js";

function key(): Buffer {
  if (!env.TOKEN_ENCRYPTION_KEY || env.TOKEN_ENCRYPTION_KEY.length < 16) {
    throw new Error("TOKEN_ENCRYPTION_KEY not set (any secret of 16+ chars)");
  }
  return createHash("sha256").update(env.TOKEN_ENCRYPTION_KEY).digest();
}
function decrypt(payload: string): string {
  const [iv, tag, ct] = payload.split(".");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}
function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return `${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${ct.toString("base64")}`;
}

async function refreshIfNeeded(conn: typeof xConnections.$inferSelect): Promise<string> {
  if (conn.expiresAt.getTime() - Date.now() > 120_000) {
    return decrypt(conn.accessTokenEnc);
  }
  const res = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(conn.refreshTokenEnc),
      client_id: env.X_CLIENT_ID,
    }),
  });
  if (!res.ok) throw new Error(`x token refresh failed: ${res.status}`);
  const tok: any = await res.json();
  await db.update(xConnections).set({
    accessTokenEnc: encrypt(tok.access_token),
    refreshTokenEnc: encrypt(tok.refresh_token ?? decrypt(conn.refreshTokenEnc)),
    expiresAt: new Date(Date.now() + (tok.expires_in ?? 7200) * 1000),
    updatedAt: new Date(),
  }).where(eq(xConnections.userId, conn.userId));
  return tok.access_token;
}

export async function xWritebackJob(postId: string, attemptsExhausted: boolean): Promise<void> {
  const [row] = await db.select({ p: posts, u: users })
    .from(posts).innerJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.id, postId));
  if (!row || row.p.crosspostStatus !== "pending") return; // already handled / deleted

  const [conn] = await db.select().from(xConnections)
    .where(eq(xConnections.userId, row.p.authorId));
  if (!conn || !conn.writeEnabled) {
    await db.update(posts).set({ crosspostStatus: "skipped" }).where(eq(posts.id, postId));
    return;
  }

  try {
    const accessToken = await refreshIfNeeded(conn);
    const res = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: row.p.content.slice(0, 280) }),
    });
    if (res.status === 429) throw new Error("x rate limited"); // retried by BullMQ backoff
    if (!res.ok) throw new Error(`x post failed: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
    const out: any = await res.json();
    await db.update(posts).set({
      crosspostStatus: "posted",
      xTweetId: out.data?.id ?? null,
    }).where(eq(posts.id, postId));
  } catch (err) {
    if (attemptsExhausted) {
      await db.update(posts).set({ crosspostStatus: "failed" }).where(eq(posts.id, postId));
    }
    throw err;
  }
}
