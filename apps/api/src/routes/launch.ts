// Integrated launchpad: launch a pump.fun token through Mention.
//
// Revenue model ("the tax"):
//  • The token is created with the PLATFORM wallet as the pump.fun creator,
//    so pump.fun's creator-fee share on ALL trading volume (bonding curve +
//    PumpSwap after migration) accrues to the platform wallet.
//  • The launcher's share (100% - PLATFORM_CREATOR_FEE_SHARE_BPS) is handled
//    via pump.fun's creator-fee splitting (creators can split fees across up
//    to 10 wallets) — configure the split for each launch from the platform
//    wallet, or run a periodic payout job from the collected balance.
//  • On top of that, in-app trades carry PLATFORM_TRADE_FEE_BPS (see trade.ts).
//
// Custody model — SELF-CUSTODIED. No third party ever holds keys:
//  • Metadata upload → pump.fun's own IPFS endpoint.
//  • PumpPortal's LOCAL endpoint is used purely as an unsigned-transaction
//    builder (no API key, no custody).
//  • The tx is signed HERE with the platform keypair from
//    PLATFORM_WALLET_SECRET and sent through our own RPC.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { launchTokenSchema } from "@mention/shared";
import { communities, communityMembers, eq } from "@mention/db";
import { db } from "../lib/db.js";
import { queues } from "../lib/redis.js";
import { env } from "../env.js";
import { requireAuth, requireNotBanned, rateLimit } from "../auth/middleware.js";

export const launchRoute = new Hono();

const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");

/** Parse PLATFORM_WALLET_SECRET: JSON byte array or base58 string. */
function platformKeypair(): Keypair {
  const raw = env.PLATFORM_WALLET_SECRET.trim();
  if (raw.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
  return Keypair.fromSecretKey(base58Decode(raw));
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error("invalid base58 in PLATFORM_WALLET_SECRET");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const ch of s) { if (ch === "1") bytes.unshift(0); else break; }
  return Uint8Array.from(bytes);
}

launchRoute.post("/", requireAuth, rateLimit("launch", 2, 3600),
  zValidator("json", launchTokenSchema), async (c) => {
    requireNotBanned(c);
    if (!env.PLATFORM_WALLET_SECRET) {
      throw new HTTPException(503, { message: "launchpad not configured (PLATFORM_WALLET_SECRET)" });
    }
    const u = c.get("user");
    const body = c.req.valid("json");
    const platform = platformKeypair();

    // 1) upload metadata to pump.fun IPFS
    const imgRes = await fetch(body.imageUrl, { signal: AbortSignal.timeout(10_000) });
    if (!imgRes.ok) throw new HTTPException(400, { message: "could not fetch token image" });
    const imgBlob = await imgRes.blob();

    const form = new FormData();
    form.append("file", imgBlob, "token.png");
    form.append("name", body.name);
    form.append("symbol", body.ticker.toUpperCase());
    form.append("description", body.description);
    if (body.website) form.append("website", body.website);
    if (body.telegram) form.append("telegram", body.telegram);
    form.append("twitter", `https://x.com/${u.username}`);
    form.append("showName", "true");

    const ipfsRes = await fetch("https://pump.fun/api/ipfs", { method: "POST", body: form });
    if (!ipfsRes.ok) throw new HTTPException(502, { message: "metadata upload failed" });
    const ipfs: any = await ipfsRes.json();

    // 2) build the unsigned create tx (local endpoint — keyless, non-custodial)
    const mintKeypair = Keypair.generate();
    const buildRes = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: platform.publicKey.toBase58(),
        action: "create",
        tokenMetadata: {
          name: body.name,
          symbol: body.ticker.toUpperCase(),
          uri: ipfs.metadataUri,
        },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: "true",
        amount: body.devBuySol, // platform-funded dev buy (can be 0)
        slippage: 10,
        priorityFee: 0.0005,
        pool: "pump",
      }),
    });
    if (!buildRes.ok) {
      throw new HTTPException(502, { message: `launch build failed: ${await buildRes.text().then((t) => t.slice(0, 200))}` });
    }

    // 3) sign with OUR keys and send through OUR rpc
    const tx = VersionedTransaction.deserialize(new Uint8Array(await buildRes.arrayBuffer()));
    tx.sign([platform, mintKeypair]);
    let signature: string;
    try {
      signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      const bh = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature, ...bh }, "confirmed");
    } catch (err: any) {
      throw new HTTPException(502, { message: `launch tx failed: ${String(err?.message ?? err).slice(0, 200)}` });
    }

    const ca = mintKeypair.publicKey.toBase58();

    // 4) auto-create the community for this token
    const [comm] = await db.transaction(async (tx2) => {
      const [row] = await tx2.insert(communities).values({
        name: body.name,
        ticker: body.ticker.toUpperCase(),
        ca,
        details: body.description,
        website: body.website ?? null,
        telegram: body.telegram ?? null,
        ownerId: u.id,
        launchedViaTribes: true,
        creatorWallet: body.creatorWallet,
        platformFeeShareBps: env.PLATFORM_CREATOR_FEE_SHARE_BPS,
      }).returning();
      await tx2.insert(communityMembers).values({ communityId: row.id, userId: u.id });
      return [row];
    });

    await queues.tokenStats.add("refresh", { ca }, { jobId: `ts:${ca}` }).catch(() => {});
    await queues.tweetSync.add("sync", { username: u.username }, { jobId: `tw:${u.username}:launch` }).catch(() => {});

    return c.json({
      ca,
      signature,
      communityId: comm.id,
      pumpUrl: `https://pump.fun/coin/${ca}`,
    }, 201);
  });
