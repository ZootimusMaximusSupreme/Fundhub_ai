// Hole N10 (2026-09-18): the sim credit tool put an address on a practice pull
// but saved no identity row, and on a funding result it "saved" the UnderwriteIQ
// pack into a document store the laptop cannot open — C-06 caught the error and
// the run printed success. These pin the fix:
//   1. the identity it saves is the soft-pull form's — same fields, same shape;
//   2. it only fills what is missing and never replaces a value on file;
//   3. a store that cannot be opened from here is named BEFORE anything is written;
//   4. after the events, "saved" means C-06 stamped THIS pull, nothing looser.
//
// No database here — main() is guarded behind the argv check, so importing the
// module runs nothing. The identity below is made up for the test.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formAddress, identityPlan, packStoreProblem, packSavedFor } from "./push-credit.mjs";
import { netlifyBlobsProvider } from "../../src/documents/store.mjs";

const IDENTITY = {
  first: "Test", middle: null, last: "Person", dob: "1990-01-02",
  current: { line1: " 1 Main St ", city: "Phoenix", state: "az", postal_code: "85001" },
  priors: [], employer: null
};

test("the identity saved on a Sim with none is the soft-pull form's: address, date of birth, SSN", () => {
  const plan = identityPlan(null, IDENTITY);
  assert.equal(plan.write, true);
  assert.deepEqual(plan.fills, ["address", "date of birth", "SSN"]);
  // api/soft-pull-approve.mjs: [{ addressLine1, city, state, postalCode }], trimmed, state upper-cased.
  assert.deepEqual(plan.addresses, [{ addressLine1: "1 Main St", city: "Phoenix", state: "AZ", postalCode: "85001" }]);
  assert.deepEqual(Object.keys(plan.addresses[0]), ["addressLine1", "city", "state", "postalCode"]);
  assert.equal(plan.dob, "1990-01-02");
  // The same never-issued number the simulated pull carries, never a real one.
  assert.match(plan.ssn, /^666\d{6}$/);
});

test("the form's address rules are the tool's rules — an incomplete address or no date of birth stops the run", () => {
  assert.throws(() => formAddress({ line1: "1 Main St", city: "Phoenix", state: "Arizona", postal_code: "85001" }), /two-letter state/);
  assert.throws(() => formAddress({ line1: "", city: "Phoenix", state: "AZ", postal_code: "85001" }), /soft-pull form refuses/);
  assert.throws(() => identityPlan(null, { ...IDENTITY, dob: null }), /YYYY-MM-DD dob/);
});

test("a complete row on file is left exactly as it is", () => {
  const onFile = { has_ssn: true, has_dob: true, addresses: [{ addressLine1: "9 Other Rd", city: "Mesa", state: "AZ", postalCode: "85201" }] };
  const plan = identityPlan(onFile, IDENTITY);
  assert.equal(plan.write, false);
  assert.equal(plan.ssn, null);
  assert.equal(plan.dob, null);
  assert.equal(plan.addresses, onFile.addresses);
});

test("an address-only row (Combo, after its hand fix) gets only the missing date of birth and SSN", () => {
  const onFile = { has_ssn: false, has_dob: false, addresses: [{ addressLine1: "9 Other Rd", city: "Mesa", state: "AZ", postalCode: "85201" }] };
  const plan = identityPlan(onFile, IDENTITY);
  assert.equal(plan.write, true);
  assert.deepEqual(plan.fills, ["date of birth", "SSN"]);
  assert.equal(plan.addresses, onFile.addresses, "the address on file is handed back untouched");
  assert.equal(plan.dob, "1990-01-02");
  assert.match(plan.ssn, /^666\d{6}$/);
});

test("a row with no street gets the address put first and keeps every entry it had", () => {
  const old = { addressLine1: "", city: "Tempe", state: "AZ", postalCode: "85281" };
  const plan = identityPlan({ has_ssn: true, has_dob: true, addresses: [old] }, IDENTITY);
  assert.deepEqual(plan.fills, ["address"]);
  assert.equal(plan.ssn, null, "an SSN on file is never replaced");
  assert.equal(plan.dob, null, "a date of birth on file is never replaced");
  assert.equal(plan.addresses.length, 2);
  assert.equal(plan.addresses[0].addressLine1, "1 Main St");
  assert.equal(plan.addresses[1], old);
});

test("the laptop case: netlify-blobs with no site id or token is named before anything is written", async () => {
  const saved = process.env.NETLIFY_BLOBS_CONTEXT;
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  try {
    // The REAL provider and SDK, with no site id and no token — what C-06 got on the laptop.
    const why = await packStoreProblem(
      { DOCUMENT_STORE_PROVIDER: "netlify-blobs" },
      { makeProvider: () => netlifyBlobsProvider({ siteID: undefined, token: undefined }) }
    );
    assert.match(String(why), /cannot be opened from this machine/);
    assert.match(String(why), /NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN/);
  } finally {
    if (saved !== undefined) process.env.NETLIFY_BLOBS_CONTEXT = saved;
  }
});

test("a store that opens is not a problem; memory and a masked token are", async () => {
  const opens = { exists: async () => false };
  assert.equal(await packStoreProblem({ DOCUMENT_STORE_PROVIDER: "netlify-blobs" }, { makeProvider: () => opens }), null);
  assert.match(String(await packStoreProblem({})), /memory/);
  assert.match(String(await packStoreProblem({ DOCUMENT_STORE_PROVIDER: "memory" })), /lost when it exits/);
  assert.match(
    String(await packStoreProblem(
      { DOCUMENT_STORE_PROVIDER: "netlify-blobs", NETLIFY_SITE_ID: "site", NETLIFY_BLOBS_TOKEN: "****************abcd" },
      { makeProvider: () => opens })),
    /masked copy/
  );
});

test("saved means C-06 stamped THIS pull — an older stamp or no stamp is a failure", async () => {
  const db = (stamp, files) => ({ query: async () => ({ rows: [{ stamp, files }] }) });
  assert.deepEqual(await packSavedFor(db("evt-2", 11), "c1", "evt-2"), { saved: true, files: 11 });
  assert.deepEqual(await packSavedFor(db("evt-1", 11), "c1", "evt-2"), { saved: false, files: 11 });
  assert.deepEqual(await packSavedFor(db(null, 0), "c1", "evt-2"), { saved: false, files: 0 });
  assert.equal((await packSavedFor(db("evt-2", 5), "c1", null)).saved, false, "no event id is never 'saved'");
});

test("main() saves the identity before the pull and checks the pack after it", () => {
  const src = readFileSync(new URL("./push-credit.mjs", import.meta.url), "utf8");
  const main = src.slice(src.indexOf("async function main()"));
  const at = (s) => { const i = main.indexOf(s); assert.ok(i >= 0, `main() no longer calls ${s}`); return i; };
  const stop = at("STOP — nothing was written");
  const dry = at('if (dry) { console.log("dry run — nothing written")');
  const identity = at("await storeIdentity(db,");
  const crs = at("INSERT INTO crs_results");
  const check = at("await packSavedFor(db, c.id, analysis?.id)");
  assert.ok(stop < dry && dry < identity && identity < crs && crs < check,
    "order must be: stop on problems → dry run exit → identity row → credit file → pack check");
});
