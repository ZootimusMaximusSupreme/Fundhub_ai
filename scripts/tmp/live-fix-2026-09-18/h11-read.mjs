// Hole 11 — read only. One READ ONLY transaction on one client connection,
// plain SELECTs, then COMMIT. No SET, no write, no send.
// What did #12 actually get, and who else would a What You Own course row touch?
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/h11-read.mjs
import { pool, close } from "../../../src/db.mjs";

const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const LIVE = "e.revoked_at IS NULL AND (e.expires_at IS NULL OR e.expires_at > now())";

const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const ents = await c.query(`
    SELECT e.entitlement_code, e.grant_reason, e.granted_at, e.revoked_at, e.expires_at
      FROM entitlements e WHERE e.client_id = $1 ORDER BY e.granted_at`, [TWELVE]);
  const catalog = await c.query(`
    SELECT code, name FROM entitlement_catalog WHERE code = 'funding-mastery-course'`);
  const grants = await c.query(`
    SELECT product_code, entitlement_code FROM product_entitlements
     WHERE entitlement_code = 'funding-mastery-course' OR product_code = 'funding-mastery'`);
  const docs = await c.query(`
    SELECT kind, subtype, title FROM documents WHERE client_id = $1 ORDER BY created_at DESC`, [TWELVE]);
  const holders = await c.query(`
    SELECT e.client_id,
           (SELECT count(*) FROM entitlements o WHERE o.client_id = e.client_id
              AND o.entitlement_code <> 'funding-mastery-course'
              AND o.revoked_at IS NULL AND (o.expires_at IS NULL OR o.expires_at > now()))::int AS other_grants,
           (SELECT count(*) FROM documents d WHERE d.client_id = e.client_id AND d.kind = 'deliverable')::int AS deliverables
      FROM entitlements e
     WHERE e.entitlement_code = 'funding-mastery-course' AND ${LIVE}`);
  await c.query("COMMIT");
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    twelve_entitlements: ents.rows,
    catalog: catalog.rows,
    product_grants: grants.rows,
    twelve_documents: docs.rows,
    course_holders: holders.rows,
  }, null, 2));
} catch (e) {
  try { await c.query("ROLLBACK"); } catch { /* ignore */ }
  console.error("read failed:", e.message);
  process.exitCode = 1;
} finally {
  c.release();
  await close();
}
