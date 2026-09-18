// N11 — read-only. The three plain-text (non-HTML) templates that hold
// {{unsubscribe}}: what sits around the token. BEGIN READ ONLY, ROLLBACK.
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const r = await c.query(
    `SELECT template_key, subject, body FROM message_templates
      WHERE template_key IN ('Fundhub','SEND AX-07','EMAIL-AX07-FUNDING-PAUSED') ORDER BY 1`);
  for (const t of r.rows) {
    const L = t.body.split(/\r?\n/);
    const i = L.findIndex((l) => /\{\{\s*unsubscribe/.test(l));
    console.log(`== ${t.template_key} subject=${JSON.stringify(t.subject)} lines=${L.length} token line ${i + 1}`);
    console.log(L.slice(Math.max(0, i - 4), i + 2).map((l) => `  | ${JSON.stringify(l)}`).join("\n"));
  }
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
