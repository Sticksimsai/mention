// Privy access-token verification (ported from v1's _shared/privy.ts,
// Deno → Node). Verifies the ES256 JWT against Privy's JWKS, then resolves
// the linked X account via Privy's REST API (cached in Redis).
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../env.js";
import { redis } from "../lib/redis.js";

const JWKS = createRemoteJWKSet(
  new URL(`https://auth.privy.io/api/v1/apps/${env.PRIVY_APP_ID}/jwks.json`),
);

export interface PrivyIdentity {
  privyUserId: string;   // did:privy:...
  xUsername: string;     // lowercased, no @
  xUserId: string | null;
  displayName: string;
  pfpUrl: string;
}

export async function verifyPrivyToken(token: string): Promise<PrivyIdentity> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: "privy.io",
    audience: env.PRIVY_APP_ID,
  });
  const did = payload.sub as string;
  if (!did) throw new Error("no sub in Privy token");

  // Resolve linked X account (cached 10 min — handle changes are rare).
  const cacheKey = `privy:user:${did}`;
  const hit = await redis.get(cacheKey).catch(() => null);
  if (hit) return JSON.parse(hit) as PrivyIdentity;

  const res = await fetch(`https://auth.privy.io/api/v1/users/${did}`, {
    headers: {
      Authorization: "Basic " + Buffer.from(`${env.PRIVY_APP_ID}:${env.PRIVY_APP_SECRET}`).toString("base64"),
      "privy-app-id": env.PRIVY_APP_ID,
    },
  });
  if (!res.ok) throw new Error(`Privy user lookup failed: ${res.status}`);
  const user = (await res.json()) as any;

  const twitter = (user.linked_accounts ?? []).find((a: any) => a.type === "twitter_oauth");
  if (!twitter?.username) throw new Error("no linked X account");

  const identity: PrivyIdentity = {
    privyUserId: did,
    xUsername: String(twitter.username).toLowerCase(),
    xUserId: twitter.subject ?? null,
    displayName: twitter.name ?? twitter.username,
    pfpUrl: (twitter.profile_picture_url ?? "").replace("_normal.", "_400x400."),
  };
  await redis.set(cacheKey, JSON.stringify(identity), "EX", 600).catch(() => {});
  return identity;
}
