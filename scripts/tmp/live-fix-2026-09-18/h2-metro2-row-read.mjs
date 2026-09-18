// Hole 2 (metro2 row) — read only. One READ ONLY transaction on one client
// connection, plain SELECTs, then COMMIT. No SET, no write, no send.
// Who would the portal fix touch? Every client holding metro2-letter-pack,
// with: holds the Blueprint roadmap? has a real metro2 pack doc? has funding letters?
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/h2-metro2-row-read.mjs
import { pool, close } from "../../../src/db.mjs";

const LIVE = "e.revoked_at IS NULL AND (e.expires_at IS NULL OR e.expires_at > now())";

const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const holders = await c.query(`
    SELECT e.client_id,
           cl.outcome_tier,
           e.grant_reason,
           EXISTS (SELECT 1 FROM entitlements r
                    WHERE r.client_id = e.client_id
                      AND r.entitlement_code = 'credit-optimization-roadmap'
                      AND r.revoked_at IS NULL
                      AND (r.expires_at IS NULL OR r.expires_at > now())) AS holds_roadmap,
           (SELECT count(*) FROM documents d WHERE d.client_id = e.client_id
              AND d.kind = 'deliverable' AND d.subtype = 'metro2_dispute_letter_pack')::int AS metro2_docs,
           (SELECT count(*) FROM documents d WHERE d.client_id = e.client_id
              AND d.kind = 'deliverable'
              AND d.subtype IN ('funding_inquiry_removal','funding_personal_info'))::int AS funding_letters
      FROM entitlements e
      JOIN clients cl ON cl.id = e.client_id
     WHERE e.entitlement_code = 'metro2-letter-pack' AND ${LIVE}
     ORDER BY holds_roadmap DESC, funding_letters DESC`);
  const roadmap = await c.query(`
    SELECT e.client_id, e.grant_reason FROM entitlements e
     WHERE e.entitlement_code = 'credit-optimization-roadmap' AND ${LIVE}`);
  const metro2All = await c.query(`
    SELECT count(*)::int AS n FROM documents WHERE subtype = 'metro2_dispute_letter_pack'`);
  await c.query("COMMIT");
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    metro2Holders: holders.rows,
    roadmapHolders: roadmap.rows,
    metro2DocsAllClients: metro2All.rows[0].n
  }, null, 2));
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error("read failed:", e.message);
  process.exitCode = 1;
} finally {
  c.release();
  await close();
}
