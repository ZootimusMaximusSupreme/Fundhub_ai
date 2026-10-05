-- 407_marketing_machine_tables.sql — marketing machine M0 step 3: settings,
-- offers, jobs. Spec: docs/specs/marketing-machine-2026-10-04.md §6 step 3.
-- Lane A migration range 406-415; 408 seeds the three offers and the old-ad tags.
--
-- None of these tables is partner-scoped. Every one is org-scoped and follows
-- the 402/403 pattern: org_id -> orgs, RLS enabled and forced, one *_app_all
-- policy, and the fundhub_app grant inside the pg_roles check.
--
-- The tables that DO force partner row-level security (ad_scripts, ad_labels,
-- ads, campaigns, ad_metrics_daily) are not written here. This file therefore
-- does not set the fundhub.actor GUC; 408 does not touch ad_scripts either.
--
-- NULL MEANS UNKNOWN (CLAUDE.md §12): winner_rule and caption_position_y are
-- null until Chris sets them. Nothing defaults them to 0.

-- ─── marketing_settings: one row per org, created on first read ─────────────
CREATE TABLE IF NOT EXISTS public.marketing_settings (
  org_id             uuid PRIMARY KEY REFERENCES orgs(id),
  enabled            boolean NOT NULL DEFAULT false,
  batch_weekday      smallint NOT NULL DEFAULT 1,
  batch_time         text NOT NULL DEFAULT '07:00',
  timezone           text NOT NULL DEFAULT 'America/Phoenix',
  scripts_per_day    integer NOT NULL DEFAULT 3,
  days_per_batch     integer NOT NULL DEFAULT 7,
  size_rule          text NOT NULL DEFAULT 'total',
  format_style       jsonb NOT NULL DEFAULT
    '{"standard":"bullets","sorting":"words","long":"words","notes":"bullets","greenscreen":"bullets","vsl":"bullets"}'::jsonb,
  draft_expiry_days  integer NOT NULL DEFAULT 14,
  winner_rule        jsonb,
  ad_number_floor    integer NOT NULL DEFAULT 91,
  next_overrides     jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_batch_cost_usd numeric(10,2) NOT NULL DEFAULT 40,
  max_month_cost_usd numeric(10,2) NOT NULL DEFAULT 300,
  submagic_template  text NOT NULL DEFAULT 'Hormozi 2',
  caption_position_y numeric,
  magic_zooms        boolean NOT NULL DEFAULT false,
  clean_audio        boolean NOT NULL DEFAULT true,
  caption_dictionary text[] NOT NULL DEFAULT '{}',
  animation_mode     text NOT NULL DEFAULT 'fullframe',
  flip_horizontal    boolean NOT NULL DEFAULT false,
  settle_minutes     integer NOT NULL DEFAULT 10,
  quiet_start        text NOT NULL DEFAULT '21:00',
  quiet_end          text NOT NULL DEFAULT '07:00',
  course_folders     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid REFERENCES staff(id) ON DELETE SET NULL,
  CONSTRAINT marketing_settings_weekday_ck CHECK (batch_weekday BETWEEN 0 AND 6),
  CONSTRAINT marketing_settings_batch_time_ck
    CHECK (batch_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT marketing_settings_quiet_ck
    CHECK (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       AND quiet_end   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT marketing_settings_size_rule_ck CHECK (size_rule IN ('total', 'per_offer')),
  CONSTRAINT marketing_settings_animation_mode_ck CHECK (animation_mode IN ('fullframe', 'overlay')),
  CONSTRAINT marketing_settings_counts_ck
    CHECK (scripts_per_day > 0 AND days_per_batch > 0 AND draft_expiry_days > 0 AND settle_minutes >= 0),
  CONSTRAINT marketing_settings_ad_number_floor_ck CHECK (ad_number_floor > 0),
  CONSTRAINT marketing_settings_costs_ck CHECK (max_batch_cost_usd >= 0 AND max_month_cost_usd >= 0),
  CONSTRAINT marketing_settings_format_style_ck CHECK (jsonb_typeof(format_style) = 'object'),
  CONSTRAINT marketing_settings_course_folders_ck CHECK (jsonb_typeof(course_folders) = 'object')
);

COMMENT ON TABLE public.marketing_settings IS
  'Marketing machine settings, one row per org, created on first read (spec §6 step 3).';

-- ─── marketing_offers: an offer is a funnel with a permanent tag ────────────
CREATE TABLE IF NOT EXISTS public.marketing_offers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES orgs(id),
  tag                 text NOT NULL,
  name                text NOT NULL,
  status              text NOT NULL DEFAULT 'draft',
  paused              boolean NOT NULL DEFAULT false,
  structure           text,
  steps               jsonb NOT NULL DEFAULT '[]'::jsonb,
  lane                ad_lane,
  registry_tags       jsonb NOT NULL DEFAULT '{}'::jsonb,
  card_path           text,
  meta_campaign_ids   text[] NOT NULL DEFAULT '{}',
  ad_set_external_id  text,
  format_mix          jsonb NOT NULL DEFAULT '{}'::jsonb,
  cta_type            text NOT NULL DEFAULT 'LEARN_MORE',
  weight              numeric NOT NULL DEFAULT 1,
  min_per_batch       integer NOT NULL DEFAULT 3,
  test_key            text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- The tag is the value saved in ad_scripts.offer_key (377: ^[a-z][a-z0-9_]{1,48}$),
  -- and the spec narrows it to 2-24 characters in all.
  CONSTRAINT marketing_offers_tag_ck CHECK (tag ~ '^[a-z][a-z0-9_]{1,23}$'),
  CONSTRAINT marketing_offers_name_ck CHECK (btrim(name) <> ''),
  CONSTRAINT marketing_offers_status_ck
    CHECK (status IN ('draft', 'ready', 'testing', 'live', 'retired')),
  CONSTRAINT marketing_offers_lane_ck CHECK (lane IS NULL OR lane <> 'unknown'),
  CONSTRAINT marketing_offers_steps_ck CHECK (jsonb_typeof(steps) = 'array'),
  CONSTRAINT marketing_offers_registry_tags_ck CHECK (jsonb_typeof(registry_tags) = 'object'),
  CONSTRAINT marketing_offers_format_mix_ck CHECK (jsonb_typeof(format_mix) = 'object'),
  CONSTRAINT marketing_offers_weight_ck CHECK (weight >= 0),
  CONSTRAINT marketing_offers_min_per_batch_ck CHECK (min_per_batch >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_offers_org_tag_uq
  ON public.marketing_offers (org_id, tag);

COMMENT ON TABLE public.marketing_offers IS
  'One row per offer (a funnel with a permanent tag). A finished offer is set to retired and stays; its tag is never renamed or reused.';

-- The tag is permanent: ads, leads and sales point at it.
CREATE OR REPLACE FUNCTION public.marketing_offers_tag_frozen() RETURNS trigger AS $$
BEGIN
  IF NEW.tag IS DISTINCT FROM OLD.tag OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'marketing_offers.tag is permanent: retire the offer instead of renaming %', OLD.tag
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketing_offers_tag_frozen ON public.marketing_offers;
CREATE TRIGGER trg_marketing_offers_tag_frozen
  BEFORE UPDATE ON public.marketing_offers
  FOR EACH ROW EXECUTE FUNCTION public.marketing_offers_tag_frozen();

-- ─── marketing_jobs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id),
  kind        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'queued',
  attempts    integer NOT NULL DEFAULT 0,
  run_after   timestamptz NOT NULL DEFAULT now(),
  claimed_at  timestamptz,
  finished_at timestamptz,
  error       text,
  result      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_jobs_status_ck CHECK (status IN ('queued', 'running', 'done', 'failed')),
  CONSTRAINT marketing_jobs_kind_ck CHECK (btrim(kind) <> ''),
  CONSTRAINT marketing_jobs_attempts_ck CHECK (attempts >= 0)
);

-- The worker's claim query: oldest runnable queued job.
CREATE INDEX IF NOT EXISTS marketing_jobs_claim_idx
  ON public.marketing_jobs (run_after) WHERE status = 'queued';
-- Takes back claims that have sat in running too long.
CREATE INDEX IF NOT EXISTS marketing_jobs_running_idx
  ON public.marketing_jobs (claimed_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS marketing_jobs_org_kind_idx
  ON public.marketing_jobs (org_id, kind, created_at DESC);

-- ─── marketing_requests: a repeated request_id returns the saved response ───
CREATE TABLE IF NOT EXISTS public.marketing_requests (
  request_id text PRIMARY KEY,
  org_id     uuid NOT NULL REFERENCES orgs(id),
  route      text NOT NULL,
  response   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_requests_request_id_ck CHECK (btrim(request_id) <> '')
);
CREATE INDEX IF NOT EXISTS marketing_requests_created_idx
  ON public.marketing_requests (org_id, created_at);

-- ─── marketing_buzzes: wait here through quiet hours ────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_buzzes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES orgs(id),
  kind       text NOT NULL,
  body       text NOT NULL,
  group_key  text,
  send_after timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_buzzes_kind_ck CHECK (btrim(kind) <> '')
);
CREATE INDEX IF NOT EXISTS marketing_buzzes_unsent_idx
  ON public.marketing_buzzes (send_after) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_buzzes_kind_sent_idx
  ON public.marketing_buzzes (org_id, kind, sent_at DESC);

-- ─── marketing_model_usage: not recordUsage (it charges the partner token cap) ──
CREATE TABLE IF NOT EXISTS public.marketing_model_usage (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES orgs(id),
  batch_id              uuid,
  job_id                uuid REFERENCES marketing_jobs(id) ON DELETE SET NULL,
  model                 text NOT NULL,
  input_tokens          integer NOT NULL DEFAULT 0,
  output_tokens         integer NOT NULL DEFAULT 0,
  cache_read_tokens     integer NOT NULL DEFAULT 0,
  cache_creation_tokens integer NOT NULL DEFAULT 0,
  cost_usd              numeric(12,6) NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_model_usage_nonneg_ck
    CHECK (input_tokens >= 0 AND output_tokens >= 0
       AND cache_read_tokens >= 0 AND cache_creation_tokens >= 0 AND cost_usd >= 0)
);
CREATE INDEX IF NOT EXISTS marketing_model_usage_org_created_idx
  ON public.marketing_model_usage (org_id, created_at);
CREATE INDEX IF NOT EXISTS marketing_model_usage_batch_idx
  ON public.marketing_model_usage (batch_id) WHERE batch_id IS NOT NULL;

-- ─── ad_offer_tags: tags for ads that have no machine script ────────────────
-- When both exist, the script's offer_key wins. Seeded from §17 decision 9 in 408.
CREATE TABLE IF NOT EXISTS public.ad_offer_tags (
  org_id     uuid NOT NULL REFERENCES orgs(id),
  ad_number  integer NOT NULL,
  offer_tag  text NOT NULL,
  source     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, ad_number),
  CONSTRAINT ad_offer_tags_source_ck CHECK (source IN ('decision_9', 'link', 'manual')),
  CONSTRAINT ad_offer_tags_number_ck CHECK (ad_number > 0),
  CONSTRAINT ad_offer_tags_offer_fk FOREIGN KEY (org_id, offer_tag)
    REFERENCES public.marketing_offers (org_id, tag)
);
CREATE INDEX IF NOT EXISTS ad_offer_tags_tag_idx
  ON public.ad_offer_tags (org_id, offer_tag);

-- ─── agent_requests: the work queue for the request runner ──────────────────
CREATE TABLE IF NOT EXISTS public.agent_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id),
  kind          text NOT NULL,
  offer_tag     text,
  step          text,
  suggestion_id uuid,
  request_path  text,
  draft_url     text,
  status        text NOT NULL DEFAULT 'requested',
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_requests_kind_ck CHECK (kind IN ('page', 'avatar')),
  CONSTRAINT agent_requests_status_ck
    CHECK (status IN ('requested', 'drafted', 'fixing', 'fixed', 'pushing', 'live', 'done', 'failed')),
  CONSTRAINT agent_requests_offer_fk FOREIGN KEY (org_id, offer_tag)
    REFERENCES public.marketing_offers (org_id, tag)
);
CREATE INDEX IF NOT EXISTS agent_requests_open_idx
  ON public.agent_requests (org_id, status, created_at)
  WHERE status NOT IN ('done', 'failed');

-- ─── marketing_shoots: Shoot Day (8.2) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_shoots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id),
  shoot_date      date NOT NULL,
  -- In film order. Each id is read as its live version, so an edit never breaks the list.
  root_script_ids uuid[] NOT NULL DEFAULT '{}',
  -- {<root_script_id>: {takes, got_it}}
  marks           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'planned',
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_shoots_status_ck CHECK (status IN ('planned', 'filming', 'uploaded', 'done')),
  CONSTRAINT marketing_shoots_marks_ck CHECK (jsonb_typeof(marks) = 'object')
);
CREATE INDEX IF NOT EXISTS marketing_shoots_org_date_idx
  ON public.marketing_shoots (org_id, shoot_date DESC);

-- ─── updated_at triggers ────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    FOREACH t IN ARRAY ARRAY['marketing_settings', 'marketing_offers', 'ad_offer_tags', 'agent_requests'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_' || t || '_updated_at') THEN
        EXECUTE format(
          'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
          'trg_' || t || '_updated_at', t);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ─── RLS (402/403 pattern), a policy and the app-role grant per table ───────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_settings', 'marketing_offers', 'marketing_jobs', 'marketing_requests',
    'marketing_buzzes', 'marketing_model_usage', 'ad_offer_tags', 'agent_requests',
    'marketing_shoots'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_app_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I USING (true) WITH CHECK (true)', t || '_app_all', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO fundhub_app', t);
    END IF;
  END LOOP;
END $$;
