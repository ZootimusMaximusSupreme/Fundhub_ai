// N7 — look only. Every success-fee invoice on live next to what the fee rule
// says TODAY (10% x confirmed approvals on that round). Shows whether the
// drift touches anyone but the sims. BEGIN READ ONLY; no SET. Names only.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
const q = (s, p) => c.query(s, p).then(r => r.rows).catch(e => [{ err: e.message }]);
const rows = await q(`
  SELECT i.id, i.status, i.amount_due, i.notes, i.is_demo, i.created_at,
         cl.first_name, cl.last_name, i.client_id,
         fr.round_number, fr.status AS round_status, fr.funded_amount,
         s.agreed_success_fee_percent AS pct,
         (SELECT COALESCE(SUM(a.approved_amount), 0) FROM applications a
           WHERE a.funding_round_id = i.funding_round_id
             AND a.status = 'Approved' AND a.approval_excluded_at IS NULL
             AND a.approved_amount IS NOT NULL AND a.approved_amount > 0) AS confirmed_now
    FROM invoices i
    LEFT JOIN clients cl ON cl.id = i.client_id
    LEFT JOIN funding_rounds fr ON fr.id = i.funding_round_id
    LEFT JOIN sales s ON s.id = i.sale_id
   WHERE i.source = 'funding_success_fee' OR i.invoice_type = 'success_fee'
   ORDER BY i.created_at`);
for (const r of rows) {
  if (r.err) { console.log(r); continue; }
  const ruleFee = r.pct != null && Number(r.confirmed_now) > 0
    ? (Math.round(Number(r.confirmed_now) * 100) * Number(r.pct) / 100 / 100).toFixed(2) : null;
  console.log(JSON.stringify({
    invoice: r.id.slice(0, 8), client: `${r.first_name} ${r.last_name}`, demo: r.is_demo,
    status: r.status, billed: r.amount_due, notes: r.notes, round: r.round_number,
    roundStatus: r.round_status, funded: r.funded_amount, pct: r.pct,
    confirmedNow: r.confirmed_now, ruleFeeNow: ruleFee,
    matches: ruleFee != null && Number(ruleFee) === Number(r.amount_due)
  }));
}
const tables = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%alloc%' OR table_name ILIKE '%payment%' OR table_name ILIKE '%transaction%') ORDER BY 1`);
console.log(JSON.stringify(tables.map(t => t.table_name)));
await c.query("ROLLBACK");
await c.end();
