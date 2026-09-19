// h20 — read-only: what did the LIVE daily pulse (runs on Netlify with the real
// production env) record about Gmail? The pulse lists every FAIL in agent_runs.detail
// (cut at 2000 chars). A "gmail:" entry there means the live runtime tried and failed.
// No entry (and detail not cut off) means PASS or skip — and skip only happens when
// the stored token does not parse, which h20-verify.mjs Part B rules in or out.
// Runs inside BEGIN READ ONLY (no bare SET on the pooler). Prints no secrets.
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.log("DATABASE_URL not set"); process.exit(1); }
const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const { rows } = await client.query(
    `select created_at, mode, outcome, detail
       from agent_runs
      where trigger_event = 'cron.daily-pulse'
      order by created_at desc
      limit 10`
  );
  console.log(`daily-pulse runs found: ${rows.length}`);
  for (const r of rows) {
    const detail = String(r.detail || "");
    const parts = detail.split(" | ");
    const ids = parts.map((p) => p.split(":")[0]);
    const gmail = parts.filter((p) => p.startsWith("gmail:"));
    console.log(`${new Date(r.created_at).toISOString()} mode=${r.mode} outcome=${r.outcome}`);
    console.log(`  detail length=${detail.length} (cut off at 2000: ${detail.length >= 2000 ? "maybe" : "no"})`);
    console.log(`  FAIL ids listed: ${ids.join(", ")}`);
    console.log(`  gmail: ${gmail.length ? gmail.join(" ; ") : "no gmail FAIL listed"}`);
  }
  await client.query("ROLLBACK");
} finally {
  await client.end();
}
