// /api/staff/calendar-link and staff_calendar_links (434) against real Postgres.
//
// Drives the real Netlify handler (netlify/functions/api.mjs → ROUTES), with a
// real session, the same way src/http/staff-avatar.pg.test.mjs does. The Google
// half is a fake provider handed to the sync and invite functions — nothing
// leaves the process. The table's own guards (status, address shape, org match,
// one row per person) are asserted straight against the database, and the
// unprivileged app role is asserted through APP_DATABASE_URL (src/testing/rls-pool.mjs).

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { createSession } from "../auth/session.mjs";
import { rlsIsReal, rlsPool, closeRlsPool } from "../testing/rls-pool.mjs";
import {
  MSG_WAITING, MSG_NOT_SHARED, syncBusyBlocks, connectedClosers, inviteClosersToBooking, getLink
} from "../staff/calendar-sync.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const TAG = "calendar-link.fixture";
const STAMP = `cal-link-pg-${Date.now()}`;

describe("/api/staff/calendar-link + staff_calendar_links", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let handler, org, otherOrg;
  let closerId, managerId, outsiderId, closerToken, managerToken, outsiderToken;
  const savedToken = process.env.GOOGLE_CALENDAR_OAUTH_TOKEN_JSON;

  const call = (method, token, body) => handler(new Request("https://site.netlify.app/api/staff/calendar-link", {
    method,
    headers: {
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  }), {});

  async function purge() {
    await db.query(`DELETE FROM sessions WHERE staff_id IN (SELECT id FROM staff WHERE email LIKE $1)`, [`${TAG}%`]);
    await db.query(`DELETE FROM staff_calendar_links WHERE staff_id IN (SELECT id FROM staff WHERE email LIKE $1)`, [`${TAG}%`]);
    await db.query(`DELETE FROM staff WHERE email LIKE $1`, [`${TAG}%`]);
  }

  const addStaff = async (orgId, suffix, name, role) => (await db.query(
    `INSERT INTO staff (org_id, email, name, role, status) VALUES ($1,$2,$3,$4,'active') RETURNING id`,
    [orgId, `${TAG}.${suffix}@example.com`, name, role])).rows[0].id;

  before(async () => {
    delete process.env.GOOGLE_CALENDAR_OAUTH_TOKEN_JSON; // "waiting on Chris's approval" is the starting state
    ({ default: handler } = await import("../../netlify/functions/api.mjs"));
    org = await resolveDefaultOrg(db);
    await purge();
    otherOrg = (await db.query(`INSERT INTO orgs (slug, name) VALUES ($1,'Calendar Link Pg Test') RETURNING id`, [STAMP])).rows[0].id;

    closerId = await addStaff(org, "closer", "Justice Fixture", "closer");
    managerId = await addStaff(org, "manager", "Sarah Fixture", "sales_manager");
    outsiderId = await addStaff(otherOrg, "outsider", "Other Org Fixture", "closer");
    closerToken = (await createSession(db, { staffId: closerId, orgId: org })).token;
    managerToken = (await createSession(db, { staffId: managerId, orgId: org })).token;
    outsiderToken = (await createSession(db, { staffId: outsiderId, orgId: otherOrg })).token;
  });

  after(async () => {
    if (savedToken === undefined) delete process.env.GOOGLE_CALENDAR_OAUTH_TOKEN_JSON;
    else process.env.GOOGLE_CALENDAR_OAUTH_TOKEN_JSON = savedToken;
    await purge();
    await db.query(`DELETE FROM orgs WHERE id = $1`, [otherOrg]);
    await closeRlsPool();
    await close();
  });

  /* ── the route ─────────────────────────────────────────────────────────── */

  test("signed out: 401 through the real ROUTES map", async () => {
    const r = await call("GET", null);
    assert.equal(r.status, 401);
  });

  test("GET before anything is saved: no link, waiting on Google approval", async () => {
    const r = await call("GET", closerToken);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.link, null);
    assert.equal(body.google_ready, false);
    assert.equal(typeof body.owner_email, "string");
  });

  test("PUT a bad address: 400, nothing stored", async () => {
    const r = await call("PUT", closerToken, { calendar_email: "not an address" });
    assert.equal(r.status, 400);
    assert.equal(await getLink(db, { orgId: org, staffId: closerId }), null);
  });

  test("PUT my address: stored trimmed and lower-cased, pending", async () => {
    const r = await call("PUT", closerToken, { calendar_email: "  Justice.Fixture@Example.com " });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.link.calendar_email, "justice.fixture@example.com");
    assert.equal(body.link.status, "pending");
    const row = await getLink(db, { orgId: org, staffId: closerId });
    assert.equal(row.calendar_email, "justice.fixture@example.com");
    assert.equal(row.blocks_booking, true);
  });

  test("POST check with no Google token: pending, 'Waiting on Chris's Google approval'", async () => {
    const r = await call("POST", closerToken, {});
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.result, "waiting_on_approval");
    assert.equal(body.link.status, "pending");
    assert.equal(body.link.last_error, MSG_WAITING);
    assert.ok(body.link.last_checked_at);
  });

  test("the sales manager reads and writes only their own row", async () => {
    let r = await call("GET", managerToken);
    assert.equal((await r.json()).link, null, "the closer's row is not the manager's");
    r = await call("POST", managerToken, { calendar_email: "sarah.fixture@example.com" });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).link.calendar_email, "sarah.fixture@example.com");
    const closerRow = await getLink(db, { orgId: org, staffId: closerId });
    assert.equal(closerRow.calendar_email, "justice.fixture@example.com", "untouched");
  });

  test("staff of another org get a 403 and no row", async () => {
    const r = await call("PUT", outsiderToken, { calendar_email: "outsider@example.com" });
    assert.equal(r.status, 403);
    const { rows } = await db.query(`SELECT 1 FROM staff_calendar_links WHERE staff_id = $1`, [outsiderId]);
    assert.equal(rows.length, 0);
  });

  test("changing the address starts it again at pending with no old error", async () => {
    await db.query(`UPDATE staff_calendar_links SET status='connected', last_error=NULL WHERE staff_id=$1`, [closerId]);
    let r = await call("PUT", closerToken, { calendar_email: "justice.fixture@example.com" });
    assert.equal((await r.json()).link.status, "connected", "same address keeps its status");
    r = await call("PUT", closerToken, { calendar_email: "justice.other@example.com" });
    const link = (await r.json()).link;
    assert.equal(link.status, "pending");
    assert.equal(link.last_checked_at, null);
    await call("PUT", closerToken, { calendar_email: "justice.fixture@example.com" });
  });

  /* ── the table's own guards ────────────────────────────────────────────── */

  test("guards: status, address shape, one row per person, org must match the staff member", async () => {
    await assert.rejects(db.query(`UPDATE staff_calendar_links SET status='shared' WHERE staff_id=$1`, [closerId]), /staff_calendar_links_status_ck/);
    await assert.rejects(db.query(`UPDATE staff_calendar_links SET calendar_email='Upper@Example.com' WHERE staff_id=$1`, [closerId]), /staff_calendar_links_email_ck/);
    await assert.rejects(db.query(`UPDATE staff_calendar_links SET calendar_email='nope' WHERE staff_id=$1`, [closerId]), /staff_calendar_links_email_ck/);
    await assert.rejects(db.query(
      `INSERT INTO staff_calendar_links (org_id, staff_id, calendar_email) VALUES ($1,$2,'dup@example.com')`, [org, closerId]),
    /staff_calendar_links_staff_uniq/);
    await assert.rejects(db.query(
      `INSERT INTO staff_calendar_links (org_id, staff_id, calendar_email) VALUES ($1,$2,'x@example.com')`, [otherOrg, managerId]),
    /is not in org/);
  });

  test("RLS is on and forced, with the app policy attached", async () => {
    const { rows } = await db.query(`
      SELECT c.relrowsecurity AS on, c.relforcerowsecurity AS forced,
             (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = 'staff_calendar_links') AS policies
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'staff_calendar_links'`);
    assert.deepEqual(rows[0], { on: true, forced: true, policies: 1 });
  });

  test("as the unprivileged app role (fundhub_app): read, write and update work", { skip: rlsIsReal() ? false : "APP_DATABASE_URL not set — cannot connect as fundhub_app" }, async () => {
    const app = rlsPool();
    const who = await app.query(`SELECT current_user AS u, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`);
    assert.equal(who.rows[0].u, "fundhub_app");
    assert.equal(who.rows[0].bypass, false);
    const read = await app.query(`SELECT calendar_email FROM staff_calendar_links WHERE org_id=$1 AND staff_id=$2`, [org, closerId]);
    assert.equal(read.rows[0].calendar_email, "justice.fixture@example.com");
    const upd = await app.query(`UPDATE staff_calendar_links SET last_error='app role wrote this' WHERE org_id=$1 AND staff_id=$2 RETURNING last_error`, [org, closerId]);
    assert.equal(upd.rows[0].last_error, "app role wrote this");
    await assert.rejects(app.query(`TRUNCATE staff_calendar_links`), /permission denied|must be owner/);
  });

  /* ── the sync and the invite, against these rows, with a fake Google ──── */

  function fakeProvider(calendars) {
    const log = { inserted: [], deleted: [], add: [] };
    return {
      log,
      calendarTokenPresent: () => true,
      freeBusy: async () => ({ ok: true, calendars }),
      listMirrorEvents: async () => ({ ok: true, events: [] }),
      insertEvent: async ({ event }) => { log.inserted.push(event); return { ok: true, event: { id: `n${log.inserted.length}` } }; },
      deleteEvent: async ({ eventId }) => { log.deleted.push(eventId); return { ok: true }; },
      findEventAt: async () => ({ ok: true, event: { id: "booked-call" } }),
      addAttendees: async ({ emails }) => { log.add.push(emails); return { ok: true, added: emails, already: [] }; }
    };
  }

  test("sync pass: the closer's calendar connects, the manager's is not shared yet; one block written", async () => {
    const provider = fakeProvider({
      "justice.fixture@example.com": { busy: [{ start: new Date(Date.now() + 86_400_000).toISOString(), end: new Date(Date.now() + 90_000_000).toISOString() }], errors: [] },
      "sarah.fixture@example.com": { busy: [], errors: [{ reason: "notFound" }] }
    });
    const out = await syncBusyBlocks(db, { orgId: org, provider, env: {} });
    assert.equal(out.ok, true, out.note || "");
    const closerRow = await getLink(db, { orgId: org, staffId: closerId });
    const managerRow = await getLink(db, { orgId: org, staffId: managerId });
    assert.equal(closerRow.status, "connected");
    assert.equal(closerRow.last_error, null);
    assert.equal(managerRow.status, "pending");
    assert.equal(managerRow.last_error, MSG_NOT_SHARED);
    const mine = provider.log.inserted.filter((e) => e.extendedProperties.private.staffId === closerId);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].summary, "Busy - Justice");
  });

  test("booked call: only the connected closer is invited — never the sales manager", async () => {
    await db.query(`UPDATE staff_calendar_links SET status='connected' WHERE staff_id=$1`, [managerId]);
    const closers = await connectedClosers(db, org);
    const ids = closers.map((c) => c.staff_id);
    assert.ok(ids.includes(closerId));
    assert.ok(!ids.includes(managerId));

    const provider = fakeProvider({});
    const out = await inviteClosersToBooking(db, {
      orgId: org, env: {}, provider,
      payload: { email: "lead.fixture@example.com", startTime: "2026-10-08T17:00:00.000Z" }
    });
    assert.equal(out.status, "added");
    assert.ok(provider.log.add[0].includes("justice.fixture@example.com"));
    assert.ok(!provider.log.add[0].includes("sarah.fixture@example.com"));
  });

  test("a Google blip during a sync pass leaves the closer connected, so a booking right after still invites him", async () => {
    await db.query(`UPDATE staff_calendar_links SET status='connected', last_error=NULL WHERE staff_id=$1`, [closerId]);
    const blip = {
      ...fakeProvider({}),
      freeBusy: async () => ({ ok: false, waiting: false, status: 503, error: "google calendar freeBusy returned HTTP 503" })
    };
    const out = await syncBusyBlocks(db, { orgId: org, provider: blip, env: {} });
    assert.equal(out.ok, false);
    assert.equal(out.tokenDead, false);
    const row = await getLink(db, { orgId: org, staffId: closerId });
    assert.equal(row.status, "connected");
    assert.equal(row.last_error, null);

    const provider = fakeProvider({});
    const inv = await inviteClosersToBooking(db, {
      orgId: org, env: {}, provider,
      payload: { email: "lead.fixture@example.com", startTime: "2026-10-08T17:00:00.000Z" }
    });
    assert.equal(inv.status, "added");
    assert.ok(provider.log.add[0].includes("justice.fixture@example.com"));
  });

  test("a suspended closer is not invited and blocks nothing", async () => {
    await db.query(`UPDATE staff SET status='suspended' WHERE id=$1`, [closerId]);
    try {
      const ids = (await connectedClosers(db, org)).map((c) => c.staff_id);
      assert.ok(!ids.includes(closerId));
    } finally {
      await db.query(`UPDATE staff SET status='active' WHERE id=$1`, [closerId]);
    }
  });
});
