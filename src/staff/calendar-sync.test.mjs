// src/staff/calendar-sync.test.mjs — the diff, the sync pass and the closer invite,
// against a fake database and a fake Google provider. No network, no Postgres.
// The real-database half is src/http/staff-calendar-link.pg.test.mjs.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  CALENDAR_OWNER_EMAIL_DEFAULT, MSG_NOT_SHARED, MSG_WAITING, MSG_OWNER_CALENDAR, isDeadTokenError,
  MSG_FENCE_CLOSED, MSG_API_OFF, MSG_SCOPE_MISSING, setupProblemOf,
  SYNC_WINDOW_DAYS, MAX_WRITES_PER_RUN, CALL_TIMEOUT_MS,
  calendarOwnerEmail, isValidCalendarEmail, syncWindow, firstName, blockKey, classifyCalendar,
  desiredBlocks, diffBlocks, mirrorEventBody, syncBusyBlocks, checkMyCalendar, inviteClosersToBooking
} from "./calendar-sync.mjs";
import { _resetOrgCache } from "../auth/org.mjs";
import { resetTokenCache, TOKEN_ENV_KEY } from "../messaging/providers/google-calendar.mjs";

const ORG = "00000000-0000-0000-0000-00000000000a";
const JUSTICE = "11111111-1111-1111-1111-111111111111";
const SARAH = "22222222-2222-2222-2222-222222222222";
const NOW = Date.parse("2026-10-07T18:30:00.000Z");
const WINDOW = syncWindow(NOW);

/* A fake database that answers the handful of statements calendar-sync.mjs
   sends, and records every status write. */
function fakeDb({ links = [], closers = [], orgId = ORG } = {}) {
  const updates = [];
  const notes = [];
  return {
    updates,
    notes,
    async query(sql, params = []) {
      if (/FROM orgs/.test(sql)) return { rows: [{ id: orgId }] };
      // A note: plain words written, status left alone.
      if (/UPDATE staff_calendar_links/.test(sql) && !/SET status/.test(sql)) {
        const [org, staffId, lastError] = params;
        notes.push({ org, staffId, lastError });
        const link = links.find((l) => l.staff_id === staffId) || {};
        return { rows: [{ ...link, last_error: lastError }] };
      }
      if (/UPDATE staff_calendar_links/.test(sql)) {
        const [org, staffId, status, lastError] = params;
        updates.push({ org, staffId, status, lastError });
        const link = links.find((l) => l.staff_id === staffId) || {};
        return { rows: [{ ...link, status, last_error: lastError }] };
      }
      if (/s\.role = 'closer'/.test(sql)) return { rows: closers.filter(() => params[0] === orgId) };
      if (/blocks_booking = true/.test(sql)) return { rows: links.filter(() => params[0] === orgId) };
      if (/FROM staff_calendar_links l\s+WHERE l\.org_id = \$1 AND l\.staff_id = \$2/.test(sql)) {
        return { rows: links.filter((l) => l.staff_id === params[1]) };
      }
      throw new Error(`fake db: unexpected SQL ${sql.slice(0, 80)}`);
    }
  };
}

function link(staffId, name, email, extra = {}) {
  return { staff_id: staffId, staff_name: name, calendar_email: email, org_id: ORG, status: "pending", blocks_booking: true, ...extra };
}

function mirror(id, staffId, start, end) {
  return {
    id,
    start: { dateTime: start },
    end: { dateTime: end },
    extendedProperties: { private: { fundhubMirror: "1", staffId } }
  };
}

/* A fake Google provider: same function names as the real one. */
function fakeProvider({ token = true, calendars = {}, events = [], fbFails = null, insertFails = null } = {}) {
  const log = { freeBusy: [], inserted: [], deleted: [], listed: 0, find: [], add: [] };
  let n = 0;
  return {
    log,
    MIRROR_KEY: "fundhubMirror",
    calendarTokenPresent: () => token,
    async freeBusy({ ids, timeMin, timeMax, timeoutMs }) {
      log.freeBusy.push({ ids, timeMin, timeMax });
      log.freeBusyTimeout = timeoutMs;
      if (fbFails) return { ok: false, ...fbFails };
      return { ok: true, calendars };
    },
    async listMirrorEvents() { log.listed += 1; return { ok: true, events }; },
    async insertEvent({ event }) {
      if (insertFails) return { ok: false, ...insertFails };
      log.inserted.push(event);
      n += 1;
      return { ok: true, event: { id: `new${n}` } };
    },
    async deleteEvent({ eventId }) { log.deleted.push(eventId); return { ok: true }; },
    findResult: { ok: true, event: null },
    async findEventAt(args) { log.find.push(args); return this.findResult; },
    addResult: null,
    async addAttendees(args) {
      log.add.push(args);
      return this.addResult || { ok: true, added: args.emails, already: [] };
    }
  };
}

beforeEach(() => _resetOrgCache());

/* ── pure pieces ─────────────────────────────────────────────────────────── */

test("owner calendar: one default, one env override", () => {
  assert.equal(calendarOwnerEmail({}), CALENDAR_OWNER_EMAIL_DEFAULT);
  assert.equal(calendarOwnerEmail({ GOOGLE_CALENDAR_OWNER_EMAIL: " Boss@Example.com " }), "boss@example.com");
});

test("email check", () => {
  assert.equal(isValidCalendarEmail(" Justice@Gmail.com "), true);
  for (const bad of ["", "justice", "justice@", "@gmail.com", "a b@gmail.com", null, undefined]) {
    assert.equal(isValidCalendarEmail(bad), false, String(bad));
  }
});

test("window: starts now (to the minute), ends on a whole day two weeks out", () => {
  assert.equal(WINDOW.timeMin, "2026-10-07T18:30:00.000Z");
  assert.equal(syncWindow(NOW + 42_123).timeMin, "2026-10-07T18:30:00.000Z", "floored to the minute");
  assert.equal(SYNC_WINDOW_DAYS, 14);
  assert.equal(WINDOW.timeMax, "2026-10-21T00:00:00.000Z");
  assert.equal(syncWindow(NOW + 60 * 60 * 1000).timeMax, WINDOW.timeMax, "the far edge only moves once a day");
});

test("first name", () => {
  assert.equal(firstName("Justice Nikkel"), "Justice");
  assert.equal(firstName("  Sarah   Blankstein "), "Sarah");
  assert.equal(firstName(""), "Team");
});

test("classify: only notFound / forbidden = Not shared yet; any other error is a blip that changes nothing", () => {
  assert.deepEqual(classifyCalendar({ busy: [], errors: [] }), { readable: true, status: "connected", lastError: null });
  for (const reason of ["notFound", "forbidden"]) {
    assert.deepEqual(classifyCalendar({ errors: [{ reason }] }), { readable: false, status: "pending", lastError: MSG_NOT_SHARED });
  }
  const blip = { readable: false, status: null, lastError: null };
  assert.deepEqual(classifyCalendar({ errors: [{ reason: "backendError" }] }), blip);
  assert.deepEqual(classifyCalendar({ errors: [{ reason: "missing_from_response" }] }), blip);
  assert.deepEqual(classifyCalendar(undefined), blip);
});

test("dead token: only Google's own 'never again' answers count, not a blip", () => {
  assert.equal(isDeadTokenError("Google token refresh failed: oauth token refresh failed (400): invalid_grant"), true);
  assert.equal(isDeadTokenError("oauth token refresh failed (401): invalid_client"), true);
  assert.equal(isDeadTokenError("oauth token refresh failed (401): deleted_client"), true);
  assert.equal(isDeadTokenError("oauth token refresh failed (401): disabled_client"), true);
  assert.equal(isDeadTokenError("Google token refresh failed: The operation was aborted due to timeout"), false);
  assert.equal(isDeadTokenError("google calendar freeBusy returned HTTP 503"), false);
  assert.equal(isDeadTokenError(""), false);
});

test("desired blocks: one per busy time, clipped to the window, first name in the title; finished ones dropped", () => {
  const blocks = desiredBlocks([{
    link: link(JUSTICE, "Justice Nikkel", "j@x.com"),
    busy: [
      { start: "2026-10-07T09:00:00Z", end: "2026-10-07T10:00:00Z" },  // already over: never written
      { start: "2026-10-07T18:00:00Z", end: "2026-10-07T19:00:00Z" },  // under way: clipped to now
      { start: "2026-10-08T15:00:00Z", end: "2026-10-08T16:00:00Z" },
      { start: "2026-10-08T15:00:00Z", end: "2026-10-08T16:00:00Z" },  // duplicate
      { start: "2026-10-09T15:00:00Z", end: "2026-10-09T15:00:00Z" }   // empty
    ]
  }], WINDOW);
  assert.deepEqual(blocks, [
    { staffId: JUSTICE, start: "2026-10-07T18:30:00.000Z", end: "2026-10-07T19:00:00.000Z", summary: "Busy - Justice" },
    { staffId: JUSTICE, start: "2026-10-08T15:00:00.000Z", end: "2026-10-08T16:00:00.000Z", summary: "Busy - Justice" }
  ]);
});

test("mirror event body: private, opaque, no reminders, tagged with our property and the staff id", () => {
  const body = mirrorEventBody({ staffId: JUSTICE, start: "2026-10-08T15:00:00.000Z", end: "2026-10-08T16:00:00.000Z", summary: "Busy - Justice" });
  assert.equal(body.summary, "Busy - Justice");
  assert.equal(body.visibility, "private");
  assert.equal(body.transparency, "opaque");
  assert.deepEqual(body.reminders, { useDefault: false, overrides: [] });
  assert.deepEqual(body.extendedProperties.private, { fundhubMirror: "1", staffId: JUSTICE });
  assert.equal(body.attendees, undefined, "nobody is invited to a busy block");
});

test("diff: inserts what is missing, deletes what is stale, keeps what matches, removes duplicates", () => {
  const keep = { staffId: JUSTICE, start: "2026-10-08T15:00:00.000Z", end: "2026-10-08T16:00:00.000Z" };
  const add = { staffId: JUSTICE, start: "2026-10-09T15:00:00.000Z", end: "2026-10-09T16:00:00.000Z" };
  const existing = [
    mirror("keep", JUSTICE, "2026-10-08T15:00:00Z", "2026-10-08T16:00:00Z"),
    mirror("dupe", JUSTICE, "2026-10-08T08:00:00-07:00", "2026-10-08T09:00:00-07:00"), // same instant
    mirror("stale", JUSTICE, "2026-10-10T15:00:00Z", "2026-10-10T16:00:00Z"),
    { id: "real", summary: "Funding Strategy Meeting", start: { dateTime: "2026-10-10T15:00:00Z" }, end: { dateTime: "2026-10-10T16:00:00Z" } }
  ];
  const { toInsert, toDelete } = diffBlocks({ desired: [keep, add], existing });
  assert.deepEqual(toInsert, [add]);
  assert.deepEqual(toDelete.map((d) => d.eventId).sort(), ["dupe", "stale"]);
  assert.ok(!toDelete.some((d) => d.eventId === "real"), "a real event is never deleted");
});

test("diff: idempotent — run it on its own output and there is nothing to do", () => {
  const desired = [{ staffId: JUSTICE, start: "2026-10-08T15:00:00.000Z", end: "2026-10-08T16:00:00.000Z" }];
  const existing = [mirror("e1", JUSTICE, "2026-10-08T15:00:00.000Z", "2026-10-08T16:00:00.000Z")];
  assert.deepEqual(diffBlocks({ desired, existing }), { toInsert: [], toDelete: [] });
  assert.equal(blockKey(desired[0]), blockKey({ staffId: JUSTICE, start: "2026-10-08T15:00:00Z", end: "2026-10-08T16:00:00Z" }));
});

test("diff: a block already under way matches its clipped busy time on the next pass — no rewrite", () => {
  // Written at 18:30 as 18:30–19:00; five minutes later freeBusy clips it to 18:35–19:00.
  const later = syncWindow(NOW + 5 * 60_000);
  const desired = desiredBlocks([{ link: link(JUSTICE, "Justice Nikkel", "j@x.com"),
    busy: [{ start: "2026-10-07T18:00:00Z", end: "2026-10-07T19:00:00Z" }] }], later);
  const existing = [mirror("e1", JUSTICE, "2026-10-07T18:30:00Z", "2026-10-07T19:00:00Z")];
  assert.deepEqual(diffBlocks({ desired, existing, window: later }), { toInsert: [], toDelete: [] });
  // A real change still shows: the busy time now ends earlier.
  const shorter = desiredBlocks([{ link: link(JUSTICE, "Justice Nikkel", "j@x.com"),
    busy: [{ start: "2026-10-07T18:00:00Z", end: "2026-10-07T18:45:00Z" }] }], later);
  const d = diffBlocks({ desired: shorter, existing, window: later });
  assert.equal(d.toInsert.length, 1);
  assert.deepEqual(d.toDelete.map((x) => x.eventId), ["e1"]);
});

test("diff: a calendar that could not be read keeps its blocks", () => {
  const existing = [mirror("s1", SARAH, "2026-10-08T15:00:00Z", "2026-10-08T16:00:00Z")];
  assert.deepEqual(diffBlocks({ desired: [], existing, leaveAlone: new Set([SARAH]) }), { toInsert: [], toDelete: [] });
  assert.equal(diffBlocks({ desired: [], existing }).toDelete.length, 1, "without leaveAlone it is stale");
});

/* ── the sync pass ───────────────────────────────────────────────────────── */

test("sync: no token = no Google call, every row says Waiting on Chris's Google approval, no throw", async () => {
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com"), link(SARAH, "Sarah B", "s@x.com")] });
  const provider = fakeProvider({ token: false });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(out.note, "waiting_on_google_approval");
  assert.equal(provider.log.freeBusy.length + provider.log.listed + provider.log.inserted.length, 0);
  assert.deepEqual(db.updates.map((u) => [u.staffId, u.status, u.lastError]), [
    [JUSTICE, "pending", MSG_WAITING],
    [SARAH, "pending", MSG_WAITING]
  ]);
});

test("sync: one freeBusy call, connected and not-shared rows, blocks written for the readable one only", async () => {
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "Justice@Gmail.com"), link(SARAH, "Sarah B", "sarah@x.com")] });
  const provider = fakeProvider({
    calendars: {
      "justice@gmail.com": { busy: [{ start: "2026-10-08T15:00:00Z", end: "2026-10-08T16:00:00Z" }], errors: [] },
      "sarah@x.com": { busy: [], errors: [{ reason: "notFound" }] }
    },
    events: [mirror("old-sarah", SARAH, "2026-10-09T15:00:00Z", "2026-10-09T16:00:00Z")]
  });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(provider.log.freeBusy.length, 1);
  assert.deepEqual(provider.log.freeBusy[0], { ids: ["Justice@Gmail.com", "sarah@x.com"], ...WINDOW });
  assert.equal(provider.log.freeBusyTimeout, CALL_TIMEOUT_MS, "every Google call gets a short clock");
  assert.deepEqual(db.updates.map((u) => [u.staffId, u.status, u.lastError]), [
    [JUSTICE, "connected", null],
    [SARAH, "pending", MSG_NOT_SHARED]
  ]);
  assert.equal(out.connected, 1);
  assert.equal(out.notShared, 1);
  assert.equal(provider.log.inserted.length, 1);
  assert.equal(provider.log.inserted[0].summary, "Busy - Justice");
  assert.deepEqual(provider.log.deleted, [], "Sarah could not be read, so her old block stays");
});

test("sync: a second pass over its own result writes nothing", async () => {
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com")] });
  const busy = [{ start: "2026-10-08T15:00:00Z", end: "2026-10-08T16:00:00Z" }];
  const provider = fakeProvider({
    calendars: { "j@x.com": { busy, errors: [] } },
    events: [mirror("e1", JUSTICE, "2026-10-08T15:00:00.000Z", "2026-10-08T16:00:00.000Z")]
  });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(out.inserted + out.deleted, 0);
});

test("sync: blocks of someone no longer blocking are removed, even when nobody is linked", async () => {
  const db = fakeDb({ links: [] });
  const provider = fakeProvider({ events: [mirror("left", JUSTICE, "2026-10-08T15:00:00Z", "2026-10-08T16:00:00Z")] });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(provider.log.freeBusy.length, 0, "nothing to read");
  assert.deepEqual(provider.log.deleted, ["left"]);
  assert.equal(out.deleted, 1);
});

test("sync: writes are capped per pass and the rest is left for the next one", async () => {
  const busy = Array.from({ length: MAX_WRITES_PER_RUN + 5 }, (_, i) => ({
    start: new Date(Date.parse("2026-10-08T00:00:00Z") + i * 3_600_000).toISOString(),
    end: new Date(Date.parse("2026-10-08T00:30:00Z") + i * 3_600_000).toISOString()
  }));
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com")] });
  const provider = fakeProvider({ calendars: { "j@x.com": { busy, errors: [] } } });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(provider.log.inserted.length, MAX_WRITES_PER_RUN);
  assert.equal(out.deferred, 5);
});

test("sync: stops writing when the time budget is spent", async () => {
  const busy = [
    { start: "2026-10-08T15:00:00Z", end: "2026-10-08T16:00:00Z" },
    { start: "2026-10-09T15:00:00Z", end: "2026-10-09T16:00:00Z" }
  ];
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com")] });
  const provider = fakeProvider({ calendars: { "j@x.com": { busy, errors: [] } } });
  let t = 0;
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {}, budgetMs: 10, clock: () => (t += 8) });
  assert.equal(provider.log.inserted.length, 1);
  assert.equal(out.deferred, 1);
});

test("sync: the owner's own calendar is never read back into itself", async () => {
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", CALENDAR_OWNER_EMAIL_DEFAULT)] });
  const provider = fakeProvider();
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(out.skippedOwner, 1);
  assert.equal(provider.log.freeBusy.length, 0);
  assert.deepEqual(db.updates.map((u) => [u.status, u.lastError]), [["error", MSG_OWNER_CALENDAR]]);
});

test("sync: a dead token leaves every row alone, writes no events, and says tokenDead", async () => {
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com", { status: "connected" })] });
  const provider = fakeProvider({ fbFails: { waiting: false, error: "Google token refresh failed: oauth token refresh failed (400): invalid_grant" } });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(out.ok, false);
  assert.equal(out.tokenDead, true);
  assert.deepEqual(db.updates, [], "a connected closer stays connected");
  assert.equal(provider.log.listed, 0);
  assert.equal(provider.log.inserted.length, 0);
});

test("sync: a Google 503, a dropped connection or a refresh blip changes no row and is not a dead token", async () => {
  for (const error of ["google calendar freeBusy returned HTTP 503", "fetch failed",
    "Google token refresh failed: The operation was aborted due to timeout"]) {
    const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com", { status: "connected" })] });
    const provider = fakeProvider({ fbFails: { waiting: false, status: 503, error } });
    const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
    assert.equal(out.ok, false, error);
    assert.equal(out.tokenDead, false, error);
    assert.deepEqual(db.updates, [], error);
  }
});

test("sync: a per-calendar backendError leaves that row and its blocks alone", async () => {
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com", { status: "connected" })] });
  const provider = fakeProvider({
    calendars: { "j@x.com": { busy: [], errors: [{ reason: "backendError" }] } },
    events: [mirror("keep-me", JUSTICE, "2026-10-08T15:00:00Z", "2026-10-08T16:00:00Z")]
  });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.deepEqual(db.updates, []);
  assert.equal(out.errored, 1);
  assert.deepEqual(provider.log.deleted, []);
});

test("sync: when a new block fails to go in, no old block is removed that pass", async () => {
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com")] });
  const provider = fakeProvider({
    // Justice's meeting grew: the old block must go, the longer one must go in.
    calendars: { "j@x.com": { busy: [{ start: "2026-10-08T15:00:00Z", end: "2026-10-08T17:00:00Z" }], errors: [] } },
    events: [mirror("old", JUSTICE, "2026-10-08T15:00:00Z", "2026-10-08T16:00:00Z")],
    insertFails: { status: 500, error: "backendError" }
  });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(out.failures, 1);
  assert.deepEqual(provider.log.deleted, [], "the old block stays until its replacement exists");
  assert.equal(out.deferred, 1);
  assert.match(out.note, /removals held/);
});

test("sync: with every insert in, the stale block is removed in the same pass", async () => {
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com")] });
  const provider = fakeProvider({
    calendars: { "j@x.com": { busy: [{ start: "2026-10-08T15:00:00Z", end: "2026-10-08T17:00:00Z" }], errors: [] } },
    events: [mirror("old", JUSTICE, "2026-10-08T15:00:00Z", "2026-10-08T16:00:00Z")]
  });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(out.inserted, 1);
  assert.deepEqual(provider.log.deleted, ["old"]);
});

test("sync: a dead token on the list call (nobody linked) also says tokenDead", async () => {
  const db = fakeDb({ links: [] });
  const provider = fakeProvider();
  provider.listMirrorEvents = async () => ({ ok: false, waiting: false, error: "Google token refresh failed: invalid_grant" });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(out.tokenDead, true);
});

test("sync: a 403 on a write stops the pass instead of failing every write after it", async () => {
  const busy = [
    { start: "2026-10-08T15:00:00Z", end: "2026-10-08T16:00:00Z" },
    { start: "2026-10-09T15:00:00Z", end: "2026-10-09T16:00:00Z" }
  ];
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com")] });
  const provider = fakeProvider({ calendars: { "j@x.com": { busy, errors: [] } }, insertFails: { status: 403, error: "insufficientPermissions" } });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(out.failures, 1);
  assert.equal(out.deferred, 1);
});

test("sync: a database error is caught and reported, never thrown", async () => {
  const db = { query: async () => { throw new Error("connection refused"); } };
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider: fakeProvider(), env: {} });
  assert.equal(out.ok, false);
  assert.match(out.note, /connection refused/);
});

/* ── check now ───────────────────────────────────────────────────────────── */

test("check: connected / not shared / waiting / owner calendar", async () => {
  const j = link(JUSTICE, "Justice Nikkel", "j@x.com");
  let out = await checkMyCalendar(fakeDb({ links: [j] }), {
    orgId: ORG, staffId: JUSTICE, env: {}, now: NOW,
    provider: fakeProvider({ calendars: { "j@x.com": { busy: [], errors: [] } } })
  });
  assert.equal(out.result, "connected");
  out = await checkMyCalendar(fakeDb({ links: [j] }), {
    orgId: ORG, staffId: JUSTICE, env: {}, now: NOW,
    provider: fakeProvider({ calendars: { "j@x.com": { busy: [], errors: [{ reason: "notFound" }] } } })
  });
  assert.equal(out.result, "not_shared");
  assert.equal(out.link.last_error, MSG_NOT_SHARED);
  out = await checkMyCalendar(fakeDb({ links: [j] }), { orgId: ORG, staffId: JUSTICE, env: {}, now: NOW, provider: fakeProvider({ token: false }) });
  assert.equal(out.result, "waiting_on_approval");
  out = await checkMyCalendar(fakeDb({ links: [link(JUSTICE, "J", CALENDAR_OWNER_EMAIL_DEFAULT)] }), {
    orgId: ORG, staffId: JUSTICE, env: {}, now: NOW, provider: fakeProvider()
  });
  assert.equal(out.result, "owner_calendar");
  out = await checkMyCalendar(fakeDb({ links: [] }), { orgId: ORG, staffId: JUSTICE, env: {}, provider: fakeProvider() });
  assert.equal(out.result, "no_link");
});

test("check: a failed call or a blip answers 'error' and leaves the row as it was", async () => {
  const j = link(JUSTICE, "Justice Nikkel", "j@x.com", { status: "connected" });
  let db = fakeDb({ links: [j] });
  let out = await checkMyCalendar(db, { orgId: ORG, staffId: JUSTICE, env: {}, now: NOW,
    provider: fakeProvider({ fbFails: { status: 503, error: "HTTP 503" } }) });
  assert.equal(out.result, "error");
  assert.equal(out.link.status, "connected");
  assert.deepEqual(db.updates, []);
  db = fakeDb({ links: [j] });
  out = await checkMyCalendar(db, { orgId: ORG, staffId: JUSTICE, env: {}, now: NOW,
    provider: fakeProvider({ calendars: { "j@x.com": { busy: [], errors: [{ reason: "backendError" }] } } }) });
  assert.equal(out.result, "error");
  assert.deepEqual(db.updates, []);
});

test("check: asks Google about this one calendar only, for the next day", async () => {
  const provider = fakeProvider({ calendars: { "j@x.com": { busy: [], errors: [] } } });
  await checkMyCalendar(fakeDb({ links: [link(JUSTICE, "J", "j@x.com"), link(SARAH, "S", "s@x.com")] }), {
    orgId: ORG, staffId: JUSTICE, env: {}, now: NOW, provider
  });
  assert.deepEqual(provider.log.freeBusy, [{
    ids: ["j@x.com"], timeMin: new Date(NOW).toISOString(), timeMax: new Date(NOW + 86_400_000).toISOString()
  }]);
});

/* ── booked call → closer ────────────────────────────────────────────────── */

const BOOKING = { email: "Lead@X.com", startTime: "2026-10-08T17:00:00.000Z", name: "Lead" };
const CLOSER = { staff_id: JUSTICE, calendar_email: "justice@gmail.com", staff_name: "Justice Nikkel" };

test("invite: adds every connected closer to the call it finds, by the address they typed", async () => {
  const db = fakeDb({ closers: [CLOSER] });
  const provider = fakeProvider();
  provider.findResult = { ok: true, event: { id: "ev1" } };
  const out = await inviteClosersToBooking(db, { orgId: ORG, payload: BOOKING, env: {}, provider });
  assert.deepEqual(out, { status: "added", eventId: "ev1", added: 1, already: 0 });
  assert.equal(provider.log.find[0].attendeeEmail, "lead@x.com");
  assert.equal(provider.log.find[0].startTime, BOOKING.startTime);
  assert.deepEqual(provider.log.add[0].emails, ["justice@gmail.com"]);
});

test("invite: only closers — the database read asks for role closer and a connected link", async () => {
  const seen = [];
  const db = {
    async query(sql, params) {
      seen.push(sql);
      if (/FROM orgs/.test(sql)) return { rows: [{ id: ORG }] };
      return { rows: [] };
    }
  };
  const out = await inviteClosersToBooking(db, { orgId: ORG, payload: BOOKING, env: {}, provider: fakeProvider() });
  assert.deepEqual(out, { status: "skipped", reason: "no_connected_closer" });
  const sql = seen.find((s) => /staff_calendar_links/.test(s));
  assert.match(sql, /s\.role = 'closer'/);
  assert.match(sql, /l\.status = 'connected'/);
  assert.match(sql, /s\.status = 'active'/);
});

test("invite: already on the call = 'already', nothing sent twice", async () => {
  const provider = fakeProvider();
  provider.findResult = { ok: true, event: { id: "ev1" } };
  provider.addResult = { ok: true, added: [], already: ["justice@gmail.com"] };
  const out = await inviteClosersToBooking(fakeDb({ closers: [CLOSER] }), { orgId: ORG, payload: BOOKING, env: {}, provider });
  assert.equal(out.status, "already");
});

test("invite: the call not on the calendar yet = not_found (the workflow retries)", async () => {
  const out = await inviteClosersToBooking(fakeDb({ closers: [CLOSER] }), { orgId: ORG, payload: BOOKING, env: {}, provider: fakeProvider() });
  assert.deepEqual(out, { status: "not_found" });
});

test("invite: skips — no token, interview, no time, another org", async () => {
  const db = fakeDb({ closers: [CLOSER] });
  assert.deepEqual(await inviteClosersToBooking(db, { orgId: ORG, payload: BOOKING, env: {}, provider: fakeProvider({ token: false }) }),
    { status: "skipped", reason: "waiting_on_google_approval" });
  assert.deepEqual(await inviteClosersToBooking(db, { orgId: ORG, payload: { ...BOOKING, eventTypeTitle: "Post-funding interview" }, env: {}, provider: fakeProvider() }),
    { status: "skipped", reason: "interview" });
  assert.deepEqual(await inviteClosersToBooking(db, { orgId: ORG, payload: { email: "a@x.com" }, env: {}, provider: fakeProvider() }),
    { status: "skipped", reason: "no_email_or_start_time" });
  assert.deepEqual(await inviteClosersToBooking(db, { orgId: "99999999-9999-9999-9999-999999999999", payload: BOOKING, env: {}, provider: fakeProvider() }),
    { status: "skipped", reason: "not_the_booking_org" });
});

test("invite: Google not answering = error (the workflow retries), never a throw", async () => {
  const provider = fakeProvider();
  provider.findResult = { ok: false, error: "HTTP 503" };
  const out = await inviteClosersToBooking(fakeDb({ closers: [CLOSER] }), { orgId: ORG, payload: BOOKING, env: {}, provider });
  assert.equal(out.status, "error");
});

/* ── setup problems: said on the rows, status untouched, run fails ───────── */

test("setup problem: the fence, the API switched off, a missing scope — and never a blip", () => {
  assert.equal(setupProblemOf("ADAPTERS_DRY_RUN is not set. The dry-run fence defaults to BLOCKED (google calendar freeBusy)"), MSG_FENCE_CLOSED);
  assert.equal(setupProblemOf("google calendar freeBusy: the Google Calendar API is not switched on for this Google Cloud project"), MSG_API_OFF);
  assert.equal(setupProblemOf('{"error":{"code":403,"message":"Request had insufficient authentication scopes.","status":"PERMISSION_DENIED"}}'), MSG_SCOPE_MISSING);
  for (const blip of ["google calendar freeBusy returned HTTP 503", "fetch failed", "timed out after 6000ms",
    "Google token refresh failed: The operation was aborted due to timeout", "Google token refresh failed: invalid_grant", "", null]) {
    assert.equal(setupProblemOf(blip), null, String(blip));
  }
});

test("sync: a setup problem on the busy-time read is written on every row in plain words, status untouched", async () => {
  for (const [error, words] of [
    ["ADAPTERS_DRY_RUN is not set. The dry-run fence defaults to BLOCKED", MSG_FENCE_CLOSED],
    ["google calendar freeBusy: the Google Calendar API is not switched on for this Google Cloud project", MSG_API_OFF]
  ]) {
    const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com", { status: "connected" }), link(SARAH, "Sarah B", "s@x.com")] });
    const provider = fakeProvider({ fbFails: { waiting: false, status: 403, error } });
    const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
    assert.equal(out.ok, false);
    assert.equal(out.setupProblem, words);
    assert.equal(out.tokenDead, false);
    assert.deepEqual(db.updates, [], "no status changes — a connected closer stays connected");
    assert.deepEqual(db.notes.map((n) => [n.staffId, n.lastError]), [[JUSTICE, words], [SARAH, words]]);
    assert.equal(provider.log.inserted.length + provider.log.deleted.length, 0);
  }
});

test("sync: a missing scope on the list or on a write is a setup problem too", async () => {
  const scope = "Request had insufficient authentication scopes.";
  let db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com", { status: "connected" })] });
  let provider = fakeProvider({ calendars: { "j@x.com": { busy: [], errors: [] } } });
  provider.listMirrorEvents = async () => ({ ok: false, status: 403, error: scope });
  let out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(out.setupProblem, MSG_SCOPE_MISSING);
  assert.deepEqual(db.notes.map((n) => n.lastError), [MSG_SCOPE_MISSING]);

  db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com", { status: "connected" })] });
  provider = fakeProvider({
    calendars: { "j@x.com": { busy: [{ start: "2026-10-08T15:00:00Z", end: "2026-10-08T16:00:00Z" }], errors: [] } },
    insertFails: { status: 403, error: scope }
  });
  out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(out.setupProblem, MSG_SCOPE_MISSING);
  assert.deepEqual(db.notes.map((n) => n.lastError), [MSG_SCOPE_MISSING]);
});

test("sync: a blip still writes no note and names no setup problem", async () => {
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com", { status: "connected" })] });
  const provider = fakeProvider({ fbFails: { waiting: false, status: 503, error: "google calendar freeBusy returned HTTP 503" } });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, provider, env: {} });
  assert.equal(out.setupProblem, null);
  assert.deepEqual(db.notes, []);
  assert.deepEqual(db.updates, []);
});

test("sync, real provider: the fence closed on this site is caught end to end", async () => {
  resetTokenCache();
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
      return { ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify({ access_token: "at", expires_in: 3600 }) };
    }
    throw new Error("nothing past the fence should be sent");
  };
  const env = { [TOKEN_ENV_KEY]: JSON.stringify({ refresh_token: "r", client_id: "c", client_secret: "s" }) }; // ADAPTERS_DRY_RUN unset
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com", { status: "connected" })] });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, env, fetchImpl });
  assert.equal(out.setupProblem, MSG_FENCE_CLOSED);
  assert.deepEqual(db.updates, []);
  assert.deepEqual(db.notes.map((n) => n.lastError), [MSG_FENCE_CLOSED]);
  resetTokenCache();
});

test("sync, real provider: the Calendar API switched off is caught end to end", async () => {
  resetTokenCache();
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
      return { ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify({ access_token: "at", expires_in: 3600 }) };
    }
    return { ok: false, status: 403, headers: new Headers(), text: async () => JSON.stringify({ error: {
      code: 403, status: "PERMISSION_DENIED",
      message: "Google Calendar API has not been used in project 123 before or it is disabled."
    } }) };
  };
  const env = { [TOKEN_ENV_KEY]: JSON.stringify({ refresh_token: "r", client_id: "c", client_secret: "s" }), ADAPTERS_DRY_RUN: "0" };
  const db = fakeDb({ links: [link(JUSTICE, "Justice Nikkel", "j@x.com", { status: "connected" })] });
  const out = await syncBusyBlocks(db, { orgId: ORG, now: NOW, env, fetchImpl });
  assert.equal(out.setupProblem, MSG_API_OFF);
  assert.deepEqual(db.updates, []);
  assert.deepEqual(db.notes.map((n) => n.lastError), [MSG_API_OFF]);
  resetTokenCache();
});

test("check: a setup problem is said on my row (status untouched); a blip says nothing new", async () => {
  const j = link(JUSTICE, "Justice Nikkel", "j@x.com", { status: "connected" });
  let db = fakeDb({ links: [j] });
  let out = await checkMyCalendar(db, { orgId: ORG, staffId: JUSTICE, env: {}, now: NOW,
    provider: fakeProvider({ fbFails: { status: 0, error: "ADAPTERS_DRY_RUN is not set. The dry-run fence defaults to BLOCKED" } }) });
  assert.equal(out.result, "error");
  assert.equal(out.link.status, "connected");
  assert.equal(out.link.last_error, MSG_FENCE_CLOSED);
  assert.deepEqual(db.updates, []);
  db = fakeDb({ links: [j] });
  out = await checkMyCalendar(db, { orgId: ORG, staffId: JUSTICE, env: {}, now: NOW,
    provider: fakeProvider({ fbFails: { status: 503, error: "HTTP 503" } }) });
  assert.equal(out.result, "error");
  assert.deepEqual(db.notes, []);
});
