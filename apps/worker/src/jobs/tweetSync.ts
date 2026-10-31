// X→site mirror, one user per job. This replaces v1's single monolithic
// cron edge function that looped over every user (and timed out).
//
// Each job: fetch tweets since the stored cursor, match against tribe
// tickers/CAs, insert matches. Dormancy tiers (from v1) decide how often the
// scheduler re-enqueues a handle:
//   active  — new tweet found recently          → every 2 min
//   cooling — 3+ empty runs                     → every 15 min
//   dormant — 10+ empty runs                    → every 2 h
import {
  communities, xPosts, xPostCommunities, xSyncState, eq, sql,
} from "@mention/db";
import { db, redis } from "../lib/context.js";
import { fetchUserTweets, SdCappedError } from "../lib/socialdata.js";

interface TweetMatch { communityId: string; matchedOn: "ticker" | "ca" }

const COOLING_AFTER = 3;
const DORMANT_AFTER = 10;
const INTERVALS = { active: 2 * 60_000, cooling: 15 * 60_000, dormant: 2 * 3_600_000 };

async function getMatchers() {
  // ticker/CA maps cached 60s — shared across all sync jobs in this window
  const hit = await redis.get("sync:matchers").catch(() => null);
  if (hit) {
    const { tickers, cas } = JSON.parse(hit);
    return { tickerMap: new Map<string, string>(tickers), caMap: new Map<string, string>(cas) };
  }
  const rows = await db.select({
    id: communities.id, ticker: communities.ticker, ca: communities.ca,
  }).from(communities).where(eq(communities.status, "approved"));
  const tickerMap = new Map<string, string>();
  const caMap = new Map<string, string>();
  for (const r of rows) {
    const t = r.ticker.trim().toUpperCase();
    if (t && !tickerMap.has(t)) tickerMap.set(t, r.id);
    const ca = r.ca.trim();
    if (ca.length >= 6 && !caMap.has(ca.toLowerCase())) caMap.set(ca.toLowerCase(), r.id);
  }
  await redis.set("sync:matchers", JSON.stringify({
    tickers: [...tickerMap], cas: [...caMap],
  }), "EX", 60).catch(() => {});
  return { tickerMap, caMap };
}

function matchTweet(text: string, tickerMap: Map<string, string>, caMap: Map<string, string>): TweetMatch[] {
  const upper = text.toUpperCase();
  const lower = text.toLowerCase();
  const seen = new Map<string, TweetMatch>();
  for (const [ca, id] of caMap) {
    if (lower.includes(ca)) seen.set(id, { communityId: id, matchedOn: "ca" });
  }
  if (seen.size > 0) return [...seen.values()];
  for (const [ticker, id] of tickerMap) {
    if (new RegExp(`\\$${ticker}\\b`).test(upper)) {
      seen.set(id, { communityId: id, matchedOn: "ticker" });
    }
  }
  return [...seen.values()];
}

function firstMediaUrl(tweet: any): string | null {
  const media = tweet?.entities?.media ?? tweet?.extended_entities?.media ?? [];
  const m = media[0];
  return m?.media_url_https ?? m?.media_url ?? null;
}

export async function tweetSyncJob(username: string): Promise<{ found: number }> {
  const uname = username.toLowerCase();

  const [state] = await db.select().from(xSyncState).where(eq(xSyncState.username, uname));
  if (state?.nextEligibleAt && state.nextEligibleAt > new Date()) return { found: 0 };

  let data: any;
  try {
    data = await fetchUserTweets("tweet-sync", uname, state?.lastTweetId);
  } catch (err) {
    if (err instanceof SdCappedError) return { found: 0 }; // cap hit — silently skip until tomorrow
    await db.insert(xSyncState)
      .values({ username: uname, lastError: String(err), lastSyncedAt: new Date() })
      .onConflictDoUpdate({ target: xSyncState.username, set: { lastError: String(err), lastSyncedAt: new Date() } });
    throw err;
  }

  const tweets: any[] = data?.tweets ?? [];
  const { tickerMap, caMap } = await getMatchers();

  let found = 0;
  let newestId: string | null = state?.lastTweetId ?? null;

  for (const t of tweets) {
    const idStr = String(t.id_str ?? t.id);
    if (!newestId || BigInt(idStr) > BigInt(newestId)) newestId = idStr;
    const text: string = t.full_text ?? t.text ?? "";
    const matches = matchTweet(text, tickerMap, caMap);
    if (matches.length === 0) continue;

    const [inserted] = await db.insert(xPosts).values({
      tweetId: idStr,
      authorUsername: (t.user?.screen_name ?? uname).toLowerCase(),
      authorName: t.user?.name ?? "",
      authorPfpUrl: (t.user?.profile_image_url_https ?? "").replace("_normal.", "_400x400."),
      content: text,
      imageUrl: firstMediaUrl(t),
      tweetUrl: `https://x.com/${t.user?.screen_name ?? uname}/status/${idStr}`,
      tweetCreatedAt: new Date(t.tweet_created_at ?? t.created_at ?? Date.now()),
      likesCount: t.favorite_count ?? 0,
      repostsCount: t.retweet_count ?? 0,
      repliesCount: t.reply_count ?? 0,
      viewsCount: Number(t.views_count ?? 0),
    }).onConflictDoNothing().returning();

    if (inserted) {
      found++;
      for (const m of matches) {
        await db.insert(xPostCommunities).values({
          xPostId: inserted.id, communityId: m.communityId, matchedOn: m.matchedOn,
        }).onConflictDoNothing();
      }
    }
  }

  // dormancy bookkeeping
  const emptyRuns = found > 0 ? 0 : (state?.consecutiveEmptyRuns ?? 0) + 1;
  const tier = emptyRuns >= DORMANT_AFTER ? "dormant" : emptyRuns >= COOLING_AFTER ? "cooling" : "active";
  await db.insert(xSyncState).values({
    username: uname,
    lastTweetId: newestId,
    consecutiveEmptyRuns: emptyRuns,
    nextEligibleAt: new Date(Date.now() + INTERVALS[tier]),
    lastSyncedAt: new Date(),
    lastError: null,
  }).onConflictDoUpdate({
    target: xSyncState.username,
    set: {
      lastTweetId: newestId,
      consecutiveEmptyRuns: emptyRuns,
      nextEligibleAt: new Date(Date.now() + INTERVALS[tier]),
      lastSyncedAt: new Date(),
      lastError: null,
    },
  });

  if (found > 0) {
    await redis.del("feed:global").catch(() => {});
  }
  return { found };
}
