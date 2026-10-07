-- 436_yesdoor_money.sql — Yesdoor MVP, part 3 of 3: invoices, the fee ledger,
-- the broker ledger and renter refunds. Depends on 434 and 435.
--
-- Spec: docs/specs/yesdoor-mvp-build-spec.md §2 (Money), §3 (Fee, Broker money).
--
-- This is money, so the database is the guard (same stance as 014/016 for the
-- Fundhub commission ledger, and CLAUDE.md §12: integer cents, NULL = unknown):
--   * nothing is ever deleted (REVOKE + fundhub_no_delete() triggers)
--   * a ledger amount is frozen once the row leaves 'earned'
--   * a refund is a NEW negative row that reverses the original; the original
--     stays, and it can be reversed once, in full
--   * a fee is 'safe' only refund_days after it was paid
--   * a broker is payable only after the fee is safe, and only for a placement
--     that broker first-touched
--   * an invoice's number, total and subject never change once issued

-- ---------------------------------------------------------------------------
-- A. Invoices
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.yd_invoice_number_seq;

CREATE TABLE IF NOT EXISTS public.yd_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id),

  company_id      uuid,
  building_id     uuid,
  -- YD-INV- + 6 digits, minted by trigger from a sequence.
  number          text NOT NULL,
  total_cents     bigint NOT NULL,

  issued_at       timestamptz NOT NULL DEFAULT now(),
  -- issued_at + the building's payment_terms_days when left NULL.
  due_at          timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'open',
  paid_at         timestamptz,
  payment_method  text,
  payment_ref     text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_invoices_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_invoices_company_fk
    FOREIGN KEY (company_id, org_id) REFERENCES public.yd_companies (id, org_id),
  CONSTRAINT yd_invoices_building_fk
    FOREIGN KEY (building_id, org_id) REFERENCES public.yd_buildings (id, org_id),
  CONSTRAINT yd_invoices_subject_ck CHECK (company_id IS NOT NULL OR building_id IS NOT NULL),
  CONSTRAINT yd_invoices_number_ck CHECK (number ~ '^YD-INV-[0-9]{6,}$'),
  CONSTRAINT yd_invoices_total_ck CHECK (total_cents >= 0),
  CONSTRAINT yd_invoices_due_ck CHECK (due_at >= issued_at),
  CONSTRAINT yd_invoices_status_ck CHECK (status IN ('open', 'paid', 'void')),
  CONSTRAINT yd_invoices_method_ck
    CHECK (payment_method IS NULL OR payment_method IN ('ach', 'wire', 'check', 'paymode')),
  CONSTRAINT yd_invoices_paid_ck
    CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND payment_method IS NOT NULL)),
  CONSTRAINT yd_invoices_paid_after_issue_ck CHECK (paid_at IS NULL OR paid_at >= issued_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_invoices_number_uniq ON public.yd_invoices (org_id, number);
CREATE INDEX IF NOT EXISTS yd_invoices_building_idx ON public.yd_invoices (building_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS yd_invoices_company_idx ON public.yd_invoices (company_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS yd_invoices_status_idx ON public.yd_invoices (org_id, status, due_at);

CREATE OR REPLACE FUNCTION public.yd_invoices_before_insert() RETURNS trigger AS $$
DECLARE
  terms int;
BEGIN
  IF NEW.number IS NULL OR btrim(NEW.number) = '' THEN
    NEW.number := 'YD-INV-' || lpad(nextval('public.yd_invoice_number_seq')::text, 6, '0');
  END IF;
  IF NEW.due_at IS NULL THEN
    SELECT payment_terms_days INTO terms FROM public.yd_buildings
     WHERE id = NEW.building_id AND org_id = NEW.org_id;
    NEW.due_at := COALESCE(NEW.issued_at, now()) + (COALESCE(terms, 30) * interval '1 day');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.yd_invoices_before_update() RETURNS trigger AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.building_id IS DISTINCT FROM OLD.building_id
     OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.due_at IS DISTINCT FROM OLD.due_at THEN
    RAISE EXCEPTION 'yd_invoice_frozen: an issued invoice''s number, total, subject and dates never change — void it and issue a new one'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'open' AND NEW.status IN ('paid', 'void')) THEN
      RAISE EXCEPTION 'yd_invoice_move: an invoice cannot go from % to %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
  ELSIF OLD.status <> 'open'
        AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'yd_invoice_frozen: a % invoice is never changed', OLD.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yd_invoices_before_insert ON public.yd_invoices;
CREATE TRIGGER trg_yd_invoices_before_insert
  BEFORE INSERT ON public.yd_invoices
  FOR EACH ROW EXECUTE FUNCTION public.yd_invoices_before_insert();
DROP TRIGGER IF EXISTS trg_yd_invoices_before_update ON public.yd_invoices;
CREATE TRIGGER trg_yd_invoices_before_update
  BEFORE UPDATE ON public.yd_invoices
  FOR EACH ROW EXECUTE FUNCTION public.yd_invoices_before_update();
SELECT public.yd_harden('yd_invoices', true);

-- ---------------------------------------------------------------------------
-- B. The fee ledger
-- ---------------------------------------------------------------------------

-- yd_fee_move_ok(kind, from, to) — earned -> invoiced -> paid -> safe, with void
-- as the exit. A refund row is a credit and never reaches 'safe'.
CREATE OR REPLACE FUNCTION public.yd_fee_move_ok(p_kind text, p_from text, p_to text) RETURNS boolean AS $$
  SELECT CASE p_kind
    WHEN 'placement_fee' THEN (p_from, p_to) IN (
      ('earned', 'invoiced'), ('earned', 'void'),
      ('invoiced', 'paid'),   ('invoiced', 'void'),
      ('paid', 'safe'))
    WHEN 'refund' THEN (p_from, p_to) IN (
      ('earned', 'paid'), ('earned', 'void'))
    ELSE false
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE IF NOT EXISTS public.yd_fee_ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.orgs(id),

  application_id   uuid NOT NULL,
  building_id      uuid NOT NULL,
  kind             text NOT NULL,
  -- Cents. Positive for a placement fee, negative for a refund.
  amount_cents     bigint NOT NULL,

  status           text NOT NULL DEFAULT 'earned',
  invoice_id       uuid,
  -- A refund row points at the placement row it reverses.
  reverses_id      uuid,

  earned_at        timestamptz NOT NULL DEFAULT now(),
  invoiced_at      timestamptz,
  paid_at          timestamptz,
  safe_at          timestamptz,

  -- Replaying the same move-in can never earn the fee twice.
  idempotency_key  text NOT NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_fee_ledger_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_fee_ledger_application_fk
    FOREIGN KEY (application_id, org_id, building_id)
    REFERENCES public.yd_applications (id, org_id, building_id),
  CONSTRAINT yd_fee_ledger_invoice_fk
    FOREIGN KEY (invoice_id, org_id) REFERENCES public.yd_invoices (id, org_id),
  CONSTRAINT yd_fee_ledger_reverses_fk
    FOREIGN KEY (reverses_id, org_id) REFERENCES public.yd_fee_ledger (id, org_id),
  CONSTRAINT yd_fee_ledger_kind_ck CHECK (kind IN ('placement_fee', 'refund')),
  CONSTRAINT yd_fee_ledger_status_ck CHECK (status IN ('earned', 'invoiced', 'paid', 'safe', 'void')),
  CONSTRAINT yd_fee_ledger_amount_ck CHECK (
    (kind = 'placement_fee' AND amount_cents > 0) OR (kind = 'refund' AND amount_cents < 0)
  ),
  CONSTRAINT yd_fee_ledger_reverses_ck CHECK ((kind = 'refund') = (reverses_id IS NOT NULL)),
  CONSTRAINT yd_fee_ledger_refund_status_ck
    CHECK (kind <> 'refund' OR status IN ('earned', 'paid', 'void')),
  CONSTRAINT yd_fee_ledger_key_ck CHECK (char_length(btrim(idempotency_key)) >= 1),
  -- A placement fee that has left 'earned' (except by void) has been invoiced.
  CONSTRAINT yd_fee_ledger_invoiced_ck CHECK (
    kind = 'refund' OR status NOT IN ('invoiced', 'paid', 'safe')
    OR (invoice_id IS NOT NULL AND invoiced_at IS NOT NULL)
  ),
  CONSTRAINT yd_fee_ledger_paid_ck CHECK (
    status NOT IN ('paid', 'safe') OR paid_at IS NOT NULL
  ),
  CONSTRAINT yd_fee_ledger_safe_ck CHECK (status <> 'safe' OR safe_at IS NOT NULL),
  -- Time only runs forward: billed, then paid, then safe.
  CONSTRAINT yd_fee_ledger_order_ck CHECK (
    (paid_at IS NULL OR invoiced_at IS NULL OR paid_at >= invoiced_at)
    AND (safe_at IS NULL OR paid_at IS NULL OR safe_at >= paid_at)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_fee_ledger_idem_uniq ON public.yd_fee_ledger (org_id, idempotency_key);
-- A placement row is reversed once, in full.
CREATE UNIQUE INDEX IF NOT EXISTS yd_fee_ledger_reverses_uniq
  ON public.yd_fee_ledger (reverses_id) WHERE reverses_id IS NOT NULL;
-- One placement fee per application.
CREATE UNIQUE INDEX IF NOT EXISTS yd_fee_ledger_one_fee_uniq
  ON public.yd_fee_ledger (application_id) WHERE kind = 'placement_fee' AND status <> 'void';
CREATE INDEX IF NOT EXISTS yd_fee_ledger_building_idx ON public.yd_fee_ledger (building_id, status);
CREATE INDEX IF NOT EXISTS yd_fee_ledger_invoice_idx ON public.yd_fee_ledger (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS yd_fee_ledger_status_idx ON public.yd_fee_ledger (org_id, status);

CREATE OR REPLACE FUNCTION public.yd_fee_ledger_before_insert() RETURNS trigger AS $$
DECLARE
  orig public.yd_fee_ledger;
BEGIN
  IF NEW.kind = 'refund' THEN
    SELECT * INTO orig FROM public.yd_fee_ledger WHERE id = NEW.reverses_id AND org_id = NEW.org_id;
    IF NOT FOUND OR orig.kind <> 'placement_fee'
       OR orig.application_id <> NEW.application_id OR orig.building_id <> NEW.building_id THEN
      RAISE EXCEPTION 'yd_refund_target: a refund must reverse a placement fee on the same application'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.amount_cents <> -orig.amount_cents THEN
      RAISE EXCEPTION 'yd_refund_amount: a refund reverses the original in full (% expected, got %)',
        -orig.amount_cents, NEW.amount_cents USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- The invoice must be this building's (or its company's).
CREATE OR REPLACE FUNCTION public.yd_fee_ledger_invoice_guard() RETURNS trigger AS $$
DECLARE
  inv public.yd_invoices;
  b_company uuid;
BEGIN
  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO inv FROM public.yd_invoices WHERE id = NEW.invoice_id AND org_id = NEW.org_id;
  SELECT company_id INTO b_company FROM public.yd_buildings WHERE id = NEW.building_id AND org_id = NEW.org_id;
  IF inv.building_id IS DISTINCT FROM NEW.building_id
     AND (inv.company_id IS NULL OR inv.company_id IS DISTINCT FROM b_company) THEN
    RAISE EXCEPTION 'yd_invoice_subject: that invoice belongs to a different building'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.yd_fee_ledger_before_update() RETURNS trigger AS $$
DECLARE
  days int;
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.building_id IS DISTINCT FROM OLD.building_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.reverses_id IS DISTINCT FROM OLD.reverses_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.earned_at IS DISTINCT FROM OLD.earned_at THEN
    RAISE EXCEPTION 'yd_ledger_frozen: a ledger row''s identity never changes'
      USING ERRCODE = '23514';
  END IF;
  -- A stamped time is evidence: once set it never moves (NULL -> value is fine).
  IF (OLD.invoiced_at IS NOT NULL AND NEW.invoiced_at IS DISTINCT FROM OLD.invoiced_at)
     OR (OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at)
     OR (OLD.safe_at IS NOT NULL AND NEW.safe_at IS DISTINCT FROM OLD.safe_at) THEN
    RAISE EXCEPTION 'yd_ledger_time_fixed: a stamped invoiced / paid / safe time never changes'
      USING ERRCODE = '23514';
  END IF;
  -- Amounts may be corrected while a fee is still only 'earned'.
  IF OLD.status <> 'earned' AND NEW.amount_cents IS DISTINCT FROM OLD.amount_cents THEN
    RAISE EXCEPTION 'yd_ledger_amount_frozen: the amount is frozen once the row has left earned — reverse it with a refund row'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('safe', 'void') AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'yd_ledger_frozen: a % row is never changed', OLD.status USING ERRCODE = '23514';
  END IF;
  -- Once invoiced, the row stays on that invoice.
  IF OLD.invoice_id IS NOT NULL AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
    RAISE EXCEPTION 'yd_ledger_invoice_fixed: a fee stays on the invoice it was billed on'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.yd_fee_move_ok(OLD.kind, OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'yd_ledger_move: a % row cannot go from % to %', OLD.kind, OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'invoiced' AND NEW.invoiced_at IS NULL THEN NEW.invoiced_at := now(); END IF;
    IF NEW.status = 'paid'     AND NEW.paid_at     IS NULL THEN NEW.paid_at     := now(); END IF;
    IF NEW.status = 'safe' THEN
      SELECT refund_days INTO days FROM public.yd_buildings WHERE id = NEW.building_id AND org_id = NEW.org_id;
      IF now() < OLD.paid_at + (COALESCE(days, 60) * interval '1 day') THEN
        RAISE EXCEPTION 'yd_not_safe_yet: a fee is safe only % days after it was paid', COALESCE(days, 60)
          USING ERRCODE = '23514';
      END IF;
      IF NEW.safe_at IS NULL THEN NEW.safe_at := now(); END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yd_fee_ledger_before_insert ON public.yd_fee_ledger;
CREATE TRIGGER trg_yd_fee_ledger_before_insert
  BEFORE INSERT ON public.yd_fee_ledger
  FOR EACH ROW EXECUTE FUNCTION public.yd_fee_ledger_before_insert();
DROP TRIGGER IF EXISTS trg_yd_fee_ledger_invoice_guard ON public.yd_fee_ledger;
CREATE TRIGGER trg_yd_fee_ledger_invoice_guard
  BEFORE INSERT OR UPDATE OF invoice_id ON public.yd_fee_ledger
  FOR EACH ROW EXECUTE FUNCTION public.yd_fee_ledger_invoice_guard();
DROP TRIGGER IF EXISTS trg_yd_fee_ledger_before_update ON public.yd_fee_ledger;
CREATE TRIGGER trg_yd_fee_ledger_before_update
  BEFORE UPDATE ON public.yd_fee_ledger
  FOR EACH ROW EXECUTE FUNCTION public.yd_fee_ledger_before_update();
SELECT public.yd_harden('yd_fee_ledger', true);

-- ---------------------------------------------------------------------------
-- C. The broker ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yd_broker_ledger (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.orgs(id),

  broker_id      uuid NOT NULL,
  fee_ledger_id  uuid NOT NULL,
  amount_cents   bigint NOT NULL,

  status         text NOT NULL DEFAULT 'earned',
  hold_until     timestamptz,
  paid_at        timestamptz,
  payout_ref     text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_broker_ledger_id_org_uq UNIQUE (id, org_id),
  CONSTRAINT yd_broker_ledger_broker_fk
    FOREIGN KEY (broker_id, org_id) REFERENCES public.yd_brokers (id, org_id),
  CONSTRAINT yd_broker_ledger_fee_fk
    FOREIGN KEY (fee_ledger_id, org_id) REFERENCES public.yd_fee_ledger (id, org_id),
  CONSTRAINT yd_broker_ledger_amount_ck CHECK (amount_cents >= 0),
  CONSTRAINT yd_broker_ledger_status_ck CHECK (status IN ('earned', 'held', 'payable', 'paid', 'void')),
  CONSTRAINT yd_broker_ledger_held_ck
    CHECK (status NOT IN ('held', 'payable', 'paid') OR hold_until IS NOT NULL),
  CONSTRAINT yd_broker_ledger_paid_ck
    CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND payout_ref IS NOT NULL AND btrim(payout_ref) <> ''))
);
-- One broker row per fee: a placement has one first-touch broker.
CREATE UNIQUE INDEX IF NOT EXISTS yd_broker_ledger_fee_uniq ON public.yd_broker_ledger (fee_ledger_id);
CREATE INDEX IF NOT EXISTS yd_broker_ledger_broker_idx ON public.yd_broker_ledger (broker_id, status);

CREATE OR REPLACE FUNCTION public.yd_broker_ledger_before_insert() RETURNS trigger AS $$
DECLARE
  fee public.yd_fee_ledger;
  app_broker uuid;
BEGIN
  SELECT * INTO fee FROM public.yd_fee_ledger WHERE id = NEW.fee_ledger_id AND org_id = NEW.org_id;
  IF NOT FOUND OR fee.kind <> 'placement_fee' THEN
    RAISE EXCEPTION 'yd_broker_fee: a broker is paid on a placement fee row' USING ERRCODE = '23514';
  END IF;
  SELECT broker_id INTO app_broker FROM public.yd_applications
   WHERE id = fee.application_id AND org_id = NEW.org_id;
  IF app_broker IS DISTINCT FROM NEW.broker_id THEN
    RAISE EXCEPTION 'yd_broker_attribution: this placement was not first-touched by that broker'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.amount_cents > fee.amount_cents THEN
    RAISE EXCEPTION 'yd_broker_amount: a broker cannot be owed more than the fee' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.yd_broker_ledger_before_update() RETURNS trigger AS $$
DECLARE
  fee_status text;
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.broker_id IS DISTINCT FROM OLD.broker_id
     OR NEW.fee_ledger_id IS DISTINCT FROM OLD.fee_ledger_id
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents THEN
    RAISE EXCEPTION 'yd_ledger_frozen: a broker ledger row''s broker, fee and amount never change'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('paid', 'void') AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'yd_ledger_frozen: a % row is never changed', OLD.status USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'earned'  AND NEW.status IN ('held', 'void'))
      OR (OLD.status = 'held'    AND NEW.status IN ('payable', 'void'))
      OR (OLD.status = 'payable' AND NEW.status IN ('paid', 'void'))
    ) THEN
      RAISE EXCEPTION 'yd_broker_move: a broker row cannot go from % to %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
    -- The 60-day hold: payable and paid only once the building's fee is safe.
    IF NEW.status IN ('payable', 'paid') THEN
      SELECT status INTO fee_status FROM public.yd_fee_ledger
       WHERE id = NEW.fee_ledger_id AND org_id = NEW.org_id;
      IF fee_status IS DISTINCT FROM 'safe' THEN
        RAISE EXCEPTION 'yd_broker_hold: a broker is payable only after the building''s fee is safe'
          USING ERRCODE = '23514';
      END IF;
      IF NEW.hold_until IS NOT NULL AND now() < NEW.hold_until THEN
        RAISE EXCEPTION 'yd_broker_hold: the hold runs until %', NEW.hold_until USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN NEW.paid_at := now(); END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- A refunded fee voids the broker's unpaid share (spec §3). A share that was
-- already paid out is left alone: that is a clawback for the broker ledger
-- endpoints (B4) to decide, not something a trigger should guess.
CREATE OR REPLACE FUNCTION public.yd_fee_refund_voids_broker() RETURNS trigger AS $$
BEGIN
  IF NEW.kind = 'refund' THEN
    UPDATE public.yd_broker_ledger
       SET status = 'void'
     WHERE fee_ledger_id = NEW.reverses_id AND org_id = NEW.org_id
       AND status IN ('earned', 'held', 'payable');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yd_broker_ledger_before_insert ON public.yd_broker_ledger;
CREATE TRIGGER trg_yd_broker_ledger_before_insert
  BEFORE INSERT ON public.yd_broker_ledger
  FOR EACH ROW EXECUTE FUNCTION public.yd_broker_ledger_before_insert();
DROP TRIGGER IF EXISTS trg_yd_broker_ledger_before_update ON public.yd_broker_ledger;
CREATE TRIGGER trg_yd_broker_ledger_before_update
  BEFORE UPDATE ON public.yd_broker_ledger
  FOR EACH ROW EXECUTE FUNCTION public.yd_broker_ledger_before_update();
DROP TRIGGER IF EXISTS trg_yd_fee_ledger_refund_voids_broker ON public.yd_fee_ledger;
CREATE TRIGGER trg_yd_fee_ledger_refund_voids_broker
  AFTER INSERT ON public.yd_fee_ledger
  FOR EACH ROW EXECUTE FUNCTION public.yd_fee_refund_voids_broker();
SELECT public.yd_harden('yd_broker_ledger', true);

-- ---------------------------------------------------------------------------
-- D. Renter refunds (a building that did not waive its application fee said no
--    to an approved renter, spec §5)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.yd_renter_refunds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id),

  renter_id       uuid NOT NULL,
  application_id  uuid NOT NULL,
  reason          text NOT NULL DEFAULT 'app_fee_mismatch',
  amount_cents    bigint NOT NULL,
  status          text NOT NULL DEFAULT 'owed',
  paid_at         timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yd_renter_refunds_application_fk
    FOREIGN KEY (application_id, org_id, renter_id)
    REFERENCES public.yd_applications (id, org_id, renter_id),
  CONSTRAINT yd_renter_refunds_reason_ck CHECK (reason IN ('app_fee_mismatch')),
  CONSTRAINT yd_renter_refunds_amount_ck CHECK (amount_cents > 0),
  CONSTRAINT yd_renter_refunds_status_ck CHECK (status IN ('owed', 'paid', 'void')),
  CONSTRAINT yd_renter_refunds_paid_ck CHECK (status <> 'paid' OR paid_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS yd_renter_refunds_app_uniq
  ON public.yd_renter_refunds (application_id, reason);
CREATE INDEX IF NOT EXISTS yd_renter_refunds_status_idx ON public.yd_renter_refunds (org_id, status);

CREATE OR REPLACE FUNCTION public.yd_renter_refunds_before_update() RETURNS trigger AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.renter_id IS DISTINCT FROM OLD.renter_id
     OR NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents THEN
    RAISE EXCEPTION 'yd_refund_frozen: a renter refund''s renter, application, reason and amount never change'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'owed' AND NEW.status IN ('paid', 'void')) THEN
      RAISE EXCEPTION 'yd_refund_move: a refund cannot go from % to %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN NEW.paid_at := now(); END IF;
  ELSIF OLD.status <> 'owed' AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'yd_refund_frozen: a % refund is never changed', OLD.status USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yd_renter_refunds_before_update ON public.yd_renter_refunds;
CREATE TRIGGER trg_yd_renter_refunds_before_update
  BEFORE UPDATE ON public.yd_renter_refunds
  FOR EACH ROW EXECUTE FUNCTION public.yd_renter_refunds_before_update();
SELECT public.yd_harden('yd_renter_refunds', true);

-- The invoice-number trigger calls nextval() as the app role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT USAGE, SELECT ON SEQUENCE public.yd_invoice_number_seq TO fundhub_app;
  END IF;
END $$;

COMMENT ON TABLE public.yd_fee_ledger IS
  'Yesdoor fee ledger (436): earned -> invoiced -> paid -> safe (paid + refund_days). Integer cents. Amount frozen once invoiced; a refund is a new negative row that reverses the original in full. Never deleted.';
COMMENT ON TABLE public.yd_broker_ledger IS
  'Yesdoor broker share (436): earned -> held -> payable -> paid, payable only after the building fee is safe. Voids if the fee is refunded.';
