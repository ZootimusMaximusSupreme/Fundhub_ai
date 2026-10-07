-- 435_yesdoor_pipeline.sql — Yesdoor MVP, part 2 of 3: agreements, matches,
-- applications (the placement record), tours, disputes and lifetime touches.
--
-- Spec: docs/specs/yesdoor-mvp-build-spec.md §2, §3, §5b. Depends on 434.
--
-- What the database refuses here, so no screen or job has to remember to:
--   * a building that has not signed gets no renters (yd_building_is_matchable)
--   * a renter holds at most 3 open applications (yd_applications trigger)
--   * stages only move forward along the §3 arrows (yd_stage_move_ok)
--   * a tour needs the timestamped registration email first (referral proof)
--   * every stage move writes one yd_events row
--   * a signed agreement's terms can never be edited
--   * a decided dispute can never be re-decided

-- ---------------------------------------------------------------------------
-- A. Agreements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yd_agreements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id),

  -- party_id points at yd_companies, yd_buildings or yd_brokers depending on
  -- party_kind; the trigger below checks it exists in this org.
  party_kind   text NOT NULL,
  party_id     uuid NOT NULL,
  kind         text NOT NULL,
  status       text NOT NULL DEFAULT 'draft',

  -- A snapshot of the fee terms at signing.
  terms        jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at      timestamptz,
  signed_at    timestamptz,
  signer_name  text,
  signer_ip    inet,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_agreements_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_agreements_party_kind_ck CHECK (party_kind IN ('company', 'building', 'broker')),
  CONSTRAINT yd_agreements_kind_ck CHECK (kind IN ('building_fee', 'broker_partner')),
  CONSTRAINT yd_agreements_status_ck CHECK (status IN ('draft', 'sent', 'signed', 'void')),
  CONSTRAINT yd_agreements_terms_ck CHECK (jsonb_typeof(terms) = 'object'),
  -- A fee agreement is with a company or a building; a partner agreement is with a broker.
  CONSTRAINT yd_agreements_party_match_ck CHECK (
    (kind = 'building_fee'    AND party_kind IN ('company', 'building')) OR
    (kind = 'broker_partner'  AND party_kind = 'broker')
  ),
  CONSTRAINT yd_agreements_sent_ck CHECK (status = 'draft' OR status = 'void' OR sent_at IS NOT NULL),
  CONSTRAINT yd_agreements_signed_ck CHECK (
    status <> 'signed' OR (signed_at IS NOT NULL AND signer_name IS NOT NULL AND btrim(signer_name) <> '')
  )
);
CREATE INDEX IF NOT EXISTS yd_agreements_party_idx ON public.yd_agreements (org_id, party_kind, party_id);

CREATE OR REPLACE FUNCTION public.yd_agreements_party_guard() RETURNS trigger AS $$
DECLARE
  ok boolean;
BEGIN
  IF NEW.party_kind = 'company' THEN
    SELECT EXISTS (SELECT 1 FROM public.yd_companies WHERE id = NEW.party_id AND org_id = NEW.org_id) INTO ok;
  ELSIF NEW.party_kind = 'building' THEN
    SELECT EXISTS (SELECT 1 FROM public.yd_buildings WHERE id = NEW.party_id AND org_id = NEW.org_id) INTO ok;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.yd_brokers WHERE id = NEW.party_id AND org_id = NEW.org_id) INTO ok;
  END IF;
  IF NOT ok THEN
    RAISE EXCEPTION 'yd_agreement_party_missing: no % with that id in this company', NEW.party_kind
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.yd_agreements_freeze() RETURNS trigger AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    IF OLD.status = 'signed'
       AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION 'yd_agreement_signed: a signed agreement is never edited — void it and draft a new one'
        USING ERRCODE = '23514';
    END IF;
    -- Terms, party and kind are fixed from the moment it is sent, whatever the status does.
    IF OLD.status <> 'draft'
       AND (NEW.terms IS DISTINCT FROM OLD.terms
            OR NEW.party_id IS DISTINCT FROM OLD.party_id
            OR NEW.party_kind IS DISTINCT FROM OLD.party_kind
            OR NEW.kind IS DISTINCT FROM OLD.kind) THEN
      RAISE EXCEPTION 'yd_agreement_terms_fixed: terms are fixed once an agreement is sent'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  -- draft -> sent -> signed; draft/sent/signed -> void. Nothing else.
  IF NOT (
       (OLD.status = 'draft' AND NEW.status IN ('sent', 'void'))
    OR (OLD.status = 'sent'  AND NEW.status IN ('signed', 'void'))
    OR (OLD.status = 'signed' AND NEW.status = 'void')
  ) THEN
    RAISE EXCEPTION 'yd_agreement_move: cannot go from % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  -- Terms, party and kind are fixed from the moment it is sent.
  IF OLD.status <> 'draft'
     AND (NEW.terms IS DISTINCT FROM OLD.terms
          OR NEW.party_id IS DISTINCT FROM OLD.party_id
          OR NEW.party_kind IS DISTINCT FROM OLD.party_kind
          OR NEW.kind IS DISTINCT FROM OLD.kind) THEN
    RAISE EXCEPTION 'yd_agreement_terms_fixed: terms are fixed once an agreement is sent'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yd_agreements_party ON public.yd_agreements;
CREATE TRIGGER trg_yd_agreements_party
  BEFORE INSERT OR UPDATE OF party_kind, party_id ON public.yd_agreements
  FOR EACH ROW EXECUTE FUNCTION public.yd_agreements_party_guard();
DROP TRIGGER IF EXISTS trg_yd_agreements_freeze ON public.yd_agreements;
CREATE TRIGGER trg_yd_agreements_freeze
  BEFORE UPDATE ON public.yd_agreements
  FOR EACH ROW EXECUTE FUNCTION public.yd_agreements_freeze();
SELECT public.yd_harden('yd_agreements', true);

-- ---------------------------------------------------------------------------
-- B. "Is this building allowed to get renters?"
-- ---------------------------------------------------------------------------

-- Signed or live AND a signed building_fee agreement (its own, or its company's).
-- SAMPLE buildings (is_sample = true) are exempt so the demo funnel can run end
-- to end on the Arizona sample data; nothing transmits in the MVP, so a sample
-- match reaches nobody. The moment a building signs it is real and is_sample
-- must be false. (Rules freshness is the matcher's job, spec §4.)
CREATE OR REPLACE FUNCTION public.yd_building_is_matchable(p_building uuid) RETURNS boolean AS $$
DECLARE
  b public.yd_buildings;
BEGIN
  SELECT * INTO b FROM public.yd_buildings WHERE id = p_building;
  IF NOT FOUND THEN RETURN false; END IF;
  IF b.is_sample THEN RETURN true; END IF;
  IF b.status NOT IN ('signed', 'live') THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.yd_agreements a
     WHERE a.org_id = b.org_id
       AND a.kind = 'building_fee'
       AND a.status = 'signed'
       AND ((a.party_kind = 'building' AND a.party_id = b.id)
         OR (a.party_kind = 'company'  AND b.company_id IS NOT NULL AND a.party_id = b.company_id))
  );
END $$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.yd_building_is_matchable(uuid) IS
  'Yesdoor (435): true when the building is signed/live with a signed building_fee agreement (or is flagged is_sample for the demo). Used by the matches and applications insert triggers and by the matcher.';

-- ---------------------------------------------------------------------------
-- C. Matches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yd_matches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.orgs(id),

  renter_id        uuid NOT NULL,
  building_id      uuid NOT NULL,
  listing_id       uuid,
  screening_id     uuid NOT NULL,
  income_check_id  uuid,
  rules_id         uuid NOT NULL,

  result           text NOT NULL,
  -- One entry per rule: {rule, outcome, ...}.
  reasons          jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_rent_cents   bigint,
  is_backup        boolean NOT NULL DEFAULT false,
  computed_at      timestamptz NOT NULL DEFAULT now(),

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_matches_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_matches_id_pair_uq UNIQUE (id, org_id, renter_id, building_id),
  CONSTRAINT yd_matches_renter_fk
    FOREIGN KEY (renter_id, org_id) REFERENCES public.yd_renters (id, org_id),
  CONSTRAINT yd_matches_building_fk
    FOREIGN KEY (building_id, org_id) REFERENCES public.yd_buildings (id, org_id),
  CONSTRAINT yd_matches_listing_fk
    FOREIGN KEY (listing_id, building_id) REFERENCES public.yd_listings (id, building_id),
  CONSTRAINT yd_matches_screening_fk
    FOREIGN KEY (screening_id, org_id, renter_id) REFERENCES public.yd_screenings (id, org_id, renter_id),
  CONSTRAINT yd_matches_income_fk
    FOREIGN KEY (income_check_id, org_id, renter_id) REFERENCES public.yd_income_checks (id, org_id, renter_id),
  CONSTRAINT yd_matches_rules_fk
    FOREIGN KEY (rules_id, org_id, building_id) REFERENCES public.yd_building_rules (id, org_id, building_id),
  CONSTRAINT yd_matches_result_ck CHECK (result IN ('approved', 'likely', 'no')),
  CONSTRAINT yd_matches_reasons_ck CHECK (jsonb_typeof(reasons) = 'array'),
  CONSTRAINT yd_matches_max_rent_ck CHECK (max_rent_cents IS NULL OR max_rent_cents >= 0),
  -- A backup is another building the renter already clears (spec §4).
  CONSTRAINT yd_matches_backup_ck CHECK (NOT is_backup OR result = 'approved')
);
CREATE INDEX IF NOT EXISTS yd_matches_renter_idx ON public.yd_matches (renter_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS yd_matches_building_idx ON public.yd_matches (building_id, result);

CREATE OR REPLACE FUNCTION public.yd_matches_guard() RETURNS trigger AS $$
BEGIN
  IF NOT public.yd_building_is_matchable(NEW.building_id) THEN
    RAISE EXCEPTION 'yd_building_not_signed: this building has no signed agreement and cannot be matched'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yd_matches_guard ON public.yd_matches;
CREATE TRIGGER trg_yd_matches_guard
  BEFORE INSERT ON public.yd_matches
  FOR EACH ROW EXECUTE FUNCTION public.yd_matches_guard();
SELECT public.yd_harden('yd_matches', true);

-- ---------------------------------------------------------------------------
-- D. Applications — the placement record
-- ---------------------------------------------------------------------------

-- yd_stage_move_ok(from, to) — the arrows of spec §3, and only those.
CREATE OR REPLACE FUNCTION public.yd_stage_move_ok(p_from text, p_to text) RETURNS boolean AS $$
  SELECT (p_from, p_to) IN (
    ('booked', 'registered'),
    ('booked', 'cancelled'),
    ('registered', 'toured'),
    ('registered', 'no_show'),
    ('toured', 'applied'),
    ('applied', 'approved'),
    ('applied', 'denied'),
    ('approved', 'lease_signed'),
    ('lease_signed', 'moved_in'),
    ('moved_in', 'invoiced'),
    ('invoiced', 'paid'),
    ('paid', 'safe'),
    ('paid', 'refunded')
  );
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE IF NOT EXISTS public.yd_applications (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES public.orgs(id),

  renter_id                 uuid NOT NULL,
  building_id               uuid NOT NULL,
  listing_id                uuid,
  match_id                  uuid,
  broker_id                 uuid,

  stage                     text NOT NULL DEFAULT 'booked',
  denial_reason             text,

  -- Proof of referral (spec §5b): the registration email, timestamped, with a
  -- pointer to the queued message. It counts for YD_DEFAULTS.registrationValidDays.
  registration_sent_at      timestamptz,
  registration_outbox_id    uuid,

  -- Known renter, no fee (spec §5b): the building says it already knew this
  -- renter, with its own earlier visitor-record date as evidence. The dispute
  -- that decides it lives on yd_disputes (kind 'attribution').
  known_prospect_at         timestamptz,
  known_prospect_evidence   text,

  lease_start               date,
  lease_end                 date,
  rent_cents                bigint,

  -- One timestamp per stage, stamped by trigger on the move.
  booked_at                 timestamptz NOT NULL DEFAULT now(),
  registered_at             timestamptz,
  toured_at                 timestamptz,
  no_show_at                timestamptz,
  applied_at                timestamptz,
  approved_at               timestamptz,
  denied_at                 timestamptz,
  lease_signed_at           timestamptz,
  moved_in_at               timestamptz,
  invoiced_at               timestamptz,
  paid_at                   timestamptz,
  safe_at                   timestamptz,
  refunded_at               timestamptz,
  cancelled_at              timestamptz,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_applications_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_applications_id_org_building_uq UNIQUE (id, org_id, building_id),
  CONSTRAINT yd_applications_id_org_renter_uq UNIQUE (id, org_id, renter_id),
  CONSTRAINT yd_applications_renter_fk
    FOREIGN KEY (renter_id, org_id) REFERENCES public.yd_renters (id, org_id),
  CONSTRAINT yd_applications_building_fk
    FOREIGN KEY (building_id, org_id) REFERENCES public.yd_buildings (id, org_id),
  CONSTRAINT yd_applications_listing_fk
    FOREIGN KEY (listing_id, building_id) REFERENCES public.yd_listings (id, building_id),
  CONSTRAINT yd_applications_match_fk
    FOREIGN KEY (match_id, org_id, renter_id, building_id)
    REFERENCES public.yd_matches (id, org_id, renter_id, building_id),
  CONSTRAINT yd_applications_broker_fk
    FOREIGN KEY (broker_id, org_id) REFERENCES public.yd_brokers (id, org_id),
  CONSTRAINT yd_applications_outbox_fk
    FOREIGN KEY (registration_outbox_id, org_id) REFERENCES public.yd_outbox (id, org_id),
  CONSTRAINT yd_applications_stage_ck CHECK (stage IN (
    'booked', 'registered', 'toured', 'no_show', 'applied', 'approved', 'denied',
    'lease_signed', 'moved_in', 'invoiced', 'paid', 'safe', 'refunded', 'cancelled')),
  CONSTRAINT yd_applications_denied_ck
    CHECK (stage <> 'denied' OR (denial_reason IS NOT NULL AND btrim(denial_reason) <> '')),
  CONSTRAINT yd_applications_lease_ck CHECK (
    stage NOT IN ('lease_signed', 'moved_in', 'invoiced', 'paid', 'safe', 'refunded')
    OR (lease_start IS NOT NULL AND lease_end IS NOT NULL AND rent_cents IS NOT NULL)
  ),
  CONSTRAINT yd_applications_lease_dates_ck
    CHECK (lease_start IS NULL OR lease_end IS NULL OR lease_end > lease_start),
  CONSTRAINT yd_applications_rent_ck CHECK (rent_cents IS NULL OR rent_cents > 0),
  -- The referral proof: the registration email and its timestamp go together,
  -- and nothing past the booking (except a cancel) happens without them.
  CONSTRAINT yd_applications_registration_pair_ck
    CHECK ((registration_sent_at IS NULL) = (registration_outbox_id IS NULL)),
  CONSTRAINT yd_applications_registration_ck
    CHECK (stage IN ('booked', 'cancelled') OR registration_sent_at IS NOT NULL),
  CONSTRAINT yd_applications_known_prospect_ck
    CHECK (known_prospect_at IS NULL OR (known_prospect_evidence IS NOT NULL AND btrim(known_prospect_evidence) <> ''))
);
CREATE INDEX IF NOT EXISTS yd_applications_renter_idx ON public.yd_applications (renter_id);
CREATE INDEX IF NOT EXISTS yd_applications_building_idx ON public.yd_applications (building_id, stage);
CREATE INDEX IF NOT EXISTS yd_applications_stage_idx ON public.yd_applications (org_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS yd_applications_broker_idx ON public.yd_applications (broker_id) WHERE broker_id IS NOT NULL;
-- One open application per renter per building (the renter pays an application
-- fee per building, owner-set).
CREATE UNIQUE INDEX IF NOT EXISTS yd_applications_open_pair_uniq
  ON public.yd_applications (renter_id, building_id)
  WHERE stage IN ('booked', 'registered', 'toured', 'applied', 'approved', 'lease_signed');

-- BEFORE INSERT: new placements start at booked, only at a building that can
-- take renters, and never past the open-application cap.
-- The cap is YD_DEFAULTS.maxOpenApplications (3). The database cannot read the
-- JS file, so the number lives here as the default of the GUC
-- yd.max_open_applications; src/http/yesdoor-core.pg.test.mjs fails if the two
-- ever disagree.
CREATE OR REPLACE FUNCTION public.yd_applications_before_insert() RETURNS trigger AS $$
DECLARE
  cap  int := COALESCE(NULLIF(current_setting('yd.max_open_applications', true), '')::int, 3);
  open_count int;
BEGIN
  IF NEW.stage <> 'booked' THEN
    RAISE EXCEPTION 'yd_application_start: a placement starts at booked, not %', NEW.stage
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.yd_building_is_matchable(NEW.building_id) THEN
    RAISE EXCEPTION 'yd_building_not_signed: this building has no signed agreement and cannot take renters'
      USING ERRCODE = '23514';
  END IF;
  -- Serialize concurrent bookings for one renter so two requests cannot both
  -- slip under the cap.
  PERFORM 1 FROM public.yd_renters WHERE id = NEW.renter_id AND org_id = NEW.org_id FOR UPDATE;
  SELECT count(*) INTO open_count
    FROM public.yd_applications
   WHERE renter_id = NEW.renter_id
     AND stage IN ('booked', 'registered', 'toured', 'applied', 'approved', 'lease_signed');
  IF open_count >= cap THEN
    RAISE EXCEPTION 'yd_open_application_cap: a renter may hold at most % open applications', cap
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- BEFORE UPDATE: who and where never change; stage moves follow the arrows;
-- the stage's own timestamp is stamped.
CREATE OR REPLACE FUNCTION public.yd_applications_before_update() RETURNS trigger AS $$
DECLARE
  col text;
BEGIN
  IF NEW.renter_id IS DISTINCT FROM OLD.renter_id
     OR NEW.building_id IS DISTINCT FROM OLD.building_id THEN
    RAISE EXCEPTION 'yd_application_fixed: an application''s renter and building never change'
      USING ERRCODE = '23514';
  END IF;
  -- The registration proof is written once.
  IF OLD.registration_sent_at IS NOT NULL
     AND (NEW.registration_sent_at IS DISTINCT FROM OLD.registration_sent_at
          OR NEW.registration_outbox_id IS DISTINCT FROM OLD.registration_outbox_id) THEN
    RAISE EXCEPTION 'yd_registration_locked: the registration timestamp is proof of referral and is never changed'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    IF NOT public.yd_stage_move_ok(OLD.stage, NEW.stage) THEN
      RAISE EXCEPTION 'yd_stage_move: an application cannot go from % to %', OLD.stage, NEW.stage
        USING ERRCODE = '23514';
    END IF;
    col := NEW.stage || '_at';
    IF (to_jsonb(NEW) ->> col) IS NULL THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(col, now()));
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- AFTER INSERT / UPDATE OF stage: one yd_events row per move (spec §3).
-- Actor comes from the session settings yd.actor_kind / yd.actor_id when the
-- caller sets them (SET LOCAL), otherwise 'system'.
CREATE OR REPLACE FUNCTION public.yd_applications_event() RETURNS trigger AS $$
DECLARE
  actor text := COALESCE(NULLIF(current_setting('yd.actor_kind', true), ''), 'system');
  actor_id uuid := NULLIF(current_setting('yd.actor_id', true), '')::uuid;
  from_stage text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.stage ELSE NULL END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.yd_events
    (org_id, name, entity_kind, entity_id, payload, actor_kind, actor_id, idempotency_key)
  VALUES
    (NEW.org_id, 'application.' || NEW.stage, 'application', NEW.id,
     jsonb_build_object('from', from_stage, 'to', NEW.stage,
                        'renter_id', NEW.renter_id, 'building_id', NEW.building_id),
     actor, actor_id, 'app-stage:' || NEW.id::text || ':' || NEW.stage);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yd_applications_before_insert ON public.yd_applications;
CREATE TRIGGER trg_yd_applications_before_insert
  BEFORE INSERT ON public.yd_applications
  FOR EACH ROW EXECUTE FUNCTION public.yd_applications_before_insert();
DROP TRIGGER IF EXISTS trg_yd_applications_before_update ON public.yd_applications;
CREATE TRIGGER trg_yd_applications_before_update
  BEFORE UPDATE ON public.yd_applications
  FOR EACH ROW EXECUTE FUNCTION public.yd_applications_before_update();
DROP TRIGGER IF EXISTS trg_yd_applications_event_ins ON public.yd_applications;
CREATE TRIGGER trg_yd_applications_event_ins
  AFTER INSERT ON public.yd_applications
  FOR EACH ROW EXECUTE FUNCTION public.yd_applications_event();
DROP TRIGGER IF EXISTS trg_yd_applications_event_upd ON public.yd_applications;
CREATE TRIGGER trg_yd_applications_event_upd
  AFTER UPDATE OF stage ON public.yd_applications
  FOR EACH ROW EXECUTE FUNCTION public.yd_applications_event();
-- Placements are never deleted (cancelled / denied rows stay as history).
SELECT public.yd_harden('yd_applications', true);

-- ---------------------------------------------------------------------------
-- E. Tours
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yd_tours (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id),

  application_id  uuid NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz,
  status          text NOT NULL DEFAULT 'booked',

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_tours_application_fk
    FOREIGN KEY (application_id, org_id) REFERENCES public.yd_applications (id, org_id),
  CONSTRAINT yd_tours_status_ck
    CHECK (status IN ('booked', 'rescheduled', 'cancelled', 'noshow', 'completed')),
  CONSTRAINT yd_tours_window_ck CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS yd_tours_application_idx ON public.yd_tours (application_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS yd_tours_start_idx ON public.yd_tours (org_id, starts_at);
SELECT public.yd_harden('yd_tours', true);

-- ---------------------------------------------------------------------------
-- F. Disputes (owner or ops decides within 14 days)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yd_disputes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.orgs(id),

  kind             text NOT NULL,
  subject          jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_by_kind   text NOT NULL,
  opened_by_id     uuid,
  opened_at        timestamptz NOT NULL DEFAULT now(),
  -- opened_at + 14 days when left NULL (YD_DEFAULTS.disputeDays).
  due_by           timestamptz NOT NULL,

  status           text NOT NULL DEFAULT 'open',
  decision         text,
  decided_by       uuid,
  decided_at       timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_disputes_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_disputes_kind_ck CHECK (kind IN ('attribution', 'denial', 'fee')),
  CONSTRAINT yd_disputes_subject_ck CHECK (jsonb_typeof(subject) = 'object'),
  CONSTRAINT yd_disputes_opened_by_ck
    CHECK (opened_by_kind IN ('renter', 'building_user', 'broker', 'staff', 'system')),
  CONSTRAINT yd_disputes_due_ck CHECK (due_by >= opened_at),
  CONSTRAINT yd_disputes_status_ck CHECK (status IN ('open', 'decided')),
  CONSTRAINT yd_disputes_decided_ck CHECK (
    status <> 'decided'
    OR (decision IS NOT NULL AND btrim(decision) <> '' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS yd_disputes_open_idx ON public.yd_disputes (org_id, status, due_by);

CREATE OR REPLACE FUNCTION public.yd_disputes_fill_due() RETURNS trigger AS $$
BEGIN
  IF NEW.due_by IS NULL THEN
    NEW.due_by := COALESCE(NEW.opened_at, now()) + interval '14 days';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.yd_disputes_freeze() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'decided'
     AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'yd_dispute_decided: a decided dispute is never re-decided'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- A BEFORE INSERT trigger runs before NOT NULL is checked, which is what lets
-- due_by be NOT NULL and still default from opened_at.
DROP TRIGGER IF EXISTS trg_yd_disputes_fill_due ON public.yd_disputes;
CREATE TRIGGER trg_yd_disputes_fill_due
  BEFORE INSERT ON public.yd_disputes
  FOR EACH ROW EXECUTE FUNCTION public.yd_disputes_fill_due();
DROP TRIGGER IF EXISTS trg_yd_disputes_freeze ON public.yd_disputes;
CREATE TRIGGER trg_yd_disputes_freeze
  BEFORE UPDATE ON public.yd_disputes
  FOR EACH ROW EXECUTE FUNCTION public.yd_disputes_freeze();
SELECT public.yd_harden('yd_disputes', true);

-- ---------------------------------------------------------------------------
-- G. Lifetime touches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yd_touches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id),

  renter_id       uuid NOT NULL,
  application_id  uuid,
  kind            text NOT NULL,
  due_at          timestamptz NOT NULL,
  sent_at         timestamptz,
  outcome         text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_touches_renter_fk
    FOREIGN KEY (renter_id, org_id) REFERENCES public.yd_renters (id, org_id),
  CONSTRAINT yd_touches_application_fk
    FOREIGN KEY (application_id, org_id) REFERENCES public.yd_applications (id, org_id),
  CONSTRAINT yd_touches_kind_ck
    CHECK (kind IN ('move_in_welcome', 'day_30', 'month_6', 'lease_end_90'))
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_touches_app_kind_uniq
  ON public.yd_touches (application_id, kind) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS yd_touches_due_idx ON public.yd_touches (due_at) WHERE sent_at IS NULL;
SELECT public.yd_harden('yd_touches');

COMMENT ON TABLE public.yd_applications IS
  'Yesdoor placement record (435). Stage moves only along spec §3, each move writes a yd_events row, the registration timestamp is the referral proof, and a renter holds at most 3 open applications.';
