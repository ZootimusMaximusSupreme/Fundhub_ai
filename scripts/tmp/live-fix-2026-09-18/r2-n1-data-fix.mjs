// N1 — correct Sim Eight-Funding (#8) and Sim Nine-Repair (#9) money rows.
// Owner permission (board, "Fix run 2"): change rows on Sim/test files to correct
// wrong data, record before/after, never delete.
//
// What it changes, and only when each row is still exactly as measured:
//   #8 $2,500 sale payment 1d0b49b0 — kind 'installment' → 'success_fee'. The
//      receipt pays success-fee invoice INV-B4B9C768; this is the row the fixed
//      money chain writes (src/handlers/money-chain.mjs successFeeInvoiceFor).
//   #8 second $3,000 receipt sim-pay-1789668284193 and #9 second $1,000 receipt
//      sim-pay-1789668293242 — separate receipts, not one receipt applied twice:
//      the 2026-09-17 walkthrough (steps L1.11 / L1.12 push-pay) paid a SECOND,
//      freshly minted pay link on each client after they had already paid.
//      Simulated, no card charged. Each is voided the way the ledger voids money
//      that was not kept: the receipt row is marked 'refunded' and a matching
//      'refund' row is added to the sale ledger. Nothing is deleted; the original
//      rows stay.
//
// Run:   node --env-file=<repo>/.env r2-n1-data-fix.mjs          (dry run: shows before, rolls back)
//        node --env-file=<repo>/.env r2-n1-data-fix.mjs --apply  (writes, one transaction)
// Never a bare SET on the pooler; one BEGIN … COMMIT/ROLLBACK.
import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N1";
mkdirSync(OUT, { recursive: true });

const C8 = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const C9 = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const SALE8 = "d7f8d653-c419-4df0-b12c-ce67258092c1";
const SALE9 = "37209774-b6bb-4db3-918e-104775fda7c8";
const FEE_SP = "1d0b49b0-644f-49a9-83be-ce30cc8f395e";
const DUP8 = { tx: "2f448720-cf69-4138-bb41-375bb431c179", sp: "01c4d646-3830-419f-9555-52d69be3b4d2", ref: "sim-pay-1789668284193", link: "0e843523-4afa-41df-8acb-aaac8085d96d", sale: SALE8, client: C8, amount: "3000.00", step: "L1.11" };
const DUP9 = { tx: "ecc55b44-79c0-4c18-9342-dd6504f42401", sp: "d5fb98a0-3f10-4a0b-aeb0-11f5b551219c", ref: "sim-pay-1789668293242", link: "9631af76-948e-4944-a0fa-0b10dec6d97b", sale: SALE9, client: C9, amount: "1000.00", step: "L1.12" };
const MARK = "N1 2026-09-18 correction";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

async function snapshot(label) {
  const rows = {};
  rows.sale_payments = (await c.query(
    `SELECT sp.id, sp.sale_id, sp.kind, sp.amount, sp.paid_at, sp.payment_link_id, sp.transaction_id, sp.notes
       FROM sale_payments sp WHERE sp.sale_id = ANY($1) ORDER BY sp.created_at`, [[SALE8, SALE9]])).rows;
  rows.transactions = (await c.query(
    `SELECT id, client_id, product_name, amount_paid, status, provider_ref, created_at, updated_at
       FROM transactions WHERE client_id = ANY($1) ORDER BY created_at`, [[C8, C9]])).rows;
  rows.invoices = (await c.query(
    `SELECT v.invoice_id, v.client_id, v.status, v.amount_due, v.amount_paid, v.balance_due
       FROM v_invoice_balance v WHERE v.client_id = ANY($1)`, [[C8, C9]])).rows;
  rows.sale_balance = (await c.query(
    `SELECT sale_id, agreed_price, deposits_collected, refunded, amount_received,
            (SELECT COALESCE(SUM(CASE WHEN kind='refund' THEN -amount WHEN kind IN ('deposit','installment') THEN amount ELSE 0 END),0)
               FROM sale_payments WHERE sale_id = b.sale_id) AS paid_against_price,
            (SELECT COALESCE(SUM(amount),0) FROM sale_payments WHERE sale_id = b.sale_id AND kind = 'success_fee') AS success_fee_paid
       FROM v_sale_balance b WHERE sale_id = ANY($1)`, [[SALE8, SALE9]])).rows;
  writeFileSync(`${OUT}/data-${label}.json`, JSON.stringify(rows, null, 2));
  console.log(`\n## ${label}`);
  for (const [k, v] of Object.entries(rows)) {
    console.log(`-- ${k}`);
    for (const r of v) console.log(JSON.stringify(r));
  }
}

await c.query("BEGIN");
try {
  await snapshot(APPLY ? "before" : "dry-before");

  const fee = await c.query(
    `UPDATE sale_payments
        SET kind = 'success_fee',
            notes = COALESCE(notes, '') || ' | ${MARK}: was installment; this receipt pays success-fee invoice INV-B4B9C768'
      WHERE id = $1 AND sale_id = $2 AND kind = 'installment' AND amount = 2500.00
      RETURNING id, kind`, [FEE_SP, SALE8]);
  console.log(`\n#8 fee row re-kinded: ${fee.rowCount}`);

  for (const d of [DUP8, DUP9]) {
    const tx = await c.query(
      `UPDATE transactions SET status = 'refunded'
        WHERE id = $1 AND client_id = $2 AND provider_ref = $3 AND status = 'succeeded' AND amount_paid = $4
        RETURNING id, status`, [d.tx, d.client, d.ref, d.amount]);
    const orig = await c.query(
      `SELECT org_id, product_id FROM sale_payments
        WHERE id = $1 AND sale_id = $2 AND transaction_id = $3 AND amount = $4`, [d.sp, d.sale, d.tx, d.amount]);
    let refund = { rowCount: 0 };
    if (orig.rows[0]) {
      refund = await c.query(
        `INSERT INTO sale_payments (org_id, sale_id, transaction_id, product_id, payment_link_id, kind, amount, paid_at, notes)
         SELECT $1, $2, NULL, $3, $4, 'refund', $5, now(), $6
          WHERE NOT EXISTS (SELECT 1 FROM sale_payments WHERE sale_id = $2 AND kind = 'refund' AND notes LIKE $7)
         RETURNING id`,
        [orig.rows[0].org_id, d.sale, orig.rows[0].product_id, d.link, d.amount,
         `${MARK}: voids duplicate receipt ${d.ref} (sale payment ${d.sp}). The 2026-09-17 walkthrough step ${d.step} paid a second, newly sent pay link after this client had already paid. Simulated receipt, no card was charged.`,
         `${MARK}: voids duplicate receipt ${d.ref}%`]);
    }
    console.log(`${d.ref}: receipt marked refunded ${tx.rowCount}, ledger refund row added ${refund.rowCount}`);
  }

  await snapshot(APPLY ? "after" : "dry-after");
  if (APPLY) {
    await c.query("COMMIT");
    console.log("\nCOMMITTED");
  } else {
    await c.query("ROLLBACK");
    console.log("\nDRY RUN — rolled back, nothing written");
  }
} catch (e) {
  await c.query("ROLLBACK");
  console.error("ROLLED BACK:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
