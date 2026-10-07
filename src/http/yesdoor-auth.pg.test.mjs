// Postgres-backed tests for Yesdoor sign-in and the principal gates:
//   POST /api/yesdoor/auth/link    GET|POST /api/yesdoor/auth/verify
// and requireYdStaff / requireYdAccount across the session doors.
//
// Proved: a link works once; every failure looks the same; the answer is the same
// for a known and an unknown address; requesting a link creates no account; a
// renter's account is made at verification; rate limits hold; sessions slide and
// can be revoked; and the wrong principal gets 401/403 on every door.
//
// SCRATCH database only, as fundhub_app. Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture, call } from "../yesdoor/testing/fixture.mjs";
import { _resetYdOrgCache } from "../yesdoor/store/org.mjs";
import { requestMagicLink, verifyMagicLink } from "../yesdoor/auth/magic-link.mjs";
import { createAccountSession, verifyAccountSession, revokeAccountSession } from "../yesdoor/auth/session.mjs";
import { hashToken } from "../auth/session.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("yesdoor sign-in", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let link, verify, fx, doors;
  const ip = (n) => `203.0.113.${n}`;

  before(async () => {
    ({ default: link } = await import("../../api/yesdoor/auth/link.mjs"));
    ({ default: verify } = await import("../../api/yesdoor/auth/verify.mjs"));
    fx = await buildYdFixture(db);
    process.env.YD_ORG_SLUG = fx.slugA;
    _resetYdOrgCache();
    doors = {
      me: (await import("../../api/yesdoor/me.mjs")).default,
      buildingRenters: (await import("../../api/yesdoor/building/renters.mjs")).default,
      brokerRenters: (await import("../../api/yesdoor/broker/renters.mjs")).default,
      staffPipeline: (await import("../../api/yesdoor/staff/pipeline.mjs")).default,
      staffRenter: (await import("../../api/yesdoor/staff/renter.mjs")).default,
      staffLedger: (await import("../../api/yesdoor/staff/ledger.mjs")).default
    };
  });
  after(async () => { delete process.env.YD_ORG_SLUG; await close(); });

  // Each test asks for links with its own broker so the per-address rate limit (3 per
  // 15 minutes) is only ever hit by the test that means to hit it.
  let n = 0;
  const freshBroker = async () => {
    const email = `fb${++n}-${fx.rand}@example.test`;
    const b = (await db.query(
      `INSERT INTO yd_brokers (org_id, name, email, status) VALUES ($1,'Fresh Broker',$2,'active') RETURNING id`,
      [fx.orgA, email])).rows[0].id;
    await db.query(`INSERT INTO yd_accounts (org_id, kind, email, broker_id) VALUES ($1,'broker',$2,$3)`, [fx.orgA, email, b]);
    return email;
  };

  const rowsFor = async (email) => (await db.query(
    `SELECT * FROM yd_magic_links WHERE org_id = $1 AND email = $2 ORDER BY created_at`, [fx.orgA, email])).rows;
  const outboxFor = async (email) => (await db.query(
    `SELECT * FROM yd_outbox WHERE org_id = $1 AND to_address = $2 AND template_key = 'yd-magic-link' ORDER BY created_at`,
    [fx.orgA, email])).rows;

  test("a known address and an unknown one get the SAME answer", async () => {
    const known = await call(link, { method: "POST", body: { email: `rita+a${fx.rand}@example.test` }, headers: { "x-forwarded-for": ip(1) } });
    const unknown = await call(link, { method: "POST", body: { email: `nobody-${fx.rand}@example.test` }, headers: { "x-forwarded-for": ip(2) } });
    assert.equal(known.code, 200);
    assert.equal(unknown.code, 200);
    assert.deepEqual(known.body, unknown.body, "the response tells a stranger which addresses have an account");
    assert.ok(!("outcome" in known.body));
    assert.ok(!("token" in known.body));
  });

  test("an unknown address queues no email and creates no account, but leaves a receipt", async () => {
    const email = `ghost-${fx.rand}@example.test`;
    await call(link, { method: "POST", body: { email }, headers: { "x-forwarded-for": ip(3) } });
    assert.equal((await outboxFor(email)).length, 0, "an email was queued for a stranger");
    const acct = await db.query(`SELECT 1 FROM yd_accounts WHERE org_id = $1 AND email = $2`, [fx.orgA, email]);
    assert.equal(acct.rows.length, 0, "requesting a link created an account");
    const receipts = await rowsFor(email);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].outcome, "no_account");
    assert.equal(receipts[0].token_hash, null);
  });

  test("a known address queues one email whose context carries the login link; only a hash is stored", async () => {
    const email = await freshBroker();
    const r = await requestMagicLink(db, { email, orgId: fx.orgA, ip: ip(4) });
    assert.equal(r.outcome, "issued");
    assert.ok(r.token && r.token.length >= 40);
    const stored = (await rowsFor(email))[0];
    assert.equal(stored.token_hash, hashToken(r.token));
    assert.notEqual(stored.token_hash, r.token);
    const mail = (await outboxFor(email))[0];
    assert.equal(mail.status, "queued", "nothing transmits: the email waits in the outbox");
    assert.equal(mail.channel, "email");
    assert.match(mail.context.magic_link.url, /\/yesdoor\/login\.html\?t=/);
    assert.ok(mail.context.magic_link.url.includes(encodeURIComponent(r.token)));
    assert.equal(mail.context.magic_link.expires_minutes, "15");
  });

  test("a link works once, and the second try fails exactly like a forged token", async () => {
    const email = await freshBroker();
    const r = await requestMagicLink(db, { email, orgId: fx.orgA, ip: ip(5) });
    const first = await call(verify, { query: { t: r.token } });
    assert.equal(first.code, 200);
    assert.equal(first.body.ok, true);
    assert.equal(first.body.principal.kind, "broker");
    assert.ok(first.body.token);
    assert.equal(first.headers["cache-control"], "no-store");

    const second = await call(verify, { query: { t: r.token } });
    const forged = await call(verify, { query: { t: "forged-token-that-was-never-issued" } });
    assert.equal(second.code, 401);
    assert.equal(forged.code, 401);
    assert.deepEqual(second.body, forged.body, "a spent link is distinguishable from a forged one");
    assert.equal(second.body.error, "invalid_link");
  });

  test("two arrivals at the same instant: exactly one wins", async () => {
    const r = await requestMagicLink(db, { email: await freshBroker(), orgId: fx.orgA, ip: ip(6) });
    const results = await Promise.all([verifyMagicLink(db, r.token), verifyMagicLink(db, r.token), verifyMagicLink(db, r.token)]);
    assert.equal(results.filter((x) => x.ok).length, 1);
  });

  test("POST /verify with the token in the body works too, and a missing token is a 400", async () => {
    const r = await requestMagicLink(db, { email: await freshBroker(), orgId: fx.orgA, ip: ip(7) });
    const ok = await call(verify, { method: "POST", body: { token: r.token } });
    assert.equal(ok.code, 200);
    assert.equal((await call(verify, { query: {} })).code, 400);
    assert.equal((await call(verify, { method: "POST", body: {} })).code, 400);
    assert.equal((await call(verify, { method: "PUT" })).code, 405);
  });

  test("an expired link fails like any other", async () => {
    const r = await requestMagicLink(db, { email: await freshBroker(), orgId: fx.orgA, ip: ip(8) });
    await db.query(`UPDATE yd_magic_links SET expires_at = now() - interval '1 minute' WHERE id = $1`, [r.linkId]);
    const out = await call(verify, { query: { t: r.token } });
    assert.equal(out.code, 401);
    assert.equal(out.body.error, "invalid_link");
  });

  test("a renter with no account gets one AT VERIFICATION, not at request", async () => {
    const email = `fresh-${fx.rand}@example.test`;
    const renterId = (await db.query(
      `INSERT INTO yd_renters (org_id, email, first_name, last_name) VALUES ($1,$2,'Fresh','Renter') RETURNING id`,
      [fx.orgA, email])).rows[0].id;

    const r = await requestMagicLink(db, { email, orgId: fx.orgA, ip: ip(9) });
    assert.equal(r.outcome, "issued");
    const before = await db.query(`SELECT 1 FROM yd_accounts WHERE org_id = $1 AND renter_id = $2`, [fx.orgA, renterId]);
    assert.equal(before.rows.length, 0, "the account was created when the link was only requested");

    const out = await call(verify, { query: { t: r.token } });
    assert.equal(out.code, 200);
    assert.equal(out.body.principal.kind, "renter");
    assert.equal(out.body.principal.renterId, renterId);
    const after = await db.query(`SELECT kind, status FROM yd_accounts WHERE org_id = $1 AND renter_id = $2`, [fx.orgA, renterId]);
    assert.deepEqual(after.rows, [{ kind: "renter", status: "active" }]);

    // And that session reaches the renter door.
    const me = await call(doors.me, { token: out.body.token });
    assert.equal(me.code, 200);
    assert.equal(me.body.renter.id, renterId);
  });

  test("a suspended account gets the uniform answer but never a working link", async () => {
    const email = `susp-${fx.rand}@example.test`;
    const acct = (await db.query(
      `INSERT INTO yd_accounts (org_id, kind, email, status) VALUES ($1,'building_user',$2,'suspended') RETURNING id`,
      [fx.orgA, email])).rows[0].id;
    const asked = await call(link, { method: "POST", body: { email }, headers: { "x-forwarded-for": ip(10) } });
    assert.equal(asked.code, 200);
    const rec = (await rowsFor(email))[0];
    assert.equal(rec.outcome, "not_eligible");
    assert.equal(rec.token_hash, null);
    assert.equal((await outboxFor(email)).length, 0);

    // A link sent BEFORE the suspension is dead on arrival.
    await db.query(`UPDATE yd_accounts SET status = 'active' WHERE id = $1`, [acct]);
    const live = await requestMagicLink(db, { email, orgId: fx.orgA, ip: ip(11) });
    await db.query(`UPDATE yd_accounts SET status = 'suspended' WHERE id = $1`, [acct]);
    const out = await call(verify, { query: { t: live.token } });
    assert.equal(out.code, 401);
    assert.equal(out.body.error, "invalid_link");
  });

  test("rate limit: the 4th request for one address inside the window is a 429", async () => {
    const email = `limit-${fx.rand}@example.test`;
    const codes = [];
    for (let i = 0; i < 4; i++) {
      codes.push((await call(link, { method: "POST", body: { email }, headers: { "x-forwarded-for": ip(20 + i) } })).code);
    }
    assert.deepEqual(codes, [200, 200, 200, 429]);
    const blocked = await call(link, { method: "POST", body: { email }, headers: { "x-forwarded-for": ip(40) } });
    assert.equal(blocked.code, 429);
    assert.equal(blocked.headers["retry-after"], String(15 * 60));
  });

  test("link endpoint: POST only, and a malformed address is a 400", async () => {
    assert.equal((await call(link, { method: "GET" })).code, 405);
    const bad = await call(link, { method: "POST", body: { email: "not an email" } });
    assert.equal(bad.code, 400);
    assert.equal(bad.body.error, "email_required");
    assert.equal((await call(link, { method: "POST", body: {} })).code, 400);
  });

  test("sessions: 30 days, sliding, revocable, and a suspension takes effect on the next request", async () => {
    const created = await createAccountSession(db, { accountId: fx.A.acctRenter, orgId: fx.orgA, ip: ip(50) });
    const days = (new Date(created.expiresAt) - Date.now()) / 86400000;
    assert.ok(days > 29.9 && days <= 30.01, `session lasts ${days} days, not 30`);

    // Slides forward on use.
    await db.query(`UPDATE yd_sessions SET expires_at = now() + interval '1 day' WHERE id = $1`, [created.sessionId]);
    const v = await verifyAccountSession(db, created.token);
    assert.ok(v);
    assert.equal(v.principal.kind, "renter");
    assert.equal(v.principal.renterId, fx.A.renter1);
    const slid = (await db.query(`SELECT expires_at FROM yd_sessions WHERE id = $1`, [created.sessionId])).rows[0].expires_at;
    assert.ok((new Date(slid) - Date.now()) / 86400000 > 29);

    assert.equal(await revokeAccountSession(db, created.token), true);
    assert.equal(await verifyAccountSession(db, created.token), null);
    assert.equal(await revokeAccountSession(db, created.token), false, "revoking twice reports the second as a no-op");

    const second = await createAccountSession(db, { accountId: fx.A.acctRenter, orgId: fx.orgA });
    await db.query(`UPDATE yd_accounts SET status = 'suspended' WHERE id = $1`, [fx.A.acctRenter]);
    assert.equal(await verifyAccountSession(db, second.token), null);
    await db.query(`UPDATE yd_accounts SET status = 'active' WHERE id = $1`, [fx.A.acctRenter]);
  });

  test("only the hash of a session token is stored", async () => {
    const s = await createAccountSession(db, { accountId: fx.A.acctBroker, orgId: fx.orgA });
    const row = (await db.query(`SELECT token_hash FROM yd_sessions WHERE id = $1`, [s.sessionId])).rows[0];
    assert.equal(row.token_hash, hashToken(s.token));
    assert.notEqual(row.token_hash, s.token);
  });

  test("a building user's session carries only the buildings linked to them", async () => {
    const v = await verifyAccountSession(db, fx.tokens.buildingA);
    assert.deepEqual(v.principal.buildingIds, [fx.A.bSigned]);
    assert.ok(!v.principal.buildingIds.includes(fx.A.bOther));
  });

  // ── the wrong principal, on every door ───────────────────────────────────

  test("no session at all: 401 on every session door", async () => {
    for (const [name, h] of Object.entries(doors)) {
      const r = await call(h, {});
      assert.equal(r.code, 401, `${name} answered ${r.code} to nobody`);
      assert.equal(r.body.ok, false);
    }
  });

  test("a garbage token: 401 on every session door", async () => {
    for (const [name, h] of Object.entries(doors)) {
      const r = await call(h, { token: "garbage-token" });
      assert.equal(r.code, 401, `${name} answered ${r.code} to a garbage token`);
    }
  });

  test("each account kind is refused at the other kinds' doors (403), and staff tokens are not account sessions (401)", async () => {
    const t = fx.tokens;
    // renter door
    assert.equal((await call(doors.me, { token: t.buildingA })).code, 403);
    assert.equal((await call(doors.me, { token: t.brokerA })).code, 403);
    assert.equal((await call(doors.me, { token: t.opsA })).code, 401);
    assert.equal((await call(doors.me, { token: t.ownerA })).code, 401);
    // building door
    assert.equal((await call(doors.buildingRenters, { token: t.renterA })).code, 403);
    assert.equal((await call(doors.buildingRenters, { token: t.brokerA })).code, 403);
    assert.equal((await call(doors.buildingRenters, { token: t.opsA })).code, 401);
    // broker door
    assert.equal((await call(doors.brokerRenters, { token: t.renterA })).code, 403);
    assert.equal((await call(doors.brokerRenters, { token: t.buildingA })).code, 403);
    assert.equal((await call(doors.brokerRenters, { token: t.ownerA })).code, 401);
  });

  test("staff doors: an account session is a 401, a Fundhub-style role is a 403, the right role gets in", async () => {
    const t = fx.tokens;
    for (const acct of [t.renterA, t.buildingA, t.brokerA]) {
      assert.equal((await call(doors.staffPipeline, { token: acct })).code, 401);
      assert.equal((await call(doors.staffRenter, { token: acct, query: { id: fx.A.renter1 } })).code, 401);
    }
    const closer = await call(doors.staffPipeline, { token: t.closerA });
    assert.equal(closer.code, 403, "a staff role outside the Yesdoor set got in");
    assert.deepEqual(closer.body.required.sort(), ["collections", "ops", "sales"]);
    for (const tok of [t.opsA, t.salesA, t.collectionsA, t.ownerA]) {
      assert.equal((await call(doors.staffPipeline, { token: tok })).code, 200);
    }
  });

  test("credit doors are ops/owner only; the money door is ops/collections/owner", async () => {
    const t = fx.tokens;
    const q = { id: fx.A.renter1 };
    assert.equal((await call(doors.staffRenter, { token: t.opsA, query: q })).code, 200);
    assert.equal((await call(doors.staffRenter, { token: t.ownerA, query: q })).code, 200);
    assert.equal((await call(doors.staffRenter, { token: t.salesA, query: q })).code, 403);
    assert.equal((await call(doors.staffRenter, { token: t.collectionsA, query: q })).code, 403);
    assert.equal((await call(doors.staffRenter, { token: t.closerA, query: q })).code, 403);

    assert.equal((await call(doors.staffLedger, { token: t.collectionsA })).code, 200);
    assert.equal((await call(doors.staffLedger, { token: t.opsA })).code, 200);
    assert.equal((await call(doors.staffLedger, { token: t.salesA })).code, 403);
  });

  test("a suspended staff member loses the staff doors on the next request", async () => {
    const t = fx.tokens.salesA;
    assert.equal((await call(doors.staffPipeline, { token: t })).code, 200);
    await db.query(`UPDATE staff SET status = 'suspended' WHERE id = $1`, [fx.staffIds.salesA]);
    assert.equal((await call(doors.staffPipeline, { token: t })).code, 401);
    await db.query(`UPDATE staff SET status = 'active' WHERE id = $1`, [fx.staffIds.salesA]);
  });

  test("the cookie works as a session carrier on an account door", async () => {
    const r = await call(doors.me, { headers: { cookie: `other=1; yesdoor_session=${encodeURIComponent(fx.tokens.renterA)}` } });
    assert.equal(r.code, 200);
    // A malformed escape is not a token, and must not crash the door.
    const bad = await call(doors.me, { headers: { cookie: "yesdoor_session=%zz" } });
    assert.equal(bad.code, 401);
  });
});
