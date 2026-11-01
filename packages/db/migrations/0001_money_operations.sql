CREATE TABLE "creator_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt" text NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet" text NOT NULL,
	"gross_lamports" bigint NOT NULL,
	"creator_lamports" bigint NOT NULL,
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_earnings_positive" CHECK ("creator_earnings"."gross_lamports" > 0),
	CONSTRAINT "creator_earnings_share" CHECK ("creator_earnings"."creator_lamports" >= 0 AND "creator_earnings"."creator_lamports" <= "creator_earnings"."gross_lamports")
);
--> statement-breakpoint
CREATE TABLE "creator_receipts" (
	"signature" text PRIMARY KEY NOT NULL,
	"amount_lamports" bigint NOT NULL,
	"approved_by" uuid NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_receipts_positive" CHECK ("creator_receipts"."amount_lamports" > 0)
);
--> statement-breakpoint
CREATE TABLE "launch_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'preparing' NOT NULL,
	"request_hash" text NOT NULL,
	"details" text DEFAULT '{}' NOT NULL,
	"transaction" text,
	"signed_transaction_enc" text,
	"signature" text,
	"last_valid_block_height" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_operations_signature_unique" UNIQUE("signature")
);
--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_receipt_creator_receipts_signature_fk" FOREIGN KEY ("receipt") REFERENCES "public"."creator_receipts"("signature") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_payout_id_money_operations_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."money_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_receipts" ADD CONSTRAINT "creator_receipts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launch_images" ADD CONSTRAINT "launch_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_operations" ADD CONSTRAINT "money_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_receipt_community" ON "creator_earnings" USING btree ("receipt","community_id");--> statement-breakpoint
CREATE INDEX "money_operations_user" ON "money_operations" USING btree ("user_id","created_at");