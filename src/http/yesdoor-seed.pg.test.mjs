// Postgres-backed test for what db/seed/296 + 297 leave in the Yesdoor org:
// every seeded criminal-record policy speaks the categories the matcher knows.
//
// I1 leftover (closed in I2): 296 wrote criminal_policy keys felony / misdemeanor /
// violent, but the screenings and the matcher use felony_violent / felony_property /
// misdemeanor_nonviolent, so a seeded policy never applied (every flag came back
// "unknown"). 297 added the next rules version with the keys renamed. This test
// fails if any building in the seeded org ends up with a policy key the matcher
// does not know, whoever wrote it.
//
// SCRATCH database only, as fundhub_app (seeds are applied by db/migrate.mjs).
// Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { db, close } from "../db.mjs";
import { CRIMINAL_CATEGORIES, evaluateCriminal, PASS, FAIL, CLOSE, UNKNOWN } from "../yesdoor/match/rules.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("yesdoor seeded criminal policies", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let orgId = null;
  let latest = [];
  before(async () => {
    const o = await db.query(`SELECT id FROM orgs WHERE slug = 'yesdoor'`);
    orgId = o.rows[0]?.id ?? null;
    if (!orgId) return;
    latest = (await db.query(
      `SELECT b.name, r.version, r.criminal_policy
         FROM yd_building_rules r
         JOIN yd_buildings b ON b.id = r.building_id AND b.org_id = r.org_id
        WHERE r.org_id = $1 AND b.is_sample
          AND r.version = (SELECT max(x.version) FROM yd_building_rules x WHERE x.building_id = r.building_id)
        ORDER BY b.name`, [orgId])).rows;
  });
  after(async () => { await close(); });

  test("the seed ran: the Yesdoor org has sample buildings with rules", () => {
    assert.ok(orgId, "orgs.slug = 'yesdoor' is missing: run db/migrate.mjs against this scratch database first");
    assert.equal(latest.length, 8, "eight sample buildings, one latest rules version each");
  });

  test("every key in every building's latest criminal_policy is a category the matcher knows", () => {
    for (const row of latest) {
      const keys = Object.keys(row.criminal_policy);
      assert.ok(keys.length > 0, `${row.name} has a criminal policy`);
      for (const key of keys) {
        assert.ok(CRIMINAL_CATEGORIES.includes(key), `${row.name} v${row.version}: "${key}" is not one of ${CRIMINAL_CATEGORIES.join(", ")}`);
      }
    }
  });

  test("a seeded policy is applied: a flag in any category is judged, never 'unknown'", () => {
    for (const row of latest) {
      for (const category of CRIMINAL_CATEGORIES) {
        const out = evaluateCriminal({ flags: [{ category, years_ago: 2 }], policy: row.criminal_policy });
        assert.notEqual(out.result, UNKNOWN, `${row.name}: ${category}`);
        assert.ok([PASS, CLOSE, FAIL].includes(out.result));
      }
    }
  });

  test("the values were kept as they were: the stricter policies still refuse a violent record", () => {
    for (const row of latest) {
      assert.equal(row.criminal_policy.felony_violent, "never", row.name);
      assert.equal(evaluateCriminal({ flags: [{ category: "felony_violent", years_ago: 30 }], policy: row.criminal_policy }).result, FAIL);
    }
  });

  test("297 is safe to run again: it matches nothing once the keys are renamed", async () => {
    const sql = fs.readFileSync(new URL("../../db/seed/297_yesdoor_criminal_policy_keys.sql", import.meta.url), "utf8");
    const before = (await db.query(`SELECT count(*)::int AS n FROM yd_building_rules WHERE org_id = $1`, [orgId])).rows[0].n;
    const r = await db.query(sql);
    assert.equal(r.rowCount ?? 0, 0);
    const after = (await db.query(`SELECT count(*)::int AS n FROM yd_building_rules WHERE org_id = $1`, [orgId])).rows[0].n;
    assert.equal(after, before);
  });

  test("the old version is kept (rules are never edited, only superseded)", async () => {
    const r = await db.query(
      `SELECT count(*)::int AS n FROM yd_building_rules r JOIN yd_buildings b ON b.id = r.building_id AND b.is_sample
        WHERE r.org_id = $1 AND r.version = 1 AND r.criminal_policy ?| ARRAY['felony','misdemeanor','violent']`, [orgId]);
    assert.equal(r.rows[0].n, 8);
  });
});
