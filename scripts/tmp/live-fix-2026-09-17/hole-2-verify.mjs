// Hole 2 VERIFY — look only. GET requests and SELECTs only. No clicks on
// Send / Email me a sign-in link / any POST. No message is sent or queued.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const OUT = "/tmp/live-fix-2026-09-17/hole-2";
const ID = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
mkdirSync(OUT, { recursive: true });

const staffRow = (await db.query(
  `SELECT id, org_id, email, role FROM staff WHERE lower(email) = lower($1) LIMIT 1`, [EMAIL]
)).rows[0];
if (!staffRow) { console.error("no staff row"); process.exit(1); }

const entDb = (await db.query(
  `SELECT * FROM entitlements WHERE client_id = $1 ORDER BY granted_at NULLS LAST`, [ID]
).catch((e) => ({ rows: [{ error: e.message }] }))).rows;
const docsDb = (await db.query(
  `SELECT id, kind, subtype, title, mime_type, byte_size, document_key, created_at, expires_at
     FROM documents WHERE client_id = $1 ORDER BY created_at DESC`, [ID]
).catch((e) => ({ rows: [{ error: e.message }] }))).rows;

const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const request = context.request;

async function getJson(path) {
  const res = await request.get(BASE + path);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { snippet: text.slice(0, 300) }; }
  return { status: res.status(), json };
}

const ent = await getJson(`/api/read/entitlements?client_id=${ID}&limit=200`);
const ps = await getJson(`/api/read/portal-summary?client_id=${ID}`);

const page = await context.newPage();
// Block every non-GET request from the page, so nothing can post or send.
const blocked = [];
await page.route("**/*", (route) => {
  const m = route.request().method();
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
    blocked.push(m + " " + route.request().url());
    return route.abort();
  }
  return route.continue();
});
const results = [];
for (const pass of [1, 2]) {
  await page.goto(`${BASE}/app/client-portal.html?id=${ID}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(7000);
  const own = await page.evaluate(() => {
    const list = document.getElementById("own-list");
    const rows = list ? [...list.querySelectorAll(".own")].map((r) => ({
      name: (r.querySelector(".on-t")?.innerText || "").trim(),
      note: (r.querySelector(".on-d")?.innerText || "").trim(),
      action: (r.querySelector(".own-actions")?.innerText || "").trim(),
      hasLink: !!r.querySelector("a[href]"),
    })) : null;
    return { noOwnClass: document.body.classList.contains("no-own"), rows };
  });
  const card = page.locator("#own-list").first();
  if (await card.count()) {
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${OUT}/portal11-pass${pass}.png`, fullPage: false });
  results.push({ pass, url: page.url(), own });
}
await browser.close();

const entItems = (ent.json.items || []).map((e) => ({
  code: e.entitlement_code, name: e.entitlement_name, active: e.active,
  product: e.product_code || e.source_product || undefined,
}));
const psDocs = (ps.json.documents || []).map((d) => ({
  id: d.id, kind: d.kind, subtype: d.subtype, title: d.title, hasDownload: !!(d.download && d.download.url),
}));
const dump = {
  at: new Date().toISOString(),
  entitlementsApi: { status: ent.status, items: entItems },
  entDb: entDb.map((r) => ({ ...r })),
  portalSummary: { status: ps.status, docCount: psDocs.length, docs: psDocs },
  docsDb,
  portal: results,
  blockedNonGet: blocked,
};
writeFileSync(`${OUT}/dump.json`, JSON.stringify(dump, null, 2));
console.log(JSON.stringify(dump, null, 2));
await db.end?.();
process.exit(0);
