// GET-only follow-up. No Send / Apply / Claim / portal-link.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { db } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/live-prove-2026-09-17";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
};

const staffRow = (await db.query(
  `SELECT id, org_id, email, role FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
  ["chris@fundhub.ai"]
)).rows[0];
const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const request = context.request;

async function getJson(path) {
  const res = await request.get(BASE + path);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { parse_error: true, snippet: text.slice(0, 300) }; }
  return { status: res.status(), json };
}

function headingsFromHtml(html) {
  const h = String(html || "");
  const titles = [];
  const title = h.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (title) titles.push("title:" + title[1].trim().slice(0, 120));
  const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m;
  while ((m = re.exec(h)) && titles.length < 16) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t) titles.push(t.slice(0, 140));
  }
  return {
    bytes: h.length,
    looksHtml: /<html[\s>]/i.test(h) || /<!doctype html/i.test(h),
    looksPdf: h.startsWith("%PDF"),
    headings: titles,
    snippet: h.replace(/\s+/g, " ").trim().slice(0, 280),
  };
}

const api = {
  slo: await getJson("/api/public/slo-checkout"),
  finance8: await getJson(`/api/read/finance-os?client_id=${IDS.eight}`),
  invoices8: await getJson(`/api/read/invoices?client_id=${IDS.eight}`),
  invoicesOpen: await getJson("/api/read/invoices?status=open"),
  progress11: await getJson(`/api/read/client-progress?client_id=${IDS.eleven}`),
  portal11: await getJson(`/api/read/portal-summary?client_id=${IDS.eleven}`),
  dash9: await getJson(`/api/dashboard/client?id=${IDS.nine}`),
  repair9: await getJson(`/api/read/repair-cases?client_id=${IDS.nine}`),
  docs11del: await getJson(`/api/read/documents?client_id=${IDS.eleven}&kind=deliverable`),
  docs8del: await getJson(`/api/read/documents?client_id=${IDS.eight}&kind=deliverable`),
  uwiq8: await getJson(`/api/read/underwrite?client_id=${IDS.eight}`),
};

function slimSlo(j) {
  const x = j.json || {};
  return { status: j.status, ok: x.ok, priceCents: x.priceCents, priceDisplay: x.priceDisplay, next: x.next, name: x.name };
}
function slimInv(j) {
  const items = j.json?.items || j.json?.rows || [];
  return { status: j.status, count: items.length, sample: items.slice(0, 8).map((r) => ({
    id: r.id, client_id: r.client_id, client_name: r.client_name, status: r.status,
    amount_due: r.amount_due, amount_paid: r.amount_paid, balance_due: r.balance_due, source: r.source,
  })) };
}
function slimProg(j) {
  const x = j.json || {};
  return {
    status: j.status, ok: x.ok, stage: x.stage, nextStep: x.nextStep,
    waypointCount: Array.isArray(x.waypoints) ? x.waypoints.length : null,
    waypoints: Array.isArray(x.waypoints) ? x.waypoints.slice(0, 12).map((w) => w.label || w.title || w.key || w) : x.waypoints,
    deliverables: x.deliverables,
    paidServices: x.paidServices,
  };
}
function slimPortal(j) {
  const x = j.json || {};
  const docs = x.documents || {};
  return {
    status: j.status, ok: x.ok, stage: x.stage, prequal_display: x.prequal_display,
    invoice_due: x.invoice_due, payments: x.payments,
    docKeys: docs && typeof docs === "object" ? Object.keys(docs) : docs,
    documents: Array.isArray(docs) ? docs.slice(0, 12).map((d) => d.title || d.kind || d) : undefined,
  };
}
function slimDash9(j) {
  const x = j.json || {};
  const c = x.client || {};
  return {
    status: j.status,
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    next_action: x.next_action,
    inquiry_removal_case: x.inquiry_removal_case && {
      id: x.inquiry_removal_case.id, status: x.inquiry_removal_case.status, stage: x.inquiry_removal_case.stage, bureau: x.inquiry_removal_case.bureau,
    },
    tasks: (x.tasks || []).slice(0, 8).map((t) => ({ title: t.title, status: t.status, owner_role: t.owner_role })),
    crs_count: (x.crs_results || []).length,
    invoice_count: (x.invoices || []).length,
  };
}
function slimRepair(j) {
  const x = j.json || {};
  return {
    status: j.status, ok: x.ok,
    file: x.file && { id: x.file.id, status: x.file.status, stage: x.file.stage, client_id: x.file.client_id },
    letterCount: Array.isArray(x.letters) ? x.letters.length : null,
    itemCount: Array.isArray(x.items) ? x.items.length : null,
    rounds: x.rounds,
    can_send: x.can_send,
    timelineCount: Array.isArray(x.timeline) ? x.timeline.length : null,
    signer_name: x.signer_name, signed_at: x.signed_at,
  };
}
function slimDocs(j) {
  const items = j.json?.items || [];
  return { status: j.status, count: items.length, titles: items.map((d) => ({ title: d.title, mime_type: d.mime_type, kind: d.kind, subtype: d.subtype, byte_size: d.byte_size })) };
}
function slimUwiq(j) {
  const x = j.json || {};
  return {
    status: j.status, ok: x.ok, tradelineSource: x.tradelineSource, engine: x.engine,
    suggestionCount: Array.isArray(x.suggestions) ? x.suggestions.length : null,
    caveats: x.caveats,
    dataCompleteness: x.dataCompleteness,
  };
}

const htmlIds = [
  "9ead664c-4e05-436e-94c4-7e13a77dbc65",
  "0d0066d5-f31b-47f4-95ab-670af20e9ebb",
  "5ed5e2b8-c963-4da9-8807-ed164af891cf",
  "ecc91d68-416d-47fb-8852-6a7af25e9d92",
];
const goldReads = [];
for (const id of htmlIds) {
  const mint = await request.get(`${BASE}/api/documents-download?id=${id}`);
  const mintJson = await mint.json().catch(() => ({}));
  const download = mintJson?.document?.download;
  const path = typeof download === "string" ? download : download?.url || download?.href || download?.path;
  const row = {
    id,
    title: mintJson?.document?.title,
    mime_type: mintJson?.document?.mime_type,
    mintStatus: mint.status(),
    downloadKeys: download && typeof download === "object" ? Object.keys(download) : typeof download,
  };
  if (typeof path === "string" && path.startsWith("/")) {
    const fileRes = await request.get(BASE + path);
    row.fileStatus = fileRes.status();
    row.contentType = fileRes.headers()["content-type"];
    row.headings = headingsFromHtml(await fileRes.text());
  } else {
    row.noPath = true;
    row.downloadType = typeof download;
  }
  goldReads.push(row);
}

const page = await context.newPage();
async function shot(path, key, waitMs = 5000) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(waitMs);
  const body = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  await page.screenshot({ path: `${OUT}/${key}.png`, fullPage: false });
  return { url: page.url(), title: await page.title(), body: body.slice(0, 3500) };
}

const shots = {};
shots.ccp9b = await shot(`/app/client-control-panel.html?id=${IDS.nine}`, "ccp9b", 8000);
shots.ccp8b = await shot(`/app/client-control-panel.html?id=${IDS.eight}`, "ccp8b", 5000);
await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(800);
shots.ccp8b_scroll = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 2500);
await page.screenshot({ path: `${OUT}/ccp8b-door.png`, fullPage: false });

shots.finance8 = await shot(`/app/finance-os.html?client_id=${IDS.eight}`, "finance8", 5000);
shots.portal11b = await shot(`/app/client-portal.html?id=${IDS.eleven}`, "portal11b", 5000);
await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll("h1,h2,h3,h4,section,.card")).find((n) => /what you own|progress|download/i.test(n.innerText || ""));
  if (el) el.scrollIntoView();
  else window.scrollTo(0, 1800);
});
await page.waitForTimeout(800);
shots.portal11_own = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(2200, 5200);
await page.screenshot({ path: `${OUT}/portal11-own.png`, fullPage: false });

shots.progress11_cid = await shot(`/progress.html?client_id=${IDS.eleven}`, "progress11-cid", 4000);
shots.docs11 = await shot(`/app/documents.html?client_id=${IDS.eleven}`, "docs11", 4000);
shots.ops_ar = await shot(`/app/ops-admin.html`, "ops_ar2", 4000);
await page.evaluate(() => {
  const el = document.querySelector("#zone-money") || document.body;
  const t = Array.from(document.querySelectorAll("*")).find((n) => /AR \+ Collections|unpaid invoice/i.test(n.textContent || "") && (n.textContent || "").length < 80);
  if (t) t.scrollIntoView();
});
await page.waitForTimeout(800);
shots.ops_ar_table = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const arIdx = shots.ops_ar_table.search(/AR \+|unpaid invoice|No unpaid/i);
shots.ops_ar_snip = arIdx >= 0 ? shots.ops_ar_table.slice(arIdx, arIdx + 1200) : shots.ops_ar_table.slice(-1200);
await page.screenshot({ path: `${OUT}/ops_ar-table.png`, fullPage: false });

await browser.close();

const out = {
  slo: slimSlo(api.slo),
  finance8: { status: api.finance8.status, keys: api.finance8.json && Object.keys(api.finance8.json), error: api.finance8.json?.error, ok: api.finance8.json?.ok },
  invoices8: slimInv(api.invoices8),
  invoicesOpen: slimInv(api.invoicesOpen),
  progress11: slimProg(api.progress11),
  portal11: slimPortal(api.portal11),
  dash9: slimDash9(api.dash9),
  repair9: slimRepair(api.repair9),
  docs11del: slimDocs(api.docs11del),
  docs8del: slimDocs(api.docs8del),
  uwiq8: slimUwiq(api.uwiq8),
  goldReads,
  shots: {
    ccp9b: { url: shots.ccp9b.url, body: shots.ccp9b.body },
    ccp8b: { url: shots.ccp8b.url, body: shots.ccp8b.body.slice(0, 2200) },
    ccp8b_scroll: shots.ccp8b_scroll,
    finance8: { url: shots.finance8.url, body: shots.finance8.body.slice(0, 2200) },
    portal11b: shots.portal11b.body.slice(0, 1800),
    portal11_own: shots.portal11_own,
    progress11_cid: { url: shots.progress11_cid.url, body: shots.progress11_cid.body.slice(0, 800) },
    docs11: shots.docs11.body.slice(0, 1600),
    ops_ar_snip: shots.ops_ar_snip,
  },
};
writeFileSync(`${OUT}/followup.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
