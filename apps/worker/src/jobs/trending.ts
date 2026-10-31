// Recompute trending tribes: engagement in the last 24h (native posts,
// likes, mirrored tweet activity, new members), ranked and cached in Redis.
import { sql } from "@tribes/db";
import { db, redis } from "../lib/context.js";

export async function trendingJob(): Promise<void> {
  const rows = await db.execute(sql`
    SELECT c.id,
      COALESCE(p.cnt, 0) * 3 + COALESCE(x.cnt, 0) * 2 + COALESCE(m.cnt, 0) * 5 AS score
    FROM communities c
    LEFT JOIN (
      SELECT community_id, COUNT(*) AS cnt FROM posts
      WHERE created_at > now() - interval '24 hours' GROUP BY community_id
    ) p ON p.community_id = c.id
    LEFT JOIN (
      SELECT xpc.community_id, COUNT(*) AS cnt
      FROM x_post_communities xpc
      JOIN x_posts xp ON xp.id = xpc.x_post_id
      WHERE xp.tweet_created_at > now() - interval '24 hours'
      GROUP BY xpc.community_id
    ) x ON x.community_id = c.id
    LEFT JOIN (
      SELECT community_id, COUNT(*) AS cnt FROM community_members
      WHERE created_at > now() - interval '24 hours' GROUP BY community_id
    ) m ON m.community_id = c.id
    WHERE c.status = 'approved'
    ORDER BY score DESC
    LIMIT 30
  `);
  const ids = (rows as unknown as Array<{ id: string }>).map((r) => r.id);
  await redis.set("trending:communities", JSON.stringify(ids), "EX", 600);
  await redis.del("communities:list:trending").catch(() => {});
}
