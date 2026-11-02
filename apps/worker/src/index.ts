// Worker entrypoint: BullMQ workers + the repeatable scheduler.
//
// Scaling model (the "no overload" design):
//  • Every unit of work is a small idempotent job with retries + backoff.
//  • Concurrency is capped per queue, so SocialData / X API / RPC are never
//    hammered no matter how many users exist.
//  • Run N instances of this service on Railway to scale horizontally —
//    BullMQ distributes jobs across them automatically.
import { Worker, Queue } from "bullmq";
import { OFFICIAL_ACCOUNT_ID, QUEUES, type TweetSyncJob, type XWritebackJob, type TokenStatsJob } from "@mention/shared";
import { users, xSyncState, communityMembers, eq, sql } from "@mention/db";
import { db, queueConnection } from "./lib/context.js";
import { tweetSyncJob } from "./jobs/tweetSync.js";
import { xWritebackJob } from "./jobs/xWriteback.js";
import { tokenStatsJob, warmAllTokenStats } from "./jobs/tokenStats.js";
import { trendingJob } from "./jobs/trending.js";

import { communitySearchJob } from "./jobs/communitySearch.js";
import { xProfileJob } from "./jobs/xProfile.js";

const connection = queueConnection;
function observe<T>(worker: Worker<T>) {
 worker.on("failed", (job,error)=>console.warn("queue job failed",worker.name,job?.name,error.message.slice(0,180)));
 worker.on("error", error=>console.error("queue connection error",worker.name,error.message.slice(0,180)));
 return worker;
}
new Worker<{userId:string}>(QUEUES.X_PROFILE, job => xProfileJob(job.data.userId), { connection, concurrency: 2, limiter: { max: 30, duration: 60_000 } });

const searchQueue = new Queue(QUEUES.COMMUNITY_SEARCH, { connection });
observe(new Worker<{communityId:string}>(QUEUES.COMMUNITY_SEARCH,job=>communitySearchJob(job.data.communityId),{connection,concurrency:2,limiter:{max:30,duration:60_000}}));

const tweetSyncQueue = new Queue(QUEUES.TWEET_SYNC, { connection });
const writebackQueue = new Queue(QUEUES.X_WRITEBACK, { connection });
const tokenStatsQueue = new Queue(QUEUES.TOKEN_STATS, { connection });
const schedulerQueue = new Queue(QUEUES.SCHEDULER, { connection });

// ── workers ──

observe(new Worker<TweetSyncJob>(QUEUES.TWEET_SYNC, async (job) => {
  return tweetSyncJob(job.data.username);
}, {
  connection,
  concurrency: 4,                       // parallel SocialData fetches per instance
  limiter: { max: 60, duration: 60_000 }, // global-ish politeness cap
}));

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
observe(new Worker(QUEUES.SCHEDULER, async (job) => {
  switch (job.name) {
    case "pending-writebacks": {
      const rows=await db.execute(sql`SELECT id FROM posts WHERE crosspost_status = 'pending' ORDER BY created_at LIMIT 100`);
      for(const row of rows as unknown as Array<{id:string}>)await writebackQueue.add("post",{postId:row.id},{jobId:`xw-${row.id}`,attempts:5,backoff:{type:"exponential",delay:10000},removeOnComplete:1000,removeOnFail:1000});
      return {enqueued:rows.length};
    }
    case "community-search": {
      const rows=await db.execute(sql`SELECT id FROM communities WHERE status = 'approved' AND is_example = false`);
      for(const row of rows as unknown as Array<{id:string}>)await searchQueue.add("search",{communityId:row.id},{jobId:`search-${row.id}`,attempts:3,backoff:{type:"exponential",delay:10000},removeOnComplete:true,removeOnFail:true});
      return {enqueued:rows.length};
    }
    case "fanout-tweet-sync": {
      // every member of any tribe gets mirrored; due = past nextEligibleAt
      const due = await db.execute(sql`
        SELECT DISTINCT u.username
        FROM users u
        LEFT JOIN community_members cm ON cm.user_id = u.id
        LEFT JOIN x_sync_state s ON s.username = u.username
        WHERE (cm.user_id IS NOT NULL OR u.id = ${OFFICIAL_ACCOUNT_ID})
          AND (s.next_eligible_at IS NULL OR s.next_eligible_at <= now())
        LIMIT 500
      `);
      for (const row of due as unknown as Array<{ username: string }>) {
        await tweetSyncQueue.add("sync", { username: row.username }, {
          jobId: `tw-${row.username}-${Math.floor(Date.now() / 60_000)}`, // dedupe within the minute
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
          jobId: `ts-${ca}-${Math.floor(Date.now() / 30_000)}`,
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
}, { connection })).on("completed",job=>{if(job.name==="fanout-tweet-sync"||job.name==="community-search")console.info("sync scheduler completed",job.name,job.returnvalue);});

// repeatable schedules (idempotent to re-register on boot)
async function registerSchedules() {
  await schedulerQueue.upsertJobScheduler("pending-writebacks", {every:15_000},{name:"pending-writebacks"});
  await schedulerQueue.upsertJobScheduler("community-search", {every:60_000},{name:"community-search"});
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
