CREATE TABLE "battle_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"challenger_id" uuid NOT NULL,
	"opponent_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"accepted_by" uuid,
	"challenger_stake_units" text NOT NULL,
	"opponent_stake_units" text NOT NULL,
	"duration_secs" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"rules_version" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "battle_distinct_coins" CHECK ("battle_challenges"."challenger_id" <> "battle_challenges"."opponent_id"),
	CONSTRAINT "battle_duration" CHECK ("battle_challenges"."duration_secs" IN (600,1800,3600)),
	CONSTRAINT "battle_draft_status" CHECK ("battle_challenges"."status" IN ('open','accepted','cancelled','expired')),
	CONSTRAINT "battle_positive_stakes" CHECK ("battle_challenges"."challenger_stake_units" ~ '^[1-9][0-9]{0,17}$' AND "battle_challenges"."opponent_stake_units" ~ '^[1-9][0-9]{0,17}$')
);
--> statement-breakpoint
ALTER TABLE "battle_challenges" ADD CONSTRAINT "battle_challenges_challenger_id_communities_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_challenges" ADD CONSTRAINT "battle_challenges_opponent_id_communities_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_challenges" ADD CONSTRAINT "battle_challenges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_challenges" ADD CONSTRAINT "battle_challenges_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_created" ON "battle_challenges" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "battle_challenger" ON "battle_challenges" USING btree ("challenger_id");--> statement-breakpoint
CREATE INDEX "battle_opponent" ON "battle_challenges" USING btree ("opponent_id");