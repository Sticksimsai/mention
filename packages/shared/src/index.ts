import { z } from "zod";

// ────────────────────────── queues ──────────────────────────
// One queue per job family. Workers scale horizontally; every job is
// idempotent and retryable — this is what replaces v1's monolithic
// cron→edge-function sync.

export const QUEUES = {
  /** Sync one user's recent tweets from SocialData (X→site mirror). */
  TWEET_SYNC: "tweet-sync",
  /** Post one Tribes post to the author's X account (site→X mirror). */
  X_WRITEBACK: "x-writeback",
  /** Refresh market stats for one token CA. */
  TOKEN_STATS: "token-stats",
  /** Mirror remote media to our storage/CDN. */
  MEDIA_MIRROR: "media-mirror",
  /** Recompute trending communities. */
  TRENDING: "trending",
  /** Fan-out scheduler: enqueues due tweet-sync jobs. */
  SCHEDULER: "scheduler",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface TweetSyncJob { username: string }
export interface XWritebackJob { postId: string }
export interface TokenStatsJob { ca: string }
export interface MediaMirrorJob { xPostId: string; remoteUrl: string }

// ────────────────────────── API payload schemas ──────────────────────────

export const createCommunitySchema = z.object({
  name: z.string().min(2).max(50),
  ticker: z.string().min(1).max(12).regex(/^[A-Za-z0-9]+$/),
  ca: z.string().min(32).max(44).regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "must be a Solana address"),
  details: z.string().max(2000).default(""),
  website: z.string().url().optional().nullable(),
  telegram: z.string().max(200).optional().nullable(),
  xCommunityUrl: z.string().url().optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
  pfpUrl: z.string().url().optional().nullable(),
});

export const updateCommunitySchema = createCommunitySchema
  .omit({ ticker: true, ca: true })
  .partial();

export const createPostSchema = z.object({
  communityId: z.string().uuid(),
  content: z.string().min(1).max(4000),
  mediaUrl: z.string().url().optional().nullable(),
  /** mirror this post to the author's X account */
  crosspostToX: z.boolean().default(false),
});

export const createReplySchema = z.object({
  content: z.string().min(1).max(2000),
});

export const updateProfileSchema = z.object({
  bio: z.string().max(500).optional(),
});

export const launchTokenSchema = z.object({
  name: z.string().min(2).max(50),
  ticker: z.string().min(1).max(12).regex(/^[A-Za-z0-9]+$/),
  description: z.string().max(2000).default(""),
  imageUrl: z.string().url(),
  website: z.string().url().optional().nullable(),
  telegram: z.string().max(200).optional().nullable(),
  /** launcher's wallet — receives their share of creator fees */
  creatorWallet: z.string().min(32).max(44),
  /** Legacy SOL amount is forbidden; new launches use capped devBuyBps. */
  devBuySol: z.literal(0).default(0),
});

export const tradeSchema = z.object({
  ca: z.string().min(32).max(44),
  side: z.enum(["buy", "sell"]),
  /** buy: SOL amount in; sell: token amount (or "100%" handled client-side) */
  amount: z.number().finite().positive().max(1_000_000_000),
  denominatedInSol: z.boolean(),
  slippageBps: z.number().int().min(10).max(5000).default(500),
  /** trader wallet pubkey — tx is built server-side, signed client-side */
  wallet: z.string().min(32).max(44),
});

// ────────────────────────── shared view types ──────────────────────────

export interface AuthorView {
  id?: string;
  username: string;
  name: string;
  pfpUrl: string;
}

export interface PostView {
  id: string;             // "n:<uuid>" native | "x:<uuid>" mirrored
  source: "native" | "x";
  content: string;
  mediaUrl: string | null;
  author: AuthorView;
  communityId: string;
  communityName?: string;
  communityTicker?: string;
  likes: number;
  reposts: number;
  replies: number;
  views: number;
  pinned: boolean;
  likedByMe?: boolean;
  repostedByMe?: boolean;
  tweetUrl?: string;      // mirrored posts, and native posts after write-back
  crosspostStatus?: "skipped" | "pending" | "posted" | "failed";
  createdAt: string;
}

export interface CommunityView {
  id: string;
  name: string;
  ticker: string;
  ca: string;
  bannerUrl: string;
  pfpUrl: string;
  details: string;
  owner: AuthorView;
  website: string | null;
  telegram: string | null;
  xCommunityUrl: string | null;
  membersCount: number;
  pinned: boolean;
  launchedViaTribes: boolean;
  isMember?: boolean;
  createdAt: string;
}

export interface TokenStats {
  ca: string;
  priceUsd: number | null;
  marketCap: number | null;
  change5m: number | null;
  change1h: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  pairAddress: string | null;
  source: "dexscreener" | "pumpfun" | null;
  fetchedAt: string;
}

export const TICKER_RE = /^\$([A-Z0-9]{1,12})\b/;


// Contract addresses from pump.fun/docs/custom-pairs, checked 2026-11-01.
export const LAUNCH_PAIRS = [
  { id: "SOL", symbol: "SOL", name: "Solana", category: "Crypto", mint: "So11111111111111111111111111111111111111112" },
  { id: "USDC", symbol: "USDC", name: "US dollar", category: "Stablecoin", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { id: "SPCX", symbol: "SPCX", name: "SpaceX", category: "Tokenized stock", mint: "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb" },
  { id: "QQQX", symbol: "QQQx", name: "Nasdaq 100", category: "Tokenized ETF", mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ" },
  { id: "SPYX", symbol: "SPYx", name: "S&P 500", category: "Tokenized ETF", mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W" },
  { id: "NVDAX", symbol: "NVDAx", name: "NVIDIA", category: "Tokenized stock", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh" },
  { id: "GLDX", symbol: "GLDx", name: "Gold", category: "Tokenized ETF", mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re" },
] as const;
export const MAX_DEV_BUY_BPS = 200;
export const launchOptionsSchema = z.object({
  quoteAsset: z.enum(["SOL", "USDC", "SPCX", "QQQX", "SPYX", "NVDAX", "GLDX"]).default("SOL"),
  mode: z.enum(["fair", "creator", "holders"]).default("fair"),
  devBuyBps: z.number().int().min(0).max(MAX_DEV_BUY_BPS).default(0),
}).superRefine((value, ctx) => {
  if (value.mode === "fair" && value.devBuyBps !== 0) ctx.addIssue({ code: "custom", path: ["devBuyBps"], message: "Fair starts have no developer buy" });
  if (value.quoteAsset !== "SOL" && value.mode !== "holders") ctx.addIssue({ code: "custom", path: ["mode"], message: "Token pairs currently require holder rewards; creator payouts support SOL only" });
});
export function devBuyUnits(supply: bigint, bps: number): bigint {
  if (supply <= 0n || !Number.isInteger(bps) || bps < 0 || bps > MAX_DEV_BUY_BPS) throw new Error("Developer buy must be between 0% and 2% of total supply");
  return supply * BigInt(bps) / 10000n;
}
