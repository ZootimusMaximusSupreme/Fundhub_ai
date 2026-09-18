// N7 — look only. #8's rounds, bank approvals, success-fee invoice, closeout,
// round.funded events and the payment on the invoice. BEGIN READ ONLY; no SET.
import pg from "pg";
const EIGHT = process.argv[2] || "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
const q = (s, p) => c.query(s, p).then(r => r.rows).catch(e => [{ err: e.message }]);
const out = {};
out.client = await q(`SELECT id, org_id, first_name, last_name, funded, funded_amount FROM clients WHERE id=$1`, [EIGHT]);
out.rounds = await q(`SELECT id, round_number, status, funded_amount, approved_amount, created_at, updated_at FROM funding_rounds WHERE client_id=$1 ORDER BY round_number`, [EIGHT]);
out.apps = await q(`SELECT a.id, fr.round_number, a.funding_round_id, a.status, a.approved_amount, a.lender_name, a.bank, a.approval_excluded_at, a.created_at, a.updated_at FROM applications a LEFT JOIN funding_rounds fr ON fr.id=a.funding_round_id WHERE a.client_id=$1 ORDER BY a.created_at`, [EIGHT]);
out.roundSales = await q(`SELECT frs.funding_round_id, frs.sale_id, s.agreed_success_fee_percent FROM funding_round_sales frs JOIN sales s ON s.id=frs.sale_id JOIN funding_rounds fr ON fr.id=frs.funding_round_id WHERE fr.client_id=$1`, [EIGHT]);
out.invoices = await q(`SELECT * FROM invoices WHERE client_id=$1 ORDER BY created_at`, [EIGHT]);
out.closeout = await q(`SELECT fc.*, fr.round_number FROM funding_closeout fc JOIN funding_rounds fr ON fr.id=fc.funding_round_id WHERE fr.client_id=$1`, [EIGHT]);
out.closeoutItems = await q(`SELECT fci.* FROM funding_closeout_items fci JOIN funding_closeout fc ON fc.id=fci.funding_closeout_id JOIN funding_rounds fr ON fr.id=fc.funding_round_id WHERE fr.client_id=$1`, [EIGHT]);
out.events = await q(`SELECT id, name, payload, idempotency_key, created_at FROM events WHERE client_id=$1 AND name IN ('round.funded','round.approved','invoice.created','invoice.sent','invoice.paid') ORDER BY created_at`, [EIGHT]);
console.log(JSON.stringify(out, (k, v) => (/token|secret|password|ssn|dob|email|phone|street|zip|address/i.test(k) ? "[x]" : v), 2));
await c.query("ROLLBACK");
await c.end();
