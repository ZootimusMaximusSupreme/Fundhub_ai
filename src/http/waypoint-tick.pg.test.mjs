// POST /api/waypoint-tick against a real Postgres.
//
// WHAT THIS PROVES (owner-set 2026-09-17 — clients tick steps off one at a time):
//   (a) a client closes their OWN self-attested step, and can take it back;
//   (b) paydown and no_new_credit are refused SERVER-SIDE, even when the request
//       is sent by hand with no checkbox anywhere near it;
//   (c) client A cannot touch client B's step, and the answer is the same 404 a
//       step that does not exist gets. (c) runs through APP_DATABASE_URL when it
//       is set — the unprivileged fundhub_app role, which does not bypass
//       row-level security. As the superuser it would prove nothing
//       (CLAUDE.md §12), so the role it ran as is printed and checked.
//
// Lives under src/http/ because npm test's glob never reaches api/ (§12).
// Skipped without DATABASE_URL, like every other *.pg.test.mjs. A skipped
// .pg.test.mjs is not green.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { db, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { createAccountSession } from "../auth/account-session.mjs";
import { createSession } from "../auth/session.mjs";
import { upsertWaypoint } from "../waypoints/store.mjs";
import { UNTICK_REASON } from "../waypoints/self-attest.mjs";
import handler from "../../api/waypoint-tick.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL || "";

const EMAIL_LIKE = "wt.pg.test.%@example.com";
const ACCT_LIKE = "wt_pg_test_%@example.com";
const STAFF_EMAIL = "wt_pg_test_staff@example.com";

const res = () => {
  const r = { code: null, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; return r; };
  return r;
};

describe("/api/waypoint-tick", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let org, staffToken, appPool = null;
  const c = {};   // name → { id, token, wp: { key → id } }

  const post = async (token, body, database = db) => {
    const r = res();
    const headers = token ? { authorization: "Bearer " + token } : {};
    await handler({ method: "POST", headers, body }, r, { db: database });
    return r;
  };

  const rowOf = async (id) =>
    (await db.query(`SELECT * FROM client_waypoints WHERE id = $1`, [id])).rows[0];

  async function makeClient(name) {
    const id = (await db.query(
      `INSERT INTO clients (org_id, first_name, last_name, email, custom_fields)
       VALUES ($1,$2,'Tick',$3,'{}'::jsonb) RETURNING id`,
      [org, name, `wt.pg.test.${name}@example.com`]
    )).rows[0].id;
    const accountId = (await db.query(
      `INSERT INTO accounts (org_id, kind, email, name, status, client_id, password_hash)
       VALUES ($1,'client',$2,$3,'active',$4,'scrypt$placeholder') RETURNING id`,
      [org, `wt_pg_test_${name}@example.com`, name, id]
    )).rows[0].id;
    const token = (await createAccountSession(db, { accountId, orgId: org })).token;

    // The real catalog shapes (db/migrations/362): two self-attested steps,
    // the paydown and the no-new-credit rule, plus one step that is OURS.
    const wp = {};
    const add = async (key, title, position, ownerKind, verifyKind, params = null) => {
      wp[key] = (await upsertWaypoint(db, {
        orgId: org, clientId: id, key, title, position, ownerKind, verifyKind, params
      })).id;
    };
    await add("paydown_capital_one", "Pay Capital One down to $300", 10, "client", "paydown",
      { target_cents: 30000 });
    await add("no_new_credit", "Do not open new credit while we work on your file", 20, "client", "no_new_credit");
    await add("form_llc", "File your LLC", 40, "client", null);
    await add("get_ein", "Get your EIN from the IRS", 50, "client", null);
    await add("review_file", "We review your file", 5, "fundhub", null);
    c[name] = { id, token, wp };
  }

  async function purge() {
    const ids = (await db.query(`SELECT id FROM clients WHERE email LIKE $1`, [EMAIL_LIKE]))
      .rows.map((x) => x.id);
    if (ids.length) {
      await db.query(`DELETE FROM client_waypoints WHERE client_id = ANY($1)`, [ids]);
      await db.query(`DELETE FROM account_sessions WHERE account_id IN
                        (SELECT id FROM accounts WHERE email LIKE $1)`, [ACCT_LIKE]);
      await db.query(`DELETE FROM accounts WHERE email LIKE $1`, [ACCT_LIKE]);
      await db.query(`DELETE FROM clients WHERE id = ANY($1)`, [ids]);
    }
    await db.query(`DELETE FROM sessions WHERE staff_id IN (SELECT id FROM staff WHERE email = $1)`,
      [STAFF_EMAIL]).catch(() => {});
    await db.query(`DELETE FROM staff WHERE email = $1`, [STAFF_EMAIL]);
  }

  before(async () => {
    org = await resolveDefaultOrg(db);
    await purge();
    await makeClient("alice");
    await makeClient("bob");
    const staffId = (await db.query(
      `INSERT INTO staff (org_id, name, email, role, status)
       VALUES ($1,'WT Tester',$2,'owner','active') RETURNING id`,
      [org, STAFF_EMAIL]
    )).rows[0].id;
    staffToken = (await createSession(db, { staffId, orgId: org })).token;
    if (APP_URL) appPool = new pg.Pool({ connectionString: APP_URL, max: 2 });
  });

  after(async () => {
    await purge();
    if (appPool) await appPool.end();
    await close();
  });

  // ── (a) the client's own self-attested step ────────────────────────────────
  test("(a) a client ticks their own LLC step and it is done in the database", async () => {
    const id = c.alice.wp.form_llc;
    const r = await post(c.alice.token, { waypoint_id: id, done: true });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true);
    assert.equal(r.body.changed, true);
    assert.equal(r.body.waypoint.state, "done");
    assert.equal(r.body.waypoint.closedBy, "client");
    const row = await rowOf(id);
    assert.equal(row.state, "done");
    assert.ok(row.completed_at, "completed_at is written with state, by completeWaypoint()");

    const again = await post(c.alice.token, { waypoint_id: id, done: true });
    assert.equal(again.code, 200);
    assert.equal(again.body.changed, false, "ticking a done step twice changes nothing");
  });

  test("(a) and a client can untick a step they ticked by mistake", async () => {
    const id = c.alice.wp.form_llc;
    const r = await post(c.alice.token, { waypoint_id: id, done: false });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.waypoint.state, "not_started");
    const row = await rowOf(id);
    assert.equal(row.state, "not_started");
    assert.strictEqual(row.completed_at, null);
    assert.equal(row.state_reason, UNTICK_REASON, "taken back, and the row says so");
  });

  test("(a) one tick closes ONE step — the others are untouched", async () => {
    await post(c.alice.token, { waypoint_id: c.alice.wp.get_ein, done: true });
    assert.equal((await rowOf(c.alice.wp.get_ein)).state, "done");
    assert.equal((await rowOf(c.alice.wp.form_llc)).state, "not_started");
  });

  // ── (b) the data-closed and never-closed kinds, sent by hand ───────────────
  test("(b) paydown is refused server-side, and the row does not move", async () => {
    const id = c.alice.wp.paydown_capital_one;
    for (const done of [true, false]) {
      const r = await post(c.alice.token, { waypoint_id: id, done });
      assert.equal(r.code, 409, JSON.stringify(r.body));
      assert.equal(r.body.error, "not_tickable");
      assert.equal(r.body.reason, "closes_on_credit_report");
      assert.match(r.body.message, /credit report/);
    }
    const row = await rowOf(id);
    assert.equal(row.state, "not_started");
    assert.strictEqual(row.completed_at, null);
  });

  test("(b) no_new_credit is refused server-side, and the row does not move", async () => {
    const id = c.alice.wp.no_new_credit;
    const r = await post(c.alice.token, { waypoint_id: id, done: true });
    assert.equal(r.code, 409, JSON.stringify(r.body));
    assert.equal(r.body.reason, "ongoing_rule");
    assert.equal((await rowOf(id)).state, "not_started");
  });

  test("(b) paydown already closed by a credit report cannot be unticked by the client", async () => {
    const id = c.alice.wp.paydown_capital_one;
    await db.query(`UPDATE client_waypoints SET state='done', completed_at=now() WHERE id=$1`, [id]);
    const r = await post(c.alice.token, { waypoint_id: id, done: false });
    assert.equal(r.code, 409);
    assert.equal(r.body.reason, "closes_on_credit_report");
    assert.equal((await rowOf(id)).state, "done", "the data closed it and only the data reopens it");
  });

  test("(b) a step that is OURS is refused too", async () => {
    const r = await post(c.alice.token, { waypoint_id: c.alice.wp.review_file, done: true });
    assert.equal(r.code, 409);
    assert.equal(r.body.reason, "our_step");
    assert.equal((await rowOf(c.alice.wp.review_file)).state, "not_started");
  });

  // ── (c) isolation, as the unprivileged app role ────────────────────────────
  test("(c) client A cannot tick client B's step, and 'not yours' looks exactly like 'not there'",
    async (t) => {
      const iso = appPool || db;
      const who = (await iso.query(
        `SELECT current_user AS role, r.rolsuper, r.rolbypassrls
           FROM pg_roles r WHERE r.rolname = current_user`
      )).rows[0];
      t.diagnostic(`isolation ran as ${who.role} (superuser=${who.rolsuper}, bypassrls=${who.rolbypassrls})`);
      if (APP_URL) {
        assert.equal(who.rolsuper, false, "APP_DATABASE_URL must be the unprivileged role");
        assert.equal(who.rolbypassrls, false);
      }

      const bobsStep = c.bob.wp.form_llc;
      const theirs = await post(c.alice.token, { waypoint_id: bobsStep, done: true }, iso);
      const nowhere = await post(c.alice.token,
        { waypoint_id: "00000000-0000-4000-8000-000000000000", done: true }, iso);

      assert.equal(theirs.code, 404, JSON.stringify(theirs.body));
      assert.deepEqual(theirs.body, nowhere.body, "the two answers must be identical");
      assert.deepEqual(theirs.body, { ok: false, error: "not_found" });

      // Naming Bob in the body changes nothing: the client comes off the session.
      const spoof = await post(c.alice.token,
        { waypoint_id: bobsStep, done: true, client_id: c.bob.id }, iso);
      assert.equal(spoof.code, 404);

      // Untick is held to the same line.
      await db.query(`UPDATE client_waypoints SET state='done', completed_at=now() WHERE id=$1`,
        [c.bob.wp.get_ein]);
      const undo = await post(c.alice.token, { waypoint_id: c.bob.wp.get_ein, done: false }, iso);
      assert.equal(undo.code, 404);

      assert.equal((await rowOf(bobsStep)).state, "not_started", "Bob's LLC step did not move");
      assert.equal((await rowOf(c.bob.wp.get_ein)).state, "done", "Bob's EIN step did not move");

      // And Bob can still tick his own, through the same role.
      const own = await post(c.bob.token, { waypoint_id: bobsStep, done: true }, iso);
      assert.equal(own.code, 200, JSON.stringify(own.body));
    });

  // ── who may call it at all ─────────────────────────────────────────────────
  test("no session is 401, a staff session is 403 — this door is for clients", async () => {
    assert.equal((await post(null, { waypoint_id: c.alice.wp.form_llc, done: true })).code, 401);
    assert.equal((await post(staffToken, { waypoint_id: c.alice.wp.form_llc, done: true })).code, 403);
  });

  test("a bad id or a missing done flag is a 400, not a guess", async () => {
    assert.equal((await post(c.alice.token, { waypoint_id: "nope", done: true })).code, 400);
    const r = await post(c.alice.token, { waypoint_id: c.alice.wp.form_llc, done: "yes" });
    assert.equal(r.code, 400);
    assert.equal(r.body.error, "done_required");
  });

  test("GET is 405", async () => {
    const r = res();
    await handler({ method: "GET", headers: {} }, r);
    assert.equal(r.code, 405);
  });
});
