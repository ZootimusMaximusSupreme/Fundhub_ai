// HOLE 16 — read-only look at table columns. BEGIN READ ONLY; no SET.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  for (const t of ["agent_runs", "failed_events", "messages", "tasks", "documents", "document_versions", "pii_identity", "clients", "message_templates"]) {
    const r = await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND table_schema='public' ORDER BY ordinal_position`,
      [t]
    );
    console.log(t, ":", r.rows.map((x) => x.column_name).join(","));
  }
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
