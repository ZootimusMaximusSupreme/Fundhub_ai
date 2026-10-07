// /api/staff/calendar-link — auth, role, org and input checks, with stubs.
// The real-database run is staff-calendar-link.pg.test.mjs beside this file.

import { test } from "node:test";
import assert from "node:assert/strict";

import handler from "../../api/staff/calendar-link.mjs";

const ORG = "00000000-0000-0000-0000-00000000000a";

function fakeRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    json(o) { this.body = o; return this; }
  };
}

const asStaff = (staff) => async () => staff;
const signedOut = async (_req, res) => { res.status(401).json({ ok: false, error: "unauthorized" }); return null; };
const CLOSER = { id: "s1", org_id: ORG, role: "closer", email: "justice.nikkel@fundhub.ai" };

/* Records the statements; answers the link reads and writes with one row. */
function fakeDb() {
  const seen = [];
  return {
    seen,
    async query(sql, params) {
      seen.push({ sql, params });
      if (/INSERT INTO staff_calendar_links/.test(sql)) {
        return { rows: [{ calendar_email: params[2], status: "pending", last_error: null, blocks_booking: true }] };
      }
      return { rows: [] };
    }
  };
}

async function call({ method = "GET", body, staff = CLOSER, requireAuth, env = {}, db = fakeDb(), provider } = {}) {
  const res = fakeRes();
  await handler({ method, body, headers: {} }, res, {
    db, env, defaultOrg: ORG, provider,
    requireAuth: requireAuth || asStaff(staff)
  });
  return { res, db };
}

test("signed out is a 401 from requireAuth, and nothing is read", async () => {
  const { res, db } = await call({ requireAuth: signedOut });
  assert.equal(res.statusCode, 401);
  assert.equal(db.seen.length, 0);
});

test("a role outside the staff set is refused with a 403", async () => {
  const { res, db } = await call({ staff: { ...CLOSER, role: "partner" } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "forbidden");
  assert.equal(db.seen.length, 0);
});

test("closer and sales_manager may both use it", async () => {
  for (const role of ["closer", "sales_manager"]) {
    const { res } = await call({ staff: { ...CLOSER, role } });
    assert.equal(res.statusCode, 200, role);
    assert.equal(res.body.ok, true);
  }
});

test("staff of another org get a plain 403, not the box", async () => {
  const { res, db } = await call({ staff: { ...CLOSER, org_id: "99999999-9999-9999-9999-999999999999" } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "not_available");
  assert.equal(db.seen.length, 0);
});

test("DELETE is a 405", async () => {
  const { res } = await call({ method: "DELETE" });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "GET, PUT, POST");
});

test("GET: no link yet, the owner address to share with, and whether Google is approved", async () => {
  const { res, db } = await call({ env: { GOOGLE_CALENDAR_OWNER_EMAIL: "owner@example.com" } });
  assert.deepEqual(res.body, { ok: true, link: null, owner_email: "owner@example.com", google_ready: false });
  assert.deepEqual(db.seen[0].params, [ORG, "s1"], "reads my own row only");
});

test("PUT: a bad address is a 400 in plain words and nothing is written", async () => {
  for (const calendar_email of ["", "justice", "a b@x.com", undefined]) {
    const { res, db } = await call({ method: "PUT", body: { calendar_email } });
    assert.equal(res.statusCode, 400, String(calendar_email));
    assert.match(res.body.message, /Google Calendar/);
    assert.equal(db.seen.length, 0);
  }
});

test("PUT: the owner's own calendar is refused", async () => {
  const { res } = await call({ method: "PUT", body: { calendar_email: "StanbridgeJChris@gmail.com" } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "owner_calendar");
});

test("PUT: saves my address, trimmed and lower-cased, against my own staff id", async () => {
  const { res, db } = await call({ method: "PUT", body: { calendar_email: "  Justice@Gmail.com " } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.link.calendar_email, "justice@gmail.com");
  const insert = db.seen.find((q) => /INSERT INTO staff_calendar_links/.test(q.sql));
  assert.deepEqual(insert.params, [ORG, "s1", "justice@gmail.com"]);
});

test("POST with nothing saved asks for the address first", async () => {
  const { res } = await call({ method: "POST", body: {} });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "no_calendar_saved");
});
