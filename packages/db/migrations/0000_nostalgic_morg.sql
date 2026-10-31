CREATE TYPE "public"."community_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('admin', 'moderator');--> statement-breakpoint
CREATE TYPE "public"."x_post_status" AS ENUM('skipped', 'pending', 'posted', 'failed');--> statement-breakpoint
CREATE TABLE "banned_users" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"banned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"ca" text NOT NULL,
	"status" "community_status" DEFAULT 'approved' NOT NULL,
	"banner_url" text DEFAULT '' NOT NULL,
	"pfp_url" text DEFAULT '' NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"owner_id" uuid NOT NULL,
	"website" text,
	"telegram" text,
	"x_community_url" text,
	"members_count" integer DEFAULT 1 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"post_cooldown_secs" integer DEFAULT 0 NOT NULL,
	"launched_via_tribes" boolean DEFAULT false NOT NULL,
	"creator_wallet" text,
	"platform_fee_share_bps" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communities_name_unique" UNIQUE("name"),
	CONSTRAINT "communities_ca_unique" UNIQUE("ca")
);
--> statement-breakpoint
CREATE TABLE "community_members" (
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_members_community_id_user_id_pk" PRIMARY KEY("community_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
CREATE TABLE "mod_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"meta" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_type" text NOT NULL,
	"post_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "post_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_reposts" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_reposts_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"media_url" text,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"reposts_count" integer DEFAULT 0 NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"crosspost_status" "x_post_status" DEFAULT 'skipped' NOT NULL,
	"x_tweet_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "socialdata_usage" (
	"job_name" text NOT NULL,
	"day" text NOT NULL,
	"items" integer DEFAULT 0 NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "socialdata_usage_job_name_day_pk" PRIMARY KEY("job_name","day")
);
--> statement-breakpoint
CREATE TABLE "staff_roles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "staff_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"privy_user_id" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"pfp_url" text DEFAULT '' NOT NULL,
	"banner_url" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"x_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_privy_user_id_unique" UNIQUE("privy_user_id"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "x_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"x_user_id" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"scopes" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"write_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_post_communities" (
	"x_post_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"matched_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x_post_communities_x_post_id_community_id_pk" PRIMARY KEY("x_post_id","community_id")
);
--> statement-breakpoint
CREATE TABLE "x_post_likes" (
	"x_post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x_post_likes_x_post_id_user_id_pk" PRIMARY KEY("x_post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "x_post_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"x_post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_post_reposts" (
	"x_post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x_post_reposts_x_post_id_user_id_pk" PRIMARY KEY("x_post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "x_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tweet_id" text NOT NULL,
	"author_username" text NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"author_pfp_url" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"image_url" text,
	"tweet_url" text NOT NULL,
	"tweet_created_at" timestamp with time zone NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"reposts_count" integer DEFAULT 0 NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"views_count" bigint DEFAULT 0 NOT NULL,
	"native_likes_count" integer DEFAULT 0 NOT NULL,
	"native_reposts_count" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "x_posts_tweet_id_unique" UNIQUE("tweet_id")
);
--> statement-breakpoint
CREATE TABLE "x_sync_state" (
	"username" text PRIMARY KEY NOT NULL,
	"x_user_id" text,
	"last_tweet_id" text,
	"consecutive_empty_runs" integer DEFAULT 0 NOT NULL,
	"next_eligible_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "banned_users" ADD CONSTRAINT "banned_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banned_users" ADD CONSTRAINT "banned_users_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_audit_log" ADD CONSTRAINT "mod_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_flags" ADD CONSTRAINT "post_flags_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_replies" ADD CONSTRAINT "post_replies_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_replies" ADD CONSTRAINT "post_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reposts" ADD CONSTRAINT "post_reposts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reposts" ADD CONSTRAINT "post_reposts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_announcements" ADD CONSTRAINT "site_announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_connections" ADD CONSTRAINT "x_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_post_communities" ADD CONSTRAINT "x_post_communities_x_post_id_x_posts_id_fk" FOREIGN KEY ("x_post_id") REFERENCES "public"."x_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_post_communities" ADD CONSTRAINT "x_post_communities_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_post_likes" ADD CONSTRAINT "x_post_likes_x_post_id_x_posts_id_fk" FOREIGN KEY ("x_post_id") REFERENCES "public"."x_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_post_likes" ADD CONSTRAINT "x_post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_post_replies" ADD CONSTRAINT "x_post_replies_x_post_id_x_posts_id_fk" FOREIGN KEY ("x_post_id") REFERENCES "public"."x_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_post_replies" ADD CONSTRAINT "x_post_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_post_reposts" ADD CONSTRAINT "x_post_reposts_x_post_id_x_posts_id_fk" FOREIGN KEY ("x_post_id") REFERENCES "public"."x_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x_post_reposts" ADD CONSTRAINT "x_post_reposts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_communities_ticker" ON "communities" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "idx_communities_created" ON "communities" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_members_user" ON "community_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_follows_followee" ON "follows" USING btree ("followee_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "mod_audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_replies_post" ON "post_replies" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_posts_community" ON "posts" USING btree ("community_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_posts_author" ON "posts" USING btree ("author_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_posts_created" ON "posts" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_xpc_community" ON "x_post_communities" USING btree ("community_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_x_replies_post" ON "x_post_replies" USING btree ("x_post_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_x_posts_author" ON "x_posts" USING btree ("author_username","tweet_created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_x_posts_created" ON "x_posts" USING btree ("tweet_created_at" DESC NULLS LAST);