// Reviewer hole 11 — read only. One BEGIN READ ONLY transaction, plain SELECTs, COMMIT.
// What does #12 own now, what did it pay for, and did anything change since ~15:13 UTC?
import { pool, close } from "../../../src/db.mjs";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const c = await pool().connect();
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
try {
  await c.query("BEGIN READ ONLY");
  const out = { at: new Date().toISOString() };
  out.client = await q(`SELECT id, client_code, first_name, last_name, is_demo, updated_at FROM clients WHERE id = $1`, [TWELVE]);
  out.entitlements = await q(`SELECT entitlement_code, grant_reason, granted_by, source_transaction_id IS NOT NULL has_txn, granted_at, expires_at, revoked_at, is_demo FROM entitlements WHERE client_id = $1 ORDER BY granted_at`, [TWELVE]);
  out.v_client_entitlements = await q(`SELECT entitlement_code, entitlement_name, kind, active, granted_at FROM v_client_entitlements WHERE client_id = $1 ORDER BY granted_at`, [TWELVE]);
  out.sales = await q(`SELECT s.id, p.code product_code, p.name product_name, s.agreed_price, s.status, s.sold_at, s.created_at, s.is_demo, s.sale_motion FROM sales s LEFT JOIN products p ON p.id = s.product_id WHERE s.client_id = $1 ORDER BY s.created_at`, [TWELVE]);
  out.sale_payments = await q(`SELECT sp.kind, sp.amount, sp.paid_at, sp.created_at, p.code product_code, sp.is_demo FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id LEFT JOIN products p ON p.id = sp.product_id WHERE s.client_id = $1 ORDER BY sp.created_at`, [TWELVE]);
  out.payment_links = await q(`SELECT pl.purpose, pl.description, pl.amount_cents, pl.status, pl.provider, pl.paid_amount_cents, pl.created_at, pl.sent_at, pl.paid_at, pl.updated_at, p.code product_code, pl.is_demo FROM payment_links pl LEFT JOIN products p ON p.id = pl.product_id WHERE pl.client_id = $1 ORDER BY pl.created_at`, [TWELVE]);
  out.invoices = await q(`SELECT invoice_type, status, amount_due, source, created_at, paid_at, updated_at FROM invoices WHERE client_id = $1 ORDER BY created_at`, [TWELVE]);
  out.enrollments = await q(`SELECT program, status, created_at, updated_at FROM education_enrollments WHERE client_id = $1 ORDER BY created_at`, [TWELVE]);
  out.product_grants = await q(`SELECT product_code, entitlement_code, duration_days FROM product_entitlements ORDER BY product_code`);
  out.catalog = await q(`SELECT code, name, kind, active FROM entitlement_catalog ORDER BY sort_order NULLS LAST, code`);
  out.documents = await q(`SELECT kind, subtype, title, created_at FROM documents WHERE client_id = $1 ORDER BY created_at`, [TWELVE]);
  out.messages_since_1500 = await q(`SELECT channel, direction, status, template_key, subject, created_at FROM messages WHERE client_id = $1 AND created_at > '2026-09-18 14:30:00+00' ORDER BY created_at`, [TWELVE]);
  out.anything_changed_since_1500 = {
    entitlements: await q(`SELECT count(*)::int n FROM entitlements WHERE client_id = $1 AND (created_at > '2026-09-18 14:30:00+00' OR updated_at > '2026-09-18 14:30:00+00')`, [TWELVE]),
    sales: await q(`SELECT count(*)::int n FROM sales WHERE client_id = $1 AND (created_at > '2026-09-18 14:30:00+00' OR updated_at > '2026-09-18 14:30:00+00')`, [TWELVE]),
    payment_links: await q(`SELECT count(*)::int n FROM payment_links WHERE client_id = $1 AND updated_at > '2026-09-18 14:30:00+00'`, [TWELVE]),
  };
  out.eleven_entitlements = await q(`SELECT entitlement_code, entitlement_name, active FROM v_client_entitlements WHERE client_id = $1`, [ELEVEN]);
  await c.query("COMMIT");
  console.log(JSON.stringify(out, null, 2));
} catch (e) { try { await c.query("ROLLBACK"); } catch {} console.error("read failed:", e.message); process.exitCode = 1; }
finally { c.release(); await close(); }
