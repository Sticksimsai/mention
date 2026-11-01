import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { siteAnnouncements, eq } from "@mention/db";
import { env } from "./env.js";
import { db } from "./lib/db.js";
import { redis } from "./lib/redis.js";
import { communitiesRoute } from "./routes/communities.js";
import { feedRoute } from "./routes/feed.js";
import { postsRoute } from "./routes/posts.js";
import { tokenRoute } from "./routes/token.js";
import { usersRoute } from "./routes/users.js";
import { xRoute } from "./routes/x.js";
import { launchRoute } from "./routes/launch.js";
import { tradeRoute } from "./routes/trade.js";
import { adminRoute } from "./routes/admin.js";
import { searchRoute } from "./routes/search.js";

import { earningsRoute, processApprovedPayouts } from "./routes/earnings.js";

const app = new Hono();

app.use("*", logger());
const webOrigins = [env.WEB_ORIGIN];
try {
  const u = new URL(env.WEB_ORIGIN);
  webOrigins.push(u.hostname.startsWith("www.")
    ? `${u.protocol}//${u.hostname.slice(4)}`
    : `${u.protocol}//www.${u.hostname}`);
} catch { /* keep single origin */ }

app.use("*", cors({
  origin: webOrigins,
  allowHeaders: ["Authorization", "Content-Type"],
  maxAge: 86400,
}));

// health check — Railway uses this for zero-downtime deploys
app.get("/health", async (c) => {
  const checks: Record<string, boolean> = { redis: false, db: false };
  try { checks.redis = (await redis.ping()) === "PONG"; } catch {}
  try { await db.select().from(siteAnnouncements).limit(1); checks.db = true; } catch {}
  const ok = checks.redis && checks.db;
  return c.json({ ok, checks }, ok ? 200 : 503);
});

app.get("/v1/announcement", async (c) => {
  const [row] = await db.select().from(siteAnnouncements)
    .where(eq(siteAnnouncements.active, true)).limit(1);
  return c.json(row ?? null);
});

app.route("/v1/communities", communitiesRoute);
app.route("/v1/feed", feedRoute);
app.route("/v1/posts", postsRoute);
app.route("/v1/token", tokenRoute);
app.route("/v1/users", usersRoute);
app.route("/v1/x", xRoute);
app.route("/v1/launch", launchRoute);
app.route("/v1/trade", tradeRoute);
app.route("/v1/earnings", earningsRoute);
app.route("/v1/admin", adminRoute);
app.route("/v1/search", searchRoute);

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`mention api listening on :${info.port}`);
});

// Opt-in executor: approval records and explicit budgets are required before any payout.
if (env.PAYOUTS_ENABLED) setInterval(() => processApprovedPayouts().catch(() => console.error("Payout reconciliation failed")), 15_000).unref();
