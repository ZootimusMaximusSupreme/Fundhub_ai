// Hole 2 (metro2 row) — LOCAL render of the real portal page, before ship.
// Serves public/ from this checkout and answers every /api/ call with a canned
// reply shaped like #11's live payload (titles and subtypes from the 2026-09-17
// dump). Nothing touches the live site or the database. Nothing is sent.
// Run: node scripts/tmp/live-fix-2026-09-18/h2-metro2-row-local-render.mjs [outDir]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PUBLIC = path.join(ROOT, "public");
const OUT = process.argv[2] || "/tmp/live-fix-2026-09-18/h2-metro2-row";
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let p = path.join(PUBLIC, decodeURIComponent(u.pathname));
  if (!p.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const ID = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const d = (id, subtype, title) => ({ id, kind: "deliverable", subtype, title, download: { url: `${BASE}/api/documents/${id}` } });
const CASES = {
  eleven: {
    ent: [
      { entitlement_code: "credit-optimization-roadmap", entitlement_name: "Credit Optimization Roadmap", active: true },
      { entitlement_code: "metro2-letter-pack", entitlement_name: "Metro 2 Dispute Letter Pack", active: true }
    ],
    docs: [
      d("pi-eq", "funding_personal_info", "Personal info — EQ"), d("pi-tu", "funding_personal_info", "Personal info — TU"),
      d("pi-ex", "funding_personal_info", "Personal info — EX"), d("ir-eq", "funding_inquiry_removal", "Inquiry removal — EQ"),
      d("ir-tu", "funding_inquiry_removal", "Inquiry removal — TU"), d("ir-ex", "funding_inquiry_removal", "Inquiry removal — EX"),
      d("crs", "funding_summary", "Capital Readiness Summary"), d("road", "credit_optimization_roadmap", "Credit Optimization Roadmap"),
      d("bank", "bank_lender_match_list", "Bank and Lender Match List"), d("snap", "funding_snapshot", "Funding Snapshot"),
      d("car", "credit_analysis_report", "Credit Analysis Report")
    ]
  },
  nine: {
    ent: [{ entitlement_code: "metro2-letter-pack", entitlement_name: "Metro 2 Dispute Letter Pack", active: true }],
    docs: []
  }
};

const browser = await chromium.launch();
const results = {};
for (const [name, c] of Object.entries(CASES)) {
  for (const vp of [{ tag: "desktop", width: 1280, height: 900 }, { tag: "phone", width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const sent = [];
    await page.route("**/api/**", (route) => {
      const u = new URL(route.request().url());
      if (route.request().method() !== "GET") sent.push(`${route.request().method()} ${u.pathname}`);
      if (u.pathname.endsWith("/auth/session")) {
        return route.fulfill({ json: { ok: true, staff: { id: "local-client", name: "Sim", role: "client", client_id: ID } } });
      }
      if (u.pathname.endsWith("/read/entitlements")) return route.fulfill({ json: { ok: true, items: c.ent } });
      if (u.pathname.endsWith("/read/portal-summary")) return route.fulfill({ json: { ok: true, documents: c.docs, soft_pull_complete: true } });
      return route.fulfill({ json: {} });
    });
    const log = [];
    page.on("pageerror", (e) => log.push("pageerror: " + e.message.slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error") log.push("console: " + m.text().slice(0, 200)); });
    page.on("request", (r) => { if (r.url().includes("/api/")) log.push(r.method() + " " + new URL(r.url()).pathname); });
    await page.addInitScript(() => { try { localStorage.setItem("fh_role", "client"); } catch { /* none */ } });
    await page.goto(`${BASE}/app/client-portal.html?id=${ID}`);
    try {
      await page.waitForSelector("#own-list .own", { state: "attached", timeout: 15000 });
    } catch (e) {
      console.error("no rows:", page.url(), "\n" + log.join("\n"));
      console.error(await page.evaluate(() => document.body.className));
      throw e;
    }
    await page.waitForTimeout(800);
    const rows = await page.$$eval("#own-list .own", (els) => els.map((e) => ({
      name: e.querySelector(".on-t")?.textContent.trim(),
      note: e.querySelector(".on-d")?.textContent.trim(),
      action: e.querySelector(".own-actions")?.textContent.trim(),
      hasLink: !!e.querySelector(".own-actions a[href]")
    })));
    // Red box + numbered legend on the row this fix is about (CLAUDE.md §8).
    const target = name === "eleven" ? "Dispute Letter Pack" : "Metro 2 Dispute Letter Pack";
    await page.evaluate((t) => {
      const row = [...document.querySelectorAll("#own-list .own")].find((e) => e.querySelector(".on-t")?.textContent.trim() === t);
      if (!row) return;
      row.scrollIntoView({ block: "center" });
      const r = row.getBoundingClientRect();
      const box = document.createElement("div");
      box.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 4}px;width:${r.width + 12}px;height:${r.height + 8}px;border:3px solid #e00;z-index:99999;pointer-events:none`;
      const tag = document.createElement("div");
      tag.textContent = "1";
      tag.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 26}px;background:#e00;color:#fff;font:700 14px sans-serif;padding:2px 7px;z-index:99999`;
      const legend = document.createElement("div");
      legend.textContent = t === "Dispute Letter Pack"
        ? "1 — #11 shape: the pack row now reads Ready; its letters are the rows under it"
        : "1 — #9 shape: repair-only row unchanged (Not ready yet)";
      legend.style.cssText = "position:fixed;left:8px;top:8px;right:8px;background:#fff;border:2px solid #e00;color:#000;font:600 13px sans-serif;padding:6px 8px;z-index:2147483647";
      document.body.append(box, tag, legend);
    }, target);
    const shot = path.join(OUT, `local-${name}-${vp.tag}.png`);
    await page.screenshot({ path: shot });
    results[`${name}-${vp.tag}`] = { rows, nonGetApiCalls: sent, shot };
    await page.close();
  }
}
await browser.close();
server.close();
fs.writeFileSync(path.join(OUT, "local-render.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { rows: v.rows.slice(0, 9), nonGetApiCalls: v.nonGetApiCalls }])), null, 1));
