// HOLE 16 REVIEWER — second read-only look. BEGIN READ ONLY; no SET. Last 4 only.
import pg from "pg";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const out = { at: new Date().toISOString() };
try {
  await c.query("BEGIN READ ONLY");
  out.messagesSince1500 = (await c.query(
    `SELECT created_at, updated_at, direction, channel, template_key, status, provider,
            provider_message_id IS NOT NULL AS has_provider_message_id, provider_ref IS NOT NULL AS has_provider_ref,
            right(to_address, 4) AS to_last4, attempts
       FROM messages WHERE client_id=$1 AND created_at >= '2026-09-18T15:00:00Z' ORDER BY created_at`, [NINE])).rows;
  out.docCheckSince1500 = (await c.query(
    `SELECT created_at, outcome, left(detail, 120) AS detail120, left(regexp_replace(detail, '\\s+', ' ', 'g'), 400) AS detail400
       FROM agent_runs WHERE client_id=$1 AND agent_code='DOC-CHECK' AND created_at >= '2026-09-18T15:00:00Z' ORDER BY created_at`, [NINE])).rows;
  out.allAgentRunsSince1500 = (await c.query(
    `SELECT agent_code, count(*)::int AS n FROM agent_runs WHERE client_id=$1 AND created_at >= '2026-09-18T15:00:00Z' GROUP BY 1`, [NINE])).rows;
  out.pii = (await c.query(`SELECT verified_by, verified_at FROM pii_identity WHERE client_id=$1`, [NINE])).rows;
  await c.query("ROLLBACK");
} finally { await c.end(); }
console.log(JSON.stringify(out, null, 2));
