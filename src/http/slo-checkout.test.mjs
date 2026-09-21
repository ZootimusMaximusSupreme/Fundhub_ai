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
