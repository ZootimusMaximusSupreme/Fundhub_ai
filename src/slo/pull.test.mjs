import { test } from "node:test";
import assert from "node:assert/strict";
import { CURRENT_SOFT_PULL_VERSION } from "../consent/disclosures.mjs";
import {
  EXISTING_ACCOUNT_MESSAGE,
  businessesPaidFor,
  findSloOrder,
  parseSloPullBody,
  runSloPull
} from "./pull.mjs";
import { nextSloPullAttempt } from "./status.mjs";
import { sloClientPriorFile } from "./buyer.mjs";

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REF = "slo_0123456789abcdef01234567";
const ORDER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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

test("runSloPull on a PAID order stores identity, captures server consent, emits diagnostic.paid", async () => {
  const calls = { identity: null, consent: null, emit: null };
  const result = await runSloPull(parseSloPullBody(validBody()), {
    db: {
      async query(sql) {
        if (/FROM payment_links pl/.test(sql)) {
          return { rows: [{ id: CLIENT, org_id: ORG, email: "ada@example.com", order_id: ORDER, order_ref: REF, order_is_demo: false, order_status: "paid" }] };
        }
        return { rows: [] };
      }
    },
    env: {},
    checkAddresses: async () => [],
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
  assert.equal(calls.emit.opts.idempotencyKey, `slo-pull:${REF}:1`);
  assert.equal(JSON.stringify(calls.emit.payload).includes("987654321"), false);
  assert.equal(JSON.stringify(calls.emit).includes("ssn"), false);
});

/* ── The /roadmap widget (owner-set 2026-09-22) ──────────────────────────── */

function orderDb(order = {}) {
  const writes = [];
  return {
    writes,
    async query(sql, params) {
      if (/FROM payment_links pl/.test(sql)) {
        return { rows: [{ id: CLIENT, org_id: ORG, email: "ada@example.com", order_id: ORDER, order_ref: REF, ...order }] };
      }
      if (/UPDATE|INSERT|DELETE/i.test(sql)) writes.push({ sql, params });
      return { rows: [] };
    }
  };
}

function spyDeps(over = {}) {
  const calls = { identity: 0, consent: 0, emit: [], demo: [], businesses: 0, stamp: 0, mark: 0, addressChecks: 0 };
  return {
    calls,
    deps: {
      priorFile: async () => ({ identity: false, paid: false }),
      checkAddresses: async () => { calls.addressChecks += 1; return []; },
      orderPulls: async () => [],
      stampSlo: async () => { calls.stamp += 1; },
      markIdentity: async () => { calls.mark += 1; },
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

function nothingWritten(calls, db) {
  assert.equal(calls.identity, 0, "no identity");
  assert.equal(calls.consent, 0, "no consent");
  assert.equal(calls.stamp, 0, "no slo_ref stamp");
  assert.equal(calls.mark, 0, "no order identity mark");
  assert.equal(calls.businesses, 0, "no businesses");
  assert.equal(calls.emit.length, 0, "no diagnostic.paid");
  assert.equal(calls.demo.length, 0, "no demo pull");
  if (db) assert.deepEqual(db.writes, [], "no SQL write");
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

test("item 1: a LIVE UNPAID order WITHOUT defer_pull is deferred — no diagnostic.paid, no pull", async () => {
  for (const status of ["sent", "created", "expired", undefined]) {
    const { calls, deps } = spyDeps();
    const out = await runSloPull(
      parseSloPullBody(validBody()), // no defer_pull key at all
      { db: orderDb({ order_is_demo: false, order_status: status }), env: {}, ...deps }
    );
    assert.equal(out.ok, true, String(status));
    assert.equal(out.deferred, true, String(status));
    assert.equal(out.pull_requested, false);
    assert.equal(out.next, "pay");
    assert.equal(calls.emit.length, 0, `status ${status}: a live order that is not paid must never emit diagnostic.paid`);
    assert.equal(calls.demo.length, 0);
    assert.equal(calls.identity, 1, "identity + consent are still stored for the webhook's pull");
    assert.equal(calls.consent, 1);
  }
});

test("item 1: defer_pull:false in the body cannot make an unpaid live order pull", async () => {
  const { calls, deps } = spyDeps();
  const out = await runSloPull(
    parseSloPullBody(validBody({ defer_pull: false, order_status: "paid", paid: true })),
    { db: orderDb({ order_is_demo: false, order_status: "sent" }), env: {}, ...deps }
  );
  assert.equal(out.next, "pay");
  assert.equal(calls.emit.length, 0);
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
  assert.equal(calls.emit[0].opts.idempotencyKey, `slo-pull:${REF}:1`);
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
    { orgId: calls.demo[0].orgId, clientId: calls.demo[0].clientId, ref: calls.demo[0].ref, attempt: calls.demo[0].attempt },
    { orgId: ORG, clientId: CLIENT, ref: REF, attempt: 1 }
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
  assert.equal(seen[0].event.id, `slo-demo:${REF}:1`, "attempt 1 when none is given");
  await startSloDemoPull({}, { orgId: ORG, clientId: CLIENT, ref: REF, attempt: 3, env: {} }, {
    run: async (args) => { seen.push(args); return { done: true }; }
  });
  assert.equal(seen[1].event.id, `slo-demo:${REF}:3`);
  assert.equal(seen[1].event.payload.attempt, 3);
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
  const bad = parseSloPullBody(validBody({ first_name: "", dob: "2999-01-01", ssn: "12", address: "Main St" }));
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
  const young = parseSloPullBody(validBody({ dob: "2015-01-01" }));
  assert.equal(young.ok, true, "no age rule (owner-set 2026-09-22)");
});

test("items 4-5: military, Puerto Rico and grid streets, and 'Apt. 4B', ride through the pull form", () => {
  for (const [address, state, zip] of [
    ["PSC 1234 Box 5678", "AE", "09012"],
    ["Unit 2050 Box 4190", "AP", "96278"],
    ["CMR 480 Box 123", "AE", "09128"],
    ["Calle Luna 55", "PR", "00901"],
    ["N7450 Aanstad Rd", "WI", "54945"]
  ]) {
    const got = parseSloPullBody(validBody({ address, state, zip, city: "Somewhere" }));
    assert.equal(got.ok, true, `${address}: ${JSON.stringify(got.errors)}`);
  }
  const apt = parseSloPullBody(validBody({ apt: "Apt. 4B" }));
  assert.equal(apt.ok, true, JSON.stringify(apt.errors));
  assert.equal(apt.address.addressLine2, "APT 4B");
});

/* ── 2026-09-22 review: email takeover (item 2) ───────────────────────────── */

test("item 2: an order resolves by its own payment_links row, never by a client custom field", async () => {
  const seen = [];
  const db = { async query(sql, params) { seen.push({ sql, params }); return { rows: [] }; } };
  assert.equal(await findSloOrder(db, { clientId: CLIENT, ref: REF }), null);
  assert.equal(seen.length, 1);
  assert.match(seen[0].sql, /FROM payment_links pl/);
  assert.match(seen[0].sql, /pl\.link_ref = \$2 AND pl\.client_id = \$1::uuid/);
  assert.match(seen[0].sql, /pl\.business_count/);
  assert.doesNotMatch(seen[0].sql, /custom_fields/, "no slo_ref on the client can make a ref match");
  assert.deepEqual(seen[0].params, [CLIENT, REF]);
});

test("item 2: the business count paid for comes off the order row", () => {
  assert.equal(businessesPaidFor({ order_business_count: 3 }), 3);
  assert.equal(businessesPaidFor({ order_business_count: null }), 1);
  assert.equal(businessesPaidFor({ slo_businesses_paid: "5" }), 1, "the old client stamp is not read");
  assert.equal(businessesPaidFor(null), 1);
});

for (const [label, order, env] of [
  ["DEMO", { order_is_demo: true, order_status: "created" }, { SLO_DEMO_PAY: "1" }],
  ["LIVE unpaid", { order_is_demo: false, order_status: "sent" }, {}]
]) {
  for (const prior of [{ identity: true, paid: false }, { identity: false, paid: true }]) {
    test(`item 2 (${label}): an existing client with ${prior.identity ? "an identity on file" : "a paid purchase"} is refused before anything is written`, async () => {
      const { calls, deps } = spyDeps({ priorFile: async () => prior });
      const db = orderDb(order);
      const out = await runSloPull(parseSloPullBody(validBody({ defer_pull: true })), { db, env, ...deps });
      assert.equal(out.ok, false);
      assert.equal(out.error, "existing_account");
      assert.deepEqual(out.errors, [{ field: "email", code: "existing_account", message: EXISTING_ACCOUNT_MESSAGE }]);
      assert.equal(EXISTING_ACCOUNT_MESSAGE, "This email already has a file with us. Email support@fundhub.ai and we will pick it up.");
      assert.equal(calls.addressChecks, 0, "refused before the address lookup");
      nothingWritten(calls, db);
    });
  }

  test(`item 2 (${label}): a brand-new client (nothing on file) goes through`, async () => {
    const { calls, deps } = spyDeps({ priorFile: async () => ({ identity: false, paid: false }) });
    const out = await runSloPull(parseSloPullBody(validBody({ defer_pull: true })), { db: orderDb(order), env, ...deps });
    assert.equal(out.ok, true);
    assert.equal(calls.identity, 1);
    assert.equal(calls.stamp, 1, "slo_ref is stamped once the order is allowed to write");
    assert.equal(calls.mark, 1, "the order records the identity write as its own");
  });
}

test("item 2 (LIVE paid): a PAID order may write an existing client's identity and start the pull", async () => {
  let asked = 0;
  const { calls, deps } = spyDeps({ priorFile: async () => { asked += 1; return { identity: true, paid: true }; } });
  const out = await runSloPull(parseSloPullBody(validBody()), {
    db: orderDb({ order_is_demo: false, order_status: "paid" }), env: {}, ...deps
  });
  assert.equal(out.ok, true);
  assert.equal(asked, 0, "the gate is not consulted for a paid order");
  assert.equal(calls.identity, 1);
  assert.equal(calls.emit.length, 1);
});

test("item 2: the prior-file check ignores only the identity THIS order wrote", async () => {
  const seen = [];
  const db = { async query(sql, params) { seen.push({ sql, params }); return { rows: [{ identity: false, paid: false }] }; } };
  const out = await sloClientPriorFile(db, { orgId: ORG, clientId: CLIENT, orderId: ORDER });
  assert.deepEqual(out, { identity: false, paid: false });
  assert.deepEqual(seen[0].params, [CLIENT, ORG, ORDER]);
  assert.match(seen[0].sql, /FROM pii_identity pi/);
  assert.match(seen[0].sql, /own\.identity_stored_at = pi\.updated_at/);
  assert.match(seen[0].sql, /status = 'paid' AND is_demo = false/);
  assert.match(seen[0].sql, /FROM transactions/);
  const yes = await sloClientPriorFile(
    { query: async () => ({ rows: [{ identity: true, paid: false }] }) },
    { orgId: ORG, clientId: CLIENT, orderId: ORDER }
  );
  assert.deepEqual(yes, { identity: true, paid: false });
});

/* ── 2026-09-22 review: retry (item 3) ─────────────────────────────────────── */

test("item 3: the attempt number is 1 + this order's failed or cancelled pulls", () => {
  assert.equal(nextSloPullAttempt([]), 1);
  assert.equal(nextSloPullAttempt([{ status: "queued" }]), 1, "an open pull is the same attempt (double click)");
  assert.equal(nextSloPullAttempt([{ status: "processing" }]), 1);
  assert.equal(nextSloPullAttempt([{ status: "fulfilled" }]), 1, "a finished pull is never re-run by a resubmit");
  assert.equal(nextSloPullAttempt([{ status: "failed" }]), 2);
  assert.equal(nextSloPullAttempt([{ status: "queued" }, { status: "failed" }]), 2);
  assert.equal(nextSloPullAttempt([{ status: "cancelled" }, { status: "failed" }]), 3);
});

test("item 3 (DEMO): a retry after a failed pull starts a NEW pull (slo-demo:<ref>:2); a double click does not", async () => {
  const runs = [];
  const run = async ({ event }) => { runs.push(event.id); return { requestId: `spr-${runs.length}` }; };
  const { startSloDemoPull } = await import("./pull.mjs");
  const demo = (requests) => {
    const { deps } = spyDeps({
      orderPulls: async () => requests,
      startDemoPull: (db, args) => startSloDemoPull(db, args, { run })
    });
    return runSloPull(parseSloPullBody(validBody()), {
      db: orderDb({ order_is_demo: true, order_status: "created" }), env: { SLO_DEMO_PAY: "1" }, ...deps
    });
  };
  const first = await demo([]);
  const again = await demo([{ status: "queued" }]);            // double click while it runs
  const retry = await demo([{ status: "failed" }]);            // Check my details after a failure
  assert.deepEqual([first.attempt, again.attempt, retry.attempt], [1, 1, 2]);
  assert.deepEqual(runs, [`slo-demo:${REF}:1`, `slo-demo:${REF}:1`, `slo-demo:${REF}:2`]);
});

test("item 3 (LIVE paid): a retry after a failed pull emits a new key (slo-pull:<ref>:2)", async () => {
  const { calls, deps } = spyDeps({ orderPulls: async () => [{ status: "failed" }] });
  const out = await runSloPull(parseSloPullBody(validBody()), {
    db: orderDb({ order_is_demo: false, order_status: "paid" }), env: {}, ...deps
  });
  assert.equal(out.attempt, 2);
  assert.equal(calls.emit[0].opts.idempotencyKey, `slo-pull:${REF}:2`);
  assert.equal(calls.emit[0].payload.attempt, 2);
});

/* ── 2026-09-22: address check (item 9) ────────────────────────────────────── */

test("item 9: an address the geocoder cannot find stops the first Pay, before anything is written", async () => {
  const warning = { field: "address", code: "address_unverified", message: "We couldn't find that address. Check the street and ZIP, or tap Pay again to use it as typed." };
  const seen = [];
  const { calls, deps } = spyDeps({ checkAddresses: async (list) => { seen.push(list); return [warning]; } });
  const db = orderDb({ order_is_demo: true, order_status: "created" });
  const out = await runSloPull(parseSloPullBody(validBody()), { db, env: { SLO_DEMO_PAY: "1" }, ...deps });
  assert.equal(out.ok, false);
  assert.equal(out.error, "address_unverified");
  assert.deepEqual(out.warnings, [warning]);
  assert.equal(out.errors, undefined, "a warning, not a field error");
  assert.equal(seen[0][0].addressLine1, "100 Test Ave");
  nothingWritten(calls, db);
});

test("item 9: Pay again with address_confirmed:true takes the address as typed", async () => {
  let checked = 0;
  const { calls, deps } = spyDeps({ checkAddresses: async () => { checked += 1; return [{ field: "address", code: "address_unverified", message: "x" }]; } });
  const parsed = parseSloPullBody(validBody({ address_confirmed: true }));
  assert.equal(parsed.addressConfirmed, true);
  const out = await runSloPull(parsed, { db: orderDb({ order_is_demo: true, order_status: "created" }), env: { SLO_DEMO_PAY: "1" }, ...deps });
  assert.equal(out.ok, true);
  assert.equal(checked, 0);
  assert.equal(calls.identity, 1);
  assert.equal(parseSloPullBody(validBody()).addressConfirmed, false);
});

test("item 9: the previous address is checked too", async () => {
  const seen = [];
  const { deps } = spyDeps({ checkAddresses: async (list) => { seen.push(list); return []; } });
  await runSloPull(parseSloPullBody(validBody({
    moved_recently: true, prev_address: "9 Old Rd", prev_city: "Austin", prev_state: "TX", prev_zip: "73301"
  })), { db: orderDb({ order_is_demo: true }), env: { SLO_DEMO_PAY: "1" }, ...deps });
  assert.deepEqual(seen[0].map((a) => a.residency), ["current", "previous"]);
});
