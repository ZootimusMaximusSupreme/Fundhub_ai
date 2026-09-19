// r12 — reviewer's read-only look at live truth for hole 12 (#8 saved next action vs open inquiry cases).
// BEGIN READ ONLY, ROLLBACK. No bare SET. No secrets printed.
// Run: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r12-db.mjs
import pg from "pg";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const SINCE = "2026-09-18T14:00Z";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p = []) => {
  await c.query("SAVEPOINT s");
  try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 200) }]; }
};
const j = (x) => JSON.stringify(x);
try {
  await c.query("BEGIN READ ONLY");
  console.log("read_only=", (await q("show transaction_read_only"))[0].transaction_read_only, "now=", (await q("select now() n"))[0].n.toISOString());

  const cl = await q(`select id, org_id, client_code, first_name, last_name, updated_at,
      custom_fields->>'employee_next_action' saved_next,
      (select array_agg(k order by k) from jsonb_object_keys(coalesce(custom_fields,'{}'::jsonb)) k) cf_keys
    from clients where id=$1`, [EIGHT]);
  console.log("#8 client:", j(cl[0]));
  const org = cl[0]?.org_id;

  console.log("#8 custom_fields (next-action-ish keys):");
  for (const r of await q(`select key, value from clients, jsonb_each(coalesce(custom_fields,'{}'::jsonb)) where id=$1 and (key ilike '%next%' or key ilike '%action%' or key ilike '%step%' or key ilike '%stage%' or key ilike '%updated%')`, [EIGHT])) console.log("  ", j(r));

  console.log("#8 inquiry_removal_cases:");
  for (const r of await q(`select id, case_id, case_status, funding_round_id, open_inquiry_count, requested_at, closed_at, completed_at, created_at, updated_at from inquiry_removal_cases where client_id=$1 order by created_at`, [EIGHT])) console.log("  ", j(r));

  console.log("#8 inquiry_log (count by status):");
  for (const r of await q(`select * from inquiry_log where client_id=$1 limit 1`, [EIGHT])) console.log("   sample cols:", Object.keys(r).join(","));
  console.log("#8 events since", SINCE);
  for (const r of await q(`select name, created_at, left(payload::text, 220) payload from events where client_id=$1 and created_at>$2 order by created_at`, [EIGHT, SINCE])) console.log("  ", j(r));
  console.log("#8 tasks created/updated since", SINCE);
  for (const r of await q(`select * from tasks where client_id=$1 and (created_at>$2 or updated_at>$2) order by updated_at limit 20`, [EIGHT, SINCE])) console.log("  ", j(r).slice(0, 400));
  console.log("#8 funding_rounds:");
  for (const r of await q(`select id, round_number, status, created_at, updated_at from funding_rounds where client_id=$1 order by round_number`, [EIGHT])) console.log("  ", j(r));

  // Optional: other clients in the org with saved "Collect Documents" while an inquiry case is open.
  console.log("org: saved next action x open inquiry cases (open = not Completed/Canceled):");
  for (const r of await q(`select c.id, c.client_code, c.first_name, c.last_name, c.custom_fields->>'employee_next_action' saved_next, c.updated_at,
        count(irc.*) filter (where irc.case_status not in ('Completed','Canceled'))::int open_cases,
        array_agg(distinct irc.case_status::text) statuses
      from clients c join inquiry_removal_cases irc on irc.client_id=c.id
      where c.org_id=$1
      group by c.id order by c.updated_at desc`, [org])) console.log("  ", j(r));
  console.log("org: saved next action values (counts):");
  for (const r of await q(`select custom_fields->>'employee_next_action' saved_next, count(*)::int n from clients where org_id=$1 group by 1 order by 2 desc`, [org])) console.log("  ", j(r));
  await c.query("ROLLBACK");
} finally { await c.end(); }
