import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export * as schema from "./schema.js";
export { sql, eq, and, or, desc, asc, inArray, isNull, lt, lte, gt, gte, like, ilike, count } from "drizzle-orm";

export type Database = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false, // works behind transaction-mode poolers (pgbouncer/Railway)
  });
  return drizzle(client, { schema });
}
