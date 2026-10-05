// Fakes only. Nothing here reaches clarity.ms or a real database.
import assert from "node:assert/strict";
import test from "node:test";
import { runClarityOrgSync } from "./clarity-org-sync.mjs";
import { clarityDbCounter } from "./clarity-counter.mjs";

function fakeDb({ allow = Infinity } = {}) {
  let reserved = 0;
  const inserts = [];
  const self = {
    inserts,
    get reserved() { return reserved; },
    async connect() { return { query: (sql, params) => self.query(sql, params), release() {} }; },
    async query(sql, params) {
      if (/FROM orgs/i.test(sql) || /resolveDefaultOrg/i.test(sql)) return { rows: [{ id: "org-1" }] };
      if (/clarity_export_calls/i.test(sql)) {
        if (reserved >= allow) return { rows: [] };
        reserved += 1;
        return { rows: [{ calls: reserved, machine_calls: reserved }] };
      }
      if (/clarity_insights_snapshots/i.test(sql)) { inserts.push(params); return { rows: [] }; }
      return { rows: [{ id: "org-1" }] };
    },
  };
  return self;
}

function okFetch(log) {
  return async (url) => {
    log.push(String(url));
    return { ok: true, status: 200, async text() { return "[]"; } };
  };
}

const base = { token: "t", projectId: "p", numOfDays: 3 };

test("reserve is one atomic upsert and reports a refused cap", async () => {
  const db = fakeDb({ allow: 1 });
  const c = clarityDbCounter(db, { orgId: "org-1" });
  assert.equal((await c.reserve("p", "2026-10-05", 10)).ok, true);
  assert.equal((await c.reserve("p", "2026-10-05", 10)).ok, false);
});

test("two default pulls reach the fake once each, retries off", async () => {
  const db = fakeDb();
  const urls = [];
  const out = await runClarityOrgSync({ ...base, db, pool: () => db, fetch: okFetch(urls) });
  assert.equal(urls.length, 2);
  assert.equal(out.synced, 2);
  assert.equal(out.ok, true);
});

test("a failed pull is logged and the run stops: no retry, no second call", async () => {
  const db = fakeDb();
  const urls = [];
  const failing = async (url) => {
    urls.push(String(url));
    return { ok: false, status: 500, async text() { return "boom"; } };
  };
  const origErr = console.error;
  console.error = () => {};
  let out;
  try {
    out = await runClarityOrgSync({ ...base, db, pool: () => db, fetch: failing });
  } finally {
    console.error = origErr;
  }
  assert.equal(urls.length, 1, "must stop after the first failure");
  assert.equal(out.ok, false);
  assert.equal(out.synced, 0);
  assert.match(out.errors[0].message, /HTTP 500/);
});

test("the daily cap in the database blocks the call before any HTTP request", async () => {
  const db = fakeDb({ allow: 0 });
  const urls = [];
  const origErr = console.error;
  console.error = () => {};
  let out;
  try {
    out = await runClarityOrgSync({ ...base, db, pool: () => db, fetch: okFetch(urls) });
  } finally {
    console.error = origErr;
  }
  assert.equal(urls.length, 0);
  assert.equal(out.ok, false);
  assert.match(out.errors[0].message, /cap/i);
});

test("an invalid dimension never reaches the network", async () => {
  const db = fakeDb();
  const urls = [];
  const out = await runClarityOrgSync({
    ...base, db, pool: () => db, fetch: okFetch(urls), queries: [{ dimension1: "Bogus" }],
  });
  assert.equal(urls.length, 0);
  assert.equal(db.reserved, 0);
  assert.equal(out.ok, false);
});
