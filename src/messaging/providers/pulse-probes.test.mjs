// Pulse probes — read-only, fenced, and never leak a key (MB2, 2026-10-05).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  probeTwilio,
  probeMeta,
  probeClickFunnels,
  probeOpenAI,
  probeCommas,
  probeCrs,
  probeClarityPay,
  probeNetlify,
  runProbes
} from "./pulse-probes.mjs";

const OPEN = { ADAPTERS_DRY_RUN: "0" };
const SECRET = "sk-live-THIS-MUST-NEVER-APPEAR";

function recorder(answer) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const a = typeof answer === "function" ? answer(String(url)) : answer;
    return {
      ok: a.status >= 200 && a.status < 300,
      status: a.status,
      text: async () => JSON.stringify(a.body ?? {}),
      headers: { forEach() {} }
    };
  };
  return { calls, fetchImpl };
}

test("every probe is a GET (Plaid aside, which is POST-only by design and tested by its own client)", async () => {
  const { calls, fetchImpl } = recorder({ status: 200, body: { status: "active", id: "1", data: [] } });
  const env = {
    ...OPEN,
    TWILIO_SEND_ACCOUNT_SID: "AC123", TWILIO_SEND_AUTH_TOKEN: SECRET,
    META_ACCESS_TOKEN: SECRET, CLICKFUNNELS_API_KEY: SECRET, OPENAI_API_KEY: SECRET
  };
  for (const probe of [probeTwilio, probeMeta, probeClickFunnels, probeOpenAI]) {
    const r = await probe({ env, fetchImpl });
    assert.equal(r.status, "PASS", `${r.id}: ${r.detail}`);
    assert.ok(!JSON.stringify(r).includes(SECRET), `${r.id} result carries the key`);
  }
  assert.equal(calls.length, 4);
  assert.ok(calls.every((c) => c.init.method === "GET"));
});

test("with the adapters fence up, nothing is sent and the row is not checked", async () => {
  const { calls, fetchImpl } = recorder({ status: 200, body: {} });
  const r = await probeTwilio({ env: { TWILIO_SEND_ACCOUNT_SID: "AC1", TWILIO_SEND_AUTH_TOKEN: "t" }, fetchImpl });
  assert.equal(r.status, "skip");
  assert.match(r.detail, /adapters fence/);
  assert.equal(calls.length, 0);
});

test("a missing or masked key is not checked, and names the key without its value", async () => {
  const r = await probeOpenAI({ env: { ...OPEN, OPENAI_API_KEY: "****************abcd" } });
  assert.equal(r.status, "skip");
  assert.match(r.detail, /OPENAI_API_KEY/);
  assert.doesNotMatch(r.detail, /abcd/);
});

test("a refused key is red with what a person would notice", async () => {
  const { fetchImpl } = recorder({ status: 401, body: { message: "Authenticate" } });
  const r = await probeTwilio({ env: { ...OPEN, TWILIO_SEND_ACCOUNT_SID: "AC1", TWILIO_SEND_AUTH_TOKEN: SECRET }, fetchImpl });
  assert.equal(r.status, "FAIL");
  assert.ok(r.customerSees);
  assert.ok(!JSON.stringify(r).includes(SECRET));
  const susp = await probeTwilio({
    env: { ...OPEN, TWILIO_SEND_ACCOUNT_SID: "AC1", TWILIO_SEND_AUTH_TOKEN: "t" },
    fetchImpl: recorder({ status: 200, body: { status: "suspended" } }).fetchImpl
  });
  assert.equal(susp.status, "FAIL");
  assert.match(susp.detail, /suspended/);
});

test("Commas reads back the newest payment we already hold — never a list, never a write", async () => {
  const { calls, fetchImpl } = recorder({ status: 200, body: { id: "pay_1" } });
  const db = { query: async () => ({ rows: [{ payment_id: "pay_1" }] }) };
  const r = await probeCommas({ env: { ...OPEN, COMMAS_API_KEY: SECRET }, fetchImpl, db });
  assert.equal(r.status, "PASS");
  assert.match(calls[0].url, /\/payments\/pay_1$/);
  const none = await probeCommas({ env: { ...OPEN, COMMAS_API_KEY: SECRET }, fetchImpl, db: { query: async () => ({ rows: [] }) } });
  assert.equal(none.status, "skip");
});

test("CRS is a login only, and not even that while the fence is up", async () => {
  const env = { CRS_API_USERNAME: "u", CRS_API_PASSWORD: SECRET, CRS_API_HOST: "api-sandbox.stitchcredit.com" };
  const { calls, fetchImpl } = recorder({ status: 200, body: { token: "t", expires_in: 3600 } });
  const held = await probeCrs({ env, fetchImpl });
  assert.equal(held.status, "skip");
  assert.equal(calls.length, 0);
  const r = await probeCrs({ env: { ...env, ...OPEN }, fetchImpl });
  assert.equal(r.status, "PASS", r.detail);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/users\/login$/);
});

test("ClarityPay has no connection in the repo, so it is not checked", () => {
  assert.equal(probeClarityPay().status, "skip");
});

test("Netlify: no token means both site rows are not checked; a failed deploy is red", async () => {
  const none = await probeNetlify({ env: {} });
  assert.deepEqual(none.map((r) => r.status), ["skip", "skip"]);
  assert.match(none[0].detail, /NETLIFY_AUTH_TOKEN/);

  const { fetchImpl } = recorder((url) => url.includes("/deploys")
    ? { status: 200, body: [{ state: "error", created_at: "2026-10-05T01:00:00Z" }] }
    : { status: 200, body: { state: "current" } });
  const rows = await probeNetlify({ env: { ...OPEN, NETLIFY_AUTH_TOKEN: SECRET }, fetchImpl });
  assert.equal(rows[0].status, "PASS");
  assert.equal(rows[1].status, "FAIL");
});

test("runProbes never calls the Clarity Data Export", async () => {
  const { calls, fetchImpl } = recorder({ status: 200, body: {} });
  const rows = await runProbes({ env: { ...OPEN }, fetchImpl, db: null });
  assert.ok(rows.length >= 10);
  assert.ok(calls.every((c) => !/clarity\.ms/.test(c.url)));
});
