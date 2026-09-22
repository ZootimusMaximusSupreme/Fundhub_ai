// GET/POST /api/public/slo-checkout — $297 SLO till.
// PURE UNIT TEST, NO DATABASE. npm test's glob is src/** only.

import { test } from "node:test";
import assert from "node:assert/strict";
import handler, {
  parseSloCheckoutBody,
  runSloCheckout,
  sloPageConfig
} from "../../api/public/slo-checkout.mjs";
import {
  SLO_KEEP_TITLE,
  SLO_PRICE_CENTS,
  SLO_PULL_PATH,
  SLO_SOURCE,
  sloPullSuccessUrl
} from "../slo/offer.mjs";

const LIVE_ENV = { FANBASIS_CHECKOUT_API_KEY: "test-key", PUBLIC_BASE_URL: "https://fundhub.ai" };
const DEAD_ENV = {};

function fakeRes() {
  const res = {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  return res;
}

test("GET states $297 and the pull path, and no earnings figure", () => {
  const page = sloPageConfig(LIVE_ENV);
  assert.equal(page.priceCents, SLO_PRICE_CENTS);
  assert.equal(page.priceCents, 29700);
  assert.equal(page.next, SLO_PULL_PATH);
  assert.equal(page.checkout.ready, true);
  const blob = JSON.stringify(page);
  assert.equal(blob.includes("earn"), false);
  assert.equal(blob.includes("income"), false);
});

test("parseSloCheckoutBody needs a real email", () => {
  assert.equal(parseSloCheckoutBody(null).error, "invalid_json");
  assert.equal(parseSloCheckoutBody({}).error, "email_required");
  assert.equal(parseSloCheckoutBody({ email: "not-an-email" }).error, "email_required");
  const ok = parseSloCheckoutBody({ email: "Pat@Example.com", first_name: "Pat", last_name: "Lee" });
  assert.equal(ok.ok, true);
  assert.equal(ok.email, "pat@example.com");
  assert.equal(ok.name, "Pat Lee");
  assert.equal(ok.attribution, null);
});

test("parseSloCheckoutBody keeps Creative Factory UTMs and drops junk", () => {
  const ok = parseSloCheckoutBody({
    email: "buyer@example.com",
    utm_source: "fb",
    utm_medium: "paid",
    utm_campaign: "funding600",
    utm_content: "42-ringlights",
    utm_term: "sun",
    landing_path: "/roadmap/",
    referrer_domain: "l.facebook.com",
    fbclid: "DROPME"
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.attribution, {
    utm_source: "fb",
    utm_medium: "paid",
    utm_campaign: "funding600",
    utm_content: "42-ringlights",
    utm_term: "sun",
    landing_path: "/roadmap/",
    referrer_domain: "l.facebook.com"
  });
});

function sloDeps(over = {}) {
  const links = [];
  return {
    env: LIVE_ENV,
    orgId: "org-1",
    db: { query() { throw new Error("slo checkout must not query through the runner"); } },
    resolveBuyer: async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ensureAccount: async () => "acct-1",
    resolveProduct: async () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    recordLink: async (_db, row) => { links.push(row); return { id: "pl-1" }; },
    stampSlo: async () => {},
    emit: async () => ({ id: "evt-1" }),
    checkoutConfig: () => ({ ok: true }),
    links,
    ...over
  };
}

test("runSloCheckout mints Assessment at $297 and sends them to the pull form", async () => {
  const sent = [];
  const events = [];
  const deps = sloDeps({
    ref: "slo_test_ref_1",
    emit(_db, name, payload) {
      events.push({ name, payload });
      return { id: "evt-1" };
    },
    createCheckoutSession: async (opts) => {
      sent.push(opts);
      return { ok: true, paymentLink: "https://pay.example.test/slo", productId: "cs_slo_1" };
    }
  });
  const out = await runSloCheckout({ email: "buyer@example.com", name: "Pat Lee" }, deps);

  assert.equal(out.ok, true);
  assert.equal(out.checkoutUrl, "https://pay.example.test/slo");
  assert.equal(out.ref, "slo_test_ref_1");
  assert.equal(out.next, SLO_PULL_PATH);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].amountCents, 29700);
  assert.equal(sent[0].productTitle, SLO_KEEP_TITLE);
  assert.equal(sent[0].productTitle, "Consulting Services Assessment");
  assert.equal(sent[0].successUrl, "https://fundhub.ai/roadmap/pull.html");
  assert.equal(sent[0].metadata.source, SLO_SOURCE);
  assert.equal(sent[0].metadata.link_ref, "slo_test_ref_1");
  assert.equal(sent[0].metadata.client_id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(events[0].name, "slo.checkout_started");
  assert.equal(events[0].payload.email, "buyer@example.com");
  assert.equal(deps.links[0].ref, "slo_test_ref_1");
  assert.equal(deps.links[0].clientId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(deps.links[0].commasSessionId, "cs_slo_1");
});

test("runSloCheckout writes a diagnostic payment link so the UnderwriteIQ pull fires", async () => {
  const deps = sloDeps({
    ref: "slo_wire_1",
    createCheckoutSession: async () => ({ ok: true, paymentLink: "https://pay.example.test/slo" })
  });
  const out = await runSloCheckout({ email: "buyer@example.com", name: "Pat Lee" }, deps);
  assert.equal(out.ok, true);
  assert.equal(deps.links.length, 1);
  assert.equal(deps.links[0].amountCents, 29700);
  assert.equal(deps.links[0].ref, "slo_wire_1");
});

test("runSloCheckout writes ad tags onto the buyer, first touch, no email guess beyond find-or-create", async () => {
  const attrCalls = [];
  const fieldCalls = [];
  const parsed = parseSloCheckoutBody({
    email: "buyer@example.com",
    utm_content: "42-ringlights",
    utm_source: "fb"
  });
  const out = await runSloCheckout(parsed, sloDeps({
    createCheckoutSession: async () => ({ ok: true, paymentLink: "https://pay.example.test/slo" }),
    upsertAttribution: async (_db, row) => { attrCalls.push(row); return row; },
    mergeFields: async (_db, clientId, patch) => { fieldCalls.push({ clientId, patch }); }
  }));
  assert.equal(out.ok, true);
  assert.equal(attrCalls.length, 1);
  assert.equal(attrCalls[0].clientId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(attrCalls[0].attribution.utm_content, "42-ringlights");
  assert.equal(attrCalls[0].attribution.utm_source, "fb");
  assert.equal(fieldCalls[0].patch.utm_content, "42-ringlights");
});

test("runSloCheckout does not mint a new catalog title", async () => {
  let title = null;
  await runSloCheckout(
    { email: "buyer@example.com", name: null },
    sloDeps({
      createCheckoutSession: async (opts) => {
        title = opts.productTitle;
        return { ok: true, paymentLink: "https://pay.example.test/slo" };
      }
    })
  );
  assert.equal(title, "Consulting Services Assessment");
  assert.equal(/slo|diagnostic pack|funding diagnostic/i.test(title), false);
});

test("runSloCheckout refuses when Commas is off", async () => {
  const out = await runSloCheckout(
    { email: "buyer@example.com", name: null },
    { env: DEAD_ENV, orgId: "org-1", checkoutConfig: () => ({ ok: false }) }
  );
  assert.equal(out.ok, false);
  assert.equal(out.error, "checkout_not_configured");
});

test("POST without email is 400; GET is 200", async () => {
  const bad = fakeRes();
  await handler({ method: "POST", body: {} }, bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.error, "email_required");

  const get = fakeRes();
  await handler({ method: "GET" }, get);
  assert.equal(get.statusCode, 200);
  assert.equal(get.body.priceCents, 29700);
});

test("sloPullSuccessUrl never puts SSN or amount on the address", () => {
  const url = sloPullSuccessUrl(LIVE_ENV);
  assert.equal(url, "https://fundhub.ai/roadmap/pull.html");
  assert.equal(url.includes("ssn"), false);
  assert.equal(url.includes("297"), false);
});

/* ── The /roadmap widget (owner-set 2026-09-22) ──────────────────────────── */

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-09-22T12:00:00Z");

function business(over = {}) {
  return {
    name: "Acme Holdings LLC",
    address: "200 Commerce St",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    started: "03/2021",
    ...over
  };
}

test("DEMO: records the order stamped demo, never calls Commas, answers ref + client_id", async () => {
  let minted = 0;
  const events = [];
  const stamps = [];
  const deps = sloDeps({
    env: { SLO_DEMO_PAY: "1" }, // no Commas key at all: demo must not need one
    ref: "slo_demo_1",
    checkoutConfig: () => ({ ok: false }),
    createCheckoutSession: async () => { minted += 1; return { ok: true, paymentLink: "x" }; },
    emit: async (_db, name, payload) => { events.push({ name, payload }); return { id: "e" }; },
    stampSlo: async (_db, clientId, ref, opts) => { stamps.push({ clientId, ref, opts }); }
  });
  const out = await runSloCheckout({ email: "buyer@example.com", name: "Pat Lee", businesses: 1 }, deps);

  assert.equal(minted, 0, "Commas is never called in demo");
  assert.deepEqual(
    { ok: out.ok, demo: out.demo, ref: out.ref, client_id: out.client_id, priceCents: out.priceCents },
    { ok: true, demo: true, ref: "slo_demo_1", client_id: CLIENT, priceCents: 29700 }
  );
  assert.equal(out.checkoutUrl, undefined);
  assert.equal(deps.links.length, 1);
  assert.equal(deps.links[0].isDemo, true);
  assert.equal(deps.links[0].amountCents, 29700);
  assert.equal(deps.links[0].ref, "slo_demo_1");
  assert.equal(events[0].name, "slo.checkout_started");
  assert.equal(events[0].payload.demo, true);
  assert.equal(stamps[0].ref, "slo_demo_1");
});

test("DEMO off: the real path is unchanged — Assessment title, Commas URL, client_id returned", async () => {
  const sent = [];
  const deps = sloDeps({
    ref: "slo_live_1",
    createCheckoutSession: async (opts) => {
      sent.push(opts);
      return { ok: true, paymentLink: "https://pay.example.test/slo", productId: "cs_1" };
    }
  });
  const out = await runSloCheckout({ email: "buyer@example.com", name: null, businesses: 1 }, deps);
  assert.equal(out.ok, true);
  assert.equal(out.demo, false);
  assert.equal(out.checkoutUrl, "https://pay.example.test/slo");
  assert.equal(out.client_id, CLIENT);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].productTitle, "Consulting Services Assessment");
  assert.equal(deps.links[0].isDemo, undefined);
});

test("SLO_DEMO_PAY only turns on for exactly '1'", async () => {
  for (const value of ["0", "true", "yes", " ", "", undefined]) {
    let minted = 0;
    await runSloCheckout({ email: "buyer@example.com", name: null }, sloDeps({
      env: { ...LIVE_ENV, SLO_DEMO_PAY: value },
      createCheckoutSession: async () => { minted += 1; return { ok: true, paymentLink: "https://p" }; }
    }));
    assert.equal(minted, 1, `SLO_DEMO_PAY=${JSON.stringify(value)} must be the real path`);
  }
});

test("businesses: first free, $15 each extra, from a list or from a count", async () => {
  const fromList = parseSloCheckoutBody({
    email: "buyer@example.com",
    businesses: [business(), business({ name: "Beta Co" }), business({ name: "Gamma Co" })]
  }, { now: NOW });
  assert.equal(fromList.ok, true, JSON.stringify(fromList.errors));
  assert.equal(fromList.businesses, 3);
  assert.equal(fromList.businessRows.length, 3);

  const fromCount = parseSloCheckoutBody({ email: "buyer@example.com", business_count: 2 });
  assert.equal(fromCount.businesses, 2);
  assert.equal(fromCount.businessRows, null);

  const none = parseSloCheckoutBody({ email: "buyer@example.com", businesses: [] });
  assert.equal(none.businesses, 1, "the base price includes the first business");

  let amount = null;
  const stored = [];
  const out = await runSloCheckout(fromList, sloDeps({
    env: { SLO_DEMO_PAY: "1" },
    replaceBusinesses: async (_db, args) => { stored.push(args); }
  }));
  amount = out.priceCents;
  assert.equal(amount, 29700 + 1500 * 2);
  assert.equal(out.priceDisplay, "$327");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].businesses.length, 3);
  assert.equal(stored[0].clientId, CLIENT);
});

test("a count sends no list, so stored businesses are left alone", async () => {
  let replaced = 0;
  await runSloCheckout(
    parseSloCheckoutBody({ email: "buyer@example.com", business_count: 2 }),
    sloDeps({ env: { SLO_DEMO_PAY: "1" }, replaceBusinesses: async () => { replaced += 1; } })
  );
  assert.equal(replaced, 0);
});

test("field errors come back as errors[{field, code, message}]", async () => {
  const bad = parseSloCheckoutBody({
    email: "nope",
    businesses: [business({ name: "", zip: "1" })]
  }, { now: NOW });
  assert.equal(bad.ok, false);
  const fields = bad.errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ["businesses.0.name", "businesses.0.zip", "email"]);
  for (const e of bad.errors) assert.equal(typeof e.message, "string");

  assert.equal(parseSloCheckoutBody({ email: "a@b.co", business_count: 0 }).errors[0].field, "business_count");
  assert.equal(parseSloCheckoutBody({ email: "a@b.co", business_count: 21 }).error, "businesses_invalid");

  const res = fakeRes();
  await handler({ method: "POST", headers: {}, body: { email: "nope" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.errors[0].field, "email");
});

test("return_url: an allow-listed https page becomes the Commas success page; anything else is ignored", async () => {
  const good = parseSloCheckoutBody({ email: "buyer@example.com", return_url: "https://apply.fundhub.ai/roadmap" });
  assert.equal(good.returnUrl, "https://apply.fundhub.ai/roadmap");
  const evil = parseSloCheckoutBody({ email: "buyer@example.com", return_url: "https://evil.example/x" });
  assert.equal(evil.returnUrl, null);

  const sent = [];
  await runSloCheckout(good, sloDeps({
    createCheckoutSession: async (opts) => { sent.push(opts); return { ok: true, paymentLink: "https://p" }; }
  }));
  assert.equal(sent[0].successUrl, "https://apply.fundhub.ai/roadmap");

  await runSloCheckout(evil, sloDeps({
    createCheckoutSession: async (opts) => { sent.push(opts); return { ok: true, paymentLink: "https://p" }; }
  }));
  assert.equal(sent[1].successUrl, "https://fundhub.ai/roadmap/pull.html");
});

test("GET says whether this is demo pay, and demo checkout counts as ready", async () => {
  const demo = sloPageConfig({ SLO_DEMO_PAY: "1" });
  assert.equal(demo.demo, true);
  assert.equal(demo.checkout.ready, true);
  assert.match(demo.notices.charge, /not charged/);
  const live = sloPageConfig(LIVE_ENV);
  assert.equal(live.demo, false);
  assert.match(live.notices.charge, /\$297/);
  const dead = sloPageConfig(DEAD_ENV);
  assert.equal(dead.checkout.ready, false);
});

test("POST from the widget carries the Allow-Origin header back", async () => {
  const res = fakeRes();
  await handler({ method: "POST", headers: { origin: "https://apply.fundhub.ai" }, body: {} }, res);
  assert.equal(res.headers["access-control-allow-origin"], "https://apply.fundhub.ai");
  assert.equal(res.statusCode, 400);
});
