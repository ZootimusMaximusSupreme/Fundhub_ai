import { test } from "node:test";
import assert from "node:assert/strict";
import { CURRENT_SOFT_PULL_VERSION } from "../consent/disclosures.mjs";
import { parseSloPullBody, runSloPull } from "./pull.mjs";

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REF = "slo_0123456789abcdef01234567";

function validBody(over = {}) {
  return {
    ref: REF,
    client_id: CLIENT,
    first_name: "Ada",
    last_name: "Byron",
    dob: "1990-01-02",
    ssn: "987-65-4321",
    address: "100 Test Ave",
    city: "Denton",
    state: "tx",
    zip: "76205",
    consent: true,
    ...over
  };
}

test("parseSloPullBody requires the matching ref + client_id pair", () => {
  const ok = parseSloPullBody(validBody());
  assert.equal(ok.ok, true);
  assert.equal(ok.clientId, CLIENT);
  assert.equal(ok.ref, REF);
  assert.equal(ok.ssn, "987654321");
  assert.equal(ok.address.state, "TX");
});

test("parseSloPullBody refuses a naked client_id", () => {
  const got = parseSloPullBody(validBody({ ref: "" }));
  assert.equal(got.ok, false);
  assert.equal(got.error, "ref_required");
});

test("parseSloPullBody refuses a missing consent tick", () => {
  const got = parseSloPullBody(validBody({ consent: false }));
  assert.equal(got.ok, false);
  assert.equal(got.error, "consent_required");
});

test("parseSloPullBody does not take consent text from the body", () => {
  const got = parseSloPullBody(validBody({ consent_text: "I made this up" }));
  assert.equal(got.ok, true);
  assert.equal(got.consentText, undefined);
});

test("runSloPull 404s when the ref is not on that client", async () => {
  const result = await runSloPull(parseSloPullBody(validBody()), {
    db: { query: async () => ({ rows: [] }) },
    emit: async () => { throw new Error("must not emit"); }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "not_found");
});

test("runSloPull stores identity, captures server consent, emits diagnostic.paid", async () => {
  const calls = { identity: null, consent: null, emit: null };
  const result = await runSloPull(parseSloPullBody(validBody()), {
    db: {
      async query(sql) {
        if (/FROM clients c/.test(sql)) {
          return { rows: [{ id: CLIENT, org_id: ORG, email: "ada@example.com" }] };
        }
        if (/UPDATE clients/.test(sql)) return { rows: [] };
        return { rows: [] };
      }
    },
    ensureAccount: async () => ACCOUNT,
    storeIdentity: async (_db, args) => { calls.identity = args; },
    captureConsent: async (_db, args) => { calls.consent = args; },
    emit: async (_db, name, payload, opts) => {
      calls.emit = { name, payload, opts };
      return { id: "evt-1" };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(calls.identity.ssn, "987654321");
  assert.equal(calls.identity.dob, "1990-01-02");
  assert.equal(calls.consent.consentVersion, CURRENT_SOFT_PULL_VERSION);
  assert.match(calls.consent.consentText, /soft inquiry/i);
  assert.equal(calls.consent.captureMethod, "checkbox");
  assert.equal(calls.emit.name, "diagnostic.paid");
  assert.equal(calls.emit.opts.clientId, CLIENT);
  assert.equal(calls.emit.opts.idempotencyKey, `slo-pull:${REF}`);
  assert.equal(JSON.stringify(calls.emit.payload).includes("987654321"), false);
  assert.equal(JSON.stringify(calls.emit).includes("ssn"), false);
});

/* ── The /roadmap widget (owner-set 2026-09-22) ──────────────────────────── */

function orderDb(order = {}) {
  return {
    async query(sql) {
      if (/FROM clients c/.test(sql)) {
        return { rows: [{ id: CLIENT, org_id: ORG, email: "ada@example.com", slo_ref: REF, ...order }] };
      }
      return { rows: [] };
    }
  };
}

function spyDeps(over = {}) {
  const calls = { identity: 0, consent: 0, emit: [], demo: [], businesses: 0 };
  return {
    calls,
    deps: {
      ensureAccount: async () => ACCOUNT,
      storeIdentity: async () => { calls.identity += 1; },
      captureConsent: async (_db, args) => { calls.consent += 1; calls.consentKind = args.kind; },
      replaceBusinesses: async () => { calls.businesses += 1; },
      mergeFields: async () => {},
      emit: async (_db, name, payload, opts) => { calls.emit.push({ name, payload, opts }); return { id: "e" }; },
      startDemoPull: async (_db, args) => { calls.demo.push(args); return { requestId: "spr-1", pulled: true }; },
      ...over
    }
  };
}

test("defer_pull on a real unpaid order: identity + consent stored, NO pull, NO event", async () => {
  const { calls, deps } = spyDeps();
  const out = await runSloPull(
    parseSloPullBody(validBody({ defer_pull: true })),
    { db: orderDb({ order_is_demo: false, order_status: "sent" }), env: {}, ...deps }
  );
  assert.equal(out.ok, true);
  assert.equal(out.deferred, true);
  assert.equal(out.pull_requested, false);
  assert.equal(out.next, "pay");
  assert.equal(calls.identity, 1);
  assert.equal(calls.consent, 1);
  assert.equal(calls.consentKind, "soft_pull_consent", "the kind C-00's consent gate reads");
  assert.equal(calls.emit.length, 0);
  assert.equal(calls.demo.length, 0);
});

test("defer_pull on an order that is ALREADY paid starts the pull now", async () => {
  const { calls, deps } = spyDeps();
  const out = await runSloPull(
    parseSloPullBody(validBody({ defer_pull: true })),
    { db: orderDb({ order_is_demo: false, order_status: "paid" }), env: {}, ...deps }
  );
  assert.equal(out.deferred, false);
  assert.equal(calls.emit.length, 1);
  assert.equal(calls.emit[0].name, "diagnostic.paid");
});

test("DEMO order with demo on: the pull starts now, with NO diagnostic.paid (no money event)", async () => {
  const { calls, deps } = spyDeps();
  const out = await runSloPull(
    parseSloPullBody(validBody({ defer_pull: true })),
    { db: orderDb({ order_is_demo: true, order_status: "created" }), env: { SLO_DEMO_PAY: "1" }, ...deps }
  );
  assert.equal(out.ok, true);
  assert.equal(out.demo, true);
  assert.equal(out.deferred, false);
  assert.equal(out.pull_requested, true);
  assert.equal(calls.emit.length, 0, "diagnostic.paid would book a sale for a demo order");
  assert.equal(calls.demo.length, 1);
  assert.deepEqual(
    { orgId: calls.demo[0].orgId, clientId: calls.demo[0].clientId, ref: calls.demo[0].ref },
    { orgId: ORG, clientId: CLIENT, ref: REF }
  );
  assert.equal(calls.consent, 1, "consent is captured before the pull starts");
});

test("DEMO order after demo is switched OFF: refused before anything is stored", async () => {
  const { calls, deps } = spyDeps();
  const out = await runSloPull(
    parseSloPullBody(validBody()),
    { db: orderDb({ order_is_demo: true, order_status: "created" }), env: {}, ...deps }
  );
  assert.equal(out.ok, false);
  assert.equal(out.error, "order_not_paid");
  assert.equal(calls.identity, 0);
  assert.equal(calls.consent, 0);
  assert.equal(calls.emit.length, 0);
  assert.equal(calls.demo.length, 0);
});

test("a demo pull that throws still answers ok; the widget reads the outcome from slo-status", async () => {
  const { deps } = spyDeps({ startDemoPull: async () => { throw new Error("CRS down"); } });
  const errors = console.error;
  console.error = () => {};
  try {
    const out = await runSloPull(
      parseSloPullBody(validBody()),
      { db: orderDb({ order_is_demo: true }), env: { SLO_DEMO_PAY: "1" }, ...deps }
    );
    assert.equal(out.ok, true);
    assert.equal(out.pull_requested, false);
  } finally {
    console.error = errors;
  }
});

test("startSloDemoPull runs C-00's handle with a demo event, never through the bus", async () => {
  const { startSloDemoPull } = await import("./pull.mjs");
  const seen = [];
  const out = await startSloDemoPull({}, { orgId: ORG, clientId: CLIENT, ref: REF, env: {} }, {
    run: async (args) => { seen.push(args); return { done: true, requestId: "spr-9" }; }
  });
  assert.equal(out.requestId, "spr-9");
  assert.equal(seen[0].event.id, `slo-demo:${REF}`);
  assert.equal(seen[0].event.orgId, ORG);
  assert.equal(seen[0].event.clientId, CLIENT);
  assert.equal(seen[0].event.payload.demo, true);
  assert.equal(await seen[0].step.run("x", async () => 7), 7);
});

test("no businesses key: stored businesses are left alone; a list replaces them", async () => {
  const a = spyDeps();
  await runSloPull(parseSloPullBody(validBody()), { db: orderDb(), env: {}, ...a.deps });
  assert.equal(a.calls.businesses, 0);

  const b = spyDeps();
  const out = await runSloPull(parseSloPullBody(validBody({
    businesses: [{ name: "Acme LLC", address: "1 Main St", city: "Dallas", state: "TX", zip: "75201", started: "01/2020" }]
  })), { db: orderDb(), env: {}, ...b.deps });
  assert.equal(b.calls.businesses, 1);
  assert.equal(out.businesses.submitted, 1);
});

test("identity fields: middle name, suffix, apt and a previous address ride through", () => {
  const got = parseSloPullBody(validBody({
    middle_name: "Augusta",
    suffix: "jr.",
    apt: "4b",
    moved_recently: true,
    prev_address: "9 Old Rd",
    prev_city: "Austin",
    prev_state: "TX",
    prev_zip: "73301"
  }));
  assert.equal(got.ok, true, JSON.stringify(got.errors));
  assert.equal(got.middleName, "Augusta");
  assert.equal(got.suffix, "JR");
  assert.equal(got.address.addressLine2, "4B");
  assert.equal(got.addresses.length, 2);
  assert.equal(got.addresses[1].residency, "previous");
});

test("moved in the last 2 years: the previous address is required, each box named", () => {
  const got = parseSloPullBody(validBody({ moved_recently: true }));
  assert.equal(got.ok, false);
  const fields = got.errors.map((e) => e.field);
  for (const f of ["prev_address", "prev_city", "prev_state", "prev_zip"]) assert.ok(fields.includes(f), f);
});

test("every refusal lists each bad box; a P.O. box is only a warning", () => {
  const bad = parseSloPullBody(validBody({ first_name: "", dob: "2015-01-01", ssn: "12", address: "Main St" }));
  assert.equal(bad.ok, false);
  const fields = bad.errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ["address", "dob", "first_name", "ssn"]);
  for (const e of bad.errors) {
    assert.equal(typeof e.field, "string");
    assert.equal(typeof e.message, "string");
  }
  const po = parseSloPullBody(validBody({ address: "PO Box 9" }));
  assert.equal(po.ok, true);
  assert.equal(po.warnings[0].code, "po_box");
  const devil = parseSloPullBody(validBody({ ssn: "666-32-1120" }));
  assert.equal(devil.ok, true, "666 is not blocked");
});
