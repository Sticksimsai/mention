// Site→X mirror: post one Tribes post to the author's X account via the
// official X API (OAuth2 user context, tweet.write). Handles token refresh.
// Jobs retry with exponential backoff (configured at enqueue time in the API).
import { createDecipheriv, createCipheriv, createHash, randomBytes } from "node:crypto";
import { posts, xConnections, xWriteAttempts, users, eq } from "@mention/db";
import { db } from "../lib/context.js";
import { sendOnce } from "../lib/sendOnce.js";
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
    method: "POST", signal:AbortSignal.timeout(15000),
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

  if(row.p.hidden){await db.update(posts).set({crosspostStatus:"skipped"}).where(eq(posts.id,postId));return;}

  const [conn] = await db.select().from(xConnections)
    .where(eq(xConnections.userId, row.p.authorId));
  if (!conn || !conn.writeEnabled) {
    await db.update(posts).set({ crosspostStatus: "skipped" }).where(eq(posts.id, postId));
    return;
  }

  if(!conn.xUserId||conn.xUserId!==row.u.xUserId){await db.update(posts).set({crosspostStatus:'failed'}).where(eq(posts.id,postId));throw new Error('X identity mismatch: reconnect before posting');}
  try {
    const accessToken = await refreshIfNeeded(conn);
    await sendOnce({
      claim:async()=>{
        const claimed=await db.insert(xWriteAttempts).values({postId}).onConflictDoNothing().returning();
        if(claimed.length)return true;
        const [attempt]=await db.select().from(xWriteAttempts).where(eq(xWriteAttempts.postId,postId));
        await db.update(posts).set({crosspostStatus:attempt?.status==='posted'?'posted':'failed',xTweetId:attempt?.xTweetId??null}).where(eq(posts.id,postId));
        return false;
      },
      send:async()=>{
        const res=await fetch("https://api.x.com/2/tweets",{
          method:"POST",signal:AbortSignal.timeout(15000),
          headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},
          body:JSON.stringify({text:row.p.content.slice(0,280)}),
        });
        if(!res.ok)throw new Error(`X post not confirmed: HTTP ${res.status}`);
        const out:any=await res.json();
        if(typeof out.data?.id!=='string'||!/^\d+$/.test(out.data.id))throw new Error('X returned no post ID');
        return out.data.id as string;
      },
      complete:async(id)=>{
        await db.transaction(async tx=>{
          await tx.update(xWriteAttempts).set({status:'posted',xTweetId:id,updatedAt:new Date()}).where(eq(xWriteAttempts.postId,postId));
          await tx.update(posts).set({crosspostStatus:'posted',xTweetId:id}).where(eq(posts.id,postId));
        });
      },
      uncertain:async()=>{
        await db.update(xWriteAttempts).set({status:'uncertain',updatedAt:new Date()}).where(eq(xWriteAttempts.postId,postId));
        await db.update(posts).set({crosspostStatus:'failed'}).where(eq(posts.id,postId));
      },
    });
  } catch (err) {
    if (attemptsExhausted) {
      await db.update(posts).set({ crosspostStatus: "failed" }).where(eq(posts.id, postId));
    }
    throw err;
  }
}
