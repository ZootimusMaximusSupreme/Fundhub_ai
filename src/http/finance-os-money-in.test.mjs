/* Finance OS "Money in" — what counts as paid so far. (N1, live 2026-09-18.)
 *
 * Sim Eight-Funding's Finance OS read "Paid so far $8,500 across 3 payments"
 * and Sim Nine-Repair's "$2,000 across 2". The total added every payment row
 * whatever its status, so a refunded or failed payment read as money paid, and
 * the page disagreed with the portal's Payments tab
 * (api/read/portal-summary.mjs readPayments), which counts 'succeeded' only.
 *
 * WHY IT LIVES HERE. package.json's test glob is src/** and scripts/**, so a
 * test beside the page would never run (CLAUDE.md §12). The panel is executed
 * for real: its helpers and moneyInPanel are sliced out of the page and run in
 * a sandbox, and the assertions read the HTML a person would see.
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = fs.readFileSync(path.resolve(HERE, "../../public/app/finance-os.html"), "utf8");

function slice(startMarker, endMarker) {
  const a = PAGE.indexOf(startMarker);
  assert.ok(a !== -1, `${startMarker} is gone from finance-os.html`);
  const b = PAGE.indexOf(endMarker, a);
  assert.ok(b > a, `${endMarker} no longer follows ${startMarker}`);
  return PAGE.slice(a, b);
}

function moneyIn(res) {
  const helpers = slice("  function esc(s) {", "  /* ── the read ──");
  const panelFn = slice("  function moneyInPanel(res) {", "  /* ═══ 5. INVOICED");
  const ctx = { res, out: null, Date, Number, String, Math, isFinite };
  vm.runInNewContext(`${helpers}\n${panelFn}\nout = moneyInPanel(res);`, ctx);
  return ctx.out;
}

const tx = (product_name, amount_paid, status, created_at = "2026-09-18T15:13:33Z") =>
  ({ product_name, amount_paid, status, created_at });

describe("Finance OS 'Paid so far' counts money that was kept (N1)", () => {
  test("a refunded payment is listed but not added to Paid so far", () => {
    const html = moneyIn({ ok: true, data: { transactions: [
      tx("Card Stacking DFY", "3000.00", "refunded"),
      tx("Success fee INV-B4B9C768", "2500.00", "succeeded"),
      tx("Card Stacking DFY", "3000.00", "succeeded", "2026-09-17T17:46:48Z")
    ] } });
    assert.match(html, /\$5,500\.00/, "Paid so far must be the $3,000 deposit plus the $2,500 fee");
    assert.doesNotMatch(html, /\$8,500\.00/, "the refunded $3,000 was added to Paid so far again");
    assert.match(html, /across 2 payments/);
    assert.match(html, /1 more listed but not counted/);
    assert.match(html, />refunded</, "the refunded row must still be shown, with its status");
  });

  test("a failed card is not money paid", () => {
    const html = moneyIn({ ok: true, data: { transactions: [
      tx("Credit Repair Bundle", "1000.00", "failed"),
      tx("Credit Repair Bundle", "1000.00", "succeeded")
    ] } });
    assert.match(html, /\$1,000\.00<\/span><\/div>/);
    assert.doesNotMatch(html, /\$2,000\.00/);
    assert.match(html, /across 1 payment;/);
  });

  test("rows that are all unpaid total a real $0, not an unknown", () => {
    const html = moneyIn({ ok: true, data: { transactions: [tx("Card Stacking DFY", "3000.00", "failed")] } });
    assert.match(html, /fh-num">\$0\.00/);
    assert.doesNotMatch(html, /is-unknown/);
  });

  test("with every payment paid, nothing changes", () => {
    const html = moneyIn({ ok: true, data: { transactions: [
      tx("Card Stacking DFY", "3000.00", "succeeded"),
      tx("Success fee INV-B4B9C768", "2500.00", "succeeded")
    ] } });
    assert.match(html, /\$5,500\.00/);
    assert.match(html, /across 2 payments</);
    assert.doesNotMatch(html, /not counted/);
  });

  test("no payments at all still says nothing has been recorded", () => {
    const html = moneyIn({ ok: true, data: { transactions: [] } });
    assert.match(html, /No payment has been recorded against this client yet\./);
  });
});
