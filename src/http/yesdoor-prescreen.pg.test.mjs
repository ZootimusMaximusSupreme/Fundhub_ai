// Postgres-backed tests for the Yesdoor funnel's write doors (B3b):
//   POST /api/yesdoor/public/lead
//   POST /api/yesdoor/public/prescreen
//   POST /api/yesdoor/me/income
//
// Lives under src/http/ because npm test's glob is src/** (CLAUDE.md §12: a test
// in api/ never runs). Skips without DATABASE_URL like every *.pg.test.mjs; the
// real run is against a SCRATCH database as fundhub_app, never production.
//
// What is proved:
//   1. who may call what: the wrong principal (none, garbage, staff, building,
//      broker) gets 401/403 on the session door; the public doors are public
//   2. another company's rows are never read or written (two orgs, same city)
//   3. first touch is written once and the database refuses a change
//   4. no screening without a consent row; a bad request leaves no trace
//   5. no_match answers 200 needsDob, and a retry with the date of birth completes
//   6. income recomputes the matches from the SAME screening: no second pull
//   7. the renter's answer carries reasons; a building user's view never does
//   8. the date of birth is stored nowhere
//   9. matching only reads buildings that may take renters
//  10. a finished email cannot be re-run, or hijacked, through the public door

import { test, before, beforeEach, after, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db, close, pool } from "../db.mjs";
import { buildYdFixture, call, creditLeaks } from "../yesdoor/testing/fixture.mjs";
import { _resetYdOrgCache } from "../yesdoor/store/org.mjs";
import { prescreenResponse, runPrescreen } from "../yesdoor/store/prescreen.mjs";
import { publicTokenFor } from "../yesdoor/providers/plaid-sandbox.mjs";
import { createAccountSession } from "../yesdoor/auth/session.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const HEADERS = { "x-forwarded-for": "203.0.113.9", "user-agent": "yd-test" };
const CONSENT = Object.freeze({
  text: "I agree to a soft credit and background check now, and to repeat checks while I am looking.",
  version: "2026-10-07", checked: true
});
const DOB = "1994-05-17"; // the sandbox 'no-match' sample renter (Leah)

describe("yesdoor funnel write doors", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let lead, prescreen, income, me, buildingRenters, fx;
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const one = async (sql, params) => (await q(sql, params))[0];
  const useOrg = (slug) => { process.env.YD_ORG_SLUG = slug; _resetYdOrgCache(); };

  const post = (handler, body, extra = {}) => call(handler, { method: "POST", body, headers: HEADERS, ...extra });
  const body = (email, extra = {}) => ({
    email, address: { line1: "1 Sample St", city: "Phoenix", state: "AZ", zip: "85004" },
    search: { city: "Phoenix" }, consent: { ...CONSENT }, ...extra
  });
  const fixtureEmail = (key) => ({
    prime1: "priya.raman@sample.yesdoor.test", prime2: "daniel.okoro@sample.yesdoor.test",
    tierB: "marcus.bell@sample.yesdoor.test", tierC: "tanya.whitfield@sample.yesdoor.test",
    tierD: "jerome.castillo@sample.yesdoor.test", leah: "leah.brandt@sample.yesdoor.test"
  })[key];

  const count = async (table, where, params) =>
    Number((await one(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params)).n);
  const renterRow = (email, org = fx.orgA) => one(`SELECT * FROM yd_renters WHERE org_id=$1 AND email=$2`, [org, email]);

  before(async () => {
    ({ default: lead } = await import("../../api/yesdoor/public/lead.mjs"));
    ({ default: prescreen } = await import("../../api/yesdoor/public/prescreen.mjs"));
    ({ default: income } = await import("../../api/yesdoor/me/income.mjs"));
    ({ default: me } = await import("../../api/yesdoor/me.mjs"));
    ({ default: buildingRenters } = await import("../../api/yesdoor/building/renters.mjs"));
    fx = await buildYdFixture(db);
    useOrg(fx.slugA);
  });
  beforeEach(() => useOrg(fx.slugA));
  after(async () => { delete process.env.YD_ORG_SLUG; await close(); });

  /* ================================================================ lead */

  describe("POST public/lead", () => {
    test("creates a renter and writes the first touch: an active broker's code", async () => {
      useOrg(fx.slugA);
      const r = await post(lead, { email: "Lead.Broker@Example.test", firstName: "Lena", lastName: "Lead", source: { brokerCode: fx.A.brokerCode.toLowerCase() } });
      assert.equal(r.code, 200);
      assert.deepEqual(r.body, { ok: true, status: "received" });
      const row = await renterRow("lead.broker@example.test");
      assert.equal(row.source_kind, "broker");
      assert.equal(row.source_broker_id, fx.A.broker);
      assert.equal(row.first_name, "Lena");
      assert.equal(row.stage, "lead");
      assert.ok(row.first_touch_at);
      const ev = await one(`SELECT payload FROM yd_events WHERE entity_id=$1 AND name='renter.lead_created'`, [row.id]);
      assert.equal(ev.payload.source_kind, "broker");
    });

    test("an ad id is the first touch when no broker brought them", async () => {
      useOrg(fx.slugA);
      await post(lead, { email: "lead.ad@example.test", source: { kind: "ad", adId: "43-summer" } });
      const row = await renterRow("lead.ad@example.test");
      assert.equal(row.source_kind, "ad");
      assert.equal(row.source_ad_id, "43-summer");
    });

    test("FIRST TOUCH IS WRITTEN ONCE: a second visit through another ad or broker changes nothing", async () => {
      useOrg(fx.slugA);
      await post(lead, { email: "lead.once@example.test", source: { kind: "ad", adId: "11" } });
      const first = await renterRow("lead.once@example.test");
      await new Promise((r) => setTimeout(r, 15));
      const again = await post(lead, { email: "LEAD.once@example.test", firstName: "Late", source: { brokerCode: fx.A.brokerCode } });
      assert.equal(again.code, 200);
      const row = await renterRow("lead.once@example.test");
      assert.equal(row.source_kind, "ad");
      assert.equal(row.source_ad_id, "11");
      assert.equal(row.source_broker_id, null);
      assert.equal(new Date(row.first_touch_at).getTime(), new Date(first.first_touch_at).getTime());
      assert.equal(await count("yd_renters", "org_id=$1 AND email=$2", [fx.orgA, "lead.once@example.test"]), 1);
      assert.equal(await count("yd_events", "entity_id=$1 AND name='renter.lead_created'", [row.id]), 1);
    });

    test("the database itself refuses to move a first touch, even as the app role", async () => {
      useOrg(fx.slugA);
      await post(lead, { email: "lead.locked@example.test", source: { kind: "organic" } });
      const row = await renterRow("lead.locked@example.test");
      const client = await pool().connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE fundhub_app");
        await assert.rejects(
          () => client.query(`UPDATE yd_renters SET source_kind='ad', source_ad_id='99' WHERE id=$1`, [row.id]),
          /yd_first_touch_locked/);
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
      }
      assert.equal((await renterRow("lead.locked@example.test")).source_kind, "organic");
    });

    test("a first touch that cannot be honoured falls back to direct, never an error", async () => {
      useOrg(fx.slugA);
      await db.query(`UPDATE yd_brokers SET status='paused' WHERE id=$1`, [fx.A.broker]);
      try {
        for (const [n, source] of [
          ["paused", { brokerCode: fx.A.brokerCode }],
          ["nocode", { kind: "broker" }],
          ["badcode", { kind: "broker", brokerCode: "YD-000000" }],
          ["noad", { kind: "ad" }],
          ["junk", { kind: "admin" }],
          ["none", undefined]
        ]) {
          const email = `lead.fallback.${n}@example.test`;
          const r = await post(lead, { email, source });
          assert.equal(r.code, 200, n);
          const row = await renterRow(email);
          assert.equal(row.source_kind, "direct", n);
          assert.equal(row.source_broker_id, null, n);
        }
      } finally {
        await db.query(`UPDATE yd_brokers SET status='active' WHERE id=$1`, [fx.A.broker]);
      }
    });

    test("another company's broker code is not a first touch in this one", async () => {
      useOrg(fx.slugA);
      await post(lead, { email: "lead.crossbroker@example.test", source: { brokerCode: fx.B.brokerCode } });
      const row = await renterRow("lead.crossbroker@example.test");
      assert.equal(row.source_kind, "direct");
      assert.equal(row.source_broker_id, null);
    });

    test("the same email in two companies is two renters, each in its own book", async () => {
      useOrg(fx.slugA);
      await post(lead, { email: "lead.twoorgs@example.test", source: { kind: "organic" } });
      useOrg(fx.slugB);
      await post(lead, { email: "lead.twoorgs@example.test", source: { kind: "ad", adId: "5" } });
      useOrg(fx.slugA);
      const a = await renterRow("lead.twoorgs@example.test", fx.orgA);
      const b = await renterRow("lead.twoorgs@example.test", fx.orgB);
      assert.notEqual(a.id, b.id);
      assert.equal(a.source_kind, "organic");
      assert.equal(b.source_kind, "ad");
    });

    test("existing names are filled in where empty and never overwritten by a stranger", async () => {
      useOrg(fx.slugA);
      await post(lead, { email: "lead.names@example.test", firstName: "Nora" });
      await post(lead, { email: "lead.names@example.test", firstName: "Hacker", lastName: "Newlast" });
      const row = await renterRow("lead.names@example.test");
      assert.equal(row.first_name, "Nora");
      assert.equal(row.last_name, "Newlast");
    });

    test("the answer is the same for a new email and a known one", async () => {
      useOrg(fx.slugA);
      const fresh = await post(lead, { email: `lead.same.${crypto.randomUUID()}@example.test` });
      const known = await post(lead, { email: "lead.broker@example.test" });
      assert.deepEqual(fresh.body, known.body);
      assert.equal(fresh.code, known.code);
    });

    test("a bad email is a 400 and writes nothing; GET is a 405", async () => {
      useOrg(fx.slugA);
      const before = await count("yd_renters", "org_id=$1", [fx.orgA]);
      for (const email of [undefined, "", "nope", "a@b", { x: 1 }]) {
        const r = await post(lead, { email });
        assert.equal(r.code, 400);
        assert.equal(r.body.error, "email_required");
      }
      assert.equal(await count("yd_renters", "org_id=$1", [fx.orgA]), before);
      const g = await call(lead, { method: "GET" });
      assert.equal(g.code, 405);
      assert.equal(g.headers.allow, "POST");
    });

    test("it is a public door: no login needed, and a junk token is simply ignored", async () => {
      useOrg(fx.slugA);
      const r = await post(lead, { email: "lead.public@example.test" }, { token: "not-a-real-token" });
      assert.equal(r.code, 200);
    });
  });

  /* =========================================================== prescreen */

  describe("POST public/prescreen: the consent gate", () => {
    const traceOf = async (email) => {
      const r = await renterRow(email);
      return {
        renter: !!r,
        consents: r ? await count("yd_consents", "renter_id=$1", [r.id]) : 0,
        screenings: r ? await count("yd_screenings", "renter_id=$1", [r.id]) : 0,
        matches: r ? await count("yd_matches", "renter_id=$1", [r.id]) : 0
      };
    };

    test("no screening without consent: every way of not consenting is a 400 and leaves no trace", async () => {
      useOrg(fx.slugA);
      const email = "consent.none@example.test";
      const cases = [
        ["no consent", { consent: undefined }],
        ["null consent", { consent: null }],
        ["box not ticked", { consent: { ...CONSENT, checked: false } }],
        ["ticked as a string", { consent: { ...CONSENT, checked: "true" } }],
        ["no text", { consent: { ...CONSENT, text: "" } }],
        ["no version", { consent: { ...CONSENT, version: " " } }]
      ];
      for (const [name, patch] of cases) {
        const r = await post(prescreen, { ...body(email), ...patch });
        assert.equal(r.code, 400, name);
        assert.equal(r.body.error, "consent_required", name);
      }
      assert.deepEqual(await traceOf(email), { renter: false, consents: 0, screenings: 0, matches: 0 });
    });

    test("a bad request is refused before anything is written: email, city, date of birth", async () => {
      useOrg(fx.slugA);
      const email = "consent.badinput@example.test";
      const bad = [
        [{ email: "nope" }, "email_required"],
        [{ search: {}, address: { line1: "x" } }, "city_required"],
        [{ dob: "05/17/1994" }, "invalid_dob"],
        [{ dob: "2030-01-01" }, "invalid_dob"],
        [{ dob: "2015-06-01" }, "invalid_dob"],
        [{ search: { city: "Phoenix", beds: 99 } }, "invalid_parameter"],
        [{ search: { city: "Phoenix", maxRent: -4 } }, "invalid_parameter"]
      ];
      for (const [patch, code] of bad) {
        const r = await post(prescreen, { ...body(email), ...patch });
        assert.equal(r.code, 400, JSON.stringify(patch));
        assert.equal(r.body.error, code, JSON.stringify(patch));
      }
      assert.equal((await traceOf(email)).renter, false);
    });

    test("GET is a 405 with an allow header", async () => {
      const r = await call(prescreen, { method: "GET" });
      assert.equal(r.code, 405);
      assert.equal(r.headers.allow, "POST");
    });
  });

  describe("POST public/prescreen: a complete pre-screen, then income, on one renter", () => {
    let first, renterId, token, screeningId;
    const email = () => fixtureEmail("prime1");

    test("consent, screening and matches land together, and the renter gets an answer with reasons", async () => {
      useOrg(fx.slugA);
      first = await post(prescreen, body(email(), {
        firstName: "Priya", lastName: "Raman-Sample",
        source: { kind: "ad", adId: "87-prime" }
      }));
      assert.equal(first.code, 200, JSON.stringify(first.body));
      assert.equal(first.body.ok, true);
      assert.equal(first.body.status, "complete");
      assert.equal(first.headers["cache-control"], "no-store");

      // the answer: one building in the searched city, "likely" because income is not verified yet
      assert.equal(first.body.results.length, 1);
      const res = first.body.results[0];
      assert.equal(res.building.id, fx.A.bSigned);
      assert.equal(res.result, "likely");
      assert.equal(res.listing.unit, "101", "the cheapest unit is shown");
      assert.equal(res.listing.rentCents, 162500);
      assert.equal(res.maxRentCents, null, "unknown stays unknown, never 0");
      const reasons = Object.fromEntries(res.reasons.map((x) => [x.rule, x]));
      assert.equal(reasons.score.result, "pass");
      assert.equal(reasons.income.result, "unknown");
      assert.match(reasons.income.reason, /not been verified/);
      assert.ok(res.rulesConfirmedAt);
      assert.equal(first.body.nextStep, "verify_income");
      assert.equal(first.body.renter.stage, "matched");
      assert.equal(first.body.renter.lane, "verified");
      assert.equal(first.body.renter.riskTier, "B", "a prime file with no verified income is B");
      assert.equal(first.body.renter.approvedMaxRentCents, null);
      assert.deepEqual(first.body.backups, []);
      assert.deepEqual(first.body.search, { city: "Phoenix", state: "AZ", beds: null, maxRentCents: null });
      // a renter-safe body: no raw report, no credit-field keys
      assert.deepEqual(creditLeaks(first.body), []);

      // the rows
      const r = await renterRow(email());
      renterId = r.id;
      assert.equal(r.stage, "matched");
      assert.equal(r.source_kind, "ad");
      assert.equal(r.source_ad_id, "87-prime");
      assert.equal(r.income_verified, false);
      assert.deepEqual(r.current_address, { line1: "1 Sample St", city: "Phoenix", state: "AZ", zip: "85004" });

      const consents = await q(`SELECT kind, consent_text, consent_version, method, host(ip) AS ip, user_agent FROM yd_consents WHERE renter_id=$1 ORDER BY kind`, [renterId]);
      assert.deepEqual(consents.map((c) => c.kind), ["recheck", "screening"], "screening and recheck consent are captured together");
      for (const c of consents) {
        assert.equal(c.consent_text, CONSENT.text);
        assert.equal(c.consent_version, CONSENT.version);
        assert.equal(c.method, "checkbox");
        assert.equal(c.ip, "203.0.113.9");
        assert.equal(c.user_agent, "yd-test");
      }

      const s = await q(`SELECT id, consent_id, kind, provider, status, credit_score, collections_count, eviction_count, criminal_flags FROM yd_screenings WHERE renter_id=$1`, [renterId]);
      assert.equal(s.length, 1);
      screeningId = s[0].id;
      assert.equal(s[0].status, "complete");
      assert.equal(s[0].provider, "crs_sandbox");
      assert.equal(s[0].kind, "initial");
      assert.equal(s[0].credit_score, 771);
      assert.equal(s[0].eviction_count, 0);
      assert.ok(consents.length === 2 && (await one(`SELECT kind FROM yd_consents WHERE id=$1`, [s[0].consent_id])).kind === "screening",
        "the screening runs under the screening consent");
      const raw = await one(`SELECT payload FROM yd_screening_raw WHERE screening_id=$1`, [screeningId]);
      assert.equal(raw.payload.sandbox, true);

      const m = await q(`SELECT building_id, result, is_backup, income_check_id, screening_id, rules_id FROM yd_matches WHERE renter_id=$1`, [renterId]);
      assert.equal(m.length, 1);
      assert.equal(m[0].building_id, fx.A.bSigned);
      assert.equal(m[0].result, "likely");
      assert.equal(m[0].is_backup, false);
      assert.equal(m[0].income_check_id, null);
      assert.equal(m[0].screening_id, screeningId);
      assert.equal(m[0].rules_id, fx.A.rSigned);
    });

    test("it wrote the timeline: lead, consent, screening, prescreen, stage, profile, matches", async () => {
      const names = (await q(`SELECT name FROM yd_events WHERE org_id=$1 AND (entity_id=$2 OR entity_id=$3) ORDER BY occurred_at, id`,
        [fx.orgA, renterId, screeningId])).map((e) => e.name);
      for (const n of ["renter.lead_created", "consent.captured", "screening.complete", "prescreen.completed",
        "renter.stage_changed", "renter.profile_updated", "renter.matched"]) {
        assert.ok(names.includes(n), `missing event ${n} in ${names.join(",")}`);
      }
      const stage = await one(`SELECT payload FROM yd_events WHERE entity_id=$1 AND name='renter.stage_changed'`, [renterId]);
      assert.deepEqual(stage.payload, { from: "lead", to: "matched" });
    });

    test("the renterToken is a real session: GET me and POST me/income accept it", async () => {
      token = first.body.renterToken;
      assert.match(token, /^[A-Za-z0-9_-]{20,}$/);
      assert.ok(Date.parse(first.body.renterTokenExpiresAt) > Date.now());
      const mine = await call(me, { token });
      assert.equal(mine.code, 200);
      assert.equal(mine.body.renter.email, email());
      assert.equal(mine.body.renter.stage, "matched");
      assert.equal(mine.body.matches.length, 1);
      // only the hash of the token is stored
      const acct = await one(`SELECT id, kind, status FROM yd_accounts WHERE org_id=$1 AND renter_id=$2`, [fx.orgA, renterId]);
      assert.equal(acct.kind, "renter");
      const stored = await q(`SELECT token_hash FROM yd_sessions WHERE account_id=$1`, [acct.id]);
      assert.equal(stored.length, 1);
      assert.notEqual(stored[0].token_hash, token);
    });

    test("income: the sandbox bank link verifies, the matches are recomputed, and NO SECOND PULL happens", async () => {
      const screeningsBefore = await count("yd_screenings", "renter_id=$1", [renterId]);
      const consentsBefore = await count("yd_consents", "renter_id=$1", [renterId]);
      const matchesBefore = await count("yd_matches", "renter_id=$1", [renterId]);

      const r = await post(income, { method: "plaid", publicToken: publicTokenFor("prime-1") }, { token });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.status, "verified");
      assert.equal(r.body.income.method, "plaid");
      assert.equal(r.body.income.status, "verified");
      assert.equal(r.body.income.monthlyIncomeCents, 720000);
      assert.ok(r.body.income.checkedAt);

      // approved now, at the best (cheapest) unit
      assert.equal(r.body.results.length, 1);
      assert.equal(r.body.results[0].result, "approved");
      assert.equal(r.body.results[0].listing.unit, "101");
      assert.equal(r.body.results[0].maxRentCents, 240000);
      assert.equal(r.body.renter.approvedMaxRentCents, 240000);
      assert.equal(r.body.renter.riskTier, "A");
      assert.equal(r.body.renter.incomeVerified, true);
      assert.equal(r.body.nextStep, null);
      assert.deepEqual(creditLeaks(r.body), []);

      // backups: other buildings in the same state, outside the searched city, that the renter is approved at
      assert.deepEqual(r.body.backups.map((b) => b.building.id), [fx.A.bOther, fx.A.bSample]);
      assert.deepEqual(r.body.backups.map((b) => b.building.name.split(" ")[0]), ["Other", "Sample"]);
      assert.equal(r.body.backups.every((b) => b.result === "approved" && !("reasons" in b)), true);
      const sample = r.body.backups.find((b) => b.building.id === fx.A.bSample);
      assert.equal(sample.building.isSample, true, "a sample is labelled, never passed off as real");

      // the proof there was no second pull
      assert.equal(await count("yd_screenings", "renter_id=$1", [renterId]), screeningsBefore, "no new screening");
      assert.equal(await count("yd_consents", "renter_id=$1", [renterId]), consentsBefore, "no new consent");
      assert.equal((await one(`SELECT count(*)::int AS n FROM yd_screenings WHERE renter_id=$1 AND kind='recheck'`, [renterId])).n, 0);

      // history is kept: new rows, the old ones untouched, tied to the new income check
      const rows = await q(`SELECT result, is_backup, income_check_id, screening_id FROM yd_matches WHERE renter_id=$1 ORDER BY computed_at, id`, [renterId]);
      assert.equal(rows.length, matchesBefore + 3);
      assert.equal(rows[0].result, "likely", "the first answer is still there");
      assert.equal(rows[0].income_check_id, null);
      const newest = rows.slice(matchesBefore);
      assert.ok(newest.every((x) => x.screening_id === screeningId && x.income_check_id));
      assert.equal(newest.filter((x) => x.is_backup).length, 2);

      const renterNow = await renterRow(email());
      assert.equal(renterNow.income_verified, true);
      assert.equal(renterNow.risk_tier, "A");
      assert.equal(Number(renterNow.approved_max_rent_cents), 240000);
      assert.equal(renterNow.stage, "matched");

      const ic = await one(`SELECT method, status, monthly_income_cents, checked_at FROM yd_income_checks WHERE renter_id=$1`, [renterId]);
      assert.equal(ic.status, "verified");
      assert.equal(Number(ic.monthly_income_cents), 720000);
      assert.ok(ic.checked_at);
      const evs = (await q(`SELECT name FROM yd_events WHERE org_id=$1 AND entity_id=$2`, [fx.orgA, renterId])).map((e) => e.name);
      assert.ok(evs.includes("renter.profile_updated"));
      assert.ok((await q(`SELECT 1 FROM yd_events WHERE org_id=$1 AND name='income.verified' AND payload->>'renter_id'=$2`, [fx.orgA, renterId])).length === 1);
    });

    test("GET me now shows the newest answer per building", async () => {
      const mine = await call(me, { token });
      const phoenix = mine.body.matches.find((m) => m.building.id === fx.A.bSigned);
      assert.equal(phoenix.result, "approved");
      assert.equal(phoenix.isBackup, false);
    });

    test("RENTER vs BUILDING: the renter's answer carries reasons; a building user's view never does", async () => {
      // the renter's own answer has the reasons
      assert.ok(first.body.results[0].reasons.length >= 5);
      assert.match(JSON.stringify(first.body.results[0].reasons), /Credit score 771/);

      // book the renter at the building the way B4 will, then read it as the building user
      const match = await one(`SELECT id FROM yd_matches WHERE renter_id=$1 AND building_id=$2 ORDER BY computed_at DESC, id DESC LIMIT 1`, [renterId, fx.A.bSigned]);
      await db.query(`INSERT INTO yd_applications (org_id, renter_id, building_id, listing_id, match_id) VALUES ($1,$2,$3,$4,$5)`,
        [fx.orgA, renterId, fx.A.bSigned, fx.A.lPublic1, match.id]);
      const asBuilding = await call(buildingRenters, { token: fx.tokens.buildingA });
      assert.equal(asBuilding.code, 200);
      const mine = asBuilding.body.renters.find((x) => x.renter.email === email());
      assert.ok(mine, "the building sees its renter");
      assert.equal(mine.result, "approved");
      assert.equal(mine.incomeVerified, true);
      assert.equal(mine.riskTier, "A");
      assert.equal(mine.maxRentCents, 240000);
      assert.deepEqual(creditLeaks(asBuilding.body), []);
      const text = JSON.stringify(asBuilding.body);
      assert.equal(text.includes("reasons"), false);
      assert.equal(text.includes("Credit score 771"), false);
    });

    test("a second pre-screen for this email does NOT run again and shows nothing: it asks them to sign in", async () => {
      const screeningsBefore = await count("yd_screenings", "renter_id=$1", [renterId]);
      const links = await count("yd_outbox", "org_id=$1 AND to_address=$2 AND template_key='yd-magic-link'", [fx.orgA, email()]);
      const r = await post(prescreen, body(email()));
      assert.equal(r.code, 200);
      assert.equal(r.body.status, "signin_required");
      assert.equal(r.body.results, undefined);
      assert.equal(r.body.renterToken, undefined);
      assert.deepEqual(creditLeaks(r.body), []);
      assert.equal(await count("yd_screenings", "renter_id=$1", [renterId]), screeningsBefore);
      assert.equal(await count("yd_outbox", "org_id=$1 AND to_address=$2 AND template_key='yd-magic-link'", [fx.orgA, email()]), links + 1,
        "a sign-in link is queued instead (nothing is sent)");
      const link = await one(`SELECT status, provider FROM yd_outbox WHERE org_id=$1 AND to_address=$2 AND template_key='yd-magic-link' ORDER BY created_at DESC LIMIT 1`, [fx.orgA, email()]);
      assert.equal(link.status, "queued");
    });

    test("the first touch survived the whole funnel", async () => {
      const r = await renterRow(email());
      assert.equal(r.source_kind, "ad");
      assert.equal(r.source_ad_id, "87-prime");
    });
  });

  describe("POST public/prescreen: no match, then the date of birth", () => {
    const email = () => fixtureEmail("leah");
    let renterId;

    test("no file on name and address alone: 200 needsDob, consent kept, no matches, no token", async () => {
      useOrg(fx.slugA);
      const r = await post(prescreen, body(email(), { firstName: "Leah", lastName: "Brandt-Sample" }));
      assert.equal(r.code, 200);
      assert.equal(r.body.ok, true);
      assert.equal(r.body.status, "needs_dob");
      assert.equal(r.body.needsDob, true);
      assert.equal(r.body.renterToken, undefined);
      assert.equal(r.body.results, undefined);

      const row = await renterRow(email());
      renterId = row.id;
      assert.equal(row.stage, "lead", "an unmatched renter has not been screened");
      assert.equal(await count("yd_consents", "renter_id=$1", [renterId]), 2);
      const s = await q(`SELECT status, credit_score, eviction_count, result_at FROM yd_screenings WHERE renter_id=$1`, [renterId]);
      assert.equal(s.length, 1);
      assert.equal(s[0].status, "no_match");
      assert.equal(s[0].credit_score, null);
      assert.ok(s[0].result_at);
      assert.equal(await count("yd_matches", "renter_id=$1", [renterId]), 0);
      assert.equal(await count("yd_accounts", "org_id=$1 AND renter_id=$2", [fx.orgA, renterId]), 0);
    });

    test("the retry with a date of birth completes, and now there is a token", async () => {
      useOrg(fx.slugA);
      const r = await post(prescreen, body(email(), { dob: DOB }));
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.status, "complete");
      assert.ok(r.body.renterToken);
      assert.equal(r.body.renter.riskTier, "B");
      assert.equal(r.body.results.length, 1);
      assert.equal(await count("yd_screenings", "renter_id=$1", [renterId]), 2, "the no_match row stays; the new one is added");
      assert.equal(await count("yd_screenings", "renter_id=$1 AND status='complete'", [renterId]), 1);
      assert.equal(await count("yd_consents", "renter_id=$1", [renterId]), 4, "every capture is its own dated record");
      assert.equal((await renterRow(email())).stage, "matched");
    });

    test("THE DATE OF BIRTH IS STORED NOWHERE: not in any Yesdoor table", async () => {
      for (const table of ["yd_renters", "yd_consents", "yd_screenings", "yd_screening_raw", "yd_events", "yd_outbox",
        "yd_matches", "yd_income_checks", "yd_accounts", "yd_sessions", "yd_magic_links"]) {
        const n = await count(table, `org_id=$1 AND ${table}::text LIKE $2`, [fx.orgA, `%${DOB}%`]);
        assert.equal(n, 0, `${table} holds the date of birth`);
      }
    });

    test("a date of birth that is not a real adult date is refused even on the retry", async () => {
      useOrg(fx.slugA);
      const r = await post(prescreen, body("dob.bad@example.test", { dob: "1994-02-31" }));
      assert.equal(r.code, 400);
      assert.equal(r.body.error, "invalid_dob");
      assert.equal(await renterRow("dob.bad@example.test"), undefined);
    });
  });

  describe("POST public/prescreen: other files, other tiers", () => {
    test("tier C with an old eviction is the Second Chance lane, and the building says likely", async () => {
      useOrg(fx.slugA);
      const r = await post(prescreen, body(fixtureEmail("tierC")));
      assert.equal(r.body.status, "complete");
      assert.equal(r.body.renter.riskTier, "C");
      assert.equal(r.body.renter.lane, "second_chance");
      const res = r.body.results[0];
      assert.equal(res.result, "likely");
      const ev = res.reasons.find((x) => x.rule === "evictions");
      assert.equal(ev.result, "pass", "the 2019 eviction is outside this building's five-year window");
      assert.equal((await renterRow(fixtureEmail("tierC"))).lane, "second_chance");
    });

    test("tier D fails the building's minimum score: answer no, stage screened (nothing to match yet), still a token", async () => {
      useOrg(fx.slugA);
      const r = await post(prescreen, body(fixtureEmail("tierD")));
      assert.equal(r.body.status, "complete");
      assert.equal(r.body.renter.riskTier, "D");
      assert.equal(r.body.results[0].result, "no");
      assert.equal(r.body.renter.stage, "screened");
      assert.match(r.body.results[0].reasons.find((x) => x.rule === "score").reason, /below the building's minimum of 600/);
      assert.deepEqual(r.body.backups, []);
      assert.ok(r.body.renterToken);
      assert.equal((await renterRow(fixtureEmail("tierD"))).stage, "screened");
    });

    test("a generated file: an unknown email with a date of birth gets a mid-tier file and matches", async () => {
      useOrg(fx.slugA);
      const r = await post(prescreen, body("someone.new@example.test", { dob: "1990-03-03" }));
      assert.equal(r.body.status, "complete");
      assert.equal(r.body.results.length, 1);
      const none = await post(prescreen, body("someone.else@example.test"));
      assert.equal(none.body.status, "needs_dob", "an unknown email with no date of birth is a no_match first");
    });

    test("searching a city with no signed building, or filters nobody meets, is an empty answer, not an error", async () => {
      useOrg(fx.slugA);
      const r = await post(prescreen, body("empty.city@example.test", { dob: "1991-01-01", search: { city: "Flagstaff" }, address: { city: "Flagstaff", state: "AZ" } }));
      assert.equal(r.body.status, "complete");
      assert.deepEqual(r.body.results, []);
      assert.equal(r.body.renter.stage, "screened");
      assert.equal(await count("yd_matches", "renter_id=$1", [(await renterRow("empty.city@example.test")).id]), 0);
    });

    test("beds and maxRent narrow the units that are matched; maxRent is whole dollars", async () => {
      useOrg(fx.slugA);
      const two = await post(prescreen, body("filters.beds@example.test", { dob: "1991-02-02", search: { city: "Phoenix", beds: 2 } }));
      assert.equal(two.body.results.length, 1);
      assert.equal(two.body.results[0].listing.unit, "205");
      assert.equal(two.body.results[0].listing.beds, 2);
      const cheap = await post(prescreen, body("filters.rent@example.test", { dob: "1991-03-03", search: { city: "Phoenix", maxRent: 1700 } }));
      assert.equal(cheap.body.results[0].listing.unit, "101");
      const none = await post(prescreen, body("filters.none@example.test", { dob: "1991-04-04", search: { city: "Phoenix", maxRent: 1000 } }));
      assert.deepEqual(none.body.results, []);
    });

    test("an address is optional: the city can come from the search alone", async () => {
      useOrg(fx.slugA);
      const r = await post(prescreen, { email: "noaddress@example.test", dob: "1992-02-02", search: { city: "Phoenix" }, consent: { ...CONSENT } });
      assert.equal(r.body.status, "complete");
      assert.equal((await renterRow("noaddress@example.test")).current_address, null);
    });
  });

  describe("POST public/prescreen: only buildings that may take renters", () => {
    let o; // org with a city full of buildings in every state
    const fresh = async () => {
      const f = await buildYdFixture(db);
      const orgId = f.orgA;
      const company = f.A.company;
      const mkBuilding = async (name, { status = "signed", sample = false } = {}) => (await one(
        `INSERT INTO yd_buildings (org_id, company_id, name, city, state, status, is_sample) VALUES ($1,$2,$3,'Glendale','AZ',$4,$5) RETURNING id`,
        [orgId, company, name, status, sample])).id;
      const mkRules = (b, { confirmed = "now()" } = {}) => one(
        `INSERT INTO yd_building_rules (org_id, building_id, confirmed_at, min_score, income_multiple, max_evictions, eviction_lookback_years)
         VALUES ($1,$2,${confirmed},550,3,1,5) RETURNING id`, [orgId, b]);
      const mkListing = (b, unit, { active = true, rent = 140000 } = {}) => one(
        `INSERT INTO yd_listings (org_id, building_id, unit_label, beds, rent_cents, active) VALUES ($1,$2,$3,1,$4,$5) RETURNING id`, [orgId, b, unit, rent, active]);
      const sign = async (b) => {
        const a = (await one(`INSERT INTO yd_agreements (org_id, party_kind, party_id, kind, status, terms) VALUES ($1,'building',$2,'building_fee','draft','{}') RETURNING id`, [orgId, b])).id;
        await db.query(`UPDATE yd_agreements SET status='sent', sent_at=now() WHERE id=$1`, [a]);
        await db.query(`UPDATE yd_agreements SET status='signed', signed_at=now(), signer_name='Test Signer' WHERE id=$1`, [a]);
      };
      const good = await mkBuilding("Glendale Good"); await mkRules(good); await mkListing(good, "1"); await sign(good);
      const paused = await mkBuilding("Glendale Paused", { status: "paused" }); await mkRules(paused); await mkListing(paused, "1"); await sign(paused);
      const unsignedAgreement = await mkBuilding("Glendale NoAgreement"); await mkRules(unsignedAgreement); await mkListing(unsignedAgreement, "1");
      const norules = await mkBuilding("Glendale NoRules"); await mkListing(norules, "1"); await sign(norules);
      const nolistings = await mkBuilding("Glendale NoListings"); await mkRules(nolistings); await mkListing(nolistings, "1", { active: false }); await sign(nolistings);
      const target = await mkBuilding("Glendale Target", { status: "target" }); await mkRules(target); await mkListing(target, "1");
      const sample = await mkBuilding("Glendale Sample", { status: "target", sample: true }); await mkRules(sample); await mkListing(sample, "1");
      const stale = await mkBuilding("Glendale Stale"); await mkRules(stale, { confirmed: "now() - interval '40 days'" }); await mkListing(stale, "1"); await sign(stale);
      const churned = await mkBuilding("Glendale Churned", { status: "churned", sample: true }); await mkRules(churned); await mkListing(churned, "1");
      return { f, good, paused, unsignedAgreement, norules, nolistings, target, sample, stale, churned };
    };

    before(async () => { o = await fresh(); });

    test("matching reads signed/live buildings with a signed agreement, rules and a live unit, plus samples", async () => {
      useOrg(o.f.slugA);
      const r = await post(prescreen, {
        email: "glendale@example.test", dob: "1990-09-09", consent: { ...CONSENT },
        search: { city: "Glendale", state: "AZ" }, address: { city: "Glendale", state: "AZ" }
      });
      assert.equal(r.body.status, "complete", JSON.stringify(r.body));
      const got = r.body.results.map((x) => x.building.id).sort();
      assert.deepEqual(got, [o.good, o.sample, o.stale].sort(),
        "good, the flagged sample, and the stale one (answered 'likely')");
      for (const [name, b] of [["paused", o.paused], ["no agreement", o.unsignedAgreement], ["no rules", o.norules],
        ["no live units", o.nolistings], ["unsigned target", o.target], ["churned sample", o.churned]]) {
        assert.ok(!got.includes(b), `${name} building was matched`);
      }
      const byId = Object.fromEntries(r.body.results.map((x) => [x.building.id, x]));
      assert.equal(byId[o.sample].building.isSample, true);
      assert.equal(byId[o.stale].result, "likely");
      assert.equal(byId[o.stale].rulesStale, true);
      assert.match(byId[o.stale].reasons.find((x) => x.rule === "rules_freshness").reason, /more than 30 days ago/);
    });

    test("no match row exists for a building that may not take renters", async () => {
      const renter = await one(`SELECT id FROM yd_renters WHERE org_id=$1 AND email='glendale@example.test'`, [o.f.orgA]);
      const ids = (await q(`SELECT DISTINCT building_id FROM yd_matches WHERE renter_id=$1`, [renter.id])).map((x) => x.building_id);
      for (const b of [o.paused, o.unsignedAgreement, o.norules, o.nolistings, o.target, o.churned]) {
        assert.ok(!ids.includes(b));
      }
    });

    test("another company's buildings are never read, even in the same city", async () => {
      useOrg(o.f.slugA);
      const r = await post(prescreen, {
        email: "glendale.two@example.test", dob: "1990-09-10", consent: { ...CONSENT }, search: { city: "Phoenix" }
      });
      const mine = new Set((await q(`SELECT id FROM yd_buildings WHERE org_id=$1`, [o.f.orgA])).map((x) => x.id));
      assert.ok(r.body.results.length > 0);
      assert.ok(r.body.results.every((x) => mine.has(x.building.id)), "a result came from another company");
      assert.equal(await count("yd_renters", "org_id=$1 AND email='glendale.two@example.test'", [o.f.orgB]), 0);
      assert.equal(await count("yd_matches", "org_id=$1 AND renter_id=(SELECT id FROM yd_renters WHERE org_id=$2 AND email='glendale.two@example.test')", [o.f.orgB, o.f.orgA]), 0);
    });
  });

  describe("POST public/prescreen: screening can fail, and one renter is screened once", () => {
    test("a provider failure keeps the consent, records a failed screening, matches nothing, and a retry works", async () => {
      const email = "provider.down@example.test";
      const down = { crs: { PROVIDER: "crs_sandbox", screen: async () => { throw new Error("bureau down"); } } };
      const r = await runPrescreen(db, { orgId: fx.orgA, body: body(email), providers: down });
      assert.equal(r.status, "failed");
      const row = await renterRow(email);
      assert.equal(row.stage, "lead");
      assert.equal(await count("yd_consents", "renter_id=$1", [row.id]), 2);
      const s = await q(`SELECT status, credit_score, result_at FROM yd_screenings WHERE renter_id=$1`, [row.id]);
      assert.deepEqual(s.map((x) => x.status), ["failed"]);
      assert.equal(s[0].credit_score, null);
      assert.ok(s[0].result_at);
      assert.equal(await count("yd_matches", "renter_id=$1", [row.id]), 0);
      assert.equal(await count("yd_accounts", "org_id=$1 AND renter_id=$2", [fx.orgA, row.id]), 0);
      const raw = await one(`SELECT payload FROM yd_screening_raw WHERE screening_id=(SELECT id FROM yd_screenings WHERE renter_id=$1)`, [row.id]);
      assert.equal(raw.payload.status, "failed");

      useOrg(fx.slugA);
      const retry = await post(prescreen, body(email, { dob: "1989-01-01" }));
      assert.equal(retry.body.status, "complete");
      assert.equal(await count("yd_screenings", "renter_id=$1", [row.id]), 2);
    });

    test("a provider answer the database would refuse is a failed screening, never a 500", async () => {
      const email = "provider.garbage@example.test";
      const bad = { crs: { screen: async () => ({ provider: "crs_sandbox", status: "complete", credit_score: 99999, collections_count: 0, eviction_count: 0, criminal_flags: [] }) } };
      const r = await runPrescreen(db, { orgId: fx.orgA, body: body(email), providers: bad });
      assert.equal(r.status, "failed");
      assert.equal(await count("yd_screenings", "renter_id=$1 AND status='failed'", [(await renterRow(email)).id]), 1);
    });

    test("the door answers a failed screening with a 503 and a plain message, and keeps credit out of every shape", () => {
      const failed = prescreenResponse({ status: "failed", message: "try later" });
      assert.equal(failed.code, 503);
      assert.deepEqual(failed.body, { ok: false, error: "screening_unavailable", message: "try later" });
      const dob = prescreenResponse({ status: "needs_dob", needsDob: true, message: "m" });
      assert.deepEqual(dob, { code: 200, body: { ok: true, status: "needs_dob", needsDob: true, message: "m" } });
      const signin = prescreenResponse({ status: "signin_required", message: "m" });
      assert.deepEqual(signin.body, { ok: true, status: "signin_required", message: "m" });
      const done = prescreenResponse({ status: "complete", answer: { results: [] }, renterToken: "t", renterTokenExpiresAt: "x" });
      assert.deepEqual(done.body, { ok: true, status: "complete", results: [], renterToken: "t", renterTokenExpiresAt: "x" });
    });

    test("two pre-screens for the same new email at the same instant: one runs, one is told to sign in", async () => {
      useOrg(fx.slugA);
      const email = "race@example.test";
      const [a, b] = await Promise.all([post(prescreen, body(email, { dob: "1993-03-03" })), post(prescreen, body(email, { dob: "1993-03-03" }))]);
      const statuses = [a.body.status, b.body.status].sort();
      assert.deepEqual(statuses, ["complete", "signin_required"]);
      const id = (await renterRow(email)).id;
      assert.equal(await count("yd_screenings", "renter_id=$1", [id]), 1, "one screening, not two");
      assert.equal(await count("yd_consents", "renter_id=$1", [id]), 2);
      assert.equal(await count("yd_accounts", "org_id=$1 AND renter_id=$2", [fx.orgA, id]), 1);
    });
  });

  describe("POST public/prescreen: an email that is already someone's cannot be taken over", () => {
    test("a building user's email gets no screening and no session, only a sign-in link", async () => {
      useOrg(fx.slugA);
      const acct = await one(`SELECT email FROM yd_accounts WHERE id=$1`, [fx.A.acctBuilding]);
      const r = await post(prescreen, body(acct.email, { dob: "1980-01-01" }));
      assert.equal(r.body.status, "signin_required");
      assert.equal(r.body.renterToken, undefined);
      const renter = await renterRow(acct.email);
      assert.equal(await count("yd_screenings", "renter_id=$1", [renter.id]), 0);
      assert.equal(await count("yd_consents", "renter_id=$1", [renter.id]), 0);
      assert.equal(await count("yd_accounts", "org_id=$1 AND renter_id=$2", [fx.orgA, renter.id]), 0);
    });

    test("a renter who has already signed in with a link cannot be re-screened through the public door", async () => {
      useOrg(fx.slugA);
      // Omar (the fixture's second renter) has an account that has logged in
      await db.query(`INSERT INTO yd_accounts (org_id, kind, email, renter_id, last_login_at)
                      SELECT org_id, 'renter', email, id, now() FROM yd_renters WHERE id=$1 ON CONFLICT DO NOTHING`, [fx.A.renter2]);
      const omar = await one(`SELECT email FROM yd_renters WHERE id=$1`, [fx.A.renter2]);
      const r = await post(prescreen, body(omar.email, { dob: "1985-05-05" }));
      assert.equal(r.body.status, "signin_required");
      assert.equal(await count("yd_screenings", "renter_id=$1", [fx.A.renter2]), 0);
    });
  });

  /* ============================================================== income */

  describe("POST me/income", () => {
    const sessionFor = async (renterId, orgId = fx.orgA) => {
      await db.query(`INSERT INTO yd_accounts (org_id, kind, email, renter_id)
                      SELECT org_id, 'renter', email, id FROM yd_renters WHERE id=$1 ON CONFLICT DO NOTHING`, [renterId]);
      const acct = await one(`SELECT id FROM yd_accounts WHERE org_id=$1 AND renter_id=$2`, [orgId, renterId]);
      return (await createAccountSession(db, { accountId: acct.id, orgId })).token;
    };

    test("WRONG PRINCIPAL: no token, a junk token, staff, a building user and a broker are all refused", async () => {
      const ok = { method: "plaid", publicToken: publicTokenFor("prime-1") };
      assert.equal((await post(income, ok)).code, 401);
      assert.equal((await post(income, ok, { token: "junk" })).code, 401);
      assert.equal((await post(income, ok, { token: fx.tokens.ownerA })).code, 401, "a staff token is not a renter session");
      assert.equal((await post(income, ok, { token: fx.tokens.buildingA })).code, 403);
      assert.equal((await post(income, ok, { token: fx.tokens.brokerA })).code, 403);
    });

    test("GET is a 405 with an allow header (for a signed-in renter)", async () => {
      const r = await call(income, { method: "GET", token: fx.tokens.renterA });
      assert.equal(r.code, 405);
      assert.equal(r.headers.allow, "POST");
    });

    test("no finished screening, no income check: 409 screening_required, nothing written", async () => {
      // Omar has no screening
      const token = await sessionFor(fx.A.renter2);
      const before = await count("yd_income_checks", "renter_id=$1", [fx.A.renter2]);
      const r = await post(income, { method: "plaid", publicToken: "public-sandbox-x" }, { token });
      assert.equal(r.code, 409);
      assert.equal(r.body.error, "screening_required");
      assert.equal(await count("yd_income_checks", "renter_id=$1", [fx.A.renter2]), before);
    });

    test("bad input is a 400 and writes nothing", async () => {
      const t = await post(prescreen, body(fixtureEmail("prime2")));
      assert.equal(t.body.status, "complete");
      const token = t.body.renterToken;
      const id = (await renterRow(fixtureEmail("prime2"))).id;
      const before = await count("yd_income_checks", "renter_id=$1", [id]);
      for (const [b, code] of [
        [{ method: "plaid" }, "public_token_required"],
        [{}, "public_token_required"],
        [{ method: "plaid", publicToken: "   " }, "public_token_required"],
        [{ method: "statements" }, "files_required"],
        [{ method: "statements", files: [] }, "files_required"],
        [{ method: "statements", files: [{ size: 5 }] }, "files_required"],
        [{ method: "statements", files: Array.from({ length: 11 }, (_, i) => ({ name: `s${i}.pdf` })) }, "too_many_files"]
      ]) {
        const r = await post(income, b, { token });
        assert.equal(r.code, 400, JSON.stringify(b).slice(0, 80));
        assert.equal(r.body.error, code, JSON.stringify(b).slice(0, 80));
      }
      assert.equal(await count("yd_income_checks", "renter_id=$1", [id]), before);
    });

    test("statements go to staff review: not verified, matches unchanged, a staff event is the task", async () => {
      const email = fixtureEmail("prime2");
      const id = (await renterRow(email)).id;
      const token = await sessionFor(id);
      const matchesBefore = await count("yd_matches", "renter_id=$1", [id]);
      const r = await post(income, { method: "statements", files: [{ name: "march.pdf", size: 1234 }, "april.pdf"] }, { token });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.status, "review");
      assert.equal(r.body.income.status, "review");
      assert.equal(r.body.income.monthlyIncomeCents, null, "unknown stays unknown");
      assert.equal(r.body.results, undefined);
      const ic = await one(`SELECT method, status, monthly_income_cents, checked_at, sources FROM yd_income_checks WHERE renter_id=$1`, [id]);
      assert.equal(ic.method, "statements");
      assert.equal(ic.status, "review");
      assert.equal(ic.monthly_income_cents, null);
      assert.equal(ic.checked_at, null);
      assert.deepEqual(ic.sources.files.map((f) => f.name), ["march.pdf", "april.pdf"]);
      assert.equal((await renterRow(email)).income_verified, false);
      assert.equal(await count("yd_matches", "renter_id=$1", [id]), matchesBefore, "nothing is recomputed until staff verify");
      assert.equal(await count("yd_events", "org_id=$1 AND name='income.review_requested' AND payload->>'renter_id'=$2", [fx.orgA, id]), 1);
    });

    test("an unverified (review) check never counts: a later recompute still treats income as unknown", async () => {
      const id = (await renterRow(fixtureEmail("prime2"))).id;
      const token = await sessionFor(id);
      // a plaid check now verifies; the earlier review row is ignored, the plaid one is used
      const r = await post(income, { method: "plaid", publicToken: publicTokenFor("prime-2") }, { token });
      assert.equal(r.body.status, "verified");
      assert.equal(r.body.income.monthlyIncomeCents, 590000);
      assert.equal(r.body.results[0].result, "approved");
      assert.equal(await count("yd_income_checks", "renter_id=$1", [id]), 2, "both checks are kept");
    });

    test("the renter is read off the session: a renterId in the body changes nothing about anyone else", async () => {
      const token = fx.tokens.renterB;                  // org B's renter (has a finished screening)
      const aBefore = await count("yd_income_checks", "org_id=$1", [fx.orgA]);
      const aMatches = await count("yd_matches", "org_id=$1", [fx.orgA]);
      const victim = await count("yd_income_checks", "renter_id=$1", [fx.A.renter1]);
      const ownBefore = await count("yd_income_checks", "org_id=$1 AND renter_id=$2", [fx.orgB, fx.B.renter1]);
      const r = await post(income, { method: "plaid", publicToken: "public-sandbox-anything", renterId: fx.A.renter1, orgId: fx.orgA }, { token });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(await count("yd_income_checks", "renter_id=$1", [fx.A.renter1]), victim);
      assert.equal(await count("yd_income_checks", "org_id=$1", [fx.orgA]), aBefore);
      assert.equal(await count("yd_matches", "org_id=$1", [fx.orgA]), aMatches);
      assert.equal(await count("yd_income_checks", "org_id=$1 AND renter_id=$2", [fx.orgB, fx.B.renter1]), ownBefore + 1,
        "the check landed on the session's own renter");
      const theirs = r.body.results.map((x) => x.building.id);
      const orgBBuildings = new Set((await q(`SELECT id FROM yd_buildings WHERE org_id=$1`, [fx.orgB])).map((x) => x.id));
      assert.ok(theirs.length > 0 && theirs.every((id) => orgBBuildings.has(id)));
    });

    test("an open application's building is re-matched when income changes (even outside the searched city)", async () => {
      // org B's renter1 is placed at a signed building; give them a fresh open application at another one
      const open = await one(
        `SELECT a.id, a.stage FROM yd_applications a WHERE a.org_id=$1 AND a.renter_id=$2 ORDER BY created_at DESC LIMIT 1`,
        [fx.orgB, fx.B.renter2]);
      assert.ok(open, "fixture B renter2 has an open application at booked");
      const token = await sessionFor(fx.B.renter2, fx.orgB);
      // renter2 has no screening: give them a complete one so income can run
      const consent = await one(`INSERT INTO yd_consents (org_id, renter_id, kind, consent_text, consent_version, method) VALUES ($1,$2,'screening','t','v','checkbox') RETURNING id`, [fx.orgB, fx.B.renter2]);
      await db.query(`INSERT INTO yd_screenings (org_id, renter_id, consent_id, kind, provider, status, credit_score, collections_count, eviction_count, criminal_flags, result_at)
                      VALUES ($1,$2,$3,'initial','crs_sandbox','complete',700,0,0,'[]',now())`, [fx.orgB, fx.B.renter2, consent.id]);
      // They searched Phoenix for two-bedrooms, so the building they booked (Tempe, one-bedrooms only)
      // is in neither the searched city nor the backup pool: only the open application brings it in.
      await db.query(`INSERT INTO yd_events (org_id, name, entity_kind, entity_id, payload, actor_kind)
                      VALUES ($1,'prescreen.completed','renter',$2,$3::jsonb,'renter')`,
        [fx.orgB, fx.B.renter2, JSON.stringify({ search: { city: "Phoenix", state: "AZ", beds: 2, maxRentCents: null } })]);
      const r = await post(income, { method: "plaid", publicToken: "public-sandbox-anything" }, { token });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      const booked = await one(`SELECT building_id FROM yd_applications WHERE id=$1`, [open.id]);
      assert.ok(r.body.results.some((x) => x.building.id === booked.building_id), "the booked building was re-matched");
      assert.ok(!r.body.backups.some((x) => x.building.id === booked.building_id), "and it is never a backup");
    });
  });
});
