// The Meta pull's clock and its background worker (spec M0 step 5), with a fake
// fetch and a fake sweep. No Meta, no database.

import { test, describe } from "node:test";
import assert from "node:assert";
import clock, { WORKER_PATH } from "../../netlify/functions/meta-sync-sweeper.mjs";
import worker from "../../netlify/functions/meta-sync-background.mjs";

const SECRET = "test-worker-secret";
const ENV = { URL: "https://fundhub.ai", MARKETING_WORKER_SECRET: SECRET };

describe("the clock starts the right pass and nothing else", () => {
  test("07:17 UTC starts the nightly pass, with the secret", async () => {
    const calls = [];
    const r = await clock(null, {}, {
      env: ENV,
      now: () => new Date("2026-10-05T07:17:00Z"),
      fetch: async (url, init) => { calls.push({ url, init }); return { status: 202, ok: true }; }
    });
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.deepEqual(body, { ok: true, started: true, pass: "nightly", error: null });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://fundhub.ai${WORKER_PATH}?pass=nightly`);
    assert.equal(calls[0].init.headers["x-fundhub-worker"], SECRET);
  });

  test("any other hour starts the hourly pass", async () => {
    const calls = [];
    await clock(null, {}, {
      env: ENV, now: () => new Date("2026-10-05T15:17:00Z"),
      fetch: async (url) => { calls.push(url); return { status: 202, ok: true }; }
    });
    assert.ok(calls[0].endsWith("?pass=hourly"));
  });

  test("no secret → nothing is started, and it still answers 200", async () => {
    let called = false;
    const r = await clock(null, {}, {
      env: { URL: "https://fundhub.ai" }, fetch: async () => { called = true; return { status: 202 }; }
    });
    assert.equal(r.status, 200);
    assert.equal(called, false);
    assert.equal((await r.json()).started, false);
  });
});

describe("the worker is a closed door without the secret", () => {
  const req = (pass, secret) => new Request(`https://fundhub.ai/.netlify/functions/meta-sync-background?pass=${pass}`, {
    method: "POST", headers: secret ? { "x-fundhub-worker": secret } : {}
  });
  const fakeSweep = (seen) => async (opts) => {
    seen.push(opts);
    return { ok: true, partners: 1, synced: 1, ads: 2, days_of_numbers: 3, errored: [] };
  };

  test("wrong or missing secret → 404 and no pull", async () => {
    const seen = [];
    assert.equal((await worker(req("hourly", "nope"), {}, { env: ENV, sweep: fakeSweep(seen) })).status, 404);
    assert.equal((await worker(req("hourly", null), {}, { env: ENV, sweep: fakeSweep(seen) })).status, 404);
    assert.equal((await worker(req("hourly", SECRET), {}, { env: {}, sweep: fakeSweep(seen) })).status, 404,
      "an unset secret must not open the door");
    assert.equal(seen.length, 0);
  });

  test("hourly reads 3 days, nightly reads 28", async () => {
    const seen = [];
    await worker(req("hourly", SECRET), {}, { env: ENV, sweep: fakeSweep(seen) });
    await worker(req("nightly", SECRET), {}, { env: ENV, sweep: fakeSweep(seen) });
    assert.deepEqual(seen.map((s) => s.windowDays), [3, 28]);
  });

  test("a pass that is not one of the two is refused", async () => {
    const seen = [];
    const r = await worker(req("365", SECRET), {}, { env: ENV, sweep: fakeSweep(seen) });
    assert.equal(r.status, 400);
    assert.equal(seen.length, 0);
  });
});
