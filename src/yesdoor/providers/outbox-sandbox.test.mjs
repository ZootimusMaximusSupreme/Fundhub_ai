import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PROVIDER, SANDBOX, dispatch } from "./outbox-sandbox.mjs";

const NOW = new Date("2026-10-07T12:00:00Z");
const row = (over = {}) => ({ id: "o1", channel: "email", to_address: "leasing@example-apartments.test", status: "queued", ...over });

test("it is a sandbox provider named 'sandbox' (the value yd_outbox.provider gets)", () => {
  assert.equal(PROVIDER, "sandbox");
  assert.equal(SANDBOX, true);
});

describe("dispatch", () => {
  test("a queued email becomes a sent update", () => {
    assert.deepEqual(dispatch([row()], { now: NOW }), {
      updates: [{ id: "o1", status: "sent", provider: "sandbox", provider_ref: "sandbox-o1", sent_at: NOW.toISOString() }],
      skipped: []
    });
  });
  test("a queued text with a real-looking number is sent", () => {
    const { updates } = dispatch([row({ id: "o2", channel: "sms", to_address: "+1 (602) 555-0142" })], { now: NOW });
    assert.equal(updates[0].status, "sent");
  });
  test("rows that are not queued are skipped, so a second run sends nothing twice", () => {
    const { updates, skipped } = dispatch([row({ id: "a", status: "sent" }), row({ id: "b", status: "failed" }), row({ id: "c" })], { now: NOW });
    assert.deepEqual(updates.map((u) => u.id), ["c"]);
    assert.deepEqual(skipped.map((s) => s.id), ["a", "b"]);
    assert.equal(skipped[0].reason, "not queued");
  });
  test("a row nobody can deliver fails with a reason, even in the sandbox", () => {
    const cases = [
      [row({ to_address: "" }), /no to_address/],
      [row({ to_address: null }), /no to_address/],
      [row({ to_address: "not-an-email" }), /not an email/],
      [row({ channel: "sms", to_address: "12345" }), /not a phone/],
      [row({ channel: "carrier-pigeon" }), /unknown channel/]
    ];
    for (const [r, why] of cases) {
      const { updates } = dispatch([r], { now: NOW });
      assert.equal(updates[0].status, "failed");
      assert.equal(updates[0].provider, "sandbox");
      assert.match(updates[0].error, why);
      assert.equal("sent_at" in updates[0], false);
    }
  });
  test("a mixed batch keeps its order", () => {
    const { updates } = dispatch([row({ id: "1" }), row({ id: "2", to_address: "" }), row({ id: "3" })], { now: NOW });
    assert.deepEqual(updates.map((u) => `${u.id}:${u.status}`), ["1:sent", "2:failed", "3:sent"]);
  });
  test("is deterministic and does not change its rows", () => {
    const rows = [Object.freeze(row())];
    assert.deepEqual(dispatch(rows, { now: NOW }), dispatch(rows, { now: NOW }));
    assert.equal(rows[0].status, "queued");
  });
  test("accepts a timestamp string or number for now", () => {
    assert.equal(dispatch([row()], { now: "2026-10-07T12:00:00Z" }).updates[0].sent_at, NOW.toISOString());
    assert.equal(dispatch([row()], { now: NOW.getTime() }).updates[0].sent_at, NOW.toISOString());
  });
  test("nothing in, nothing out; null rows are skipped", () => {
    assert.deepEqual(dispatch(), { updates: [], skipped: [] });
    assert.deepEqual(dispatch([null], { now: NOW }).skipped, [{ id: null, reason: "not queued" }]);
  });
});
