// Worker entrypoint: BullMQ workers + the repeatable scheduler.
//
// Scaling model (the "no overload" design):
//  • Every unit of work is a small idempotent job with retries + backoff.
//  • Concurrency is capped per queue, so SocialData / X API / RPC are never
//    hammered no matter how many users exist.
//  • Run N instances of this service on Railway to scale horizontally —
//    BullMQ distributes jobs across them automatically.
import { Worker, Queue } from "bullmq";
import { QUEUES, type TweetSyncJob, type XWritebackJob, type TokenStatsJob } from "@mention/shared";
import { users, xSyncState, communityMembers, eq, sql } from "@mention/db";
import { db, queueConnection } from "./lib/context.js";
import { tweetSyncJob } from "./jobs/tweetSync.js";
import { xWritebackJob } from "./jobs/xWriteback.js";
import { tokenStatsJob, warmAllTokenStats } from "./jobs/tokenStats.js";
import { trendingJob } from "./jobs/trending.js";

const connection = queueConnection;

const tweetSyncQueue = new Queue(QUEUES.TWEET_SYNC, { connection });
const tokenStatsQueue = new Queue(QUEUES.TOKEN_STATS, { connection });
const schedulerQueue = new Queue(QUEUES.SCHEDULER, { connection });

// ── workers ──

new Worker<TweetSyncJob>(QUEUES.TWEET_SYNC, async (job) => {
  return tweetSyncJob(job.data.username);
}, {
  connection,
  concurrency: 4,                       // parallel SocialData fetches per instance
  limiter: { max: 60, duration: 60_000 }, // global-ish politeness cap
});

new Worker<XWritebackJob>(QUEUES.X_WRITEBACK, async (job) => {
  const exhausted = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  return xWritebackJob(job.data.postId, exhausted);
}, {
  connection,
  concurrency: 2,
  limiter: { max: 30, duration: 60_000 }, // X API politeness
});

new Worker<TokenStatsJob>(QUEUES.TOKEN_STATS, async (job) => {
  return tokenStatsJob(job.data.ca);
}, {
  connection,
  concurrency: 4,
  limiter: { max: 120, duration: 60_000 },
});

new Worker(QUEUES.TRENDING, async () => trendingJob(), { connection });

// ── scheduler: the heartbeat that replaces pg_cron ──
new Worker(QUEUES.SCHEDULER, async (job) => {
  switch (job.name) {
    case "fanout-tweet-sync": {
      // every member of any tribe gets mirrored; due = past nextEligibleAt
      const due = await db.execute(sql`
        SELECT DISTINCT u.username
        FROM users u
        JOIN community_members cm ON cm.user_id = u.id
        LEFT JOIN x_sync_state s ON s.username = u.username
        WHERE s.next_eligible_at IS NULL OR s.next_eligible_at <= now()
        LIMIT 500
      `);
      for (const row of due as unknown as Array<{ username: string }>) {
        await tweetSyncQueue.add("sync", { username: row.username }, {
          jobId: `tw:${row.username}:${Math.floor(Date.now() / 60_000)}`, // dedupe within the minute
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        });
      }
      return { enqueued: (due as unknown as unknown[]).length };
    }
    case "warm-token-stats": {
      const n = await warmAllTokenStats(async (ca) => {
        await tokenStatsQueue.add("refresh", { ca }, {
          jobId: `ts:${ca}:${Math.floor(Date.now() / 30_000)}`,
          removeOnComplete: 500, removeOnFail: 500,
        });
      });
      return { enqueued: n };
    }
    case "refresh-trending": {
      await trendingJob();
      return { ok: true };
    }
  }
}, { connection });

// repeatable schedules (idempotent to re-register on boot)
async function registerSchedules() {
  await schedulerQueue.upsertJobScheduler("fanout-tweet-sync", { every: 60_000 }, { name: "fanout-tweet-sync" });
  await schedulerQueue.upsertJobScheduler("warm-token-stats", { every: 30_000 }, { name: "warm-token-stats" });
  await schedulerQueue.upsertJobScheduler("refresh-trending", { every: 300_000 }, { name: "refresh-trending" });
  console.log("schedules registered");
}

registerSchedules().catch((err) => {
  console.error("failed to register schedules", err);
  process.exit(1);
});

console.log("mention worker running");
