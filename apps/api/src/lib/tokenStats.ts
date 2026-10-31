// Token market data: DexScreener first, pump.fun fallback (pre-migration
// tokens aren't on DexScreener yet). Shared by the API route and the worker.
import type { TokenStats } from "@mention/shared";

export async function fetchTokenStats(ca: string): Promise<TokenStats> {
  const base: TokenStats = {
    ca, priceUsd: null, marketCap: null, change5m: null, change1h: null,
    change24h: null, volume24h: null, liquidityUsd: null, pairAddress: null,
    source: null, fetchedAt: new Date().toISOString(),
  };

  // 1) DexScreener
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const d: any = await r.json();
      const pair = d?.pairs?.[0];
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

  // 2) pump.fun frontend API (server-side; blocks browsers via Cloudflare)
  try {
    const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${ca}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const d: any = await r.json();
      if (d?.mint) {
        return { ...base, marketCap: d.usd_market_cap ?? null, source: "pumpfun" };
      }
    }
  } catch { /* give up */ }

  return base;
}
