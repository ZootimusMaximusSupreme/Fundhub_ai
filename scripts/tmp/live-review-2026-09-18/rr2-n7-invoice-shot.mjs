// N7 reviewer — LOOK ONLY. Sign in, open Finance OS for #8, box the Invoiced panel (the $2,500 bill)
// and open Client Control Panel's confirmed approvals. Blocks every non-GET except the sign-in POST.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const CID = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N7/review";
const LABEL = process.argv[2] || "look";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD not set"); process.exit(1); }
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const blocked = [];
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method(); const u = new URL(r.url());
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && u.hostname === "fundhub.ai" && u.pathname === "/api/auth/login") return route.continue();
  blocked.push(`${m} ${u.hostname}${u.pathname}`); return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai"); await page.fill("#pw", pw); await page.click("#go");
await page.waitForTimeout(5000);
console.log("sign-in:", /login\.html/.test(page.url()) ? "FAILED" : "ok");
await page.goto(`${BASE}/app/finance-os.html?client_id=${CID}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
await page.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { const t = n.nodeValue; if (!t) continue; const v = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email hidden]"); if (v !== t) n.nodeValue = v; }
});
const panel = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".fos-r.inv")];
  const dataRows = rows.filter((r) => !/status/i.test(r.querySelector(".nm")?.innerText || ""));
  if (!rows.length) return null;
  const box = rows[0].parentElement; box.scrollIntoView({ block: "center" });
  return { rows: dataRows.map((r) => r.innerText.replace(/\s+/g, " ").trim()) };
});
await page.waitForTimeout(600);
const rect = await page.evaluate(() => { const rows = [...document.querySelectorAll(".fos-r.inv")]; if (!rows.length) return null; const a = rows[0].getBoundingClientRect(), b = rows[rows.length - 1].getBoundingClientRect(); return { x: a.left, y: a.top, w: a.width, h: b.bottom - a.top }; });
console.log("invoiced rows:", JSON.stringify(panel));
await page.evaluate(({ rect, rows, label }) => {
  const mk = (s) => { const d = document.createElement("div"); Object.assign(d.style, s); document.body.appendChild(d); return d; };
  if (rect) { const d = mk({ position: "fixed", left: rect.x - 4 + "px", top: rect.y - 4 + "px", width: rect.w + 8 + "px", height: rect.h + 8 + "px", border: "3px solid #e00000", zIndex: 2147483646, pointerEvents: "none", boxSizing: "border-box" }); const t = document.createElement("div"); Object.assign(t.style, { position: "absolute", left: "-3px", top: "-26px", background: "#e00000", color: "#fff", font: "bold 15px/22px Arial", padding: "0 8px" }); t.textContent = "1"; d.appendChild(t); }
  const lg = mk({ position: "fixed", right: "12px", bottom: "12px", maxWidth: "640px", background: "#fff", color: "#111", border: "3px solid #e00000", font: "14px/20px Arial", padding: "8px 12px", zIndex: 2147483647 });
  lg.innerHTML = `<b>N7 review ${label} — Finance OS, Sim Eight-Funding, Invoiced</b><br><b style="color:#e00000">1</b> The success-fee bill still reads: ${(rows || []).join(" | ") || "(not found)"} — it bills $2,500; 10% of the $10,000 confirmed approval would be $1,000`;
}, { rect, rows: panel?.rows, label: LABEL });
await page.screenshot({ path: `${OUT}/eight-${LABEL}-4-invoice.png` });
console.log("blocked:", JSON.stringify(blocked));
await browser.close();
