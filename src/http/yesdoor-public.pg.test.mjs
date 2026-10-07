// Postgres-backed tests for the public Yesdoor doors:
//   GET /api/yesdoor/public/listings   GET /api/yesdoor/public/listing
//
// Lives under src/http/ because npm test's glob is src/** (CLAUDE.md §12: a test
// in api/ never runs). Skips without DATABASE_URL like every *.pg.test.mjs; the
// real run is against a SCRATCH database as fundhub_app, never production.
//
// What is proved, per the build spec §8:
//   1. who may see what: public listings are active, at signed/live buildings, or
//      flagged samples; never inactive ones, never unsigned buildings' real units
//   2. the wrong org never comes back (YD_ORG_SLUG picks the company, no parameter does)
//   3. the filters (city, beds, maxRent in dollars, page) and their 400s
//   4. GET only (405 with an allow header)

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture, call, creditLeaks } from "../yesdoor/testing/fixture.mjs";
import { _resetYdOrgCache } from "../yesdoor/store/org.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("yesdoor public listings", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let listings, listing, fx;
  const useOrg = (slug) => { process.env.YD_ORG_SLUG = slug; _resetYdOrgCache(); };

  before(async () => {
    ({ default: listings } = await import("../../api/yesdoor/public/listings.mjs"));
    ({ default: listing } = await import("../../api/yesdoor/public/listing.mjs"));
    fx = await buildYdFixture(db);
    useOrg(fx.slugA);
  });
  after(async () => { delete process.env.YD_ORG_SLUG; await close(); });

  const ids = (body) => body.listings.map((l) => l.id);

  test("shows active listings at signed buildings, and flagged samples", async () => {
    useOrg(fx.slugA);
    const r = await call(listings);
    assert.equal(r.code, 200);
    assert.equal(r.body.ok, true);
    const got = ids(r.body);
    assert.ok(got.includes(fx.A.lPublic1));
    assert.ok(got.includes(fx.A.lPublic2));
    assert.ok(got.includes(fx.A.lOther));
    assert.ok(got.includes(fx.A.lSample), "sample listings are shown");
    const sample = r.body.listings.find((l) => l.id === fx.A.lSample);
    assert.equal(sample.isSample, true, "a sample is flagged, never passed off as real");
    const real = r.body.listings.find((l) => l.id === fx.A.lPublic1);
    assert.equal(real.isSample, false);
  });

  test("hides inactive listings and a real unit at an unsigned building", async () => {
    useOrg(fx.slugA);
    const got = ids((await call(listings)).body);
    assert.ok(!got.includes(fx.A.lInactive), "an inactive unit is shown");
    assert.ok(!got.includes(fx.A.lUnsigned), "a unit at an unsigned, non-sample building is shown");
  });

  test("the listing shape: cents as integers, dates as plain strings, no rules or fees", async () => {
    useOrg(fx.slugA);
    const l = (await call(listings)).body.listings.find((x) => x.id === fx.A.lPublic1);
    assert.equal(l.rentCents, 162500);
    assert.ok(Number.isInteger(l.rentCents));
    assert.match(l.availableOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(l.unit, "101");
    assert.equal(l.building.city, "Phoenix");
    const text = JSON.stringify(l);
    for (const k of ["app_fee", "appFee", "min_score", "minScore", "income_multiple", "fee_percent", "criminal", "leasing"]) {
      assert.ok(!text.includes(k), `a public listing leaked ${k}`);
    }
    assert.deepEqual(creditLeaks(l), []);
  });

  test("cheapest first", async () => {
    useOrg(fx.slugA);
    const rents = (await call(listings)).body.listings.map((l) => l.rentCents);
    assert.deepEqual(rents, [...rents].sort((a, b) => a - b));
  });

  test("another company's listings never come back (the org is the deployment's, not a parameter)", async () => {
    useOrg(fx.slugA);
    const a = await call(listings, { query: { org_id: fx.orgB, orgId: fx.orgB } });
    assert.ok(!ids(a.body).includes(fx.B.lPublic1), "a caller-chosen org was honoured");
    assert.ok(ids(a.body).includes(fx.A.lPublic1));

    useOrg(fx.slugB);
    const b = await call(listings);
    assert.ok(ids(b.body).includes(fx.B.lPublic1));
    for (const id of [fx.A.lPublic1, fx.A.lPublic2, fx.A.lOther, fx.A.lSample]) {
      assert.ok(!ids(b.body).includes(id), "org A's listing came back for org B");
    }
    useOrg(fx.slugA);
  });

  test("the single-listing door: found, 404 for hidden and foreign ones, 400 for junk", async () => {
    useOrg(fx.slugA);
    const ok = await call(listing, { query: { id: fx.A.lPublic2 } });
    assert.equal(ok.code, 200);
    assert.equal(ok.body.listing.id, fx.A.lPublic2);
    assert.equal(ok.body.listing.rentCents, 214000);

    assert.equal((await call(listing, { query: { id: fx.A.lSample } })).code, 200);
    assert.equal((await call(listing, { query: { id: fx.A.lInactive } })).code, 404);
    assert.equal((await call(listing, { query: { id: fx.A.lUnsigned } })).code, 404);
    assert.equal((await call(listing, { query: { id: fx.B.lPublic1 } })).code, 404, "another org's unit was reachable");
    assert.equal((await call(listing, { query: { id: "not-a-uuid" } })).code, 400);
    assert.equal((await call(listing, { query: {} })).code, 400);
    assert.equal((await call(listing, { query: { id: "11111111-1111-4111-8111-111111111111" } })).code, 404);
  });

  test("filters: city, beds, maxRent in whole dollars", async () => {
    useOrg(fx.slugA);
    const phx = await call(listings, { query: { city: "phoenix" } });
    assert.ok(phx.body.listings.length >= 2);
    assert.ok(phx.body.listings.every((l) => l.building.city === "Phoenix"));

    const twoBeds = await call(listings, { query: { beds: "2" } });
    assert.deepEqual(ids(twoBeds.body), [fx.A.lPublic2]);

    const studio = await call(listings, { query: { beds: "0" } });
    assert.deepEqual(ids(studio.body), [fx.A.lSample]);

    // $1,500 = 150000 cents: only the $1,395 unit (139500) qualifies among real ones.
    const cheap = await call(listings, { query: { maxRent: "1500" } });
    assert.ok(ids(cheap.body).includes(fx.A.lOther));
    assert.ok(!ids(cheap.body).includes(fx.A.lPublic1));
    assert.ok(cheap.body.listings.every((l) => l.rentCents <= 150000));
  });

  test("bad input is a 400, not a 500", async () => {
    useOrg(fx.slugA);
    for (const q of [{ beds: "abc" }, { beds: "-1" }, { beds: "11" }, { maxRent: "free" }, { maxRent: "-5" }, { page: "0" }, { page: "x" }]) {
      const r = await call(listings, { query: q });
      assert.equal(r.code, 400, `query ${JSON.stringify(q)} should be 400`);
      assert.equal(r.body.ok, false);
    }
  });

  test("paging: total, page and pageSize come back, and a page past the end is empty", async () => {
    useOrg(fx.slugA);
    const p1 = await call(listings, { query: { page: "1" } });
    assert.equal(p1.body.page, 1);
    assert.equal(p1.body.pageSize, 24);
    assert.equal(p1.body.total, 4);
    const far = await call(listings, { query: { page: "99" } });
    assert.equal(far.code, 200);
    assert.deepEqual(far.body.listings, []);
    assert.equal(far.body.total, 4);
  });

  test("GET only", async () => {
    for (const h of [listings, listing]) {
      const r = await call(h, { method: "POST", body: {} });
      assert.equal(r.code, 405);
      assert.equal(r.headers.allow, "GET");
      assert.equal(r.body.error, "method_not_allowed");
    }
  });

  test("the seeded Arizona sample data is there, flagged, in the real org", async () => {
    useOrg("yesdoor");
    const r = await call(listings);
    assert.equal(r.code, 200);
    assert.equal(r.body.total, 24, "the seed holds 24 sample listings");
    assert.ok(r.body.listings.every((l) => l.isSample === true), "every seeded listing is flagged as a sample");
    const cities = new Set();
    let page = 1;
    let seen = 0;
    for (;;) {
      const p = await call(listings, { query: { page: String(page) } });
      for (const l of p.body.listings) {
        cities.add(l.building.city);
        assert.ok(l.rentCents >= 120000 && l.rentCents <= 240000, `rent ${l.rentCents} outside $1,200-$2,400`);
        assert.equal(l.building.state, "AZ");
      }
      seen += p.body.listings.length;
      if (seen >= p.body.total || !p.body.listings.length) break;
      page += 1;
    }
    assert.equal(seen, 24);
    for (const c of ["Phoenix", "Tempe", "Scottsdale", "Mesa", "Chandler"]) assert.ok(cities.has(c), `no sample listing in ${c}`);
    useOrg(fx.slugA);
  });
});
