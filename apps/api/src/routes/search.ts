// Site search: tribes by name/ticker/CA, users by handle/name. Public.
import { Hono } from "hono";
import { communities, users, eq, and, or, ilike } from "@mention/db";
import { db } from "../lib/db.js";

export const searchRoute = new Hono();

searchRoute.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 1 || q.length > 80) return c.json({ tribes: [], users: [] });
  const pat = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const [tribeRows, userRows] = await Promise.all([
    db.select({
      id: communities.id, name: communities.name, ticker: communities.ticker,
      ca: communities.ca, pfpUrl: communities.pfpUrl, membersCount: communities.membersCount,
    }).from(communities)
      .where(and(
        eq(communities.status, "approved"),
        or(ilike(communities.name, pat), ilike(communities.ticker, pat), ilike(communities.ca, pat)),
      ))
      .limit(6),
    db.select({
      username: users.username, displayName: users.displayName, pfpUrl: users.pfpUrl,
    }).from(users)
      .where(or(ilike(users.username, pat), ilike(users.displayName, pat)))
      .limit(5),
  ]);

  return c.json({ tribes: tribeRows, users: userRows });
});
