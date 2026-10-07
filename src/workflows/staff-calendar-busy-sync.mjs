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
// Chris's Google approval" on each row and does nothing else. Never throws.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { syncBusyBlocks } from "../staff/calendar-sync.mjs";

export const SYNC_CRON = "*/5 * * * *";

export async function handle({ db, step, env = process.env }) {
  return step.run("sync-busy-blocks", () => syncBusyBlocks(db, { env }));
}

export const staffCalendarBusySync = inngest.createFunction(
  { id: "staff-calendar-busy-sync", name: "Staff calendar — busy times onto the booking calendar" },
  { cron: SYNC_CRON },
  ({ step }) => handle({ db, step })
);
