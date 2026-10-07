// src/messaging/providers/google-calendar.test.mjs — request shapes, with a fake fetch.
// No call leaves the process: every request lands in `calls` and gets a canned answer.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  TOKEN_ENV_KEY, CALENDAR_SCOPES, MIRROR_KEY,
  calendarTokenConfig, calendarTokenPresent, calendarAccessToken, resetTokenCache,
  freeBusy, listMirrorEvents, insertEvent, deleteEvent, findEventAt, addAttendees, isMirrorEvent
} from "./google-calendar.mjs";

const TOKEN_JSON = JSON.stringify({ refresh_token: "r-fixture", client_id: "c-fixture", client_secret: "s-fixture" });
const LIVE = { [TOKEN_ENV_KEY]: TOKEN_JSON, ADAPTERS_DRY_RUN: "0" };

function resp(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: async () => (body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body))
  };
}

/* A fake Google. `routes` is [ [matcher(method,url), (init) => resp] ]. The token
   endpoint always answers with a short-lived access token. */
function fakeGoogle(routes = []) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || "GET";
    calls.push({ method, url: String(url), headers: init.headers || {}, body: init.body });
    if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
      return resp(200, { access_token: "at-fixture", expires_in: 3600 });
    }
    for (const [match, answer] of routes) if (match(method, String(url))) return answer(init, String(url));
    return resp(404, { error: { message: "no route in fake" } });
  };
  return { calls, fetchImpl, api: () => calls.filter((c) => !c.url.startsWith("https://oauth2")) };
}

beforeEach(() => resetTokenCache());

test("token: missing env var means waiting, never a throw", async () => {
  assert.equal(calendarTokenPresent({}), false);
  assert.equal(calendarTokenConfig({}).waiting, true);
  const g = fakeGoogle();
  const tok = await calendarAccessToken({ env: {}, fetchImpl: g.fetchImpl });
  assert.equal(tok.ok, false);
  assert.equal(tok.waiting, true);
  assert.equal(g.calls.length, 0, "nothing is sent without a token");
  const fb = await freeBusy({ ids: ["a@x.com"], timeMin: "t", timeMax: "u", env: {}, fetchImpl: g.fetchImpl });
  assert.equal(fb.ok, false);
  assert.equal(fb.waiting, true);
});

test("token: broken JSON or missing fields is not 'waiting' and names what is missing", () => {
  const bad = calendarTokenConfig({ [TOKEN_ENV_KEY]: "{nope" });
  assert.equal(bad.ready, false);
  assert.equal(bad.waiting, false);
  assert.match(bad.missing[0], /invalid_json/);
  const partial = calendarTokenConfig({ [TOKEN_ENV_KEY]: JSON.stringify({ client_id: "c" }) });
  assert.deepEqual(partial.missing.sort(), [`${TOKEN_ENV_KEY}(client_secret)`, `${TOKEN_ENV_KEY}(refresh_token)`].sort());
});

test("token: refresh goes to Google's token endpoint with the stored refresh token", async () => {
  const g = fakeGoogle();
  const tok = await calendarAccessToken({ env: LIVE, fetchImpl: g.fetchImpl });
  assert.equal(tok.ok, true);
  assert.equal(tok.accessToken, "at-fixture");
  const body = new URLSearchParams(g.calls[0].body);
  assert.equal(body.get("grant_type"), "refresh_token");
  assert.equal(body.get("refresh_token"), "r-fixture");
});

test("scopes are calendar.events and calendar.freebusy", () => {
  assert.deepEqual([...CALENDAR_SCOPES], [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.freebusy"
  ]);
});

test("fence: with ADAPTERS_DRY_RUN unset nothing reaches Google's API", async () => {
  const g = fakeGoogle([[() => true, () => resp(200, { calendars: {} })]]);
  const fb = await freeBusy({
    ids: ["a@x.com"], timeMin: "2026-10-07T00:00:00Z", timeMax: "2026-10-08T00:00:00Z",
    env: { [TOKEN_ENV_KEY]: TOKEN_JSON }, fetchImpl: g.fetchImpl
  });
  assert.equal(fb.ok, false);
  assert.match(fb.error, /ADAPTERS_DRY_RUN/);
  assert.equal(g.api().length, 0);
});

test("freeBusy: one POST, lower-cased ids, UTC, bearer token; per-calendar errors kept", async () => {
  const g = fakeGoogle([[(m, u) => m === "POST" && u.endsWith("/freeBusy"), () => resp(200, {
    calendars: {
      "justice@gmail.com": { busy: [{ start: "2026-10-07T15:00:00Z", end: "2026-10-07T16:00:00Z" }] },
      "sarah@gmail.com": { errors: [{ domain: "global", reason: "notFound" }], busy: [] }
    }
  })]]);
  const fb = await freeBusy({
    ids: ["Justice@Gmail.com", "sarah@gmail.com", "justice@gmail.com"],
    timeMin: "2026-10-07T00:00:00.000Z", timeMax: "2026-10-21T00:00:00.000Z",
    env: LIVE, fetchImpl: g.fetchImpl
  });
  assert.equal(fb.ok, true);
  const [call] = g.api();
  assert.equal(call.url, "https://www.googleapis.com/calendar/v3/freeBusy");
  assert.equal(call.headers.authorization, "Bearer at-fixture");
  const body = JSON.parse(call.body);
  assert.deepEqual(body.items, [{ id: "justice@gmail.com" }, { id: "sarah@gmail.com" }]);
  assert.equal(body.timeZone, "UTC");
  assert.equal(fb.calendars["justice@gmail.com"].busy.length, 1);
  assert.equal(fb.calendars["sarah@gmail.com"].errors[0].reason, "notFound");
});

test("freeBusy: an id Google leaves out is reported unreadable, not as free", async () => {
  const g = fakeGoogle([[(m) => m === "POST", () => resp(200, { calendars: {} })]]);
  const fb = await freeBusy({ ids: ["gone@x.com"], timeMin: "a", timeMax: "b", env: LIVE, fetchImpl: g.fetchImpl });
  assert.equal(fb.calendars["gone@x.com"].errors[0].reason, "missing_from_response");
});

test("freeBusy: more than 50 calendars are asked for in chunks of 50", async () => {
  const g = fakeGoogle([[(m) => m === "POST", () => resp(200, { calendars: {} })]]);
  const ids = Array.from({ length: 51 }, (_, i) => `p${i}@x.com`);
  await freeBusy({ ids, timeMin: "a", timeMax: "b", env: LIVE, fetchImpl: g.fetchImpl });
  const posts = g.api();
  assert.equal(posts.length, 2);
  assert.equal(JSON.parse(posts[0].body).items.length, 50);
  assert.equal(JSON.parse(posts[1].body).items.length, 1);
});

test("freeBusy: the API switched off reads as that, in words", async () => {
  const g = fakeGoogle([[(m) => m === "POST", () => resp(403, {
    error: { message: "Google Calendar API has not been used in project 1 before or it is disabled.", status: "PERMISSION_DENIED" }
  })]]);
  const fb = await freeBusy({ ids: ["a@x.com"], timeMin: "a", timeMax: "b", env: LIVE, fetchImpl: g.fetchImpl });
  assert.equal(fb.ok, false);
  assert.match(fb.error, /not switched on/);
});

test("listMirrorEvents: filters on the private property, single events, and pages", async () => {
  let page = 0;
  const g = fakeGoogle([[(m, u) => m === "GET" && u.includes("/calendars/primary/events?"), () => {
    page += 1;
    if (page === 1) {
      return resp(200, {
        items: [{ id: "e1", extendedProperties: { private: { [MIRROR_KEY]: "1", staffId: "s1" } } }],
        nextPageToken: "p2"
      });
    }
    return resp(200, { items: [
      { id: "e2", extendedProperties: { private: { [MIRROR_KEY]: "1", staffId: "s2" } } },
      { id: "real-event", summary: "Funding Strategy Meeting" }
    ] });
  }]]);
  const out = await listMirrorEvents({
    timeMin: "2026-10-07T00:00:00.000Z", timeMax: "2026-10-21T00:00:00.000Z", env: LIVE, fetchImpl: g.fetchImpl
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.events.map((e) => e.id), ["e1", "e2"], "an event without the property is never returned");
  const u = new URL(g.api()[0].url);
  assert.equal(u.searchParams.get("privateExtendedProperty"), "fundhubMirror=1");
  assert.equal(u.searchParams.get("singleEvents"), "true");
  assert.equal(u.searchParams.get("timeMin"), "2026-10-07T00:00:00.000Z");
  assert.equal(new URL(g.api()[1].url).searchParams.get("pageToken"), "p2");
});

test("insertEvent: POST to the primary calendar with sendUpdates=none and the body as given", async () => {
  const g = fakeGoogle([[(m) => m === "POST", (init) => resp(200, { id: "new1", ...JSON.parse(init.body) })]]);
  const event = { summary: "Busy - Justice", transparency: "opaque", visibility: "private" };
  const out = await insertEvent({ event, env: LIVE, fetchImpl: g.fetchImpl });
  assert.equal(out.ok, true);
  assert.equal(out.event.id, "new1");
  const [call] = g.api();
  assert.equal(call.url, "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none");
  assert.deepEqual(JSON.parse(call.body), event);
});

test("deleteEvent: DELETE by id; already gone counts as done", async () => {
  const g = fakeGoogle([
    [(m, u) => m === "DELETE" && u.includes("/events/e1?"), () => resp(204)],
    [(m, u) => m === "DELETE" && u.includes("/events/gone?"), () => resp(410, { error: "gone" })]
  ]);
  assert.deepEqual(await deleteEvent({ eventId: "e1", env: LIVE, fetchImpl: g.fetchImpl }), { ok: true, gone: false });
  assert.deepEqual(await deleteEvent({ eventId: "gone", env: LIVE, fetchImpl: g.fetchImpl }), { ok: true, gone: true });
  assert.equal(g.api()[0].url, "https://www.googleapis.com/calendar/v3/calendars/primary/events/e1?sendUpdates=none");
  assert.equal((await deleteEvent({ eventId: "", env: LIVE, fetchImpl: g.fetchImpl })).ok, false);
});

test("findEventAt: ±2 minutes around the start, the lead must be a guest, cancelled is ignored", async () => {
  const start = "2026-10-08T17:00:00.000Z";
  const g = fakeGoogle([[(m) => m === "GET", () => resp(200, { items: [
    { id: "cancelled", status: "cancelled", start: { dateTime: start }, attendees: [{ email: "lead@x.com" }] },
    { id: "other-lead", start: { dateTime: start }, attendees: [{ email: "someone@x.com" }] },
    { id: "too-late", start: { dateTime: "2026-10-08T17:05:00.000Z" }, attendees: [{ email: "lead@x.com" }] },
    { id: "the-call", start: { dateTime: "2026-10-08T10:01:00-07:00" }, attendees: [{ email: "Lead@X.com" }] }
  ] })]]);
  const out = await findEventAt({ startTime: start, attendeeEmail: "lead@x.com", env: LIVE, fetchImpl: g.fetchImpl });
  assert.equal(out.ok, true);
  assert.equal(out.event.id, "the-call");
  const u = new URL(g.api()[0].url);
  assert.equal(u.searchParams.get("timeMin"), "2026-10-08T16:58:00.000Z");
  assert.equal(u.searchParams.get("timeMax"), "2026-10-08T17:02:00.000Z");
  assert.equal(u.searchParams.get("singleEvents"), "true");
});

test("findEventAt: nothing there yet is ok:true with a null event", async () => {
  const g = fakeGoogle([[(m) => m === "GET", () => resp(200, { items: [] })]]);
  const out = await findEventAt({ startTime: "2026-10-08T17:00:00Z", attendeeEmail: "lead@x.com", env: LIVE, fetchImpl: g.fetchImpl });
  assert.deepEqual(out, { ok: true, event: null });
});

test("addAttendees: sends every existing guest back, adds the closer, no conferenceData, guests hidden, sendUpdates=all", async () => {
  const existing = [
    { email: "stanbridgejchris@gmail.com", organizer: true, responseStatus: "accepted" },
    { email: "lead@x.com", responseStatus: "needsAction" }
  ];
  const g = fakeGoogle([
    [(m, u) => m === "GET" && u.endsWith("/events/ev1"), () => resp(200, {
      id: "ev1", attendees: existing, conferenceData: { entryPoints: [{ uri: "https://meet.google.com/abc" }] }
    })],
    [(m, u) => m === "PATCH" && u.includes("/events/ev1?"), (init) => resp(200, { id: "ev1", ...JSON.parse(init.body) })]
  ]);
  const out = await addAttendees({ eventId: "ev1", emails: ["Justice@Gmail.com"], env: LIVE, fetchImpl: g.fetchImpl });
  assert.deepEqual(out, { ok: true, added: ["justice@gmail.com"], already: [] });
  const patch = g.api().find((c) => c.method === "PATCH");
  assert.equal(new URL(patch.url).searchParams.get("sendUpdates"), "all");
  const body = JSON.parse(patch.body);
  assert.deepEqual(body.attendees, [...existing, { email: "justice@gmail.com" }]);
  assert.equal(body.guestsCanSeeOtherGuests, false);
  assert.equal("conferenceData" in body, false, "the Meet link is left alone");
});

test("addAttendees: someone already on the call is not added again and no patch is sent", async () => {
  const g = fakeGoogle([[(m) => m === "GET", () => resp(200, {
    id: "ev1", attendees: [{ email: "lead@x.com" }, { email: "justice@gmail.com" }]
  })]]);
  const out = await addAttendees({ eventId: "ev1", emails: ["justice@gmail.com"], env: LIVE, fetchImpl: g.fetchImpl });
  assert.deepEqual(out, { ok: true, added: [], already: ["justice@gmail.com"] });
  assert.equal(g.api().filter((c) => c.method === "PATCH").length, 0);
});

test("isMirrorEvent: only our private property counts", () => {
  assert.equal(isMirrorEvent({ extendedProperties: { private: { [MIRROR_KEY]: "1" } } }), true);
  assert.equal(isMirrorEvent({ extendedProperties: { shared: { [MIRROR_KEY]: "1" } } }), false);
  assert.equal(isMirrorEvent({ summary: "Busy - Justice" }), false);
  assert.equal(isMirrorEvent(null), false);
});
