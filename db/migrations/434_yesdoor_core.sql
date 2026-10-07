-- 434_yesdoor_core.sql — Yesdoor MVP, part 1 of 3: people, accounts, consent,
-- screening, buildings, rules, listings, state rules, events and outbox.
--
-- Yesdoor is a separate app built inside this repo for now and split into its
-- own repo and database later (docs/specs/yesdoor-mvp-build-spec.md §0, owner
-- decision 2026-10-07). So:
--   * every table starts with yd_
--   * the only foreign key into a Fundhub table is orgs(id); Yesdoor has its own
--     org row (orgs.slug = 'yesdoor', seeded in db/seed/296)
--   * every foreign key between yd_ tables is COMPOSITE and carries org_id, so a
--     row in one company's book can never point at another company's row. That
--     is the isolation guarantee, held by the database and not by every query
--     remembering its WHERE clause (the queries still filter org_id too)
--
-- Shape follows 432_ops_suggestions.sql: text enums with named CHECKs, row
-- security ENABLED + FORCED with a guarded <table>_app_all policy, the
-- set_updated_at() trigger, DELETE/TRUNCATE revoked from fundhub_app. All of
-- that is applied by yd_harden() below so no table can forget one of them.
-- Owner-set 2026-10-07: keep every record forever, so the revoke applies to
-- every yd_ table, and consent / screening / event rows also carry the
-- fundhub_no_delete() trigger (045) that stops a superuser's DELETE too.
--
-- Money is bigint *_cents. NULL means unknown, never 0 (CLAUDE.md §12).
-- Nothing here transmits. Sandbox providers only (spec §7).
-- 435 adds the pipeline (matches, applications, tours, agreements, disputes);
-- 436 adds the money tables.

-- ---------------------------------------------------------------------------
-- A. Helpers
-- ---------------------------------------------------------------------------

-- yd_harden(table, no_delete) — row security, policy, updated_at trigger,
-- privileges, and (optionally) the no-delete trigger, in one place. Idempotent.
CREATE OR REPLACE FUNCTION public.yd_harden(p_table text, p_no_delete boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  pol text := p_table || '_app_all';
  upd text := 'trg_' || p_table || '_updated_at';
  nod text := 'trg_' || p_table || '_no_delete';
  rel regclass := format('public.%I', p_table)::regclass;
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', p_table);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = p_table AND policyname = pol
  ) THEN
    EXECUTE format('CREATE POLICY %I ON public.%I USING (true) WITH CHECK (true)', pol, p_table);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = upd AND tgrelid = rel) THEN
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      upd, p_table);
  END IF;

  IF p_no_delete AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = nod AND tgrelid = rel) THEN
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION fundhub_no_delete()',
      nod, p_table);
  END IF;

  -- 104's default privileges hand DELETE to every new table; the REVOKE is what
  -- makes "keep it forever" true for the app role.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM fundhub_app', p_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO fundhub_app', p_table);
  END IF;
END $$;

COMMENT ON FUNCTION public.yd_harden(text, boolean) IS
  'Yesdoor (434): applies RLS enable+force, the <t>_app_all policy, the set_updated_at trigger, REVOKE DELETE/TRUNCATE + GRANT S/I/U for fundhub_app, and optionally the fundhub_no_delete() trigger.';

-- yd_no_update() — rows that are facts, not state. Consent wording, raw bureau
-- payloads and timeline events are written once.
CREATE OR REPLACE FUNCTION public.yd_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are written once and never changed (Yesdoor keeps every record as it was)', TG_TABLE_NAME
    USING ERRCODE = '23514';
END $$ LANGUAGE plpgsql;

-- yd_valid_criminal_policy(jsonb) — {category: years-ago number | "never" | "case_by_case"}
CREATE OR REPLACE FUNCTION public.yd_valid_criminal_policy(p jsonb) RETURNS boolean AS $$
  SELECT jsonb_typeof(p) = 'object'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(p) e
        WHERE NOT (
          (jsonb_typeof(e.value) = 'number' AND (e.value)::text::numeric >= 0)
          OR (jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') IN ('never', 'case_by_case'))
        )
     );
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- B. Supply: companies and buildings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yd_companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id),

  name        text NOT NULL,
  tier        smallint NOT NULL DEFAULT 3,
  hq_state    text,
  software    text NOT NULL DEFAULT 'none',
  status      text NOT NULL DEFAULT 'target',
  is_sample   boolean NOT NULL DEFAULT false,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_companies_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_companies_name_ck CHECK (char_length(btrim(name)) >= 1),
  CONSTRAINT yd_companies_tier_ck CHECK (tier BETWEEN 1 AND 4),
  CONSTRAINT yd_companies_state_ck CHECK (hq_state IS NULL OR hq_state ~ '^[A-Z]{2}$'),
  CONSTRAINT yd_companies_software_ck
    CHECK (software IN ('yardi', 'realpage', 'entrata', 'other', 'none')),
  CONSTRAINT yd_companies_status_ck
    CHECK (status IN ('target', 'pitched', 'agreement_sent', 'signed', 'live', 'paused'))
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_companies_name_uniq ON public.yd_companies (org_id, lower(name));
SELECT public.yd_harden('yd_companies');

CREATE TABLE IF NOT EXISTS public.yd_buildings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.orgs(id),

  company_id          uuid,
  name                text NOT NULL,
  address             text,
  city                text,
  state               text,
  zip                 text,
  lat                 numeric(9,6),
  lng                 numeric(9,6),
  units_count         integer,

  software            text NOT NULL DEFAULT 'none',
  connection          text NOT NULL DEFAULT 'manual',
  leasing_email       text,
  tour_hours          jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- NULL = we do not know the building's application fee. Never 0.
  app_fee_cents       bigint,
  app_fee_waived      boolean NOT NULL DEFAULT false,
  second_chance       boolean NOT NULL DEFAULT false,
  -- Some operators ban renter gifts and move-in rewards; off until a building says yes.
  allows_renter_incentive boolean NOT NULL DEFAULT false,

  -- The building sets the fee (spec §12). Default ask: 100% of first month.
  fee_kind            text NOT NULL DEFAULT 'percent_first_month',
  fee_percent         numeric(6,2) DEFAULT 100,
  fee_flat_cents      bigint,
  refund_days         integer NOT NULL DEFAULT 60,
  payment_terms_days  integer NOT NULL DEFAULT 30,

  status              text NOT NULL DEFAULT 'target',
  mismatch_count      integer NOT NULL DEFAULT 0,
  is_sample           boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_buildings_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_buildings_company_fk
    FOREIGN KEY (company_id, org_id) REFERENCES public.yd_companies (id, org_id),
  CONSTRAINT yd_buildings_name_ck CHECK (char_length(btrim(name)) >= 1),
  CONSTRAINT yd_buildings_state_ck CHECK (state IS NULL OR state ~ '^[A-Z]{2}$'),
  CONSTRAINT yd_buildings_lat_ck CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  CONSTRAINT yd_buildings_lng_ck CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  CONSTRAINT yd_buildings_units_ck CHECK (units_count IS NULL OR units_count > 0),
  CONSTRAINT yd_buildings_software_ck
    CHECK (software IN ('yardi', 'realpage', 'entrata', 'other', 'none')),
  CONSTRAINT yd_buildings_connection_ck
    CHECK (connection IN ('manual', 'csv', 'feed', 'entrata_api')),
  CONSTRAINT yd_buildings_tour_hours_ck CHECK (jsonb_typeof(tour_hours) = 'object'),
  CONSTRAINT yd_buildings_app_fee_ck CHECK (app_fee_cents IS NULL OR app_fee_cents >= 0),
  CONSTRAINT yd_buildings_fee_kind_ck CHECK (fee_kind IN ('percent_first_month', 'flat')),
  CONSTRAINT yd_buildings_fee_terms_ck CHECK (
    (fee_kind = 'percent_first_month' AND fee_percent IS NOT NULL AND fee_percent >= 0)
    OR (fee_kind = 'flat' AND fee_flat_cents IS NOT NULL AND fee_flat_cents >= 0)
  ),
  CONSTRAINT yd_buildings_refund_days_ck CHECK (refund_days >= 0),
  CONSTRAINT yd_buildings_terms_days_ck CHECK (payment_terms_days >= 0),
  CONSTRAINT yd_buildings_status_ck
    CHECK (status IN ('target', 'pitched', 'agreement_sent', 'signed', 'live', 'paused', 'churned')),
  CONSTRAINT yd_buildings_mismatch_ck CHECK (mismatch_count >= 0)
);
CREATE INDEX IF NOT EXISTS yd_buildings_org_status_idx ON public.yd_buildings (org_id, status);
CREATE INDEX IF NOT EXISTS yd_buildings_company_idx ON public.yd_buildings (company_id);
CREATE INDEX IF NOT EXISTS yd_buildings_city_idx ON public.yd_buildings (org_id, lower(city));
SELECT public.yd_harden('yd_buildings');

-- ---------------------------------------------------------------------------
-- C. Brokers and renters
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yd_brokers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES public.orgs(id),

  name                 text NOT NULL,
  company              text,
  email                text NOT NULL,

  licence_state        text,
  licence_number       text,
  licence_verified_at  timestamptz,

  plan                 text NOT NULL DEFAULT 'split',
  split_percent        numeric(5,2) NOT NULL DEFAULT 25,
  -- Filled by trigger with YD- + 6 digits when left NULL; unique per org.
  tracking_code        text NOT NULL,
  status               text NOT NULL DEFAULT 'applied',

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_brokers_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_brokers_name_ck CHECK (char_length(btrim(name)) >= 1),
  CONSTRAINT yd_brokers_email_ck CHECK (email = lower(btrim(email)) AND email <> ''),
  CONSTRAINT yd_brokers_licence_state_ck
    CHECK (licence_state IS NULL OR licence_state IN ('AZ', 'CA', 'FL')),
  CONSTRAINT yd_brokers_plan_ck CHECK (plan IN ('software', 'split')),
  CONSTRAINT yd_brokers_split_ck CHECK (split_percent >= 0 AND split_percent <= 100),
  CONSTRAINT yd_brokers_status_ck CHECK (status IN ('applied', 'active', 'paused'))
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_brokers_email_uniq ON public.yd_brokers (org_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS yd_brokers_code_uniq ON public.yd_brokers (org_id, lower(tracking_code));

CREATE OR REPLACE FUNCTION public.yd_brokers_fill_code() RETURNS trigger AS $$
DECLARE
  candidate text;
  tries int := 0;
BEGIN
  IF NEW.tracking_code IS NOT NULL AND btrim(NEW.tracking_code) <> '' THEN
    RETURN NEW;
  END IF;
  LOOP
    candidate := 'YD-' || lpad((floor(random() * 1000000))::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.yd_brokers
       WHERE org_id = NEW.org_id AND lower(tracking_code) = lower(candidate));
    tries := tries + 1;
    IF tries > 50 THEN
      RAISE EXCEPTION 'could not mint a free broker tracking code after 50 tries';
    END IF;
  END LOOP;
  NEW.tracking_code := candidate;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yd_brokers_fill_code ON public.yd_brokers;
CREATE TRIGGER trg_yd_brokers_fill_code
  BEFORE INSERT ON public.yd_brokers
  FOR EACH ROW EXECUTE FUNCTION public.yd_brokers_fill_code();
SELECT public.yd_harden('yd_brokers');

CREATE TABLE IF NOT EXISTS public.yd_renters (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES public.orgs(id),

  -- Contact. Name, email, current address. No SSN anywhere (owner-set).
  email                    text NOT NULL,
  first_name               text,
  last_name                text,
  phone                    text,
  current_address          jsonb,

  -- First touch: written once, then locked by trigger (owner-set: first touch
  -- wins, timestamped; disputes are decided on yd_disputes, never by editing it).
  source_kind              text NOT NULL DEFAULT 'direct',
  source_ad_id             text,
  source_broker_id         uuid,
  first_touch_at           timestamptz NOT NULL DEFAULT now(),

  -- Where the renter stands.
  stage                    text NOT NULL DEFAULT 'lead',
  lane                     text,
  risk_tier                text,
  approved_max_rent_cents  bigint,
  income_verified          boolean NOT NULL DEFAULT false,
  is_sample                boolean NOT NULL DEFAULT false,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_renters_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_renters_broker_fk
    FOREIGN KEY (source_broker_id, org_id) REFERENCES public.yd_brokers (id, org_id),
  CONSTRAINT yd_renters_email_ck CHECK (email = lower(btrim(email)) AND email <> ''),
  CONSTRAINT yd_renters_source_kind_ck
    CHECK (source_kind IN ('ad', 'broker', 'organic', 'direct', 'referral')),
  CONSTRAINT yd_renters_source_ad_ck
    CHECK (source_kind <> 'ad' OR (source_ad_id IS NOT NULL AND btrim(source_ad_id) <> '')),
  CONSTRAINT yd_renters_source_broker_ck
    CHECK (source_kind <> 'broker' OR source_broker_id IS NOT NULL),
  CONSTRAINT yd_renters_stage_ck
    CHECK (stage IN ('lead', 'screened', 'matched', 'booked', 'placed', 'lifetime', 'inactive')),
  CONSTRAINT yd_renters_lane_ck CHECK (lane IS NULL OR lane IN ('verified', 'second_chance')),
  CONSTRAINT yd_renters_tier_ck CHECK (risk_tier IS NULL OR risk_tier IN ('A', 'B', 'C', 'D')),
  CONSTRAINT yd_renters_max_rent_ck
    CHECK (approved_max_rent_cents IS NULL OR approved_max_rent_cents >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_renters_email_uniq ON public.yd_renters (org_id, email);
CREATE INDEX IF NOT EXISTS yd_renters_stage_idx ON public.yd_renters (org_id, stage);
CREATE INDEX IF NOT EXISTS yd_renters_broker_idx ON public.yd_renters (source_broker_id)
  WHERE source_broker_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.yd_renters_first_touch_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.source_kind IS DISTINCT FROM OLD.source_kind
     OR NEW.source_ad_id IS DISTINCT FROM OLD.source_ad_id
     OR NEW.source_broker_id IS DISTINCT FROM OLD.source_broker_id
     OR NEW.first_touch_at IS DISTINCT FROM OLD.first_touch_at THEN
    RAISE EXCEPTION 'yd_first_touch_locked: a renter''s first touch is written once and never changed (decide disputes on yd_disputes)'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yd_renters_first_touch ON public.yd_renters;
CREATE TRIGGER trg_yd_renters_first_touch
  BEFORE UPDATE ON public.yd_renters
  FOR EACH ROW EXECUTE FUNCTION public.yd_renters_first_touch_guard();
SELECT public.yd_harden('yd_renters');

-- ---------------------------------------------------------------------------
-- D. Accounts, sessions, login links (copies of the Fundhub shapes, 044 / 117)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yd_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id),

  kind        text NOT NULL,
  email       text NOT NULL,
  renter_id   uuid,
  broker_id   uuid,
  status      text NOT NULL DEFAULT 'active',
  last_login_at timestamptz,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_accounts_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_accounts_renter_fk
    FOREIGN KEY (renter_id, org_id) REFERENCES public.yd_renters (id, org_id),
  CONSTRAINT yd_accounts_broker_fk
    FOREIGN KEY (broker_id, org_id) REFERENCES public.yd_brokers (id, org_id),
  CONSTRAINT yd_accounts_kind_ck CHECK (kind IN ('renter', 'building_user', 'broker')),
  CONSTRAINT yd_accounts_email_ck CHECK (email = lower(btrim(email)) AND email <> ''),
  CONSTRAINT yd_accounts_status_ck CHECK (status IN ('active', 'suspended')),
  -- The account points at exactly the subject its kind names.
  CONSTRAINT yd_accounts_subject_ck CHECK (
    (kind = 'renter'        AND renter_id IS NOT NULL AND broker_id IS NULL) OR
    (kind = 'broker'        AND broker_id IS NOT NULL AND renter_id IS NULL) OR
    (kind = 'building_user' AND renter_id IS NULL     AND broker_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_accounts_email_uniq ON public.yd_accounts (org_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS yd_accounts_renter_uniq ON public.yd_accounts (renter_id) WHERE renter_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS yd_accounts_broker_uniq ON public.yd_accounts (broker_id) WHERE broker_id IS NOT NULL;
SELECT public.yd_harden('yd_accounts');

CREATE TABLE IF NOT EXISTS public.yd_account_buildings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id),

  account_id   uuid NOT NULL,
  building_id  uuid NOT NULL,
  role         text NOT NULL DEFAULT 'leasing',
  -- Rows are never deleted; a user who leaves a building is stamped here.
  removed_at   timestamptz,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_account_buildings_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_account_buildings_account_fk
    FOREIGN KEY (account_id, org_id) REFERENCES public.yd_accounts (id, org_id),
  CONSTRAINT yd_account_buildings_building_fk
    FOREIGN KEY (building_id, org_id) REFERENCES public.yd_buildings (id, org_id),
  CONSTRAINT yd_account_buildings_role_ck CHECK (role IN ('leasing', 'manager'))
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_account_buildings_live_uniq
  ON public.yd_account_buildings (account_id, building_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS yd_account_buildings_building_idx ON public.yd_account_buildings (building_id);
SELECT public.yd_harden('yd_account_buildings');

CREATE TABLE IF NOT EXISTS public.yd_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id),

  account_id    uuid NOT NULL,
  token_hash    text NOT NULL,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  ip            inet,
  user_agent    text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_sessions_account_fk
    FOREIGN KEY (account_id, org_id) REFERENCES public.yd_accounts (id, org_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_sessions_token_uniq ON public.yd_sessions (token_hash);
CREATE INDEX IF NOT EXISTS yd_sessions_account_idx ON public.yd_sessions (account_id, expires_at DESC);
SELECT public.yd_harden('yd_sessions');

CREATE TABLE IF NOT EXISTS public.yd_magic_links (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.orgs(id),

  -- The address as asked for, lower-cased. Kept even when nothing matched,
  -- because that is what the rate limiter counts.
  email                 text NOT NULL,
  account_id            uuid,
  -- Set when the address matched a renter with no account yet; the account is
  -- created at verification, not at request.
  renter_id             uuid,

  token_hash            text,
  expires_at            timestamptz,
  consumed_at           timestamptz,
  outcome               text NOT NULL,

  requested_ip          inet,
  requested_user_agent  text,
  consumed_ip           inet,
  consumed_user_agent   text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_magic_links_account_fk
    FOREIGN KEY (account_id, org_id) REFERENCES public.yd_accounts (id, org_id),
  CONSTRAINT yd_magic_links_renter_fk
    FOREIGN KEY (renter_id, org_id) REFERENCES public.yd_renters (id, org_id),
  CONSTRAINT yd_magic_links_outcome_ck CHECK (outcome IN ('issued', 'no_account', 'not_eligible')),
  CONSTRAINT yd_magic_links_email_ck CHECK (email = lower(btrim(email)) AND email <> ''),
  CONSTRAINT yd_magic_links_issued_ck CHECK (
    (outcome =  'issued' AND token_hash IS NOT NULL AND expires_at IS NOT NULL) OR
    (outcome <> 'issued' AND token_hash IS NULL     AND expires_at IS NULL)
  ),
  CONSTRAINT yd_magic_links_consumed_ck CHECK (consumed_at IS NULL OR token_hash IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_magic_links_token_uniq
  ON public.yd_magic_links (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS yd_magic_links_email_idx ON public.yd_magic_links (org_id, email, created_at DESC);
CREATE INDEX IF NOT EXISTS yd_magic_links_ip_idx ON public.yd_magic_links (org_id, requested_ip, created_at DESC);
SELECT public.yd_harden('yd_magic_links');

-- ---------------------------------------------------------------------------
-- E. Consent and screening — kept forever, no delete
-- ---------------------------------------------------------------------------

-- The sign-up screen captures `screening` and `recheck` together; the wording
-- covers repeat checks, so Yesdoor never asks the renter for updates (owner-set).
CREATE TABLE IF NOT EXISTS public.yd_consents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.orgs(id),

  renter_id        uuid NOT NULL,
  kind             text NOT NULL,
  consent_text     text NOT NULL,
  consent_version  text NOT NULL,
  captured_at      timestamptz NOT NULL DEFAULT now(),
  ip               inet,
  user_agent       text,
  method           text NOT NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_consents_id_org_renter_uq UNIQUE (id, org_id, renter_id),
  CONSTRAINT yd_consents_renter_fk
    FOREIGN KEY (renter_id, org_id) REFERENCES public.yd_renters (id, org_id),
  CONSTRAINT yd_consents_kind_ck CHECK (kind IN ('screening', 'recheck', 'email', 'sms')),
  CONSTRAINT yd_consents_text_ck CHECK (char_length(btrim(consent_text)) >= 1),
  CONSTRAINT yd_consents_version_ck CHECK (char_length(btrim(consent_version)) >= 1),
  CONSTRAINT yd_consents_method_ck CHECK (method IN ('checkbox', 'typed'))
);
CREATE INDEX IF NOT EXISTS yd_consents_renter_idx ON public.yd_consents (renter_id, captured_at DESC);
DROP TRIGGER IF EXISTS trg_yd_consents_no_update ON public.yd_consents;
-- updated_at trigger is added by yd_harden; this one is alphabetically earlier
-- than nothing that matters, and rejects every UPDATE.
CREATE TRIGGER trg_yd_consents_no_update
  BEFORE UPDATE ON public.yd_consents
  FOR EACH ROW EXECUTE FUNCTION public.yd_no_update();
SELECT public.yd_harden('yd_consents', true);

CREATE TABLE IF NOT EXISTS public.yd_screenings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.orgs(id),

  renter_id         uuid NOT NULL,
  -- No screening without a consent row for the same renter.
  consent_id        uuid NOT NULL,
  kind              text NOT NULL DEFAULT 'initial',
  provider          text NOT NULL DEFAULT 'crs_sandbox',
  status            text NOT NULL DEFAULT 'queued',

  credit_score      integer,
  collections_count integer,
  eviction_count    integer,
  eviction_last_at  date,
  criminal_flags    jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_ref           text,
  result_at         timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_screenings_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_screenings_id_org_renter_uq UNIQUE (id, org_id, renter_id),
  CONSTRAINT yd_screenings_renter_fk
    FOREIGN KEY (renter_id, org_id) REFERENCES public.yd_renters (id, org_id),
  CONSTRAINT yd_screenings_consent_fk
    FOREIGN KEY (consent_id, org_id, renter_id) REFERENCES public.yd_consents (id, org_id, renter_id),
  CONSTRAINT yd_screenings_kind_ck CHECK (kind IN ('initial', 'recheck')),
  CONSTRAINT yd_screenings_provider_ck CHECK (provider IN ('crs_sandbox', 'crs')),
  CONSTRAINT yd_screenings_status_ck
    CHECK (status IN ('queued', 'processing', 'complete', 'no_match', 'failed')),
  CONSTRAINT yd_screenings_score_ck CHECK (credit_score IS NULL OR credit_score BETWEEN 300 AND 850),
  CONSTRAINT yd_screenings_collections_ck CHECK (collections_count IS NULL OR collections_count >= 0),
  CONSTRAINT yd_screenings_evictions_ck CHECK (eviction_count IS NULL OR eviction_count >= 0),
  CONSTRAINT yd_screenings_flags_ck CHECK (jsonb_typeof(criminal_flags) = 'array'),
  -- A finished screening has a finish time; an unfinished one does not.
  CONSTRAINT yd_screenings_result_at_ck
    CHECK ((status IN ('complete', 'no_match', 'failed')) = (result_at IS NOT NULL)),
  -- no_match means there was no file: no numbers may be filled in.
  CONSTRAINT yd_screenings_no_match_ck
    CHECK (status <> 'no_match' OR (credit_score IS NULL AND eviction_count IS NULL AND collections_count IS NULL))
);
CREATE INDEX IF NOT EXISTS yd_screenings_renter_idx ON public.yd_screenings (renter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS yd_screenings_status_idx ON public.yd_screenings (org_id, status);

-- Keep every result forever (owner-set 2026-10-07): once a screening has
-- finished it is frozen. A re-check is a NEW row.
CREATE OR REPLACE FUNCTION public.yd_screenings_freeze() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('complete', 'no_match', 'failed') THEN
    RAISE EXCEPTION 'yd_screening_frozen: a finished screening is never changed — run a new screening instead'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yd_screenings_freeze ON public.yd_screenings;
CREATE TRIGGER trg_yd_screenings_freeze
  BEFORE UPDATE ON public.yd_screenings
  FOR EACH ROW EXECUTE FUNCTION public.yd_screenings_freeze();
SELECT public.yd_harden('yd_screenings', true);

-- The raw bureau payload. Read only by the owner/ops staff endpoints.
CREATE TABLE IF NOT EXISTS public.yd_screening_raw (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id),

  screening_id  uuid NOT NULL,
  payload       jsonb NOT NULL,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_screening_raw_screening_fk
    FOREIGN KEY (screening_id, org_id) REFERENCES public.yd_screenings (id, org_id),
  CONSTRAINT yd_screening_raw_payload_ck CHECK (jsonb_typeof(payload) IN ('object', 'array'))
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_screening_raw_screening_uniq ON public.yd_screening_raw (screening_id);
DROP TRIGGER IF EXISTS trg_yd_screening_raw_no_update ON public.yd_screening_raw;
CREATE TRIGGER trg_yd_screening_raw_no_update
  BEFORE UPDATE ON public.yd_screening_raw
  FOR EACH ROW EXECUTE FUNCTION public.yd_no_update();
SELECT public.yd_harden('yd_screening_raw', true);

CREATE TABLE IF NOT EXISTS public.yd_income_checks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.orgs(id),

  renter_id             uuid NOT NULL,
  method                text NOT NULL,
  status                text NOT NULL DEFAULT 'pending',
  -- NULL = not verified yet. Never 0.
  monthly_income_cents  bigint,
  sources               jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at            timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_income_checks_id_org_renter_uq UNIQUE (id, org_id, renter_id),
  CONSTRAINT yd_income_checks_renter_fk
    FOREIGN KEY (renter_id, org_id) REFERENCES public.yd_renters (id, org_id),
  CONSTRAINT yd_income_checks_method_ck CHECK (method IN ('plaid', 'statements')),
  CONSTRAINT yd_income_checks_status_ck CHECK (status IN ('pending', 'verified', 'failed', 'review')),
  CONSTRAINT yd_income_checks_income_ck CHECK (monthly_income_cents IS NULL OR monthly_income_cents >= 0),
  CONSTRAINT yd_income_checks_sources_ck CHECK (jsonb_typeof(sources) IN ('object', 'array')),
  -- "Income verified" means a number and a date, not a flag someone typed.
  CONSTRAINT yd_income_checks_verified_ck
    CHECK (status <> 'verified' OR (monthly_income_cents IS NOT NULL AND checked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS yd_income_checks_renter_idx ON public.yd_income_checks (renter_id, created_at DESC);
SELECT public.yd_harden('yd_income_checks', true);

-- ---------------------------------------------------------------------------
-- F. Rules and listings
-- ---------------------------------------------------------------------------

-- Versioned: a change is a NEW row. Only confirmed_at may be touched on an old
-- row (the monthly re-confirm). Rules never change automatically (spec §5).
CREATE TABLE IF NOT EXISTS public.yd_building_rules (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES public.orgs(id),

  building_id               uuid NOT NULL,
  version                   integer NOT NULL,
  effective_at              timestamptz NOT NULL DEFAULT now(),
  confirmed_at              timestamptz,

  min_score                 integer,
  income_multiple           numeric(4,2),
  max_evictions             integer NOT NULL DEFAULT 0,
  eviction_lookback_years   integer,
  criminal_policy           jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepts_second_chance     boolean NOT NULL DEFAULT false,

  notes                     text,
  source                    text NOT NULL DEFAULT 'staff',

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_building_rules_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_building_rules_id_org_building_uq UNIQUE (id, org_id, building_id),
  CONSTRAINT yd_building_rules_building_fk
    FOREIGN KEY (building_id, org_id) REFERENCES public.yd_buildings (id, org_id),
  CONSTRAINT yd_building_rules_version_uq UNIQUE (building_id, version),
  CONSTRAINT yd_building_rules_version_ck CHECK (version >= 1),
  CONSTRAINT yd_building_rules_score_ck CHECK (min_score IS NULL OR min_score BETWEEN 300 AND 850),
  CONSTRAINT yd_building_rules_multiple_ck CHECK (income_multiple IS NULL OR income_multiple > 0),
  CONSTRAINT yd_building_rules_evictions_ck CHECK (max_evictions >= 0),
  CONSTRAINT yd_building_rules_lookback_ck CHECK (eviction_lookback_years IS NULL OR eviction_lookback_years >= 0),
  CONSTRAINT yd_building_rules_criminal_ck CHECK (public.yd_valid_criminal_policy(criminal_policy)),
  CONSTRAINT yd_building_rules_source_ck CHECK (source IN ('portal', 'feed', 'agent_read', 'staff'))
);
CREATE INDEX IF NOT EXISTS yd_building_rules_latest_idx ON public.yd_building_rules (building_id, version DESC);

CREATE OR REPLACE FUNCTION public.yd_building_rules_version_fill() RETURNS trigger AS $$
BEGIN
  IF NEW.version IS NULL THEN
    SELECT COALESCE(max(version), 0) + 1 INTO NEW.version
      FROM public.yd_building_rules WHERE building_id = NEW.building_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.yd_building_rules_freeze() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'confirmed_at' - 'updated_at') IS DISTINCT FROM
     (to_jsonb(OLD) - 'confirmed_at' - 'updated_at') THEN
    RAISE EXCEPTION 'yd_rules_versioned: building rules are never edited — add a new version (only confirmed_at may change)'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yd_building_rules_version ON public.yd_building_rules;
CREATE TRIGGER trg_yd_building_rules_version
  BEFORE INSERT ON public.yd_building_rules
  FOR EACH ROW EXECUTE FUNCTION public.yd_building_rules_version_fill();
DROP TRIGGER IF EXISTS trg_yd_building_rules_freeze ON public.yd_building_rules;
CREATE TRIGGER trg_yd_building_rules_freeze
  BEFORE UPDATE ON public.yd_building_rules
  FOR EACH ROW EXECUTE FUNCTION public.yd_building_rules_freeze();
SELECT public.yd_harden('yd_building_rules', true);

CREATE TABLE IF NOT EXISTS public.yd_listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id),

  building_id   uuid NOT NULL,
  unit_label    text NOT NULL,
  beds          integer NOT NULL DEFAULT 1,
  baths         numeric(3,1),
  sqft          integer,
  rent_cents    bigint NOT NULL,
  available_on  date,

  specials      text,
  photos        jsonb NOT NULL DEFAULT '[]'::jsonb,

  source        text NOT NULL DEFAULT 'manual',
  active        boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  is_sample     boolean NOT NULL DEFAULT false,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_listings_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_listings_id_building_uq UNIQUE (id, building_id),
  CONSTRAINT yd_listings_building_fk
    FOREIGN KEY (building_id, org_id) REFERENCES public.yd_buildings (id, org_id),
  CONSTRAINT yd_listings_unit_ck CHECK (char_length(btrim(unit_label)) >= 1),
  CONSTRAINT yd_listings_beds_ck CHECK (beds BETWEEN 0 AND 10),
  CONSTRAINT yd_listings_baths_ck CHECK (baths IS NULL OR baths >= 0),
  CONSTRAINT yd_listings_sqft_ck CHECK (sqft IS NULL OR sqft > 0),
  CONSTRAINT yd_listings_rent_ck CHECK (rent_cents > 0),
  CONSTRAINT yd_listings_photos_ck CHECK (jsonb_typeof(photos) = 'array'),
  CONSTRAINT yd_listings_source_ck CHECK (source IN ('manual', 'csv', 'feed', 'api'))
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_listings_unit_uniq ON public.yd_listings (building_id, lower(unit_label));
CREATE INDEX IF NOT EXISTS yd_listings_search_idx ON public.yd_listings (org_id, active, rent_cents);
SELECT public.yd_harden('yd_listings');

-- ---------------------------------------------------------------------------
-- G. State rules, timeline, outbox
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yd_state_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id),

  state       text NOT NULL,
  key         text NOT NULL,
  value       jsonb NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_state_rules_state_ck CHECK (state ~ '^[A-Z]{2}$'),
  CONSTRAINT yd_state_rules_key_ck CHECK (char_length(btrim(key)) >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_state_rules_uniq ON public.yd_state_rules (org_id, state, key);
SELECT public.yd_harden('yd_state_rules');

-- Yesdoor's own timeline. It does not use Fundhub's CANONICAL_EVENTS.
CREATE TABLE IF NOT EXISTS public.yd_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.orgs(id),

  name             text NOT NULL,
  entity_kind      text NOT NULL,
  entity_id        uuid NOT NULL,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_kind       text NOT NULL DEFAULT 'system',
  actor_id         uuid,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  idempotency_key  text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_events_name_ck CHECK (char_length(btrim(name)) >= 1),
  CONSTRAINT yd_events_payload_ck CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT yd_events_actor_ck
    CHECK (actor_kind IN ('system', 'staff', 'renter', 'building_user', 'broker', 'sandbox'))
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_events_idem_uniq
  ON public.yd_events (org_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS yd_events_entity_idx
  ON public.yd_events (org_id, entity_kind, entity_id, occurred_at);
DROP TRIGGER IF EXISTS trg_yd_events_no_update ON public.yd_events;
CREATE TRIGGER trg_yd_events_no_update
  BEFORE UPDATE ON public.yd_events
  FOR EACH ROW EXECUTE FUNCTION public.yd_no_update();
SELECT public.yd_harden('yd_events', true);

-- Messages waiting to go out. In the MVP the sandbox dispatcher marks them sent
-- with provider 'sandbox'; nothing leaves the building (spec §7).
CREATE TABLE IF NOT EXISTS public.yd_outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.orgs(id),

  channel       text NOT NULL,
  to_address    text NOT NULL,
  template_key  text NOT NULL,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb,

  status        text NOT NULL DEFAULT 'queued',
  provider      text,
  provider_ref  text,
  sent_at       timestamptz,
  related_kind  text,
  related_id    uuid,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_outbox_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_outbox_channel_ck CHECK (channel IN ('email', 'sms')),
  CONSTRAINT yd_outbox_to_ck CHECK (char_length(btrim(to_address)) >= 1),
  CONSTRAINT yd_outbox_template_ck CHECK (char_length(btrim(template_key)) >= 1),
  CONSTRAINT yd_outbox_context_ck CHECK (jsonb_typeof(context) = 'object'),
  CONSTRAINT yd_outbox_status_ck CHECK (status IN ('queued', 'sent', 'failed')),
  CONSTRAINT yd_outbox_sent_ck CHECK (status <> 'sent' OR (provider IS NOT NULL AND sent_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS yd_outbox_queue_idx ON public.yd_outbox (status, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS yd_outbox_related_idx ON public.yd_outbox (related_kind, related_id);
SELECT public.yd_harden('yd_outbox');

COMMENT ON TABLE public.yd_renters IS
  'Yesdoor renters (434). Name, email, address — no SSN. First touch is written once and locked by trigger.';
COMMENT ON TABLE public.yd_consents IS
  'Yesdoor consent records (434). Written once, kept forever. Wording covers repeat checks.';
COMMENT ON TABLE public.yd_screenings IS
  'Yesdoor screenings (434). Credit fields are for owner/ops only; buildings and brokers never see them. A finished row is frozen; a re-check is a new row.';
COMMENT ON TABLE public.yd_building_rules IS
  'Versioned building rental rules (434). Never edited; a change is a new version. Only confirmed_at moves.';
