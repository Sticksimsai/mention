ALTER TABLE "communities" ADD COLUMN "slug" text;
--> statement-breakpoint
-- Allocate readable addresses once, across every community creation path.
-- Serialize allocation so simultaneous names that normalize alike cannot collide.
CREATE FUNCTION mentions_assign_community_slug() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  suffix integer := 1;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.slug IS NOT NULL AND OLD.slug <> '' THEN
    NEW.slug := OLD.slug;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(1835363956, 1936487783);
  base := trim(both '-' from regexp_replace(lower(NEW.name), '[^a-z0-9]+', '-', 'g'));
  IF base = '' THEN
    base := trim(both '-' from regexp_replace(lower(NEW.ticker), '[^a-z0-9]+', '-', 'g'));
  END IF;
  IF base = '' THEN base := 'community'; END IF;
  base := rtrim(left(base, 72), '-');
  -- UUID-shaped names must not shadow legacy ID routes.
  IF base ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    base := 'community-' || base;
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM communities WHERE slug = candidate AND id <> NEW.id) LOOP
    suffix := suffix + 1;
    candidate := base || '-' || suffix;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER communities_assign_slug BEFORE INSERT OR UPDATE ON communities
FOR EACH ROW EXECUTE FUNCTION mentions_assign_community_slug();
--> statement-breakpoint
-- Backfill oldest first so collisions get deterministic suffixes.
DO $$
DECLARE community_id uuid;
BEGIN
  FOR community_id IN SELECT id FROM communities ORDER BY created_at, id LOOP
    UPDATE communities SET slug = '' WHERE id = community_id;
  END LOOP;
END;
$$;
--> statement-breakpoint
ALTER TABLE "communities" ALTER COLUMN "slug" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "communities" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_slug_unique" UNIQUE("slug");
