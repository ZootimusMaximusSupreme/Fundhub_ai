// Daily pulse — 7:00 a.m. America/Denver audit. Audit only. No auto-fix.
//
// Cron 0 13 * * * is 7:00 a.m. Denver during daylight time. After the
// fall-back, flip to 0 14 * * * or it fires at 6:00 a.m. Denver.
//
// This is Recon (AG-07)'s runtime. Do not invent a second tripwire.
// Do not stretch src/ops/pulse.mjs (money pulse) into this.

import { inngest } from "./client.mjs";
import { db as defaultDb } from "../db.mjs";
import { PULSE_CRON, runDailyPulse } from "../pulse/daily-pulse.mjs";
import { MORNING_BRIEF_LIVE, runMorningBrief } from "../ops/morning-brief.mjs";

export { PULSE_CRON };

export async function handle({
  db,
  step,
  env = process.env,
  dryRun = false,
  fetchImpl,
  boardDir,
  gateRelayDirs,
  sendSms,
  sendWhatsApp,
  morningBrief = runMorningBrief,
  briefLive = MORNING_BRIEF_LIVE
} = {}) {
  // Owner-set 2026-10-05: when the brief is live it REPLACES the pulse's own
  // "Fundhub morning check" text — one text, not two. The audit still runs,
  // writes its scorecard and agent_runs row, and the brief carries systems.
  // While MORNING_BRIEF_LIVE is false the pulse text goes exactly as before.
  const replacePulseText = !!(briefLive && db);
  const pulse = await step.run("run-pulse", () => runDailyPulse({
    db,
    env,
    dryRun,
    fetchImpl,
    boardDir,
    gateRelayDirs,
    sendSms,
    sendWhatsApp,
    recordRun: !dryRun,
    sendPulseText: !replacePulseText
  }));

  // Step 2 — the morning brief (MB3). Runs after the pulse, from its result.
  // Dry-run (MORNING_BRIEF_LIVE is false): builds and saves the morning_briefs
  // row, texts nothing. Live: this is the one morning text. A failure here
  // never undoes or hides the pulse.
  if (db) {
    try {
      await step.run("morning-brief", () => morningBrief({ db, env, pulse, kind: "morning", live: briefLive }));
    } catch (err) {
      console.error("[daily-pulse] morning brief failed:", String((err && err.message) || err).slice(0, 200));
    }
  }

  return pulse;
}

export const dailyPulse = inngest.createFunction(
  { id: "daily-pulse", name: "Daily pulse — audit only (7:00 a.m. Denver)" },
  { cron: PULSE_CRON },
  ({ step }) => handle({ db: defaultDb, step, env: process.env, dryRun: false })
);

export default dailyPulse;
