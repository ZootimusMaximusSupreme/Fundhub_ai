// Reviewer, hole N5 — LOOK ONLY. Does the work behind the timed jobs still get
// done now that each tick runs once? Counts only, no row contents.
//   commas_inbox (payment queue, drained every minute by commas-inbox-sweeper)
//   messages from staff (released every 5 minutes by staff-message-sweeper)
// Inside BEGIN READ ONLY, rolled back. No bare SET (pooler 6543).
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
await c.connect();
const out = { at: new Date().toISOString() };
try {
  await c.query("BEGIN READ ONLY");
  out.commas_inbox = (await c.query(`
    SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending_now,
           count(*) FILTER (WHERE status = 'pending' AND received_at < now() - interval '2 minutes')::int AS stale_pending_over_2min,
           count(*) FILTER (WHERE status = 'done' AND processed_at > '2026-09-18T19:47:05Z')::int AS done_since_fix_live,
           max(processed_at) AS last_processed_at,
           max(received_at) AS last_received_at,
           count(*) FILTER (WHERE status NOT IN ('pending','done'))::int AS other_status
      FROM commas_inbox`)).rows[0];
  out.staff_messages = (await c.query(`
    SELECT count(*) FILTER (WHERE status = 'queued' AND (scheduled_at IS NULL OR scheduled_at < now() - interval '10 minutes'))::int AS queued_overdue_10min,
           count(*) FILTER (WHERE status = 'sending' AND last_attempt_at < now() - interval '10 minutes')::int AS stuck_sending_10min,
           count(*) FILTER (WHERE last_attempt_at > '2026-09-18T19:47:05Z')::int AS attempted_since_fix_live,
           max(last_attempt_at) AS last_attempt_at
      FROM messages
     WHERE direction = 'outbound' AND sender_staff_id IS NOT NULL`)).rows[0];
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
console.log(JSON.stringify(out, null, 2));
