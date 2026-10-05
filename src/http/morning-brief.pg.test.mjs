/* Postgres-backed tests for the morning brief (MB3) and the evening brief (MB6):
 * runMorningBrief writes one morning_briefs row per Arizona day, and
 * GET /api/read/morning-brief serves it to owner/admin only, scoped to the
 * session's org. Skipped without DATABASE_URL, like every *.pg.test.mjs —
 * and a skip is not green. Never point this at the live database. */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { createSession } from "../auth/session.mjs";
import handler from "../../api/read/morning-brief.mjs";
import { runMorningBrief } from "../ops/morning-brief.mjs";
import { buildScorecard, saveScorecard } from "../pulse/scorecard.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const STAFF_EMAIL_LIKE = "mb_http_test_%@example.com";
const OTHER_ORG_SLUG = "mb-http-test-other-org";

// Fixed mornings far in the past, so the test never touches a real brief.
// 13:00 UTC is 6:00 a.m. Arizona.
const DAY1 = new Date("2001-03-05T13:00:00Z");
const DAY2 = new Date("2001-03-06T13:00:00Z");

const res = () => {
  const r = { code: null, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; return r; };
  return r;
};

/* A runDailyPulse() result as MB2 returns it: the raw checks plus the
   scorecard (src/pulse/scorecard.mjs) the brief's systems section reads. */
const pulseOf = (checks, now) => ({ checks, scorecard: buildScorecard({ checks, now }) });
const PULSE_CHECKS = [
  { id: "health", status: "PASS", detail: "pending 0" },
  { id: "login", status: "FAIL", detail: "HTTP 500", suggestedFix: "check the deploy" },
  { id: "gate-relay", status: "skip", detail: "server" }
];
const PULSE = pulseOf(PULSE_CHECKS, DAY1);

describe("morning brief: store + /api/read/morning-brief", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let orgId, otherOrgId, owner, admin, closer, otherOwner;

  const call = async ({ query = {}, token, method = "GET" } = {}) => {
    const r = res();
    await handler({ method, query, headers: token ? { authorization: "Bearer " + token } : {} }, r);
    return r;
  };

  async function staff(org, role, tag) {
    const id = (await db.query(
      `INSERT INTO staff (org_id, name, role, email, status) VALUES ($1,$2,$3,$4,'active') RETURNING id`,
      [org, `MB ${tag}`, role, `mb_http_test_${tag}@example.com`]
    )).rows[0].id;
    return { id, token: (await createSession(db, { staffId: id, orgId: org })).token };
  }

  async function purge() {
    await db.query(`DELETE FROM morning_briefs WHERE brief_date IN ('2001-03-05','2001-03-06','2001-03-08','2001-03-10')`);
    await db.query(`DELETE FROM staff WHERE email LIKE $1`, [STAFF_EMAIL_LIKE]);
    await db.query(`DELETE FROM orgs WHERE slug = $1`, [OTHER_ORG_SLUG]);
  }

  before(async () => {
    orgId = await resolveDefaultOrg(db);
    await purge();
    otherOrgId = (await db.query(
      `INSERT INTO orgs (slug, name) VALUES ($1,'MB Other Co') RETURNING id`, [OTHER_ORG_SLUG]
    )).rows[0].id;
    owner = await staff(orgId, "owner", "owner");
    admin = await staff(orgId, "admin", "admin");
    closer = await staff(orgId, "closer", "closer");
    otherOwner = await staff(otherOrgId, "owner", "other_owner");
  });

  after(async () => { await purge(); await close(); });

  test("runMorningBrief saves one dry-run row, texts nothing, and starts Good morning, Chris.", async () => {
    const sends = [];
    const out = await runMorningBrief({
      db, orgId, now: DAY1, pulse: PULSE,
      env: { PULSE_SMS_TO: "+14805550199", PLAID_ENV: "sandbox" },
      sendImpl: async (m) => { sends.push(m); return { status: "sent", providerMessageId: "SMx" }; },
      suggest: async () => ({ ok: true, suggestions: [] })
    });
    assert.equal(out.ok, true);
    assert.equal(sends.length, 0);
    assert.match(out.saved.row.text_body, /Suggestions: none today\./);
    const row = out.saved.row;
    assert.equal(row.brief_date, "2001-03-05");
    assert.equal(row.delivery_status, "dry_run");
    assert.equal(row.dry_run, true);
    assert.equal(row.sent_to_last4, "0199");
    assert.equal(row.sent_at, null);
    assert.ok(row.text_body.startsWith("Good morning, Chris. Monday, March 5."));
    assert.match(row.text_body, /Systems: 1 of 3 checks green\. 1 red: login\. 1 not checked\./);
    assert.match(row.text_body, /Money: not connected yet\./);
    assert.equal(row.money.status, "not_connected");
    assert.equal(row.systems.scorecard.checks.find((c) => c.id === "gate-relay").status, "not_checked");
    assert.deepEqual(row.suggestions, []);
    assert.equal(row.report_url, "https://fundhub.ai/app/morning-brief.html?date=2001-03-05");
    assert.ok(row.text_body.endsWith("\n\nFull report: https://fundhub.ai/app/morning-brief.html?date=2001-03-05"));
    const login = row.systems.reds.find((c) => c.id === "login");
    assert.equal(login.fix, "check the deploy");
    assert.equal(login.day_count, 1);
    assert.equal(login.since, "2001-03-05");
    assert.ok(Array.isArray(row.marketing.offers));
    assert.ok(row.marketing.all_offers && Array.isArray(row.marketing.all_offers.not_split));
  });

  test("a rerun the same morning updates the one row, never a second", async () => {
    await runMorningBrief({ db, orgId, now: DAY1, pulse: pulseOf([{ id: "health", status: "PASS", detail: "ok" }], DAY1), env: {} });
    const { rows } = await db.query(
      `SELECT delivery_status, text_body FROM morning_briefs WHERE org_id = $1 AND brief_date = '2001-03-05'`, [orgId]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].delivery_status, "no_number");
    assert.match(rows[0].text_body, /1 of 1 checks green\. Nothing needs you\./);
  });

  test("once a morning is sent, a rerun does not text again or rewrite it", async () => {
    const sends = [];
    const sendImpl = async (m) => { sends.push(m); return { status: "sent", providerMessageId: "SM1" }; };
    const env = { PULSE_SMS_TO: "+14805550199" };
    const first = await runMorningBrief({ db, orgId, now: DAY2, pulse: pulseOf(PULSE_CHECKS, DAY2), env, live: true, sendImpl });
    assert.equal(first.saved.row.delivery_status, "sent");
    assert.ok(first.saved.row.sent_at);
    assert.equal(first.saved.row.provider_message_id, "SM1");
    const second = await runMorningBrief({ db, orgId, now: DAY2, pulse: { checks: [] }, env, live: true, sendImpl });
    assert.equal(sends.length, 1);
    assert.equal(second.saved.saved, false);
    assert.equal(second.saved.row.text_body, first.saved.row.text_body);
  });

  test("the database refuses a text that does not start Good morning, Chris.", async () => {
    await assert.rejects(db.query(
      `INSERT INTO morning_briefs (org_id, brief_date, text_body) VALUES ($1, '2001-03-07', 'Hello')`, [orgId]
    ));
  });

  test("owner and admin read the brief for a date", async () => {
    for (const who of [owner, admin]) {
      const r = await call({ token: who.token, query: { date: "2001-03-05" } });
      assert.equal(r.code, 200);
      assert.equal(r.body.ok, true);
      assert.equal(r.body.brief.brief_date, "2001-03-05");
      assert.ok(r.body.brief.text_body.startsWith("Good morning, Chris."));
    }
  });

  test("no login 401, closer 403, bad date 400, missing morning 404, POST 405", async () => {
    assert.equal((await call({ query: { date: "2001-03-05" } })).code, 401);
    assert.equal((await call({ token: closer.token, query: { date: "2001-03-05" } })).code, 403);
    assert.equal((await call({ token: owner.token, query: { date: "2001-02-30" } })).code, 400);
    assert.equal((await call({ token: owner.token, query: { date: "2001-03-04" } })).code, 404);
    assert.equal((await call({ token: owner.token, method: "POST" })).code, 405);
  });

  test("another company's owner cannot see this company's brief", async () => {
    const r = await call({ token: otherOwner.token, query: { date: "2001-03-05" } });
    assert.equal(r.code, 404);
  });

  /* ---------- evening brief (MB6, migration 433) ---------- */

  // 04:00 UTC is 9:00 p.m. Arizona the evening before.
  const EVE1 = new Date("2001-03-06T04:00:00Z"); // evening of 2001-03-05
  const EVE_NO_MORNING = new Date("2001-03-09T04:00:00Z"); // evening of 2001-03-08

  test("the evening saves its own row beside the morning, reading the morning's stored check", async () => {
    // The pulse stores its scorecard in pulse_scorecards (MB2, migration 430).
    // A re-save the same day replaces the row, so this is safe to re-run.
    await saveScorecard(db, orgId, buildScorecard({ checks: [{ id: "health", status: "PASS", detail: "ok" }], now: DAY1 }));
    const sends = [];
    const out = await runMorningBrief({
      db, orgId, kind: "evening", now: EVE1,
      env: { PULSE_SMS_TO: "+14805550199", PLAID_ENV: "sandbox" },
      sendImpl: async (m) => { sends.push(m); return { status: "sent" }; }
    });
    assert.equal(sends.length, 0, "dry-run: nothing texted");
    const row = out.saved.row;
    assert.equal(row.kind, "evening");
    assert.equal(row.brief_date, "2001-03-05");
    assert.equal(row.delivery_status, "dry_run");
    assert.ok(row.text_body.startsWith("Good evening, Chris. Monday, March 5."));
    // The morning row for 2001-03-05 holds one green check (the rerun above).
    assert.match(row.text_body.replace(/\s/g, " "), /Systems, from this morning's check at 6:00 AM: 1 of 1 checks green\./);
    assert.equal(row.systems.source, "stored_morning_check");
    assert.match(row.text_body, /Team, today so far:/);
    assert.equal(row.report_url, "https://fundhub.ai/app/morning-brief.html?date=2001-03-05&kind=evening");
    assert.ok(row.text_body.endsWith("\n\nFull report: https://fundhub.ai/app/morning-brief.html?date=2001-03-05&kind=evening"));

    const { rows } = await db.query(
      `SELECT kind FROM morning_briefs WHERE org_id = $1 AND brief_date = '2001-03-05' ORDER BY kind`, [orgId]
    );
    assert.deepEqual(rows.map((r) => r.kind), ["evening", "morning"]);

    // A rerun the same evening updates the one evening row.
    await runMorningBrief({ db, orgId, kind: "evening", now: EVE1, env: {} });
    const again = await db.query(
      `SELECT count(*)::int AS n FROM morning_briefs WHERE org_id = $1 AND brief_date = '2001-03-05' AND kind = 'evening'`, [orgId]
    );
    assert.equal(again.rows[0].n, 1);
  });

  test("an evening with no morning check stored says so plainly", async () => {
    const out = await runMorningBrief({ db, orgId, kind: "evening", now: EVE_NO_MORNING, env: {} });
    assert.equal(out.saved.row.brief_date, "2001-03-08");
    assert.match(out.saved.row.text_body, /Systems: no morning check is stored for today/);
    assert.equal(out.saved.row.systems.source, "none_stored_today");
  });

  test("the database holds each kind to its own greeting and refuses any other kind", async () => {
    await assert.rejects(db.query(
      `INSERT INTO morning_briefs (org_id, brief_date, kind, text_body) VALUES ($1, '2001-03-08', 'morning', 'Good evening, Chris. x')`, [orgId]
    ));
    await assert.rejects(db.query(
      `INSERT INTO morning_briefs (org_id, brief_date, kind, text_body) VALUES ($1, '2001-03-06', 'evening', 'Good morning, Chris. x')`, [orgId]
    ));
    await assert.rejects(db.query(
      `INSERT INTO morning_briefs (org_id, brief_date, kind, text_body) VALUES ($1, '2001-03-06', 'noon', 'Good morning, Chris. x')`, [orgId]
    ));
    // Second evening row for the same day is refused by the (org, day, kind) key.
    await assert.rejects(db.query(
      `INSERT INTO morning_briefs (org_id, brief_date, kind, text_body) VALUES ($1, '2001-03-05', 'evening', 'Good evening, Chris. x')`, [orgId]
    ));
  });

  /* ---------- suggestions slot (MB4) ---------- */

  test("the real buildSuggestions runs inside the brief as the app role and never stops it", async () => {
    // No injected suggest: src/ops/suggestions.mjs runs its own staff-scoped reads.
    const out = await runMorningBrief({ db, orgId, now: new Date("2001-03-10T13:00:00Z"), pulse: PULSE, env: {} });
    assert.equal(out.ok, true);
    assert.equal(out.saved.row.brief_date, "2001-03-10");
    assert.ok(Array.isArray(out.saved.row.suggestions));
    assert.ok(out.saved.row.suggestions.length <= 3);
    assert.match(out.saved.row.text_body, /Suggestions?: /);
  });

  test("top 3 suggestions are stored in the report, one in the text; a failure says none today", async () => {
    const items = [1, 2, 3, 4].map((n) => ({ rule: "fix_broken", subject_key: `k${n}`, headline: `Do thing ${n}.`, write_up: null }));
    const eve = await runMorningBrief({
      db, orgId, kind: "evening", now: new Date("2001-03-11T04:00:00Z"), env: {},
      suggest: async ({ date }) => ({ ok: true, date, suggestions: items })
    });
    assert.equal(eve.saved.row.kind, "evening");
    assert.equal(eve.saved.row.suggestions.length, 3);
    assert.match(eve.saved.row.text_body, /Suggestion: Do thing 1\. \(2 more in the report\.\)/);
    assert.doesNotMatch(eve.saved.row.text_body, /Do thing 2/);

    const orig = console.error;
    console.error = () => {};
    let failed;
    try {
      failed = await runMorningBrief({
        db, orgId, kind: "evening", now: new Date("2001-03-11T04:00:00Z"), env: {},
        suggest: async () => { throw new Error("suggestions down"); }
      });
    } finally { console.error = orig; }
    assert.equal(failed.ok, true);
    assert.match(failed.saved.row.text_body, /Suggestions: none today\./);
    assert.deepEqual(failed.saved.row.suggestions, []);
  });

  test("GET kind=evening serves the evening; no kind is morning; bad kind 400; missing evening 404", async () => {
    const eve = await call({ token: owner.token, query: { date: "2001-03-05", kind: "evening" } });
    assert.equal(eve.code, 200);
    assert.equal(eve.body.kind, "evening");
    assert.ok(eve.body.brief.text_body.startsWith("Good evening, Chris."));

    const morn = await call({ token: owner.token, query: { date: "2001-03-05" } });
    assert.equal(morn.code, 200);
    assert.equal(morn.body.kind, "morning");
    assert.ok(morn.body.brief.text_body.startsWith("Good morning, Chris."));

    assert.equal((await call({ token: owner.token, query: { date: "2001-03-05", kind: "night" } })).code, 400);
    assert.equal((await call({ token: owner.token, query: { date: "2001-03-06", kind: "evening" } })).code, 404);
    assert.equal((await call({ token: closer.token, query: { date: "2001-03-05", kind: "evening" } })).code, 403);
    assert.equal((await call({ token: otherOwner.token, query: { date: "2001-03-05", kind: "evening" } })).code, 404);
  });
});
