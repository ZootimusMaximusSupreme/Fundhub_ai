// Live BETTER walk: Blueprint / Course / Portal / SLO. Tester only. No product edits.
import { loadEnv } from "/Users/chrisstanbridge/Developer/fundhub-platform/scripts/load-env.mjs";
loadEnv();
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { db } from "/Users/chrisstanbridge/Developer/fundhub-platform/src/db.mjs";
import { createSession, revokeSession } from "/Users/chrisstanbridge/Developer/fundhub-platform/src/auth/session.mjs";
import {
  createAccountSession,
  revokeAccountSession
} from "/Users/chrisstanbridge/Developer/fundhub-platform/src/auth/account-session.mjs";

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const OUT = "/tmp/e2e-2026-09-18-blueprint";
const IDS = {
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  twelve: "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f"
};
const SLO_EMAIL = "stanbridgejchris+sim-slo-20260918@gmail.com";

mkdirSync(OUT, { recursive: true });

function clip(text, n = 3200) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);
}

function headingsFromHtml(h) {
  const html = String(h || "");
  const titles = [];
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (title) titles.push("title:" + title[1].trim().slice(0, 140));
  const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m;
  while ((m = re.exec(html)) && titles.length < 18) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t) titles.push(t.slice(0, 160));
  }
  return {
    bytes: html.length,
    looksHtml: /<html[\s>]/i.test(html) || /<!doctype html/i.test(html),
    looksPdf: html.startsWith("%PDF"),
    placeholder: /PLACEHOLDER\. THIS IS NOT THE REAL AGREEMENT TEXT/i.test(html),
    headings: titles,
    snippet: html.replace(/\s+/g, " ").trim().slice(0, 280)
  };
}

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

const clients = (
  await db.query(
    `SELECT id, first_name, last_name, email, funded, funded_amount, outcome_tier
       FROM clients WHERE id = ANY($1::uuid[])`,
    [[IDS.eleven, IDS.twelve]]
  )
).rows;

const accts = (
  await db.query(
    `SELECT id, org_id, kind, email, name, status, client_id
       FROM accounts
      WHERE client_id = ANY($1::uuid[]) AND kind = 'client' AND status = 'active'`,
    [[IDS.eleven, IDS.twelve]]
  )
).rows;

const entitlements = (
  await db.query(
    `SELECT client_id, entitlement_code, revoked_at, granted_at, expires_at
       FROM entitlements
      WHERE client_id = ANY($1::uuid[])
      ORDER BY client_id, granted_at DESC NULLS LAST`,
    [[IDS.eleven, IDS.twelve]]
  )
).rows;

const waypoints = (
  await db.query(
    `SELECT client_id, key, title, state, due_at
       FROM client_waypoints
      WHERE client_id = ANY($1::uuid[])
      ORDER BY client_id, key`,
    [[IDS.eleven, IDS.twelve]]
  )
).rows;

const docsDb = (
  await db.query(
    `SELECT d.id, d.client_id, d.document_key, d.kind, d.subtype, d.title, d.mime_type, d.byte_size, d.created_at
       FROM documents d
      WHERE d.client_id = ANY($1::uuid[])
      ORDER BY d.created_at DESC
      LIMIT 120`,
    [[IDS.eleven, IDS.twelve]]
  )
).rows;

const contractRows = (
  await db.query(
    `SELECT client_id, template_key, title, status, signed_at,
            (rendered_body ~* $2) AS has_placeholder
       FROM contracts
      WHERE client_id = ANY($1::uuid[])
      ORDER BY created_at DESC`,
    [[IDS.eleven, IDS.twelve], "PLACEHOLDER\\. THIS IS NOT THE REAL AGREEMENT TEXT"]
  )
).rows;

const money = (
  await db.query(
    `SELECT client_id, amount_cents, currency, status, description, purpose, paid_at
       FROM payment_links
      WHERE client_id = ANY($1::uuid[])
      ORDER BY created_at DESC NULLS LAST
      LIMIT 30`,
    [[IDS.eleven, IDS.twelve]]
  )
).rows;

const { token: staffTok } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });
const clientToks = {};
for (const a of accts) {
  const who = a.client_id === IDS.eleven ? "eleven" : a.client_id === IDS.twelve ? "twelve" : a.client_id;
  clientToks[who] = {
    accountId: a.id,
    orgId: a.org_id,
    email: a.email,
    name: a.name,
    clientId: a.client_id,
    token: (await createAccountSession(db, { accountId: a.id, orgId: a.org_id })).token
  };
}

const browser = await chromium.launch({ headless: true });
const dump = {
  at: new Date().toString(),
  staff: { email: staffRow.email, role: staffRow.role, name: staffRow.name, status: staffRow.status },
  clients,
  accounts: accts.map((a) => ({ id: a.id, email: a.email, name: a.name, client_id: a.client_id, status: a.status })),
  entitlements,
  waypoints,
  money: money.map((m) => ({
    client_id: m.client_id,
    amount_cents: m.amount_cents,
    status: m.status,
    description: m.description,
    purpose: m.purpose,
    paid_at: m.paid_at
  })),
  docsDb: docsDb.map((d) => ({
    id: d.id,
    client_id: d.client_id,
    title: d.title,
    mime_type: d.mime_type,
    kind: d.kind,
    subtype: d.subtype,
    document_key: d.document_key,
    byte_size: d.byte_size
  })),
  contracts: contractRows,
  pages: {},
  api: {},
  goldReads: [],
  sloPost: null,
  outbound: { magic_link_sent: false, extra_email: false, sms: false }
};

function staffCookies(token) {
  return [
    { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
    { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true }
  ];
}

async function newCtx({ cookieToken, ls } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  if (cookieToken) await ctx.addCookies(staffCookies(cookieToken));
  if (ls) {
    await ctx.addInitScript((payload) => {
      try {
        localStorage.setItem("fh_token", payload.token);
        localStorage.setItem("fh_role", "client");
        localStorage.setItem("fh_account", JSON.stringify(payload.account));
        localStorage.removeItem("fh_demo");
        localStorage.removeItem("fh_demo_staff");
      } catch (e) {}
    }, ls);
  }
  return ctx;
}

function slimJson(json) {
  if (!json || typeof json !== "object") return json;
  const out = { ok: json.ok, error: json.error };
  for (const k of [
    "name",
    "priceCents",
    "priceDisplay",
    "next",
    "checkout",
    "notices",
    "prequal_amount",
    "prequal_display",
    "scores",
    "soft_pull_complete",
    "stage",
    "checklist",
    "waypoints",
    "progress",
    "summary"
  ]) {
    if (json[k] !== undefined) out[k] = json[k];
  }
  if (json.client) out.client = { id: json.client.id, name: json.client.name, email: json.client.email };
  if (Array.isArray(json.entitlements)) {
    out.entitlements = json.entitlements.slice(0, 20).map((e) => ({
      code: e.code,
      name: e.name,
      status: e.status,
      active: e.active
    }));
  }
  if (Array.isArray(json.documents)) {
    out.documents = json.documents.slice(0, 40).map((d) => ({
      id: d.id,
      title: d.title,
      mime_type: d.mime_type,
      kind: d.kind,
      document_key: d.document_key,
      download: d.download ? { hasUrl: !!d.download.url } : null
    }));
  }
  if (Array.isArray(json.items)) out.items = json.items.slice(0, 30);
  if (Array.isArray(json.rows)) out.rows = json.rows.slice(0, 30);
  if (json.deliverables) {
    out.deliverable_count = Array.isArray(json.deliverables) ? json.deliverables.length : json.deliverables;
  }
  out.keys = Object.keys(json);
  return out;
}

async function getJson(ctx, path) {
  const res = await ctx.request.get(BASE + path);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { parse_error: true, snippet: text.slice(0, 240) };
  }
  return { status: res.status(), json: slimJson(json) };
}

async function portalState(page) {
  return page.evaluate(() => {
    const greet =
      document.querySelector("#greet, .greet, [data-greet]")?.innerText ||
      Array.from(document.querySelectorAll("h1, h2, p, .welcome"))
        .map((e) => (e.innerText || "").trim())
        .find((t) => /welcome/i.test(t)) ||
      "";
    const picker = (document.querySelector("#client-picker, .client-chip, [data-client-name]") || {}).innerText || "";
    const own = (document.getElementById("own-list") || {}).innerText || "";
    const tiles = Array.from(document.querySelectorAll("article.tile")).map((t) => ({
      key: t.getAttribute("data-tile"),
      title: (t.querySelector(".tt") || {}).innerText || "",
      lock: (t.querySelector(".lockrow") || {}).innerText || "",
      price: (t.querySelector(".tp") || {}).innerText || "",
      open: t.classList.contains("is-open") || t.classList.contains("unlocked"),
      classes: t.className,
      modules: Array.from(t.querySelectorAll(".tc-mod summary, .tile-course summary")).map((s) =>
        (s.innerText || "").trim()
      ),
      courseHidden: t.querySelector(".tile-course") ? t.querySelector(".tile-course").hidden : null,
      buttons: Array.from(t.querySelectorAll("button"))
        .map((b) => (b.innerText || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    }));
    const fatal = (() => {
      const e = document.querySelector("#fatal:not(.hidden), .fatal");
      return e && e.offsetParent !== null ? e.innerText.trim().slice(0, 240) : null;
    })();
    return {
      title: document.title,
      url: location.href,
      greet: greet.replace(/\s+/g, " ").trim().slice(0, 240),
      picker: picker.replace(/\s+/g, " ").trim().slice(0, 200),
      bodyHead: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1600),
      own: own.replace(/\s+/g, " ").trim().slice(0, 1800),
      tiles,
      fatal,
      signIn: !!Array.from(document.querySelectorAll("button, a")).find((b) =>
        /email me a sign-in link/i.test(b.innerText || "")
      )
    };
  });
}

async function progressState(page) {
  return page.evaluate(() => {
    const wp = document.querySelector("#cWaypoints");
    return {
      title: document.title,
      url: location.href,
      h1: (document.querySelector("h1, #hTitle") || {}).innerText || null,
      signInButton: !!Array.from(document.querySelectorAll("button")).find((b) =>
        /Email me a sign-in link/i.test(b.textContent || "")
      ),
      mainVisible: !!document.querySelector("#main:not(.hidden)"),
      fatal: (() => {
        const e = document.querySelector("#fatal:not(.hidden)");
        return e ? e.innerText.trim().slice(0, 240) : null;
      })(),
      checklistRows: wp ? wp.children.length : null,
      checklistText: wp ? wp.innerText.trim().split("\n").filter(Boolean).slice(0, 16) : null,
      body: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1400)
    };
  });
}

async function shot(page, name) {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function walkPortal(key, { cookieToken, ls, path, waitMs = 8000, clickOpenTile }) {
  const ctx = await newCtx({ cookieToken, ls });
  const page = await ctx.newPage();
  const apiHits = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/api/")) apiHits.push(r.status() + " " + u.replace(BASE, "").slice(0, 180));
  });
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(waitMs);
  let before = await portalState(page);
  await shot(page, key + "-before");
  let clicked = null;
  let afterOpen = null;
  let download = null;
  if (clickOpenTile) {
    const btn = page.locator(`article.tile[data-tile="${clickOpenTile}"] button`, { hasText: /^Open$/i }).first();
    const visible = await btn.isVisible().catch(() => false);
    if (visible) {
      await btn.click();
      await page.waitForTimeout(1200);
      afterOpen = await portalState(page);
      clicked = { tile: clickOpenTile, action: "Open", visible: true };
      const mod = page.locator(`article.tile[data-tile="${clickOpenTile}"] details.tc-mod summary`).first();
      if (await mod.isVisible().catch(() => false)) {
        await mod.click();
        await page.waitForTimeout(600);
        clicked.module = await mod.innerText().catch(() => "");
      }
      await shot(page, key + "-open");
    } else {
      clicked = { tile: clickOpenTile, action: "Open", visible: false };
    }
  }
  const dl = page.locator("#own-list a, #own-list button", { hasText: /download/i }).first();
  if (await dl.isVisible().catch(() => false)) {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /documents-download|storage|supabase|signed/i.test(r.url()), { timeout: 8000 }).catch(() => null),
      dl.click().catch(() => null)
    ]);
    download = {
      clicked: true,
      text: await dl.innerText().catch(() => ""),
      response: resp ? { status: resp.status(), url: resp.url().replace(/[?#].*$/, "").slice(0, 160), type: resp.headers()["content-type"] } : null
    };
    await page.waitForTimeout(800);
    await shot(page, key + "-download");
  } else {
    download = { clicked: false };
  }
  const after = await portalState(page);
  const rec = { path, finalUrl: page.url(), apiHits: apiHits.slice(0, 40), before, afterOpen, after, clicked, download };
  dump.pages[key] = rec;
  await ctx.close();
  return rec;
}

async function walkProgress(key, { cookieToken, ls, path, waitMs = 6000 }) {
  const ctx = await newCtx({ cookieToken, ls });
  const page = await ctx.newPage();
  const apiHits = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/api/")) apiHits.push(r.status() + " " + u.replace(BASE, "").slice(0, 180));
  });
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(waitMs);
  const state = await progressState(page);
  await shot(page, key);
  const rec = { path, finalUrl: page.url(), apiHits: apiHits.slice(0, 30), ...state };
  dump.pages[key] = rec;
  await ctx.close();
  return rec;
}

async function walkPublic(key, path, waitMs = 3500) {
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(waitMs);
  const rec = {
    path,
    finalUrl: page.url(),
    title: await page.title(),
    body: clip(await page.locator("body").innerText().catch(() => "")),
    buttons: await page
      .locator("button, a.btn, [role='button']")
      .evaluateAll((els) =>
        els
          .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .slice(0, 20)
      )
      .catch(() => []),
    prices: await page
      .evaluate(() =>
        Array.from(document.querySelectorAll("[data-price], .price, .amount, [id*='price']"))
          .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .slice(0, 16)
      )
      .catch(() => [])
  };
  await shot(page, key);
  dump.pages[key] = rec;
  await ctx.close();
  return rec;
}

// Staff JSON
{
  const ctx = await newCtx({ cookieToken: staffTok });
  const paths = [
    ["/api/health", "health"],
    ["/api/public/slo-checkout", "slo_checkout_get"],
    [`/api/read/entitlements?client_id=${IDS.eleven}`, "eleven_entitlements"],
    [`/api/read/client-progress?client_id=${IDS.eleven}`, "eleven_progress"],
    [`/api/read/portal-summary?client_id=${IDS.eleven}`, "eleven_portal"],
    [`/api/read/documents?client_id=${IDS.eleven}`, "eleven_docs"],
    [`/api/read/underwrite?client_id=${IDS.eleven}`, "eleven_uwiq"],
    [`/api/read/entitlements?client_id=${IDS.twelve}`, "twelve_entitlements"],
    [`/api/read/client-progress?client_id=${IDS.twelve}`, "twelve_progress"],
    [`/api/read/portal-summary?client_id=${IDS.twelve}`, "twelve_portal"],
    [`/api/read/documents?client_id=${IDS.twelve}`, "twelve_docs"],
    [`/api/read/underwrite?client_id=${IDS.twelve}`, "twelve_uwiq"]
  ];
  for (const [path, key] of paths) dump.api[key] = await getJson(ctx, path);

  const goldReads = [];
  const seen = new Set();
  for (const doc of docsDb) {
    const mime = String(doc.mime_type || "");
    const title = String(doc.title || doc.document_key || "");
    const kind = String(doc.kind || "");
    const want =
      /html/i.test(mime) ||
      /html/i.test(kind) ||
      /html/i.test(String(doc.subtype || "")) ||
      /roadmap|gold|snapshot|lender|credit analysis|underwrite|metro|letter|deliverable|agreement|contract/i.test(title) ||
      kind === "deliverable";
    if (!want || seen.has(doc.id) || goldReads.length >= 24) continue;
    seen.add(doc.id);
    const mint = await ctx.request.get(`${BASE}/api/documents-download?id=${doc.id}`);
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
      mintError: mintJson?.error
    };
    if (typeof signedPath === "string" && (signedPath.startsWith("/") || signedPath.startsWith("http"))) {
      const fileUrl = signedPath.startsWith("http") ? signedPath : BASE + signedPath;
      const fileRes = await ctx.request.get(fileUrl);
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
  dump.goldReads = goldReads;
  await ctx.close();
}

const ls11 = clientToks.eleven
  ? {
      token: clientToks.eleven.token,
      account: {
        kind: "client",
        accountId: clientToks.eleven.accountId,
        orgId: clientToks.eleven.orgId,
        email: clientToks.eleven.email,
        name: clientToks.eleven.name,
        clientId: clientToks.eleven.clientId
      }
    }
  : null;
const ls12 = clientToks.twelve
  ? {
      token: clientToks.twelve.token,
      account: {
        kind: "client",
        accountId: clientToks.twelve.accountId,
        orgId: clientToks.twelve.orgId,
        email: clientToks.twelve.email,
        name: clientToks.twelve.name,
        clientId: clientToks.twelve.clientId
      }
    }
  : null;

// Staff portal ?client_id= (not ?id=)
await walkPortal("portal11_staff_clientid", {
  cookieToken: staffTok,
  path: `/app/client-portal.html?client_id=${IDS.eleven}`,
  clickOpenTile: "UWIQ_DELIVERABLES"
});
await walkPortal("portal12_staff_clientid", {
  cookieToken: staffTok,
  path: `/app/client-portal.html?client_id=${IDS.twelve}`,
  clickOpenTile: "FUNDING_MASTERY"
});

// True client view — mint session, no magic-link email
if (ls11) {
  await walkPortal("portal11_client", {
    cookieToken: clientToks.eleven.token,
    ls: ls11,
    path: "/app/client-portal.html",
    clickOpenTile: "UWIQ_DELIVERABLES"
  });
}
if (ls12) {
  await walkPortal("portal12_client", {
    cookieToken: clientToks.twelve.token,
    ls: ls12,
    path: "/app/client-portal.html",
    clickOpenTile: "FUNDING_MASTERY"
  });
}

// Progress: staff ?client_id= first; if bounce, client token (no email)
const p11staff = await walkProgress("progress11_staff_clientid", {
  cookieToken: staffTok,
  path: `/progress.html?client_id=${IDS.eleven}`
});
if (p11staff.signInButton || /portal-login/i.test(p11staff.finalUrl || "") || p11staff.signInButton) {
  if (ls11) {
    await walkProgress("progress11_client", {
      cookieToken: clientToks.eleven.token,
      ls: ls11,
      path: "/progress.html"
    });
  }
} else if (ls11) {
  await walkProgress("progress11_client", {
    cookieToken: clientToks.eleven.token,
    ls: ls11,
    path: "/progress.html"
  });
}

const p12staff = await walkProgress("progress12_staff_clientid", {
  cookieToken: staffTok,
  path: `/progress.html?client_id=${IDS.twelve}`
});
if (ls12) {
  await walkProgress("progress12_client", {
    cookieToken: clientToks.twelve.token,
    ls: ls12,
    path: "/progress.html"
  });
}

await walkPublic("slo_home", "/slo/");
await walkPublic("slo_pay", "/slo/pay.html");
await walkPublic("slo_pull", "/slo/pull.html");

// POST slo-checkout once. Do not pay. Do not submit pull.
{
  const ctx = await newCtx();
  const res = await ctx.request.post(BASE + "/api/public/slo-checkout", {
    data: { email: SLO_EMAIL, first_name: "Sim", last_name: "SloEighteen" },
    headers: { "content-type": "application/json" }
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { parse_error: true, snippet: text.slice(0, 240) };
  }
  let checkoutHead = null;
  if (json?.checkoutUrl && typeof json.checkoutUrl === "string") {
    const u = new URL(json.checkoutUrl);
    const head = await ctx.request.get(json.checkoutUrl, { maxRedirects: 0 }).catch(() => null);
    checkoutHead = {
      host: u.host,
      pathStart: u.pathname.slice(0, 80),
      status: head ? head.status() : null,
      locationHost: head ? (() => {
        const loc = head.headers()["location"];
        if (!loc) return null;
        try {
          return new URL(loc, json.checkoutUrl).host;
        } catch {
          return "bad-location";
        }
      })() : null
    };
  }
  dump.sloPost = {
    status: res.status(),
    ok: json?.ok,
    error: json?.error,
    ref: json?.ref ? String(json.ref).slice(0, 40) : null,
    priceCents: json?.priceCents,
    next: json?.next,
    hasCheckoutUrl: !!json?.checkoutUrl,
    checkoutHead
  };
  await ctx.close();
}

let sloBuyer = null;
try {
  sloBuyer = (
    await db.query(
      `SELECT c.id, c.email, c.first_name, c.last_name, pl.status, pl.amount_cents, pl.description, pl.purpose
         FROM clients c
         LEFT JOIN payment_links pl ON pl.client_id = c.id
        WHERE lower(c.email) = lower($1)
        ORDER BY pl.created_at DESC NULLS LAST
        LIMIT 5`,
      [SLO_EMAIL]
    )
  ).rows;
} catch (e) {
  sloBuyer = [{ error: String(e.message || e).slice(0, 200) }];
}
dump.sloBuyer = sloBuyer;

await browser.close();

const revoked = { staff: false, clients: {} };
try {
  revoked.staff = await revokeSession(db, staffTok);
} catch (e) {
  revoked.staff = String(e.message || e).slice(0, 80);
}
for (const [k, v] of Object.entries(clientToks)) {
  try {
    revoked.clients[k] = await revokeAccountSession(db, v.token);
  } catch (e) {
    revoked.clients[k] = String(e.message || e).slice(0, 80);
  }
}
dump.revoked = { staff: !!revoked.staff, clients: Object.fromEntries(Object.entries(revoked.clients).map(([k, v]) => [k, !!v])) };

writeFileSync(`${OUT}/dump.json`, JSON.stringify(dump, null, 2));
const summary = {
  at: dump.at,
  health: dump.api.health,
  sloGet: dump.api.slo_checkout_get,
  sloPost: dump.sloPost,
  sloBuyer: dump.sloBuyer,
  entitlements,
  waypoints,
  elevenPortalApi: dump.api.eleven_portal,
  twelvePortalApi: dump.api.twelve_portal,
  elevenProgressApi: dump.api.eleven_progress,
  twelveProgressApi: dump.api.twelve_progress,
  gold: dump.goldReads.map((g) => ({
    client_id: g.client_id,
    title: g.title,
    mime_type: g.mime_type,
    kind: g.kind,
    looksPdf: g.looksPdf,
    contentType: g.contentType,
    placeholder: g.headings?.placeholder,
    headings: g.headings?.headings,
    mintOk: g.mintOk,
    mintError: g.mintError
  })),
  pages: Object.fromEntries(
    Object.entries(dump.pages).map(([k, v]) => [
      k,
      {
        finalUrl: v.finalUrl,
        greet: v.before?.greet || v.greet,
        own: (v.before?.own || v.after?.own || "").slice(0, 500),
        tiles: (v.before?.tiles || []).map((t) => ({ title: t.title, lock: t.lock, price: t.price, buttons: t.buttons, open: t.open })),
        clicked: v.clicked,
        download: v.download,
        signIn: v.signInButton || v.before?.signIn,
        checklist: v.checklistText,
        body: (v.body || v.before?.bodyHead || "").slice(0, 700)
      }
    ])
  )
};
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
console.log("WROTE", `${OUT}/summary.json`);
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
