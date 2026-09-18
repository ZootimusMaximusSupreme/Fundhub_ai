// HOLE 21 VERIFY — read-only look at file #13 Thirteen-NoBook on the live database.
// BEGIN READ ONLY, then ROLLBACK. No SET. Never prints a secret; phone/email shown
// as last 4 / domain only.
import pg from "pg";

const CLIENT = process.argv[2] || "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const show = (label, rows) => {
  console.log(`\n== ${label} (${rows.length})`);
  for (const r of rows) console.log(JSON.stringify(r));
};
try {
  await c.query("BEGIN READ ONLY");
  const cl = await c.query(
    `SELECT id, org_id, first_name, last_name, right(phone, 4) AS phone_last4,
            split_part(email,'@',2) AS email_domain, created_at, updated_at, is_demo,
            dnd_sms, dnd_email, consent_sms, tags, pipeline_ids
       FROM clients WHERE id = $1`, [CLIENT]);
  show("client", cl.rows);
  const me = cl.rows[0];

  show("events for this client (by client_id)", (await c.query(
    `SELECT id, name, created_at, idempotency_key, replayed_at,
            left(payload::text, 200) AS payload
       FROM events WHERE client_id = $1 ORDER BY created_at`, [CLIENT])).rows);

  show("messages", (await c.query(
    `SELECT created_at, direction, channel, template_key, status, provider, right(to_address, 4) AS to_last4,
            scheduled_at, left(coalesce(last_error, blocked_reason, ''), 160) AS err
       FROM messages WHERE client_id = $1 ORDER BY created_at`, [CLIENT])).rows);

  show("agent_runs", (await c.query(
    `SELECT created_at, agent_code, trigger_event, event_id, mode, outcome, left(detail, 200) AS detail
       FROM agent_runs WHERE client_id = $1 ORDER BY created_at`, [CLIENT])).rows);

  show("failed_events", (await c.query(
    `SELECT event_id, handler_name, status, attempts, first_seen_at, last_seen_at, next_attempt_at,
            resolved_at, left(error_message, 200) AS err
       FROM failed_events WHERE client_id = $1 ORDER BY first_seen_at`, [CLIENT])).rows);

  if (me) {
    // Booking events in the same org that the chase's hasBooked() would match.
    show("booking.created rows hasBooked would match", (await c.query(
      `WITH me AS (SELECT org_id, email, phone FROM clients WHERE id = $1)
       SELECT e.id, e.client_id, e.created_at,
              (e.client_id = $1) AS by_client,
              (e.client_id IS NULL AND lower(COALESCE(e.payload->>'email','')) = lower(me.email)) AS by_email,
              (e.client_id IS NULL AND right(regexp_replace(COALESCE(e.payload->>'phone',''), '\\D', '', 'g'), 10)
                  = right(regexp_replace(COALESCE(me.phone,''), '\\D', '', 'g'), 10)) AS by_phone
         FROM events e, me
        WHERE e.name = 'booking.created' AND e.org_id = me.org_id
          AND (e.client_id = $1
               OR (e.client_id IS NULL AND me.email IS NOT NULL
                   AND lower(COALESCE(e.payload->>'email','')) = lower(me.email))
               OR (e.client_id IS NULL
                   AND length(regexp_replace(COALESCE(me.phone,''), '\\D', '', 'g')) >= 10
                   AND right(regexp_replace(COALESCE(e.payload->>'phone',''), '\\D', '', 'g'), 10)
                     = right(regexp_replace(me.phone, '\\D', '', 'g'), 10)))
        ORDER BY e.created_at`, [CLIENT])).rows);

    show("NOBOOK templates", (await c.query(
      `SELECT org_id = $1 AS same_org, org_id IS NULL AS global, template_key, channel, compliance_passed,
              approved_at IS NOT NULL AS approved, left(body, 120) AS body
         FROM message_templates WHERE template_key LIKE '%NOBOOK%' ORDER BY template_key`, [me.org_id])).rows);

    show("survey.submitted events in this org, last 10", (await c.query(
      `SELECT id, client_id, created_at, replayed_at FROM events
        WHERE org_id = $1 AND name = 'survey.submitted' ORDER BY created_at DESC LIMIT 10`, [me.org_id])).rows);

    show("any NOBOOK messages in this org, last 15", (await c.query(
      `SELECT created_at, client_id, template_key, status, right(to_address,4) AS to_last4
         FROM messages WHERE org_id = $1 AND template_key LIKE '%NOBOOK%'
        ORDER BY created_at DESC LIMIT 15`, [me.org_id])).rows);
  }
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
