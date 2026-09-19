// GET/look-only follow-up. No POST. No Send. No magic-link click.
import { loadEnv } from "../load-env.mjs";
loadEnv();
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { db } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/overnight-slo-blueprint-2026-09-17";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
};

const staffRow = (
  await db.query(
    `SELECT id, org_id, email, role, name FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
    ["chris@fundhub.ai"]
  )
).rows[0];
const elevenName = (
  await db.query(`SELECT id, first_name, last_name FROM clients WHERE id = $1`, [IDS.eleven])
).rows[0];
const chrisClients = (
  await db.query(
    `SELECT id, first_name, last_name FROM clients WHERE id = $1 OR (lower(first_name) = 'chris' AND lower(last_name) LIKE 'stanbridge%') LIMIT 5`,
    [IDS.eleven]
  )
).rows;
const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });

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
  return {
    bytes: h.length,
    looksHtml: /<html[\s>]/i.test(h) || /<!doctype html/i.test(h),
    looksPdf: h.startsWith("%PDF"),
    placeholder: /PLACEHOLDER\. THIS IS NOT THE REAL AGREEMENT TEXT/i.test(h),
    headings: titles,
    snippet: h.replace(/\s+/g, " ").trim().slice(0, 280),
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
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
    json = { parse_error: true, snippet: text.slice(0, 240) };
  }
  return { status: res.status(), json };
}

const portalApi = await getJson(`/api/read/portal-summary?client_id=${IDS.eleven}`);
const eightPortalApi = await getJson(`/api/read/portal-summary?client_id=${IDS.eight}`);
const eightUwiq = await getJson(`/api/read/underwrite?client_id=${IDS.eight}`);
const elevenUwiq = await getJson(`/api/read/underwrite?client_id=${IDS.eleven}`);

function slimUwiq(j) {
  const u = j.json || {};
  const uw = u.underwrite || {};
  const scores = u.report?.scores || uw.scores || portalish(u);
  return {
    status: j.status,
    ok: u.ok,
    keys: Object.keys(u),
    tradelineSource: u.tradelineSource,
    engine: u.engine,
    underwriteKeys: uw && typeof uw === "object" ? Object.keys(uw) : [],
    fundable: uw.fundable,
    combined: uw.combined || uw.approval_amount || uw.realistic,
    scores,
    caveats: u.caveats,
    dataCompleteness: u.dataCompleteness,
  };
}
function portalish(u) {
  return u.scores || null;
}

function slimPortal(j) {
  const x = j.json || {};
  return {
    status: j.status,
    ok: x.ok,
    prequal_amount: x.prequal_amount,
    prequal_display: x.prequal_display,
    scores: x.scores,
    soft_pull_complete: x.soft_pull_complete,
    stage: x.stage,
    advisor: x.advisor,
    docCount: Array.isArray(x.documents) ? x.documents.length : 0,
    deliverableMimes: (x.documents || [])
      .filter((d) => d.kind === "deliverable")
      .map((d) => ({ title: d.title, mime: d.mime_type, subtype: d.subtype, hasDownload: !!(d.download && d.download.url) })),
  };
}

const htmlIds = [
  "9ead664c-4e05-436e-94c4-7e13a77dbc65",
  "8f758f08-853c-4b20-a8cc-d123772c5d06",
];
const packIds = [
  "5ed5e2b8-c963-4da9-8807-ed164af891cf",
  "bd92d874-d296-46ea-b784-af4eac57935f",
  "2ec52972-33da-4741-9883-2efca52f8f03",
  "ecc91d68-416d-47fb-8852-6a7af25e9d92",
];

async function readDoc(id) {
  const mint = await request.get(`${BASE}/api/documents-download?id=${id}`);
  const mintJson = await mint.json().catch(() => ({}));
  const signed = mintJson?.download?.url || mintJson?.url || mintJson?.href || mintJson?.signed_url;
  const out = {
    id,
    mintStatus: mint.status(),
    mintOk: mintJson?.ok,
    mintError: mintJson?.error,
    mintKeys: mintJson && typeof mintJson === "object" ? Object.keys(mintJson) : [],
    downloadKeys: mintJson?.download && typeof mintJson.download === "object" ? Object.keys(mintJson.download) : [],
    hasSigned: typeof signed === "string" && signed.length > 8,
  };
  if (typeof signed === "string" && signed.startsWith("http")) {
    const fileRes = await request.get(signed);
    const ctype = fileRes.headers()["content-type"] || "";
    const buf = await fileRes.body();
    const head = buf.slice(0, 8).toString("latin1");
    const text = head.startsWith("%PDF") ? "" : buf.toString("utf8");
    out.fileStatus = fileRes.status();
    out.contentType = ctype.split(";")[0];
    out.looksPdf = head.startsWith("%PDF");
    out.headings = text ? headingsFromHtml(text) : { bytes: buf.length, looksPdf: true, looksHtml: false };
  } else if (typeof signed === "string" && signed.startsWith("/")) {
    const fileRes = await request.get(BASE + signed);
    const ctype = fileRes.headers()["content-type"] || "";
    const buf = await fileRes.body();
    const head = buf.slice(0, 8).toString("latin1");
    const text = head.startsWith("%PDF") ? "" : buf.toString("utf8");
    out.fileStatus = fileRes.status();
    out.contentType = ctype.split(";")[0];
    out.looksPdf = head.startsWith("%PDF");
    out.headings = text ? headingsFromHtml(text) : { bytes: buf.length, looksPdf: true, looksHtml: false };
  }
  return out;
}

const contracts = [];
for (const id of htmlIds) contracts.push(await readDoc(id));
const packs = [];
for (const id of packIds) packs.push(await readDoc(id));

async function portalShot(path, key, waitMs) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(waitMs);
  const info = await page.evaluate(() => {
    const greeting = document.getElementById("greeting")?.innerText || "";
    const own = document.getElementById("own-list")?.innerText || "";
    const ownT = document.getElementById("own-t")?.innerText || "";
    const tiles = Array.from(document.querySelectorAll(".tt, .tile, [data-tile]"))
      .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 20);
    const locked = Array.from(document.querySelectorAll(".tile, .card, [class*='lock']"))
      .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim())
      .filter((t) => /capital blueprint|metro 2|what you own|not ready|download/i.test(t))
      .slice(0, 20);
    return {
      url: location.href,
      title: document.title,
      greeting,
      ownT,
      own: own.slice(0, 1800),
      tiles,
      locked,
      picker: (document.querySelector("[data-client], .client-chip, .search-chip")?.innerText || "").slice(0, 120),
      body: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 2200),
    };
  });
  const shot = `${OUT}/${key}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  return { ...info, shot };
}

const portal11a = await portalShot(`/app/client-portal.html?id=${IDS.eleven}`, "portal11-wait8", 8000);
const portal11b = await portalShot(`/app/client-portal.html?client_id=${IDS.eleven}`, "portal11-clientid", 5000);
await page.evaluate(() => window.scrollTo(0, 1600));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/portal11-scroll-tiles.png`, fullPage: false });
const tileText = await page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 3500));

await browser.close();

const dump = {
  at: new Date().toISOString(),
  elevenName: elevenName && {
    id: elevenName.id,
    first_name: elevenName.first_name,
    last_name: elevenName.last_name,
    full_name: elevenName.full_name,
    display_name: elevenName.display_name,
  },
  chrisClients: chrisClients.map((r) => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    full_name: r.full_name,
  })),
  portalApi: slimPortal(portalApi),
  eightPortalApi: slimPortal(eightPortalApi),
  eightUwiq: slimUwiq(eightUwiq),
  elevenUwiq: slimUwiq(elevenUwiq),
  contracts,
  packs,
  portal11a,
  portal11b,
  tileText,
};
writeFileSync(`${OUT}/followup.json`, JSON.stringify(dump, null, 2));
console.log("wrote", `${OUT}/followup.json`);
console.log(JSON.stringify(dump, null, 2));
