-- One-time owner-requested role grant to the existing linked X identity.
WITH granted AS (
  INSERT INTO staff_roles (user_id, role)
  SELECT id, 'admin' FROM users
  WHERE id = 'e4109d51-7de6-4562-ab67-82b371204797'
    AND x_user_id = '2118426029609930752'
    AND username = 'onlycults_fun'
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role
    WHERE staff_roles.role <> EXCLUDED.role
  RETURNING user_id
)
INSERT INTO mod_audit_log (actor_id, action, target_type, target_id, meta)
SELECT user_id, 'staff.bootstrap', 'user', user_id::text,
       '{"role":"admin","requestedBy":"site owner","source":"migration_0013"}'
FROM granted;
