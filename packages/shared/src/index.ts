import { z } from "zod";

// ────────────────────────── queues ──────────────────────────
// One queue per job family. Workers scale horizontally; every job is
// idempotent and retryable — this is what replaces v1's monolithic
// cron→edge-function sync.

export const QUEUES = {
  COMMUNITY_SEARCH: "community-search",
  /** Sync one user's recent tweets from SocialData (X→site mirror). */
  X_PROFILE: "x-profile",
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
  .partial().extend({ postCooldownSecs: z.number().int().min(0).max(86400).optional() });

export const OFFICIAL_ACCOUNT_ID = "b4104538-3fc4-4e4c-b877-47590f603528";

export const createPostSchema = z.object({
  communityId: z.string().uuid().optional(),
  content: z.string().max(4000).default(""),
  mediaUrl: z.string().url().refine(u => u.startsWith("https://"), "Use an HTTPS media URL").optional().nullable(),
  quotePostId: z.string().regex(/^[nx]:[0-9a-f-]{36}$/i).optional(),
  stickerId: z.string().max(100).optional(),
  stickerMediaId: z.string().uuid().optional(),
  /** mirror this post to the author's X account */
  crosspostToX: z.boolean().default(false),
}).refine(p=>Boolean(p.content.trim()||p.mediaUrl||p.stickerId||p.quotePostId), {message:"Add text, a GIF, or a sticker"});

export const createReplySchema = z.object({
  content: z.string().max(2000).default(""),
  mediaUrl: z.string().url().refine(u=>u.startsWith("https://"),"Use an HTTPS media URL").optional().nullable(),
  stickerId: z.string().max(100).optional(),
  stickerMediaId: z.string().uuid().optional(),
}).refine(p=>Boolean(p.content.trim()||p.mediaUrl||p.stickerId),{message:"Add text, an image, a GIF, or a sticker"});

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
  verified?: boolean;
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
  quotePostId?: string | null;
  quotedPost?: PostView | null;
  sticker?: StickerView | null;
  repostedBy?: AuthorView;
  repostedAt?: string;
  author: AuthorView;
  communityId: string;
  communityName?: string;
  communityTicker?: string;
  likes: number;
  reposts: number;
  replies: number;
  views: number;
  pinned: boolean;
  globalPinned?: boolean;
  official?: boolean;
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
  isExample?: boolean;
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
  mode: z.enum(["fair", "creator", "holders", "battle"]).default("fair"),
  devBuyBps: z.number().int().min(0).max(MAX_DEV_BUY_BPS).default(0),
}).superRefine((value, ctx) => {
  if (value.mode === "fair" && value.devBuyBps !== 0) ctx.addIssue({ code: "custom", path: ["devBuyBps"], message: "Fair starts have no developer buy" });
  if (value.quoteAsset !== "SOL" && value.mode !== "holders") ctx.addIssue({ code: "custom", path: ["mode"], message: "Token pairs currently require holder rewards; creator payouts support SOL only" });
});
export function devBuyUnits(supply: bigint, bps: number): bigint {
  if (supply <= 0n || !Number.isInteger(bps) || bps < 0 || bps > MAX_DEV_BUY_BPS) throw new Error("Developer buy must be between 0% and 2% of total supply");
  return supply * BigInt(bps) / 10000n;
}

export const BATTLE_DURATIONS = [600, 1800, 3600] as const;
export const BATTLE_RULES_VERSION = "draft-v1";
export function battleReserveSplit(purchased: bigint) {
  if (purchased < 0n) throw new Error("Purchased tokens cannot be negative");
  const reserve = purchased / 100n;
  return { reserve, developer: purchased - reserve };
}
export function tokenAmountUnits(amount: string): bigint {
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(amount)) throw new Error("Enter a token amount with at most 6 decimal places");
  const [whole, fraction = ""] = amount.split(".");
  const value = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (value <= 0n) throw new Error("Stake must be greater than zero");
  return value;
}
export function formatTokenUnits(units: string): string {
  const value = BigInt(units), whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return whole.toLocaleString("en-US") + (fraction ? `.${fraction}` : "");
}
export const battleChallengeSchema = z.object({
  id: z.string().uuid(), challengerId: z.string().uuid(), opponentId: z.string().uuid(),
  durationSecs: z.union([z.literal(600), z.literal(1800), z.literal(3600)]),
  challengerAmount: z.string().refine(v => { try { tokenAmountUnits(v); return true; } catch { return false; } }, "Invalid stake amount"),
  opponentAmount: z.string().refine(v => { try { tokenAmountUnits(v); return true; } catch { return false; } }, "Invalid stake amount"),
  acknowledgeDraft: z.literal(true),
}).refine(v => v.challengerId !== v.opponentId, "Choose two different communities");
export type BattleStatus = "open" | "accepted" | "cancelled" | "expired";
export interface BattleCoin { id: string; name: string; ticker: string; pfpUrl: string | null; ownerId: string }
export interface BattleView {
  id: string; challenger: BattleCoin; opponent: BattleCoin; durationSecs: number;
  challengerStakeUnits: string; opponentStakeUnits: string; status: BattleStatus;
  rulesVersion: string; createdAt: string; expiresAt: string; acceptedAt: string | null;
  escrowFunded: false;
}

/** System-generated public challenge updates; never attributed to a user's post. */
export interface MarketActivityView {
  id: string;
  source: "market";
  event: "proposed" | "accepted" | "cancelled" | "expired";
  createdAt: string;
  battle: BattleView;
}
export type FeedItem = PostView | MarketActivityView;

export interface XVerification { status: "verified" | "unverified" | "checking" | "unavailable"; checkedAt: string | null }
export const xVerificationKey = (u: {id:string;username:string;xUserId:string|null}) => `x-verification:${u.id}:${u.xUserId || u.username.toLowerCase()}`;
export function parseXVerification(profile: unknown, expected: {username:string;xUserId:string|null}): boolean {
  if (!profile || typeof profile !== "object") throw new Error("Missing X profile");
  const p = profile as Record<string, unknown>;
  if (typeof p.screen_name !== "string" || p.screen_name.toLowerCase() !== expected.username.toLowerCase()) throw new Error("X profile identity mismatch");
  if (expected.xUserId && p.id_str !== expected.xUserId) throw new Error("X account identity mismatch");
  const verified = typeof p.is_blue_verified === "boolean" ? p.is_blue_verified : p.verified;
  if (typeof verified !== "boolean") throw new Error("X verification unavailable");
  return verified;
}

export const stickerSchema = z.object({
  label: z.string().trim().min(1).max(20),
  glyph: z.enum(["spark", "diamond", "rocket", "heart", "bolt", "flag"]),
  color: z.enum(["#a3ed00", "#a78bfa", "#38bdf8", "#fb7185", "#fbbf24"]),
});
export interface StickerView { mediaUrl?:string; pfpUrl?:string; id: string; communityId: string; ticker: string; label: string; glyph: string; color: string }
export function starterStickers(c: {id:string;ticker:string;pfpUrl?:string}): StickerView[] {
  const labels=["gm", "still here", "building", "community first", "let’s go", "we’re early"];
  const glyphs=["spark", "diamond", "rocket", "heart", "bolt", "flag"];
  const colors=["#a3ed00", "#a78bfa", "#38bdf8", "#fb7185", "#fbbf24"];
  const seed=Array.from(c.id).reduce((n,ch)=>n+ch.charCodeAt(0),0);
  return labels.map((label,i)=>({id:`preset:${i}`,communityId:c.id,ticker:c.ticker,pfpUrl:c.pfpUrl,label,glyph:glyphs[i],color:colors[(seed+i)%colors.length]}));
}

export interface MarketChartView {
 stale?:boolean; tokenImageUrl?:string|null;
 candles:{time:number;open:number;high:number;low:number;close:number;volume:number}[];
 trades:{id:string;signature:string;maker:string;side:'buy'|'sell';amount:number|null;usd:number|null;price:number|null;time:string}[];
 holders:number|null;holdersUpdatedAt:string|null;pairAddress:string|null;interval:string;updatedAt:string;errors:string[];
}
