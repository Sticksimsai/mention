import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { siteAnnouncements, eq } from "@tribes/db";
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

const app = new Hono();

app.use("*", logger());
app.use("*", cors({
  origin: [env.WEB_ORIGIN],
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
app.route("/v1/admin", adminRoute);

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`tribes api listening on :${info.port}`);
});
