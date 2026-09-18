// Hole N5 — LOOK ONLY. For a 10-minute window, read the live Netlify logs of
// every timed job in netlify.toml and count:
//   unsupported — lines saying "Function returned an unsupported value"
//   invokeErrors — lines saying "Invoke Error"
//   runs — "Duration:" lines (one per run, repeats included)
// and compare runs with how many times the schedule should fire in that
// window. Then one read-only look at the payment queue (commas_inbox): any
// row still 'pending' more than 2 minutes after it arrived means the payment
// sweeper is not draining.
//
// Writes nothing. The database read is inside BEGIN READ ONLY and rolled back.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-N5-verify.mjs <sinceISO> [tag]
//   <sinceISO> = start of the window, e.g. 2026-09-18T20:05:00Z. Window = 10 minutes.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const since = new Date(process.argv[2] || Date.now() - 11 * 60000);
const until = new Date(since.getTime() + 10 * 60000);
const TAG = process.argv[3] || "verify";
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const EVID = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N5";
mkdirSync(EVID, { recursive: true });

/* Expected runs per 10 minutes, from the netlify.toml schedule. */
const EVERY_MIN = { "* * * * *": 1, "*/2 * * * *": 2, "*/5 * * * *": 5, "*/10 * * * *": 10 };
const toml = readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
const jobs = [...toml.matchAll(/\[functions\."([^"]+)"\]\s*\n\s*schedule\s*=\s*"([^"]+)"/g)]
  .map((m) => ({ name: m[1], schedule: m[2], expected: EVERY_MIN[m[2]] ? 10 / EVERY_MIN[m[2]] : null }));

const out = {
  at: new Date().toISOString(), tag: TAG, window: [since.toISOString(), until.toISOString()],
  /* false = the window has not ended yet, so `runs` is a partial count. */
  window_complete: until.getTime() <= Date.now(),
  jobs: []
};
for (const j of jobs) {
  let text = "";
  try {
    text = execFileSync("netlify", ["logs", "--function", j.name,
      "--since", since.toISOString(), "--until", until.toISOString()],
      { cwd: "/Users/chrisstanbridge/Developer/fundhub-platform", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    text = String(e.stdout || "") + String(e.stderr || "");
  }
  writeFileSync(path.join(EVID, `${TAG}-${j.name}.log`), text);
  const count = (re) => (text.match(re) || []).length;
  out.jobs.push({
    name: j.name,
    schedule: j.schedule,
    expected_runs: j.expected,
    runs: count(/Duration:/g),
    unsupported: count(/unsupported value/g),
    invokeErrors: count(/Invoke Error/g)
  });
}

try {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const r = await c.query(
      `SELECT count(*) FILTER (WHERE status = 'pending' AND received_at < now() - interval '2 minutes')::int AS stale_pending,
              count(*) FILTER (WHERE status = 'done' AND processed_at > now() - interval '1 hour')::int AS done_last_hour,
              count(*) FILTER (WHERE status NOT IN ('pending', 'done'))::int AS other_status
         FROM commas_inbox`
    );
    out.payment_queue = r.rows[0];
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }
} catch (e) {
  out.payment_queue = { error: String(e.message).split("\n")[0] };
}

writeFileSync(path.join(EVID, `${TAG}-summary.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
