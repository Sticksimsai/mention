CREATE TABLE "market_devnet_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"details" text NOT NULL,
	"transaction" text NOT NULL,
	"signed_transaction" text,
	"signature" text,
	"last_valid_block_height" integer NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_devnet_links" (
	"community_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"details" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_devnet_rounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"terms" text NOT NULL,
	"chain_state" text DEFAULT 'null' NOT NULL,
	"observation" text,
	"error" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_devnet_actions" ADD CONSTRAINT "market_devnet_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_devnet_links" ADD CONSTRAINT "market_devnet_links_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_devnet_links" ADD CONSTRAINT "market_devnet_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_devnet_rounds" ADD CONSTRAINT "market_devnet_rounds_id_battle_challenges_id_fk" FOREIGN KEY ("id") REFERENCES "public"."battle_challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_devnet_action_scope" ON "market_devnet_actions" USING btree ("scope","created_at");