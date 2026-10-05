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
import { runMorningBrief } from "../ops/morning-brief.mjs";

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
  morningBrief = runMorningBrief
} = {}) {
  const pulse = await step.run("run-pulse", () => runDailyPulse({
    db,
    env,
    dryRun,
    fetchImpl,
    boardDir,
    gateRelayDirs,
    sendSms,
    sendWhatsApp,
    recordRun: !dryRun
  }));

  // Step 2 — the morning brief (MB3). Runs after the pulse, from its result.
  // Dry-run (MORNING_BRIEF_LIVE is false): builds and saves the morning_briefs
  // row, texts nothing. A failure here never undoes or hides the pulse.
  if (db) {
    try {
      await step.run("morning-brief", () => morningBrief({ db, env, pulse }));
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
