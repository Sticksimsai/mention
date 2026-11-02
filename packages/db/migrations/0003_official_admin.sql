ALTER TABLE posts ALTER COLUMN community_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE posts ADD COLUMN global_pinned boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE x_posts ADD COLUMN global_pinned boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE x_posts ADD COLUMN official boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- User-authorized bootstrap bound to the existing account ID.
INSERT INTO staff_roles (user_id, role)
SELECT id, 'admin' FROM users
WHERE id = 'b4104538-3fc4-4e4c-b877-47590f603528' AND username = 'tradementions'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
--> statement-breakpoint
INSERT INTO mod_audit_log (actor_id, action, target_type, target_id, meta)
SELECT id, 'staff.bootstrap', 'user', id::text, '{"role":"admin","requestedBy":"site owner"}' FROM users
WHERE id = 'b4104538-3fc4-4e4c-b877-47590f603528' AND username = 'tradementions';
--> statement-breakpoint
UPDATE x_sync_state SET next_eligible_at = now();
