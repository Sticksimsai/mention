import { Redis } from "ioredis";
import { Queue } from "bullmq";
import { QUEUES } from "@mention/shared";
import { env } from "../env.js";

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

// Separate connection for BullMQ (it requires maxRetriesPerRequest: null too,
// but we keep cache traffic off the queue connection).
const queueConn = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const queues = {
  xWriteback: new Queue(QUEUES.X_WRITEBACK, { connection: queueConn }),
  tokenStats: new Queue(QUEUES.TOKEN_STATS, { connection: queueConn }),
  tweetSync: new Queue(QUEUES.TWEET_SYNC, { connection: queueConn }),
};

/** Read-through JSON cache. Serves stale value on fetch failure if present. */
export async function cached<T>(
  key: string,
  ttlSecs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = await redis.get(key).catch(() => null);
  if (hit) return JSON.parse(hit) as T;
  const staleKey = `stale:${key}`;
  try {
    const fresh = await fetcher();
    const json = JSON.stringify(fresh);
    await redis.set(key, json, "EX", ttlSecs).catch(() => {});
    await redis.set(staleKey, json, "EX", ttlSecs * 40).catch(() => {});
    return fresh;
  } catch (err) {
    const stale = await redis.get(staleKey).catch(() => null);
    if (stale) return JSON.parse(stale) as T;
    throw err;
  }
}
