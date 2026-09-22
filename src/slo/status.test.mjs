// src/slo/status.mjs — the /roadmap widget's status answer. Pure unit test;
// the real-row proof is src/http/slo-status.pg.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bureausFromFailReason,
  bureausFromResult,
  decisionKeyFor,
  loadSloStatus,
  paFromEstimate,
  sloStatusFromRows
} from "./status.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const CRS_ALL = {
  id: "crs-1",
  outcome_tier: "FULL_FUNDING",
  created_at: "2026-09-22T10:05:00Z",
  bureaus_pulled: ["TU", "EX", "EQ"],
  bureau_errors: {},
  bureau_status: {}
};

test("nothing yet: running, not started, every bureau pending, no bucket, no offer", () => {
  const s = sloStatusFromRows({});
  assert.deepEqual(s, {
    ok: true,
    state: "running",
    started: false,
    demo: false,
    bucket: null,
    pa: null,
    bureaus: { TU: "pending", EX: "pending", EQ: "pending" },
    book_url: null,
    repair_offer: null
  });
});

test("a queued or processing request is running", () => {
  for (const status of ["queued", "processing"]) {
    const s = sloStatusFromRows({ request: { status, requested_at: "2026-09-22T10:00:00Z" } });
    assert.equal(s.state, "running");
    assert.equal(s.started, true);
  }
});

test("stored but no decision yet: still running (the tier is being written)", () => {
  const s = sloStatusFromRows({ request: { status: "fulfilled" }, crs: CRS_ALL, decision: null });
  assert.equal(s.state, "running");
  assert.equal(s.bucket, null);
  assert.equal(s.bureaus.TU, "file_returned");
});

test("done, funding: bucket funding, pa whole dollars, booking link carries ?pa=", () => {
  const s = sloStatusFromRows({
    request: { status: "fulfilled" },
    crs: CRS_ALL,
    clientTier: "FULL_FUNDING",
    decision: { outcome_tier: "FULL_FUNDING", funding_estimate: "84500.4" }
  });
  assert.equal(s.state, "done");
  assert.equal(s.bucket, "funding");
  assert.equal(s.pa, 84500);
  assert.equal(s.book_url, "https://apply.fundhub.ai/roadmap-book?pa=84500");
  assert.equal(s.repair_offer, null);
  assert.deepEqual(s.bureaus, { TU: "file_returned", EX: "file_returned", EQ: "file_returned" });
});

test("done, funding with no engine figure: pa null, plain booking link — never invented", () => {
  for (const est of [null, "", "0", "-5", "abc"]) {
    const s = sloStatusFromRows({
      crs: CRS_ALL, clientTier: "PREMIUM_STACK", decision: { funding_estimate: est }
    });
    assert.equal(s.bucket, "funding");
    assert.equal(s.pa, null, `estimate ${JSON.stringify(est)}`);
    assert.equal(s.book_url, "https://apply.fundhub.ai/roadmap-book");
  }
});

test("done, repair: the two catalogue plans + Talk to us first, and no pa", () => {
  const s = sloStatusFromRows({
    crs: { ...CRS_ALL, outcome_tier: "REPAIR_ONLY" },
    clientTier: null,
    decision: { outcome_tier: "REPAIR_ONLY", funding_estimate: "5000" }
  });
  assert.equal(s.state, "done");
  assert.equal(s.bucket, "repair");
  assert.equal(s.pa, null);
  assert.deepEqual(s.repair_offer, {
    plans: [
      { key: "REPAIR_TRIAL", name: "Repair test run (first round, done for you)", price_cents: 20000, display: "$200" },
      { key: "REPAIR_DFY", name: "Credit repair, done-for-you", price_cents: 100000, display: "$1,000" }
    ],
    book_url: "https://apply.fundhub.ai/roadmap-book"
  });
});

test("bucket: clients.outcome_tier first, then crs_results.outcome_tier", () => {
  const fromClient = sloStatusFromRows({
    crs: { ...CRS_ALL, outcome_tier: "REPAIR_ONLY" }, clientTier: "FULL_FUNDING", decision: {}
  });
  assert.equal(fromClient.bucket, "funding");
  const fromCrs = sloStatusFromRows({
    crs: { ...CRS_ALL, outcome_tier: "REPAIR_ONLY" }, clientTier: null, decision: {}
  });
  assert.equal(fromCrs.bucket, "repair");
  const review = sloStatusFromRows({
    crs: { ...CRS_ALL, outcome_tier: "MANUAL_REVIEW" }, clientTier: null, decision: {}
  });
  assert.equal(review.state, "done");
  assert.equal(review.bucket, null);
  assert.equal(review.repair_offer, null);
});

test("FUNDING_PLUS_REPAIR is a funding tier, not the repair offer", () => {
  const s = sloStatusFromRows({ crs: CRS_ALL, clientTier: "FUNDING_PLUS_REPAIR", decision: {} });
  assert.equal(s.bucket, "funding");
  assert.equal(s.repair_offer, null);
});

test("failed with nothing stored: per-bureau words off the reason, booking link", () => {
  const s = sloStatusFromRows({
    request: {
      status: "failed",
      requested_at: "2026-09-22T10:00:00Z",
      state_reason: "no bureau returned a report — TU: HTTP 500 | EQ: [frozen] EQ: the file is frozen at this bureau (NoFileReturnedCreditFreeze)"
    }
  });
  assert.equal(s.state, "failed");
  assert.deepEqual(s.bureaus, { TU: "error", EX: null, EQ: "frozen" });
  assert.equal(s.book_url, "https://apply.fundhub.ai/roadmap-book");
  assert.equal(s.bucket, null);
});

test("a failed request newer than the stored result is the answer", () => {
  const s = sloStatusFromRows({
    request: { status: "failed", requested_at: "2026-09-22T11:00:00Z", state_reason: "x" },
    crs: CRS_ALL,
    decision: {}
  });
  assert.equal(s.state, "failed");
});

test("per-bureau words off a stored result", () => {
  assert.deepEqual(
    bureausFromResult({ bureaus_pulled: ["EX"], bureau_errors: { EQ: "x" }, bureau_status: { EQ: "frozen" } }),
    { TU: null, EX: "file_returned", EQ: "frozen" }
  );
  assert.deepEqual(
    bureausFromResult({ bureaus_pulled: "[\"TU\"]", bureau_errors: "{\"EX\":\"boom\"}", bureau_status: null }),
    { TU: "file_returned", EX: "error", EQ: null }
  );
  assert.deepEqual(bureausFromFailReason("CRS is not configured — missing CRS_API_HOST"), {});
  assert.deepEqual(bureausFromFailReason("no bureau returned a report — EX: [no_file] EX: none"), { EX: "no_file" });
});

test("pa rounding", () => {
  assert.equal(paFromEstimate(84500), 84500);
  assert.equal(paFromEstimate("84500.6"), 84501);
  assert.equal(paFromEstimate(0), null);
  assert.equal(paFromEstimate(undefined), null);
});

test("the answer never carries a tier name, score or email", () => {
  const s = sloStatusFromRows({
    crs: { ...CRS_ALL, outcome_tier: "REPAIR_ONLY" },
    clientTier: "REPAIR_ONLY",
    decision: { outcome_tier: "REPAIR_ONLY", funding_estimate: "1" }
  });
  const text = JSON.stringify(s);
  assert.equal(/REPAIR_ONLY|FULL_FUNDING|outcome|score|@/.test(text), false);
});

test("loadSloStatus scopes every read to this order and to the client's org", async () => {
  const seen = [];
  const db = {
    async query(sql, params) {
      seen.push({ sql, params });
      if (/FROM soft_pull_requests/.test(sql)) return { rows: [{ status: "fulfilled", requested_at: "2026-09-22T10:01:00Z" }] };
      if (/FROM crs_results/.test(sql)) return { rows: [CRS_ALL] };
      if (/SELECT outcome_tier FROM clients/.test(sql)) return { rows: [{ outcome_tier: "FULL_FUNDING" }] };
      if (/FROM events/.test(sql)) return { rows: [{ outcome_tier: "FULL_FUNDING", funding_estimate: "40000" }] };
      throw new Error(`unexpected ${sql}`);
    }
  };
  const since = "2026-09-22T10:00:00Z";
  const s = await loadSloStatus(db, { id: CLIENT, org_id: ORG, order_created_at: since, order_is_demo: true });
  assert.equal(s.state, "done");
  assert.equal(s.pa, 40000);
  assert.equal(s.demo, true);

  const req = seen.find((q) => /FROM soft_pull_requests/.test(q.sql));
  assert.deepEqual(req.params, [ORG, CLIENT, since]);
  assert.match(req.sql, /requested_at >= \$3/);
  const crs = seen.find((q) => /FROM crs_results/.test(q.sql));
  assert.deepEqual(crs.params, [ORG, CLIENT, since]);
  assert.match(crs.sql, /created_at >= \$3/);
  const ev = seen.find((q) => /FROM events/.test(q.sql));
  assert.deepEqual(ev.params, [ORG, decisionKeyFor("crs-1")]);
  assert.equal(decisionKeyFor("crs-1"), "crs-result:crs-1:decision.rendered:v1");
  for (const q of seen) assert.equal(/INSERT|UPDATE|DELETE/i.test(q.sql), false, "read only");
});

test("loadSloStatus: no stored result means no event read", async () => {
  const seen = [];
  const db = {
    async query(sql) {
      seen.push(sql);
      return { rows: [] };
    }
  };
  const s = await loadSloStatus(db, { id: CLIENT, org_id: ORG, order_created_at: null });
  assert.equal(s.state, "running");
  assert.equal(seen.some((sql) => /FROM events/.test(sql)), false);
});
