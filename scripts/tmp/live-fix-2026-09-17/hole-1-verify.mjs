// HOLE 1 VERIFY — look only. GET requests and read-only SELECTs.
// No Send, no Apply, no Build My Pack, no portal link, no email, no SMS.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db, pool, close } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/live-fix-2026-09-17/hole-1";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
};
const ALL = Object.values(IDS);
mkdirSync(OUT, { recursive: true });

const ANALYSIS = ["credit_analysis_report", "credit_optimization_roadmap", "funding_snapshot", "bank_lender_match_list"];

// ---------- database, read only ----------
const c = await pool().connect();
const dbOut = {};
try {
  await c.query("BEGIN READ ONLY");
  dbOut.docs = (await c.query(
    `SELECT client_id, kind, subtype, title, mime_type, byte_size, generated_by, created_at,
            delivery_status, metadata->>'engine' AS engine
       FROM documents WHERE client_id = ANY($1::uuid[]) ORDER BY client_id, created_at`, [ALL])).rows;
  dbOut.entitlements = (await c.query(
    `SELECT * FROM v_client_entitlements WHERE client_id = ANY($1::uuid[])`, [ALL])).rows;
  dbOut.crs = (await c.query(
    `SELECT client_id, count(*)::int n, max(created_at) last, string_agg(DISTINCT coalesce(provider,'?'), ',') providers
       FROM crs_results WHERE client_id = ANY($1::uuid[]) GROUP BY client_id`, [ALL])).rows;
  dbOut.contracts = (await c.query(
    `SELECT client_id, template_key, kind, subtype, status, sent_at, signed_at,
            (rendered_body ILIKE '%PLACEHOLDER%') AS has_placeholder, length(rendered_body) AS body_len
       FROM contracts WHERE client_id = ANY($1::uuid[]) ORDER BY created_at`, [ALL])).rows;
  dbOut.templates = (await c.query(
    `SELECT t.* FROM contract_templates t LIMIT 0`)).fields.map((f) => f.name);
  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  c.release();
}

// ---------- live site, GET only ----------
const staffRow = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`, ["chris@fundhub.ai"])).rows[0];
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
  let json; try { json = JSON.parse(text); } catch { json = { parse_error: true, snippet: text.slice(0, 200) }; }
  return { status: res.status(), json };
}

const live = {};
live.health = (await getJson("/api/health")).json;
const uw8 = await getJson(`/api/read/underwrite?client_id=${IDS.eight}`);
live.uw8 = { status: uw8.status, ok: uw8.json.ok, keys: Object.keys(uw8.json || {}), scoreSource: uw8.json?.dataCompleteness?.scoreSource, bureaus: uw8.json?.dataCompleteness?.bureausAssessed };

live.docs = {};
const htmlToOpen = [];
for (const [name, id] of Object.entries(IDS)) {
  const r = await getJson(`/api/read/documents?client_id=${id}`);
  const rows = r.json.rows || r.json.items || [];
  const list = rows.map((d) => ({ id: d.id, title: d.title, kind: d.kind, subtype: d.subtype, mime: d.mime_type }));
  live.docs[name] = {
    status: r.status,
    count: rows.length,
    uwiqFiles: list.filter((d) => ANALYSIS.includes(d.subtype)).length,
    goldHtml: list.filter((d) => ANALYSIS.includes(d.subtype) && /html/i.test(d.mime || "")).length,
    html: list.filter((d) => /html/i.test(d.mime || "")).map((d) => `${d.kind}/${d.subtype}: ${d.title}`),
    titles: list.map((d) => `${d.kind}/${d.subtype} [${d.mime}] ${d.title}`),
  };
  for (const d of list) if (/html/i.test(d.mime || "")) htmlToOpen.push({ name, ...d });
}

live.htmlOpened = [];
for (const d of htmlToOpen) {
  const mint = await getJson(`/api/documents-download?id=${d.id}`);
  const dl = mint.json?.document?.download;
  const path = typeof dl === "string" ? dl : dl?.url || dl?.path;
  const row = { client: d.name, title: d.title, subtype: d.subtype, mintStatus: mint.status };
  if (typeof path === "string") {
    const url = path.startsWith("http") ? path : BASE + path;
    const f = await request.get(url);
    const body = await f.text();
    row.fileStatus = f.status();
    row.contentType = f.headers()["content-type"];
    row.bytes = body.length;
    row.hasPlaceholder = /PLACEHOLDER\. THIS IS NOT THE REAL AGREEMENT TEXT/i.test(body);
    const m = body.match(/AGREEMENT TERMS[\s\S]{0,160}/i);
    row.termsSnippet = m ? m[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null;
  }
  live.htmlOpened.push(row);
}

// Documents screen for #8, look only
const page = await context.newPage();
live.screens = {};
for (const [key, path] of [
  ["docs8", `/app/documents.html?client_id=${IDS.eight}`],
  ["docs11", `/app/documents.html?client_id=${IDS.eleven}`],
]) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(5000);
  const body = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  await page.screenshot({ path: `${OUT}/${key}.png`, fullPage: true });
  live.screens[key] = { url: page.url(), body: body.slice(0, 2500) };
}
await browser.close();

const out = { at: new Date().toISOString(), no_send: true, db: dbOut, live };
writeFileSync(`${OUT}/verify.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await close();
