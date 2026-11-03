CREATE TABLE "community_url_reservations" (
	"slug" text PRIMARY KEY NOT NULL,
	"ca" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_url_reservations_ca_unique" UNIQUE("ca"),
	CONSTRAINT "community_url_reservations_operation_id_unique" UNIQUE("operation_id")
);
--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "twitter_url" text;--> statement-breakpoint
ALTER TABLE "community_url_reservations" ADD CONSTRAINT "community_url_reservations_operation_id_money_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."money_operations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION mentions_community_slug_base(p_name text, p_ticker text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE base text;
BEGIN
  base := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  IF base = '' THEN base := trim(both '-' from regexp_replace(lower(p_ticker), '[^a-z0-9]+', '-', 'g')); END IF;
  IF base = '' THEN base := 'community'; END IF;
  base := rtrim(left(base, 72), '-');
  IF base ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN base := 'community-' || base; END IF;
  RETURN base;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION mentions_reserve_community_slug(p_operation uuid, p_name text, p_ticker text, p_ca text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE base text; candidate text; suffix integer := 1;
BEGIN
  PERFORM pg_advisory_xact_lock(1835363956, 1936487783);
  SELECT slug INTO candidate FROM community_url_reservations WHERE operation_id = p_operation AND ca = p_ca;
  IF candidate IS NOT NULL THEN RETURN candidate; END IF;
  base := mentions_community_slug_base(p_name, p_ticker);
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM communities WHERE slug = candidate) OR EXISTS (SELECT 1 FROM community_url_reservations WHERE slug = candidate) LOOP
    suffix := suffix + 1; candidate := base || '-' || suffix;
  END LOOP;
  INSERT INTO community_url_reservations(slug, ca, operation_id) VALUES(candidate, p_ca, p_operation);
  RETURN candidate;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentions_assign_community_slug() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base text; candidate text; suffix integer := 1;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.slug IS NOT NULL AND OLD.slug <> '' THEN NEW.slug := OLD.slug; RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(1835363956, 1936487783);
  SELECT slug INTO candidate FROM community_url_reservations WHERE ca = NEW.ca;
  IF candidate IS NOT NULL THEN NEW.slug := candidate; RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM community_url_reservations r JOIN money_operations o ON o.id = r.operation_id WHERE o.details::jsonb->>'name' = NEW.name) THEN
    RAISE EXCEPTION 'Community name reserved for a launch' USING ERRCODE = '23505';
  END IF;
  base := mentions_community_slug_base(NEW.name, NEW.ticker); candidate := base;
  WHILE EXISTS (SELECT 1 FROM communities WHERE slug = candidate AND id <> NEW.id) OR EXISTS (SELECT 1 FROM community_url_reservations WHERE slug = candidate) LOOP
    suffix := suffix + 1; candidate := base || '-' || suffix;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$;
