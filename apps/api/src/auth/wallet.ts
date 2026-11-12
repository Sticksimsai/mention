// Wallet sessions: sign in with a Solana wallet, no X account required.
//
// A wallet session proves control of one address by signing a one-time
// challenge. It unlocks launching only — posting, joining and community
// management still require an X sign-in through Privy (see middleware.ts).
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { PublicKey } from "@solana/web3.js";
import { env } from "../env.js";
import { redis } from "../lib/redis.js";

export const WALLET_ISSUER = "memes-wallet";
const SESSION_SECONDS = 12 * 60 * 60;
const CHALLENGE_SECONDS = 5 * 60;

// Derived so no extra secret has to be configured; rotating either source key ends wallet sessions.
const sessionKey = createHash("sha256")
  .update(`memes-wallet-session-v1:${env.TOKEN_ENCRYPTION_KEY || env.PRIVY_APP_SECRET}`)
  .digest();

/** Returns the canonical base58 address, or throws for anything that is not a 32-byte key. */
export function walletAddress(value: string): string {
  const key = new PublicKey(value);
  if (key.toBytes().length !== 32) throw new Error("invalid address");
  return key.toBase58();
}

export function challengeMessage(address: string, nonce: string, issuedAt: string): string {
  let host = "memes";
  try { host = new URL(env.WEB_ORIGIN).host; } catch { /* keep default */ }
  return [
    `${host} wants you to sign in with your Solana wallet:`,
    address,
    "",
    "Sign in to launch on Just Memes. This does not send a transaction or cost SOL.",
    "",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export async function createChallenge(address: string): Promise<string> {
  const message = challengeMessage(address, randomBytes(16).toString("hex"), new Date().toISOString());
  await redis.set(`wallet-challenge:${address}`, message, "EX", CHALLENGE_SECONDS);
  return message;
}

/** Ed25519 check using Node's crypto: a raw 32-byte key wrapped in its fixed SPKI prefix. */
export function verifyWalletSignature(address: string, message: string, signature: Uint8Array): boolean {
  if (signature.length !== 64) return false;
  try {
    const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(new PublicKey(address).toBytes())]);
    const key = createPublicKey({ key: spki, format: "der", type: "spki" });
    return verify(null, Buffer.from(message, "utf8"), key, Buffer.from(signature));
  } catch { return false; }
}

/** Consumes the stored challenge (single use) and checks the signature against it. */
export async function consumeChallenge(address: string, signature: Uint8Array): Promise<boolean> {
  const key = `wallet-challenge:${address}`;
  const message = await redis.get(key);
  if (!message) return false;
  await redis.del(key);
  return verifyWalletSignature(address, message, signature);
}

export async function issueWalletSession(address: string): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(WALLET_ISSUER)
    .setSubject(address)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(sessionKey);
  return { token, expiresAt: expiresAt * 1000 };
}

/** Returns the wallet address for a valid session token; throws otherwise. */
export async function verifyWalletSession(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, sessionKey, { issuer: WALLET_ISSUER, algorithms: ["HS256"] });
  if (!payload.sub) throw new Error("no subject");
  return walletAddress(payload.sub);
}
