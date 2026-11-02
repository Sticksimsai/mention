CREATE TABLE "x_write_attempts" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"x_tweet_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "x_write_attempts" ADD CONSTRAINT "x_write_attempts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;