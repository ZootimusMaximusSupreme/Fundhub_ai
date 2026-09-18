// r12 — read only: what touched #8 / #11 / #12 / Combo between 14:35 and now (who wrote "Pull CRS").
// BEGIN READ ONLY, ROLLBACK. No bare SET. No secrets printed.
import pg from "pg";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  twelve: "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
  combo: "567c12ce-64de-4043-aa98-d842434bd267",
};
const SINCE = "2026-09-18T14:35Z";
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
  for (const [k, id] of Object.entries(IDS)) {
    const cl = (await q(`select updated_at, custom_fields->>'employee_next_action' saved, custom_fields->>'last_progress_action' lpa, custom_fields->>'deposit_paid' deposit_paid,
        (select count(*) from jsonb_object_keys(coalesce(custom_fields,'{}'::jsonb)))::int key_count from clients where id=$1`, [id]))[0];
    console.log(`\n== ${k}: ${j(cl)}`);
    console.log("  events since", SINCE);
    for (const r of await q(`select name, created_at from events where client_id=$1 and created_at>$2 order by created_at`, [id, SINCE])) console.log("    ", j(r));
    console.log("  tasks created/updated since", SINCE);
    for (const r of await q(`select title, source_workflow, done, created_at, updated_at from tasks where client_id=$1 and (created_at>$2 or updated_at>$2) order by created_at`, [id, SINCE])) console.log("    ", j(r));
    console.log("  open inquiry cases:");
    for (const r of await q(`select case_id, case_status, updated_at from inquiry_removal_cases where client_id=$1 and case_status not in ('Completed','Canceled') order by case_id`, [id])) console.log("    ", j(r));
  }
  // Is there a separate custom-field table the fixer's evidence called cf_table?
  console.log("\ncustom-field-ish tables:", j(await q(`select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%custom%' or table_name ilike '%field%') order by 1`)));
  await c.query("ROLLBACK");
} finally { await c.end(); }
