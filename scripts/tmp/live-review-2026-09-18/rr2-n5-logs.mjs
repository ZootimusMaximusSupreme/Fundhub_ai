// Reviewer, hole N5 — LOOK ONLY. Independent of the fixer's r2-N5-verify.mjs.
// Pulls live Netlify logs for the five timed jobs over one 10-minute window and,
// for each job, groups every run by the schedule tick it belongs to. A tick
// that ran more than once = Netlify retried it (the hole). Also lists every
// ERROR line text (not only the "unsupported value" one), so a different
// failure hiding behind the fix would still show.
//
// Writes only log copies + a summary JSON into the evidence folder. No DB, no HTTP writes.
// Run: node --env-file=<repo>/.env rr2-n5-logs.mjs <sinceISO> <tag> [deployId]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const since = new Date(process.argv[2]);
if (Number.isNaN(since.getTime())) throw new Error("need <sinceISO>");
const until = new Date(since.getTime() + 10 * 60000);
const TAG = process.argv[3] || "rr";
const DEPLOY = process.argv[4] || null; // optional: pin logs to one deploy id
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N5/review";
mkdirSync(OUT, { recursive: true });

// period in minutes, from netlify.toml (read by hand, not trusted from the fixer)
const JOBS = [
  ["commas-inbox-sweeper", 1],
  ["creative-job-runner", 2],
  ["staff-message-sweeper", 5],
  ["social-publish-sweeper", 5],
  ["hubstaff-poll-sweeper", 10]
];

const summary = {
  at: new Date().toISOString(),
  tag: TAG,
  window: [since.toISOString(), until.toISOString()],
  window_complete: until.getTime() <= Date.now(),
  deploy_pinned: DEPLOY,
  jobs: []
};

for (const [name, period] of JOBS) {
  let text = "";
  try {
    text = execFileSync("netlify", ["logs", ...(DEPLOY ? ["--deploy-id", DEPLOY] : []), "--function", name, "--since", since.toISOString(), "--until", until.toISOString()], {
      cwd: "/Users/chrisstanbridge/Developer/fundhub-platform",
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });
  } catch (e) {
    text = String(e.stdout || "") + String(e.stderr || "");
  }
  writeFileSync(path.join(OUT, `${TAG}-${name}.log`), text);
  const lines = text.split("\n");
  const ticks = new Map();
  const errors = {};
  let runs = 0;
  let errLines = 0;
  let firstRun = null;
  let lastRun = null;
  for (const l of lines) {
    const m = l.match(/\] (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z) (\w+) (.*)$/);
    if (!m) continue;
    const [, ts, level, rest] = m;
    const t = new Date(ts);
    if (/Duration:/.test(rest)) {
      runs++;
      firstRun ??= ts;
      lastRun = ts;
      // Netlify fires at the top of the tick; runs land a few seconds after.
      const tick = new Date(Math.floor(t.getTime() / (period * 60000)) * period * 60000).toISOString().slice(11, 16);
      ticks.set(tick, (ticks.get(tick) || 0) + 1);
    }
    if (level === "ERROR" || /Invoke Error|unsupported value|Task timed out|Runtime\.|Unhandled/.test(rest)) {
      errLines++;
      const key = (rest.match(/"errorMessage":"([^"]{0,160})/) || [null, rest.slice(0, 160)])[1];
      errors[key] = (errors[key] || 0) + 1;
    }
  }
  const perTick = [...ticks.entries()];
  summary.jobs.push({
    name,
    every_min: period,
    expected_runs_approx: 10 / period,
    runs,
    ticks_seen: perTick.length,
    ticks_with_more_than_one_run: perTick.filter(([, n]) => n > 1),
    max_runs_in_one_tick: perTick.reduce((a, [, n]) => Math.max(a, n), 0),
    error_lines: errLines,
    unsupported_value_lines: (text.match(/unsupported value/g) || []).length,
    invoke_error_lines: (text.match(/Invoke Error/g) || []).length,
    distinct_errors: errors,
    run_times: lines.filter((l) => /Duration:/.test(l)).map((l) => (l.match(/T(\d\d:\d\d:\d\d)/) || [])[1]),
    first_run: firstRun,
    last_run: lastRun
  });
}

writeFileSync(path.join(OUT, `${TAG}-summary.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
