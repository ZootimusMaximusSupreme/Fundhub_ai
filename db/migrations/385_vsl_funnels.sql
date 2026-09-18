-- 385_vsl_funnels.sql — which funnel a video viewing belongs to.
--
-- WHY. Chris asked on 2026-09-17: "how do we account for multiple funnels?" The
-- measured answer was "partly." vsl_watch_sessions (379) saves the video and the
-- page address of every viewing, so two funnels on two pages could already be
-- told apart — but only by raw address. Nothing gave a funnel a name, and nothing
-- grouped viewings by one.
--
-- HOW. A funnel is named by the page address its video sits on. One short list
-- maps a page to a funnel. One view shows every viewing with its funnel.
--
-- WHY NOT A FIELD THE PAGE SCRIPT SENDS. The script pasted onto the ClickFunnels
-- page (clickfunnels-fragments/07-vsl-watch-beacon.html) reads everything off the
-- page and takes no settings by hand. A funnel name typed in per paste would be a
-- step somebody must remember on every page, and a forgotten or mistyped one fails
-- without a sound. Keyed on the address the counter ALREADY saves, this needs no
-- change to the page script and no second paste — and it names viewings recorded
-- BEFORE a funnel was listed, because the address was stored all along.
--
-- AN UNLISTED PAGE IS NOT HIDDEN. A viewing on a page nobody has listed shows with
-- funnel_key NULL and its page address as the name. Nothing is invented and
-- nothing drops out of a count.
--
-- NOTHING IS SEEDED. Naming the live funnel would be a guess (CLAUDE.md §2, never
-- invent). A funnel is listed by inserting one row, once it has a name.

CREATE TABLE IF NOT EXISTS vsl_funnels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id),
  funnel_key  text NOT NULL,
  name        text NOT NULL,
  page_url    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vsl_funnels_key_ck  CHECK (funnel_key ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  CONSTRAINT vsl_funnels_name_ck CHECK (btrim(name) <> ''),
  -- The same shape the page script sends (07-vsl-watch-beacon.html, pageUrl()):
  -- http or https, with nothing after a ? or a #. A listed address carrying
  -- either could never match a saved viewing, and would fail without a sound.
  CONSTRAINT vsl_funnels_page_ck CHECK (page_url ~ '^https?://[^?#]+$')
);

-- ONE PAGE, ONE FUNNEL. Normalised exactly the way the view below matches, so a
-- capital letter or a trailing slash cannot make a second listing of the same
-- page. This is also what stops the view's join from ever counting one viewing
-- twice: there is at most one funnel per page to join to.
CREATE UNIQUE INDEX IF NOT EXISTS vsl_funnels_page_uq
  ON vsl_funnels (org_id, lower(rtrim(page_url, '/')));

-- A funnel may own several pages — a second video page, or a page that moved —
-- so the key is deliberately NOT unique on its own.
CREATE INDEX IF NOT EXISTS vsl_funnels_key_idx
  ON vsl_funnels (org_id, funnel_key);

-- Staff only. The beacon never reads or writes this list.
ALTER TABLE vsl_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsl_funnels FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vsl_funnels_staff ON vsl_funnels;
CREATE POLICY vsl_funnels_staff ON vsl_funnels FOR ALL
  USING (fundhub_is_staff()) WITH CHECK (fundhub_is_staff());

-- updated_at, guarded in the style of 377 Part 4f.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vsl_funnels_updated_at') THEN
    CREATE TRIGGER trg_vsl_funnels_updated_at
      BEFORE UPDATE ON vsl_funnels
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- EVERY VIEWING, WITH ITS FUNNEL.
--
-- security_invoker = true IS MANDATORY (377:588 records why). A plain view runs
-- as its owner, and the owner skips FORCEd policies — so an anonymous visitor
-- reading through a plain view would see every viewing, not only their own.
-- With it, vsl_watch_sessions' own policies (379 Part 6) still decide who sees
-- what, and vsl_funnels' staff-only policy decides who sees a funnel's name.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_vsl_watch_by_funnel
WITH (security_invoker = true) AS
SELECT
  s.id                          AS session_id,
  s.org_id,
  f.funnel_key,
  COALESCE(f.name, s.page_url)  AS funnel_name,
  s.page_url,
  s.video_key,
  s.visitor_id,
  s.ad_number,
  s.started_at,
  s.watched_fraction,
  s.unmuted,
  s.finished
FROM vsl_watch_sessions s
LEFT JOIN vsl_funnels f
  ON  f.org_id = s.org_id
  AND lower(rtrim(f.page_url, '/')) = lower(rtrim(s.page_url, '/'));

COMMENT ON TABLE vsl_funnels IS
  'Names a sales-video funnel by the page address its video sits on. One page belongs to at most one funnel; one funnel may own several pages. Read by v_vsl_watch_by_funnel. Staff only. Nothing is seeded: a funnel is listed once it has a name (385).';

COMMENT ON VIEW v_vsl_watch_by_funnel IS
  'Every viewing in vsl_watch_sessions with the funnel its page belongs to. A viewing on an unlisted page keeps funnel_key NULL and shows its page address as funnel_name, so nothing drops out of a count. Listing a funnel names viewings recorded before it was listed. security_invoker, so 379''s policies still decide who sees which viewing (385).';

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS — stated explicitly, the way 379 Part 7 does, so a database where 104's
-- default privileges do not reach still ends up with a table the app can use.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.vsl_funnels TO fundhub_app;
    GRANT SELECT ON public.v_vsl_watch_by_funnel TO fundhub_app;
  END IF;
END $$;
