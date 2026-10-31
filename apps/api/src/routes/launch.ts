// Integrated launchpad: launch a pump.fun token through Tribes.
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
// Implementation uses PumpPortal:
//  • Metadata upload → pump.fun IPFS
//  • Creation via PumpPortal Lightning API (server-side wallet = creator)
//    https://pumpportal.fun/api/trade?api-key=...
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { Keypair } from "@solana/web3.js";
import { launchTokenSchema } from "@tribes/shared";
import { communities, communityMembers, eq } from "@tribes/db";
import { db } from "../lib/db.js";
import { queues } from "../lib/redis.js";
import { env } from "../env.js";
import { requireAuth, requireNotBanned, rateLimit } from "../auth/middleware.js";

export const launchRoute = new Hono();

launchRoute.post("/", requireAuth, rateLimit("launch", 2, 3600),
  zValidator("json", launchTokenSchema), async (c) => {
    requireNotBanned(c);
    if (!env.PUMPPORTAL_API_KEY) {
      throw new HTTPException(503, { message: "launchpad not configured (PUMPPORTAL_API_KEY)" });
    }
    const u = c.get("user");
    const body = c.req.valid("json");

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

    // 2) create via PumpPortal Lightning (platform wallet signs = creator)
    const mintKeypair = Keypair.generate();
    const createRes = await fetch(`https://pumpportal.fun/api/trade?api-key=${env.PUMPPORTAL_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        tokenMetadata: {
          name: body.name,
          symbol: body.ticker.toUpperCase(),
          uri: ipfs.metadataUri,
        },
        mint: Buffer.from(mintKeypair.secretKey).toString("base64"),
        denominatedInSol: "true",
        amount: body.devBuySol, // initial platform-side dev buy (can be 0)
        slippage: 10,
        priorityFee: 0.0005,
        pool: "pump",
      }),
    });
    const created: any = await createRes.json();
    if (!createRes.ok || created?.errors?.length) {
      throw new HTTPException(502, { message: `launch failed: ${JSON.stringify(created?.errors ?? createRes.status)}` });
    }

    const ca = mintKeypair.publicKey.toBase58();

    // 3) auto-create the tribe for this token
    const [comm] = await db.transaction(async (tx) => {
      const [row] = await tx.insert(communities).values({
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
      await tx.insert(communityMembers).values({ communityId: row.id, userId: u.id });
      return [row];
    });

    await queues.tokenStats.add("refresh", { ca }, { jobId: `ts:${ca}` }).catch(() => {});
    await queues.tweetSync.add("sync", { username: u.username }, { jobId: `tw:${u.username}:launch` }).catch(() => {});

    return c.json({
      ca,
      signature: created.signature ?? null,
      communityId: comm.id,
      pumpUrl: `https://pump.fun/coin/${ca}`,
    }, 201);
  });
