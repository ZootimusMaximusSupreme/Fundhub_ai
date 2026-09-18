// N18 — look only. Walk1 Funding has a funded $45,000 round. Does the live control
// panel's Funded line (and the API behind it) say funded? Two fresh loads.
// Every non-GET request in the browser is aborted. No clicks on Apply / Mark funded / Send.
// Never prints passwords, tokens or cookies.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n18-verify.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N18";
mkdirSync(SHOTS, { recursive: true });
const TAG = process.argv[2] || "verify";
const WALK1 = "ab277630-8309-4c02-b187-f244e7e369e8";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const out = { at: new Date().toISOString(), tag: TAG };

// ---- sign in ----
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-n18-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
const cookie = m ? m[1] : null;
out.loginStatus = r.status;
out.gotCookie = Boolean(cookie);
if (!cookie) { console.log(JSON.stringify(out, null, 2)); process.exit(1); }
const H = { cookie: `fundhub_session=${cookie}`, accept: "application/json" };

// ---- the API the control panel reads ----
out.api = {};
for (const [label, id] of [["walk1", WALK1], ["eight", EIGHT]]) {
  const a = await fetch(`${BASE}/api/dashboard/client?id=${id}`, { headers: H });
  const d = await a.json().catch(() => null);
  const c = d?.client || d?.data?.client || {};
  const rounds = d?.funding_rounds || d?.data?.funding_rounds || [];
  out.api[label] = {
    status: a.status,
    funded: c.funded, funded_amount: c.funded_amount,
    rounds: rounds.map((x) => ({ n: x.round_number, status: x.status, approved: x.approved_amount, funded: x.funded_amount })),
  };
}

// ---- the control panel screen, twice ----
const browser = await chromium.launch({ headless: true });
out.passes = [];
for (let i = 1; i <= 2; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "fundhub_session", value: cookie, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true }]);
  const blocked = [];
  await ctx.route("**/*", (route) => {
    const q = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(q.method())) return route.continue();
    blocked.push(`${q.method()} ${new URL(q.url()).pathname}`);
    return route.abort();
  });
  const page = await ctx.newPage();
  const pass = { pass: i };
  await page.goto(`${BASE}/app/client-control-panel.html?id=${WALK1}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForFunction(() => {
    const el = document.getElementById("ccp-facts-funded");
    return el && el.textContent.trim() !== "" && el.textContent.trim() !== "—";
  }, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  pass.ccp = await page.evaluate(() => {
    const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent.replace(/\s+/g, " ").trim() : null; };
    return { name: txt("ccp-name"), factsFunded: txt("ccp-facts-funded"), factsRound: txt("ccp-facts-round") };
  });
  // Open the System Facts group (a screen-only toggle, no request) so the Funded line shows.
  await page.click('button[aria-controls="facts-body"]').catch(() => {});
  await page.waitForTimeout(500);
  const factsEl = await page.$("#ccp-facts-funded");
  if (factsEl) await factsEl.scrollIntoViewIfNeeded().catch(() => {});
  pass.factsBox = factsEl ? await factsEl.boundingBox() : null;
  // Mark-up for the screenshot only: red box 1 on the Funded row, 2 on the round row, legend.
  await page.evaluate(({ funded, round }) => {
    const box = (el, n) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const d = document.createElement("div");
      d.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 4}px;width:${r.width + 12}px;height:${r.height + 8}px;` +
        "border:3px solid #e00;z-index:99999;pointer-events:none;";
      const t = document.createElement("div");
      t.textContent = String(n);
      t.style.cssText = "position:absolute;left:-26px;top:-4px;background:#e00;color:#fff;font:bold 14px sans-serif;padding:2px 7px;";
      d.appendChild(t);
      document.body.appendChild(d);
    };
    box(document.getElementById("ccp-facts-funded")?.closest(".fact-row"), 1);
    box(document.getElementById("ccp-facts-round")?.closest(".fact-row"), 2);
    // Hide contact details from the evidence image.
    for (const el of document.querySelectorAll("body *")) {
      if (!el.children.length && /@|\(\d{3}\)|\d{3}-\d{4}/.test(el.textContent || "")) el.style.filter = "blur(6px)";
    }
    const lg = document.createElement("div");
    lg.style.cssText = "position:fixed;left:260px;bottom:40px;max-width:620px;background:#fff;color:#111;border:3px solid #e00;" +
      "font:14px/1.4 sans-serif;padding:10px 12px;z-index:99999;";
    lg.innerHTML = `<b>N18 — Walk1 Funding</b><br>1 — Funded line: <b>${funded}</b> (round 1 is funded for $45,000)` +
      `<br>2 — Latest round: ${round}`;
    document.body.appendChild(lg);
  }, { funded: pass.ccp.factsFunded, round: pass.ccp.factsRound });
  await page.screenshot({ path: `${SHOTS}/${TAG}-ccp-pass${i}.png`, fullPage: false });
  pass.blocked = blocked;
  out.passes.push(pass);
  await ctx.close();
}
await browser.close();
writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
