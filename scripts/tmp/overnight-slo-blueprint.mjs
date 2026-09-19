// GET/look-only overnight SLO + Blueprint + packs. No POST checkout. No Send.
import { loadEnv } from "../load-env.mjs";
loadEnv();
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { db } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const OUT = "/tmp/overnight-slo-blueprint-2026-09-17";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
};

mkdirSync(OUT, { recursive: true });

const staffRow = (
  await db.query(
    `SELECT id, org_id, email, role, name, status FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
    [EMAIL]
  )
).rows[0];
if (!staffRow) {
  console.error("no staff row");
  process.exit(1);
}

const docsDb = (
  await db.query(
    `SELECT d.id, d.client_id, d.document_key, d.kind, d.subtype, d.title, d.mime_type, d.byte_size, d.created_at
       FROM documents d
      WHERE d.client_id = ANY($1::uuid[])
      ORDER BY d.created_at DESC
      LIMIT 80`,
    [[IDS.eight, IDS.eleven]]
  )
).rows;

const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });

function clip(text, n = 2400) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);
}

function headingsFromHtml(html) {
  const h = String(html || "");
  const titles = [];
  const title = h.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (title) titles.push("title:" + title[1].trim().slice(0, 140));
  const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m;
  while ((m = re.exec(h)) && titles.length < 18) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t) titles.push(t.slice(0, 160));
  }
  const placeholder = /PLACEHOLDER\. THIS IS NOT THE REAL AGREEMENT TEXT/i.test(h);
  return {
    bytes: h.length,
    looksHtml: /<html[\s>]/i.test(h) || /<!doctype html/i.test(h),
    looksPdf: h.startsWith("%PDF"),
    placeholder,
    headings: titles,
    snippet: h.replace(/\s+/g, " ").trim().slice(0, 320),
  };
}

const KEEP = [
  "id",
  "client_id",
  "title",
  "name",
  "status",
  "kind",
  "subtype",
  "mime_type",
  "document_key",
  "byte_size",
  "entitlement_code",
  "entitlement_name",
  "active",
  "download",
  "code",
  "product",
  "priceCents",
  "priceDisplay",
  "next",
  "ok",
  "filename",
  "label",
  "state",
  "key",
  "done",
  "complete",
  "completed",
  "label_text",
  "item",
  "step",
  "stage",
];

function pick(r) {
  if (!r || typeof r !== "object") return r;
  const keep = {};
  for (const k of KEEP) {
    if (r[k] !== undefined) keep[k] = r[k];
  }
  if (r.download && typeof r.download === "object") {
    keep.download = { url: r.download.url ? "[signed]" : null, expires_at: r.download.expires_at || null };
  }
  return keep;
}

function slim(json) {
  if (!json || typeof json !== "object") return json;
  const rows = json.rows || json.items || json.documents || json.entitlements || json.queue || json.data;
  const out = { ok: json.ok, error: json.error };
  if (json.priceCents != null) out.priceCents = json.priceCents;
  if (json.priceDisplay != null) out.priceDisplay = json.priceDisplay;
  if (json.next != null) out.next = json.next;
  if (json.name != null) out.name = json.name;
  if (json.pending != null) out.pending = json.pending;
  if (json.client) out.client = pick(json.client);
  if (json.summary) out.summary = json.summary;
  if (json.progress) out.progress = json.progress;
  if (json.checklist) out.checklist = json.checklist;
  if (json.waypoints) out.waypoints = json.waypoints;
  if (Array.isArray(json.entitlements)) out.entitlements = json.entitlements.slice(0, 20).map(pick);
  if (Array.isArray(json.documents)) out.documents = json.documents.slice(0, 40).map(pick);
  if (Array.isArray(json.items) && !out.documents) out.items = json.items.slice(0, 40).map(pick);
  if (Array.isArray(json.rows) && !out.documents) out.rows = json.rows.slice(0, 40).map(pick);
  if (json.report) out.report_keys = Object.keys(json.report);
  if (json.crs_results) out.crs_count = json.crs_results.length;
  if (json.deliverables) out.deliverable_count = Array.isArray(json.deliverables) ? json.deliverables.length : json.deliverables;
  if (Array.isArray(rows) && !out.entitlements && !out.documents && !out.items && !out.rows) {
    out.count = rows.length;
    out.sample = rows.slice(0, 30).map(pick);
  }
  return Object.keys(out).some((k) => out[k] !== undefined) ? out : { keys: Object.keys(json) };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const page = await context.newPage();
const request = context.request;

async function getJson(path) {
  const res = await request.get(BASE + path);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { parse_error: true, snippet: text.slice(0, 280) };
  }
  return { status: res.status(), json: slim(json), rawKeys: json && typeof json === "object" ? Object.keys(json) : [] };
}

const api = {};
const paths = [
  ["/api/health", "health"],
  ["/api/public/slo-checkout", "slo_checkout"],
  [`/api/read/entitlements?client_id=${IDS.eleven}`, "eleven_entitlements"],
  [`/api/read/client-progress?client_id=${IDS.eleven}`, "eleven_progress"],
  [`/api/read/portal-summary?client_id=${IDS.eleven}`, "eleven_portal"],
  [`/api/read/documents?client_id=${IDS.eleven}`, "eleven_docs"],
  [`/api/read/documents?client_id=${IDS.eleven}&kind=deliverable`, "eleven_docs_del"],
  [`/api/read/underwrite?client_id=${IDS.eleven}`, "eleven_uwiq"],
  [`/api/dashboard/client?id=${IDS.eleven}`, "eleven_dash"],
  [`/api/read/entitlements?client_id=${IDS.eight}`, "eight_entitlements"],
  [`/api/read/documents?client_id=${IDS.eight}`, "eight_docs"],
  [`/api/read/documents?client_id=${IDS.eight}&kind=deliverable`, "eight_docs_del"],
  [`/api/read/underwrite?client_id=${IDS.eight}`, "eight_uwiq"],
  [`/api/read/portal-summary?client_id=${IDS.eight}`, "eight_portal"],
];
for (const [path, key] of paths) {
  api[key] = await getJson(path);
}

const goldReads = [];
const candidates = [];
for (const row of docsDb) {
  const mime = String(row.mime_type || "");
  const title = String(row.title || row.document_key || "");
  const kind = String(row.kind || "");
  if (
    /html/i.test(mime) ||
    /html/i.test(kind) ||
    /roadmap|gold|snapshot|lender|credit analysis|underwrite|metro|letter|deliverable/i.test(title) ||
    kind === "deliverable" ||
    /html/i.test(String(row.subtype || ""))
  ) {
    candidates.push(row);
  }
}
const seen = new Set();
for (const doc of candidates) {
  if (seen.has(doc.id) || goldReads.length >= 18) continue;
  seen.add(doc.id);
  const mint = await request.get(`${BASE}/api/documents-download?id=${doc.id}`);
  const mintText = await mint.text();
  let mintJson = null;
  try {
    mintJson = JSON.parse(mintText);
  } catch {
    mintJson = { parse_error: true };
  }
  const signedPath = mintJson?.url || mintJson?.href || mintJson?.signed_url || mintJson?.path;
  const result = {
    id: doc.id,
    client_id: doc.client_id,
    title: doc.title,
    mime_type: doc.mime_type,
    kind: doc.kind,
    subtype: doc.subtype,
    document_key: doc.document_key,
    byte_size: doc.byte_size,
    mintStatus: mint.status(),
    mintOk: mintJson?.ok,
    mintError: mintJson?.error,
  };
  if (typeof signedPath === "string" && (signedPath.startsWith("/") || signedPath.startsWith("http"))) {
    const fileUrl = signedPath.startsWith("http") ? signedPath : BASE + signedPath;
    const fileRes = await request.get(fileUrl);
    const ctype = fileRes.headers()["content-type"] || "";
    const buf = await fileRes.body();
    const head = buf.slice(0, 8).toString("latin1");
    const bodyText = /pdf|octet/i.test(ctype) || head.startsWith("%PDF") ? "" : buf.toString("utf8");
    result.fileStatus = fileRes.status();
    result.contentType = ctype;
    result.looksPdf = head.startsWith("%PDF");
    result.headings = bodyText ? headingsFromHtml(bodyText) : { bytes: buf.length, looksPdf: head.startsWith("%PDF"), looksHtml: false };
  }
  goldReads.push(result);
}

const pages = [
  ["/slo/", "slo_home"],
  ["/slo/pay.html", "slo_pay"],
  ["/slo/pull.html", "slo_pull"],
  [`/app/client-portal.html?id=${IDS.eleven}`, "portal11"],
  [`/progress.html?id=${IDS.eleven}`, "progress11_id"],
  [`/progress.html?client_id=${IDS.eleven}`, "progress11_client"],
  [`/app/client-portal.html?id=${IDS.eight}`, "portal8"],
  [`/app/documents.html?client_id=${IDS.eleven}`, "docs11"],
  [`/app/documents.html?client_id=${IDS.eight}`, "docs8"],
  [`/app/client-control-panel.html?id=${IDS.eleven}`, "ccp11"],
  [`/app/closer-dashboard.html?id=${IDS.eleven}`, "closer11"],
];

const shots = {};
for (const [path, key] of pages) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(key.startsWith("slo") ? 3500 : 2800);
  const body = clip(await page.locator("body").innerText().catch(() => ""));
  const buttons = await page
    .locator("button, a.btn, [role='button'], a.dr-s")
    .evaluateAll((els) =>
      els
        .map((el) => (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 50)
    )
    .catch(() => []);
  const ownText = await page
    .locator("#own-list, #own-t, [id*='own']")
    .evaluateAll((els) => els.map((el) => (el.innerText || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12))
    .catch(() => []);
  const priceSlots = await page
    .evaluate(() =>
      Array.from(document.querySelectorAll("[data-price], .price, .amount, [id*='price'], [id*='amount']"))
        .map((el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 20)
    )
    .catch(() => []);
  const shot = `${OUT}/${key}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  shots[key] = { url: page.url(), title: await page.title(), body, buttons, ownText, priceSlots, shot };
}

await browser.close();

const dump = {
  at: new Date().toISOString(),
  no_send: true,
  staff: { email: staffRow.email, role: staffRow.role, name: staffRow.name, status: staffRow.status },
  docsDb: docsDb.map((d) => ({
    id: d.id,
    client_id: d.client_id,
    title: d.title,
    mime_type: d.mime_type,
    kind: d.kind,
    subtype: d.subtype,
    document_key: d.document_key,
    byte_size: d.byte_size,
  })),
  goldReads,
  api,
  shots,
};
writeFileSync(`${OUT}/dump.json`, JSON.stringify(dump, null, 2));
console.log("wrote", `${OUT}/dump.json`);
console.log(
  JSON.stringify(
    {
      health: api.health,
      slo: api.slo_checkout,
      eleven_entitlements: api.eleven_entitlements,
      eleven_progress: api.eleven_progress,
      eleven_portal: api.eleven_portal,
      eleven_docs: api.eleven_docs,
      eleven_docs_del: api.eleven_docs_del,
      eleven_uwiq: { status: api.eleven_uwiq?.status, keys: api.eleven_uwiq?.rawKeys, json: api.eleven_uwiq?.json },
      eight_entitlements: api.eight_entitlements,
      eight_docs: api.eight_docs,
      eight_docs_del: api.eight_docs_del,
      eight_uwiq: { status: api.eight_uwiq?.status, keys: api.eight_uwiq?.rawKeys, json: api.eight_uwiq?.json },
      goldReads: goldReads.map((g) => ({
        title: g.title,
        client_id: g.client_id,
        mime_type: g.mime_type,
        kind: g.kind,
        subtype: g.subtype,
        mintStatus: g.mintStatus,
        mintOk: g.mintOk,
        fileStatus: g.fileStatus,
        contentType: g.contentType,
        looksPdf: g.looksPdf,
        headings: g.headings,
      })),
      shotSnips: Object.fromEntries(
        Object.entries(shots).map(([k, v]) => [
          k,
          {
            url: v.url,
            title: v.title,
            buttons: v.buttons,
            ownText: v.ownText,
            priceSlots: v.priceSlots,
            body: v.body.slice(0, 900),
          },
        ])
      ),
    },
    null,
    2
  )
);
