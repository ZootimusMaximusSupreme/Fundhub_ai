// Hole 2 (metro2 row) — LIVE PROVE, run only AFTER the fix has shipped.
// Look only. The page gets GET/HEAD/OPTIONS and nothing else: every other
// request is aborted and listed. No click on anything. No message is sent or
// queued. The only write is the owner look-session row (createSession), the same
// pattern as scripts/tmp/live-prove-no-send.mjs.
//
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/h2-metro2-row-prove.mjs
// Output: /tmp/live-fix-2026-09-18/h2-metro2-row/prove.json + marked screenshots.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db, close } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const OUT = "/tmp/live-fix-2026-09-18/h2-metro2-row";
mkdirSync(OUT, { recursive: true });

const CLIENTS = [
  { tag: "eleven", id: "029964c5-4d8e-47ed-88c9-53ac13863fd4", mark: "Dispute Letter Pack",
    legend: "1 — #11: the Blueprint letter pack row now reads Ready; its 6 letters are the rows under it" },
  { tag: "nine", id: "be3dcfd7-faae-4001-b97f-9bc30875bbcd", mark: "Metro 2 Dispute Letter Pack",
    legend: "1 — #9 (repair only): Metro 2 row unchanged" }
];

const staffRow = (await db.query(
  "SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1", [EMAIL]
)).rows[0];
if (!staffRow) { console.error("no staff row"); process.exit(1); }
const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true }
]);

const out = { at: new Date().toISOString(), clients: {} };
for (const c of CLIENTS) {
  const page = await context.newPage();
  const blocked = [];
  await page.route("**/*", (route) => {
    const m = route.request().method();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      blocked.push(m + " " + new URL(route.request().url()).pathname);
      return route.abort();
    }
    return route.continue();
  });
  const passes = [];
  for (const pass of [1, 2]) {
    await page.goto(`${BASE}/app/client-portal.html?id=${c.id}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(7000);
    const rows = await page.evaluate(() => [...document.querySelectorAll("#own-list .own")].map((r) => ({
      name: (r.querySelector(".on-t")?.innerText || "").trim(),
      note: (r.querySelector(".on-d")?.innerText || "").trim(),
      action: (r.querySelector(".own-actions")?.innerText || "").trim().toLowerCase(),
      hasLink: !!r.querySelector(".own-actions a[href]")
    })));
    await page.evaluate(({ t, legendText }) => {
      const row = [...document.querySelectorAll("#own-list .own")]
        .find((e) => (e.querySelector(".on-t")?.innerText || "").trim() === t);
      const legend = document.createElement("div");
      legend.textContent = row ? legendText : "1 — row not found: " + t;
      legend.style.cssText = "position:fixed;left:8px;top:8px;right:8px;background:#fff;border:2px solid #e00;color:#000;font:600 14px sans-serif;padding:6px 8px;z-index:2147483647";
      document.body.append(legend);
      if (!row) return;
      row.scrollIntoView({ block: "center" });
      const r = row.getBoundingClientRect();
      const box = document.createElement("div");
      box.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 4}px;width:${r.width + 12}px;height:${r.height + 8}px;border:3px solid #e00;z-index:2147483647;pointer-events:none`;
      const tag = document.createElement("div");
      tag.textContent = "1";
      tag.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 26}px;background:#e00;color:#fff;font:700 14px sans-serif;padding:2px 7px;z-index:2147483647`;
      document.body.append(box, tag);
    }, { t: c.mark, legendText: c.legend });
    await page.screenshot({ path: `${OUT}/prove-${c.tag}-pass${pass}.png` });
    passes.push({ pass, url: page.url(), rows });
  }
  await page.close();

  let verdict;
  const last = passes.map((p) => p.rows);
  if (c.tag === "eleven") {
    verdict = last.every((rows) => {
      const at = rows.findIndex((r) => r.name === "Dispute Letter Pack");
      const letters = at < 0 ? [] : rows.slice(at + 1, at + 7);
      return at >= 0 && rows[at].action === "ready" &&
        !rows.some((r) => r.action === "not ready yet") &&
        !rows.some((r) => r.name === "Metro 2 Dispute Letter Pack") &&
        letters.length === 6 && letters.every((r) => r.hasLink && /^(Personal info|Inquiry removal)/.test(r.name));
    }) ? "PASS" : "FAIL";
  } else {
    verdict = last.every((rows) => rows.some((r) =>
      r.name === "Metro 2 Dispute Letter Pack" && r.action === "not ready yet")) ? "PASS" : "FAIL";
  }
  out.clients[c.tag] = { id: c.id, verdict, passes, blockedNonGet: blocked };
}
await browser.close();
await close();
writeFileSync(`${OUT}/prove.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(out.clients).map(([k, v]) => [k, v.verdict])), null, 1));
process.exit(0);
