// Postgres-backed tests for sign-out:  POST /api/yesdoor/auth/logout
//
// Proved: the session named by the request is revoked at once (the same token then
// gets 401 on every portal door); other sessions of the same account and other
// people's sessions are untouched; it is safe to call twice or with nothing, a
// garbage token or an expired one; the token may arrive as a Bearer header or as the
// yesdoor_session cookie; a STAFF token sent here revokes nothing and keeps working;
// only POST is answered.
//
// SCRATCH database only, as fundhub_app. Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture, call } from "../yesdoor/testing/fixture.mjs";
import { createAccountSession, verifyAccountSession } from "../yesdoor/auth/session.mjs";
import { hashToken } from "../auth/session.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("yesdoor sign-out", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, h;
  const out = (opts = {}) => call(h.logout, { method: "POST", ...opts });
  const newSession = async (accountId, orgId = fx.orgA) => (await createAccountSession(db, { accountId, orgId })).token;
  const revokedAt = async (token) => (await db.query(`SELECT revoked_at FROM yd_sessions WHERE token_hash = $1`, [hashToken(token)])).rows[0]?.revoked_at;

  before(async () => {
    fx = await buildYdFixture(db);
    h = {
      logout: (await import("../../api/yesdoor/auth/logout.mjs")).default,
      me: (await import("../../api/yesdoor/me.mjs")).default,
      bRenters: (await import("../../api/yesdoor/building/renters.mjs")).default,
      kLink: (await import("../../api/yesdoor/broker/link.mjs")).default,
      pipeline: (await import("../../api/yesdoor/staff/pipeline.mjs")).default
    };
  });
  after(async () => { await close(); });

  test("a renter signs out: the token is revoked and the very next request is a 401", async () => {
    const token = await newSession(fx.A.acctRenter);
    assert.equal((await call(h.me, { token })).code, 200);
    const r = await out({ token });
    assert.equal(r.code, 200);
    assert.deepEqual(r.body, { ok: true, revoked: true });
    assert.ok(await revokedAt(token), "the yd_sessions row carries a revoked_at");
    assert.equal((await call(h.me, { token })).code, 401);
    assert.equal(await verifyAccountSession(db, token), null);
  });

  test("a building user and a broker sign out the same way", async () => {
    const b = await newSession(fx.A.acctBuilding);
    const k = await newSession(fx.A.acctBroker);
    assert.equal((await call(h.bRenters, { token: b })).code, 200);
    assert.equal((await call(h.kLink, { token: k })).code, 200);
    assert.equal((await out({ token: b })).body.revoked, true);
    assert.equal((await out({ token: k })).body.revoked, true);
    assert.equal((await call(h.bRenters, { token: b })).code, 401);
    assert.equal((await call(h.kLink, { token: k })).code, 401);
  });

  test("it signs out THIS session only: the same account's other session and other people stay signed in", async () => {
    const here = await newSession(fx.A.acctRenter);
    const phone = await newSession(fx.A.acctRenter);
    await out({ token: here });
    assert.equal((await call(h.me, { token: here })).code, 401);
    assert.equal((await call(h.me, { token: phone })).code, 200, "the same account on a phone is still signed in");
    assert.equal((await call(h.kLink, { token: fx.tokens.brokerA })).code, 200, "another account is untouched");
    assert.equal((await call(h.me, { token: fx.tokens.renterB })).code, 200, "another org is untouched");
  });

  test("signing out twice, with nothing, with garbage, or with an expired token is a harmless 200", async () => {
    const token = await newSession(fx.A.acctRenter);
    assert.equal((await out({ token })).body.revoked, true);
    const again = await out({ token });
    assert.equal(again.code, 200);
    assert.deepEqual(again.body, { ok: true, revoked: false });

    for (const opts of [{}, { token: "not-a-real-token" }, { headers: { authorization: "Bearer " } }, { headers: { authorization: "Basic abc" } }]) {
      const r = await out(opts);
      assert.equal(r.code, 200, JSON.stringify(opts));
      assert.equal(r.body.revoked, false);
    }

    const old = await newSession(fx.A.acctRenter);
    await db.query(`UPDATE yd_sessions SET expires_at = now() - interval '1 day' WHERE token_hash = $1`, [hashToken(old)]);
    assert.equal((await out({ token: old })).code, 200);
  });

  test("the token may come as the yesdoor_session cookie or x-session-token, and the cookie is cleared", async () => {
    const viaCookie = await newSession(fx.A.acctRenter);
    const r = await out({ headers: { cookie: `other=1; yesdoor_session=${encodeURIComponent(viaCookie)}` } });
    assert.equal(r.body.revoked, true);
    assert.match(r.headers["set-cookie"], /^yesdoor_session=; .*Max-Age=0/);
    assert.equal(r.headers["cache-control"], "no-store");
    assert.equal((await call(h.me, { token: viaCookie })).code, 401);

    const viaHeader = await newSession(fx.A.acctRenter);
    assert.equal((await out({ headers: { "x-session-token": viaHeader } })).body.revoked, true);
  });

  test("staff are untouched: a staff token sent here is not revoked and keeps working", async () => {
    const before = await call(h.pipeline, { token: fx.tokens.opsA });
    assert.equal(before.code, 200);
    const r = await out({ token: fx.tokens.opsA });
    assert.equal(r.code, 200);
    assert.equal(r.body.revoked, false, "a staff session is not a yd session");
    assert.equal((await call(h.pipeline, { token: fx.tokens.opsA })).code, 200);
    assert.equal((await call(h.pipeline, { token: fx.tokens.ownerA })).code, 200);
  });

  test("an account suspended after sign-out stays signed out (revocation is not undone by anything else)", async () => {
    const token = await newSession(fx.A.acctRenter);
    await out({ token });
    await db.query(`UPDATE yd_accounts SET status = 'suspended' WHERE id = $1`, [fx.A.acctRenter]);
    await db.query(`UPDATE yd_accounts SET status = 'active' WHERE id = $1`, [fx.A.acctRenter]);
    assert.equal((await call(h.me, { token })).code, 401);
  });

  test("only POST: GET, PUT and DELETE are a 405 with an allow header, and revoke nothing", async () => {
    const token = await newSession(fx.A.acctRenter);
    for (const method of ["GET", "PUT", "DELETE"]) {
      const r = await call(h.logout, { method, token });
      assert.equal(r.code, 405, method);
      assert.equal(r.headers.allow, "POST");
    }
    assert.equal((await call(h.me, { token })).code, 200, "a refused method signed nobody out");
  });
});
