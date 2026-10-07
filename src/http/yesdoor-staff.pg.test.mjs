// Postgres-backed tests for the staff doors:
//   GET /api/yesdoor/staff/{pipeline,companies,buildings,ledger,disputes,scoreboard}
//   GET /api/yesdoor/staff/{renter,screening}   (credit details: ops and owner only)
//
// Proved: role gates (401 / 403), another org's rows never returned, the desk views
// carry no credit fields while the credit views carry the full file, and the
// numbers the scoreboard prints are the numbers in the tables.
//
// SCRATCH database only, as fundhub_app. Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture, call, creditLeaks, MARKERS } from "../yesdoor/testing/fixture.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("yesdoor staff doors", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, h;
  const t = () => fx.tokens;

  before(async () => {
    fx = await buildYdFixture(db);
    h = {};
    for (const name of ["pipeline", "companies", "buildings", "ledger", "disputes", "scoreboard", "renter", "screening"]) {
      h[name] = (await import(`../../api/yesdoor/staff/${name}.mjs`)).default;
    }
  });
  after(async () => { await close(); });

  /* ── desk views: no credit fields, every staff role ───────────────────── */

  test("desk views carry NO credit fields, for every staff role that may open them", async () => {
    for (const door of ["pipeline", "companies", "buildings", "disputes", "scoreboard"]) {
      for (const who of ["opsA", "salesA", "collectionsA", "ownerA"]) {
        const r = await call(h[door], { token: t()[who] });
        assert.equal(r.code, 200, `${door} as ${who}`);
        assert.deepEqual(creditLeaks(r.body), [], `${door} as ${who} leaked credit data`);
      }
    }
    for (const who of ["opsA", "collectionsA", "ownerA"]) {
      const r = await call(h.ledger, { token: t()[who] });
      assert.equal(r.code, 200);
      assert.deepEqual(creditLeaks(r.body), []);
    }
  });

  test("every staff door refuses nobody (401), an account session (401) and a non-Yesdoor role (403)", async () => {
    for (const door of Object.keys(h)) {
      const query = door === "renter" || door === "screening" ? { id: fx.A.renter1 } : {};
      assert.equal((await call(h[door], { query })).code, 401, `${door} without a session`);
      assert.equal((await call(h[door], { query, token: t().renterA })).code, 401, `${door} with a renter session`);
      assert.equal((await call(h[door], { query, token: t().brokerA })).code, 401, `${door} with a broker session`);
      assert.equal((await call(h[door], { query, token: t().closerA })).code, 403, `${door} with a closer`);
    }
  });

  /* ── pipeline ─────────────────────────────────────────────────────────── */

  describe("pipeline", () => {
    test("zero-filled counts by stage, from this company only", async () => {
      const r = await call(h.pipeline, { token: t().opsA });
      assert.equal(r.code, 200);
      assert.equal(Object.keys(r.body.renterStages).length, 7);
      assert.equal(Object.keys(r.body.applicationStages).length, 14);
      assert.equal(r.body.renterStages.placed, 1);
      assert.equal(r.body.renterStages.booked, 1);
      assert.equal(r.body.renterStages.lead, 0);
      assert.equal(r.body.applicationStages.paid, 1);
      assert.equal(r.body.applicationStages.booked, 1);
      assert.equal(r.body.applicationStages.denied, 0);
    });

    test("lists are this company's, filterable by stage", async () => {
      const all = await call(h.pipeline, { token: t().salesA });
      assert.equal(all.body.renters.length, 2);
      assert.equal(all.body.applications.length, 2);
      // I1: each row names the renter's path, tier and source for the desk.
      for (const a of all.body.applications) {
        assert.ok(["verified", "second_chance", null].includes(a.lane));
        assert.ok("riskTier" in a && "source" in a);
      }
      const text = JSON.stringify(all.body);
      for (const id of [fx.B.renter1, fx.B.app1, fx.B.bSigned]) assert.ok(!text.includes(id), "org B data in org A's pipeline");

      const booked = await call(h.pipeline, { token: t().salesA, query: { stage: "booked" } });
      assert.deepEqual(booked.body.applications.map((a) => a.id), [fx.A.app2]);
      assert.deepEqual(booked.body.renters.map((x) => x.id), [fx.A.renter2]);
      assert.equal((await call(h.pipeline, { token: t().salesA, query: { stage: "nonsense" } })).code, 400);
      assert.equal((await call(h.pipeline, { token: t().salesA, query: { limit: "0" } })).code, 400);
      assert.equal((await call(h.pipeline, { token: t().salesA, query: { limit: "1" } })).body.renters.length, 1);
    });

    test("the other company's staff see only their own pipeline", async () => {
      const r = await call(h.pipeline, { token: t().opsB });
      assert.equal(r.code, 200);
      assert.equal(r.body.renterStages.placed, 1);
      const text = JSON.stringify(r.body);
      for (const id of [fx.A.renter1, fx.A.renter2, fx.A.app1, fx.A.app2]) assert.ok(!text.includes(id), "org A data in org B's pipeline");
    });
  });

  /* ── supply ───────────────────────────────────────────────────────────── */

  describe("companies and buildings", () => {
    test("companies with building counts, this company only", async () => {
      const r = await call(h.companies, { token: t().salesA });
      assert.equal(r.body.companies.length, 1);
      const c = r.body.companies[0];
      assert.equal(c.id, fx.A.company);
      assert.equal(c.tier, 2);
      assert.equal(c.buildings, 4);
      assert.equal(c.signedBuildings, 2);
      assert.ok(!JSON.stringify(r.body).includes(fx.B.company));
    });

    test("buildings: fee terms, rules freshness, matchable, listings and open applications", async () => {
      const r = await call(h.buildings, { token: t().salesA });
      assert.equal(r.body.buildings.length, 4);
      const by = Object.fromEntries(r.body.buildings.map((b) => [b.id, b]));
      const signed = by[fx.A.bSigned];
      assert.equal(signed.matchable, true);
      assert.equal(signed.status, "signed");
      assert.equal(signed.appFeeCents, 5000);
      assert.equal(signed.fee.kind, "percent_first_month");
      assert.equal(signed.fee.percent, 100);
      assert.equal(signed.fee.refundDays, 60);
      assert.equal(signed.rules.version, 1);
      assert.equal(signed.rules.stale, false);
      assert.equal(signed.activeListings, 2);
      assert.equal(signed.allowsRenterIncentive, false);
      assert.equal(signed.openApplications, 0, "a paid placement is no longer an open application");

      assert.equal(by[fx.A.bOther].openApplications, 1);
      assert.equal(by[fx.A.bSample].matchable, true, "a flagged sample may be matched for the demo");
      assert.equal(by[fx.A.bSample].isSample, true);
      assert.equal(by[fx.A.bUnsigned].matchable, false, "an unsigned real building must not be matchable");
    });

    test("buildings filters, and the other company's buildings never appear", async () => {
      const signed = await call(h.buildings, { token: t().opsA, query: { status: "signed" } });
      assert.deepEqual(signed.body.buildings.map((b) => b.id).sort(), [fx.A.bSigned, fx.A.bOther].sort());
      const byCompany = await call(h.buildings, { token: t().opsA, query: { companyId: fx.A.company } });
      assert.equal(byCompany.body.buildings.length, 4);
      const foreign = await call(h.buildings, { token: t().opsA, query: { companyId: fx.B.company } });
      assert.deepEqual(foreign.body.buildings, [], "another company's id returned its buildings");
      assert.equal((await call(h.buildings, { token: t().opsA, query: { status: "x" } })).code, 400);
      assert.equal((await call(h.buildings, { token: t().opsA, query: { companyId: "x" } })).code, 400);
      const b = JSON.stringify((await call(h.buildings, { token: t().opsB })).body);
      assert.ok(!b.includes(fx.A.bSigned));
    });

    test("an unknown application fee stays NULL, never 0", async () => {
      const id = (await db.query(
        `INSERT INTO yd_buildings (org_id, company_id, name, status) VALUES ($1,$2,'Unknown Fee Place','target') RETURNING id`,
        [fx.orgA, fx.A.company])).rows[0].id;
      const r = await call(h.buildings, { token: t().opsA });
      const row = r.body.buildings.find((b) => b.id === id);
      assert.strictEqual(row.appFeeCents, null);
      assert.strictEqual(row.rules, null, "a building with no rules on file reports null, not a made-up version");
    });
  });

  /* ── money ────────────────────────────────────────────────────────────── */

  describe("ledger", () => {
    test("fees, invoices, broker rows and totals, in integer cents", async () => {
      const r = await call(h.ledger, { token: t().collectionsA });
      assert.equal(r.code, 200);
      assert.equal(r.body.fees.length, 1);
      const f = r.body.fees[0];
      assert.equal(f.id, fx.A.fee);
      assert.equal(f.kind, "placement_fee");
      assert.equal(f.amountCents, 162500);
      assert.equal(f.status, "paid");
      assert.equal(f.invoice.number, fx.A.invoiceNumber);
      assert.ok(f.invoicedAt && f.paidAt);
      assert.deepEqual(r.body.feeTotals.paid, { cents: 162500, count: 1 });
      assert.equal(r.body.invoices.length, 1);
      assert.equal(r.body.invoices[0].paymentMethod, "ach");
      assert.equal(r.body.invoices[0].paymentRef, "ACH-TEST-1");
      assert.equal(r.body.brokerRows.length, 1);
      assert.equal(r.body.brokerRows[0].amountCents, 40625);
      assert.equal(r.body.brokerRows[0].status, "held");
    });

    test("another company's ledger never appears", async () => {
      const a = JSON.stringify((await call(h.ledger, { token: t().opsA })).body);
      assert.ok(!a.includes(fx.B.fee) && !a.includes(fx.B.invoice) && !a.includes(fx.B.brokerRow));
      const b = JSON.stringify((await call(h.ledger, { token: t().opsB })).body);
      assert.ok(!b.includes(fx.A.fee) && !b.includes(fx.A.invoice) && !b.includes(fx.A.brokerRow));
    });

    test("sales may not open the money door", async () => {
      assert.equal((await call(h.ledger, { token: t().salesA })).code, 403);
    });
  });

  /* ── disputes ─────────────────────────────────────────────────────────── */

  describe("disputes", () => {
    test("open ones with a due date 14 days out, filterable", async () => {
      const r = await call(h.disputes, { token: t().salesA });
      assert.equal(r.body.disputes.length, 1);
      const d = r.body.disputes[0];
      assert.equal(d.id, fx.A.dispute);
      assert.equal(d.kind, "attribution");
      assert.equal(d.status, "open");
      assert.equal(d.overdue, false);
      const days = (new Date(d.dueBy) - new Date(d.openedAt)) / 86400000;
      assert.ok(Math.abs(days - 14) < 0.01, `due ${days} days after opening, not 14`);
      assert.equal((await call(h.disputes, { token: t().salesA, query: { status: "decided" } })).body.disputes.length, 0);
      assert.equal((await call(h.disputes, { token: t().salesA, query: { status: "bogus" } })).code, 400);
    });

    test("the other company's disputes never appear", async () => {
      const a = JSON.stringify((await call(h.disputes, { token: t().opsA })).body);
      assert.ok(!a.includes(fx.B.dispute));
      const b = JSON.stringify((await call(h.disputes, { token: t().opsB })).body);
      assert.ok(!b.includes(fx.A.dispute));
    });
  });

  /* ── scoreboard ───────────────────────────────────────────────────────── */

  describe("scoreboard", () => {
    test("the weekly numbers match the tables", async () => {
      const r = await call(h.scoreboard, { token: t().salesA });
      assert.equal(r.code, 200);
      const b = r.body;
      assert.equal(b.leads, 2, "two renters were created in the window");
      assert.equal(b.pulled, 1, "one screening completed");
      assert.equal(b.registered, 1);
      assert.equal(b.leases, 1);
      assert.equal(b.movedIn, 1);
      // The fixture's fee was paid 61 days ago, so the default 7-day window has none.
      assert.equal(b.feesInCents, 0);
      assert.equal(b.feesPaidCount, 0);
      assert.deepEqual(b.refunds, { feeRefundsCents: 0, feeRefundsCount: 0, renterRefundsCents: 0, renterRefundsCount: 0 });
      assert.deepEqual(b.buildings, { signed: 2, live: 0 });
      assert.deepEqual(b.partners, { signed: 0, active: 1 });
      assert.ok(b.window.from < b.window.to);
    });

    test("a window around the payment finds it, and prints days to pay", async () => {
      const from = new Date(Date.now() - 70 * 86400000).toISOString();
      const to = new Date(Date.now() - 50 * 86400000).toISOString();
      const r = await call(h.scoreboard, { token: t().opsA, query: { from, to } });
      assert.equal(r.code, 200);
      assert.equal(r.body.feesInCents, 162500);
      assert.equal(typeof r.body.avgDaysToPay, "number");
      // Invoiced 65 days ago, paid 61 days ago: four days to pay.
      assert.ok(Math.abs(r.body.avgDaysToPay - 4) < 0.1, `days to pay ${r.body.avgDaysToPay}`);
      assert.equal(r.body.leads, 0, "renters were created today, outside this window");
    });

    test("an empty window: counts are 0, average days to pay is null (unknown), not 0", async () => {
      const from = new Date(Date.now() - 400 * 86400000).toISOString();
      const to = new Date(Date.now() - 399 * 86400000).toISOString();
      const r = await call(h.scoreboard, { token: t().opsA, query: { from, to } });
      assert.equal(r.body.feesInCents, 0);
      assert.strictEqual(r.body.avgDaysToPay, null);
    });

    test("bad dates and a backwards window are 400s", async () => {
      assert.equal((await call(h.scoreboard, { token: t().opsA, query: { from: "yesterday-ish" } })).code, 400);
      const later = new Date(Date.now() + 86400000).toISOString();
      const now = new Date().toISOString();
      assert.equal((await call(h.scoreboard, { token: t().opsA, query: { from: later, to: now } })).code, 400);
    });

    test("the other company's numbers are its own", async () => {
      const r = await call(h.scoreboard, { token: t().opsB });
      assert.equal(r.body.leads, 2);
      assert.deepEqual(r.body.buildings, { signed: 2, live: 0 });
    });
  });

  /* ── credit views: ops and owner only ─────────────────────────────────── */

  describe("renter timeline and screening (credit details)", () => {
    test("ops and the owner get the whole file: consents, screenings with credit numbers, income, matches, events", async () => {
      for (const who of ["opsA", "ownerA"]) {
        const r = await call(h.renter, { token: t()[who], query: { id: fx.A.renter1 } });
        assert.equal(r.code, 200, who);
        const b = r.body;
        assert.equal(b.renter.id, fx.A.renter1);
        assert.equal(b.renter.source.kind, "broker");
        assert.equal(b.renter.source.brokerId, fx.A.broker);
        assert.equal(b.consents.length, 1);
        assert.match(b.consents[0].text, /repeat checks/);
        assert.equal(b.screenings.length, 1);
        const s = b.screenings[0];
        assert.equal(s.creditScore, MARKERS.creditScore);
        assert.equal(s.collectionsCount, MARKERS.collections);
        assert.equal(s.evictionCount, MARKERS.evictions);
        assert.equal(s.evictionLastAt, "2023-01-15");
        assert.equal(s.criminalFlags[0].category, MARKERS.criminalCategory);
        assert.equal(b.incomeChecks[0].monthlyIncomeCents, 650000);
        assert.equal(b.matches[0].result, "approved");
        assert.equal(b.matches[0].reasons[0].rule, "score");
        assert.equal(b.applications[0].stage, "paid");
        assert.equal(b.tours.length, 1);
      }
    });

    test("the timeline carries one event per stage move, in order, written by the database", async () => {
      const r = await call(h.renter, { token: t().opsA, query: { id: fx.A.renter1 } });
      const names = r.body.events.map((e) => e.name);
      assert.deepEqual(names, [
        "application.booked", "application.registered", "application.toured", "application.applied",
        "application.approved", "application.lease_signed", "application.moved_in",
        "application.invoiced", "application.paid"
      ]);
      const stamps = r.body.events.map((e) => new Date(e.occurredAt).getTime());
      assert.deepEqual(stamps, [...stamps].sort((a, b) => a - b));
      assert.equal(r.body.events[1].payload.from, "booked");
      assert.equal(r.body.events[1].payload.to, "registered");
    });

    test("sales and collections are refused the credit views (403)", async () => {
      for (const who of ["salesA", "collectionsA"]) {
        const r = await call(h.renter, { token: t()[who], query: { id: fx.A.renter1 } });
        assert.equal(r.code, 403, who);
        assert.deepEqual(creditLeaks(r.body), [], "a refusal must not carry credit data");
        assert.equal((await call(h.screening, { token: t()[who], query: { id: fx.A.screening } })).code, 403);
      }
    });

    test("another company's renter is a 404, never their data", async () => {
      const r = await call(h.renter, { token: t().opsA, query: { id: fx.B.renter1 } });
      assert.equal(r.code, 404);
      const s = await call(h.screening, { token: t().opsA, query: { id: fx.B.screening } });
      assert.equal(s.code, 404);
      assert.equal((await call(h.renter, { token: t().opsB, query: { id: fx.A.renter1 } })).code, 404);
      assert.equal((await call(h.screening, { token: t().opsB, query: { id: fx.A.screening } })).code, 404);
    });

    test("screening: the full report including the raw payload", async () => {
      const r = await call(h.screening, { token: t().opsA, query: { id: fx.A.screening } });
      assert.equal(r.code, 200);
      assert.equal(r.body.screening.creditScore, MARKERS.creditScore);
      assert.equal(r.body.screening.renterId, fx.A.renter1);
      assert.equal(r.body.raw.payload.marker, MARKERS.rawPayload);
    });

    test("ids are validated: missing is 400, junk is 400, unknown is 404", async () => {
      for (const door of [h.renter, h.screening]) {
        assert.equal((await call(door, { token: t().opsA, query: {} })).code, 400);
        assert.equal((await call(door, { token: t().opsA, query: { id: "x" } })).code, 400);
        assert.equal((await call(door, { token: t().opsA, query: { id: "11111111-1111-4111-8111-111111111111" } })).code, 404);
      }
    });
  });

  test("every staff read door refuses the wrong method; the doors that also write say so", async () => {
    // B4 made companies, buildings and disputes writable (their POST tests are in the
    // yesdoor-supply and yesdoor-money suites); they answer an empty POST with a 400.
    const writable = ["companies", "buildings", "disputes"];
    for (const door of Object.keys(h)) {
      if (writable.includes(door)) {
        const bad = await call(h[door], { token: t().ownerA, method: "POST", body: {} });
        assert.equal(bad.code, 400, `${door}: an empty POST is a plain 400`);
        const del = await call(h[door], { token: t().ownerA, method: "DELETE" });
        assert.equal(del.code, 405, door);
        assert.equal(del.headers.allow, "GET, POST");
        continue;
      }
      const r = await call(h[door], { token: t().ownerA, method: "POST", body: {}, query: { id: fx.A.renter1 } });
      assert.equal(r.code, 405, door);
      assert.equal(r.headers.allow, "GET");
    }
  });
});
