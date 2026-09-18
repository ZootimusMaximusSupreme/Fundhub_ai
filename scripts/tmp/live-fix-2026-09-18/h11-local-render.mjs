// Hole 11 — LOCAL render of the real portal page, before ship.
// Serves public/ from this checkout and answers every /api/ call with a canned
// reply shaped like #12's live payload (2026-09-18): one active grant,
// funding-mastery-course, and two contracts on file. Nothing touches the live
// site or the database. Nothing is sent.
// Run: node scripts/tmp/live-fix-2026-09-18/h11-local-render.mjs [outDir]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PUBLIC = path.join(ROOT, "public");
const OUT = process.argv[2] || "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-11";
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

const ID = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const ENT = [{ entitlement_code: "funding-mastery-course", entitlement_name: "Funding Mastery course (A to Z)", active: true }];
const DOCS = [
  { id: "c1", kind: "contract", subtype: "funding_agreement", title: "Funding Agreement (signed)", download: { url: `${BASE}/x/c1` } },
  { id: "c2", kind: "contract", subtype: "funding_agreement", title: "Funding Agreement", download: { url: `${BASE}/x/c2` } }
];
const STAGE = { key: "paid", before_call: false, soft_pull_complete: true, call_held: true, agreement_signed: true, payment_posted: true };

const browser = await chromium.launch();
const results = {};
for (const vp of [{ tag: "desktop", width: 1280, height: 900 }, { tag: "phone", width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const sent = [];
  const errors = [];
  await page.route("**/api/**", (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() !== "GET") sent.push(`${route.request().method()} ${u.pathname}`);
    if (u.pathname.endsWith("/auth/session")) {
      return route.fulfill({ json: { ok: true, staff: { id: "local-client", name: "Sim", role: "client", client_id: ID } } });
    }
    if (u.pathname.endsWith("/read/entitlements")) return route.fulfill({ json: { ok: true, items: ENT } });
    if (u.pathname.endsWith("/read/portal-summary")) {
      return route.fulfill({ json: { ok: true, documents: DOCS, soft_pull_complete: true, stage: STAGE, scores: {} } });
    }
    return route.fulfill({ json: {} });
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("fh_role", "client"); } catch { /* none */ } });
  await page.goto(`${BASE}/app/client-portal.html?id=${ID}`);
  await page.waitForSelector("#own-list .own", { state: "attached", timeout: 15000 });
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => ({
    emptyVisible: getComputedStyle(document.getElementById("own-empty")).display !== "none",
    rows: [...document.querySelectorAll("#own-list .own")].map((e) => e.innerText.replace(/\s+/g, " ").trim()),
    tileOpen: document.querySelector('[data-tile="FUNDING_MASTERY"]').classList.contains("is-open"),
    btnBox: (() => { const b = document.querySelector("[data-own-course]"); const r = b && b.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null; })()
  }));
  // Red box + numbered legend on the row this fix is about (CLAUDE.md §8).
  await page.evaluate(() => {
    const row = document.querySelector("#own-list .own");
    row.scrollIntoView({ block: "center" });
    const r = row.getBoundingClientRect();
    const box = document.createElement("div");
    box.className = "h11-mark";
    box.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 4}px;width:${r.width + 12}px;height:${r.height + 8}px;border:3px solid #e00;z-index:99999;pointer-events:none`;
    const tag = document.createElement("div");
    tag.className = "h11-mark";
    tag.textContent = "1";
    tag.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 26}px;background:#e00;color:#fff;font:700 14px sans-serif;padding:2px 7px;z-index:99999`;
    const legend = document.createElement("div");
    legend.className = "h11-mark";
    legend.textContent = "1 — #12 shape: What You Own now lists the course she owns, with Open course";
    legend.style.cssText = "position:fixed;left:8px;top:8px;right:8px;background:#fff;border:2px solid #e00;color:#000;font:600 13px sans-serif;padding:6px 8px;z-index:2147483647";
    document.body.append(box, tag, legend);
  });
  const shot1 = path.join(OUT, `local-${vp.tag}-row.png`);
  await page.screenshot({ path: shot1 });
  await page.evaluate(() => document.querySelectorAll(".h11-mark").forEach((n) => n.remove()));

  await page.click("[data-own-course]");
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => {
    const t = document.querySelector('[data-tile="FUNDING_MASTERY"]');
    const r = t.getBoundingClientRect();
    return {
      tileOpen: t.classList.contains("is-open"),
      panelVisible: !t.querySelector(".tile-course").hidden,
      tileTopInView: r.top >= -2 && r.top < window.innerHeight,
      toggleText: t.querySelector("[data-course-toggle]")?.textContent.trim(),
      label: t.querySelector(".tc-label")?.textContent.trim()
    };
  });
  await page.evaluate(() => {
    const t = document.querySelector('[data-tile="FUNDING_MASTERY"]');
    const r = t.getBoundingClientRect();
    const box = document.createElement("div");
    box.style.cssText = `position:fixed;left:${r.left - 6}px;top:${Math.max(r.top - 4, 40)}px;width:${r.width + 12}px;height:${Math.min(r.height + 8, window.innerHeight - 50)}px;border:3px solid #e00;z-index:99999;pointer-events:none`;
    const legend = document.createElement("div");
    legend.textContent = "1 — after pressing Open course: the Capital Academy card is open, modules showing";
    legend.style.cssText = "position:fixed;left:8px;top:8px;right:8px;background:#fff;border:2px solid #e00;color:#000;font:600 13px sans-serif;padding:6px 8px;z-index:2147483647";
    document.body.append(box, legend);
  });
  const shot2 = path.join(OUT, `local-${vp.tag}-opened.png`);
  await page.screenshot({ path: shot2 });
  results[vp.tag] = { before, after, nonGetApiCalls: sent, errors, shots: [shot1, shot2] };
  await page.close();
}
await browser.close();
server.close();
fs.writeFileSync(path.join(OUT, "local-render.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
