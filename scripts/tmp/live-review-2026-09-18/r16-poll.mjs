// HOLE 16 REVIEWER — read-only poll of #9 after the one upload. BEGIN READ ONLY per look; no SET.
// Usage: node --env-file=<repo>/.env r16-poll.mjs <sinceISO> [minutes] [everySec]
import pg from "pg";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const SINCE = process.argv[2];
const MIN = Number(process.argv[3] || 8);
const EVERY = Number(process.argv[4] || 30);
if (!SINCE) throw new Error("since required");
const end = Date.now() + MIN * 60000;
let n = 0;
while (true) {
  n += 1;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const runs = (await c.query(
      `SELECT created_at, trigger_event, mode, outcome, sent_message_id IS NOT NULL AS has_sent_msg, left(detail, 120) AS detail120
         FROM agent_runs WHERE client_id=$1 AND agent_code='DOC-CHECK' AND created_at >= $2 ORDER BY created_at`, [NINE, SINCE])).rows;
    const msgs = (await c.query(
      `SELECT created_at, direction, channel, template_key, status, provider,
              (provider_message_id IS NOT NULL OR provider_ref IS NOT NULL) AS has_provider_id,
              right(to_address, 4) AS to_last4, left(coalesce(last_error, blocked_reason, ''), 100) AS err
         FROM messages WHERE client_id=$1 AND created_at >= $2 ORDER BY created_at`, [NINE, SINCE])).rows;
    const docs = (await c.query(
      `SELECT created_at, kind, subtype, byte_size, left(id::text,8) AS id8 FROM documents WHERE client_id=$1 AND created_at >= $2 ORDER BY created_at`, [NINE, SINCE])).rows;
    const fails = (await c.query(
      `SELECT first_seen_at, handler_name, status, attempts, left(error_message, 100) AS err FROM failed_events WHERE client_id=$1 AND first_seen_at >= $2 ORDER BY first_seen_at`, [NINE, SINCE])).rows;
    await c.query("ROLLBACK");
    console.log(JSON.stringify({ look: n, at: new Date().toISOString(), docs, docCheckRuns: runs, messages: msgs, failedEvents: fails }));
  } finally { await c.end(); }
  if (Date.now() + EVERY * 1000 > end) break;
  await new Promise((r) => setTimeout(r, EVERY * 1000));
}
