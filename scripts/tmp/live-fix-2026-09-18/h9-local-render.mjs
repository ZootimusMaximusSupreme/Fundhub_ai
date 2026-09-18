// Hole 9 — render THIS worktree's client-portal.html in headless Chromium as
// an owner, with the two reads answered from fixtures, in both landing orders.
// No network: every request is served from public/ or a fixture. Look only.
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PUB = path.join(ROOT, "public");
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-9";
mkdirSync(SHOTS, { recursive: true });
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";

const tx = [{ id: "t1", product_name: "Card Stacking DFY", amount_paid: "3000.00", status: "succeeded", created_at: "2026-09-17T17:46:48Z" }];
const due = { count: 1, currency: "USD", total: 2500, total_display: "$2,500.00", items: [{ reference: "INV-B4B9C768", kind: "Funding success fee", amount: 2500, amount_display: "$2,500.00", currency: "USD", status: "sent", due_at: null, sent_at: "2026-09-17T18:58:34Z", pay_url: "https://example.invalid/pay" }] };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png" };

async function run(order) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("fh_role", "owner"); } catch (e) {} });
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  await ctx.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "fundhub.test") return route.abort();
    if (u.pathname === "/api/dashboard/client") {
      await delay(order === "dash-last" ? 1500 : 100);
      return route.fulfill({ json: { ok: true, client: { id: EIGHT, first_name: "Sim", last_name: "Eight-Funding" }, transactions: tx, messages: [], tasks: [] } });
    }
    if (u.pathname === "/api/read/portal-summary") {
      await delay(order === "dash-last" ? 100 : 1500);
      return route.fulfill({ json: { ok: true, invoice_due: due, payments: tx, documents: [], scores: {} } });
    }
    if (u.pathname === "/api/auth/session") {
      return route.fulfill({ json: { ok: true, principal: "staff", staff: { id: "s1", email: "owner@fundhub.test", name: "Owner", role: "owner", status: "active" } } });
    }
    if (u.pathname.startsWith("/api/")) return route.fulfill({ status: 200, json: { ok: true, items: [] } });
    const file = path.join(PUB, u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname);
    if (!file.startsWith(PUB) || !existsSync(file)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || "application/octet-stream", body: readFileSync(file) });
  });
  const page = await ctx.newPage();
  await page.goto(`https://fundhub.test/app/client-portal.html?id=${EIGHT}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.click("#acct > summary");
  await page.click('#acct-tabs [data-tab="pay"]');
  const rows = await page.$$eval("#tp-pay .pay-row", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
  await page.locator("#acct").scrollIntoViewIfNeeded();
  await page.locator("#acct").screenshot({ path: `${SHOTS}/local-${order}.png` });
  await browser.close();
  return { order, rows };
}

console.log(JSON.stringify([await run("dash-first"), await run("dash-last")], null, 2));
