// Google Calendar — the calls the team calendar link makes.
//
// What it is for (owner-approved 2026-10-07, ops/workflows/team-setup-sarah-justice-2026-10-07.md):
// Sarah and Justice share their own Google calendar with the calendar owner at
// "See only free/busy". The sync job reads their busy times here and writes
// private "Busy - <first name>" blocks onto the owner's primary calendar, which
// is the calendar the ClickFunnels booking page checks. A booked call is then
// found on that same calendar and the closer is added to it as a guest.
//
// CLAUDE.md §12: outbound calls live in src/messaging/providers/* and nowhere
// else. Every call goes through the chokepoint (src/lib/outbound-fetch.mjs)
// under the ADAPTERS fence, because writing an event changes a record at a
// vendor. With ADAPTERS_DRY_RUN not set to an explicit off value every call
// comes back `blocked` and nothing is written.
//
// THE TOKEN. One per-user OAuth token for the calendar owner, in its own env
// var GOOGLE_CALENDAR_OAUTH_TOKEN_JSON (same token.json shape
// scripts/google-oauth-mint.mjs writes: refresh_token, client_id,
// client_secret). Owner rule: per-user OAuth for personal Gmail, never
// Workspace domain-wide delegation. Missing token = `waiting: true`, never a
// throw — the callers turn that into "Waiting on Chris's Google approval".
//
// NO DATABASE HERE. The callers (src/staff/calendar-sync.mjs) own the rows.
//
// SHIPS UNROUTED: not a message channel, not in providers/index.mjs. ENABLED
// is false for the same reason it is false on google-drive-write.mjs.

import { transmit, postJsonTo, ADAPTERS, redact } from "../../lib/outbound-fetch.mjs";
import { classify } from "./http.mjs";
import { fetchOAuthAccessToken } from "../../company-brain/auth.mjs";
import { GOOGLE_TOKEN_URL } from "../../company-brain/config.mjs";

export const PROVIDER = "google_calendar";
export const ENABLED = false;
export const TRANSMITS = true;

export const TOKEN_ENV_KEY = "GOOGLE_CALENDAR_OAUTH_TOKEN_JSON";
export const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const CALENDAR_FREEBUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
export const CALENDAR_SCOPES = Object.freeze([CALENDAR_EVENTS_SCOPE, CALENDAR_FREEBUSY_SCOPE]);

/* The private extended property every block this platform writes carries.
   Listing and deleting only ever look at events that hold it, so a real event
   on the owner's calendar can never be touched. */
export const MIRROR_KEY = "fundhubMirror";
export const MIRROR_VALUE = "1";

/* Google answers a freeBusy for at most 50 calendars at once. */
export const FREEBUSY_MAX_IDS = 50;
const LIST_MAX_PAGES = 10;

/** Parse GOOGLE_CALENDAR_OAUTH_TOKEN_JSON. Never returns or logs a secret value. */
export function calendarTokenConfig(env = process.env) {
  const raw = env?.[TOKEN_ENV_KEY];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ready: false, waiting: true, credentials: null, missing: [TOKEN_ENV_KEY] };
  }
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { ready: false, waiting: false, credentials: null, missing: [`${TOKEN_ENV_KEY}(invalid_json)`] };
  }
  const refreshToken = parsed?.refresh_token ? String(parsed.refresh_token) : "";
  const clientId = parsed?.client_id ? String(parsed.client_id) : "";
  const clientSecret = parsed?.client_secret ? String(parsed.client_secret) : "";
  const missing = [];
  if (!refreshToken) missing.push(`${TOKEN_ENV_KEY}(refresh_token)`);
  if (!clientId) missing.push(`${TOKEN_ENV_KEY}(client_id)`);
  if (!clientSecret) missing.push(`${TOKEN_ENV_KEY}(client_secret)`);
  if (missing.length) return { ready: false, waiting: false, credentials: null, missing };
  return {
    ready: true,
    waiting: false,
    missing: [],
    credentials: {
      refreshToken,
      clientId,
      clientSecret,
      tokenUri: parsed?.token_uri ? String(parsed.token_uri) : GOOGLE_TOKEN_URL
    }
  };
}

/** True when the env holds a token to try. Says nothing about whether Google takes it. */
export function calendarTokenPresent(env = process.env) {
  return calendarTokenConfig(env).ready;
}

let cachedToken = null; // { accessToken, expiresAtMs }

/** Drop the cached access token. For tests, and after a 401. */
export function resetTokenCache() { cachedToken = null; }

/**
 * Refresh the owner's token into a short-lived access token.
 * @returns {Promise<{ok:true, accessToken:string} | {ok:false, waiting:boolean, error:string}>}
 */
export async function calendarAccessToken({ env = process.env, fetchImpl, now = Date.now } = {}) {
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > now()) {
    return { ok: true, accessToken: cachedToken.accessToken };
  }
  const cfg = calendarTokenConfig(env);
  if (!cfg.ready) {
    return {
      ok: false,
      waiting: cfg.waiting,
      error: cfg.waiting
        ? `${TOKEN_ENV_KEY} is not set`
        : `${TOKEN_ENV_KEY} is not usable: ${cfg.missing.join(", ")}`
    };
  }
  try {
    const tok = await fetchOAuthAccessToken({ ...cfg.credentials, fetchImpl });
    cachedToken = { accessToken: tok.accessToken, expiresAtMs: now() + (tok.expiresIn || 3600) * 1000 };
    return { ok: true, accessToken: tok.accessToken };
  } catch (err) {
    return { ok: false, waiting: false, error: redact(`Google token refresh failed: ${String(err?.message || err)}`) };
  }
}

/* One verdict shape for every call. Never throws. */
function verdictOf(res, what) {
  if (res.blocked) return { ok: false, status: 0, error: res.error || `${what} held by the adapters fence` };
  if (res.transmitted === false) return { ok: false, status: 0, error: res.error || `${what} was not sent` };
  if (res.status === 0) return { ok: false, status: 0, error: res.error || `${what} did not complete` };
  if (res.status === 401) resetTokenCache();
  if (res.status === 403 && /accessNotConfigured|has not been used|is disabled/i.test(String(res.error || ""))) {
    return { ok: false, status: 403,
      error: `${what}: the Google Calendar API is not switched on for this Google Cloud project` };
  }
  if (classify(res.status).status === "sent") return { ok: true, status: res.status, body: res.body, error: null };
  return { ok: false, status: res.status, error: redact(res.error || `${what} returned HTTP ${res.status}`) };
}

const qs = (params) => Object.entries(params)
  .filter(([, v]) => v !== undefined && v !== null && v !== "")
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  .join("&");

const eventsUrl = (calendarId) => `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId || "primary")}/events`;

async function call(method, url, { token, body, env, fetchImpl, timeoutMs, what }) {
  const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
  const opts = { fence: ADAPTERS, env, fetchImpl, timeoutMs, what };
  if (method === "POST") {
    return postJsonTo(url, { headers, body: JSON.stringify(body ?? {}), ...opts });
  }
  return transmit(url, {
    method,
    headers: body === undefined ? headers : { ...headers, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }, opts);
}

async function withToken(opts, fn) {
  const tok = await calendarAccessToken(opts);
  if (!tok.ok) return { ok: false, waiting: tok.waiting, error: tok.error };
  return fn(tok.accessToken);
}

const lower = (s) => String(s || "").trim().toLowerCase();

/**
 * freeBusy for one or more calendars, as the owner. Chunked at 50 ids.
 * Returns { ok, calendars: { <lowercased id>: { busy:[{start,end}], errors:[...] } } }.
 * A calendar that is not shared comes back with `errors` (Google says notFound);
 * that is per-calendar, not a failed call.
 */
export async function freeBusy({ ids, timeMin, timeMax, env = process.env, fetchImpl, timeoutMs } = {}) {
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).map(lower).filter(Boolean))];
  if (!list.length) return { ok: true, calendars: {} };
  return withToken({ env, fetchImpl }, async (token) => {
    const calendars = {};
    for (let i = 0; i < list.length; i += FREEBUSY_MAX_IDS) {
      const chunk = list.slice(i, i + FREEBUSY_MAX_IDS);
      const res = await call("POST", `${CALENDAR_API}/freeBusy`, {
        token, env, fetchImpl, timeoutMs, what: "google calendar freeBusy",
        body: { timeMin, timeMax, timeZone: "UTC", items: chunk.map((id) => ({ id })) }
      });
      const v = verdictOf(res, "google calendar freeBusy");
      if (!v.ok) return { ok: false, waiting: false, status: v.status, error: v.error };
      for (const [id, cal] of Object.entries(v.body?.calendars || {})) {
        calendars[lower(id)] = {
          busy: Array.isArray(cal?.busy) ? cal.busy : [],
          errors: Array.isArray(cal?.errors) ? cal.errors : []
        };
      }
      // A requested id Google left out entirely is reported as unreadable too.
      for (const id of chunk) {
        if (!calendars[id]) calendars[id] = { busy: [], errors: [{ reason: "missing_from_response" }] };
      }
    }
    return { ok: true, calendars };
  });
}

async function listEvents(params, { calendarId, env, fetchImpl, timeoutMs, what }) {
  return withToken({ env, fetchImpl }, async (token) => {
    const events = [];
    let pageToken;
    for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
      const url = `${eventsUrl(calendarId)}?${qs({ ...params, pageToken })}`;
      const res = await call("GET", url, { token, env, fetchImpl, timeoutMs, what });
      const v = verdictOf(res, what);
      if (!v.ok) return { ok: false, waiting: false, status: v.status, error: v.error, events: [] };
      events.push(...(v.body?.items || []));
      pageToken = v.body?.nextPageToken;
      if (!pageToken) return { ok: true, events };
    }
    return { ok: false, waiting: false, error: `${what}: more than ${LIST_MAX_PAGES} pages`, events };
  });
}

/** True when an event is one this platform wrote. The only events delete may touch. */
export function isMirrorEvent(ev) {
  return ev?.extendedProperties?.private?.[MIRROR_KEY] === MIRROR_VALUE;
}

/** Every busy block this platform wrote on the owner's calendar in [timeMin, timeMax). */
export async function listMirrorEvents({
  timeMin, timeMax, calendarId = "primary", env = process.env, fetchImpl, timeoutMs
} = {}) {
  const out = await listEvents({
    timeMin, timeMax,
    singleEvents: "true",
    showDeleted: "false",
    maxResults: 2500,
    privateExtendedProperty: `${MIRROR_KEY}=${MIRROR_VALUE}`
  }, { calendarId, env, fetchImpl, timeoutMs, what: "google calendar list busy blocks" });
  // Belt and braces: the filter is Google's; this check is ours.
  if (out.ok) out.events = out.events.filter(isMirrorEvent);
  return out;
}

/** Insert one event. No guests are emailed (sendUpdates=none). */
export async function insertEvent({
  event, calendarId = "primary", sendUpdates = "none", env = process.env, fetchImpl, timeoutMs
} = {}) {
  return withToken({ env, fetchImpl }, async (token) => {
    const res = await call("POST", `${eventsUrl(calendarId)}?${qs({ sendUpdates })}`, {
      token, body: event, env, fetchImpl, timeoutMs, what: "google calendar insert busy block"
    });
    const v = verdictOf(res, "google calendar insert busy block");
    return v.ok ? { ok: true, event: v.body } : { ok: false, waiting: false, status: v.status, error: v.error };
  });
}

/** Delete one event. Already gone (404/410) counts as done. */
export async function deleteEvent({
  eventId, calendarId = "primary", env = process.env, fetchImpl, timeoutMs
} = {}) {
  const id = String(eventId || "").trim();
  if (!id) return { ok: false, error: "deleteEvent needs an eventId" };
  return withToken({ env, fetchImpl }, async (token) => {
    const url = `${eventsUrl(calendarId)}/${encodeURIComponent(id)}?${qs({ sendUpdates: "none" })}`;
    const res = await call("DELETE", url, { token, env, fetchImpl, timeoutMs, what: "google calendar delete busy block" });
    if (res.status === 404 || res.status === 410) return { ok: true, gone: true };
    const v = verdictOf(res, "google calendar delete busy block");
    return v.ok ? { ok: true, gone: false } : { ok: false, waiting: false, status: v.status, error: v.error };
  });
}

const startMs = (ev) => Date.parse(ev?.start?.dateTime || ev?.start?.date || "");

/**
 * The event on the owner's calendar that starts within ±toleranceMs of
 * `startTime` and has `attendeeEmail` as a guest. { ok, event|null }.
 */
export async function findEventAt({
  startTime, attendeeEmail, toleranceMs = 2 * 60_000, calendarId = "primary",
  env = process.env, fetchImpl, timeoutMs
} = {}) {
  const at = Date.parse(String(startTime || ""));
  const who = lower(attendeeEmail);
  if (!Number.isFinite(at)) return { ok: false, error: "findEventAt needs a startTime" };
  if (!who) return { ok: false, error: "findEventAt needs an attendeeEmail" };
  const out = await listEvents({
    timeMin: new Date(at - toleranceMs).toISOString(),
    timeMax: new Date(at + toleranceMs).toISOString(),
    singleEvents: "true",
    showDeleted: "false",
    maxResults: 50
  }, { calendarId, env, fetchImpl, timeoutMs, what: "google calendar find booked call" });
  if (!out.ok) return { ok: false, waiting: out.waiting, status: out.status, error: out.error };
  const event = out.events.find((ev) =>
    ev?.status !== "cancelled" &&
    Math.abs(startMs(ev) - at) <= toleranceMs &&
    (ev.attendees || []).some((a) => lower(a?.email) === who)) || null;
  return { ok: true, event };
}

/**
 * Add guests to an event and email them the invite (sendUpdates=all).
 * The current event is read fresh first because a patch replaces the whole
 * attendees list: every existing guest is sent back unchanged, the new ones
 * are appended, and conferenceData is left out of the patch so the Meet link
 * stays exactly as it is. guestsCanSeeOtherGuests=false keeps a closer's own
 * address out of the lead's view of the invite. Nobody already on it is added
 * twice. { ok, added:[], already:[] }.
 */
export async function addAttendees({
  eventId, emails, calendarId = "primary", env = process.env, fetchImpl, timeoutMs
} = {}) {
  const id = String(eventId || "").trim();
  const wanted = [...new Set((emails || []).map(lower).filter(Boolean))];
  if (!id) return { ok: false, error: "addAttendees needs an eventId" };
  if (!wanted.length) return { ok: true, added: [], already: [] };
  return withToken({ env, fetchImpl }, async (token) => {
    const url = `${eventsUrl(calendarId)}/${encodeURIComponent(id)}`;
    const got = await call("GET", url, { token, env, fetchImpl, timeoutMs, what: "google calendar read booked call" });
    const gv = verdictOf(got, "google calendar read booked call");
    if (!gv.ok) return { ok: false, waiting: false, status: gv.status, error: gv.error };

    const existing = Array.isArray(gv.body?.attendees) ? gv.body.attendees : [];
    const have = new Set(existing.map((a) => lower(a?.email)));
    const already = wanted.filter((e) => have.has(e));
    const added = wanted.filter((e) => !have.has(e));
    if (!added.length) return { ok: true, added: [], already };

    const res = await call("PATCH", `${url}?${qs({ sendUpdates: "all" })}`, {
      token, env, fetchImpl, timeoutMs, what: "google calendar add closer to booked call",
      body: {
        attendees: [...existing, ...added.map((email) => ({ email }))],
        guestsCanSeeOtherGuests: false
      }
    });
    const v = verdictOf(res, "google calendar add closer to booked call");
    return v.ok ? { ok: true, added, already } : { ok: false, waiting: false, status: v.status, error: v.error };
  });
}

export default {
  PROVIDER, ENABLED, TRANSMITS, TOKEN_ENV_KEY, CALENDAR_SCOPES, MIRROR_KEY, MIRROR_VALUE,
  calendarTokenConfig, calendarTokenPresent, calendarAccessToken, resetTokenCache,
  freeBusy, listMirrorEvents, isMirrorEvent, insertEvent, deleteEvent, findEventAt, addAttendees
};
