// Hole 8 — look only. The FIXED pipeline.html from this branch, served in place of
// the live copy. The live /api/dashboard/clients answer is fetched as-is and only its
// `rollups` are swapped for what the NEW listRollups() SQL counts on the live
// database (run inside BEGIN READ ONLY, rolled back). Proves the Total Approved tile
// before ship. Every non-GET request in the browser is aborted.
// Never prints passwords, tokens or cookies.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h8-local-render.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { pool } from "../../../src/db.mjs";
import { listRollups } from "../../../src/fulfillment/read-signals.mjs";

const BASE = "https://fundhub.ai";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-8";
mkdirSync(SHOTS, { recursive: true });
const TAG = process.argv[2] || "local-render";
const LOCAL_HTML = new URL("../../../public/app/pipeline.html", import.meta.url);
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";

const out = { at: new Date().toISOString(), tag: TAG };

// New rollups, counted on the live database, read only.
{
  const c = await pool().connect();
  try {
    await c.query("BEGIN READ ONLY");
    const org = (await c.query(`SELECT org_id FROM clients WHERE id = $1`, [EIGHT])).rows[0].org_id;
    out.newRollups = await listRollups(c, { orgId: org, demoOn: false });
    await c.query("ROLLBACK");
  } finally {
    c.release();
    await pool().end();
  }
}

const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h8-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
const cookie = m ? m[1] : null;
out.loginStatus = r.status;
out.gotCookie = Boolean(cookie);
if (!cookie) { console.log(JSON.stringify(out, null, 2)); process.exit(1); }

const browser = await chromium.launch({ headless: true });
out.passes = [];
for (let i = 1; i <= 2; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "fundhub_session", value: cookie, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true }]);
  const blocked = [];
  let swapped = false;
  await ctx.route("**/*", async (route) => {
    const q = route.request();
    const u = new URL(q.url());
    if (q.method() === "GET" && u.pathname === "/app/pipeline.html") {
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: readFileSync(LOCAL_HTML, "utf8") });
    }
    if (q.method() === "GET" && u.pathname === "/api/dashboard/clients" && /fulfillment=/.test(u.search)) {
      const live = await route.fetch();
      const body = await live.json();
      if (body && body.data && body.data.rollups) { body.data.rollups = out.newRollups; swapped = true; }
      else if (body && body.rollups) { body.rollups = out.newRollups; swapped = true; }
      return route.fulfill({ response: live, json: body });
    }
    if (["GET", "HEAD", "OPTIONS"].includes(q.method())) return route.continue();
    blocked.push(`${q.method()} ${u.pathname}`);
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  await page.click("#lensFulfillment");
  await page.waitForFunction(() => {
    const el = document.getElementById("ltTotalClients");
    return el && el.textContent.trim() !== "" && el.textContent.trim() !== "—";
  }, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const look = await page.evaluate(() => {
    const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent.replace(/\s+/g, " ").trim() : null; };
    return {
      totalApproved: txt("ltTotalApproved"), totalApprovedNote: txt("ltTotalApprovedNote"),
      totalClients: txt("ltTotalClients"), totalPrequal: txt("ltTotalPrequal"), totalPrequalNote: txt("ltTotalPrequalNote"),
      ready: txt("ltReady"), readyNote: txt("ltReadyNote"),
    };
  });
  await page.screenshot({ path: `${SHOTS}/${TAG}-fulfillment-pass${i}.png`, fullPage: false });
  out.passes.push({ pass: i, swapped, look, blocked });
  await ctx.close();
}
await browser.close();
writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
