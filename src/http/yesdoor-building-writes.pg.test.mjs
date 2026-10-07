// Postgres-backed tests for what a building user writes:
//   POST /api/yesdoor/building/rules      POST /api/yesdoor/building/listings
//   POST /api/yesdoor/building/import     (csv and a MITS feed, through the connectors)
//
// Proved: only a building-user session gets in (401 / 403), a user can only write to
// a building on their own account (anything else is a 404), rules are never edited
// (a new version each time), a bad spreadsheet row never sinks the file, units are
// upserted by label, and every response is free of credit data.
//
// SCRATCH database only, as fundhub_app. Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture, call, creditLeaks } from "../yesdoor/testing/fixture.mjs";
import { useFixtureEnv, mkSignedBuilding, one, rows } from "../yesdoor/testing/b4.mjs";
import { createAccountSession } from "../yesdoor/auth/session.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

const MITS = `<?xml version="1.0" encoding="UTF-8"?>
<PhysicalProperty xmlns="http://www.mitsproject.org/ils">
  <Property IDValue="prop-1">
    <PropertyID>
      <Identification IDValue="prop-1" IDType="PropertyID"/>
      <MarketingName>Feed Test Lofts</MarketingName>
      <Address AddressType="property"><AddressLine1>1 Feed Way</AddressLine1><City>Tempe</City><State>AZ</State><PostalCode>85281</PostalCode></Address>
    </PropertyID>
    <Floorplan IDValue="fp-1">
      <Room RoomType="Bedroom"><Count>1</Count></Room><Room RoomType="Bathroom"><Count>1</Count></Room>
      <SquareFeet Min="710" Max="740"/><MarketRent Min="1525" Max="1600"/>
    </Floorplan>
    <ILS_Unit IDValue="u-101"><Units><Unit><FloorplanID IDValue="fp-1"/><MarketingName>F101</MarketingName><UnitRent>1550</UnitRent></Unit></Units></ILS_Unit>
    <ILS_Unit IDValue="u-102"><Units><Unit><FloorplanID IDValue="fp-1"/><MarketingName>F102</MarketingName></Unit></Units></ILS_Unit>
    <ILS_Unit IDValue="u-402"><Units><Unit><MarketingName>F402</MarketingName><UnitOccupancyStatus>occupied</UnitOccupancyStatus><UnitRent>1700</UnitRent></Unit></Units></ILS_Unit>
    <ILS_Unit IDValue="u-501"><Units><Unit><MarketingName>F501</MarketingName><UnitRent>call us</UnitRent></Unit></Units></ILS_Unit>
  </Property>
</PhysicalProperty>`;

describe("yesdoor building writes", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, h, mine, other;
  const t = () => fx.tokens;
  const post = (door, token, body) => call(h[door], { method: "POST", token, body });
  const eventNames = (entityId) => rows(db, `SELECT name FROM yd_events WHERE entity_id = $1 ORDER BY occurred_at, id`, [entityId]).then((r) => r.map((x) => x.name));

  const goodRules = { minScore: 640, incomeMultiple: 2.5, maxEvictions: 0, evictionLookbackYears: 7, criminalPolicy: { felony: 10, violent: "never", misdemeanor: "case_by_case" }, acceptsSecondChance: true };

  before(async () => {
    fx = await buildYdFixture(db);
    useFixtureEnv(fx);
    h = {};
    for (const [name, file] of [["rules", "building/rules"], ["listings", "building/listings"], ["import", "building/import"], ["pubListings", "public/listings"]]) {
      h[name] = (await import(`../../api/yesdoor/${file}.mjs`)).default;
    }
    // Each test group gets its own signed building with its own login, so counts stay clean.
    mine = await mkSignedBuilding(db, fx);
    other = await mkSignedBuilding(db, fx);       // the same company, a different building
  });
  after(async () => { await close(); });

  test("every building write door: nobody 401, other kinds of login 401/403, staff 401", async () => {
    for (const door of ["rules", "listings", "import"]) {
      assert.equal((await post(door, undefined, {})).code, 401, `${door} no session`);
      assert.equal((await post(door, t().renterA, {})).code, 403, `${door} renter`);
      assert.equal((await post(door, t().brokerA, {})).code, 403, `${door} broker`);
      assert.equal((await post(door, t().opsA, {})).code, 401, `${door} staff token is not an account`);
      assert.equal((await call(h[door], { token: mine.token, method: "GET" })).code, door === "rules" ? 200 : 405, `${door} GET`);
    }
  });

  /* ── rules ────────────────────────────────────────────────────────────── */

  describe("POST building/rules", () => {
    test("saves a NEW version, confirmed now, and the old one stays as it was", async () => {
      const b = await mkSignedBuilding(db, fx);
      const v1 = await post("rules", b.token, { rules: goodRules, notes: "Updated after our spring audit" });
      assert.equal(v1.code, 201, JSON.stringify(v1.body));
      assert.equal(v1.body.buildingId, b.buildingId, "a one-building account needs no buildingId");
      assert.equal(v1.body.rules.version, 2, "the seeded rules were version 1");
      assert.equal(v1.body.rules.minScore, 640);
      assert.equal(v1.body.rules.incomeMultiple, 2.5);
      assert.equal(v1.body.rules.acceptsSecondChance, true);
      assert.equal(v1.body.rules.source, "portal");
      assert.deepEqual(v1.body.rules.criminalPolicy, goodRules.criminalPolicy);
      assert.ok(new Date(v1.body.rules.confirmedAt) > new Date(Date.now() - 60_000));

      const v2 = await post("rules", b.token, { rules: { ...goodRules, minScore: 660 } });
      assert.equal(v2.body.rules.version, 3);
      const all = await rows(db, `SELECT version, min_score FROM yd_building_rules WHERE building_id = $1 ORDER BY version`, [b.buildingId]);
      assert.deepEqual(all.map((r) => [r.version, r.min_score]), [[1, 600], [2, 640], [3, 660]]);
      assert.ok((await eventNames(b.buildingId)).filter((n) => n === "rules.posted").length === 2);
    });

    test("the fields can arrive flat, and the building user reads them back through GET", async () => {
      const b = await mkSignedBuilding(db, fx);
      const r = await post("rules", b.token, { ...goodRules, buildingId: b.buildingId });
      assert.equal(r.code, 201);
      const got = await call(h.rules, { token: b.token });
      assert.equal(got.body.buildings[0].current, 2);
      assert.equal(got.body.buildings[0].stale, false);
      assert.equal(got.body.buildings[0].versions[0].minScore, 640);
      assert.deepEqual(creditLeaks(got.body), []);
    });

    test("confirmCurrent re-confirms the latest version without making a new one", async () => {
      const b = await mkSignedBuilding(db, fx);
      await db.query(`UPDATE yd_building_rules SET confirmed_at = now() - interval '45 days' WHERE building_id = $1`, [b.buildingId]);
      const stale = await call(h.rules, { token: b.token });
      assert.equal(stale.body.buildings[0].stale, true);
      const r = await post("rules", b.token, { confirmCurrent: true });
      assert.equal(r.code, 200);
      assert.equal(r.body.rules.version, 1);
      assert.equal((await rows(db, `SELECT id FROM yd_building_rules WHERE building_id = $1`, [b.buildingId])).length, 1);
      assert.equal((await call(h.rules, { token: b.token })).body.buildings[0].stale, false);
      assert.ok((await eventNames(b.buildingId)).includes("rules.confirmed"));
    });

    test("a building with no rules cannot be 'confirmed': it says save them first", async () => {
      // Rules cannot be deleted, so this uses a building that never had any.
      const bare = (await db.query(
        `INSERT INTO yd_buildings (org_id, company_id, name, status, leasing_email) VALUES ($1,$2,'Bare Rules Court','signed','x@example.test') RETURNING id`,
        [fx.orgA, fx.A.company])).rows[0].id;
      const acct = (await db.query(`INSERT INTO yd_accounts (org_id, kind, email) VALUES ($1,'building_user',$2) RETURNING id`, [fx.orgA, `bare-${Date.now()}@example.test`])).rows[0].id;
      await db.query(`INSERT INTO yd_account_buildings (org_id, account_id, building_id) VALUES ($1,$2,$3)`, [fx.orgA, acct, bare]);
      const token = (await createAccountSession(db, { accountId: acct, orgId: fx.orgA })).token;
      const r = await post("rules", token, { confirmCurrent: true });
      assert.equal(r.code, 409);
      assert.equal(r.body.error, "no_rules_yet");
    });

    test("bad rules are a plain 400 and write nothing", async () => {
      const b = await mkSignedBuilding(db, fx);
      const bad = [
        {}, { rules: {} }, { rules: { ...goodRules, minScore: 299 } }, { rules: { ...goodRules, minScore: 851 } },
        { rules: { ...goodRules, minScore: "640" } }, { rules: { ...goodRules, incomeMultiple: undefined } },
        { rules: { ...goodRules, incomeMultiple: 0.5 } }, { rules: { ...goodRules, incomeMultiple: 11 } },
        { rules: { ...goodRules, maxEvictions: -1 } }, { rules: { ...goodRules, evictionLookbackYears: 100 } },
        { rules: { ...goodRules, acceptsSecondChance: "yes" } },
        { rules: { ...goodRules, criminalPolicy: { felony: -3 } } }, { rules: { ...goodRules, criminalPolicy: { felony: "sometimes" } } },
        { rules: { ...goodRules, criminalPolicy: { "Bad Name": 5 } } }, { rules: { ...goodRules, criminalPolicy: [] } }
      ];
      for (const body of bad) {
        const clean = JSON.parse(JSON.stringify(body));
        const r = await post("rules", b.token, clean);
        assert.equal(r.code, 400, JSON.stringify(body));
      }
      assert.equal((await rows(db, `SELECT id FROM yd_building_rules WHERE building_id = $1`, [b.buildingId])).length, 1);
    });

    test("a user writes only to a building on their own account: another building, another company, or none named is refused", async () => {
      const r1 = await post("rules", mine.token, { buildingId: other.buildingId, rules: goodRules });
      assert.equal(r1.code, 404, "same company, not their building");
      const r2 = await post("rules", mine.token, { buildingId: fx.B.bSigned, rules: goodRules });
      assert.equal(r2.code, 404, "another company's building");
      assert.equal((await rows(db, `SELECT id FROM yd_building_rules WHERE building_id = $1`, [fx.B.bSigned])).length, 1);
      // An account on two buildings must say which one.
      const two = await mkSignedBuilding(db, fx);
      await db.query(`INSERT INTO yd_account_buildings (org_id, account_id, building_id) VALUES ($1,$2,$3)`, [fx.orgA, two.accountId, other.buildingId]);
      const unspecified = await post("rules", two.token, { rules: goodRules });
      assert.equal(unspecified.code, 400);
      assert.equal(unspecified.body.error, "buildingId_required");
      assert.equal((await post("rules", two.token, { buildingId: other.buildingId, rules: goodRules })).code, 201);
    });

    test("two saves at the same moment get two different version numbers", async () => {
      const b = await mkSignedBuilding(db, fx);
      const [x, y] = await Promise.all([
        post("rules", b.token, { rules: { ...goodRules, minScore: 650 } }),
        post("rules", b.token, { rules: { ...goodRules, minScore: 655 } })
      ]);
      assert.deepEqual([x.code, y.code], [201, 201]);
      assert.notEqual(x.body.rules.version, y.body.rules.version);
      assert.deepEqual((await rows(db, `SELECT version FROM yd_building_rules WHERE building_id = $1 ORDER BY version`, [b.buildingId])).map((r) => r.version), [1, 2, 3]);
    });

    test("the answer carries no credit data", async () => {
      const r = await post("rules", mine.token, { rules: goodRules });
      assert.deepEqual(creditLeaks(r.body), []);
    });
  });

  /* ── listings ─────────────────────────────────────────────────────────── */

  describe("POST building/listings", () => {
    test("adds a unit, and the same label in any case updates it instead of adding a second", async () => {
      const b = await mkSignedBuilding(db, fx);
      const created = await post("listings", b.token, { unitLabel: "2B", beds: 2, baths: 1.5, sqft: 980, rentCents: 189500, availableOn: "2026-12-01", specials: "One month free", photos: ["https://img.example.test/a.jpg"] });
      assert.equal(created.code, 201, JSON.stringify(created.body));
      assert.equal(created.body.created, true);
      const l = created.body.listing;
      assert.equal(l.unitLabel, "2B");
      assert.equal(l.beds, 2);
      assert.equal(l.baths, 1.5);
      assert.equal(l.rentCents, 189500);
      assert.equal(l.availableOn, "2026-12-01");
      assert.equal(l.source, "manual");
      assert.equal(l.active, true);
      assert.equal(l.isSample, false);
      assert.deepEqual(l.photos, ["https://img.example.test/a.jpg"]);

      const updated = await post("listings", b.token, { unitLabel: "2b", beds: 2, rentCents: 192500 });
      assert.equal(updated.code, 200);
      assert.equal(updated.body.created, false);
      assert.equal(updated.body.listing.id, l.id);
      assert.equal(updated.body.listing.rentCents, 192500);
      assert.deepEqual(updated.body.listing.photos, ["https://img.example.test/a.jpg"], "photos not sent are kept");
      assert.equal((await rows(db, `SELECT id FROM yd_listings WHERE building_id = $1 AND lower(unit_label) = '2b'`, [b.buildingId])).length, 1);
      assert.deepEqual(await eventNames(l.id), ["listing.created", "listing.updated"]);
    });

    test("a unit can be switched off, and then it leaves the public search", async () => {
      const b = await mkSignedBuilding(db, fx, { rentCents: 143300 });
      const before = await call(h.pubListings, { query: { maxRent: "1433" } });
      assert.ok(before.body.listings.some((l) => l.id === b.listingId), "public while active");
      const off = await post("listings", b.token, { unitLabel: "1A", beds: 1, rentCents: 143300, active: false });
      assert.equal(off.body.listing.active, false);
      const after3 = await call(h.pubListings, { query: { maxRent: "1433" } });
      assert.ok(!after3.body.listings.some((l) => l.id === b.listingId));
    });

    test("a studio is beds 0; rent is whole cents; bad fields are a plain 400", async () => {
      const b = await mkSignedBuilding(db, fx);
      assert.equal((await post("listings", b.token, { unitLabel: "S1", beds: 0, rentCents: 99900 })).code, 201);
      const bad = [
        {}, { unitLabel: "", beds: 1, rentCents: 1000 }, { unitLabel: "X", rentCents: 1000 }, { unitLabel: "X", beds: 1 },
        { unitLabel: "X", beds: 11, rentCents: 1000 }, { unitLabel: "X", beds: 1.5, rentCents: 1000 },
        { unitLabel: "X", beds: 1, rentCents: 0 }, { unitLabel: "X", beds: 1, rentCents: -5 },
        { unitLabel: "X", beds: 1, rentCents: 1500.5 }, { unitLabel: "X", beds: 1, rentCents: "1500" },
        { unitLabel: "X", beds: 1, rent: 1500 },
        { unitLabel: "X", beds: 1, rentCents: 1000, baths: 1.3 }, { unitLabel: "X", beds: 1, rentCents: 1000, sqft: 0 },
        { unitLabel: "X", beds: 1, rentCents: 1000, availableOn: "2026-02-30" }, { unitLabel: "X", beds: 1, rentCents: 1000, availableOn: "soon" },
        { unitLabel: "X", beds: 1, rentCents: 1000, photos: ["http://insecure.example.test/a.jpg"] },
        { unitLabel: "X", beds: 1, rentCents: 1000, photos: "https://a.example.test/a.jpg" },
        { unitLabel: "X".repeat(41), beds: 1, rentCents: 1000 }, { unitLabel: "X", beds: 1, rentCents: 1000, active: "no" }
      ];
      for (const body of bad) assert.equal((await post("listings", b.token, body)).code, 400, JSON.stringify(body));
      assert.equal((await rows(db, `SELECT id FROM yd_listings WHERE building_id = $1`, [b.buildingId])).length, 2, "only the seeded unit and S1");
    });

    test("a user cannot add units to a building that is not theirs", async () => {
      const r = await post("listings", mine.token, { buildingId: other.buildingId, unitLabel: "Z1", beds: 1, rentCents: 100000 });
      assert.equal(r.code, 404);
      const r2 = await post("listings", mine.token, { buildingId: fx.B.bSigned, unitLabel: "Z1", beds: 1, rentCents: 100000 });
      assert.equal(r2.code, 404);
      assert.equal(await one(db, `SELECT id FROM yd_listings WHERE unit_label = 'Z1'`), null);
    });
  });

  /* ── import ───────────────────────────────────────────────────────────── */

  describe("POST building/import", () => {
    const CSV = [
      "Unit,Bedrooms,Bathrooms,Sq Ft,Monthly Rent,Available,Specials",
      "101,1,1,700,\"$1,550\",2026-11-01,Free parking",
      "102,2,2,980,1895.50,11/15/2026,",
      "103,0,1,480,1295,,",
      "104,1,1,700,call us,,",                // bad rent
      ",1,1,700,1500,,",                      // no unit
      "101,1,1,700,1600,,"                    // a repeat of 101 in the same file
    ].join("\n");

    test("csv: good rows become units, each bad row is reported by its row number, the file is never sunk", async () => {
      const b = await mkSignedBuilding(db, fx);
      const r = await post("import", b.token, { format: "csv", content: CSV });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.imported, 3);
      assert.equal(r.body.created, 3, "101 is new here (the seeded unit is 1A)");
      assert.equal(r.body.updated, 0);
      assert.deepEqual(r.body.errors.map((e) => e.row).sort(), [5, 6, 7]);
      assert.ok(r.body.errors.every((e) => typeof e.message === "string" && e.message.length > 10));
      const units = await rows(db, `SELECT unit_label, beds, rent_cents, source, to_char(available_on,'YYYY-MM-DD') AS d, specials FROM yd_listings WHERE building_id = $1 AND source = 'csv' ORDER BY unit_label`, [b.buildingId]);
      assert.deepEqual(units.map((u) => [u.unit_label, u.beds, Number(u.rent_cents)]), [["101", 1, 155000], ["102", 2, 189550], ["103", 0, 129500]]);
      assert.equal(units[0].d, "2026-11-01");
      assert.equal(units[1].d, "2026-11-15");
      assert.equal(units[0].specials, "Free parking");
      assert.deepEqual(creditLeaks(r.body), []);
      assert.ok((await eventNames(b.buildingId)).includes("listings.imported"));
    });

    test("importing the same file again updates the units instead of duplicating them", async () => {
      const b = await mkSignedBuilding(db, fx);
      await post("import", b.token, { format: "csv", content: CSV });
      const again = await post("import", b.token, { format: "csv", content: CSV.replace('"$1,550"', "1575") });
      assert.equal(again.body.created, 0);
      assert.equal(again.body.updated, 3);
      const row = await one(db, `SELECT rent_cents FROM yd_listings WHERE building_id = $1 AND unit_label = '101'`, [b.buildingId]);
      assert.equal(Number(row.rent_cents), 157500);
      assert.equal((await rows(db, `SELECT id FROM yd_listings WHERE building_id = $1`, [b.buildingId])).length, 4);
    });

    test("replace turns off this building's other units from the same kind of source, and nothing else", async () => {
      const b = await mkSignedBuilding(db, fx);
      await post("import", b.token, { format: "csv", content: CSV });                                 // 101, 102, 103 from csv
      const small = await post("import", b.token, { format: "csv", content: "Unit,Rent,Beds\n102,1900,2", replace: true });
      assert.equal(small.body.deactivated, 2);
      const act = await rows(db, `SELECT unit_label FROM yd_listings WHERE building_id = $1 AND active ORDER BY unit_label`, [b.buildingId]);
      assert.deepEqual(act.map((x) => x.unit_label), ["102", "1A"].sort(), "the hand-typed unit 1A is untouched");
    });

    test("the column mapping can name the columns", async () => {
      const b = await mkSignedBuilding(db, fx);
      const r = await post("import", b.token, { format: "csv", content: "Apt No.,Asking,Br\nQ7,1650,2", mapping: { unit_label: "Apt No.", rent: "Asking", beds: "Br" } });
      assert.equal(r.code, 200);
      assert.equal(r.body.imported, 1);
    });

    test("mits feed: vacant units import, occupied ones are skipped and listed, a bad rent is reported", async () => {
      const b = await mkSignedBuilding(db, fx);
      const r = await post("import", b.token, { format: "mits", content: MITS });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.imported, 2);
      assert.equal(r.body.skipped.length, 1);
      assert.equal(r.body.skipped[0].unit, "F402");
      assert.ok(r.body.errors.some((e) => e.unit === "F501"));
      const units = await rows(db, `SELECT unit_label, beds, rent_cents, source FROM yd_listings WHERE building_id = $1 AND source = 'feed' ORDER BY unit_label`, [b.buildingId]);
      assert.deepEqual(units.map((u) => [u.unit_label, u.beds, Number(u.rent_cents)]), [["F101", 1, 155000], ["F102", 1, 152500]]);
    });

    test("a file where nothing can be used is a 422 that still lists every problem", async () => {
      const b = await mkSignedBuilding(db, fx);
      const r = await post("import", b.token, { format: "csv", content: "Unit,Rent\nA,none\nB,free" });
      assert.equal(r.code, 422);
      assert.equal(r.body.error, "nothing_imported");
      assert.equal(r.body.errors.length, 2);
      const noHeader = await post("import", b.token, { format: "csv", content: "hello\nworld" });
      assert.equal(noHeader.code, 422);
      const notMits = await post("import", b.token, { format: "mits", content: "<html></html>" });
      assert.equal(notMits.code, 422);
    });

    test("units with no bedroom count are reported, not guessed", async () => {
      const b = await mkSignedBuilding(db, fx);
      const r = await post("import", b.token, { format: "csv", content: "Unit,Rent,Beds\nA,1500,1\nB,1600," });
      assert.equal(r.body.imported, 1);
      assert.ok(r.body.errors.some((e) => e.unit === "B" && e.field === "beds"));
    });

    test("bad requests: no format, no content, a file too large, too many rows", async () => {
      assert.equal((await post("import", mine.token, { content: "a" })).code, 400);
      assert.equal((await post("import", mine.token, { format: "pdf", content: "a" })).code, 400);
      assert.equal((await post("import", mine.token, { format: "csv" })).code, 400);
      assert.equal((await post("import", mine.token, { format: "csv", content: "   " })).code, 400);
      assert.equal((await post("import", mine.token, { format: "csv", content: "x".repeat(5_000_001) })).code, 400);
      const many = ["Unit,Rent,Beds", ...Array.from({ length: 2001 }, (_, i) => `U${i},1500,1`)].join("\n");
      const r = await post("import", mine.token, { format: "csv", content: many });
      assert.equal(r.code, 400);
      assert.equal(r.body.error, "too_many_rows");
    });

    test("a user cannot import into a building that is not theirs", async () => {
      const r = await post("import", mine.token, { buildingId: other.buildingId, format: "csv", content: "Unit,Rent,Beds\nHIJACK,1500,1" });
      assert.equal(r.code, 404);
      const r2 = await post("import", mine.token, { buildingId: fx.B.bSigned, format: "csv", content: "Unit,Rent,Beds\nHIJACK,1500,1" });
      assert.equal(r2.code, 404);
      assert.equal(await one(db, `SELECT id FROM yd_listings WHERE unit_label = 'HIJACK'`), null);
    });

    test("imported units reach the public search once the building is signed", async () => {
      const b = await mkSignedBuilding(db, fx);
      await post("import", b.token, { format: "csv", content: "Unit,Rent,Beds\nPUB1,1311,1" });
      const found = await call(h.pubListings, { query: { maxRent: "1311" } });
      assert.ok(found.body.listings.some((l) => l.unit === "PUB1" && l.building.id === b.buildingId));
    });
  });
});
