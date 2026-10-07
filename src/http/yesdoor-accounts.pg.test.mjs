// Postgres-backed tests for the three account-session doors:
//   renter   GET /api/yesdoor/me
//   building GET /api/yesdoor/building/{renters,rules,invoices}
//   broker   GET /api/yesdoor/broker/{renters,money,link}
//
// The three things spec §8 says every endpoint test proves:
//   1. the wrong principal gets 401/403 (also covered door by door in
//      yesdoor-auth.pg.test.mjs; repeated here for the data-bearing cases)
//   2. another org's rows are never returned
//   3. building and broker responses contain NO credit fields: no credit_score,
//      eviction_count, criminal_flags, collections_count, raw. Checked two ways:
//      a deep key scan (any casing, snake or camel) and distinctive values planted
//      in the credit data that must not appear anywhere in the body.
//
// SCRATCH database only, as fundhub_app. Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture, call, creditLeaks, MARKERS } from "../yesdoor/testing/fixture.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("yesdoor account doors", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, h;

  before(async () => {
    fx = await buildYdFixture(db);
    h = {
      me: (await import("../../api/yesdoor/me.mjs")).default,
      bRenters: (await import("../../api/yesdoor/building/renters.mjs")).default,
      bRules: (await import("../../api/yesdoor/building/rules.mjs")).default,
      bInvoices: (await import("../../api/yesdoor/building/invoices.mjs")).default,
      kRenters: (await import("../../api/yesdoor/broker/renters.mjs")).default,
      kMoney: (await import("../../api/yesdoor/broker/money.mjs")).default,
      kLink: (await import("../../api/yesdoor/broker/link.mjs")).default
    };
  });
  after(async () => { await close(); });

  const noLeaks = (body, what) => assert.deepEqual(creditLeaks(body), [], `${what} leaked credit data`);

  /* ── renter ───────────────────────────────────────────────────────────── */

  describe("renter: GET me", () => {
    test("own status, matches, applications and tour", async () => {
      const r = await call(h.me, { token: fx.tokens.renterA });
      assert.equal(r.code, 200);
      const b = r.body;
      assert.equal(b.renter.id, fx.A.renter1);
      assert.equal(b.renter.firstName, "Rita");
      assert.equal(b.renter.stage, "placed");
      assert.equal(b.renter.riskTier, "B");
      assert.equal(b.renter.approvedMaxRentCents, 216666);
      assert.equal(b.renter.incomeVerified, true);
      assert.equal(b.screening.status, "complete");
      assert.equal(b.incomeCheck.status, "verified");

      assert.equal(b.matches.length, 1);
      assert.equal(b.matches[0].result, "approved");
      assert.equal(b.matches[0].maxRentCents, 216666);
      assert.equal(b.matches[0].building.id, fx.A.bSigned);
      assert.equal(b.matches[0].rulesVersion, 1);
      assert.ok(b.matches[0].rulesConfirmedAt, "a result must show the date of the rules it used");

      assert.equal(b.applications.length, 1);
      assert.equal(b.applications[0].id, fx.A.app1);
      assert.equal(b.applications[0].stage, "paid");
      assert.ok(b.applications[0].registeredAt);
      assert.match(b.applications[0].leaseStart, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(b.applications[0].tour.status, "booked");
    });

    test("a renter sees only their own file, never another renter's", async () => {
      const r = await call(h.me, { token: fx.tokens.renterA });
      const text = JSON.stringify(r.body);
      assert.ok(!text.includes(fx.A.renter2));
      assert.ok(!text.includes("Omar"));
      assert.ok(!text.includes(fx.A.app2));
    });

    test("no credit numbers, no rule thresholds, no raw report", async () => {
      const r = await call(h.me, { token: fx.tokens.renterA });
      noLeaks(r.body, "renter me");
      const text = JSON.stringify(r.body);
      assert.ok(!text.includes('"reasons"'), "per-rule reasons would reveal the building's thresholds");
      assert.ok(!text.includes("minScore"));
      assert.ok(!text.includes(String(MARKERS.creditScore)) || !/"(score|creditScore)"/.test(text));
    });

    test("another company's renter session reads only its own company", async () => {
      const r = await call(h.me, { token: fx.tokens.renterB });
      assert.equal(r.code, 200);
      assert.equal(r.body.renter.id, fx.B.renter1);
      const text = JSON.stringify(r.body);
      for (const id of [fx.A.renter1, fx.A.app1, fx.A.match, fx.A.bSigned]) assert.ok(!text.includes(id), "org A data in org B's answer");
    });

    test("GET only", async () => {
      const r = await call(h.me, { token: fx.tokens.renterA, method: "POST", body: {} });
      assert.equal(r.code, 405);
      assert.equal(r.headers.allow, "GET");
    });
  });

  /* ── building ─────────────────────────────────────────────────────────── */

  describe("building: renters, rules, invoices", () => {
    test("renters: approved/likely/no, income verified, risk tier, max rent, tour; scoped to their building", async () => {
      const r = await call(h.bRenters, { token: fx.tokens.buildingA });
      assert.equal(r.code, 200);
      assert.deepEqual(r.body.buildings.map((b) => b.id), [fx.A.bSigned]);
      assert.equal(r.body.renters.length, 1, "a renter at the user's OTHER company building came back");
      const x = r.body.renters[0];
      assert.equal(x.applicationId, fx.A.app1);
      assert.equal(x.result, "approved");
      assert.equal(x.incomeVerified, true);
      assert.equal(x.riskTier, "B");
      assert.equal(x.maxRentCents, 216666);
      assert.equal(x.renter.firstName, "Rita");
      assert.equal(x.stage, "paid");
      assert.equal(x.unit, "101");
      assert.equal(x.tour.status, "booked");
      assert.match(x.lease.start, /^\d{4}-\d{2}-\d{2}$/);
      // The second renter applied at a building this user is not linked to.
      assert.ok(!JSON.stringify(r.body).includes(fx.A.renter2));
      assert.ok(!JSON.stringify(r.body).includes("Omar"));
    });

    test("NO CREDIT FIELDS on any building response", async () => {
      for (const [name, door] of [["renters", h.bRenters], ["rules", h.bRules], ["invoices", h.bInvoices]]) {
        const r = await call(door, { token: fx.tokens.buildingA });
        assert.equal(r.code, 200, name);
        noLeaks(r.body, `building ${name}`);
      }
    });

    test("?buildingId must be one of the user's own buildings (403 otherwise, 400 for junk)", async () => {
      const own = await call(h.bRenters, { token: fx.tokens.buildingA, query: { buildingId: fx.A.bSigned } });
      assert.equal(own.code, 200);
      const sameCompanyOther = await call(h.bRenters, { token: fx.tokens.buildingA, query: { buildingId: fx.A.bOther } });
      assert.equal(sameCompanyOther.code, 403);
      const otherOrg = await call(h.bRenters, { token: fx.tokens.buildingA, query: { buildingId: fx.B.bSigned } });
      assert.equal(otherOrg.code, 403, "another org's building id was accepted");
      assert.equal((await call(h.bRenters, { token: fx.tokens.buildingA, query: { buildingId: "nope" } })).code, 400);
      for (const door of [h.bRules, h.bInvoices]) {
        assert.equal((await call(door, { token: fx.tokens.buildingA, query: { buildingId: fx.B.bSigned } })).code, 403);
      }
    });

    test("another company's building user sees only that company's rows", async () => {
      const r = await call(h.bRenters, { token: fx.tokens.buildingB });
      assert.equal(r.code, 200);
      assert.deepEqual(r.body.buildings.map((b) => b.id), [fx.B.bSigned]);
      const text = JSON.stringify(r.body);
      for (const id of [fx.A.renter1, fx.A.app1, fx.A.bSigned]) assert.ok(!text.includes(id), "org A data in org B's answer");
      assert.ok(!text.includes(`Tester-a${fx.rand}`));
    });

    test("rules: every version of their own building, with the stale flag", async () => {
      const r = await call(h.bRules, { token: fx.tokens.buildingA });
      assert.equal(r.code, 200);
      assert.equal(r.body.buildings.length, 1);
      const b = r.body.buildings[0];
      assert.equal(b.building.id, fx.A.bSigned);
      assert.equal(b.current, 1);
      assert.equal(b.stale, false);
      assert.equal(b.versions[0].minScore, 600);
      assert.equal(b.versions[0].incomeMultiple, 3);
      assert.deepEqual(b.versions[0].criminalPolicy, { felony: 7, violent: "never" });
      assert.ok(!JSON.stringify(r.body).includes(fx.A.bOther));

      // Age the confirmation past 30 days: the same door now says stale.
      await db.query(`UPDATE yd_building_rules SET confirmed_at = now() - interval '31 days' WHERE id = $1`, [fx.A.rSigned]);
      const stale = await call(h.bRules, { token: fx.tokens.buildingA });
      assert.equal(stale.body.buildings[0].stale, true);
      await db.query(`UPDATE yd_building_rules SET confirmed_at = now() WHERE id = $1`, [fx.A.rSigned]);
    });

    test("rules: a new version is listed newest first and the old one stays", async () => {
      await db.query(
        `INSERT INTO yd_building_rules (org_id, building_id, min_score, income_multiple, confirmed_at, source)
         VALUES ($1,$2,640,3.0,now(),'portal')`, [fx.orgA, fx.A.bOther]);
      const own = (await db.query(
        `INSERT INTO yd_account_buildings (org_id, account_id, building_id) VALUES ($1,$2,$3) RETURNING id`,
        [fx.orgA, fx.A.acctBuilding, fx.A.bOther])).rows[0].id;
      // The session's building list is read at request time, so the new link applies at once.
      const r = await call(h.bRules, { token: fx.tokens.buildingA, query: { buildingId: fx.A.bOther } });
      assert.equal(r.code, 200);
      const v = r.body.buildings[0].versions;
      assert.deepEqual(v.map((x) => x.version), [2, 1]);
      assert.equal(r.body.buildings[0].current, 2);
      // Unlink again (rows are never deleted; the link is stamped removed).
      await db.query(`UPDATE yd_account_buildings SET removed_at = now() WHERE id = $1`, [own]);
      assert.equal((await call(h.bRules, { token: fx.tokens.buildingA, query: { buildingId: fx.A.bOther } })).code, 403);
    });

    test("invoices: every line carries the registration timestamp, renter, unit, move-in date and lease term", async () => {
      const r = await call(h.bInvoices, { token: fx.tokens.buildingA });
      assert.equal(r.code, 200);
      assert.equal(r.body.invoices.length, 1);
      const inv = r.body.invoices[0];
      assert.equal(inv.id, fx.A.invoice);
      assert.equal(inv.number, fx.A.invoiceNumber);
      assert.match(inv.number, /^YD-INV-\d{6,}$/);
      assert.equal(inv.totalCents, 162500);
      assert.equal(inv.status, "paid");
      assert.equal(inv.paymentMethod, "ach");
      assert.equal(inv.lines.length, 1);
      const line = inv.lines[0];
      assert.equal(line.amountCents, 162500);
      assert.equal(line.renterName, `Rita Tester-a${fx.rand}`);
      assert.equal(line.unit, "101");
      assert.ok(line.registeredAt, "no registration timestamp on the invoice line");
      assert.match(line.moveInDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(line.leaseTermMonths, 12);
    });

    test("another company's invoices never appear", async () => {
      const a = JSON.stringify((await call(h.bInvoices, { token: fx.tokens.buildingA })).body);
      assert.ok(!a.includes(fx.B.invoice));
      const b = JSON.stringify((await call(h.bInvoices, { token: fx.tokens.buildingB })).body);
      assert.ok(!b.includes(fx.A.invoice));
    });

    test("a building user with no linked buildings sees nothing at all", async () => {
      const acct = (await db.query(
        `INSERT INTO yd_accounts (org_id, kind, email) VALUES ($1,'building_user',$2) RETURNING id`,
        [fx.orgA, `lonely-${fx.rand}@example.test`])).rows[0].id;
      const { createAccountSession } = await import("../yesdoor/auth/session.mjs");
      const tok = (await createAccountSession(db, { accountId: acct, orgId: fx.orgA })).token;
      for (const door of [h.bRenters, h.bRules, h.bInvoices]) {
        const r = await call(door, { token: tok });
        assert.equal(r.code, 200);
        assert.deepEqual(r.body.renters || r.body.buildings || r.body.invoices, []);
      }
    });
  });

  /* ── broker ───────────────────────────────────────────────────────────── */

  describe("broker: renters, money, link", () => {
    test("renters: name and stage only, plus whether the tour was kept", async () => {
      const r = await call(h.kRenters, { token: fx.tokens.brokerA });
      assert.equal(r.code, 200);
      assert.equal(r.body.renters.length, 1, "a renter the broker did not send came back");
      const x = r.body.renters[0];
      assert.equal(x.id, fx.A.renter1);
      assert.equal(x.firstName, "Rita");
      assert.equal(x.lastName, `Tester-a${fx.rand}`);
      assert.equal(x.stage, "placed");
      assert.equal(x.applications[0].stage, "paid");
      assert.equal(x.applications[0].tourStatus, "booked");
      // Exactly these keys: name and stage, never a result, tier or contact detail.
      assert.deepEqual(Object.keys(x).sort(), ["applications", "firstName", "firstTouchAt", "id", "lastName", "stage"]);
      assert.deepEqual(Object.keys(x.applications[0]).sort(), ["id", "stage", "tourStatus"]);
      const text = JSON.stringify(r.body);
      for (const k of ["riskTier", "result", "lane", "incomeVerified", "maxRent", "email", "phone"]) {
        assert.ok(!text.includes(`"${k}"`), `broker response carried ${k}`);
      }
    });

    test("NO CREDIT FIELDS on any broker response", async () => {
      for (const [name, door] of [["renters", h.kRenters], ["money", h.kMoney], ["link", h.kLink]]) {
        const r = await call(door, { token: fx.tokens.brokerA });
        assert.equal(r.code, 200, name);
        noLeaks(r.body, `broker ${name}`);
      }
    });

    test("money: earned, held, payable, paid in integer cents, with when the building paid", async () => {
      const r = await call(h.kMoney, { token: fx.tokens.brokerA });
      assert.equal(r.code, 200);
      assert.deepEqual(r.body.summary, { earnedCents: 0, heldCents: 40625, payableCents: 0, paidCents: 0 });
      assert.equal(r.body.rows.length, 1);
      const row = r.body.rows[0];
      assert.equal(row.amountCents, 40625);
      assert.equal(row.status, "held");
      assert.equal(row.feeStatus, "paid");
      assert.ok(row.buildingPaidAt, "the broker must see when the building paid");
      assert.equal(row.renterName, `Rita Tester-a${fx.rand}`);
      assert.ok(Number.isInteger(row.amountCents));
    });

    test("link: tracking code and shareable link for an active partner; none for one who only applied", async () => {
      const r = await call(h.kLink, { token: fx.tokens.brokerA });
      assert.equal(r.code, 200);
      assert.equal(r.body.trackingCode, fx.A.brokerCode);
      assert.match(r.body.trackingCode, /^YD-\d{6}$/);
      assert.equal(r.body.status, "active");
      assert.ok(r.body.url.includes(encodeURIComponent(fx.A.brokerCode)));
      assert.equal(r.body.plan, "split");
      assert.equal(r.body.licence.state, "AZ");

      await db.query(`UPDATE yd_brokers SET status = 'applied' WHERE id = $1`, [fx.A.broker]);
      const applied = await call(h.kLink, { token: fx.tokens.brokerA });
      assert.equal(applied.body.status, "applied");
      assert.equal(applied.body.url, null);
      await db.query(`UPDATE yd_brokers SET status = 'active' WHERE id = $1`, [fx.A.broker]);
    });

    test("another company's broker sees only their own rows", async () => {
      for (const [door, key] of [[h.kRenters, "renters"], [h.kMoney, "rows"]]) {
        const r = await call(door, { token: fx.tokens.brokerB });
        assert.equal(r.code, 200);
        const text = JSON.stringify(r.body);
        for (const id of [fx.A.renter1, fx.A.app1, fx.A.fee, fx.A.brokerRow]) assert.ok(!text.includes(id), `org A data in org B's ${key}`);
        assert.ok(!text.includes(`Tester-a${fx.rand}`));
      }
      const link = await call(h.kLink, { token: fx.tokens.brokerB });
      assert.equal(link.body.trackingCode, fx.B.brokerCode);
    });

    test("a broker with no renters sees an empty list and zero money, not an error", async () => {
      const email = `emptybroker-${fx.rand}@example.test`;
      const b = (await db.query(`INSERT INTO yd_brokers (org_id, name, email, status) VALUES ($1,'Empty','${email}','active') RETURNING id`, [fx.orgA])).rows[0].id;
      const acct = (await db.query(`INSERT INTO yd_accounts (org_id, kind, email, broker_id) VALUES ($1,'broker',$2,$3) RETURNING id`, [fx.orgA, email, b])).rows[0].id;
      const { createAccountSession } = await import("../yesdoor/auth/session.mjs");
      const tok = (await createAccountSession(db, { accountId: acct, orgId: fx.orgA })).token;
      const r = await call(h.kRenters, { token: tok });
      assert.deepEqual(r.body.renters, []);
      const m = await call(h.kMoney, { token: tok });
      assert.deepEqual(m.body.summary, { earnedCents: 0, heldCents: 0, payableCents: 0, paidCents: 0 });
      assert.deepEqual(m.body.rows, []);
    });
  });

  test("every account read door is GET only; building/rules also takes a POST (B4)", async () => {
    const doors = [
      [h.bRenters, fx.tokens.buildingA], [h.bInvoices, fx.tokens.buildingA],
      [h.kRenters, fx.tokens.brokerA], [h.kMoney, fx.tokens.brokerA], [h.kLink, fx.tokens.brokerA]
    ];
    for (const [door, token] of doors) {
      const r = await call(door, { token, method: "POST", body: {} });
      assert.equal(r.code, 405);
      assert.equal(r.headers.allow, "GET");
    }
    const rules = await call(h.bRules, { token: fx.tokens.buildingA, method: "DELETE" });
    assert.equal(rules.code, 405);
    assert.equal(rules.headers.allow, "GET, POST");
    assert.equal((await call(h.bRules, { token: fx.tokens.buildingA, method: "POST", body: {} })).code, 400);
  });
});
