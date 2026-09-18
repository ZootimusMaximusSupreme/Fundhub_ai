// HOLE 21 — read-only. Replays the OLD hasBooked() query (before the GAP 23 fix,
// commit bf24b6c8, live 2026-09-17 23:14 UTC) against #13 as the database stood
// when #13's survey.submitted events landed (2026-09-17 ~06:20 UTC). Shows which
// booking rows answered "yes, booked" for a client who never booked.
// BEGIN READ ONLY, then ROLLBACK. No SET. Phones last 4 only.
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
  const firstSurvey = (await c.query(
    `SELECT min(created_at) AS first, max(created_at) AS last, count(*)::int AS n
       FROM events WHERE client_id = $1 AND name = 'survey.submitted'`, [CLIENT])).rows[0];
  show("#13 survey.submitted window", [firstSurvey]);

  show("OLD hasBooked matches that existed before #13's first survey", (await c.query(
    `WITH me AS (SELECT org_id, email, phone FROM clients WHERE id = $1)
     SELECT e.id, e.client_id, e.created_at,
            (SELECT first_name || ' ' || last_name FROM clients x WHERE x.id = e.client_id) AS booked_client,
            right(regexp_replace(COALESCE(e.payload->>'phone',''), '\\D', '', 'g'), 4) AS payload_phone_last4,
            (e.client_id = $1) AS is_13
       FROM events e, me
      WHERE e.name = 'booking.created'
        AND e.org_id = me.org_id
        AND e.created_at < $2
        AND (
             e.client_id = $1
          OR (me.email IS NOT NULL
              AND lower(COALESCE(e.payload->>'email','')) = lower(me.email))
          OR (length(regexp_replace(COALESCE(me.phone,''), '\\D', '', 'g')) >= 10
              AND right(regexp_replace(COALESCE(e.payload->>'phone',''), '\\D', '', 'g'), 10)
                = right(regexp_replace(me.phone, '\\D', '', 'g'), 10))
        )
      ORDER BY e.created_at`, [CLIENT, firstSurvey.first])).rows);

  show("NEW hasBooked matches (today's code) at any time", (await c.query(
    `WITH me AS (SELECT org_id, email, phone FROM clients WHERE id = $1)
     SELECT e.id FROM events e, me
      WHERE e.name = 'booking.created' AND e.org_id = me.org_id
        AND (e.client_id = $1
          OR (e.client_id IS NULL AND me.email IS NOT NULL
              AND lower(COALESCE(e.payload->>'email','')) = lower(me.email))
          OR (e.client_id IS NULL
              AND length(regexp_replace(COALESCE(me.phone,''), '\\D', '', 'g')) >= 10
              AND right(regexp_replace(COALESCE(e.payload->>'phone',''), '\\D', '', 'g'), 10)
                = right(regexp_replace(me.phone, '\\D', '', 'g'), 10)))`, [CLIENT])).rows);

  // Control: the one no-book chase that DID send today (other client). When did
  // its survey land, and when did SMS-NOBOOK-01 go? Proves the 2h clock fires.
  show("control: 567c12ce survey vs NOBOOK-01", (await c.query(
    `SELECT (SELECT min(created_at) FROM events WHERE client_id = '567c12ce-64de-4043-aa98-d842434bd267'
              AND name = 'survey.submitted') AS survey_at,
            (SELECT min(created_at) FROM messages WHERE client_id = '567c12ce-64de-4043-aa98-d842434bd267'
              AND template_key = 'SMS-NOBOOK-01') AS nobook1_at`)).rows);

  // Other survey-done clients in the window before the fix went live (23:14 UTC
  // 2026-09-17) who share the agent phone: did any of them get a chase?
  show("survey.submitted clients 09-17 before fix, and whether NOBOOK-01 ever sent", (await c.query(
    `SELECT e.client_id, min(e.created_at) AS first_survey, count(*)::int AS surveys,
            right(regexp_replace(COALESCE(cl.phone,''), '\\D', '', 'g'), 4) AS phone_last4,
            cl.first_name || ' ' || cl.last_name AS name,
            (SELECT count(*)::int FROM messages m WHERE m.client_id = e.client_id AND m.template_key LIKE '%NOBOOK%') AS nobook_msgs,
            (SELECT count(*)::int FROM events b WHERE b.client_id = e.client_id AND b.name = 'booking.created') AS own_bookings
       FROM events e JOIN clients cl ON cl.id = e.client_id
      WHERE e.name = 'survey.submitted'
        AND e.created_at >= '2026-09-17T00:00:00Z' AND e.created_at < '2026-09-17T23:14:00Z'
      GROUP BY e.client_id, cl.phone, cl.first_name, cl.last_name
      ORDER BY first_survey`)).rows);

  await c.query("ROLLBACK");
} finally {
  await c.end();
}
