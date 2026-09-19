// N2 — read-only side checks. (1) Does a real Fanbasis payment's itemId echo
// the id we stored on the link at mint? (2) Is the one non-listed failed row
// (client 6e8d0c8d, 2026-09-06) the Walk4 demo file? Booleans only; no names.
// BEGIN READ ONLY; ROLLBACK.
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const real = await c.query(
    `SELECT pl.id, pl.status, pl.commas_session_id, pl.paid_at,
            e.payload->>'itemId' AS item_id, e.payload->>'providerRef' AS provider_ref_shape
       FROM payment_links pl
       JOIN events e ON e.name = 'payment.received' AND e.payload->>'ref' = pl.link_ref
      WHERE e.payload->>'itemId' IS NOT NULL
      ORDER BY e.created_at DESC LIMIT 10`);
  console.log("links paid by an event that carried itemId:");
  for (const r of real.rows) {
    console.log(JSON.stringify({ id: r.id, status: r.status, stored: r.commas_session_id, item_id: r.item_id,
      item_equals_stored: r.item_id === r.commas_session_id, paid_at: r.paid_at }));
  }
  const who = await c.query(
    `SELECT id, (first_name ILIKE 'walk%') AS is_walk, (first_name ILIKE 'sim%') AS is_sim,
            (last_name ILIKE '%walk4%' OR first_name ILIKE '%walk4%' OR (first_name ILIKE 'walk%' AND last_name ILIKE '%4%')) AS maybe_walk4
       FROM clients WHERE id = ANY($1)`,
    [["6e8d0c8d-d0c1-438c-9c9b-50516c086eb7", "4cd0dbd1-4e37-4df4-bc90-ced7052e183f", "9b03c7f2-b75f-4700-88b2-0fe783c3143a"]]);
  console.log("non-listed clients:", JSON.stringify(who.rows));
  const walk4 = await c.query(
    `SELECT id FROM clients WHERE first_name ILIKE 'walk4%' OR last_name ILIKE 'walk4%' OR (first_name ILIKE 'walk%' AND (first_name || ' ' || coalesce(last_name,'')) ILIKE '%4%')`);
  console.log("walk4 candidates:", JSON.stringify(walk4.rows));
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
