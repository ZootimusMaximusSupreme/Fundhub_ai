// Endpoint tests for GET / POST /api/marketing/settings, against real Postgres.
// Lives under src/http/ because npm test's glob is src/** and scripts/** only.
// Skips with DATABASE_URL unset; a skipped .pg.test.mjs is not green (CLAUDE.md §12).
// Runs in a throwaway org, never the default org.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import handler from "../../api/marketing/settings.mjs";
import { ROUTES } from "../../netlify/functions/api.mjs";
import { mkReq, mkRes, makeMarketingOrg, wipeMarketingOrg } from "../marketing/pg-fixture.mjs";

const HAS_DB = !!process.env.DATABASE_URL;
const SLUG = "mm-settings-pg-test";

async function call(token, opts) {
  const res = mkRes();
  await handler(mkReq(token, opts), res, { db });
  return res;
}

describe("/api/marketing/settings", { skip: !HAS_DB ? "no DATABASE_URL" : false }, () => {
  let org;

  before(async () => { org = await makeMarketingOrg(SLUG); });
  after(async () => { if (org) await wipeMarketingOrg(org.orgId); await close(); });

  test("the route is in ROUTES", () => {
    assert.equal(ROUTES["marketing/settings"], handler);
  });

  test("no login is 401; a csm is 403; an unsupported method is 405", async () => {
    assert.equal((await call(null)).code, 401);
    const csm = await call(org.tokens.csm);
    assert.equal(csm.code, 403);
    assert.equal(csm.body.error, "forbidden");
    const del = await call(org.tokens.owner, { method: "DELETE" });
    assert.equal(del.code, 405);
  });

  test("first read creates the row with the spec's defaults", async () => {
    const before = await db.query(`SELECT 1 FROM marketing_settings WHERE org_id = $1`, [org.orgId]);
    assert.equal(before.rows.length, 0);
    const r = await call(org.tokens.owner);
    assert.equal(r.code, 200);
    const s = r.body.settings;
    assert.equal(s.org_id, org.orgId);
    assert.equal(s.enabled, false);
    assert.equal(s.batch_weekday, 1);
    assert.equal(s.batch_time, "07:00");
    assert.equal(s.timezone, "America/Phoenix");
    assert.equal(s.scripts_per_day, 3);
    assert.equal(s.days_per_batch, 7);
    assert.equal(s.size_rule, "total");
    assert.deepEqual(s.format_style, {
      standard: "bullets", sorting: "words", long: "words", notes: "bullets", greenscreen: "bullets", vsl: "bullets"
    });
    assert.equal(s.draft_expiry_days, 14);
    assert.equal(s.winner_rule, null, "null means not set");
    assert.equal(s.ad_number_floor, 91);
    assert.deepEqual(s.next_overrides, {});
    assert.equal(s.max_batch_cost_usd, 40);
    assert.equal(s.max_month_cost_usd, 300);
    assert.equal(s.submagic_template, "Hormozi 2");
    assert.equal(s.caption_position_y, null, "null means not set, never 0");
    assert.equal(s.magic_zooms, false);
    assert.equal(s.clean_audio, true);
    assert.deepEqual(s.caption_dictionary, []);
    assert.equal(s.animation_mode, "fullframe");
    assert.equal(s.flip_horizontal, false);
    assert.equal(s.settle_minutes, 10);
    assert.equal(s.quiet_start, "21:00");
    assert.equal(s.quiet_end, "07:00");
    assert.deepEqual(s.course_folders, {});
    assert.equal(s.updated_by, null);
    const rows = await db.query(`SELECT 1 FROM marketing_settings WHERE org_id = $1`, [org.orgId]);
    assert.equal(rows.rows.length, 1);
    // A second read does not make a second row or change anything.
    assert.equal((await call(org.tokens.admin)).code, 200);
    assert.equal((await db.query(`SELECT 1 FROM marketing_settings WHERE org_id = $1`, [org.orgId])).rows.length, 1);
  });

  test("a patch saves, stamps updated_by, and leaves the other settings alone", async () => {
    const r = await call(org.tokens.owner, {
      method: "POST",
      body: { enabled: true, batch_weekday: 3, batch_time: "09:15", size_rule: "per_offer",
              caption_dictionary: ["Fundhub", "UnderwriteIQ"], winner_rule: { metric: "cpa" } }
    });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    const s = r.body.settings;
    assert.equal(s.enabled, true);
    assert.equal(s.batch_weekday, 3);
    assert.equal(s.batch_time, "09:15");
    assert.equal(s.size_rule, "per_offer");
    assert.deepEqual(s.caption_dictionary, ["Fundhub", "UnderwriteIQ"]);
    assert.deepEqual(s.winner_rule, { metric: "cpa" });
    assert.equal(s.updated_by, org.ids.owner);
    assert.equal(s.scripts_per_day, 3, "untouched");
    // Persisted.
    const back = await call(org.tokens.admin);
    assert.equal(back.body.settings.batch_time, "09:15");
    // null clears a null-able setting.
    const cleared = await call(org.tokens.admin, { method: "POST", body: { winner_rule: null } });
    assert.equal(cleared.body.settings.winner_rule, null);
    assert.equal(cleared.body.settings.updated_by, org.ids.admin);
  });

  test("a bad value or an unknown key is a 400 and changes nothing", async () => {
    for (const body of [{ batch_weekday: 9 }, { batch_time: "7am" }, { nope: 1 }, {}]) {
      const r = await call(org.tokens.owner, { method: "POST", body });
      assert.equal(r.code, 400, JSON.stringify(body));
      assert.ok(r.body.error && r.body.message);
    }
    assert.equal((await call(org.tokens.owner)).body.settings.batch_weekday, 3);
  });

  test("a csm cannot save", async () => {
    const r = await call(org.tokens.csm, { method: "POST", body: { enabled: false } });
    assert.equal(r.code, 403);
    assert.equal((await call(org.tokens.owner)).body.settings.enabled, true);
  });

  test("a repeated request_id returns the saved answer and does not save again", async () => {
    const first = await call(org.tokens.owner, { method: "POST", body: { settle_minutes: 12, request_id: "req-1" } });
    assert.equal(first.code, 200);
    assert.equal(first.body.replayed, undefined);
    // Change it behind its back, then repeat the request.
    await db.query(`UPDATE marketing_settings SET settle_minutes = 30 WHERE org_id = $1`, [org.orgId]);
    const again = await call(org.tokens.owner, { method: "POST", body: { settle_minutes: 12, request_id: "req-1" } });
    assert.equal(again.code, 200);
    assert.equal(again.body.replayed, true);
    assert.equal(again.body.settings.settle_minutes, 12);
    assert.equal((await db.query(`SELECT settle_minutes FROM marketing_settings WHERE org_id = $1`, [org.orgId])).rows[0].settle_minutes, 30);
    // The same id on another route is refused.
    await db.query(`UPDATE marketing_requests SET route = 'marketing/offers' WHERE request_id = 'req-1'`);
    const reused = await call(org.tokens.owner, { method: "POST", body: { settle_minutes: 5, request_id: "req-1" } });
    assert.equal(reused.code, 409);
  });

  test("the database refuses what the endpoint would never send", async () => {
    await assert.rejects(
      db.query(`UPDATE marketing_settings SET size_rule = 'both' WHERE org_id = $1`, [org.orgId]),
      /marketing_settings_size_rule_ck/
    );
    await assert.rejects(
      db.query(`UPDATE marketing_settings SET batch_time = '25:99' WHERE org_id = $1`, [org.orgId]),
      /marketing_settings_batch_time_ck/
    );
  });
});
