// N7 — look only. The order things happened on #8 round 2: every bank
// decision, the round.funded event, the invoice, and every payment against the
// invoice. BEGIN READ ONLY; no SET. Names only, no contact fields.
import pg from "pg";
const EIGHT = process.argv[2] || "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
const q = (s, p) => c.query(s, p).then(r => r.rows).catch(e => [{ err: e.message }]);
const out = {};
out.decisions = await q(`SELECT ad.decided_at, ad.event_type, ad.status, ad.created_by, ad.notes, a.lender_name, a.funding_round_id
  FROM application_decisions ad JOIN applications a ON a.id=ad.application_id
  WHERE a.client_id=$1 ORDER BY ad.decided_at`, [EIGHT]);
out.stageMoves = await q(`SELECT name, created_at, payload->>'roundNumber' AS rn, payload->>'approvedAmount' AS approved, payload->>'fundedAmount' AS funded FROM events WHERE client_id=$1 AND name LIKE 'round.%' ORDER BY created_at`, [EIGHT]);
out.paymentsOnInvoice = await q(`SELECT p.* FROM payments p WHERE p.invoice_id='b4b9c768-5488-4202-9d2a-323a28b8aec6'`);
out.allocations = await q(`SELECT * FROM invoice_allocations WHERE invoice_id='b4b9c768-5488-4202-9d2a-323a28b8aec6'`);
out.txns = await q(`SELECT id, type, status, amount_cents, product_code, source, created_at FROM transactions WHERE client_id=$1 ORDER BY created_at`, [EIGHT]);
out.tasks = await q(`SELECT title, source_workflow, status, created_at FROM tasks WHERE client_id=$1 AND source_workflow LIKE 'f-07%' ORDER BY created_at`, [EIGHT]);
out.msgs = await q(`SELECT template_key, channel, status, created_at FROM messages WHERE client_id=$1 AND (template_key LIKE '%F07%' OR template_key LIKE '%AR-%' OR template_key LIKE '%INVOICE%') ORDER BY created_at`, [EIGHT]);
console.log(JSON.stringify(out, (k, v) => (/token|secret|password|ssn|dob|email|phone|street|zip|address|body/i.test(k) ? "[x]" : v), 2));
await c.query("ROLLBACK");
await c.end();
