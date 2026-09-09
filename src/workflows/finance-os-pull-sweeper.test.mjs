import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { sweep, dueClients, SCHEDULED_PULL_REASON } from "./finance-os-pull-sweeper.mjs";
import { SoftPullError } from "../finance/soft-pulls.mjs";

const ORG = "11111111-1111-1111-1111-111111111111";
const CLIENT_A = "22222222-2222-2222-2222-222222222222";
const CLIENT_B = "33333333-3333-3333-3333-333333333333";
const SUB_A = "44444444-4444-4444-4444-444444444444";

/** A queue-driven fake db. Each entry is either an array of rows, or a
    function(text, params) so a test can branch on which query is running —
    the sweeper issues the due-clients SELECT once, then requestSoftPull's own
    sequence (consent, open-request check, insert) once per due client. */
function fakeDb(queue) {
  const calls = [];
  let i = 0;
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      const next = queue[i++];
      if (typeof next === "function") return next(text, params);
      return { rows: next || [] };
    }
  };
}

const consentRow = () => ({
  id: "cc", org_id: ORG, kind: "soft_pull_consent",
  granted_at: new Date(Date.now() - 60_000), expires_at: null,
  revoked_at: null, is_valid: true
});

describe("dueClients", () => {
  test("asks for finance-os, active, with a known period, and no system pull yet this period", async () => {
    const db = fakeDb([[]]);
    await dueClients(db, new Date("2026-09-09"));
    const [{ text, params }] = db.calls;
    assert.match(text, /tier\s*=\s*\$1/);
    assert.match(text, /status\s*=\s*'active'/);
    assert.match(text, /current_period_start IS NOT NULL/);
    assert.match(text, /requested_by_kind\s*=\s*'system'/);
    assert.equal(params[0], "finance-os");
  });
});

describe("sweep", () => {
  test("an empty due list writes nothing and errors nothing", async () => {
    const db = fakeDb([[]]);
    const tally = await sweep(db, { now: new Date("2026-09-09") });
    assert.equal(tally.checked, 0);
    assert.equal(tally.requested, 0);
    assert.deepEqual(tally.skipped, []);
    assert.deepEqual(tally.errored, []);
  });

  test("a due client with valid consent and nothing open gets a system-requested row", async () => {
    const db = fakeDb([
      [{ subscription_id: SUB_A, org_id: ORG, client_id: CLIENT_A }], // dueClients
      [consentRow()],                                                 // consent gate
      [],                                                              // open-request check
      [{ id: "rr", requested_by_kind: "system", status: "queued" }]    // INSERT RETURNING
    ]);
    const tally = await sweep(db, { now: new Date("2026-09-09") });
    assert.equal(tally.checked, 1);
    assert.equal(tally.requested, 1);
    assert.deepEqual(tally.skipped, []);
    assert.deepEqual(tally.errored, []);

    const insert = db.calls.find((c) => /INSERT INTO soft_pull_requests/.test(c.text));
    assert.ok(insert);
    assert.equal(insert.params[2], "system");
    assert.equal(insert.params[5], SCHEDULED_PULL_REASON);
    assert.equal(insert.params[7], SUB_A, "subscription_id is threaded onto the row");
  });

  test("a client with no valid consent is skipped, not errored", async () => {
    const db = fakeDb([
      [{ subscription_id: SUB_A, org_id: ORG, client_id: CLIENT_A }],
      [] // consent gate: nothing on file
    ]);
    const tally = await sweep(db, { now: new Date("2026-09-09") });
    assert.equal(tally.requested, 0);
    assert.deepEqual(tally.skipped, [{ clientId: CLIENT_A, reason: "consent_required" }]);
    assert.deepEqual(tally.errored, [], "a refused consent gate is not a fault");
  });

  test("a client with an already-open pull is skipped, not double-requested", async () => {
    const db = fakeDb([
      [{ subscription_id: SUB_A, org_id: ORG, client_id: CLIENT_A }],
      [consentRow()],
      [{ id: "existing", status: "queued" }] // openRequestFor finds one
    ]);
    const tally = await sweep(db, { now: new Date("2026-09-09") });
    assert.equal(tally.requested, 0);
    assert.equal(tally.skipped.length, 1);
    assert.equal(tally.skipped[0].clientId, CLIENT_A);
  });

  test("one client's fault does not stop the pass for the next one", async () => {
    const db = fakeDb([
      [
        { subscription_id: SUB_A, org_id: ORG, client_id: CLIENT_A },
        { subscription_id: "55555555-5555-5555-5555-555555555555", org_id: ORG, client_id: CLIENT_B }
      ],
      () => { throw new Error("the database fell over"); }, // CLIENT_A's consent read throws
      [consentRow()], // CLIENT_B's consent read
      [],
      [{ id: "rr", requested_by_kind: "system", status: "queued" }]
    ]);
    const tally = await sweep(db, { now: new Date("2026-09-09") });
    assert.equal(tally.checked, 2);
    assert.equal(tally.requested, 1, "the second client still gets its row");
    assert.equal(tally.errored.length, 1);
    assert.equal(tally.errored[0].clientId, CLIENT_A);
    assert.match(tally.errored[0].error, /fell over/);
  });

  test("never throws for the whole pass, whatever a single client does", async () => {
    const db = fakeDb([
      [{ subscription_id: SUB_A, org_id: ORG, client_id: CLIENT_A }],
      () => { throw new SoftPullError("nope", { status: 500 }); }
    ]);
    await assert.doesNotReject(() => sweep(db, { now: new Date("2026-09-09") }));
  });
});
