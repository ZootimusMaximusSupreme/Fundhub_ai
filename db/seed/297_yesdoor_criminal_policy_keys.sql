-- 297_yesdoor_criminal_policy_keys.sql — supersedes the criminal rules in 296.
--
-- db/seed/296 wrote criminal_policy keys `felony`, `misdemeanor` and `violent`.
-- The screenings and the matcher use `felony_property`, `misdemeanor_nonviolent`
-- and `felony_violent` (src/yesdoor/match/rules.mjs CRIMINAL_CATEGORIES), so a
-- seeded policy was never applied: every criminal flag came back "unknown" and the
-- best answer was "likely" at the sample buildings (I1 leftover, closed in I2).
--
-- Why a new file and not an edit to 296: db/migrate.mjs records every applied file
-- in schema_migrations, so an edit to 296 is a silent no-op anywhere it already
-- ran. And building rules are versioned (yd_building_rules_freeze): a row is never
-- edited, a change is a NEW version. So this adds the next version of each SAMPLE
-- building's rules with the keys renamed and every value kept as it was:
--
--   felony     -> felony_property        (years-ago number | "never" | "case_by_case")
--   misdemeanor-> misdemeanor_nonviolent
--   violent    -> felony_violent
--
-- Only the Yesdoor org's sample buildings, and only where the latest version still
-- carries an old key. Nothing else changes (score, income, evictions, notes). Safe
-- to re-run: after it, the latest version has no old key, so it matches nothing.

INSERT INTO yd_building_rules
  (org_id, building_id, version, confirmed_at, min_score, income_multiple,
   max_evictions, eviction_lookback_years, criminal_policy, accepts_second_chance,
   notes, source)
SELECT r.org_id, r.building_id, r.version + 1, now(), r.min_score, r.income_multiple,
       r.max_evictions, r.eviction_lookback_years,
       (SELECT COALESCE(jsonb_object_agg(
                 CASE e.key
                   WHEN 'felony'     THEN 'felony_property'
                   WHEN 'misdemeanor' THEN 'misdemeanor_nonviolent'
                   WHEN 'violent'    THEN 'felony_violent'
                   ELSE e.key
                 END, e.value), '{}'::jsonb)
          FROM jsonb_each(r.criminal_policy) e),
       r.accepts_second_chance, r.notes, 'staff'
  FROM yd_building_rules r
  JOIN yd_buildings b ON b.id = r.building_id AND b.org_id = r.org_id AND b.is_sample
  JOIN orgs o ON o.id = r.org_id AND o.slug = 'yesdoor'
 WHERE r.version = (SELECT max(x.version) FROM yd_building_rules x WHERE x.building_id = r.building_id)
   AND r.criminal_policy ?| ARRAY['felony', 'misdemeanor', 'violent'];
