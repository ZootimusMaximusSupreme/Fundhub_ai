import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CONNECTION_KINDS, CONNECTORS, getConnector } from "./index.mjs";
import * as manual from "./manual.mjs";
import * as entrata from "./entrata-sandbox.mjs";
import { dollarsToCents, isoFromParts, registrationEmail } from "./common.mjs";

const REGISTERED = "2026-10-07T15:30:00Z";
const renter = { first_name: "Priya", last_name: "Raman-Sample", email: "priya.raman@sample.yesdoor.test", phone: "+16025550101" };
const building = { id: "b-1", name: "Palo Verde Commons", leasing_email: "leasing@paloverde.test" };
const listing = { unit_label: "214", rent_cents: 189500 };

describe("the connector interface", () => {
  test("covers the four building connections", () => {
    assert.deepEqual([...CONNECTION_KINDS].sort(), ["csv", "entrata_api", "feed", "manual"]);
  });
  for (const kind of ["manual", "csv", "feed", "entrata_api"]) {
    test(`${kind}: has the three methods and is a sandbox`, () => {
      const c = getConnector(kind);
      for (const method of ["listListings", "pushGuestCard", "getLeaseStatus"]) assert.equal(typeof c[method], "function", method);
      assert.equal(c.SANDBOX, true);
      assert.equal(typeof c.PROVIDER, "string");
      assert.equal(c, CONNECTORS[kind]);
    });
  }
  test("an unknown connection is an error that lists the choices", () => {
    assert.throws(() => getConnector("yardi"), /unknown building connection "yardi".*manual/);
    assert.throws(() => getConnector("__proto__"), /unknown building connection/);
    assert.throws(() => getConnector(undefined), /unknown building connection/);
  });
  test("the registry cannot be changed", () => {
    assert.throws(() => { CONNECTORS.yardi = {}; }, TypeError);
  });
});

describe("registration email (pushGuestCard for manual, csv and feed)", () => {
  for (const kind of ["manual", "csv", "feed"]) {
    test(`${kind}: queues one email to the leasing office, with Yesdoor as the source and the timestamp`, async () => {
      const out = await getConnector(kind).pushGuestCard({ renter, building, listing, tourStartsAt: "2026-10-10T17:00:00Z", registrationSentAt: REGISTERED });
      assert.equal(out.ok, true);
      assert.equal(out.mode, "email");
      assert.equal(out.registeredAt, "2026-10-07T15:30:00.000Z");
      assert.deepEqual(out.outbox, {
        channel: "email",
        to_address: "leasing@paloverde.test",
        template_key: "building_registration",
        context: {
          source: "Yesdoor",
          registered_at: "2026-10-07T15:30:00.000Z",
          renter: { first_name: "Priya", last_name: "Raman-Sample", email: "priya.raman@sample.yesdoor.test", phone: "+16025550101" },
          building: { id: "b-1", name: "Palo Verde Commons" },
          unit: { unit_label: "214", rent_cents: 189500 },
          tour_starts_at: "2026-10-10T17:00:00.000Z"
        }
      });
    });
  }
  test("carries no credit fields, even if the renter object has them", () => {
    const dirty = { ...renter, credit_score: 700, eviction_count: 0, criminal_flags: [], collections_count: 1, raw: {}, dob: "1990-01-01" };
    const text = JSON.stringify(registrationEmail({ renter: dirty, building, listing, registrationSentAt: REGISTERED }));
    for (const word of ["credit_score", "eviction_count", "criminal_flags", "collections_count", "raw", "dob", "1990-01-01"]) {
      assert.equal(text.includes(word), false, word);
    }
  });
  test("no unit and no tour are fine", () => {
    const out = registrationEmail({ renter, building, registrationSentAt: REGISTERED });
    assert.equal(out.outbox.context.unit, null);
    assert.equal(out.outbox.context.tour_starts_at, null);
  });
  test("refuses with a reason when there is nowhere to send it or no timestamp", () => {
    assert.deepEqual(registrationEmail({ renter, building: { ...building, leasing_email: null }, registrationSentAt: REGISTERED }), { ok: false, reason: "no_leasing_email" });
    assert.deepEqual(registrationEmail({ renter, building: null, registrationSentAt: REGISTERED }), { ok: false, reason: "no_leasing_email" });
    assert.deepEqual(registrationEmail({ renter, building, registrationSentAt: null }), { ok: false, reason: "no_registration_time" });
  });
  test("manual, csv and feed have no lease-status feed: the building reports it in the portal", async () => {
    for (const kind of ["manual", "csv", "feed"]) {
      const s = await getConnector(kind).getLeaseStatus({ applicationId: "a" });
      assert.equal(s.known, false);
      assert.match(s.reason, /portal/);
    }
  });
});

describe("manual", () => {
  test("hands back the portal's listings, marked as manual", async () => {
    const out = await manual.listListings({ listings: [{ unit_label: "1", rent_cents: 100000 }, { unit_label: "2", rent_cents: 120000, beds: 2 }] });
    assert.deepEqual(out.errors, []);
    assert.deepEqual(out.listings.map((l) => [l.unit_label, l.source]), [["1", "manual"], ["2", "manual"]]);
  });
  test("a listing with no unit or no whole-cent rent is an error with its position", async () => {
    const out = await manual.listListings({ listings: [{ rent_cents: 1 }, { unit_label: "2" }, { unit_label: "3", rent_cents: 10.5 }, { unit_label: "4", rent_cents: 0 }, { unit_label: "5", rent_cents: 50000 }] });
    assert.deepEqual(out.errors.map((e) => e.row), [1, 2, 3, 4]);
    assert.equal(out.listings.length, 1);
  });
  test("nothing in, nothing out", async () => {
    assert.deepEqual(await manual.listListings(), { listings: [], errors: [] });
  });
});

describe("entrata sandbox", () => {
  test("returns fixture listings for a known property, as copies", async () => {
    const out = await entrata.listListings({ propertyId: "sandbox-prop-1" });
    assert.deepEqual(out.errors, []);
    assert.equal(out.listings.length, 3);
    assert.ok(out.listings.every((l) => l.source === "api" && Number.isInteger(l.rent_cents)));
    out.listings[0].rent_cents = 1;
    assert.equal((await entrata.listListings({ propertyId: "sandbox-prop-1" })).listings[0].rent_cents, 152500);
  });
  test("an unknown property is an error, not a crash", async () => {
    const out = await entrata.listListings({ propertyId: "nope" });
    assert.deepEqual(out.listings, []);
    assert.match(out.errors[0].message, /no property "nope"/);
    assert.equal((await entrata.listListings()).errors.length, 1);
    assert.equal((await entrata.listListings({ propertyId: "__proto__" })).errors.length, 1);
  });
  test("pushGuestCard is deterministic per renter and building", async () => {
    const a = await entrata.pushGuestCard({ renter, building, registrationSentAt: REGISTERED });
    const b = await entrata.pushGuestCard({ renter: { ...renter, email: renter.email.toUpperCase() }, building, registrationSentAt: REGISTERED });
    assert.equal(a.ok, true);
    assert.equal(a.mode, "api");
    assert.match(a.guestCardId, /^sandbox-gc-[0-9a-f]{12}$/);
    assert.equal(a.guestCardId, b.guestCardId);
    const other = await entrata.pushGuestCard({ renter, building: { id: "b-2" }, registrationSentAt: REGISTERED });
    assert.notEqual(other.guestCardId, a.guestCardId);
  });
  test("pushGuestCard refuses with a reason when something is missing", async () => {
    assert.equal((await entrata.pushGuestCard({ building, registrationSentAt: REGISTERED })).reason, "missing_renter_or_building");
    assert.equal((await entrata.pushGuestCard({ renter })).reason, "missing_renter_or_building");
    assert.equal((await entrata.pushGuestCard({ renter, building })).reason, "no_registration_time");
  });
  test("lease statuses follow the reference prefix", async () => {
    assert.deepEqual(await entrata.getLeaseStatus({ externalRef: "sandbox-lease-1" }), { known: true, status: "lease_signed" });
    assert.deepEqual(await entrata.getLeaseStatus({ externalRef: "sandbox-moved-in-1" }), { known: true, status: "moved_in" });
    const denied = await entrata.getLeaseStatus({ externalRef: "sandbox-denied-1" });
    assert.equal(denied.status, "denied");
    assert.ok(denied.reason.length > 5);
    assert.deepEqual(await entrata.getLeaseStatus({ externalRef: "whatever" }), { known: true, status: "applied" });
    assert.deepEqual(await entrata.getLeaseStatus(), { known: true, status: "applied" });
  });
});

describe("helpers", () => {
  test("dollarsToCents", () => {
    for (const [input, cents] of [["1550", 155000], ["$1,550.5", 155050], [1550, 155000], [1550.55, 155055], ["0", 0], ["  12 ", 1200]]) {
      assert.equal(dollarsToCents(input), cents, String(input));
    }
    for (const bad of ["", "abc", "-1", "1.234", null, undefined, NaN, -5]) assert.equal(dollarsToCents(bad), null, String(bad));
  });
  test("isoFromParts checks the calendar", () => {
    assert.equal(isoFromParts("2026", "2", "28"), "2026-02-28");
    assert.equal(isoFromParts(2028, 2, 29), "2028-02-29");
    for (const [y, m, d] of [[2026, 2, 29], [2026, 13, 1], [2026, 0, 1], [2026, 4, 31], ["x", 1, 1], [1800, 1, 1], [undefined, 1, 1]]) {
      assert.equal(isoFromParts(y, m, d), null, `${y}-${m}-${d}`);
    }
  });
});
