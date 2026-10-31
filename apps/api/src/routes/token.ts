import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cached } from "../lib/redis.js";
import { fetchTokenStats } from "../lib/tokenStats.js";

export const tokenRoute = new Hono();

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
