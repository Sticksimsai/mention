// Tribes v2 schema — ported + consolidated from the v1 Supabase migrations.
// Key changes from v1:
//  • users table keyed by uuid (v1 keyed profiles on username text)
//  • x_connections table for OAuth write-back tokens (new — site→X posting)
//  • communities carry launch metadata (creator wallet, fee split) for the
//    integrated pump.fun launch flow
//  • posts carry cross-post status so the worker can mirror site→X
//  • counts are still denormalized but only ever written inside DB
//    transactions in the API layer (v1 had drift from edge-function races)

import {
  pgTable, uuid, text, integer, bigint, boolean, timestamp,
  uniqueIndex, index, primaryKey, pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ────────────────────────── users & auth ──────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  privyUserId: text("privy_user_id").notNull().unique(),
  // lowercased X handle, without @
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  pfpUrl: text("pfp_url").notNull().default(""),
  bannerUrl: text("banner_url").notNull().default(""),
  bio: text("bio").notNull().default(""),
  xUserId: text("x_user_id"), // numeric X id, cached to avoid re-resolving
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// OAuth2 tokens for posting to the user's X account (site→X mirror).
// Tokens are AES-256-GCM encrypted at rest; never returned by the API.
export const xConnections = pgTable("x_connections", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  xUserId: text("x_user_id").notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  scopes: text("scopes").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // user toggle: mirror my Tribes posts to X
  writeEnabled: boolean("write_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffRoleEnum = pgEnum("staff_role", ["admin", "moderator"]);

export const staffRoles = pgTable("staff_roles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  role: staffRoleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bannedUsers = pgTable("banned_users", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull().default(""),
  bannedBy: uuid("banned_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ────────────────────────── communities (tribes) ──────────────────────────

export const communityStatusEnum = pgEnum("community_status", ["pending", "approved", "rejected"]);

export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  ticker: text("ticker").notNull(), // uppercased, no $
  ca: text("ca").notNull().unique(), // Solana mint address
  status: communityStatusEnum("status").notNull().default("approved"),
  bannerUrl: text("banner_url").notNull().default(""),
  pfpUrl: text("pfp_url").notNull().default(""),
  details: text("details").notNull().default(""),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  website: text("website"),
  telegram: text("telegram"),
  xCommunityUrl: text("x_community_url"),
  membersCount: integer("members_count").notNull().default(1),
  pinned: boolean("pinned").notNull().default(false),
  // per-tribe posting cooldown, seconds (owner-configurable)
  postCooldownSecs: integer("post_cooldown_secs").notNull().default(0),
  // launch metadata — set when the token was launched through Tribes
  launchedViaTribes: boolean("launched_via_tribes").notNull().default(false),
  creatorWallet: text("creator_wallet"),
  platformFeeShareBps: integer("platform_fee_share_bps"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_communities_ticker").on(t.ticker),
  index("idx_communities_created").on(t.createdAt.desc()),
]);

export const communityMembers = pgTable("community_members", {
  communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.communityId, t.userId] }),
  index("idx_members_user").on(t.userId),
]);

export const transferRequests = pgTable("transfer_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  fromUserId: uuid("from_user_id").notNull().references(() => users.id),
  toUserId: uuid("to_user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"), // pending | accepted | declined | cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ────────────────────────── native posts ──────────────────────────

export const xPostStatusEnum = pgEnum("x_post_status", [
  "skipped",   // user didn't opt in / no write connection
  "pending",   // queued for the write-back worker
  "posted",    // live on X — xTweetId set
  "failed",    // gave up after retries
]);

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  likesCount: integer("likes_count").notNull().default(0),
  repostsCount: integer("reposts_count").notNull().default(0),
  repliesCount: integer("replies_count").notNull().default(0),
  viewsCount: integer("views_count").notNull().default(0),
  pinned: boolean("pinned").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  // site→X mirror
  crosspostStatus: xPostStatusEnum("crosspost_status").notNull().default("skipped"),
  xTweetId: text("x_tweet_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_posts_community").on(t.communityId, t.createdAt.desc()),
  index("idx_posts_author").on(t.authorId, t.createdAt.desc()),
  index("idx_posts_created").on(t.createdAt.desc()),
]);

export const postLikes = pgTable("post_likes", {
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] })]);

export const postReposts = pgTable("post_reposts", {
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] })]);

export const postReplies = pgTable("post_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_replies_post").on(t.postId, t.createdAt)]);

export const follows = pgTable("follows", {
  followerId: uuid("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followeeId: uuid("followee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.followerId, t.followeeId] }),
  index("idx_follows_followee").on(t.followeeId),
]);

// ────────────────────────── mirrored X posts (X→site) ──────────────────────

export const xPosts = pgTable("x_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tweetId: text("tweet_id").notNull().unique(),
  authorUsername: text("author_username").notNull(), // lowercased handle
  authorName: text("author_name").notNull().default(""),
  authorPfpUrl: text("author_pfp_url").notNull().default(""),
  content: text("content").notNull().default(""),
  imageUrl: text("image_url"),
  tweetUrl: text("tweet_url").notNull(),
  tweetCreatedAt: timestamp("tweet_created_at", { withTimezone: true }).notNull(),
  likesCount: integer("likes_count").notNull().default(0),
  repostsCount: integer("reposts_count").notNull().default(0),
  repliesCount: integer("replies_count").notNull().default(0),
  viewsCount: bigint("views_count", { mode: "number" }).notNull().default(0),
  // native engagement on the mirrored tweet (likes made on Tribes itself)
  nativeLikesCount: integer("native_likes_count").notNull().default(0),
  nativeRepostsCount: integer("native_reposts_count").notNull().default(0),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_x_posts_author").on(t.authorUsername, t.tweetCreatedAt.desc()),
  index("idx_x_posts_created").on(t.tweetCreatedAt.desc()),
]);

export const xPostCommunities = pgTable("x_post_communities", {
  xPostId: uuid("x_post_id").notNull().references(() => xPosts.id, { onDelete: "cascade" }),
  communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  matchedOn: text("matched_on").notNull(), // "ticker" | "ca"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.xPostId, t.communityId] }),
  index("idx_xpc_community").on(t.communityId, t.createdAt.desc()),
]);

export const xPostLikes = pgTable("x_post_likes", {
  xPostId: uuid("x_post_id").notNull().references(() => xPosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.xPostId, t.userId] })]);

export const xPostReposts = pgTable("x_post_reposts", {
  xPostId: uuid("x_post_id").notNull().references(() => xPosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.xPostId, t.userId] })]);

export const xPostReplies = pgTable("x_post_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  xPostId: uuid("x_post_id").notNull().references(() => xPosts.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_x_replies_post").on(t.xPostId, t.createdAt)]);

// ────────────────────────── sync state & metering ──────────────────────────

// Per-handle incremental sync cursor with the dormancy tiers from v1.
export const xSyncState = pgTable("x_sync_state", {
  username: text("username").primaryKey(), // lowercased handle
  xUserId: text("x_user_id"),
  lastTweetId: text("last_tweet_id"),
  consecutiveEmptyRuns: integer("consecutive_empty_runs").notNull().default(0),
  nextEligibleAt: timestamp("next_eligible_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
});

// SocialData spend telemetry, keyed by (job, UTC day). 1 item ≈ $0.0002.
export const socialdataUsage = pgTable("socialdata_usage", {
  jobName: text("job_name").notNull(),
  day: text("day").notNull(), // YYYY-MM-DD UTC
  items: integer("items").notNull().default(0),
  requests: integer("requests").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.jobName, t.day] })]);

// ────────────────────────── moderation & site ──────────────────────────

export const modAuditLog = pgTable("mod_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  meta: text("meta").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_audit_created").on(t.createdAt.desc())]);

export const siteAnnouncements = pgTable("site_announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  message: text("message").notNull(),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postFlags = pgTable("post_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  postType: text("post_type").notNull(), // "native" | "x"
  postId: uuid("post_id").notNull(),
  reporterId: uuid("reporter_id").notNull().references(() => users.id),
  reason: text("reason").notNull().default(""),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
