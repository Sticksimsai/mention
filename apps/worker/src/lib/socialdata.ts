// Metered SocialData client — port of v1's _shared/sdClient.ts.
// Every call records item counts in socialdata_usage (1 item ≈ $0.0002) and
// is short-circuited when the global daily cap is reached. The cap is a
// kill-switch against runaway spend, not a precise quota.
import { socialdataUsage, sql } from "@mention/db";
import { db, redis } from "./context.js";
import { env } from "../env.js";

const BASE = "https://api.socialdata.tools";

export class SdCappedError extends Error {
  capped = true as const;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function usedToday(): Promise<number> {
  const cacheKey = `sd:used:${today()}`;
  const hit = await redis.get(cacheKey).catch(() => null);
  if (hit !== null) return Number(hit);
  const rows = await db.select({ total: sql<number>`COALESCE(SUM(items), 0)` })
    .from(socialdataUsage).where(sql`day = ${today()}`);
  const used = Number(rows[0]?.total ?? 0);
  await redis.set(cacheKey, String(used), "EX", 30).catch(() => {});
  return used;
}

async function recordUsage(jobName: string, items: number) {
  await db.insert(socialdataUsage)
    .values({ jobName, day: today(), items, requests: 1 })
    .onConflictDoUpdate({
      target: [socialdataUsage.jobName, socialdataUsage.day],
      set: {
        items: sql`${socialdataUsage.items} + ${items}`,
        requests: sql`${socialdataUsage.requests} + 1`,
      },
    });
  await redis.incrby(`sd:used:${today()}`, items).catch(() => {});
}

export async function sdGet(jobName: string, path: string): Promise<any> {
  if (!env.SOCIALDATA_API_KEY) throw new Error("SOCIALDATA_API_KEY not set");
  if ((await usedToday()) >= env.SOCIALDATA_DAILY_CAP) {
    throw new SdCappedError(`SocialData daily cap reached (${env.SOCIALDATA_DAILY_CAP})`);
  }
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${env.SOCIALDATA_API_KEY}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) throw new Error("socialdata rate limited");
  if (!res.ok) throw new Error(`socialdata ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
  const data = await res.json();
  const items = Array.isArray((data as any)?.tweets) ? (data as any).tweets.length : 1;
  await recordUsage(jobName, Math.max(items, 1));
  return data;
}

/** Latest tweets for a handle since a tweet id. */
export async function fetchUserTweets(jobName: string, username: string, sinceId?: string | null) {
  const q = encodeURIComponent(`from:${username}${sinceId ? ` since_id:${sinceId}` : ""}`);
  return sdGet(jobName, `/twitter/search?query=${q}&type=Latest`);
}

export async function fetchUserProfile(jobName: string, username: string) {
  return sdGet(jobName, `/twitter/user/${encodeURIComponent(username)}`);
}
