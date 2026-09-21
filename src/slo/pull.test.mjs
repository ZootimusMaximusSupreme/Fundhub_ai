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
