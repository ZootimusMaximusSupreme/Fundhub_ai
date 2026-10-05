/* AI ops suggestions (MB4, 432), against a real Postgres.
 *
 * What is pinned here:
 *   1. THE ROUTE EXISTS and is owner/admin only. Calls go through the real
 *      ROUTES map in netlify/functions/api.mjs (CLAUDE.md §12). A closer is 403.
 *   2. THE NUMBERS ARE REAL READS. Dead letters and a dying ad become two
 *      suggestions, biggest known dollar impact first, unknown dollars after —
 *      never counted as $0. With no model, write_up is NULL.
 *   3. THE AD READS SEE THE ADS. ads and ad_metrics_daily carry partner
 *      row-level security; read as the app role with no staff scope they come
 *      back empty, silently. The dying-ad suggestion only appears if the scope works.
 *   4. THE CADENCE LAW. A passed suggestion stays quiet unless its numbers get
 *      worse. A taken page change holds the next one for 7 days.
 *   5. ONE ROW PER MORNING, and nothing deletes a suggestion.
 *   6. ONE ORG'S SUGGESTIONS ARE NOT ANOTHER'S.
 *
 * Each run makes its own org, so its counts are its own. ops_suggestions rows
 * cannot be deleted by the app role (432 revokes DELETE), so this run's rows stay
 * in the scratch database, inside this run's org.
 *
 * SKIPS WITHOUT A DATABASE, LOUDLY. A skipped run proves nothing:
 *   DATABASE_URL=postgres://… node --test src/http/ops-suggestions.pg.test.mjs
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert";
import { db, close } from "../db.mjs";
import { createSession } from "../auth/session.mjs";
import { asStaff } from "../partners/rls.mjs";
import {
  buildSuggestions, setSuggestionStatus, phoenixToday, addDays
} from "../ops/suggestions.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const NONCE = `mb4-${process.pid}-${Date.now()}`;
const DATE = phoenixToday();
const NO_MODEL = {};

describe("ops suggestions: real numbers, the cadence law, owner/admin read",
  { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {

  let handler, org, otherOrg, tokens = {};

  const call = async (path, token) => {
    const headers = { host: "x" };
    if (token) headers.authorization = "Bearer " + token;
    const r = await handler(new Request("https://x" + path, { headers }), {});
    let body = null;
    try { body = JSON.parse(await r.text()); } catch { /* not json */ }
    return { status: r.status, body };
  };

  // One failure per event per handler (039's unique key), so each gets its own event.
  const failedEvent = async (handlerName, firstSeen) => {
    const eventId = (await db.query(
      `INSERT INTO events (org_id, name) VALUES ($1, $2) RETURNING id`, [org, `${NONCE}.event`]
    )).rows[0].id;
    await db.query(
      `INSERT INTO failed_events (org_id, event_id, event_name, handler_name, error_message, status, first_seen_at)
       VALUES ($1, $2, $3, $4, 'test failure', 'pending', $5)`,
      [org, eventId, `${NONCE}.event`, handlerName, firstSeen]
    );
  };

  before(async () => {
    ({ default: handler } = await import("../../netlify/functions/api.mjs"));

    org = (await db.query(`INSERT INTO orgs (slug, name) VALUES ($1, 'MB4 test org') RETURNING id`, [NONCE])).rows[0].id;
    otherOrg = (await db.query(`INSERT INTO orgs (slug, name) VALUES ($1, 'MB4 other org') RETURNING id`, [`${NONCE}-b`])).rows[0].id;

    for (const role of ["owner", "admin", "closer"]) {
      const staffId = (await db.query(
        `INSERT INTO staff (org_id, email, name, role, status)
         VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
        [org, `${NONCE}-${role}@example.test`, `MB4 ${role}`, role]
      )).rows[0].id;
      tokens[role] = (await createSession(db, { staffId, orgId: org })).token;
    }

    // Three open dead letters: two in one handler, one first seen yesterday (Arizona).
    const yesterdayNoon = `${addDays(DATE, -1)}T12:00:00-07:00`;
    const lastWeek = `${addDays(DATE, -6)}T12:00:00-07:00`;
    await failedEvent(`${NONCE}-drip`, lastWeek);
    await failedEvent(`${NONCE}-drip`, lastWeek);
    await failedEvent(`${NONCE}-sync`, yesterdayNoon);

    // One running video ad that dies before 25%: 200 plays, 40 reach 25%, 2 clicks.
    const partnerId = (await db.query(
      `INSERT INTO partners (org_id, name, slug, status, contact_email, agreement_signed_at)
       VALUES ($1, 'MB4 partner', $2, 'active', $3, now()) RETURNING id`,
      [org, NONCE, `${NONCE}@example.test`]
    )).rows[0].id;
    await asStaff(async (tx) => {
      const connId = (await tx.query(
        `INSERT INTO ad_platform_connections
           (org_id, partner_id, platform, external_ad_account_id, connection_state, platform_verification_state)
         VALUES ($1, $2, 'google', $3, 'pending', 'approved') RETURNING id`,
        [org, partnerId, `acct-${NONCE}`]
      )).rows[0].id;
      const campaignId = (await tx.query(
        `INSERT INTO campaigns (org_id, partner_id, connection_id, name, offer_type, budget_cents, approval_state)
         VALUES ($1, $2, $3, 'MB4 campaign', 'funding', 10000, 'draft') RETURNING id`,
        [org, partnerId, connId]
      )).rows[0].id;
      const adSetId = (await tx.query(
        `INSERT INTO ad_sets (org_id, partner_id, connection_id, campaign_id, name, budget_cents, approval_state)
         VALUES ($1, $2, $3, $4, 'MB4 ad set', 10000, 'draft') RETURNING id`,
        [org, partnerId, connId, campaignId]
      )).rows[0].id;
      const adId = (await tx.query(
        `INSERT INTO ads (org_id, partner_id, connection_id, campaign_id, ad_set_id, name, status)
         VALUES ($1, $2, $3, $4, $5, 'SLO Ad 7 — MB4 test', 'ACTIVE') RETURNING id`,
        [org, partnerId, connId, campaignId, adSetId]
      )).rows[0].id;
      await tx.query(
        `INSERT INTO ad_metrics_daily (org_id, partner_id, ad_id, date, spend_cents, impressions, clicks,
                                       video_plays, video_p25_watched)
         VALUES ($1, $2, $3, $4::date, 5000, 3000, 2, 200, 40),
                ($1, $2, $3, $5::date, 3000, 2000, 1, NULL, NULL)`,
        [org, partnerId, adId, addDays(DATE, -1), addDays(DATE, -3)]
      );
    });

    // Another org's suggestion, which this org's owner must never see.
    await db.query(
      `INSERT INTO ops_suggestions (org_id, brief_date, rule, subject_key, headline, numbers)
       VALUES ($1, $2::date, 'fix_broken_same_day', 'failed_events', 'other org secret', '{}'::jsonb)`,
      [otherOrg, DATE]
    );
  });

  after(async () => { await close(); });

  let built;

  test("dead letters and a dying ad become two suggestions, known dollars first", async () => {
    built = await buildSuggestions({ db, date: DATE, orgId: org, env: NO_MODEL });
    assert.strictEqual(built.ok, true);
    assert.deepStrictEqual(built.suggestions.map((s) => s.rule), ["page_change_weekly", "fix_broken_same_day"]);

    const [ad, broken] = built.suggestions;
    assert.strictEqual(ad.dollar_impact_cents, 8000, "last 7 days of spend on the dying ad");
    assert.strictEqual(ad.numbers.plays, 200);
    assert.strictEqual(ad.numbers.reached_25_rate, 0.2);
    assert.strictEqual(broken.dollar_impact_cents, null, "unknown stays NULL, never 0");
    assert.strictEqual(broken.numbers.open_count, 3);
    assert.strictEqual(broken.numbers.new_yesterday, 1);
    assert.strictEqual(broken.numbers.top_handler, `${NONCE}-drip`);
    for (const s of built.suggestions) {
      assert.strictEqual(s.write_up, null, "no model, no write-up");
      assert.strictEqual(s.model_used, false);
      assert.strictEqual(s.status, "open");
      assert.strictEqual(s.brief_date, DATE);
      assert.ok(s.rule_text.startsWith("Rule "));
    }
    assert.ok(built.skipped_rules.length >= 1);
  });

  test("re-running the same morning updates, it does not add rows", async () => {
    await buildSuggestions({ db, date: DATE, orgId: org, env: NO_MODEL });
    const n = (await db.query(`SELECT count(*)::int AS n FROM ops_suggestions WHERE org_id = $1 AND brief_date = $2::date`, [org, DATE])).rows[0].n;
    assert.strictEqual(n, 2);
  });

  test("owner reads the morning, biggest dollars first; admin too", async () => {
    const r = await call(`/api/read/ops-suggestions?date=${DATE}`, tokens.owner);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.items.map((i) => i.rule), ["page_change_weekly", "fix_broken_same_day"]);
    assert.strictEqual(r.body.items[0].dollar_impact_cents, 8000);
    assert.strictEqual(r.body.items[1].dollar_impact_cents, null);
    assert.ok(!r.body.items.some((i) => i.headline === "other org secret"), "another org's row leaked");
    const a = await call(`/api/read/ops-suggestions?date=${DATE}`, tokens.admin);
    assert.strictEqual(a.status, 200);
  });

  test("no date means today in Arizona", async () => {
    const r = await call(`/api/read/ops-suggestions`, tokens.owner);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.items.length, 2);
  });

  test("a closer is refused, no login is refused, a bad date is a 400", async () => {
    assert.strictEqual((await call(`/api/read/ops-suggestions?date=${DATE}`, tokens.closer)).status, 403);
    assert.strictEqual((await call(`/api/read/ops-suggestions?date=${DATE}`)).status, 401);
    assert.strictEqual((await call(`/api/read/ops-suggestions?date=2026-02-30`, tokens.owner)).status, 400);
  });

  test("passed stays quiet, a taken page change holds the next for a week", async () => {
    const [ad, broken] = built.suggestions;
    const passed = await setSuggestionStatus({ db, orgId: org, id: broken.id, status: "passed", date: DATE });
    assert.strictEqual(passed.quiet_until, addDays(DATE, 7));
    await setSuggestionStatus({ db, orgId: org, id: ad.id, status: "taken", date: DATE });

    const next = await buildSuggestions({ db, date: addDays(DATE, 1), orgId: org, env: NO_MODEL });
    assert.deepStrictEqual(next.suggestions, [], "both held");
    assert.deepStrictEqual(next.held.map((h) => h.rule).sort(), ["fix_broken_same_day", "page_change_weekly"]);

    // The numbers get worse: one more broken step. It comes back; the page change stays held.
    await failedEvent(`${NONCE}-sync`, `${DATE}T08:00:00-07:00`);
    const worse = await buildSuggestions({ db, date: addDays(DATE, 2), orgId: org, env: NO_MODEL });
    assert.deepStrictEqual(worse.suggestions.map((s) => s.rule), ["fix_broken_same_day"]);
    assert.strictEqual(worse.suggestions[0].numbers.open_count, 4);
  });

  test("the database refuses a pass with no quiet date", async () => {
    await assert.rejects(
      db.query(`UPDATE ops_suggestions SET status = 'passed', quiet_until = NULL WHERE org_id = $1 AND rule = 'fix_broken_same_day' AND brief_date = $2::date`,
        [org, addDays(DATE, 2)]),
      /ops_suggestions_quiet_ck/);
  });

  test("the app role cannot delete a suggestion", async (t) => {
    const who = (await db.query(`SELECT current_user AS u`)).rows[0].u;
    if (who !== "fundhub_app") return t.skip(`connected as ${who}, not fundhub_app — the REVOKE only binds the app role`);
    await assert.rejects(
      db.query(`DELETE FROM ops_suggestions WHERE org_id = $1`, [org]),
      /permission denied/);
  });
});
