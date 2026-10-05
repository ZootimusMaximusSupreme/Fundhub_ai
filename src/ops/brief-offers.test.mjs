import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupByOfferFunnel,
  groupClosers,
  offerOf,
  funnelOf,
  displayName,
  readActivityByOffer,
  loadOfferNumbers,
  NO_OFFER,
  NO_PAGE,
  OTHER_PAGE,
  CASH_STATUSES
} from "./brief-offers.mjs";
import { marketingFromOfferNumbers, briefWindow } from "./morning-brief.mjs";

test("offer and funnel keys: unknown stays unknown, never guessed", () => {
  assert.equal(offerOf("slo"), "slo");
  assert.equal(offerOf(null), NO_OFFER);
  assert.equal(offerOf("  "), NO_OFFER);
  assert.equal(funnelOf("/watch"), "watch");
  assert.equal(funnelOf("/watch/?utm_content=7"), "watch");
  assert.equal(funnelOf("/roadmap-book"), "roadmap");
  assert.equal(funnelOf(null), NO_PAGE);
  assert.equal(funnelOf("/some-page"), OTHER_PAGE);
  assert.equal(displayName(NO_OFFER), "No offer label");
  assert.equal(displayName("slo"), "slo");
  // A real offer_key must match ^[a-z][a-z0-9_]{1,48}$ (migration 377), so a
  // sentinel can never collide with a real label.
  for (const k of [NO_OFFER, NO_PAGE, OTHER_PAGE]) assert.doesNotMatch(k, /^[a-z][a-z0-9_]{1,48}$/);
});

test("per offer → per funnel: numbers add up, spend stays per offer, unsplittable cash shows once under all offers", () => {
  const spend = [
    { offer_key: "slo", rows: 2, spend_cents: 40000 },
    { offer_key: null, rows: 1, spend_cents: 10000 },
    { offer_key: "climate", rows: 0, spend_cents: 0 } // no rows synced → not a $0 offer
  ];
  const activity = [
    { offer_key: "slo", landing_path: "/watch", metric: "lead", n: 4, cents: 0 },
    { offer_key: "slo", landing_path: "/roadmap", metric: "lead", n: 2, cents: 0 },
    { offer_key: "slo", landing_path: "/watch", metric: "booked", n: 3, cents: 0 },
    { offer_key: "slo", landing_path: "/watch", metric: "showed", n: 2, cents: 0 },
    { offer_key: "slo", landing_path: "/watch", metric: "no_show", n: 1, cents: 0 },
    { offer_key: "slo", landing_path: "/watch", metric: "sale", n: 1, cents: 0 },
    { offer_key: "slo", landing_path: "/watch", metric: "cash", n: 1, cents: 29700 },
    { offer_key: null, landing_path: null, metric: "lead", n: 1, cents: 0 },
    { offer_key: null, landing_path: null, metric: "cash_no_person", n: 2, cents: 20000 },
    { offer_key: null, landing_path: null, metric: "booked_no_person", n: 1, cents: 0 },
    { offer_key: "slo", landing_path: "/watch", metric: "nonsense", n: 99, cents: 0 }
  ];
  const g = groupByOfferFunnel(spend, activity);
  assert.deepEqual(g.offers.map((o) => o.name), ["slo", "No offer label"]);
  const slo = g.offers[0];
  assert.equal(slo.totals.spend_cents, 40000);
  assert.equal(slo.totals.leads, 6);
  assert.equal(slo.totals.cash_cents, 29700);
  assert.equal(slo.totals.close_rate, 0.5);
  assert.equal(slo.totals.roas, 0.74);
  assert.deepEqual(slo.funnels.map((f) => f.name), ["watch", "roadmap"]);
  assert.equal(slo.funnels[0].totals.booked, 3);
  assert.ok(!("spend_cents" in slo.funnels[0].totals), "a funnel never carries spend");
  assert.equal(g.offers[1].funnels[0].name, "No landing page");

  const all = g.all_offers;
  assert.equal(all.totals.spend_cents, 50000);
  assert.equal(all.totals.leads, 7);
  assert.equal(all.totals.cash_cents, 49700, "company cash includes the payments with no person");
  assert.equal(all.totals.booked, 4);
  const keys = all.not_split.map((n) => n.key);
  assert.deepEqual(keys, ["spend_by_funnel", "cash_no_person", "booked_no_person"]);
  assert.equal(all.not_split[1].value, 20000);
  for (const n of all.not_split) assert.ok(n.reason && n.reason.length > 10);
  // The unsplittable cash is NOT spread into any offer.
  assert.equal(g.offers.reduce((n, o) => n + o.totals.cash_cents, 0), 29700);
});

test("no spend rows at all: spend is unknown (null), never $0", () => {
  const g = groupByOfferFunnel([], [{ offer_key: "slo", landing_path: "/watch", metric: "lead", n: 1 }]);
  assert.equal(g.all_offers.totals.spend_cents, null);
  assert.equal(g.offers[0].totals.spend_cents, null);
  assert.equal(g.all_offers.totals.roas, null);
  assert.equal(g.all_offers.totals.cost_per_booked.cost_cents, null);
  assert.deepEqual(g.all_offers.not_split.map((n) => n.key), ["spend_by_funnel"]);
});

test("closers: per closer, then per offer, then per funnel, close rate = deposits ÷ held", () => {
  const rows = [
    { staff_id: "s2", name: "Casey", offer_key: "slo", landing_path: "/watch", calls_held: 3, no_shows: 1, deposits: 1, downsells: 0 },
    { staff_id: "s2", name: "Casey", offer_key: "slo", landing_path: "/roadmap", calls_held: 1, no_shows: 0, deposits: 1, downsells: 0 },
    { staff_id: "s2", name: "Casey", offer_key: null, landing_path: null, calls_held: 0, no_shows: 1, deposits: 0, downsells: 0 },
    { staff_id: "s1", name: "Alex", offer_key: "slo", landing_path: "/watch", calls_held: 2, no_shows: 0, deposits: 0, downsells: 1 }
  ];
  const c = groupClosers(rows);
  assert.deepEqual(c.map((p) => p.name), ["Alex", "Casey"]);
  const casey = c[1];
  assert.equal(casey.calls_held, 4);
  assert.equal(casey.no_shows, 2);
  assert.equal(casey.deposits, 2);
  assert.equal(casey.close_rate, 0.5);
  assert.deepEqual(casey.offers.map((o) => o.name), ["No offer label", "slo"]);
  const slo = casey.offers[1];
  assert.equal(slo.totals.calls_held, 4);
  assert.deepEqual(slo.funnels.map((f) => [f.name, f.totals.close_rate]), [["roadmap", 1], ["watch", 0.333]]);
  assert.equal(casey.offers[0].totals.close_rate, null, "no calls held → no rate, not 0");
});

test("cash counts the same statuses as the company cash number", async () => {
  let seen = null;
  const tx = { query: async (sql, params) => { seen = { sql, params }; return { rows: [] }; } };
  await readActivityByOffer(tx, { orgId: "o", from: "a", to: "b" });
  assert.deepEqual(seen.params[3], [...CASH_STATUSES]);
  assert.deepEqual([...CASH_STATUSES], ["paid", "succeeded", "complete", "completed"]);
  // An ad number shared by ads with different labels is not guessed.
  assert.match(seen.sql, /count\(DISTINCT v\.offer_key\) = 1/);
});

test("all reads run inside one staff scope", async () => {
  let scoped = 0;
  const tx = { query: async () => ({ rows: [] }) };
  const out = await loadOfferNumbers(null, {
    orgId: "o", day: "2026-10-04", from: "x", to: "y", briefDate: "2026-10-05",
    staffScope: async (fn) => { scoped += 1; return fn(tx); }
  });
  assert.equal(scoped, 1);
  assert.deepEqual(Object.keys(out), ["spend", "activity", "closers", "dying"]);
});

test("marketing section: all-offers headline line, offers, not_split and dying ads with their offer", () => {
  const window = briefWindow("morning", new Date("2026-10-05T13:00:00Z"));
  const m = marketingFromOfferNumbers({
    spend: [{ offer_key: "slo", rows: 1, spend_cents: 40000 }],
    activity: [{ offer_key: "slo", landing_path: "/watch", metric: "booked", n: 2 }],
    dying: [{ ad_id: "a1", ad_name: "SLO Ad 7", offer: "slo", offer_name: "slo" }]
  }, { window });
  assert.equal(m.offers.length, 1);
  assert.ok(m.all_offers.not_split.length >= 1);
  assert.match(m.ads_line, /^Ads and sales yesterday \(2026-10-04\), all offers: \$400\.00 spend, 0 new people, 2 booked/);
  assert.match(m.ads_line, /Most spend: slo \(\$400\.00\)\./);
  assert.equal(m.dying_line, "Dying ads: 1 — SLO Ad 7 (slo). Change the opening line.");
});
