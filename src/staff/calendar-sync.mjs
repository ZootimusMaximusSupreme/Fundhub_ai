// Staff calendar link — the rows, the busy-time sync, and the closer invite.
//
// Owner-approved 2026-10-07 (ops/workflows/team-setup-sarah-justice-2026-10-07.md).
// Sarah and Justice "plug in" their Google calendar on the Calendar screen.
// Their busy times close slots on the booking page, and booked calls land on
// the closer's calendar. Chris does nothing except one Google "Allow".
//
// HOW IT WORKS
//   1. A staff member types their calendar address (staff_calendar_links, 434)
//      and shares that calendar with the calendar owner at "See only
//      free/busy".
//   2. syncBusyBlocks() — every five minutes — asks Google for every linked
//      calendar's busy times over the next SYNC_WINDOW_DAYS, and makes the
//      owner's primary calendar hold exactly one private, opaque
//      "Busy - <first name>" block per busy time. Missing blocks are written,
//      stale ones are removed. Only blocks this platform wrote (private
//      property fundhubMirror=1) are ever removed. The booking page reads the
//      owner's calendar (verified 2026-10-07: a busy event hid the slot within
//      about three minutes), so those times stop being offered.
//   3. inviteClosersToBooking() — on booking.created — finds the call on the
//      owner's calendar (the lead is a guest, start time within two minutes)
//      and adds every connected closer as a guest, which emails them the invite.
//
// SCOPE: the owner's calendar is one calendar for one company, so the sync and
// the invite only act for the default org (src/auth/org.mjs). The API refuses
// staff of any other org the same way (api/staff/calendar-link.mjs).
//
// NEVER THROWS. A failed Google call changes no row (only Google saying
// notFound or forbidden does), and the next pass is the recovery. A dead token
// comes back as `tokenDead` for the workflow to report. Outbound calls are all
// in src/messaging/providers/google-calendar.mjs.

import * as googleCalendar from "../messaging/providers/google-calendar.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { isInterviewBooking } from "../insights/meet.mjs";

/* The calendar the booking page reads, and the address staff share theirs with.
   One constant, one env override. */
export const CALENDAR_OWNER_EMAIL_DEFAULT = "stanbridgejchris@gmail.com";
export function calendarOwnerEmail(env = process.env) {
  const v = String(env?.GOOGLE_CALENDAR_OWNER_EMAIL || "").trim().toLowerCase();
  return v || CALENDAR_OWNER_EMAIL_DEFAULT;
}

/* The booking page offers about three days ahead (precheck 2026-10-07); two
   weeks covers that with room to spare and keeps the writes small. */
export const SYNC_WINDOW_DAYS = 14;
/* At most this many inserts plus deletes per pass. The next pass carries on. */
export const MAX_WRITES_PER_RUN = 25;
/* An Inngest step runs inside one request Netlify kills at 26 seconds. Stop
   starting writes after RUN_BUDGET_MS, and give every Google call its own
   CALL_TIMEOUT_MS clock, so the slowest pass (freeBusy, the list, one last
   write) still ends inside that limit. The next pass carries on. */
export const RUN_BUDGET_MS = 15_000;
export const CALL_TIMEOUT_MS = 6_000;

/* The words a person sees on their own row. */
export const MSG_NOT_SHARED = "Not shared yet";
export const MSG_WAITING = "Waiting on Chris's Google approval";
export const MSG_OWNER_CALENDAR =
  "That is the booking calendar itself. Type the address of your own Google calendar.";

/* Google's own words for a refresh token it will never take again (revoked,
   expired, or a client that no longer exists, deleted or disabled). A dropped
   connection or a 5xx is NOT one of these: that is a blip, and the next pass
   is the retry. */
const DEAD_TOKEN_RE = /invalid_grant|invalid_client|unauthorized_client|deleted_client|disabled_client/i;
export function isDeadTokenError(text) {
  return DEAD_TOKEN_RE.test(String(text || ""));
}

/* SETUP PROBLEMS. Unlike a blip, these never clear on a retry: someone has to
   change a setting. Each one is written on the affected rows in plain words
   (status left exactly as it is, so S1 holds) and fails the run, so the 7 a.m.
   pulse shows the job red with the same words. A blip still does neither. */
export const MSG_FENCE_CLOSED =
  "Google calls are switched off on this site (ADAPTERS_DRY_RUN is not 0), so busy times are not being copied to the booking calendar.";
export const MSG_API_OFF =
  "The Google Calendar API is not switched on for Chris's Google project, so busy times are not being copied to the booking calendar.";
export const MSG_SCOPE_MISSING =
  "Chris's Google approval does not include the calendar permission, so busy times are not being copied to the booking calendar.";

/** The plain-words setup problem behind a failed Google call, or null for a blip. */
export function setupProblemOf(text) {
  const t = String(text || "");
  if (/ADAPTERS_DRY_RUN/.test(t)) return MSG_FENCE_CLOSED;
  if (/not switched on|accessNotConfigured|SERVICE_DISABLED|has not been used in project/i.test(t)) return MSG_API_OFF;
  if (/insufficient authentication scopes|insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(t)) return MSG_SCOPE_MISSING;
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeCalendarEmail(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

export function isValidCalendarEmail(raw) {
  const v = normalizeCalendarEmail(raw);
  return v.length >= 3 && v.length <= 254 && EMAIL_RE.test(v);
}

/* ── rows ─────────────────────────────────────────────────────────────────── */

const LINK_COLUMNS = `l.id, l.org_id, l.staff_id, l.calendar_email, l.blocks_booking, l.status,
  l.last_checked_at, l.last_error, l.created_at, l.updated_at`;

export async function getLink(db, { orgId, staffId }) {
  const { rows } = await db.query(
    `SELECT ${LINK_COLUMNS} FROM staff_calendar_links l
      WHERE l.org_id = $1 AND l.staff_id = $2`,
    [orgId, staffId]
  );
  return rows[0] || null;
}

/** Save my calendar address. A changed address starts again at pending. */
export async function saveLink(db, { orgId, staffId, calendarEmail }) {
  const email = normalizeCalendarEmail(calendarEmail);
  const { rows } = await db.query(
    `INSERT INTO staff_calendar_links AS l (org_id, staff_id, calendar_email)
     VALUES ($1, $2, $3)
     ON CONFLICT (staff_id) DO UPDATE
        SET calendar_email = EXCLUDED.calendar_email,
            status = CASE WHEN l.calendar_email = EXCLUDED.calendar_email THEN l.status ELSE 'pending' END,
            last_error = CASE WHEN l.calendar_email = EXCLUDED.calendar_email THEN l.last_error ELSE NULL END,
            last_checked_at = CASE WHEN l.calendar_email = EXCLUDED.calendar_email THEN l.last_checked_at ELSE NULL END
      WHERE l.org_id = EXCLUDED.org_id
     RETURNING ${LINK_COLUMNS}`,
    [orgId, staffId, email]
  );
  return rows[0] || null;
}

export async function setLinkStatus(db, { orgId, staffId, status, lastError = null }) {
  const { rows } = await db.query(
    `UPDATE staff_calendar_links l
        SET status = $3, last_error = $4, last_checked_at = now()
      WHERE l.org_id = $1 AND l.staff_id = $2
      RETURNING ${LINK_COLUMNS}`,
    [orgId, staffId, status, lastError ? String(lastError).slice(0, 500) : null]
  );
  return rows[0] || null;
}

/** Write the plain words on a row and leave its status exactly as it is. */
export async function setLinkNote(db, { orgId, staffId, lastError }) {
  const { rows } = await db.query(
    `UPDATE staff_calendar_links l
        SET last_error = $3
      WHERE l.org_id = $1 AND l.staff_id = $2
      RETURNING ${LINK_COLUMNS}`,
    [orgId, staffId, String(lastError || "").slice(0, 500) || null]
  );
  return rows[0] || null;
}

/** Links whose busy times close booking slots: active, real staff only. */
export async function blockingLinks(db, orgId) {
  const { rows } = await db.query(
    `SELECT ${LINK_COLUMNS}, s.name AS staff_name
       FROM staff_calendar_links l
       JOIN staff s ON s.id = l.staff_id AND s.org_id = l.org_id
      WHERE l.org_id = $1
        AND l.blocks_booking = true
        AND s.status = 'active'
        AND COALESCE(s.is_demo, false) = false
      ORDER BY l.created_at, l.staff_id`,
    [orgId]
  );
  return rows;
}

/** Active closers whose calendar is connected. Where a booked call is sent. */
export async function connectedClosers(db, orgId) {
  const { rows } = await db.query(
    `SELECT l.staff_id, l.calendar_email, s.name AS staff_name
       FROM staff_calendar_links l
       JOIN staff s ON s.id = l.staff_id AND s.org_id = l.org_id
      WHERE l.org_id = $1
        AND l.status = 'connected'
        AND s.role = 'closer'
        AND s.status = 'active'
        AND COALESCE(s.is_demo, false) = false
      ORDER BY l.created_at, l.staff_id`,
    [orgId]
  );
  return rows;
}

/* ── pure pieces ──────────────────────────────────────────────────────────── */

/** [now, end of the SYNC_WINDOW_DAYS-th day UTC). Starts at the current
    minute, so a busy time that is already over is never written. The far edge
    stays on a whole day, so it only moves once a day. An interval that is
    already under way is clipped to `now` on both sides of the compare
    (desiredBlocks and diffBlocks), so it is not rewritten every pass. */
export function syncWindow(now = Date.now(), days = SYNC_WINDOW_DAYS) {
  const d = new Date(now);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const minute = Math.floor(Number(now) / 60_000) * 60_000;
  return {
    timeMin: new Date(minute).toISOString(),
    timeMax: new Date(dayStart + days * DAY_MS).toISOString()
  };
}

export function firstName(name) {
  const first = String(name || "").trim().split(/\s+/)[0];
  return first || "Team";
}

const ms = (iso) => Date.parse(String(iso || ""));

export function blockKey({ staffId, start, end }) {
  return `${staffId}|${ms(start)}|${ms(end)}`;
}

/** What Google said about one calendar, in the words its owner sees.
    Only notFound or forbidden — Google saying "not shared with you" — moves a
    row off connected. Anything else (a calendar left out of the answer, a
    backendError) is a blip: `status` is null, the row is left exactly as it
    was, and a booking in that minute still reaches a connected closer. */
export function classifyCalendar(cal) {
  const errors = Array.isArray(cal?.errors) ? cal.errors : [];
  if (cal && !errors.length) return { readable: true, status: "connected", lastError: null };
  const reasons = errors.map((e) => String(e?.reason || "unknown"));
  if (reasons.some((r) => r === "notFound" || r === "forbidden")) {
    return { readable: false, status: "pending", lastError: MSG_NOT_SHARED };
  }
  return { readable: false, status: null, lastError: null };
}

/** One block per busy time on each readable calendar, clipped to the window. */
export function desiredBlocks(readable, window) {
  const lo = ms(window.timeMin);
  const hi = ms(window.timeMax);
  const out = [];
  const seen = new Set();
  for (const { link, busy } of readable) {
    for (const b of busy || []) {
      const s = Math.max(ms(b.start), lo);
      const e = Math.min(ms(b.end), hi);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
      const block = {
        staffId: link.staff_id,
        start: new Date(s).toISOString(),
        end: new Date(e).toISOString(),
        summary: `Busy - ${firstName(link.staff_name)}`
      };
      const key = blockKey(block);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(block);
    }
  }
  return out;
}

/** The Google event body for one block. Private, opaque (busy), no reminders,
    no guests. Opaque is what makes the booking page treat it as busy. */
export function mirrorEventBody(block) {
  return {
    summary: block.summary,
    start: { dateTime: block.start, timeZone: "UTC" },
    end: { dateTime: block.end, timeZone: "UTC" },
    visibility: "private",
    transparency: "opaque",
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: {
      private: {
        [googleCalendar.MIRROR_KEY]: googleCalendar.MIRROR_VALUE,
        staffId: String(block.staffId)
      }
    }
  };
}

function eventBlock(ev) {
  return {
    staffId: ev?.extendedProperties?.private?.staffId || "",
    start: ev?.start?.dateTime || ev?.start?.date || "",
    end: ev?.end?.dateTime || ev?.end?.date || ""
  };
}

/**
 * What to write and what to remove.
 *   desired      — blocks that should exist
 *   existing     — mirror events found on the owner's calendar in the window
 *   leaveAlone   — staff ids whose calendar could not be read this pass; their
 *                  existing blocks stay exactly as they are (better to keep a
 *                  slot closed than to open one we cannot check)
 *   window       — when given, an existing block is compared clipped to it,
 *                  the same way desiredBlocks clips, so a block already under
 *                  way matches its busy time instead of being rewritten
 * Anything that is not a mirror event is never in `toDelete`.
 */
export function diffBlocks({ desired, existing, leaveAlone = new Set(), window = null }) {
  const want = new Map(desired.map((b) => [blockKey(b), b]));
  const have = new Set();
  const toDelete = [];
  const lo = window ? ms(window.timeMin) : -Infinity;
  const hi = window ? ms(window.timeMax) : Infinity;
  for (const ev of existing) {
    if (!googleCalendar.isMirrorEvent(ev) || !ev?.id) continue;
    const b = eventBlock(ev);
    if (leaveAlone.has(b.staffId)) continue;
    const s = Math.max(ms(b.start), lo);
    const e = Math.min(ms(b.end), hi);
    const key = Number.isFinite(s) && Number.isFinite(e)
      ? blockKey({ staffId: b.staffId, start: new Date(s).toISOString(), end: new Date(e).toISOString() })
      : blockKey(b);
    if (want.has(key) && !have.has(key)) { have.add(key); continue; }
    toDelete.push({ eventId: ev.id, ...b }); // stale, or a duplicate of one kept
  }
  const toInsert = [...want.entries()].filter(([k]) => !have.has(k)).map(([, b]) => b);
  const byStart = (a, b) => ms(a.start) - ms(b.start);
  return { toInsert: toInsert.sort(byStart), toDelete: toDelete.sort(byStart) };
}

/* ── the sync pass ────────────────────────────────────────────────────────── */

async function markAll(db, orgId, links, status, lastError) {
  for (const link of links) {
    await setLinkStatus(db, { orgId, staffId: link.staff_id, status, lastError });
  }
}

/* A setup problem found in this pass: say it on every row the pass reads,
   status untouched, and hand it to the workflow to fail the run. */
async function noteSetupProblem(db, orgId, links, out, errorText) {
  if (out.setupProblem) return;
  const problem = setupProblemOf(errorText);
  if (!problem) return;
  out.setupProblem = problem;
  for (const link of links) {
    await setLinkNote(db, { orgId, staffId: link.staff_id, lastError: problem });
  }
}

/**
 * One pass. Returns counts; never throws.
 * `provider` defaults to src/messaging/providers/google-calendar.mjs.
 * `tokenDead: true` means Google refused the stored token for good
 * (invalid_grant). The pass itself does not touch any row for that; the
 * workflow turns it into a failed run, so the 7 a.m. pulse shows the job red.
 * `setupProblem` is the plain sentence for a setting that a retry will never
 * fix (the fence, the API switched off, a missing scope). It is also written
 * on the rows, status untouched, and the workflow fails the run with it.
 */
export async function syncBusyBlocks(db, {
  env = process.env, fetchImpl, now = Date.now(), orgId = null,
  provider = googleCalendar, maxWrites = MAX_WRITES_PER_RUN, budgetMs = RUN_BUDGET_MS,
  clock = Date.now
} = {}) {
  const out = {
    ok: true, links: 0, connected: 0, notShared: 0, errored: 0, skippedOwner: 0,
    desired: 0, existing: 0, inserted: 0, deleted: 0, deferred: 0, failures: 0, note: null,
    tokenDead: false, setupProblem: null
  };
  const started = clock();
  try {
    const org = orgId || await resolveDefaultOrg(db);
    const links = await blockingLinks(db, org);
    out.links = links.length;

    if (!provider.calendarTokenPresent(env)) {
      await markAll(db, org, links, "pending", MSG_WAITING);
      out.note = "waiting_on_google_approval";
      return out;
    }

    const owner = calendarOwnerEmail(env);
    const readableLinks = [];
    for (const link of links) {
      if (normalizeCalendarEmail(link.calendar_email) === owner) {
        out.skippedOwner += 1;
        await setLinkStatus(db, { orgId: org, staffId: link.staff_id, status: "error", lastError: MSG_OWNER_CALENDAR });
        continue;
      }
      readableLinks.push(link);
    }

    const window = syncWindow(now);
    /* No calendar to read still runs the rest of the pass: blocks left behind
       by someone who switched blocking off, or whose login was suspended, are
       removed below. */
    const fb = readableLinks.length
      ? await provider.freeBusy({ ids: readableLinks.map((l) => l.calendar_email), ...window, env, fetchImpl, timeoutMs: CALL_TIMEOUT_MS })
      : { ok: true, calendars: {} };
    /* A failed call is not an answer about anyone's calendar. Every row is
       left exactly as it was — a connected closer stays connected through a
       Google 5xx, a dropped connection or a token-refresh blip — and no block
       is written or removed. The next pass is the retry. */
    if (!fb.ok) {
      out.ok = false;
      out.tokenDead = isDeadTokenError(fb.error);
      out.note = `Google did not answer the busy-time read: ${String(fb.error || "no reason given").slice(0, 200)}`;
      await noteSetupProblem(db, org, readableLinks, out, fb.error);
      return out;
    }

    const readable = [];
    const leaveAlone = new Set();
    for (const link of readableLinks) {
      const cal = fb.calendars[normalizeCalendarEmail(link.calendar_email)];
      const c = classifyCalendar(cal);
      if (c.status) {
        await setLinkStatus(db, { orgId: org, staffId: link.staff_id, status: c.status, lastError: c.lastError });
      }
      if (c.readable) {
        out.connected += 1;
        readable.push({ link, busy: cal.busy });
      } else {
        if (c.status === "pending") out.notShared += 1; else out.errored += 1;
        leaveAlone.add(String(link.staff_id));
      }
    }

    const listed = await provider.listMirrorEvents({ ...window, env, fetchImpl, timeoutMs: CALL_TIMEOUT_MS });
    if (!listed.ok) {
      out.ok = false;
      out.tokenDead = isDeadTokenError(listed.error);
      out.note = `could not list existing busy blocks: ${String(listed.error || "").slice(0, 200)}`;
      await noteSetupProblem(db, org, readableLinks, out, listed.error);
      return out;
    }

    const desired = desiredBlocks(readable, window);
    out.desired = desired.length;
    out.existing = listed.events.length;
    const { toInsert, toDelete } = diffBlocks({ desired, existing: listed.events, leaveAlone, window });

    // Closing a slot that should be closed comes first; opening a stale one second.
    const work = [
      ...toInsert.map((b) => ({ kind: "insert", b })),
      ...toDelete.map((b) => ({ kind: "delete", b }))
    ];
    let writes = 0;
    for (const item of work) {
      if (writes >= maxWrites || clock() - started > budgetMs) {
        out.deferred = work.length - writes;
        break;
      }
      /* A block is never removed before its replacement exists. If any new
         block failed to go in this pass, every removal waits for the next. */
      if (item.kind === "delete" && out.failures > 0) {
        out.deferred = work.length - writes;
        out.note = `${out.note}; removals held until the new blocks are in`;
        break;
      }
      writes += 1;
      const res = item.kind === "insert"
        ? await provider.insertEvent({ event: mirrorEventBody(item.b), env, fetchImpl, timeoutMs: CALL_TIMEOUT_MS })
        : await provider.deleteEvent({ eventId: item.b.eventId, env, fetchImpl, timeoutMs: CALL_TIMEOUT_MS });
      if (res.ok) {
        if (item.kind === "insert") out.inserted += 1; else out.deleted += 1;
        continue;
      }
      out.failures += 1;
      out.ok = false;
      out.note = `${item.kind} failed: ${String(res.error || "").slice(0, 200)}`;
      await noteSetupProblem(db, org, readableLinks, out, res.error);
      // A refusal on the token or the scope will refuse every write after it.
      if (res.status === 401 || res.status === 403 || res.waiting) {
        out.deferred = work.length - writes;
        break;
      }
    }
    return out;
  } catch (err) {
    out.ok = false;
    out.note = `sync pass failed: ${String(err?.message || err).slice(0, 200)}`;
    console.error(`[staff-calendar-sync] ${out.note}`);
    return out;
  }
}

/* ── "Save and check" ─────────────────────────────────────────────────────── */

/**
 * Ask Google about one person's calendar right now and record the answer.
 * result: "connected" | "not_shared" | "waiting_on_approval" | "owner_calendar" | "error" | "no_link".
 */
export async function checkMyCalendar(db, {
  orgId, staffId, env = process.env, fetchImpl, now = Date.now(), provider = googleCalendar
} = {}) {
  const link = await getLink(db, { orgId, staffId });
  if (!link) return { result: "no_link", link: null };

  if (normalizeCalendarEmail(link.calendar_email) === calendarOwnerEmail(env)) {
    const saved = await setLinkStatus(db, { orgId, staffId, status: "error", lastError: MSG_OWNER_CALENDAR });
    return { result: "owner_calendar", link: saved };
  }
  if (!provider.calendarTokenPresent(env)) {
    const saved = await setLinkStatus(db, { orgId, staffId, status: "pending", lastError: MSG_WAITING });
    return { result: "waiting_on_approval", link: saved };
  }

  const fb = await provider.freeBusy({
    ids: [link.calendar_email],
    timeMin: new Date(now).toISOString(),
    timeMax: new Date(now + DAY_MS).toISOString(),
    env, fetchImpl, timeoutMs: CALL_TIMEOUT_MS
  });
  // A failed call or a blip is not an answer: the row is left as it was.
  // A setup problem is said on the row in plain words, status untouched.
  if (!fb.ok) {
    const problem = setupProblemOf(fb.error);
    if (!problem) return { result: "error", link };
    const noted = await setLinkNote(db, { orgId, staffId, lastError: problem });
    return { result: "error", link: noted || link };
  }
  const c = classifyCalendar(fb.calendars[normalizeCalendarEmail(link.calendar_email)]);
  if (!c.status) return { result: "error", link };
  const saved = await setLinkStatus(db, { orgId, staffId, status: c.status, lastError: c.lastError });
  if (c.readable) return { result: "connected", link: saved };
  return { result: "not_shared", link: saved };
}

/* ── booked call → closer ─────────────────────────────────────────────────── */

/**
 * One attempt. status:
 *   "added" | "already"  — done
 *   "skipped"            — nothing to do (reason says why); do not retry
 *   "not_found"          — the call is not on the calendar yet; retry later
 *   "error"              — Google did not answer; retry later
 */
export async function inviteClosersToBooking(db, {
  orgId, payload = {}, env = process.env, fetchImpl, provider = googleCalendar
} = {}) {
  try {
    if (!provider.calendarTokenPresent(env)) return { status: "skipped", reason: "waiting_on_google_approval" };
    if (isInterviewBooking(payload)) return { status: "skipped", reason: "interview" };
    const email = String(payload.email || "").trim().toLowerCase();
    const startTime = payload.startTime || null;
    if (!email || !Number.isFinite(Date.parse(String(startTime || "")))) {
      return { status: "skipped", reason: "no_email_or_start_time" };
    }
    if (!orgId || orgId !== await resolveDefaultOrg(db)) return { status: "skipped", reason: "not_the_booking_org" };

    const closers = await connectedClosers(db, orgId);
    if (!closers.length) return { status: "skipped", reason: "no_connected_closer" };

    const found = await provider.findEventAt({ startTime, attendeeEmail: email, env, fetchImpl, timeoutMs: CALL_TIMEOUT_MS });
    if (!found.ok) return { status: "error", error: String(found.error || "").slice(0, 200) };
    if (!found.event) return { status: "not_found" };

    const res = await provider.addAttendees({
      eventId: found.event.id,
      emails: closers.map((c) => c.calendar_email),
      env, fetchImpl, timeoutMs: CALL_TIMEOUT_MS
    });
    if (!res.ok) return { status: "error", error: String(res.error || "").slice(0, 200) };
    return {
      status: res.added.length ? "added" : "already",
      eventId: found.event.id,
      added: res.added.length,
      already: res.already.length
    };
  } catch (err) {
    return { status: "error", error: String(err?.message || err).slice(0, 200) };
  }
}
