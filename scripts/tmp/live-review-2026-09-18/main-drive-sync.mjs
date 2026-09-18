// Read-only: when did the Drive sync cron last touch its state row?
import pg from "pg";
const url = process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const cols = await c.query("select column_name from information_schema.columns where table_name='brain_drive_sync'");
  console.log("cols", cols.rows.map(r => r.column_name).join(","));
  const r = await c.query("select * from brain_drive_sync");
  for (const row of r.rows) {
    const o = {};
    for (const [k, v] of Object.entries(row)) if (/_at$|error|status|count/.test(k)) o[k] = typeof v === "string" ? v.slice(0, 80) : v;
    console.log(JSON.stringify(o));
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
