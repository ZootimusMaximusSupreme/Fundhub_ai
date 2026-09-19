// r8 — reviewer's read-only look at live truth for hole 8 (#8 rounds, #8 client row, org approved rounds).
// BEGIN READ ONLY, ROLLBACK. No bare SET. No secrets printed.
import pg from "pg";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p = []) => {
  await c.query("SAVEPOINT s");
  try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 200) }]; }
};
try {
  await c.query("BEGIN READ ONLY");
  console.log("read_only=", (await q("show transaction_read_only"))[0].transaction_read_only, "now=", (await q("select now() n"))[0].n.toISOString());
  const cl = await q(`select id, org_id, client_code, first_name, last_name, funded, funded_amount, outcome_tier, is_demo, updated_at from clients where id=$1`, [EIGHT]);
  console.log("#8 client:", JSON.stringify(cl[0]));
  const org = cl[0].org_id;
  console.log("#8 rounds:");
  for (const r of await q(`select id, round_number, status, product, submitted_amount, approved_amount, funded_amount, is_demo, created_at, updated_at from funding_rounds where client_id=$1 order by round_number`, [EIGHT])) console.log("  ", JSON.stringify(r));
  console.log("#8 applications:");
  for (const r of await q(`select id, funding_round_id, bank, lender_name, status, approved_amount, requested_amount, approval_excluded_at, is_demo from applications where client_id=$1 order by created_at`, [EIGHT])) console.log("  ", JSON.stringify(r));
  console.log("org: every round with an approved amount (any client):");
  for (const r of await q(`select fr.id, c.client_code, c.first_name, c.last_name, fr.client_id, fr.round_number, fr.status, fr.product, fr.approved_amount, fr.funded_amount, fr.is_demo, c.is_demo client_demo, c.funded client_funded, c.funded_amount client_funded_amount, fr.created_at, fr.updated_at
      from funding_rounds fr join clients c on c.id=fr.client_id where fr.org_id=$1 and fr.approved_amount is not null order by fr.created_at`, [org])) console.log("  ", JSON.stringify(r));
  console.log("org: all rounds summary by client:");
  for (const r of await q(`select c.client_code, c.first_name, c.last_name, fr.client_id, count(*)::int rounds, count(*) filter (where fr.status='funded')::int funded_rounds,
      sum(fr.funded_amount) filter (where fr.status='funded') funded_sum, sum(fr.approved_amount) approved_sum, count(*) filter (where fr.approved_amount is not null)::int with_approved,
      bool_or(fr.status='funded' and fr.funded_amount is null) funded_null, c.funded client_funded, c.funded_amount client_funded_amount, min(fr.created_at) first_at, max(fr.updated_at) last_upd
      from funding_rounds fr join clients c on c.id=fr.client_id where fr.org_id=$1 group by 1,2,3,4,c.funded,c.funded_amount order by first_at`, [org])) console.log("  ", JSON.stringify(r));
  console.log("org totals:", JSON.stringify((await q(`select count(*)::int rounds, count(*) filter (where status='funded')::int funded_rounds, sum(funded_amount) filter (where status='funded') funded_sum, count(*) filter (where approved_amount is not null)::int rounds_with_approved, sum(approved_amount) approved_sum, count(*) filter (where status='funded' and (approved_amount is null or approved_amount=0))::int funded_no_approval from funding_rounds where org_id=$1`, [org]))[0]));
  console.log("org clients funded=true:", JSON.stringify(await q(`select client_code, first_name, last_name, id, funded, funded_amount, updated_at from clients where org_id=$1 and funded order by updated_at`, [org])));
  console.log("rounds created/updated since 2026-09-18 14:00Z:");
  for (const r of await q(`select fr.id, c.first_name, c.last_name, fr.client_id, fr.round_number, fr.status, fr.approved_amount, fr.funded_amount, fr.created_at, fr.updated_at from funding_rounds fr join clients c on c.id=fr.client_id where fr.org_id=$1 and (fr.created_at>'2026-09-18T14:00Z' or fr.updated_at>'2026-09-18T14:00Z') order by fr.updated_at`, [org])) console.log("  ", JSON.stringify(r));
  await c.query("ROLLBACK");
} finally { await c.end(); }
