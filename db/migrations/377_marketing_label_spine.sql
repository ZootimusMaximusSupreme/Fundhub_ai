-- 377_marketing_label_spine.sql — turn the angle and the hook into COLUMNS, and
-- carry them down the chain script → creative → ad.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE PROBLEM, IN ONE SENTENCE
--
-- Right now an angle and a hook are prose. They live as words inside
-- docs/ads/CONCEPTS.md and docs/ads/ANGLE-GENERATOR.md, and there is no table
-- anywhere in db/ that holds a script, a piece of copy, an angle, a hook or a
-- concept — grepped 2026-09-08 across db/schema, db/migrations and db/seed, and
-- nothing matched. Scripts exist only as markdown files and as
-- docs/ads/registry.json.
--
-- Prose cannot be grouped, sorted or counted. So "which hook books calls
-- cheapest" is a reading exercise instead of one query. This migration makes
-- the labels into fields so the question becomes a GROUP BY.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DOES, IN FOUR PARTS
--
--   1. A FundHub house partner row, because every ad table in this codebase has
--      partner_id NOT NULL and Chris's own ads belong to no partner.
--   2. ad_scripts — the words, plus five labels, versioned.
--   3. ad_labels — one dictionary that gives a label key a human name.
--   4. Three columns on tables that already exist, one view, and RLS.
--
-- Nothing here redesigns an existing table, and nothing here deletes anything.
-- Additive and idempotent. Re-running it is a no-op — every CREATE is
-- IF NOT EXISTS, every trigger and policy is DROP-then-CREATE, both seeds are
-- guarded, and Part 0 below is what keeps the ad_labels seed legal on a second
-- run once the lock from Part 4e is already switched on.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE STYLE DEVIATION, STATED ONCE
--
-- 375 and 376 open with a "COMPLIANCE REVIEW REQUIRED (CLAUDE.md §7)" banner.
-- §7 was removed owner-set 2026-09-08. This file deliberately carries no such
-- banner and no successor to it.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--
--   * No new enum type. The only typed column here, lane, reuses ad_lane from
--     286_client_ad_attribution.sql:62.
--   * No definition of "conversion". The view carries raw ids and labels; the
--     numbers stay in ad_metrics_daily where Meta put them.
--   * No backfill of the 24 ads in docs/ads/registry.json or the 48 concepts in
--     docs/ads/CONCEPTS.md. The concept-to-ad mapping does not exist anywhere
--     readable, so inventing one would be a guess, and a guess written into the
--     database is worse than an empty table.
--   * No mechanism / enemy / audience / awareness / hook-shape column. The
--     target names five labels. Adding a sixth later is one ALTER TABLE.
--   * No ad-level video tracking. Meta already reports the drop-off curve
--     (3sec / p25 / p50 / p75 / p95 / p100 plus ThruPlay).
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NULL MEANS UNKNOWN (CLAUDE.md §12)
--
-- Every label column below is nullable and every one of them means "nobody has
-- said yet". None of them is ever defaulted to 0 or to an empty string, and the
-- CHECKs are all written as "IS NULL OR <shape>" so an unclassified row is
-- always legal. An unlabelled script is a normal script that nobody has sorted
-- yet — it is not a broken row.


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 0 — ACT AS STAFF FOR THE LENGTH OF THIS MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS LINE EXISTS. Part 3 seeds eight dictionary rows into ad_labels, and
-- Part 4e then switches FORCEd row-level security on over that table. On the
-- FIRST run the seed happens before the lock, so it lands. On a SECOND run the
-- lock is already on, and ad_labels_staff_write demands fundhub_is_staff(),
-- which is false in a migration session — so the re-run could fail instead of
-- being the no-op this file's header promises.
--
-- Setting the actor GUC to 'staff' makes every write below pass its own
-- policies whatever order things ran in previously.
--
-- is_local = true IS LOAD-BEARING. db/migrate.mjs:218-222 wraps each file in
-- BEGIN / COMMIT, so a transaction-local setting dies at the COMMIT. It must
-- not be session-scoped: migrate.mjs re-uses one pooled client across files
-- (db/migrate.mjs:207-213), and a session-level 'staff' would leak into every
-- later migration on that same connection.

SELECT set_config('fundhub.actor', 'staff', true);


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — THE HOUSE PARTNER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- creative_assets.partner_id (045:166) and ads.partner_id (046:284) are both
-- NOT NULL REFERENCES partners. Chris's own five running ads belong to no
-- white-label partner, and there is no house/default/internal partner row in
-- any migration or seed file — the only partner-creating paths in the tree are
-- the demo seed and test fixtures. So one is created here.
--
-- IT MUST BE THE DEFAULT ORG. db/schema/001_init.sql:36 seeds exactly one org,
-- slug 'fundhub', is_default true. 052_config_defaults.sql:51-58 seeds
-- ad_platform_category_map ONLY WHERE o.is_default, and without that row the
-- trigger at 046:348-354 refuses every Meta campaign insert. A house partner in
-- any other org could never run a Meta campaign.
--
-- status IS LEFT AT ITS DEFAULT, 'invited', AND THAT IS THE LOAD-BEARING WORD.
-- 282_partner_production_floor.sql:102-116 stamps activated_at := now() the
-- moment a partner row says 'active'. src/partners/floors.mjs:609-615 then feeds
-- it to the monthly grader (src/workflows/partner-production-floor.mjs:56, cron
-- '0 14 1 * *'), which scores a partner on funded clients and can cut revenue
-- share from 50 to 20 after a warning and a final notice. This partner will
-- never have a funded client, because it is a container for our own ads. At
-- 'invited' with activated_at NULL, two independent refusals in
-- src/partners/floors.mjs:229-233 keep it out of that machine.
--
--   ⚠️ NEVER FLIP THIS ROW TO 'active'. Doing so starts the grader on a partner
--      that cannot pass, and the stamp it leaves behind cannot be un-stamped by
--      setting the status back.
--
-- is_demo IS LEFT AT ITS DEFAULT, false. src/demo/platform-seed.mjs:526-533
-- deletes partners where is_demo AND the demo slug. Both have to stay false and
-- different, or a demo wipe destroys the row every one of Chris's ads hangs off.
--
-- agreement_signed_at AND contact_email ARE NEVER SET. 042:227-248 requires a
-- signed agreement and status='active' before any payout can move, so leaving
-- both unset makes this partner structurally unpayable. That is correct: it is
-- a filing cabinet, not a business relationship.
--
-- GUARDED WITH NOT EXISTS so a re-run is a no-op and a row inserted by hand on
-- the live database is not duplicated.

INSERT INTO partners (org_id, name, brand_name, slug, notes)
SELECT o.id, 'FundHub (house)', 'FundHub', 'fundhub-house',
       'FundHub''s own ads, scripts and creative. Not a white-label partner. Deliberately left at status=''invited'' with activated_at NULL so the monthly production-floor grader never touches it — see 377''s header.'
  FROM orgs o
 WHERE o.is_default
   AND NOT EXISTS (
     SELECT 1 FROM partners p WHERE p.org_id = o.id AND p.slug = 'fundhub-house'
   );


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — ad_scripts
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One row is ONE VERSION OF ONE SCRIPT. A rewrite is a NEW row pointing back at
-- the row it replaced. Nothing is overwritten, so a rewrite can always be read
-- next to the thing it came from.
--
-- WHY A uuid AND NOT THE CONCEPT SHEET NUMBER. The 1-48 numbering in
-- docs/ads/CONCEPTS.md has already been renumbered once (its own line 23-24
-- recommends "7 and 11" while the body headings for those pieces read 28 and
-- 14), and those numbers collide with the ad numbers in registry.json —
-- concept 16 is "The Order You Apply In" and ad 16 is "phase". A sheet number is
-- a sort position, not an identity.

CREATE TABLE IF NOT EXISTS ad_scripts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id),
  -- NOT NULL for the reason 045:89-94 gives for brand_kits: a nullable
  -- partner_id here would be a row no policy matches and nobody owns. Chris's
  -- own scripts hang off the house partner from Part 1.
  partner_id        uuid NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,

  -- The version this one rewrote. NULL = this is the original, nothing came
  -- before it. Same shape and same RESTRICT as creative_assets.parent_asset_id
  -- (045:192): a parent must not vanish out from under the rewrite that
  -- explains where it came from.
  parent_script_id  uuid REFERENCES ad_scripts(id) ON DELETE RESTRICT,
  version           integer NOT NULL DEFAULT 1,

  title             text,
  body              text NOT NULL,
  hook_text         text,

  -- ─── the five labels ───────────────────────────────────────────────────
  script_type       text,
  lane              ad_lane,
  angle_key         text,
  hook_key          text,
  offer_key         text,

  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- A script with no words is not a script. Non-blank only, matching
  -- ads_name_ck (046:312) — never a length rule, because a six-word hook test
  -- is a real script.
  CONSTRAINT ad_scripts_body_ck    CHECK (btrim(body) <> ''),
  CONSTRAINT ad_scripts_version_ck CHECK (version > 0),
  CONSTRAINT ad_scripts_not_self_ck
    CHECK (parent_script_id IS NULL OR parent_script_id <> id),

  -- The four free-text labels share one shape, copied verbatim from the checker
  -- that already validates origin_angle at scripts/ads/check-script.mjs:452,
  -- whose own worked example is "denial_angle". Lower case, digits and
  -- underscores, starting with a letter. NULL is always allowed: an
  -- unclassified script is a normal script.
  CONSTRAINT ad_scripts_type_ck
    CHECK (script_type IS NULL OR script_type ~ '^[a-z][a-z0-9_]{1,48}$'),
  CONSTRAINT ad_scripts_angle_ck
    CHECK (angle_key  IS NULL OR angle_key  ~ '^[a-z][a-z0-9_]{1,48}$'),
  CONSTRAINT ad_scripts_hook_ck
    CHECK (hook_key   IS NULL OR hook_key   ~ '^[a-z][a-z0-9_]{1,48}$'),
  CONSTRAINT ad_scripts_offer_ck
    CHECK (offer_key  IS NULL OR offer_key  ~ '^[a-z][a-z0-9_]{1,48}$')
);

CREATE INDEX IF NOT EXISTS ad_scripts_partner_idx
  ON ad_scripts (partner_id, created_at DESC);

-- THESE THREE INDEXES ARE CHRIS'S QUESTIONS, WRITTEN DOWN. "Which hook books
-- calls cheapest", "do cause-first angles hold longer", "which lane converts on
-- cold traffic". Partial on NOT NULL because most rows start unclassified and
-- an unclassified row is not something anybody groups by.
CREATE INDEX IF NOT EXISTS ad_scripts_angle_idx
  ON ad_scripts (org_id, angle_key) WHERE angle_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ad_scripts_hook_idx
  ON ad_scripts (org_id, hook_key)  WHERE hook_key  IS NOT NULL;
CREATE INDEX IF NOT EXISTS ad_scripts_lane_type_idx
  ON ad_scripts (org_id, lane, script_type);

-- Read a rewrite next to its parent in one join.
CREATE INDEX IF NOT EXISTS ad_scripts_parent_idx
  ON ad_scripts (parent_script_id) WHERE parent_script_id IS NOT NULL;

COMMENT ON TABLE ad_scripts IS
  'One row per VERSION of one script — an ad script, a VSL, a piece of landing page copy. A rewrite is a new row whose parent_script_id points at the row it replaced, so nothing is ever overwritten and a rewrite can always be read beside its parent. Carries the five labels (script_type, lane, angle_key, hook_key, offer_key) that ride down the chain to creative_assets and then to ads. Retired with archived_at, never deleted: deleting a script takes its labels with it and every ad that used it loses its meaning.';

COMMENT ON COLUMN ad_scripts.partner_id IS
  'Whose script this is. NOT NULL — a row no partner owns is a row no RLS policy matches. FundHub''s own scripts belong to the house partner (slug ''fundhub-house'', created in 377).';
COMMENT ON COLUMN ad_scripts.parent_script_id IS
  'The script version this one rewrote. NULL = this is the original, nothing came before it. ON DELETE RESTRICT so a parent cannot vanish out from under the rewrite that explains where it came from — the same rule creative_assets.parent_asset_id follows (045:192).';
COMMENT ON COLUMN ad_scripts.version IS
  'Which draft this is: 1, 2, 3. For humans reading a list. It is NOT the key — id is — because two branches of a rewrite can legitimately both be version 2.';
COMMENT ON COLUMN ad_scripts.title IS
  'What Chris calls it, e.g. "Denial Angle". NULL is normal and is never a defect: 21 of the 24 ads in docs/ads/registry.json have no title and track correctly, because utm_content resolves on its leading digits alone. Naming is never a blocker (owner-set 2026-09-06).';
COMMENT ON COLUMN ad_scripts.body IS
  'The whole script exactly as written — HOOK / BODY / CTA / CLOSE for an ad, the beats for a VSL, the page copy for a landing page. One text column and not one column per section, because scripts/ads/check-script.mjs already parses the locked format out of the whole text and a second parse written in SQL would drift away from it.';
COMMENT ON COLUMN ad_scripts.hook_text IS
  'The first 0-3 seconds, word for word. NULL = this piece has no hook, which is normal for landing page copy. Stored beside the body so "show me the hook that booked the cheapest call" is a column read rather than a text search.';
COMMENT ON COLUMN ad_scripts.script_type IS
  'What kind of piece this is: cold, vsl, evergreen, landing_page. NULL = nobody has said yet. DELIBERATELY NOT CALLED "format": creative_assets.format already exists and means the aspect ratio, 1x1 / 4x5 / 9x16 / 16x9 (045:170, CHECK at 045:206). Two columns called format meaning two different things is exactly the confusion this naming avoids. Free text with a shape check rather than an enum, because docs/ads/RULES.md:484-498 records that the "evergreen" type was written from a two-sentence description with no source document — it is the least settled string in the whole SOP.';
COMMENT ON COLUMN ad_scripts.lane IS
  'Which of the five ad lanes this belongs to: funding600, premium, sorting, uwiq, wl. Reuses the ad_lane type from 286:62 rather than inventing a second one, so the join to client_ad_attribution.lane is typed and direct. NULL means the script is not lane-specific — different from the ad_lane member ''unknown'', which on client_ad_attribution means "a value arrived on the wire and it was garbage".';
COMMENT ON COLUMN ad_scripts.angle_key IS
  'The angle''s short name, e.g. denial_angle, broker_burn_angle. NULL = unclassified. THE MOST IMPORTANT COLUMN IN THIS FILE: it is what turns "which angle works" into a GROUP BY. Free text with a shape check and NO foreign key, on purpose — docs/ads/ANGLE-GENERATOR.md:18 sizes the angle space at 18 x 5 x 6 = 540 combinations, and an enum would mean a migration every time Chris invents one.';
COMMENT ON COLUMN ad_scripts.hook_key IS
  'The hook family''s short name. Two scripts that open with the same idea share it. NULL = unclassified. This is what makes "which hook books calls cheapest" a GROUP BY instead of a reading exercise.';
COMMENT ON COLUMN ad_scripts.offer_key IS
  'Which thing is being sold. NULL = unstated. Free text and not an enum because the offer strings in src/ads/registry.mjs:27-29 are a hand-typed second copy that already disagrees with the real product keys in src/config/offers.mjs:84-237 — products move more often than lanes do, and an enum here means a migration every time a price tier changes.';
COMMENT ON COLUMN ad_scripts.archived_at IS
  'When Chris retired this script. NULL = still live. Retire, never delete — the same rule creative_assets.archived_at follows (045:194). STATED PLAINLY: that rule is written down here and NOWHERE ENFORCED. creative_assets has a real fundhub_no_delete trigger (045:236-240); ad_scripts deliberately does not, because a delete guard would also block cleaning up test rows and mistyped drafts. A DELETE is still refused whenever anything points at the row — parent_script_id and creative_assets.script_id are both ON DELETE RESTRICT — so the rows that carry meaning are the rows that cannot go.';
COMMENT ON COLUMN ad_scripts.created_at IS
  'When this version was first written. Never changes.';
COMMENT ON COLUMN ad_scripts.updated_at IS
  'When this row was last edited, kept current by trg_ad_scripts_updated_at (Part 4f). A rewrite is a NEW row, so this moving means somebody corrected a label or fixed a typo — not that the script changed.';


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — ad_labels, THE DICTIONARY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ONE table with a kind column, not one lookup table per label. Ten
-- near-identical tables is the speculative abstraction CLAUDE.md §8 bans, and
-- they would all be read the same way anyway.
--
-- THERE IS DELIBERATELY NO FOREIGN KEY FROM ad_scripts TO ad_labels. This is
-- the single most important design choice in the file, so it is stated plainly:
--
--   * With a foreign key, Chris could not save a script carrying a brand-new
--     angle until somebody first inserted a dictionary row for it. That is
--     naming-as-a-blocker, which the owner rule of 2026-09-06 forbids.
--   * Without one, a new angle key just writes, and grouping works the instant
--     it is written. The dictionary supplies display names and feeds the writer
--     the list of known values. It is not a gate.
--   * The shape CHECK is the only constraint, exactly as
--     client_ad_attribution.variant is plain text with only a shape check and no
--     enum (286:110-119). That pattern is already proven on this database.
--   * The evidence that an enum would have been wrong on day one: the SOP lists
--     five canonical hook shapes (ANGLE-GENERATOR.md:59-66) and the live data in
--     docs/ads/build/concepts.data.json already contains a sixth,
--     "Disqualification gate", which ANGLE-GENERATOR.md:117 itself blesses.
--
-- THE COST, WRITTEN DOWN RATHER THAN HIDDEN: nothing stops 'denial_angle' and
-- 'denialangle' both existing and splitting one angle's numbers across two
-- groups. The CHECK forces one SHAPE, not one SPELLING. The dictionary plus
-- normalising on write in JavaScript is the mitigation; neither is enforced by
-- the database. That is the accepted price of never needing a migration to add
-- an angle.
--
-- NO partner_id. This is the house vocabulary and it is shared, so its RLS is
-- the shared-read / staff-write shape 278_ad_intelligence.sql:309-336 already
-- uses for the competitor tables, not fundhub_apply_partner_rls().

CREATE TABLE IF NOT EXISTS ad_labels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES orgs(id),

  kind         text NOT NULL,
  key          text NOT NULL,
  name         text,
  description  text,
  source_ref   text,
  sort_order   integer,
  retired_at   timestamptz,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- A CHECK list, because a new label KIND is a design change, not something
  -- anybody types on a Tuesday. New label VALUES are the frequent thing, and
  -- those are rows in this table, not migrations.
  CONSTRAINT ad_labels_kind_ck
    CHECK (kind IN ('script_type', 'angle', 'hook', 'offer')),
  CONSTRAINT ad_labels_key_ck
    CHECK (key ~ '^[a-z][a-z0-9_]{1,48}$'),
  CONSTRAINT ad_labels_kind_key_uq UNIQUE (org_id, kind, key)
);

CREATE INDEX IF NOT EXISTS ad_labels_kind_idx
  ON ad_labels (org_id, kind, sort_order) WHERE retired_at IS NULL;

COMMENT ON TABLE ad_labels IS
  'The dictionary that gives a label key a human name. One row per (org, kind, key). Read for display names and to hand the writer the list of known values — it is NOT a gate: ad_scripts has no foreign key to this table, so a brand-new angle can be saved before anybody writes it down here. See 377''s header for why that is deliberate.';
COMMENT ON COLUMN ad_labels.kind IS
  'Which of the four label slots this is a value for: script_type, angle, hook or offer. A fixed CHECK list, because adding a new KIND of label is a schema change while adding a new VALUE is just a row.';
COMMENT ON COLUMN ad_labels.key IS
  'The short name that appears on the script, e.g. denial_angle. Same shape as the ad_scripts label columns, so the two sides can never disagree about what a key looks like.';
COMMENT ON COLUMN ad_labels.name IS
  'The human name, e.g. "Denial Angle". NULL is fine — a key with no name still groups perfectly.';
COMMENT ON COLUMN ad_labels.source_ref IS
  'Where this label came from, e.g. "docs/ads/CONTROLS.md Ad 1". docs/ads/rules-data.mjs exists because a hand-copied list lost a word; a row that names its source is a row somebody can re-check.';
COMMENT ON COLUMN ad_labels.description IS
  'One or two sentences saying what this label means, in Chris''s words, so two people picking an angle from the same dropdown pick it for the same reason. NULL = nobody has written one yet, which is normal.';
COMMENT ON COLUMN ad_labels.sort_order IS
  'The position this label takes in a list, smallest first. NULL = unplaced, and an unplaced label sorts last rather than first. It is a display order only — nothing about a label''s meaning or its numbers depends on it.';
COMMENT ON COLUMN ad_labels.retired_at IS
  'When this label stopped being used. NULL = still in use. Retire, never delete: deleting a label orphans every old script that carried it.';
COMMENT ON COLUMN ad_labels.created_at IS
  'When this label was first written down. Never changes.';
COMMENT ON COLUMN ad_labels.updated_at IS
  'When this label row was last edited — its name, description or position. Kept current by trg_ad_labels_updated_at (Part 4f).';

-- ─── seeds ─────────────────────────────────────────────────────────────────
-- The four angles currently running, from docs/ads/CONTROLS.md (Ad 1 at :18,
-- Ad 2 at :66, Ad 3 at :118, Ad 4 at :174), and the four script types. Seeded
-- with ON CONFLICT DO NOTHING so a re-run changes nothing and a hand-edited row
-- on live is never overwritten by this file.

INSERT INTO ad_labels (org_id, kind, key, name, description, source_ref, sort_order)
SELECT o.id, v.kind, v.key, v.name, v.description, v.source_ref, v.sort_order
  FROM orgs o
  CROSS JOIN (VALUES
    ('angle', 'denial_angle',        'Denial Angle',
     'Opens on being turned down, and on what the denial actually meant.',
     'docs/ads/CONTROLS.md Ad 1', 1),
    ('angle', 'broker_burn_angle',   'Broker Burn Angle',
     'Opens on what a broker did to them and what it cost.',
     'docs/ads/CONTROLS.md Ad 2', 2),
    ('angle', 'competitor_angle',    'Competitor Angle',
     'Opens by naming what everyone else in the market sells and why it does not work.',
     'docs/ads/CONTROLS.md Ad 3', 3),
    ('angle', 'blind_application',   'Blind Application',
     'Opens on applying without knowing what the lender is going to see.',
     'docs/ads/CONTROLS.md Ad 4', 4),
    ('script_type', 'cold',          'Cold ad',
     'A paid ad written for someone who has never heard of us.',
     'docs/ads/RULES.md', 1),
    ('script_type', 'vsl',           'VSL',
     'A long-form video sales letter that plays on our own page.',
     'docs/ads/RULES.md', 2),
    ('script_type', 'evergreen',     'Evergreen',
     'Meant to keep running. NOTE: docs/ads/RULES.md:484-498 records that this type was written from a two-sentence description with no source document — it is the least settled label here.',
     'docs/ads/RULES.md:484-498', 3),
    ('script_type', 'landing_page',  'Landing page copy',
     'The words on a funnel page. New in 377 — Chris asked for landing page copy to be generated the same way scripts are.',
     'docs/specs/marketing-e2e/THE-TARGET.md', 4)
  ) AS v(kind, key, name, description, source_ref, sort_order)
 WHERE o.is_default
ON CONFLICT (org_id, kind, key) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4a — creative_assets.script_id — THE SCRIPT → CREATIVE LINK
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Many creative assets per script falls straight out of this: many rows, one
-- script_id.

ALTER TABLE creative_assets
  ADD COLUMN IF NOT EXISTS script_id uuid REFERENCES ad_scripts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS creative_assets_script_idx
  ON creative_assets (script_id) WHERE script_id IS NOT NULL;

COMMENT ON COLUMN creative_assets.script_id IS
  'Which script VERSION this asset was made from. NULL = it was not made from one — a stock photo, a logo, or anything that existed before 377. Nullable on purpose: every row that already exists has no script and NULL means unknown (CLAUDE.md §12), never zero and never blank. ON DELETE RESTRICT for the same reason parent_asset_id is RESTRICT (045:192).';

-- A creative must not point at another partner's script. RLS stops a partner
-- READING across the boundary; this stops a staff-context write from stitching
-- one partner's script onto another's asset. Same shape as
-- creative_asset_lineage_same_partner() (045:255-280) and ad_object_same_partner()
-- (046:367-391) — the exact class of leak those triggers exist for.
CREATE OR REPLACE FUNCTION creative_asset_script_same_partner() RETURNS trigger AS $$
DECLARE s_partner uuid;
BEGIN
  IF NEW.script_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT partner_id INTO s_partner FROM ad_scripts WHERE id = NEW.script_id;
  IF s_partner IS DISTINCT FROM NEW.partner_id THEN
    RAISE EXCEPTION
      'creative asset script crosses partners: script belongs to % but asset is for % (377)',
      s_partner, NEW.partner_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_creative_assets_script_partner ON creative_assets;
CREATE TRIGGER trg_creative_assets_script_partner
  BEFORE INSERT OR UPDATE OF script_id, partner_id ON creative_assets
  FOR EACH ROW EXECUTE FUNCTION creative_asset_script_same_partner();

-- THE SAME GUARD FROM THE OTHER SIDE. The trigger above only fires when the
-- ASSET moves. Handing the SCRIPT to a different partner leaves every asset made
-- from it pointing across the boundary, and nothing above would say a word. The
-- guard at 045:283-285 has this same one-sided hole; it is not copied here.
CREATE OR REPLACE FUNCTION ad_script_partner_move_guard() RETURNS trigger AS $$
DECLARE stranded uuid;
BEGIN
  IF NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id THEN
    RETURN NEW;
  END IF;
  SELECT id INTO stranded
    FROM creative_assets
   WHERE script_id = OLD.id AND partner_id IS DISTINCT FROM NEW.partner_id
   LIMIT 1;
  IF stranded IS NOT NULL THEN
    RAISE EXCEPTION
      'ad_scripts partner move would strand creative asset %: move its assets first (377)',
      stranded;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- NOT security definer, matching its neighbours at 045:255 and 046:367. So it
-- sees only the assets the CURRENT session may read. A staff-context write —
-- which is what every write in this codebase's admin paths is — sees them all.
DROP TRIGGER IF EXISTS trg_ad_scripts_partner_move ON ad_scripts;
CREATE TRIGGER trg_ad_scripts_partner_move
  BEFORE UPDATE OF partner_id ON ad_scripts
  FOR EACH ROW EXECUTE FUNCTION ad_script_partner_move_guard();


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4b — THE CREATIVE → AD LINK ALREADY EXISTS. NOTHING IS ADDED.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ads.asset_id uuid REFERENCES creative_assets(id) ON DELETE RESTRICT is at
-- 046_ad_platforms.sql:291 with its own partial index at 046:318. It is a real,
-- correct, indexed column. Many ads may share one asset_id, which is exactly
-- "one creative can have many ads".
--
--   ⚠️ NO CODE HAS EVER WRITTEN IT. Verified 2026-09-08:
--      api/campaigns/sync.mjs:124-129 omits asset_id from its INSERT and
--      :118-121 omits it from its UPDATE. Every INSERT INTO ads in the test
--      suite omits it too.
--
-- So the missing link was never a missing column. It is a missing WRITE, and
-- that is code work, not schema work. UNTIL SOMETHING WRITES asset_id,
-- v_ad_label_spine below returns NULL labels for every row — the spine will
-- read as EMPTY rather than as broken, which is the failure mode to watch for.

COMMENT ON COLUMN ads.asset_id IS
  'Which creative is running on this ad. Many ads may share one asset — that is "one creative, many ads". Declared in 046:291 and still not written by any code path as of 377 (api/campaigns/sync.mjs omits it from both its INSERT and its UPDATE), so v_ad_label_spine reads empty until a writer fills it in. Guarded by trg_ads_asset_partner (377): the asset must belong to the same partner as the ad.';

-- ONE LINK IN THE CHAIN HAD NO SAME-PARTNER GUARD, AND THE VIEW BELOW RIDES ON
-- IT. ads.asset_id (046:291) has never had one, unlike ad_sets → campaigns and
-- ads → ad_sets (046:383-392). So a staff-context write could hang one partner's
-- creative — and therefore one partner's script, angle and hook — on another
-- partner's ad, and v_ad_label_spine would report it as fact. Closed here, in
-- the file that starts reading that link.
--
-- SAFE TO ADD NOW, AND ONLY NOW: no code has ever written ads.asset_id
-- (verified 2026-09-08, api/campaigns/sync.mjs:117-129), so there is nothing
-- live for this to reject. It fires on writes only; rows that already exist are
-- not re-checked.
CREATE OR REPLACE FUNCTION ad_asset_same_partner() RETURNS trigger AS $$
DECLARE a_partner uuid;
BEGIN
  IF NEW.asset_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT partner_id INTO a_partner FROM creative_assets WHERE id = NEW.asset_id;
  IF a_partner IS DISTINCT FROM NEW.partner_id THEN
    RAISE EXCEPTION
      'ad creative crosses partners: asset belongs to % but ad is for % (377)',
      a_partner, NEW.partner_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ads_asset_partner ON ads;
CREATE TRIGGER trg_ads_asset_partner
  BEFORE INSERT OR UPDATE OF asset_id, partner_id ON ads
  FOR EACH ROW EXECUTE FUNCTION ad_asset_same_partner();


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4c — OUR AD NUMBER, BESIDE META'S AD ID
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Chris asked for BOTH. ads.external_id (046:293) already holds META'S id,
-- written from the Graph API at api/campaigns/sync.mjs:112. It cannot be
-- renamed — 046 is applied, and editing an applied migration is a silent no-op
-- (CLAUDE.md §12). So OUR number gets a new column whose NAME says whose number
-- it is.
--
-- THEY CANNOT BE CONFUSED, AND HERE IS WHY. fundhub_ad_id() caps at nine digits
-- (286:81-84). A Meta ad id is far longer than nine digits, so a Meta id fed
-- through that function returns NULL rather than a wrong match. That safety is
-- currently accidental; it is written down here so nobody widens the cap later
-- without understanding what it protects.
--
-- text AND NOT integer, ON PURPOSE. client_ad_attribution.ad_id is a GENERATED
-- text column (286:110). Storing ours as text means the join needs no cast, and
-- the CHECK below is the identical regex to client_ad_attribution_ad_id_ck
-- (286:116-117), so the two sides of the join can never disagree about shape.
--
-- THE GUARD ONLY RUNS ONE WAY, AND THAT IS WORTH SAYING OUT LOUD. The CHECK
-- below refuses a 17-digit Meta id in OUR column. Nothing refuses OUR short
-- number in META'S column: ads.external_id (046:293) carries no CHECK at all and
-- one cannot be added now without risking existing rows, since external_id holds
-- whatever each platform hands back. So typing "42" into external_id is legal
-- and silent. It would simply never match a real Meta ad.
--
-- THE NUMBER IS UNIQUE PER COMPANY, NOT PER PARTNER. The unique index below is
-- on (org_id, fundhub_ad_number), so FundHub and every white-label partner draw
-- from ONE shared pool of numbers: if a partner claims "1", nobody else can.
-- That is deliberate and it is the only shape that works — a link carrying
-- utm_content=42 arrives with no partner on it, and 286:127 keys the click data
-- on (org, ad) for exactly that reason. One number must mean one ad company-wide
-- or the join is a guess. Worth knowing before a partner starts numbering ads.
--
--   ⚠️ THIS NUMBER IS TYPED BY A HUMAN. Nothing in the database can compute it:
--      Meta does not know our number, and utm_content never reaches the ads
--      table. If somebody types the wrong number, spend joins to the wrong
--      script's labels and every answer is silently wrong with no error. The
--      unique index below stops two ads claiming the SAME number. It cannot
--      stop one ad claiming the WRONG number.

ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS fundhub_ad_number text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ads_fundhub_ad_number_ck'
       AND conrelid = 'public.ads'::regclass
  ) THEN
    ALTER TABLE ads
      ADD CONSTRAINT ads_fundhub_ad_number_ck
      CHECK (fundhub_ad_number IS NULL OR fundhub_ad_number ~ '^[0-9]{1,9}$');
  END IF;
END $$;

-- Partial on NOT NULL: many ads may have no number yet, but only one ad may
-- claim a given number.
CREATE UNIQUE INDEX IF NOT EXISTS ads_fundhub_number_uq
  ON ads (org_id, fundhub_ad_number) WHERE fundhub_ad_number IS NOT NULL;

COMMENT ON COLUMN ads.fundhub_ad_number IS
  'OURS. The number Chris puts in the ad''s link — the leading digits of utm_content, so "42" in utm_content=42-ringlights. NULL = nobody has set it yet, and that is normal, not a defect. text and not integer so it joins client_ad_attribution.ad_id (a generated text column, 286:110) with no cast; the CHECK is the same regex as client_ad_attribution_ad_id_ck. NOT the same thing as external_id, which is Meta''s id. UNIQUE PER ORG, NOT PER PARTNER: FundHub and every white-label partner share one pool of numbers, because a link carrying utm_content=42 arrives with no partner attached to it.';
COMMENT ON COLUMN ads.external_id IS
  'META''S id for this ad, written from the Graph API by api/campaigns/sync.mjs:112. It is the PLATFORM''S number and never ours — ours is fundhub_ad_number, added in 377. A Meta ad id is longer than nine digits, so fundhub_ad_id() (286:81-84, capped at nine) returns NULL for one rather than matching it to one of our ads by accident. That guard runs one way only: this column has no CHECK, so putting one of OUR short numbers in here is legal and silent — it would just never match a real Meta ad.';


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4d — v_ad_label_spine — THE WHOLE CHAIN IN ONE ROW
-- ═══════════════════════════════════════════════════════════════════════════
--
-- security_invoker = true IS MANDATORY AND IT IS NOT OPTIONAL HERE. A plain
-- view runs as its OWNER, and the owner is exempt from FORCEd policies, so a
-- partner reading through a plain view sees everyone's rows. That was MEASURED
-- on 2026-08-27 before 269_partner_views_security_invoker.sql: partner B read
-- partner A's spend ceiling through a view while the same count over the table
-- correctly returned zero.
--
--   ⚠️ THE EXISTING GUARD DOES NOT COVER THIS VIEW. The check at
--      src/compliance/invariants.pg.test.mjs:137-153 only inspects views whose
--      name matches 'v_partner_%'. This one is not named that, so the flag has
--      to be right by hand and stay right by hand.
--
-- LEFT JOINS THROUGHOUT. An ad with no creative, or a creative with no script,
-- still appears — with NULL labels. Unknown survives as unknown.
--
-- LABELS ARE INHERITED BY JOIN, NEVER BY COPY. Nothing writes angle_key onto
-- creative_assets or onto ads. Copying it would drift the moment a script is
-- corrected. This view is where the inheritance happens, and it is the only
-- place it happens.
--
-- SPEND AND RESULTS ATTACH WITH NO NEW COLUMN:
--   spend / hook rate / hold rate
--     JOIN ad_metrics_daily m ON m.ad_id = v.ad_row_id      (046:436, key at 046:461)
--   leads / booked calls
--     JOIN client_ad_attribution caa
--       ON caa.ad_id = v.fundhub_ad_number AND caa.org_id = v.org_id
-- That second join is the one that does not exist today: client_ad_attribution
-- has no foreign key to ads and nothing joins them — adAttributionRollup() at
-- src/ads/store.mjs:57-79 joins attribution to bookings only, never to spend.
-- fundhub_ad_number is the bridge.

CREATE OR REPLACE VIEW v_ad_label_spine
WITH (security_invoker = true) AS
SELECT
  a.id                AS ad_row_id,
  a.org_id,
  a.partner_id,
  a.fundhub_ad_number,                 -- ours
  a.external_id       AS meta_ad_id,   -- Meta's
  a.name              AS ad_name,
  a.approval_state,
  ca.id               AS asset_id,
  ca.kind             AS asset_kind,
  ca.format           AS asset_aspect_ratio,
  ca.duration_sec,
  s.id                AS script_id,
  s.version           AS script_version,
  s.parent_script_id,
  s.title             AS script_title,
  s.script_type,
  s.lane,
  s.angle_key,
  s.hook_key,
  s.offer_key,
  s.hook_text,
  -- RETIREMENT, CARRIED THROUGH. Without these two a live ad still shows the
  -- labels of a script Chris retired months ago, and there is no column to
  -- filter on to find out. NULL = not retired. They are LAST on purpose:
  -- CREATE OR REPLACE VIEW may only add columns at the end, so a later file can
  -- extend this view without dropping it.
  s.archived_at       AS script_archived_at,
  ca.archived_at      AS asset_archived_at
FROM ads a
LEFT JOIN creative_assets ca ON ca.id = a.asset_id
LEFT JOIN ad_scripts      s  ON s.id  = ca.script_id;

COMMENT ON VIEW v_ad_label_spine IS
  'One row per ad, carrying the labels inherited from its creative and that creative''s script. LEFT JOINed throughout, so an ad with no creative still appears with NULL labels — unknown stays unknown. security_invoker=true is load-bearing: without it a partner reading this view would see every other partner''s rows (measured 2026-08-27, see 269). fundhub_ad_number is ours and meta_ad_id is Meta''s; they are separate columns and neither is derived from the other. script_archived_at and asset_archived_at say whether the script or the creative behind a still-running ad has been retired — NULL means it has not. Join ad_metrics_daily on ad_row_id for spend, and client_ad_attribution on fundhub_ad_number for leads.';


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4e — RLS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ad_scripts gets exactly what creative_assets, ads, campaigns and
-- ad_metrics_daily already have, by CALLING the function rather than
-- hand-copying its DDL — 045:56-58 says a hand-copied policy quietly missing its
-- USING clause is the exact failure this function exists to prevent.
--
-- creative_assets and ads keep the policies they already have. Adding a column
-- changes nothing about them.

DO $$
BEGIN
  PERFORM fundhub_apply_partner_rls('ad_scripts');
END $$;

-- ad_labels is shared house vocabulary with no partner_id, so it takes the
-- shared-read / staff-write shape from 278:309-336 instead. A partner session
-- can READ the dictionary (it needs the display names) and can never write to
-- it.
ALTER TABLE ad_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_labels FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_labels_shared_read ON ad_labels;
CREATE POLICY ad_labels_shared_read ON ad_labels FOR SELECT
  USING (fundhub_is_staff() OR fundhub_current_partner() IS NOT NULL);

DROP POLICY IF EXISTS ad_labels_staff_write ON ad_labels;
CREATE POLICY ad_labels_staff_write ON ad_labels FOR ALL
  USING (fundhub_is_staff()) WITH CHECK (fundhub_is_staff());


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4f — updated_at triggers, in the guarded style of 042 and 045
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    FOREACH t IN ARRAY ARRAY['ad_scripts', 'ad_labels'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_trigger
                      WHERE tgname = 'trg_' || t || '_updated_at'
                        AND tgrelid = ('public.' || t)::regclass) THEN
        EXECUTE format(
          'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
          'trg_' || t || '_updated_at', t);
      END IF;
    END LOOP;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4g — GRANTS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 104_app_role.sql:226-227 runs ALTER DEFAULT PRIVILEGES, so a table created
-- after it by the SAME role already arrives readable and writable by
-- fundhub_app. This block adds nothing on a database where that held. It exists
-- for the case where it did not — a migration applied by a different role leaves
-- fundhub_app with no privilege at all on the new tables, and the symptom is a
-- "permission denied" that looks like an application bug. Guarded on the role
-- existing, so a scratch database without fundhub_app skips it.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_scripts TO fundhub_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_labels  TO fundhub_app;
    GRANT SELECT ON public.v_ad_label_spine TO fundhub_app;
  END IF;
END $$;
