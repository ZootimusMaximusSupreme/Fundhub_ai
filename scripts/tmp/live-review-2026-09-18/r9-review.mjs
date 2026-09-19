// Hole 9 REVIEWER (not the fixer). Look only, on live.
// Signs in through the real password form, opens #8's staff portal twice in fresh page loads,
// opens Account & history -> Payments each time, records exactly what it lists.
// Every request that is not a GET is aborted, except the one sign-in POST.
// Never prints a password, token, cookie or pay link.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r9-review.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const TAG = process.argv[2] || "review";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-9/review";
mkdirSync(SHOTS, { recursive: true });
const out = { at: new Date().toISOString(), tag: TAG, blocked: [], loads: [] };

const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD not set"); process.exit(1); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
let signInPosts = 0;
await ctx.route("**/*", (route) => {
  const r = route.request();
  const u = new URL(r.url());
  if (r.method() === "POST" && u.hostname === "fundhub.ai" && u.pathname === "/api/auth/login" && signInPosts === 0) { signInPosts++; return route.continue(); }
  if (r.method() !== "GET") { out.blocked.push(`${r.method()} ${u.hostname}${u.pathname}`); return route.abort(); }
  return route.continue();
});

// sign in like a person
const login = await ctx.newPage();
await login.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await login.fill("#email", "chris@fundhub.ai");
await login.fill("#pw", pw);
const [lr] = await Promise.all([
  login.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST", { timeout: 30_000 }),
  login.click("#go"),
]);
out.loginStatus = lr.status();
await login.waitForTimeout(2500);
out.signedIn = (await ctx.cookies(BASE)).some((c) => c.name === "fundhub_session");
out.afterLoginPath = new URL(login.url()).pathname;
await login.close();
if (out.loginStatus !== 200 || !out.signedIn) {
  writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
  console.log("SIGN-IN FAILED", out.loginStatus, out.signedIn);
  await browser.close();
  process.exit(1);
}

for (const n of [1, 2]) {
  const pg = await ctx.newPage(); // fresh page load each time
  const apis = {};
  pg.on("response", async (resp) => {
    const u = new URL(resp.url());
    if (u.hostname !== "fundhub.ai" || !u.pathname.startsWith("/api/")) return;
    if (!/portal-summary|dashboard\/client/.test(u.pathname)) return;
    try {
      const j = await resp.json();
      const d = j?.data || j || {};
      apis[u.pathname] = {
        status: resp.status(),
        payments: (d.payments || d.transactions || []).map((t) => ({ product_name: t.product_name, amount_paid: t.amount_paid, status: t.status, paid_at: t.paid_at || t.created_at || null })),
        invoice_due: d.invoice_due ? { ...d.invoice_due, items: (d.invoice_due.items || []).map((it) => ({ ...it, pay_url: it.pay_url ? "(present)" : null })) } : d.invoice_due ?? "(absent)",
      };
    } catch { apis[u.pathname] = { status: resp.status(), json: false }; }
  });
  await pg.goto(`${BASE}/app/client-portal.html?id=${EIGHT}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await pg.waitForTimeout(9000);
  // open Account & history, then the Payments tab, by their visible words
  const acctSummary = pg.locator("summary", { hasText: /Account\s*&\s*history/i }).first();
  const acctFound = await acctSummary.count();
  if (acctFound) await acctSummary.click(); else await pg.click("#acct > summary");
  await pg.waitForTimeout(600);
  const payTab = pg.locator('#acct [role="tab"], #acct button, #acct-tabs [data-tab]', { hasText: /^\s*Payments\s*$/i }).first();
  const payFound = await payTab.count();
  if (payFound) await payTab.click(); else await pg.click('#acct-tabs [data-tab="pay"]');
  await pg.waitForTimeout(1200);
  const pane = await pg.evaluate(() => {
    const el = document.getElementById("tp-pay");
    const vis = (e) => !!e && e.offsetParent !== null;
    return el ? {
      visible: vis(el),
      text: el.innerText.replace(/\n+/g, " | ").trim(),
      rows: [...el.querySelectorAll(".pay-row")].map((r) => r.innerText.replace(/\s+/g, " ").trim()),
      links: [...el.querySelectorAll("a,button")].map((a) => a.textContent.trim()).filter(Boolean),
      activeTab: document.querySelector("#acct-tabs [aria-selected='true'], #acct-tabs .active, #acct-tabs .on")?.textContent?.trim() || null,
    } : null;
  });
  // mark: red numbered boxes on the bill row and payment row(s), legend on the image
  const marks = await pg.evaluate(() => {
    const el = document.getElementById("tp-pay");
    if (!el) return [];
    const rows = [...el.querySelectorAll(".pay-row")];
    const found = [];
    const bill = rows.find((r) => /2,?500/.test(r.innerText));
    const due = rows.find((r) => /due now/i.test(r.innerText));
    const card = rows.find((r) => /card stacking/i.test(r.innerText) && /3,?000/.test(r.innerText));
    if (due) found.push({ el: due, cap: "Bill row: " + due.innerText.replace(/\s+/g, " ").trim() });
    if (bill && bill !== due) found.push({ el: bill, cap: "$2,500 row: " + bill.innerText.replace(/\s+/g, " ").trim() });
    if (card && card !== bill && card !== due) found.push({ el: card, cap: "Payment row: " + card.innerText.replace(/\s+/g, " ").trim() });
    rows.forEach((r) => { if (!found.some((f) => f.el === r)) found.push({ el: r, cap: "Other row: " + r.innerText.replace(/\s+/g, " ").trim() }); });
    const acct = document.getElementById("acct");
    acct.scrollIntoView({ block: "start" });
    found.forEach((f, i) => {
      const b = f.el.getBoundingClientRect();
      const box = document.createElement("div");
      box.className = "r9-mark";
      Object.assign(box.style, { position: "absolute", left: `${b.left + scrollX - 4}px`, top: `${b.top + scrollY - 4}px`, width: `${b.width + 8}px`, height: `${b.height + 8}px`, border: "3px solid #e00", zIndex: 99999, pointerEvents: "none", boxSizing: "border-box" });
      const tag = document.createElement("div");
      tag.textContent = String(i + 1);
      Object.assign(tag.style, { position: "absolute", right: "-14px", top: "calc(50% - 12px)", background: "#e00", color: "#fff", font: "bold 14px sans-serif", width: "24px", height: "24px", borderRadius: "12px", textAlign: "center", lineHeight: "24px" });
      box.appendChild(tag);
      document.body.appendChild(box);
    });
    const legend = document.createElement("div");
    legend.className = "r9-mark";
    legend.innerHTML = `<b>Hole 9 review — ${new Date().toISOString().slice(0, 19)}Z</b><br>` + (found.length
      ? found.map((f, i) => `${i + 1}. ${f.cap.replace(/</g, "&lt;")}`).join("<br>")
      : "No rows found on the Payments tab");
    const ab = acct.getBoundingClientRect();
    Object.assign(legend.style, { position: "absolute", left: `${ab.left + scrollX}px`, top: `${ab.bottom + scrollY + 8}px`, width: `${Math.max(ab.width, 520)}px`, background: "#fff", color: "#111", border: "3px solid #e00", padding: "8px 10px", font: "14px/1.45 sans-serif", zIndex: 99999 });
    document.body.appendChild(legend);
    return found.map((f) => f.cap);
  });
  const shot = `${SHOTS}/${TAG}-load${n}-marked.png`;
  const ab = await pg.locator("#acct").boundingBox();
  const lg = await pg.locator(".r9-mark").last().boundingBox();
  const clip = ab && lg ? { x: Math.max(0, Math.min(ab.x, lg.x) - 24), y: Math.max(0, ab.y - 24), width: Math.max(ab.x + ab.width, lg.x + lg.width) - Math.max(0, Math.min(ab.x, lg.x) - 24) + 24, height: lg.y + lg.height - Math.max(0, ab.y - 24) + 16 } : undefined;
  await pg.screenshot({ path: shot, fullPage: true, clip });
  out.loads.push({ n, at: new Date().toISOString(), acctFoundByText: !!acctFound, payTabFoundByText: !!payFound, pane, marks, apis, shot });
  await pg.close();
}
out.blockedCount = out.blocked.length;
writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
