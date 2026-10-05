// src/meta/token.test.mjs — where the Conversions API token comes from.
//
// Fakes only: a throwaway encryption key generated here and a made-up token
// string. No real token is read, decrypted or printed by this test.
//
// What this proves: META_CAPI_ACCESS_TOKEN wins and skips the database; the
// stored connection is read in staff context with the newest meta row and
// decrypted with that row's partner_id; a found token is cached for
// TOKEN_TTL_MS and a miss for MISS_TTL_MS; a missing row, a read error or a
// failed decrypt is a reason naming the source, never a throw and never a
// value.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { getMetaCapiToken, clearMetaTokenCache, STORED_TOKEN_SQL, TOKEN_TTL_MS, MISS_TTL_MS } from "./token.mjs";
import { encryptToken } from "../adplatforms/tokens.mjs";

const PARTNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FAKE_TOKEN = "fake-capi-token-for-tests-only";
const env = { AD_TOKEN_ENC_KEY: crypto.randomBytes(32).toString("base64") };

/** A stand-in for asStaff: counts calls, hands back one stored row. */
function staffScope(rows, { fail = false } = {}) {
  const calls = [];
  const scope = async (fn) => {
    calls.push("asStaff");
    if (fail) throw new Error("connection refused");
    return fn({ query: async (sql) => { calls.push(sql); return { rows }; } });
  };
  return { scope, calls };
}

beforeEach(() => clearMetaTokenCache());

test("META_CAPI_ACCESS_TOKEN wins and the database is never read", async () => {
  const s = staffScope([]);
  const out = await getMetaCapiToken({ env: { ...env, META_CAPI_ACCESS_TOKEN: "  env-token  " }, scope: s.scope });
  assert.deepEqual(out, { token: "env-token", source: "env" });
  assert.equal(s.calls.length, 0);
});

test("the stored meta connection: newest row, staff scope, decrypted with its partner id", async () => {
  const stored = encryptToken(FAKE_TOKEN, { partnerId: PARTNER, env });
  const s = staffScope([{ partner_id: PARTNER, encrypted_access_token: stored }]);
  const out = await getMetaCapiToken({ env, scope: s.scope });
  assert.deepEqual(out, { token: FAKE_TOKEN, source: "stored" });
  assert.deepEqual(s.calls, ["asStaff", STORED_TOKEN_SQL]);
  assert.match(STORED_TOKEN_SQL, /FROM ad_platform_connections/);
  assert.match(STORED_TOKEN_SQL, /platform = 'meta'/);
  assert.match(STORED_TOKEN_SQL, /encrypted_access_token IS NOT NULL/);
  assert.match(STORED_TOKEN_SQL, /ORDER BY created_at DESC\s+LIMIT 1/);
});

test("cached for TOKEN_TTL_MS, then read again", async () => {
  const stored = encryptToken(FAKE_TOKEN, { partnerId: PARTNER, env });
  const s = staffScope([{ partner_id: PARTNER, encrypted_access_token: stored }]);
  const t0 = 1_000_000;
  await getMetaCapiToken({ env, scope: s.scope, now: t0 });
  await getMetaCapiToken({ env, scope: s.scope, now: t0 + TOKEN_TTL_MS - 1 });
  assert.equal(s.calls.filter((c) => c === "asStaff").length, 1, "one read inside the window");
  const again = await getMetaCapiToken({ env, scope: s.scope, now: t0 + TOKEN_TTL_MS });
  assert.equal(again.token, FAKE_TOKEN);
  assert.equal(s.calls.filter((c) => c === "asStaff").length, 2, "read again once the window passes");
});

test("no stored row → a reason that names where it looked; the miss is cached briefly", async () => {
  const s = staffScope([]);
  const t0 = 5_000_000;
  const out = await getMetaCapiToken({ env, scope: s.scope, now: t0 });
  assert.equal(out.token, null);
  assert.match(out.reason, /META_CAPI_ACCESS_TOKEN/);
  assert.match(out.reason, /ad_platform_connections/);
  await getMetaCapiToken({ env, scope: s.scope, now: t0 + MISS_TTL_MS - 1 });
  assert.equal(s.calls.filter((c) => c === "asStaff").length, 1);
  await getMetaCapiToken({ env, scope: s.scope, now: t0 + MISS_TTL_MS });
  assert.equal(s.calls.filter((c) => c === "asStaff").length, 2);
});

test("a row that will not decrypt → a reason, never a throw, never a value", async () => {
  const stored = encryptToken(FAKE_TOKEN, { partnerId: PARTNER, env });
  const s = staffScope([{ partner_id: OTHER, encrypted_access_token: stored }]);
  const out = await getMetaCapiToken({ env, scope: s.scope });
  assert.equal(out.token, null);
  assert.match(out.reason, /did not decrypt/);
  assert.ok(!JSON.stringify(out).includes(FAKE_TOKEN));
  assert.ok(!JSON.stringify(out).includes(stored));
});

test("the key missing, or the read failing → a reason, never a throw", async () => {
  const stored = encryptToken(FAKE_TOKEN, { partnerId: PARTNER, env });
  const noKey = await getMetaCapiToken({ env: {}, scope: staffScope([{ partner_id: PARTNER, encrypted_access_token: stored }]).scope });
  assert.equal(noKey.token, null);
  assert.match(noKey.reason, /AD_TOKEN_ENC_KEY/);
  clearMetaTokenCache();
  const down = await getMetaCapiToken({ env, scope: staffScope([], { fail: true }).scope });
  assert.equal(down.token, null);
  assert.match(down.reason, /could not be read/);
});
