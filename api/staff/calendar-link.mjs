// GET/PUT/POST /api/staff/calendar-link — my own Google calendar, plugged in.
//
// Owner-approved 2026-10-07 (ops/workflows/team-setup-sarah-justice-2026-10-07.md).
// The "Connect your calendar" box on public/app/calendar.html calls this.
//
// SELF-SCOPED. Every method acts on req.staff.id and nothing else; there is no
// staff id parameter to pass. Any staff role may use it (ROLE_SETS.STAFF).
// requireAuth ignores a roles key (CLAUDE.md §12), so the role gate is
// requireRole, after it.
//
//   GET   → { link | null, owner_email, google_ready }
//   PUT   { calendar_email } → saves it (a changed address goes back to pending)
//   POST  { calendar_email? } → saves it when given, then asks Google about my
//          calendar right now and returns result: connected | not_shared |
//          waiting_on_approval | owner_calendar | error
//
// Only the default org's staff: the busy blocks go onto one owner calendar for
// one company. Staff of any other org get a 403 with a plain reason and the
// screen hides the box.

import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { requireRole, ROLE_SETS } from "../../src/http/read-api.mjs";
import { resolveDefaultOrg } from "../../src/auth/org.mjs";
import { calendarTokenPresent } from "../../src/messaging/providers/google-calendar.mjs";
import {
  calendarOwnerEmail, checkMyCalendar, getLink, isValidCalendarEmail,
  normalizeCalendarEmail, saveLink, MSG_OWNER_CALENDAR
} from "../../src/staff/calendar-sync.mjs";

function view(link) {
  if (!link) return null;
  return {
    calendar_email: link.calendar_email,
    status: link.status,
    last_error: link.last_error || null,
    last_checked_at: link.last_checked_at || null,
    blocks_booking: link.blocks_booking !== false
  };
}

/* Validate and save the typed address. Writes the 400 itself; returns null then. */
async function saveFromBody(res, database, staff, body, env) {
  const raw = body && typeof body === "object" ? body.calendar_email : undefined;
  if (!isValidCalendarEmail(raw)) {
    res.status(400).json({
      ok: false, error: "invalid_calendar_email",
      message: "Type the email address of your Google Calendar, like name@gmail.com."
    });
    return null;
  }
  if (normalizeCalendarEmail(raw) === calendarOwnerEmail(env)) {
    res.status(400).json({ ok: false, error: "owner_calendar", message: MSG_OWNER_CALENDAR });
    return null;
  }
  return saveLink(database, { orgId: staff.org_id, staffId: staff.id, calendarEmail: raw });
}

export default async function handler(req, res, deps = {}) {
  const database = deps.db || db;
  const env = deps.env || process.env;
  const staff = await (deps.requireAuth || requireAuth)(req, res, { db: database });
  if (!staff) return;
  if (!requireRole(res, staff, ROLE_SETS.STAFF)) return;

  const method = req.method;
  if (method !== "GET" && method !== "PUT" && method !== "POST") {
    res.setHeader("allow", "GET, PUT, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const defaultOrg = deps.defaultOrg || await resolveDefaultOrg(database);
  if (!staff.org_id || staff.org_id !== defaultOrg) {
    return res.status(403).json({
      ok: false, error: "not_available",
      message: "Calendar connect is for the Fundhub team's own booking calendar."
    });
  }

  const ownerEmail = calendarOwnerEmail(env);
  const base = { owner_email: ownerEmail, google_ready: calendarTokenPresent(env) };

  if (method === "GET") {
    const link = await getLink(database, { orgId: staff.org_id, staffId: staff.id });
    return res.status(200).json({ ok: true, link: view(link), ...base });
  }

  const body = req.body || {};

  if (method === "PUT") {
    const link = await saveFromBody(res, database, staff, body, env);
    if (!link) return;
    return res.status(200).json({ ok: true, link: view(link), ...base });
  }

  // POST — save when an address came with it, then check now.
  if (body && typeof body === "object" && body.calendar_email !== undefined) {
    const saved = await saveFromBody(res, database, staff, body, env);
    if (!saved) return;
  }
  const out = await checkMyCalendar(database, {
    orgId: staff.org_id,
    staffId: staff.id,
    env,
    fetchImpl: deps.fetchImpl,
    provider: deps.provider
  });
  if (out.result === "no_link") {
    return res.status(400).json({
      ok: false, error: "no_calendar_saved",
      message: "Type your Google Calendar email first, then press Save and check."
    });
  }
  return res.status(200).json({ ok: true, result: out.result, link: view(out.link), ...base });
}
