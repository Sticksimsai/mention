// In-app buy/sell with the platform trade fee ("tax" #2).
//
// The trade transaction is built by PumpPortal's LOCAL API (no custody),
// then we append a SystemProgram transfer of PLATFORM_TRADE_FEE_BPS of the
// SOL notional to PLATFORM_FEE_WALLET, and return the unsigned tx base64.
// The user's wallet (Phantom etc.) signs and sends client-side.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import {
  Connection, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { tradeSchema } from "@mention/shared";
import { env } from "../env.js";
import { requireAuth, requireNotBanned, rateLimit } from "../auth/middleware.js";
import { cached } from "../lib/redis.js";
import { fetchTokenStats } from "../lib/tokenStats.js";

export const tradeRoute = new Hono();

const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");

tradeRoute.post("/build", requireAuth, rateLimit("trade", 30, 60),
  zValidator("json", tradeSchema), async (c) => {
    requireNotBanned(c);
    if (!env.PLATFORM_FEE_WALLET) {
      throw new HTTPException(503, { message: "trading not configured (PLATFORM_FEE_WALLET)" });
    }
    const body = c.req.valid("json");

    // 1) base trade tx from PumpPortal local API (returns unsigned tx bytes)
    const res = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: body.wallet,
        action: body.side,
        mint: body.ca,
        amount: body.amount,
        denominatedInSol: String(body.denominatedInSol),
        slippage: body.slippageBps / 100,
        priorityFee: 0.0005,
        pool: "auto", // bonding curve or PumpSwap, whichever the token is on
      }),
    });
    if (!res.ok) {
      throw new HTTPException(502, { message: `trade build failed: ${await res.text()}` });
    }
    const txBytes = new Uint8Array(await res.arrayBuffer());
    const tx = VersionedTransaction.deserialize(txBytes);

    // 2) fee: bps of the SOL notional
    let solNotional: number;
    if (body.denominatedInSol) {
      solNotional = body.amount;
    } else {
      // sells: estimate notional from current price
      const stats = await cached(`token:${body.ca}`, 15, () => fetchTokenStats(body.ca));
      const priceUsd = stats.priceUsd ?? 0;
      const solUsd = await cached("sol:usd", 30, async () => {
        const r = await fetch("https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112");
        const d: any = await r.json();
        return Number(d?.pairs?.[0]?.priceUsd ?? 0);
      });
      solNotional = solUsd > 0 ? (body.amount * priceUsd) / solUsd : 0;
    }
    const feeLamports = Math.floor(solNotional * LAMPORTS_PER_SOL * (env.PLATFORM_TRADE_FEE_BPS / 10_000));

    // 3) append fee transfer + recompile with a fresh blockhash
    const msg = TransactionMessage.decompile(tx.message);
    if (feeLamports > 5000) { // skip dust
      msg.instructions.push(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(body.wallet),
          toPubkey: new PublicKey(env.PLATFORM_FEE_WALLET),
          lamports: feeLamports,
        }),
      );
    }
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    msg.recentBlockhash = blockhash;
    const rebuilt = new VersionedTransaction(msg.compileToV0Message());

    return c.json({
      tx: Buffer.from(rebuilt.serialize()).toString("base64"),
      feeLamports,
      feeBps: env.PLATFORM_TRADE_FEE_BPS,
    });
  });
