import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TOUCH_KINDS, buildingsWithStaleRules, rentersDueForRecheck, touchesDue } from "./schedule.mjs";
import { YD_DEFAULTS } from "./config.mjs";

const NOW = new Date("2026-10-07T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n) => daysAgo(-n);

describe("rentersDueForRecheck: stale screenings", () => {
  const renter = (over = {}) => ({ id: "r1", stage: "matched", lastScreeningAt: daysAgo(31), ...over });
  const due = (renters) => rentersDueForRecheck({ renters, now: NOW });

  test("a screening older than 30 days is due, exactly 30 days is not", () => {
    assert.deepEqual(due([renter({ lastScreeningAt: daysAgo(31) })]).map((d) => d.reason), ["stale_screening"]);
    assert.deepEqual(due([renter({ lastScreeningAt: daysAgo(30) })]), []);
    assert.deepEqual(due([renter({ lastScreeningAt: daysAgo(3) })]), []);
  });
  test("screened, matched and booked renters are checked; leads and inactive renters are not", () => {
    for (const stage of ["screened", "matched", "booked"]) assert.equal(due([renter({ stage })]).length, 1);
    for (const stage of ["lead", "inactive"]) assert.equal(due([renter({ stage })]).length, 0);
  });
  test("a renter in a screening stage with no screening on file is due", () => {
    assert.equal(due([renter({ lastScreeningAt: null })]).length, 1);
  });
  test("a renter whose recheck consent is false is skipped; missing means consented", () => {
    assert.equal(due([renter({ recheckConsent: false })]).length, 0);
    assert.equal(due([renter({ recheckConsent: true })]).length, 1);
    assert.equal(due([renter()]).length, 1);
  });
  test("result is sorted by renter id, with the last screening date", () => {
    const out = due([renter({ id: "r9" }), renter({ id: "r2" }), renter({ id: "r5", lastScreeningAt: daysAgo(1) })]);
    assert.deepEqual(out.map((d) => d.renterId), ["r2", "r9"]);
    assert.equal(out[0].lastScreeningAt, daysAgo(31));
  });
  test("the interval comes from the defaults", () => {
    const defaults = { ...YD_DEFAULTS, recheckDays: 7 };
    assert.equal(rentersDueForRecheck({ renters: [renter({ lastScreeningAt: daysAgo(8) })], now: NOW, defaults }).length, 1);
  });
  test("empty input gives nothing", () => {
    assert.deepEqual(rentersDueForRecheck({ now: NOW }), []);
  });
});

describe("rentersDueForRecheck: lease end", () => {
  const placed = (over = {}) => ({ id: "r1", stage: "placed", lastScreeningAt: daysAgo(200), leaseEnd: daysAhead(89), ...over });
  const due = (renters) => rentersDueForRecheck({ renters, now: NOW });

  test("due once the lease ends within 90 days", () => {
    assert.deepEqual(due([placed()]).map((d) => d.reason), ["lease_end_90"]);
    assert.deepEqual(due([placed({ stage: "lifetime" })]).map((d) => d.reason), ["lease_end_90"]);
  });
  test("not due before the 90-day window, due at exactly 90 days out", () => {
    assert.equal(due([placed({ leaseEnd: daysAhead(91) })]).length, 0);
    assert.equal(due([placed({ leaseEnd: daysAhead(90) })]).length, 1);
  });
  test("not due when the lease has already ended or no end date is known", () => {
    assert.equal(due([placed({ leaseEnd: daysAgo(1) })]).length, 0);
    assert.equal(due([placed({ leaseEnd: null })]).length, 0);
  });
  test("not due again once a screening has run since the renter entered the window", () => {
    assert.equal(due([placed({ leaseEnd: daysAhead(60), lastScreeningAt: daysAgo(5) })]).length, 0);
    // The window opened 30 days ago (lease ends in 60 days). A screening 40 days ago pre-dates it.
    assert.equal(due([placed({ leaseEnd: daysAhead(60), lastScreeningAt: daysAgo(40) })]).length, 1);
  });
  test("a placed renter with no screening on file is due", () => {
    assert.equal(due([placed({ lastScreeningAt: null })]).length, 1);
  });
  test("a consent of false skips lease-end rechecks too", () => {
    assert.equal(due([placed({ recheckConsent: false })]).length, 0);
  });
  test("the 90 comes from the defaults", () => {
    const defaults = { ...YD_DEFAULTS, leaseEndRecheckDays: 30 };
    assert.equal(rentersDueForRecheck({ renters: [placed({ leaseEnd: daysAhead(60) })], now: NOW, defaults }).length, 0);
    assert.equal(rentersDueForRecheck({ renters: [placed({ leaseEnd: daysAhead(29) })], now: NOW, defaults }).length, 1);
  });
});

describe("touchesDue", () => {
  const app = (over = {}) => ({
    id: "a1", renterId: "r1", stage: "moved_in", movedInAt: daysAgo(0), leaseEnd: daysAhead(365), ...over
  });
  const kinds = (applications, existingTouches = []) =>
    touchesDue({ applications, existingTouches, now: NOW }).map((t) => t.kind);

  test("the four touch kinds are the spec's", () => {
    assert.deepEqual([...TOUCH_KINDS], ["move_in_welcome", "day_30", "month_6", "lease_end_90"]);
  });
  test("the welcome is due the moment the renter moves in", () => {
    assert.deepEqual(kinds([app()]), ["move_in_welcome"]);
  });
  test("day_30 is due on day 30, not on day 29", () => {
    const existing = [{ applicationId: "a1", kind: "move_in_welcome" }];
    assert.deepEqual(kinds([app({ movedInAt: daysAgo(29) })], existing), []);
    assert.deepEqual(kinds([app({ movedInAt: daysAgo(30) })], existing), ["day_30"]);
  });
  test("month_6 is due after six calendar months", () => {
    const existing = ["move_in_welcome", "day_30"].map((kind) => ({ applicationId: "a1", kind }));
    assert.deepEqual(kinds([app({ movedInAt: "2026-04-08T12:00:00Z" })], existing), []);
    assert.deepEqual(kinds([app({ movedInAt: "2026-04-07T12:00:00Z" })], existing), ["month_6"]);
  });
  test("lease_end_90 is due 90 days before the lease ends and not after it ended", () => {
    const existing = ["move_in_welcome", "day_30", "month_6"].map((kind) => ({ applicationId: "a1", kind }));
    const old = { movedInAt: daysAgo(300) };
    assert.deepEqual(kinds([app({ ...old, leaseEnd: daysAhead(91) })], existing), []);
    assert.deepEqual(kinds([app({ ...old, leaseEnd: daysAhead(90) })], existing), ["lease_end_90"]);
    assert.deepEqual(kinds([app({ ...old, leaseEnd: daysAgo(1) })], existing), []);
  });
  test("touches already queued, sent or not, are never queued twice", () => {
    const a = app({ movedInAt: daysAgo(400), leaseEnd: daysAhead(30) });
    assert.deepEqual(kinds([a]), ["move_in_welcome", "day_30", "month_6", "lease_end_90"]);
    const all = TOUCH_KINDS.map((kind) => ({ applicationId: "a1", kind }));
    assert.deepEqual(kinds([a], all), []);
    assert.deepEqual(kinds([a], [{ applicationId: "OTHER", kind: "day_30" }]).includes("day_30"), true);
  });
  test("only renters who moved in get touches", () => {
    for (const stage of ["booked", "registered", "toured", "applied", "approved", "lease_signed", "denied", "cancelled", "refunded"]) {
      assert.deepEqual(kinds([app({ stage, movedInAt: daysAgo(100) })]), [], stage);
    }
    for (const stage of ["moved_in", "invoiced", "paid", "safe"]) {
      assert.ok(kinds([app({ stage, movedInAt: daysAgo(100) })]).length > 0, stage);
    }
  });
  test("a moved-in application with no move-in date gets nothing but a possible lease-end touch", () => {
    assert.deepEqual(kinds([app({ movedInAt: null, leaseEnd: daysAhead(30) })]), ["lease_end_90"]);
    assert.deepEqual(kinds([app({ movedInAt: null, leaseEnd: null })]), []);
  });
  test("output is sorted by due time, then application, then kind, with renter ids", () => {
    const out = touchesDue({
      applications: [
        app({ id: "b", renterId: "rb", movedInAt: daysAgo(35), leaseEnd: daysAhead(300) }),
        app({ id: "a", renterId: "ra", movedInAt: daysAgo(2), leaseEnd: daysAhead(300) })
      ],
      now: NOW
    });
    assert.deepEqual(out.map((t) => `${t.applicationId}:${t.kind}`), ["b:move_in_welcome", "b:day_30", "a:move_in_welcome"]);
    assert.equal(out[0].renterId, "rb");
    assert.equal(out[0].dueAt, daysAgo(35));
  });
  test("the 90 for lease_end_90 comes from the defaults", () => {
    const defaults = { ...YD_DEFAULTS, leaseEndRecheckDays: 45 };
    const a = app({ movedInAt: daysAgo(300), leaseEnd: daysAhead(60) });
    const existing = ["move_in_welcome", "day_30", "month_6"].map((kind) => ({ applicationId: "a1", kind }));
    assert.deepEqual(touchesDue({ applications: [a], existingTouches: existing, now: NOW, defaults }), []);
  });
  test("empty input gives nothing", () => {
    assert.deepEqual(touchesDue({ now: NOW }), []);
  });
});

describe("buildingsWithStaleRules", () => {
  const b = (id, status, rulesConfirmedAt) => ({ id, status, rulesConfirmedAt });
  const stale = (buildings) => buildingsWithStaleRules({ buildings, now: NOW });

  test("flags signed and live buildings past 30 days, not at exactly 30", () => {
    const out = stale([b("old", "live", daysAgo(31)), b("edge", "live", daysAgo(30)), b("new", "signed", daysAgo(2))]);
    assert.deepEqual(out, [{ buildingId: "old", neverConfirmed: false, daysSinceConfirmed: 31 }]);
  });
  test("flags a building that never confirmed", () => {
    assert.deepEqual(stale([b("x", "live", null)]), [{ buildingId: "x", neverConfirmed: true, daysSinceConfirmed: null }]);
  });
  test("ignores buildings nobody is matched to", () => {
    for (const status of ["target", "pitched", "agreement_sent", "paused", "churned"]) {
      assert.deepEqual(stale([b("x", status, daysAgo(400))]), [], status);
    }
  });
  test("stalest first: never confirmed, then most days, then id", () => {
    const out = stale([b("c", "live", daysAgo(40)), b("a", "live", daysAgo(90)), b("n", "signed", null), b("b", "live", daysAgo(40))]);
    assert.deepEqual(out.map((x) => x.buildingId), ["n", "a", "b", "c"]);
  });
  test("the 30 comes from the defaults", () => {
    const defaults = { ...YD_DEFAULTS, rulesStaleDays: 7 };
    assert.equal(buildingsWithStaleRules({ buildings: [b("x", "live", daysAgo(8))], now: NOW, defaults }).length, 1);
  });
  test("empty input gives nothing", () => {
    assert.deepEqual(buildingsWithStaleRules({ now: NOW }), []);
  });
});
