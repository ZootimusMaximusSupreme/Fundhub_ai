// N1 — late receipts double-count. LOOK ONLY.
// Signs in as the owner through the real login page, then for #8 and #9:
//   - Finance OS (finance-os.html?client_id=) "Money in" + "Invoiced" panels
//   - the staff portal Payments list (portal-summary payments)
//   - Ops Admin AR panel (/api/read/invoices?status=open)
// twice each. Blocks every non-GET request except the sign-in POST. Never prints
// a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n1-verify.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const CLIENTS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd"
};
const TAG = process.argv.slice(2).find((a) => !a.startsWith("--")) || "verify";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N1";
mkdirSync(SHOTS, { recursive: true });

const out = { at: new Date().toISOString(), tag: TAG, blocked: [], clients: {} };
const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
// --local: serve THIS branch's finance-os.html in place of the live copy (APIs,
// scripts and css stay live) — proves the page change before ship.
const LOCAL = process.argv.includes("--local");
const LOCAL_HTML = new URL("../../../public/app/finance-os.html", import.meta.url);
out.local_finance_os = LOCAL;
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  if (LOCAL && m === "GET" && new URL(req.url()).pathname === "/app/finance-os.html") {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: readFileSync(LOCAL_HTML, "utf8") });
  }
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const path = new URL(req.url()).pathname;
  if (m === "POST" && path === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${path}`);
  return route.abort();
});

const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", password);
const loginResp = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
const lr = await loginResp;
out.login = { status: lr.status() };
await page.waitForTimeout(2500);
if (lr.status() !== 200) {
  writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

async function apiGet(path) {
  const r = await ctx.request.get(`${BASE}${path}`);
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  return { status: r.status(), json: j };
}

for (const [name, id] of Object.entries(CLIENTS)) {
  const c = { loads: [] };
  for (const n of [1, 2]) {
    const load = { n, at: new Date().toISOString() };
    await page.goto(`${BASE}/app/finance-os.html?client_id=${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    load.finance_os = await page.evaluate(() => {
      const panels = [...document.querySelectorAll("section, .panel, .fh-panel, .fos-panel")];
      const pick = (title) => {
        const el = panels.find((p) => (p.innerText || "").trim().toLowerCase().startsWith(title.toLowerCase()));
        return el ? el.innerText.replace(/\s+\n/g, "\n").trim().slice(0, 1200) : null;
      };
      return { money_in: pick("Money in"), invoiced: pick("Invoiced") };
    });
    await page.screenshot({ path: `${SHOTS}/${TAG}-${name}-finance-os-${n}.png`, fullPage: true });
    const p = await apiGet(`/api/read/portal-summary?client_id=${id}`);
    const pd = p.json?.data || p.json || {};
    load.portal_payments = Array.isArray(pd.payments)
      ? pd.payments.map((t) => ({ product_name: t.product_name, amount_paid: t.amount_paid, status: t.status, paid_at: t.paid_at || t.created_at }))
      : pd.payments;
    load.portal_invoice_due = pd.invoice_due ? { count: pd.invoice_due.count, total_display: pd.invoice_due.total_display } : pd.invoice_due;
    const d = await apiGet(`/api/dashboard/client?id=${id}`);
    const txs = d.json?.data?.transactions || d.json?.transactions || [];
    load.dashboard_client_transactions = txs.map((t) => ({ product_name: t.product_name, amount_paid: t.amount_paid, status: t.status }));
    const inv = await apiGet(`/api/read/invoices?client_id=${id}`);
    load.invoices = (inv.json?.items || inv.json?.data || []).map?.((v) => ({
      status: v.status, amount_due: v.amount_due, amount_paid: v.amount_paid, balance_due: v.balance_due, payment_count: v.payment_count
    })) ?? inv.json;
    c.loads.push(load);
  }
  out.clients[name] = c;
}
{
  const ar = await apiGet(`/api/read/invoices?status=open&limit=50`);
  const rows = ar.json?.items || ar.json?.data || [];
  out.ops_ar_open = {
    status: ar.status,
    count: Array.isArray(rows) ? rows.length : null,
    for_eight_or_nine: Array.isArray(rows)
      ? rows.filter((r) => Object.values(CLIENTS).includes(r.client_id)).map((r) => ({ client_id: r.client_id, status: r.status, open_balance: r.open_balance }))
      : null
  };
}
writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
