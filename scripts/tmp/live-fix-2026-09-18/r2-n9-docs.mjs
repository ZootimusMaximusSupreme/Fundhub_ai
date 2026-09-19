// N9 — list the funding letters saved on live (ids, who built them, when).
// READ ONLY. Prints client id prefixes only — no names, no addresses.
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n9-docs.mjs
import { pool, close } from "../../../src/db.mjs";

const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const r = await c.query(`
    SELECT d.id, d.client_id, d.kind, d.subtype, d.title, d.mime_type, d.generated_by,
           d.created_at, COALESCE(c.is_demo, false) AS is_demo
      FROM documents d JOIN clients c ON c.id = d.client_id
     WHERE d.subtype IN ('funding_inquiry_removal', 'funding_personal_info')
     ORDER BY d.created_at`);
  console.log(JSON.stringify(r.rows.map((x) => ({ ...x, client_id: x.client_id.slice(0, 8) })), null, 1));
  const o = await c.query(`
    SELECT c.id FROM clients c
     WHERE COALESCE(c.is_demo, false) = false
       AND EXISTS (SELECT 1 FROM crs_results r WHERE r.client_id = c.id)`);
  console.log("non-demo clients with a credit file:", o.rows.map((x) => x.id.slice(0, 8)));
  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  c.release();
  await close();
}
