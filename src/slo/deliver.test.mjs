import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverSloPack, SLO_PACK_EMAIL } from "./deliver.mjs";

const noop = async () => {};

test("deliverSloPack stores the funding pack and queues the UnderwriteIQ email", async () => {
  const sent = [];
  const out = await deliverSloPack(
    {},
    {
      orgId: "org-1",
      clientId: "cl-1",
      eventId: "evt-slo-1",
      buildPack: async () => ({ files: [{ filename: "snapshot.pdf", buffer: Buffer.from("x") }] }),
      persist: async () => ({ stored: ["snapshot.pdf"] }),
      send: async (_db, args) => { sent.push(args); return { queued: true }; },
      tag: noop,
      stamp: noop
    }
  );
  assert.equal(out.delivered, true);
  assert.equal(out.documentsStored, 1);
  assert.equal(sent[0].templateKey, SLO_PACK_EMAIL);
  assert.equal(sent[0].channel, "email");
  assert.equal(SLO_PACK_EMAIL, "EMAIL-U02-ANALYZER-FUNDING-DELIVERY");
});

test("deliverSloPack does not email when the pack is empty", async () => {
  const sent = [];
  const out = await deliverSloPack(
    {},
    {
      orgId: "org-1",
      clientId: "cl-1",
      buildPack: async () => ({ files: [], reason: "no_credit_file" }),
      send: async (_db, args) => { sent.push(args); },
      stamp: noop
    }
  );
  assert.equal(out.delivered, false);
  assert.equal(out.reason, "no_credit_file");
  assert.equal(sent.length, 0);
});

test("deliverSloPack refuses an incomplete ask", async () => {
  const out = await deliverSloPack({}, { orgId: null, clientId: "cl-1" });
  assert.equal(out.delivered, false);
  assert.equal(out.reason, "incomplete");
});
