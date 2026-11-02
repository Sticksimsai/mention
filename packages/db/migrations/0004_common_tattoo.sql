CREATE TABLE "community_stickers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"label" text NOT NULL,
	"glyph" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "is_example" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "quote_post_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "sticker_data" text;--> statement-breakpoint
ALTER TABLE "x_posts" ADD COLUMN "native_replies_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "community_stickers" ADD CONSTRAINT "community_stickers_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_stickers" ADD CONSTRAINT "community_stickers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stickers_community" ON "community_stickers" USING btree ("community_id");--> statement-breakpoint
UPDATE x_posts SET native_replies_count = (SELECT count(*) FROM x_post_replies WHERE x_post_id = x_posts.id AND hidden = false);
--> statement-breakpoint
INSERT INTO communities (id,name,ticker,ca,status,pfp_url,details,owner_id,website,is_example)
SELECT '568e5d5e-6c6a-4617-a557-c4dfc054134d','Solana Playground','SOL','So11111111111111111111111111111111111111112','approved','https://getmentions.xyz/brand/pairs/SOL.png','An example community for exploring Mentions. Live wrapped SOL market data, community posts and a SOL sticker pack. No token was launched here.','b4104538-3fc4-4e4c-b877-47590f603528','https://solana.com',true
WHERE EXISTS (SELECT 1 FROM users WHERE id='b4104538-3fc4-4e4c-b877-47590f603528')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO community_members (community_id,user_id)
SELECT id,owner_id FROM communities WHERE id='568e5d5e-6c6a-4617-a557-c4dfc054134d' ON CONFLICT DO NOTHING;
