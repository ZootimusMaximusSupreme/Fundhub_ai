// N7 — look only. The sim payment on #8's invoice INV-B4B9C768, and the
// open fee tasks. BEGIN READ ONLY; no SET. No contact fields printed.
import pg from "pg";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const INV = "b4b9c768-5488-4202-9d2a-323a28b8aec6";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
const q = async (s, p) => { await c.query("SAVEPOINT s"); try { const r = await c.query(s, p); await c.query("RELEASE SAVEPOINT s"); return r.rows; } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ err: e.message }]; } };
const out = {};
out.invoicePayments = await q(`SELECT * FROM invoice_payments WHERE invoice_id=$1`, [INV]);
out.txns = await q(`SELECT id, type, status, amount_cents, product_code, source, invoice_id, created_at FROM transactions WHERE client_id=$1 ORDER BY created_at`, [EIGHT]);
out.txnCols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='transactions' ORDER BY ordinal_position`)).map(r => r.column_name || r.err);
out.tasks = await q(`SELECT title, source_workflow, status, created_at FROM tasks WHERE client_id=$1 AND (source_workflow LIKE 'f-07%' OR title ILIKE '%fee%' OR title ILIKE '%invoice%') ORDER BY created_at`, [EIGHT]);
out.msgs = await q(`SELECT template_key, channel, status, created_at FROM messages WHERE client_id=$1 AND (template_key ILIKE '%F07%' OR template_key ILIKE '%AR-%' OR template_key ILIKE '%INVOICE%') ORDER BY created_at`, [EIGHT]);
out.invCols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='invoices' ORDER BY ordinal_position`)).map(r => r.column_name || r.err);
console.log(JSON.stringify(out, (k, v) => (/token|secret|password|ssn|dob|email|phone|street|zip|address|body|raw/i.test(k) ? "[x]" : v), 2));
await c.query("ROLLBACK");
await c.end();
