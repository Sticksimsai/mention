import type { MarketActivityView } from "@mention/shared";
import { battleChallenges, communities, and, or, eq, lt, desc, inArray, sql } from "@mention/db";
import { db } from "./db.js";
import { battleViews } from "../routes/battles.js";

/** Public activity is projected from durable challenge records, never sample data or user posts. */
export async function marketActivity(opts: { before: Date; communityId?: string; communityIds?: string[]; authorUsername?: string }): Promise<MarketActivityView[]> {
  if (opts.authorUsername || opts.communityIds?.length === 0) return [];
  const ids = opts.communityId ? [opts.communityId] : opts.communityIds;
  const visible = sql`exists (select 1 from ${communities} where ${communities.id} = ${battleChallenges.challengerId} and ${communities.status} = 'approved') and exists (select 1 from ${communities} where ${communities.id} = ${battleChallenges.opponentId} and ${communities.status} = 'approved')`;
  const scoped = ids ? or(inArray(battleChallenges.challengerId, ids), inArray(battleChallenges.opponentId, ids)) : undefined;
  const events = [
    { event: "proposed" as const, at: battleChallenges.createdAt, allowed: undefined },
    { event: "accepted" as const, at: battleChallenges.acceptedAt, allowed: undefined },
    { event: "cancelled" as const, at: battleChallenges.closedAt, allowed: eq(battleChallenges.status, "cancelled") },
    { event: "expired" as const, at: battleChallenges.expiresAt, allowed: and(inArray(battleChallenges.status, ["open", "expired"]), lt(battleChallenges.expiresAt, new Date())) },
  ];
  const batches = await Promise.all(events.map(async ({ event, at, allowed }) => {
    const rows = await db.select({ row: battleChallenges, at }).from(battleChallenges)
      .where(and(visible, scoped, allowed, lt(at, opts.before))).orderBy(desc(at)).limit(30);
    return rows.map(({ row, at }) => ({ row, at: at!, event }));
  }));
  const entries = batches.flat();
  const uniqueRows = [...new Map(entries.map(e => [e.row.id, e.row])).values()];
  const battles = new Map((await battleViews(uniqueRows)).map(b => [b.id, b]));
  return entries.map(e => ({ id: `m:${e.row.id}:${e.event}`, source: "market" as const, event: e.event, createdAt: e.at.toISOString(), battle: battles.get(e.row.id)! }))
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,30);
}
