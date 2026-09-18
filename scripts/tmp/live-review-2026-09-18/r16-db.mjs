// HOLE 16 REVIEWER — read-only look at #9 Nine-Repair on the live database.
// BEGIN READ ONLY then ROLLBACK. No SET. Prints last 4 of addresses only.
// Usage: node --env-file=<repo>/.env r16-db.mjs <tag> [sinceISO]
import pg from "pg";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const TAG = process.argv[2] || "look";
const SINCE = process.argv[3] || "2026-09-18T15:00:00Z";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const out = { tag: TAG, at: new Date().toISOString(), since: SINCE };
try {
  await c.query("BEGIN READ ONLY");
  out.dbNow = (await c.query("SELECT now() AS n")).rows[0].n;
  out.docCheckNewest = (await c.query(
    `SELECT created_at, trigger_event, left(event_id::text, 12) AS event_id, mode, outcome, sent_message_id IS NOT NULL AS has_sent_msg,
            left(detail, 120) AS detail120
       FROM agent_runs WHERE client_id=$1 AND agent_code='DOC-CHECK' ORDER BY created_at DESC LIMIT 8`, [NINE])).rows;
  out.docCheckSince = (await c.query(
    `SELECT count(*)::int AS n FROM agent_runs WHERE client_id=$1 AND agent_code='DOC-CHECK' AND created_at >= $2`, [NINE, SINCE])).rows[0].n;
  out.messagesSince = (await c.query(
    `SELECT created_at, direction, channel, template_key, status, provider,
            (provider_message_id IS NOT NULL OR provider_ref IS NOT NULL) AS has_provider_id,
            right(to_address, 4) AS to_last4, left(coalesce(last_error, blocked_reason, ''), 120) AS err
       FROM messages WHERE client_id=$1 AND created_at >= $2 ORDER BY created_at`, [NINE, SINCE])).rows;
  out.documentsNewest = (await c.query(
    `SELECT created_at, kind, subtype, byte_size, left(id::text, 8) AS id8
       FROM documents WHERE client_id=$1 ORDER BY created_at DESC LIMIT 5`, [NINE])).rows;
  out.failedDocCheck = (await c.query(
    `SELECT first_seen_at, last_seen_at, next_attempt_at, status, attempts, max_attempts, handler_name, left(error_message, 100) AS err
       FROM failed_events WHERE client_id=$1 AND first_seen_at >= $2 ORDER BY first_seen_at`, [NINE, SINCE])).rows;
  out.otherAgentRunsSince = (await c.query(
    `SELECT created_at, agent_code, outcome, left(detail, 80) AS d
       FROM agent_runs WHERE client_id=$1 AND agent_code <> 'DOC-CHECK' AND created_at >= $2 ORDER BY created_at`, [NINE, SINCE])).rows;
  out.pii = (await c.query(
    `SELECT verified_by, verified_at, (verified_legal_name IS NOT NULL) AS has_name FROM pii_identity WHERE client_id=$1`, [NINE])).rows;
  await c.query("ROLLBACK");
} finally { await c.end(); }
console.log(JSON.stringify(out, null, 2));
