import { Redis } from "ioredis";
import { createDb } from "@tribes/db";
import { env } from "../env.js";

export const db = createDb(env.DATABASE_URL);
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
