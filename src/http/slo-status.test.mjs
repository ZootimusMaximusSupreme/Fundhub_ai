// GET /api/public/slo-status — the /roadmap widget's poll.
// Credential is ref + client_id (same as slo-pull). No database here; the
// real-row proof is src/http/slo-status.pg.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/public/slo-status.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REF = "slo_0123456789abcdef01234567";

function fakeRes() {
  return {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

const found = async (_db, { clientId }) => ({ id: clientId, org_id: ORG, order_created_at: null });

function rowsDb({ tier = null, crs = null, decision = null, request = null } = {}) {
  return {
    async query(sql) {
      if (/FROM soft_pull_requests/.test(sql)) return { rows: request ? [request] : [] };
      if (/FROM crs_results/.test(sql)) return { rows: crs ? [crs] : [] };
      if (/SELECT outcome_tier FROM clients/.test(sql)) return { rows: [{ outcome_tier: tier }] };
      if (/FROM events/.test(sql)) return { rows: decision ? [decision] : [] };
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

async function call({ method = "GET", query = { ref: REF, client_id: CLIENT }, headers = {}, deps = {} } = {}) {
  const res = fakeRes();
  await handler({ method, headers, query }, res, deps);
  return res;
}

test("POST is 405 and names GET", async () => {
  const res = await call({ method: "POST", deps: { db: rowsDb() } });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "GET, OPTIONS");
});

test("a bare GET with no ref or client_id is 400, and reads nothing", async () => {
  const db = { query: async () => { throw new Error("must not read"); } };
  const noRef = await call({ query: {}, deps: { db } });
  assert.equal(noRef.statusCode, 400);
  assert.equal(noRef.body.error, "ref_required");
  const badClient = await call({ query: { ref: REF, client_id: "not-a-uuid" }, deps: { db } });
  assert.equal(badClient.statusCode, 400);
  assert.equal(badClient.body.error, "client_required");
});

test("wrong client for this ref is 404, and nothing past the order check is read", async () => {
  const seen = [];
  const db = {
    async query(sql) {
      seen.push(sql);
      if (/custom_fields->>'slo_ref'/.test(sql)) return { rows: [] };
      throw new Error(`must not read past the order check: ${sql}`);
    }
  };
  const res = await call({ deps: { db } });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { ok: false, error: "not_found" });
  assert.equal(seen.length, 1);
});

test("done on the funding path: bucket, pa, booking link with ?pa=", async () => {
  const res = await call({
    headers: { origin: "https://apply.fundhub.ai" },
    deps: {
      db: rowsDb({
        tier: "FULL_FUNDING",
        crs: { id: "crs-1", outcome_tier: "FULL_FUNDING", bureaus_pulled: ["TU", "EX", "EQ"] },
        decision: { outcome_tier: "FULL_FUNDING", funding_estimate: "84500" }
      }),
      findOrder: found
    }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["access-control-allow-origin"], "https://apply.fundhub.ai");
  assert.equal(res.body.state, "done");
  assert.equal(res.body.bucket, "funding");
  assert.equal(res.body.pa, 84500);
  assert.equal(res.body.book_url, "https://apply.fundhub.ai/roadmap-book?pa=84500");
  assert.equal(res.body.repair_offer, null);
});

test("done on the repair path: repair offer with both plans; tier name never leaves", async () => {
  const res = await call({
    deps: {
      db: rowsDb({
        tier: null,
        crs: { id: "crs-2", outcome_tier: "REPAIR_ONLY", bureaus_pulled: ["EX"] },
        decision: { outcome_tier: "REPAIR_ONLY" }
      }),
      findOrder: found
    }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.bucket, "repair");
  assert.deepEqual(res.body.repair_offer.plans.map((p) => p.key), ["REPAIR_TRIAL", "REPAIR_DFY"]);
  assert.deepEqual(res.body.repair_offer.plans.map((p) => p.price_cents), [20000, 100000]);
  assert.equal(/REPAIR_ONLY|FULL_FUNDING/.test(JSON.stringify(res.body)), false);
});

test("before the pull: running, nothing about repair", async () => {
  const res = await call({ deps: { db: rowsDb(), findOrder: found } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, "running");
  assert.equal(res.body.bucket, null);
  assert.equal(res.body.repair_offer, null);
  assert.equal(/repair/i.test(JSON.stringify(res.body).replace(/"repair_offer":null/, "")), false);
});

test("a database error is 500 with no connection string in it", async () => {
  const db = { query: async () => { throw new Error("connect ECONNREFUSED postgres://u:secret@db.example:5432/x"); } };
  const res = await call({ deps: { db } });
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.equal(String(res.body.error).includes("secret"), false);
});
