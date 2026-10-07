-- 434_staff_calendar_links.sql — a staff member's own Google calendar, plugged into the CRM.
--
-- Chris, 2026-10-07: "Tell them to plug it into the CRM. It should just be
-- something they plug in." Board: ops/workflows/team-setup-sarah-justice-2026-10-07.md.
--
-- One row per staff member. They type the address of their Google calendar on
-- the Calendar screen (public/app/calendar.html) and share that calendar with
-- the calendar owner at "See only free/busy". Then:
--   * the sync job (src/workflows/staff-calendar-busy-sync.mjs) reads their
--     busy times every five minutes and writes private "Busy - <first name>"
--     blocks onto the owner's calendar, which the booking page checks;
--   * a booked call (src/workflows/s-04d-closer-calendar-invite.mjs) adds every
--     connected closer to the call as a guest.
--
-- status:
--   pending   — saved, not readable yet. last_error says why in plain words
--               ("Not shared yet", "Waiting on Chris's Google approval").
--   connected — Google answered for this calendar on the last check.
--   error     — something else went wrong. last_error says what.
--
-- blocks_booking: true means this person's busy times close slots on the
-- booking page. Default true.
--
-- No address is stored anywhere but here, and no address is hardcoded in code:
-- each person types their own.
--
-- ROW SECURITY. Same shape as every staff and hiring table in this repo (364,
-- 432): RLS on and forced, one named permissive policy, and the org boundary is
-- enforced in the application, where every read and write names org_id and
-- staff_id (src/staff/calendar-sync.mjs). The trigger below also refuses a row
-- whose org is not the staff member's own org, so a link can never cross orgs.

CREATE TABLE IF NOT EXISTS public.staff_calendar_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES orgs(id),
  staff_id         uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  calendar_email   text NOT NULL,
  blocks_booking   boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'pending',
  last_checked_at  timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT staff_calendar_links_staff_uniq UNIQUE (staff_id),
  CONSTRAINT staff_calendar_links_status_ck
    CHECK (status IN ('pending', 'connected', 'error')),
  -- Stored trimmed and lower-case, shaped like an address, and short enough to be one.
  CONSTRAINT staff_calendar_links_email_ck
    CHECK (calendar_email = lower(btrim(calendar_email))
           AND char_length(calendar_email) BETWEEN 3 AND 254
           AND calendar_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT staff_calendar_links_error_ck
    CHECK (last_error IS NULL OR char_length(last_error) <= 500)
);

CREATE INDEX IF NOT EXISTS staff_calendar_links_org_idx
  ON public.staff_calendar_links (org_id, status);

COMMENT ON TABLE public.staff_calendar_links IS
  'A staff member''s own Google calendar, typed in on the Calendar screen. Busy times become private blocks on the owner''s calendar; connected closers are added to booked calls (434).';
COMMENT ON COLUMN public.staff_calendar_links.last_error IS
  'Plain words for the person who owns the row: "Not shared yet", "Waiting on Chris''s Google approval", or what went wrong.';

-- The org on the link must be the staff member's own org.
CREATE OR REPLACE FUNCTION public.staff_calendar_links_org_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff s WHERE s.id = NEW.staff_id AND s.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'staff_calendar_links: staff % is not in org %', NEW.staff_id, NEW.org_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_staff_calendar_links_org_guard') THEN
    CREATE TRIGGER trg_staff_calendar_links_org_guard
      BEFORE INSERT OR UPDATE OF org_id, staff_id ON public.staff_calendar_links
      FOR EACH ROW EXECUTE FUNCTION public.staff_calendar_links_org_guard();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_staff_calendar_links_updated_at') THEN
    CREATE TRIGGER trg_staff_calendar_links_updated_at
      BEFORE UPDATE ON public.staff_calendar_links
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

ALTER TABLE public.staff_calendar_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_calendar_links FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'staff_calendar_links'
       AND policyname = 'staff_calendar_links_app_all'
  ) THEN
    CREATE POLICY staff_calendar_links_app_all ON public.staff_calendar_links
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_calendar_links TO fundhub_app;
    REVOKE TRUNCATE ON public.staff_calendar_links FROM fundhub_app;
  END IF;
END $$;
