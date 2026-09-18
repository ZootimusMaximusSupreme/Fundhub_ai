import { test } from "node:test";
import assert from "node:assert/strict";
import { handle } from "./slo-pack-delivery.mjs";

function ev(over = {}) {
  return {
    id: "evt-1",
    orgId: "org-1",
    clientId: "cl-1",
    payload: { source: "crs", email: "buyer@example.com" },
    ...over
  };
}

function fakeStep() {
  return { run: async (_name, fn) => fn() };
}

test("slo-pack-delivery skips a client who did not buy the SLO", async () => {
  const res = await handle({
    event: ev(),
    db: {},
    step: fakeStep(),
    resolve: async () => "cl-1",
    isSlo: async () => false
  });
  assert.equal(res.done, false);
  assert.equal(res.reason, "not_slo");
});

test("slo-pack-delivery runs the UnderwriteIQ pack for an SLO buyer", async () => {
  let deliveredFor = null;
  const res = await handle({
    event: ev(),
    db: {},
    step: fakeStep(),
    resolve: async () => "cl-1",
    isSlo: async () => true,
    deliver: async (_db, args) => {
      deliveredFor = args.clientId;
      return { delivered: true, documentsStored: 3 };
    }
  });
  assert.equal(res.done, true);
  assert.equal(deliveredFor, "cl-1");
  assert.equal(res.delivery.delivered, true);
});
