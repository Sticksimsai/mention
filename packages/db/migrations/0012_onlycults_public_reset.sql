-- Archive the public content present at the requested reset. Preserve subsequent launches and financial records.
UPDATE communities SET status = 'rejected' WHERE status = 'approved' AND created_at <= TIMESTAMPTZ '2026-11-05 19:16:06.128380+00';
--> statement-breakpoint
UPDATE posts SET hidden = true WHERE hidden = false AND created_at <= TIMESTAMPTZ '2026-11-05 19:16:06.128380+00';
--> statement-breakpoint
UPDATE x_posts SET hidden = true WHERE hidden = false AND created_at <= TIMESTAMPTZ '2026-11-05 19:16:06.128380+00';
--> statement-breakpoint
UPDATE post_replies SET hidden = true WHERE hidden = false AND created_at <= TIMESTAMPTZ '2026-11-05 19:16:06.128380+00';
--> statement-breakpoint
UPDATE x_post_replies SET hidden = true WHERE hidden = false AND created_at <= TIMESTAMPTZ '2026-11-05 19:16:06.128380+00';
