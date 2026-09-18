// Hole 9 — staff portal Payments tab hides the $2,500 invoice. LOOK ONLY.
// Signs in as the owner through the real login page, opens #8's portal as
// staff, opens Account & history → Payments twice, and reads the APIs the
// screen and the Ops/Finance views use. Blocks every non-GET request except
// the one sign-in POST. Never prints a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h9-verify.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const TAG = process.argv[2] || "verify";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-9";
mkdirSync(SHOTS, { recursive: true });

const out = { at: new Date().toISOString(), tag: TAG, no_send: true, api: {}, loads: [], blocked: [] };

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const path = new URL(req.url()).pathname;
  if (m === "POST" && path === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${path}`);
  return route.abort();
});

// ── Sign in like a person: the real login page, the real form.
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", password);
const loginResp = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
const lr = await loginResp;
out.login = { status: lr.status() };
await page.waitForTimeout(2500);
out.role = await page.evaluate(() => localStorage.getItem("fh_role"));
if (lr.status() !== 200) {
  writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

// ── The APIs: what the screen reads, and what Ops / Finance read.
async function apiGet(path) {
  const r = await ctx.request.get(`${BASE}${path}`);
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  return { status: r.status(), json: j };
}
{
  const d = await apiGet(`/api/dashboard/client?id=${EIGHT}`);
  out.api.dashboard_client = {
    status: d.status,
    keys: d.json?.data ? Object.keys(d.json.data) : (d.json ? Object.keys(d.json) : null),
    transactions: (d.json?.data?.transactions || d.json?.transactions || []).map((t) => ({
      product_name: t.product_name, amount_paid: t.amount_paid, status: t.status,
    })),
    invoice_due: d.json?.data?.invoice_due,
  };
  const p = await apiGet(`/api/read/portal-summary?client_id=${EIGHT}`);
  const pd = p.json?.data || p.json || {};
  out.api.portal_summary = {
    status: p.status,
    payments: Array.isArray(pd.payments)
      ? pd.payments.map((t) => ({ product_name: t.product_name, amount_paid: t.amount_paid, status: t.status }))
      : pd.payments,
    invoice_due: pd.invoice_due
      ? { ...pd.invoice_due, items: (pd.invoice_due.items || []).map((it) => ({ ...it, pay_url: it.pay_url ? "(present)" : null })) }
      : pd.invoice_due,
  };
  const inv = await apiGet(`/api/read/invoices?client_id=${EIGHT}`);
  const items = inv.json?.data?.items || inv.json?.items || inv.json?.data || [];
  out.api.invoices = {
    status: inv.status,
    items: Array.isArray(items)
      ? items.map((i) => ({
        number: i.number || i.invoice_number, status: i.status,
        amount_due: i.amount_due ?? i.amount_due_cents ?? i.total_cents ?? i.amount_cents,
        amount_paid: i.amount_paid ?? i.amount_paid_cents, source: i.source || i.kind,
      }))
      : items,
  };
  const f = await apiGet(`/api/read/finance-os?client_id=${EIGHT}`);
  const fj = JSON.stringify(f.json || {});
  out.api.finance_os = { status: f.status, mentions2500: /2,?500/.test(fj), mentions3000: /3,?000/.test(fj), mentionsInv: fj.includes("INV-B4B9C768"), sample: fj.slice(0, 1500) };
}

// ── The screen, twice.
for (const n of [1, 2]) {
  const pg = n === 1 ? page : await ctx.newPage();
  await pg.goto(`${BASE}/app/client-portal.html?id=${EIGHT}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(9000);
  await pg.click("#acct > summary");
  await pg.click('#acct-tabs [data-tab="pay"]');
  await pg.waitForTimeout(800);
  const pane = await pg.evaluate(() => {
    const el = document.getElementById("tp-pay");
    if (!el) return null;
    return {
      text: el.innerText.replace(/\n+/g, " | ").trim(),
      rows: Array.from(el.querySelectorAll(".pay-row")).map((r) => r.innerText.replace(/\s+/g, " ").trim()),
      payNow: Array.from(el.querySelectorAll("a")).map((a) => a.textContent.trim()),
    };
  });
  const shot = `${SHOTS}/${TAG}-load${n}.png`;
  await pg.locator("#acct").scrollIntoViewIfNeeded();
  await pg.locator("#acct").screenshot({ path: shot });
  out.loads.push({ n, pane, shot });
}

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
