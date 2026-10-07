// S-04D — a booked call lands on the closer's own calendar.
//
// Owner-approved 2026-10-07 (ops/workflows/team-setup-sarah-justice-2026-10-07.md):
// "booked calls go to Justice's calendar".
//
// Trigger: booking.created. The booking page writes the call onto the calendar
// owner's Google calendar (Chris is the organizer). This finds that event — the
// lead is a guest and it starts within two minutes of the booking — and adds
// every connected closer as a guest with sendUpdates=all, so Google emails each
// of them the invite and the call appears on their calendar. Existing guests
// and the Meet link are kept. Anyone already on it is not added again.
//
// The event can reach Google a little after the webhook reaches us, so a miss
// is retried every RETRY_SLEEP for MAX_ATTEMPTS tries (about ten minutes), then
// it gives up with a log line.
//
// Does not touch S-04 / S-04B / S-04C or AI-SET-01/03/04, and sends no text or
// email of its own. No token yet = skipped with a log line.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { inviteClosersToBooking } from "../staff/calendar-sync.mjs";

export const MAX_ATTEMPTS = 6;
export const RETRY_SLEEP = "2m";
const DONE = new Set(["added", "already", "skipped"]);

/* `invite` is the one attempt; a test hands in its own. */
export async function handle({ event, db, step, env = process.env, invite = inviteClosersToBooking }) {
  let last = null;
  for (let i = 1; i <= MAX_ATTEMPTS; i += 1) {
    last = await step.run(`invite-closers-${i}`, () =>
      invite(db, { orgId: event.orgId, payload: event.payload || {}, env }));
    if (DONE.has(last.status)) {
      if (last.status === "skipped") console.log(`[s-04d] skipped: ${last.reason}`);
      return { done: true, attempts: i, ...last };
    }
    if (i < MAX_ATTEMPTS) await step.sleep(`wait-${i}`, RETRY_SLEEP);
  }
  console.warn(`[s-04d] gave up after ${MAX_ATTEMPTS} tries: ${last?.status}${last?.error ? ` — ${last.error}` : ""}`);
  return { done: false, attempts: MAX_ATTEMPTS, gaveUp: true, ...last };
}

export const s04dCloserCalendarInvite = inngest.createFunction(
  { id: "s-04d-closer-calendar-invite", name: "S-04D — Booked call onto the closer's calendar" },
  { event: "booking.created" },
  ({ event, step }) => handle({ event: event.data, db, step })
);
