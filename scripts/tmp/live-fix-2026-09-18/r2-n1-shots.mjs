// N1 — marked screenshots (CLAUDE.md §8) of Finance OS "Money in" + "Invoiced"
// for #8 and #9. LOOK ONLY: owner sign-in through the real login page, every
// non-GET except that sign-in is aborted. Boxes are drawn from each element's
// real position in the page, so a box cannot point at empty space.
//   --local  serve THIS branch's finance-os.html in place of the live copy
//            (APIs, scripts and css stay live).
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n1-shots.mjs <tag> [--local]
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N1";
const TAG = process.argv.slice(2).find((a) => !a.startsWith("--")) || "shots";
const LOCAL = process.argv.includes("--local");
const LOCAL_HTML = new URL("../../../public/app/finance-os.html", import.meta.url);
const CLIENTS = { eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4", nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd" };
const out = { at: new Date().toISOString(), tag: TAG, local: LOCAL, blocked: [], shots: [] };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  const p = new URL(req.url()).pathname;
  if (LOCAL && m === "GET" && p === "/app/finance-os.html") {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: readFileSync(LOCAL_HTML, "utf8") });
  }
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${p}`);
  return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", process.env.STAFF_INITIAL_PASSWORD || "");
const lr = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
out.login = (await lr).status();
await page.waitForTimeout(2500);

for (const [name, id] of Object.entries(CLIENTS)) {
  for (const n of [1, 2]) {
    await page.goto(`${BASE}/app/finance-os.html?client_id=${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    const info = await page.evaluate(({ title }) => {
      const panels = [...document.querySelectorAll(".fos-panel")];
      const byTitle = (t) => panels.find((p) => (p.querySelector("h2")?.textContent || "").trim() === t);
      const money = byTitle("Money in");
      const inv = byTitle("Invoiced");
      if (!money) return { ok: false };
      const marks = [];
      const head = money.querySelector(".fh-row");
      if (head) marks.push({ el: head, cap: `Paid so far: ${head.innerText.replace(/\s+/g, " ").trim()}` });
      [...money.querySelectorAll(".fos-r.pay")].forEach((r) => {
        const txt = r.innerText.replace(/\s+/g, " ").trim();
        if (/refunded|failed|cancelled/.test(txt)) marks.push({ el: r, cap: `Listed, not counted: ${txt}` });
      });
      if (inv) {
        const rows = [...inv.querySelectorAll(".fh-row")].slice(0, 3);
        const words = rows.length
          ? rows.map((r) => r.innerText.replace(/\s+/g, " ").trim()).join(" · ")
          : (inv.querySelector(".fh-empty")?.textContent || "").trim();
        marks.push({ el: inv, cap: `Invoiced: ${words}`, whole: true });
      }
      document.querySelectorAll(".n1-mark").forEach((e) => e.remove());
      const sx = window.scrollX, sy = window.scrollY;
      marks.forEach((m, i) => {
        const b = m.el.getBoundingClientRect();
        const box = document.createElement("div");
        box.className = "n1-mark";
        Object.assign(box.style, { position: "absolute", left: `${b.left + sx - 4}px`, top: `${b.top + sy - 4}px`,
          width: `${b.width + 8}px`, height: `${b.height + 8}px`, border: "3px solid #ff2828", zIndex: 99999, pointerEvents: "none" });
        const tag = document.createElement("div");
        tag.className = "n1-mark";
        tag.textContent = String(i + 1);
        Object.assign(tag.style, { position: "absolute", left: `${b.left + sx - 30}px`, top: `${b.top + sy - 4}px`,
          background: "#ff2828", color: "#fff", font: "700 15px Helvetica", padding: "2px 7px", zIndex: 99999 });
        document.body.appendChild(box); document.body.appendChild(tag);
      });
      const legend = document.createElement("div");
      legend.className = "n1-mark";
      legend.id = "n1-legend";
      Object.assign(legend.style, { background: "#fff", color: "#111", font: "15px Helvetica", lineHeight: "1.6",
        padding: "10px 16px", border: "2px solid #ff2828", margin: "12px 0" });
      legend.innerHTML = `<div style="font-weight:700">${title}</div>` + marks.map((m, i) =>
        `<div><b style="background:#ff2828;color:#fff;padding:0 6px;margin-right:8px">${i + 1}</b>${m.cap.replace(/</g, "&lt;")}</div>`).join("");
      money.parentElement.insertBefore(legend, money);
      const top = legend.getBoundingClientRect().top + sy - 10;
      const lastEl = inv || money;
      const bottom = lastEl.getBoundingClientRect().bottom + sy + 12;
      const left = Math.min(legend.getBoundingClientRect().left, money.getBoundingClientRect().left) + sx - 40;
      const right = Math.max(money.getBoundingClientRect().right, (inv || money).getBoundingClientRect().right) + sx + 12;
      // Re-place boxes: the legend pushed the panels down.
      return { ok: true, clip: { x: Math.max(0, left), y: Math.max(0, top), width: right - Math.max(0, left), height: bottom - top } };
    }, { title: `${name === "eight" ? "#8 Sim Eight-Funding" : "#9 Sim Nine-Repair"} — Finance OS (${LOCAL ? "this branch's page, live data" : "live page, live data"}), load ${n}` });
    if (!info.ok) { out.shots.push({ name, n, ok: false }); continue; }
    // The legend moved the panels; redraw boxes at their new positions.
    await page.evaluate(() => {
      const boxes = [...document.querySelectorAll(".n1-mark")].filter((e) => e.id !== "n1-legend");
      boxes.forEach((b) => b.remove());
    });
    const clip = await page.evaluate(() => {
      const panels = [...document.querySelectorAll(".fos-panel")];
      const byTitle = (t) => panels.find((p) => (p.querySelector("h2")?.textContent || "").trim() === t);
      const money = byTitle("Money in"); const inv = byTitle("Invoiced");
      const els = [];
      const head = money.querySelector(".fh-row"); if (head) els.push(head);
      [...money.querySelectorAll(".fos-r.pay")].forEach((r) => { if (/refunded|failed|cancelled/.test(r.innerText)) els.push(r); });
      if (inv) els.push(inv);
      const sx = window.scrollX, sy = window.scrollY;
      els.forEach((el, i) => {
        const b = el.getBoundingClientRect();
        const box = document.createElement("div"); box.className = "n1-mark";
        Object.assign(box.style, { position: "absolute", left: `${b.left + sx - 4}px`, top: `${b.top + sy - 4}px`,
          width: `${b.width + 8}px`, height: `${b.height + 8}px`, border: "3px solid #ff2828", zIndex: 99999, pointerEvents: "none" });
        const tag = document.createElement("div"); tag.className = "n1-mark"; tag.textContent = String(i + 1);
        Object.assign(tag.style, { position: "absolute", left: `${b.left + sx - 30}px`, top: `${b.top + sy - 4}px`,
          background: "#ff2828", color: "#fff", font: "700 15px Helvetica", padding: "2px 7px", zIndex: 99999 });
        document.body.appendChild(box); document.body.appendChild(tag);
      });
      const legend = document.getElementById("n1-legend");
      const top = legend.getBoundingClientRect().top + sy - 10;
      const bottom = (inv || money).getBoundingClientRect().bottom + sy + 12;
      const left = Math.max(0, money.getBoundingClientRect().left + sx - 40);
      const right = Math.max(money.getBoundingClientRect().right, (inv || money).getBoundingClientRect().right) + sx + 12;
      return { x: left, y: Math.max(0, top), width: right - left, height: bottom - Math.max(0, top) };
    });
    const file = `${DIR}/${TAG}-${name}-${n}-marked.png`;
    await page.screenshot({ path: file, clip, fullPage: true });
    out.shots.push({ name, n, file });
  }
}
writeFileSync(`${DIR}/${TAG}-shots.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
