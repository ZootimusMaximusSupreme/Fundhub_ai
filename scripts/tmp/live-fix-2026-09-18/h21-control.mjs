// HOLE 21 — read-only control. Client 567c12ce finished a survey on 2026-09-18
// and got SMS-NOBOOK-01 two hours later. Did it share #13's phone with other
// people who HAD booked (so the old check would have stopped it too)? If yes, the
// chase clock and the fixed booking check both work on live today, and #13's
// only problem is that its one chase run ended under the old code.
// BEGIN READ ONLY, then ROLLBACK. No SET. Phones last 4 only.
import pg from "pg";

const CONTROL = "567c12ce-64de-4043-aa98-d842434bd267";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const show = (label, rows) => {
  console.log(`\n== ${label} (${rows.length})`);
  for (const r of rows) console.log(JSON.stringify(r));
};
try {
  await c.query("BEGIN READ ONLY");
  show("control client", (await c.query(
    `SELECT first_name || ' ' || last_name AS name, org_id, right(phone,4) AS phone_last4, consent_sms, created_at,
            (SELECT count(*)::int FROM events b WHERE b.client_id = clients.id AND b.name = 'booking.created') AS own_bookings
       FROM clients WHERE id = $1`, [CONTROL])).rows);

  show("stamped bookings by OTHER clients on the same phone, before control's survey", (await c.query(
    `WITH me AS (SELECT org_id, phone FROM clients WHERE id = $1),
          s AS (SELECT min(created_at) AS at FROM events WHERE client_id = $1 AND name = 'survey.submitted')
     SELECT e.client_id, e.created_at,
            (SELECT first_name || ' ' || last_name FROM clients x WHERE x.id = e.client_id) AS who
       FROM events e, me, s
      WHERE e.name = 'booking.created' AND e.org_id = me.org_id AND e.created_at < s.at
        AND e.client_id IS NOT NULL AND e.client_id <> $1
        AND right(regexp_replace(COALESCE(e.payload->>'phone',''), '\\D', '', 'g'), 10)
          = right(regexp_replace(COALESCE(me.phone,''), '\\D', '', 'g'), 10)
      ORDER BY e.created_at`, [CONTROL])).rows);

  show("control NOBOOK messages", (await c.query(
    `SELECT created_at, template_key, status, provider, right(to_address,4) AS to_last4,
            provider_message_id IS NOT NULL AS has_provider_id, provider_ref
       FROM messages WHERE client_id = $1 AND template_key LIKE '%NOBOOK%' ORDER BY created_at`, [CONTROL])).rows);

  // Is the dispatcher sweeper running right now? Newest outbound rows that left the queue.
  show("last 5 outbound messages that left the queue (any client)", (await c.query(
    `SELECT created_at, updated_at, channel, template_key, status, provider
       FROM messages WHERE direction = 'outbound' AND status <> 'queued'
      ORDER BY updated_at DESC LIMIT 5`)).rows);
  show("queued outbound messages right now", (await c.query(
    `SELECT count(*)::int AS n, min(created_at) AS oldest, min(scheduled_at) AS earliest_scheduled
       FROM messages WHERE direction = 'outbound' AND status = 'queued'`)).rows);
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
