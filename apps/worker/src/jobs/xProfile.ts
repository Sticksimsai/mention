import { users, eq } from "@mention/db";
import { xVerificationKey, parseXVerification } from "@mention/shared";
import { db, redis } from "../lib/context.js";
import { fetchUserProfile } from "../lib/socialdata.js";

export async function xProfileJob(userId: string) {
  const [user] = await db.select({ id: users.id, username: users.username, xUserId: users.xUserId }).from(users).where(eq(users.id, userId));
  if (!user) return;
  const key = xVerificationKey(user);
  try {
    // Single-user endpoint supplies the badge flag; bulk endpoints do not.
    const profile = await fetchUserProfile("profile-verification", user.xUserId || user.username);
    const verified = parseXVerification(profile, user);
    await redis.set(key, JSON.stringify({ status: verified ? "verified" : "unverified", checkedAt: new Date().toISOString() }), "EX", 900);
  } catch (error) {
    // Unknown is not "unverified", and a failed lookup must not grant a badge.
    await redis.set(key, JSON.stringify({ status: "unavailable", checkedAt: null }), "EX", 60);
    console.warn("X profile verification lookup unavailable:", error instanceof Error ? error.message.slice(0,160) : "Unknown provider failure");
  }
}
