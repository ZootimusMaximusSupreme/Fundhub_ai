// Hole 2 (metro2 row) — read only, after the live look. One READ ONLY
// transaction, plain SELECTs, COMMIT. No SET, no write, no send.
// Proves: no document and no message was made for #11 or #9 since the look began.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/h2-metro2-row-nothing-sent.mjs <sinceISO>
import { pool, close } from "../../../src/db.mjs";
const SINCE = process.argv[2];
const IDS = ["029964c5-4d8e-47ed-88c9-53ac13863fd4", "be3dcfd7-faae-4001-b97f-9bc30875bbcd"];
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const docs = await c.query(
    `SELECT client_id, kind, subtype, count(*)::int AS n, max(created_at) AS newest
       FROM documents WHERE client_id = ANY($1::uuid[]) GROUP BY 1,2,3 ORDER BY 1,2,3`, [IDS]);
  const newDocs = await c.query(
    `SELECT count(*)::int AS n FROM documents WHERE client_id = ANY($1::uuid[]) AND created_at >= $2`, [IDS, SINCE]);
  const newMsgs = await c.query(
    `SELECT count(*)::int AS n FROM messages WHERE client_id = ANY($1::uuid[]) AND created_at >= $2`, [IDS, SINCE]);
  const metro2All = await c.query(
    `SELECT count(*)::int AS n FROM documents WHERE subtype = 'metro2_dispute_letter_pack'`);
  await c.query("COMMIT");
  console.log(JSON.stringify({ at: new Date().toISOString(), since: SINCE, docsByClient: docs.rows,
    newDocsSince: newDocs.rows[0].n, newMessagesSince: newMsgs.rows[0].n,
    metro2DocsAllClients: metro2All.rows[0].n }, null, 2));
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error("read failed:", e.message);
  process.exitCode = 1;
} finally {
  c.release();
  await close();
}
