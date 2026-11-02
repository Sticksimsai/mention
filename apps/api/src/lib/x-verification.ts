import { redis, queues } from "./redis.js";
import { xVerificationKey, type XVerification } from "@mention/shared";

export async function xVerification(user: { id: string; username: string; xUserId: string | null }, refresh = false): Promise<XVerification> {
  const key = xVerificationKey(user);
  const raw = await redis.get(key).catch(() => null);
  if (raw && !refresh) return JSON.parse(raw) as XVerification;
  // One lookup per account per minute; cached answers expire after 15 minutes.
  const lock = await redis.set(`${key}:queued`, "1", "EX", 60, "NX").catch(() => null);
  if (lock) {
    try {
      await redis.set(key, JSON.stringify({ status: "checking", checkedAt: null }), "EX", 60);
      await queues.xProfile.add("verify", { userId: user.id }, { attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
    } catch { return { status: "unavailable", checkedAt: null }; }
  }
  return raw && !lock ? JSON.parse(raw) as XVerification : { status: "checking", checkedAt: null };
}
