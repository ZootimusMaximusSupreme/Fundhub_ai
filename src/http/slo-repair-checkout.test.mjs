// POST /api/public/slo-repair-checkout — the repair plan picked in the widget.
// Pure unit test, no database. Prices and titles come from src/config/offers.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import handler, { parseSloRepairCheckoutBody } from "../../api/public/slo-repair-checkout.mjs";
import { runSloRepairCheckout, sloRepairPlans } from "../slo/repair-offer.mjs";
import { OFFERS } from "../config/offers.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REF = "slo_0123456789abcdef01234567";

const REPAIR_DONE = { ok: true, state: "done", bucket: "repair" };
const FOUND = { id: CLIENT, org_id: ORG, order_is_demo: false };

function fakeRes() {
  return {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

async function post(body, deps = {}, headers = {}) {
  const res = fakeRes();
  await handler({ method: "POST", headers, body }, res, deps);
  return res;
}

test("plans are the catalogue's REPAIR_TRIAL $200 and REPAIR_DFY $1,000", () => {
  assert.deepEqual(sloRepairPlans(), [
    { key: "REPAIR_TRIAL", name: OFFERS.REPAIR_TRIAL.name, price_cents: 20000, display: "$200" },
    { key: "REPAIR_DFY", name: OFFERS.REPAIR_DFY.name, price_cents: 100000, display: "$1,000" }
  ]);
});

test("body: ref + client_id + one of the two plans", () => {
  assert.equal(parseSloRepairCheckoutBody(null).error, "invalid_json");
  assert.equal(parseSloRepairCheckoutBody({ client_id: CLIENT, plan: "REPAIR_DFY" }).error, "ref_required");
  assert.equal(parseSloRepairCheckoutBody({ ref: REF, client_id: "x", plan: "REPAIR_DFY" }).error, "client_required");
  const bad = parseSloRepairCheckoutBody({ ref: REF, client_id: CLIENT, plan: "FUNDING_DFY" });
  assert.equal(bad.error, "plan_invalid");
  assert.equal(bad.errors[0].field, "plan");
  assert.equal(parseSloRepairCheckoutBody({ ref: REF, client_id: CLIENT, plan: "repair_trial" }).plan, "REPAIR_TRIAL");
});

test("GET is 405", async () => {
  const res = fakeRes();
  await handler({ method: "GET", headers: {} }, res, {});
  assert.equal(res.statusCode, 405);
});

test("unknown ref + client pair is 404", async () => {
  const res = await post(
    { ref: REF, client_id: CLIENT, plan: "REPAIR_DFY" },
    { db: {}, findOrder: async () => null, loadStatus: async () => { throw new Error("must not read"); } }
  );
  assert.equal(res.statusCode, 404);
});

test("refused unless the pull is done AND the buyer is on the repair path", async () => {
  for (const status of [
    { state: "running", bucket: null },
    { state: "done", bucket: "funding" },
    { state: "done", bucket: null },
    { state: "failed", bucket: null }
  ]) {
    let minted = 0;
    const res = await post(
      { ref: REF, client_id: CLIENT, plan: "REPAIR_DFY" },
      {
        db: {},
        env: {},
        findOrder: async () => FOUND,
        loadStatus: async () => status,
        createPaymentLink: async () => { minted += 1; return {}; },
        recordDemoLink: async () => { minted += 1; }
      }
    );
    assert.equal(res.statusCode, 409, JSON.stringify(status));
    assert.equal(res.body.error, "not_offered");
    assert.equal(minted, 0);
  }
});

test("DEMO: records a demo row at the catalogue price, never calls Commas", async () => {
  const demoRows = [];
  const events = [];
  const res = await post(
    { ref: REF, client_id: CLIENT, plan: "REPAIR_TRIAL" },
    {
      db: {},
      env: { SLO_DEMO_PAY: "1" },
      findOrder: async () => FOUND,
      loadStatus: async () => REPAIR_DONE,
      newLinkRef: () => "pl_demo_1",
      resolveProduct: async (_db, orgId, code) => { assert.equal(code, "repair-trial"); return "prod-1"; },
      recordDemoLink: async (_db, row) => { demoRows.push(row); },
      createPaymentLink: async () => { throw new Error("Commas must not be called in demo"); },
      emit: async (_db, name, payload) => { events.push({ name, payload }); return { id: "e" }; }
    },
    { origin: "https://apply.fundhub.ai" }
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true, demo: true, plan: "REPAIR_TRIAL", price_cents: 20000, price_display: "$200"
  });
  assert.equal(res.headers["access-control-allow-origin"], "https://apply.fundhub.ai");
  assert.equal(demoRows[0].amountCents, 20000);
  assert.equal(demoRows[0].purpose, "repair");
  assert.equal(demoRows[0].productId, "prod-1");
  assert.equal(events[0].name, "slo.repair_checkout_started");
  assert.equal(events[0].payload.demo, true);
});

test("a demo diagnostic order keeps the repair choice demo even with demo pay off", async () => {
  let minted = 0;
  const out = await runSloRepairCheckout(
    { found: { ...FOUND, order_is_demo: true }, status: REPAIR_DONE, plan: "REPAIR_DFY", orderRef: REF },
    {
      db: {},
      env: {},
      newLinkRef: () => "pl_demo_2",
      resolveProduct: async () => null,
      recordDemoLink: async () => {},
      createPaymentLink: async () => { minted += 1; return {}; },
      emit: async () => ({ id: "e" })
    }
  );
  assert.equal(out.demo, true);
  assert.equal(minted, 0);
});

test("LIVE: Commas link at the catalogue price with the existing Consulting Services title", async () => {
  const minted = [];
  const sent = [];
  const res = await post(
    { ref: REF, client_id: CLIENT, plan: "REPAIR_DFY" },
    {
      db: {},
      env: { FANBASIS_CHECKOUT_API_KEY: "test-key" },
      findOrder: async () => FOUND,
      loadStatus: async () => REPAIR_DONE,
      createPaymentLink: async (_db, args) => {
        minted.push(args);
        return { id: "pl-1", link_ref: "pl_live_1", checkout_url: "https://pay.example.test/repair" };
      },
      markSent: async (_db, args) => { sent.push(args); return {}; },
      emit: async () => ({ id: "e" })
    }
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    demo: false,
    checkoutUrl: "https://pay.example.test/repair",
    plan: "REPAIR_DFY",
    price_cents: 100000,
    price_display: "$1,000"
  });
  assert.equal(minted[0].amountCents, 100000);
  assert.equal(minted[0].commasProductTitle, "Consulting Services Standard");
  assert.equal(minted[0].productCode, "repair-bundle");
  assert.equal(minted[0].purpose, "repair");
  assert.equal(minted[0].orgId, ORG);
  assert.equal(minted[0].clientId, CLIENT);
  assert.equal(/credit|repair|dispute/i.test(minted[0].commasProductTitle), false, "no credit words to Commas");
  assert.deepEqual(sent[0], { id: "pl-1", orgId: ORG });
});

test("LIVE trial uses 'Consulting Services Trial'", async () => {
  const minted = [];
  await runSloRepairCheckout(
    { found: FOUND, status: REPAIR_DONE, plan: "REPAIR_TRIAL", orderRef: REF },
    {
      db: {},
      env: { FANBASIS_CHECKOUT_API_KEY: "test-key" },
      createPaymentLink: async (_db, args) => { minted.push(args); return { id: "x", link_ref: "y", checkout_url: "https://p" }; },
      markSent: async () => ({}),
      emit: async () => ({ id: "e" })
    }
  );
  assert.equal(minted[0].commasProductTitle, "Consulting Services Trial");
  assert.equal(minted[0].amountCents, 20000);
});

test("LIVE with Commas off: 503, nothing minted", async () => {
  const res = await post(
    { ref: REF, client_id: CLIENT, plan: "REPAIR_DFY" },
    {
      db: {},
      env: {},
      findOrder: async () => FOUND,
      loadStatus: async () => REPAIR_DONE,
      createPaymentLink: async () => { throw new Error("must not mint"); }
    }
  );
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "checkout_not_configured");
});
