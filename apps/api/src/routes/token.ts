import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { TokenStats } from "@tribes/shared";
import { communities, eq } from "@tribes/db";
import { db } from "../lib/db.js";
import { redis, cached } from "../lib/redis.js";
import { fetchTokenStats } from "../lib/tokenStats.js";

export const tokenRoute = new Hono();

export interface TopToken {
  communityId: string;
  name: string;
  ticker: string;
  ca: string;
  pfpUrl: string;
  marketCap: number | null;
  change24h: number | null;
  volume24h: number | null;
}

// GET /v1/token/top — top tribes by live market cap. Reads the stats the
// worker keeps warm in Redis (every 30s), so this is one DB query + one MGET
// no matter how many viewers poll it.
tokenRoute.get("/top", async (c) => {
  const out = await cached<TopToken[]>("token:top10", 10, async () => {
    const rows = await db.select({
      id: communities.id, name: communities.name, ticker: communities.ticker,
      ca: communities.ca, pfpUrl: communities.pfpUrl,
    }).from(communities).where(eq(communities.status, "approved"));
    if (rows.length === 0) return [];

    const keys = rows.map((r) => `token:${r.ca}`);
    const staleKeys = rows.map((r) => `stale:token:${r.ca}`);
    const [fresh, stale] = await Promise.all([redis.mget(keys), redis.mget(staleKeys)]);

    const list: TopToken[] = rows.map((r, i) => {
      const raw = fresh[i] ?? stale[i];
      const s: TokenStats | null = raw ? JSON.parse(raw) : null;
      return {
        communityId: r.id, name: r.name, ticker: r.ticker, ca: r.ca, pfpUrl: r.pfpUrl,
        marketCap: s?.marketCap ?? null,
        change24h: s?.change24h ?? null,
        volume24h: s?.volume24h ?? null,
      };
    });
    list.sort((a, b) => (b.marketCap ?? -1) - (a.marketCap ?? -1));
    return list.slice(0, 10);
  });
  return c.json(out);
});

// GET /v1/token/:ca/stats — 15s cache, stale-while-error.
// v1 proxied this per-pageview through an edge function with no cache;
// under load that alone could exhaust the function quota.
tokenRoute.get("/:ca/stats", async (c) => {
  const ca = c.req.param("ca")!.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ca)) {
    throw new HTTPException(400, { message: "invalid ca" });
  }
  const stats = await cached(`token:${ca}`, 15, () => fetchTokenStats(ca));
  return c.json(stats);
});
