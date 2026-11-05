// Worker entrypoint: BullMQ workers + the repeatable scheduler.
//
// Scaling model (the "no overload" design):
//  • Every unit of work is a small idempotent job with retries + backoff.
//  • Concurrency is capped per queue, so SocialData / X API / RPC are never
//    hammered no matter how many users exist.
//  • Run N instances of this service on Railway to scale horizontally —
//    BullMQ distributes jobs across them automatically.
import { Worker, Queue } from "bullmq";
import { QUEUES, type XWritebackJob, type TokenStatsJob } from "@mention/shared";
import { sql } from "@mention/db";
import { db, redis, queueConnection } from "./lib/context.js";
import { xWritebackJob } from "./jobs/xWriteback.js";
import { tokenStatsJob, warmAllTokenStats } from "./jobs/tokenStats.js";
import { trendingJob } from "./jobs/trending.js";

import { xProfileJob } from "./jobs/xProfile.js";

const connection = queueConnection;
async function recordFailure(queue:string){
 const event=JSON.stringify({queue,at:new Date().toISOString(),message:'Job failed; inspect Render logs for details'});
 try{await redis.lpush('ops:worker-failures',event);await redis.ltrim('ops:worker-failures',0,99);await redis.expire('ops:worker-failures',604800);}catch{}
}
function observe<T>(worker: Worker<T>) {
 worker.on("failed", (job,error)=>{console.warn("queue job failed",worker.name,job?.name,error.message.slice(0,180));void recordFailure(worker.name);});
 worker.on("error", error=>console.error("queue connection error",worker.name,error.message.slice(0,180)));
 return worker;
}
observe(new Worker<{userId:string}>(QUEUES.X_PROFILE, job => xProfileJob(job.data.userId), { connection, concurrency: 2, limiter: { max: 30, duration: 60_000 } }));

const writebackQueue = new Queue(QUEUES.X_WRITEBACK, { connection });
const tokenStatsQueue = new Queue(QUEUES.TOKEN_STATS, { connection });
const schedulerQueue = new Queue(QUEUES.SCHEDULER, { connection });

// ── workers ──

observe(new Worker<XWritebackJob>(QUEUES.X_WRITEBACK, async (job) => {
  const exhausted = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  return xWritebackJob(job.data.postId, exhausted);
}, {
  connection,
  concurrency: 2,
  limiter: { max: 30, duration: 60_000 }, // X API politeness
}));

observe(new Worker<TokenStatsJob>(QUEUES.TOKEN_STATS, async (job) => {
  return tokenStatsJob(job.data.ca);
}, {
  connection,
  concurrency: 4,
  limiter: { max: 120, duration: 60_000 },
}));

observe(new Worker(QUEUES.TRENDING, async () => trendingJob(), { connection }));

// ── scheduler: the heartbeat that replaces pg_cron ──
observe(new Worker(QUEUES.SCHEDULER, async (job) => {
  switch (job.name) {
    case "pending-writebacks": {
      const rows=await db.execute(sql`SELECT id FROM posts WHERE crosspost_status = 'pending' ORDER BY created_at LIMIT 100`);
      for(const row of rows as unknown as Array<{id:string}>)await writebackQueue.add("post",{postId:row.id},{jobId:`xw-${row.id}`,attempts:5,backoff:{type:"exponential",delay:10000},removeOnComplete:1000,removeOnFail:1000});
      return {enqueued:rows.length};
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
}, { connection }));

// repeatable schedules (idempotent to re-register on boot)
async function registerSchedules() {
  await schedulerQueue.upsertJobScheduler("pending-writebacks", {every:15_000},{name:"pending-writebacks"});
  await schedulerQueue.removeJobScheduler("community-search");
  await schedulerQueue.removeJobScheduler("fanout-tweet-sync");
  await schedulerQueue.upsertJobScheduler("warm-token-stats", { every: 30_000 }, { name: "warm-token-stats" });
  await schedulerQueue.upsertJobScheduler("refresh-trending", { every: 300_000 }, { name: "refresh-trending" });
  const heartbeat=()=>redis.set('ops:worker-heartbeat',new Date().toISOString(),'EX',90).catch(()=>{});
  await heartbeat();setInterval(()=>void heartbeat(),15000).unref();
  console.log("schedules registered");
}

registerSchedules().catch((err) => {
  console.error("failed to register schedules", err);
  process.exit(1);
});

console.log("mention worker running");
