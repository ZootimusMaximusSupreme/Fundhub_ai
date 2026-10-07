// Staff calendar busy-time sync — every five minutes.
//
// Owner-approved 2026-10-07 (ops/workflows/team-setup-sarah-justice-2026-10-07.md).
// Reads the busy times of every calendar a staff member plugged in on the
// Calendar screen and keeps matching private "Busy - <first name>" blocks on
// the calendar owner's Google calendar, which the booking page checks. The
// whole pass is src/staff/calendar-sync.mjs syncBusyBlocks(); this file is the
// clock.
//
// WHAT IT TOUCHES: staff_calendar_links status columns, and on Google only the
// blocks it wrote itself (private property fundhubMirror=1). Never another
// event. Never a message to anyone. At most MAX_WRITES_PER_RUN writes a pass,
// and it stops writing well inside the 26 seconds an Inngest request gets.
//
// NO TOKEN YET (GOOGLE_CALENDAR_OAUTH_TOKEN_JSON unset): writes "Waiting on
// Chris's Google approval" on each row and does nothing else.
//
// A DEAD TOKEN is the one thing that fails the run. When Google refuses the
// stored token for good (invalid_grant), the pass returns `tokenDead: true`
// and this throws a NonRetriableError after the step. The heartbeat add-on in
// src/workflows/client.mjs then records the run as an error, and the 7 a.m.
// pulse (src/pulse/heartbeats.mjs checkJobHeartbeats) shows this job red with
// the reason — the existing path to Chris. Non-retriable: a retry would only
// hit the same refusal. A blip (5xx, dropped connection) does not fail the run.
//
// A SETUP PROBLEM fails the run the same way, with its own plain sentence as
// the reason: the adapters fence closed, the Google Calendar API switched off,
// or a missing calendar scope (`setupProblem`, src/staff/calendar-sync.mjs).

import { NonRetriableError } from "inngest";
import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { syncBusyBlocks } from "../staff/calendar-sync.mjs";

export const SYNC_CRON = "*/5 * * * *";

export const DEAD_TOKEN_MESSAGE =
  "Chris's Google calendar approval stopped working (Google refused the stored token), " +
  "so busy times are not being copied to the booking calendar.";

/* `sync` is the one pass; a test hands in its own. */
export async function handle({ db, step, env = process.env, sync = syncBusyBlocks }) {
  const out = await step.run("sync-busy-blocks", () => sync(db, { env }));
  if (out?.tokenDead) throw new NonRetriableError(DEAD_TOKEN_MESSAGE);
  if (out?.setupProblem) throw new NonRetriableError(out.setupProblem);
  return out;
}

export const staffCalendarBusySync = inngest.createFunction(
  { id: "staff-calendar-busy-sync", name: "Staff calendar — busy times onto the booking calendar" },
  { cron: SYNC_CRON },
  ({ step }) => handle({ db, step })
);
