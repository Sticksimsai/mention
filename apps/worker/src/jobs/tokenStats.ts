// Keep token stats warm for all approved tribes so community pages never
// block on a cold DexScreener call.
import type { TokenStats } from "@mention/shared";
import { communities, eq } from "@mention/db";
import { db, redis } from "../lib/context.js";

async function fetchStats(ca: string): Promise<TokenStats> {
  const base: TokenStats = {
    ca, priceUsd: null, marketCap: null, change5m: null, change1h: null,
    change24h: null, volume24h: null, liquidityUsd: null, pairAddress: null,
    source: null, fetchedAt: new Date().toISOString(),
  };
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const d: any = await r.json();
      const pair = d?.pairs?.filter((p: any) => p.chainId === "solana" && p.baseToken?.address === ca).sort((a: any,b: any) => (b.liquidity?.usd ?? 0)-(a.liquidity?.usd ?? 0))[0];
      if (pair) {
        return {
          ...base,
          priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
          marketCap: pair.marketCap ?? pair.fdv ?? null,
          change5m: pair.priceChange?.m5 ?? null,
          change1h: pair.priceChange?.h1 ?? null,
          change24h: pair.priceChange?.h24 ?? null,
          volume24h: pair.volume?.h24 ?? null,
          liquidityUsd: pair.liquidity?.usd ?? null,
          pairAddress: pair.pairAddress ?? null,
          source: "dexscreener",
        };
      }
    }
  } catch { /* fall through */ }
  try {
    const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${ca}`, {
      headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const d: any = await r.json();
      if (d?.mint) return { ...base, marketCap: d.usd_market_cap ?? null, source: "pumpfun" };
    }
  } catch { /* ignore */ }
  return base;
}

export async function tokenStatsJob(ca: string): Promise<void> {
  const stats = await fetchStats(ca);
  // A failed lookup must not erase an existing pool or good market snapshot.
  if (!stats.source) return;
  const previous = await redis.get(`stale:token:${ca}`);
  if (previous && JSON.parse(previous).pairAddress && !stats.pairAddress) return;
  if (stats.pairAddress) await redis.set(`known-pool:${ca}`, stats.pairAddress, "EX", 2592000);
  const json = JSON.stringify(stats);
  await redis.set(`token:${ca}`, json, "EX", 30);
  await redis.set(`stale:token:${ca}`, json, "EX", 86400);
}

/** Warm stats for every approved tribe (scheduler fans this out). */
export async function warmAllTokenStats(addJob: (ca: string) => Promise<void>): Promise<number> {
  const rows = await db.select({ ca: communities.ca })
    .from(communities).where(eq(communities.status, "approved"));
  for (const r of rows) await addJob(r.ca);
  return rows.length;
}
