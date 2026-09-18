// HOLE 21 — read-only after-check. Did the live dispatcher hand #13's owed
// no-book chase message to Twilio / Resend? BEGIN READ ONLY, ROLLBACK. No SET.
import pg from "pg";

const CLIENT = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const { rows } = await c.query(
    `SELECT id, created_at, updated_at, scheduled_at, channel, template_key, status, provider,
            provider_message_id IS NOT NULL AS has_provider_id, attempts,
            CASE WHEN channel = 'sms' THEN right(to_address, 4) ELSE split_part(to_address,'@',2) END AS to_tail,
            conversation_id IS NOT NULL AS threaded, provider_ref,
            left(coalesce(last_error, blocked_reason, ''), 200) AS err
       FROM messages WHERE client_id = $1 ORDER BY created_at`, [CLIENT]);
  console.log(`now ${new Date().toISOString()}`);
  for (const r of rows) console.log(JSON.stringify(r));
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
