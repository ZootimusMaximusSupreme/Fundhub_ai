/* Hole 9, live 2026-09-18 — the staff view of a client's portal hid the bill.
 *
 * File #8 owed $2,500 (invoice INV-B4B9C768, sent, $0 paid). Ops AR and
 * /api/read/portal-summary both had it. The staff Payments tab on
 * /app/client-portal.html?id=… showed only "Card Stacking DFY 3000.00
 * succeeded": staff painted the pane from /api/dashboard/client, which carries
 * no bill, and the portal-summary bill was painted for clients only.
 *
 * The fix paints the staff pane from both reads. Either can land first, so the
 * tests below run the real painter in both orders and read the pane a person
 * would see. The functions are sliced out of the shipped page and executed
 * against one fake node — the same approach as
 * src/http/client-panel-portal-link.test.mjs. The dollar figures live here, not
 * in the page: crm-html.test.mjs forbids list prices inside the HTML.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTAL = path.resolve(HERE, "../../public/app/client-portal.html");
const html = fs.readFileSync(PORTAL, "utf8");

/* One function, from `function <name>(` to its matching brace. */
function sliceFn(name) {
  const a = html.indexOf("function " + name + "(");
  assert.ok(a !== -1, `${name} is gone from client-portal.html`);
  let depth = 0;
  for (let i = html.indexOf("{", a); i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) return html.slice(a, i + 1);
  }
  throw new Error(`${name} never closes`);
}

function staffPayBlock() {
  const a = html.indexOf("var staffPay =");
  assert.ok(a !== -1, "the staff Payments pane has no shared state — hole 9 is back");
  const fn = sliceFn("paintStaffPays");
  return html.slice(a, html.indexOf(fn) + fn.length);
}

function makePane() {
  const pane = { innerHTML: "(untouched)" };
  const sandbox = {
    document: { getElementById: (id) => (id === "tp-pay" ? pane : null) },
    window: { location: { origin: "https://fundhub.ai" } },
    URL,
    Date
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [sliceFn("esc"), sliceFn("fmtWhen"), sliceFn("payHref"), sliceFn("paintPays"), staffPayBlock()].join("\n"),
    sandbox
  );
  return { pane, paint: (part, value) => sandbox.paintStaffPays(part, value) };
}

const ROWS = [{ product_name: "Card Stacking DFY", amount_paid: "3000.00", status: "succeeded", created_at: "2026-09-17T17:46:48Z" }];
const DUE = {
  count: 1,
  currency: "USD",
  total: 2500,
  total_display: "$2,500.00",
  items: [{
    reference: "INV-B4B9C768",
    kind: "Funding success fee",
    amount: 2500,
    amount_display: "$2,500.00",
    status: "sent",
    pay_url: "https://checkout.example/pay/abc"
  }]
};

describe("client portal — staff Payments tab shows the bill (hole 9)", () => {
  test("both staff reads feed the pane", () => {
    assert.match(html, /paintStaffPays\("rows",\s*res\.data\.transactions\)/,
      "the staff paid list must go through paintStaffPays");
    assert.doesNotMatch(html, /paintPays\(res\.data\.transactions\)/,
      "painting the staff pane from transactions alone is what hid the bill");
    assert.match(html, /paintStaffPays\("due",\s*data\.invoice_due\)/,
      "the staff view must take the bill from portal-summary");
  });

  test("paid list first, bill second — the $2,500 shows with the payment", () => {
    const { pane, paint } = makePane();
    paint("rows", ROWS);
    assert.ok(!pane.innerHTML.includes("Due now"));
    paint("due", DUE);
    assert.ok(pane.innerHTML.includes("Due now"), "the bill must show");
    assert.ok(pane.innerHTML.includes("$2,500.00"));
    assert.ok(pane.innerHTML.includes("INV-B4B9C768"));
    assert.ok(pane.innerHTML.includes("Card Stacking DFY"), "the payment must stay");
  });

  test("bill first, paid list second — same screen", () => {
    const a = makePane();
    a.paint("rows", ROWS);
    a.paint("due", DUE);
    const b = makePane();
    b.paint("due", DUE);
    assert.ok(b.pane.innerHTML.includes("$2,500.00"), "an owed bill paints as soon as it lands");
    b.paint("rows", ROWS);
    assert.equal(b.pane.innerHTML, a.pane.innerHTML);
  });

  test("nothing owed does not print a false 'No payments yet' before the paid list lands", () => {
    const { pane, paint } = makePane();
    paint("due", { count: 0, currency: "USD", total: 0, total_display: "$0.00", items: [] });
    assert.equal(pane.innerHTML, "(untouched)");
    paint("rows", ROWS);
    assert.ok(pane.innerHTML.includes("Card Stacking DFY"));
    assert.ok(!pane.innerHTML.includes("No payments yet"));
  });

  test("a failed bill read says so once the paid list is in", () => {
    const { pane, paint } = makePane();
    paint("due", null);
    assert.equal(pane.innerHTML, "(untouched)");
    paint("rows", ROWS);
    assert.ok(pane.innerHTML.includes("We could not check what you owe"));
    assert.ok(pane.innerHTML.includes("Card Stacking DFY"));
  });
});
