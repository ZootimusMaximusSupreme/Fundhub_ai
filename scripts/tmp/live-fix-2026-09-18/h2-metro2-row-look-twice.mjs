// Hole 2 (metro2 row) — LIVE LOOK, TWICE, in two fresh browser contexts.
// Look only. Each context gets its own owner look-session (createSession — the
// same pattern as scripts/tmp/live-prove-no-send.mjs; the only write). The page
// gets GET/HEAD/OPTIONS and nothing else: every other request is aborted and
// listed. Nothing is clicked. The six letter links are checked with HEAD only
// (api/documents/[id].mjs answers HEAD with no write).
//
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/h2-metro2-row-look-twice.mjs
// Output: /tmp/live-fix-2026-09-18/h2-metro2-row/look-twice.json
// Marked shots: docs/workflows/live-prove-2026-09-17-evidence/h2-metro2-row/
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db, close } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const OUT = "/tmp/live-fix-2026-09-18/h2-metro2-row";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/h2-metro2-row";
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";

const staffRow = (await db.query(
  "SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1", [EMAIL]
)).rows[0];
if (!staffRow) { console.error("no staff row"); process.exit(1); }

const browser = await chromium.launch({ headless: true });

async function readRows(page) {
  return page.evaluate(() => [...document.querySelectorAll("#own-list .own")].map((r) => ({
    name: (r.querySelector(".on-t")?.innerText || "").trim(),
    note: (r.querySelector(".on-d")?.innerText || "").trim(),
    action: (r.querySelector(".own-actions")?.innerText || "").trim(),
    href: r.querySelector(".own-actions a[href]")?.getAttribute("href") || null
  })));
}

// marks: [{ n, from, to, text }] — from/to are row names; the box wraps rows from..to.
async function mark(page, marks, title) {
  await page.evaluate(({ marks, title }) => {
    const rows = [...document.querySelectorAll("#own-list .own")];
    const byName = (t) => rows.find((e) => (e.querySelector(".on-t")?.innerText || "").trim() === t);
    const head = document.getElementById("own-t");
    if (head) { head.style.scrollMarginTop = "90px"; head.scrollIntoView({ block: "start" }); }
    const legend = document.createElement("div");
    legend.style.cssText = "position:fixed;left:8px;bottom:8px;right:8px;background:#fff;border:2px solid #e00;color:#000;font:600 14px/1.45 sans-serif;padding:6px 10px;z-index:2147483647";
    const lines = [title];
    for (const m of marks) {
      const a = byName(m.from), b = byName(m.to || m.from);
      if (!a || !b) { lines.push(m.n + " — NOT FOUND: " + m.from); continue; }
      lines.push(m.n + " — " + m.text);
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const box = document.createElement("div");
      box.style.cssText = `position:fixed;left:${ra.left - 6}px;top:${ra.top - 4}px;width:${ra.width + 12}px;height:${rb.bottom - ra.top + 8}px;border:3px solid #e00;z-index:2147483646;pointer-events:none`;
      const tag = document.createElement("div");
      tag.textContent = String(m.n);
      tag.style.cssText = `position:fixed;left:${ra.left - 34}px;top:${ra.top - 4}px;background:#e00;color:#fff;font:700 15px sans-serif;padding:2px 7px;z-index:2147483647`;
      document.body.append(box, tag);
    }
    legend.innerHTML = lines.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");
    document.body.append(legend);
  }, { marks, title });
}

const out = { at: new Date().toISOString(), looks: [] };
for (const look of [1, 2]) {
  const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addCookies([
    { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
    { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true }
  ]);
  const blocked = [];
  await context.route("**/*", (route) => {
    const m = route.request().method();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      blocked.push(m + " " + new URL(route.request().url()).pathname);
      return route.abort();
    }
    return route.continue();
  });
  const rec = { look, blockedNonGet: blocked };

  // #11 — Blueprint buyer
  let page = await context.newPage();
  await page.goto(`${BASE}/app/client-portal.html?id=${ELEVEN}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector("#own-list .own", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const elevenRows = await readRows(page);
  const at = elevenRows.findIndex((r) => r.name === "Dispute Letter Pack");
  const letters = at < 0 ? [] : elevenRows.slice(at + 1, at + 7);
  const heads = await page.evaluate(async (hrefs) => {
    const res = [];
    for (const h of hrefs) {
      try { const r = await fetch(h, { method: "HEAD", credentials: "include" }); res.push({ status: r.status, type: r.headers.get("content-type") }); }
      catch (e) { res.push({ error: String(e) }); }
    }
    return res;
  }, letters.map((r) => r.href).filter(Boolean));
  await mark(page, [
    { n: 1, from: "Dispute Letter Pack", text: "#11 Blueprint buyer: 'Dispute Letter Pack' now says Ready (it said 'Not ready yet' forever before)" },
    { n: 2, from: letters[0]?.name || "?", to: letters[letters.length - 1]?.name || "?", text: `The ${letters.length} letters in that pack sit right under it, each with its own Download` }
  ], `Look ${look} (fresh browser) — fundhub.ai client portal, client #11 — What You Own`);
  await page.screenshot({ path: `${SHOTS}/look${look}-eleven-marked.png` });
  await page.close();
  rec.eleven = { rows: elevenRows.map(({ href, ...r }) => ({ ...r, hasLink: !!href })), letterHeads: heads };
  rec.eleven.pass = at >= 0 && elevenRows[at].action.toLowerCase() === "ready" &&
    !elevenRows.some((r) => r.action.toLowerCase() === "not ready yet") &&
    !elevenRows.some((r) => r.name === "Metro 2 Dispute Letter Pack") &&
    letters.length === 6 && letters.every((r) => r.href && /^(Personal info|Inquiry removal)/.test(r.name)) &&
    heads.length === 6 && heads.every((h) => h.status === 200);

  // #9 — repair only
  page = await context.newPage();
  await page.goto(`${BASE}/app/client-portal.html?id=${NINE}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector("#own-list .own", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const nineRows = await readRows(page);
  await mark(page, [
    { n: 1, from: "Metro 2 Dispute Letter Pack", text: "#9 repair-only buyer: the Metro 2 row is unchanged (same name, same 'Not ready yet' as before the fix)" }
  ], `Look ${look} (fresh browser) — fundhub.ai client portal, client #9 — What You Own`);
  await page.screenshot({ path: `${SHOTS}/look${look}-nine-marked.png` });
  await page.close();
  rec.nine = { rows: nineRows.map(({ href, ...r }) => ({ ...r, hasLink: !!href })) };
  rec.nine.pass = nineRows.length === 1 && nineRows[0].name === "Metro 2 Dispute Letter Pack" &&
    nineRows[0].action.toLowerCase() === "not ready yet" &&
    !nineRows.some((r) => r.name === "Dispute Letter Pack");

  await context.close();
  out.looks.push(rec);
}
await browser.close();
await close();
writeFileSync(`${OUT}/look-twice.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.looks.map((l) => ({ look: l.look, eleven: l.eleven.pass, nine: l.nine.pass, heads: l.eleven.letterHeads.map((h) => h.status), blocked: l.blockedNonGet })), null, 1));
process.exit(0);
