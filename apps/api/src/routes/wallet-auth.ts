// Wallet sign-in for launching without an X account, and the bridge that moves
// a wallet's communities onto an X account once the launcher signs in.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { communities, communityMembers, users, eq, sql } from "@mention/db";
import { db } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { requireAuth, requireNotBanned, rateLimit, WALLET_USER_PREFIX } from "../auth/middleware.js";
import { consumeChallenge, createChallenge, issueWalletSession, verifyWalletSession, walletAddress } from "../auth/wallet.js";

export const walletAuthRoute = new Hono();

const addressInput = z.string().min(32).max(44);
function parseAddress(value: string): string {
  try { return walletAddress(value); }
  catch { throw new HTTPException(400, { message: "That is not a valid Solana wallet address." }); }
}

walletAuthRoute.post("/challenge", rateLimit("wallet-challenge", 20, 60),
  zValidator("json", z.object({ address: addressInput })), async (c) => {
    const address = parseAddress(c.req.valid("json").address);
    return c.json({ address, message: await createChallenge(address) });
  });

walletAuthRoute.post("/verify", rateLimit("wallet-verify", 10, 600),
  zValidator("json", z.object({ address: addressInput, signature: z.string().min(80).max(100) })), async (c) => {
    const body = c.req.valid("json");
    const address = parseAddress(body.address);
    const signature = Uint8Array.from(Buffer.from(body.signature, "base64"));
    if (!(await consumeChallenge(address, signature))) {
      throw new HTTPException(401, { message: "Wallet verification failed or expired. Request a new signature and try again." });
    }
    return c.json({ address, ...(await issueWalletSession(address)) });
  });

// An X-signed-in user presents a wallet session they also hold. Communities launched
// by that wallet move to the X account so the launcher can post in and manage them.
walletAuthRoute.post("/claim", requireAuth, rateLimit("wallet-claim", 10, 60),
  zValidator("json", z.object({ walletToken: z.string().min(20).max(2000) })), async (c) => {
    requireNotBanned(c);
    const user = c.get("user");
    let address: string;
    try { address = await verifyWalletSession(c.req.valid("json").walletToken); }
    catch { throw new HTTPException(401, { message: "Your wallet session expired. Reconnect your wallet." }); }
    const [walletRow] = await db.select().from(users).where(eq(users.privyUserId, `${WALLET_USER_PREFIX}${address}`));
    if (!walletRow || walletRow.id === user.id) return c.json({ claimed: 0 });
    const moved = await db.transaction(async (tx) => {
      const owned = await tx.update(communities).set({ ownerId: user.id })
        .where(eq(communities.ownerId, walletRow.id)).returning({ id: communities.id });
      for (const community of owned) {
        const joined = await tx.insert(communityMembers).values({ communityId: community.id, userId: user.id })
          .onConflictDoNothing().returning();
        if (joined.length) {
          await tx.update(communities).set({ membersCount: sql`${communities.membersCount} + 1` }).where(eq(communities.id, community.id));
        }
      }
      return owned.length;
    });
    if (moved) await redis.del(`authed:wallet:${address}`).catch(() => {});
    return c.json({ claimed: moved });
  });
