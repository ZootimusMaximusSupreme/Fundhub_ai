// Hole 22 REVIEWER (not the fixer). Look only, on live.
// Combo-20260918 (567c12ce-...): are the documents real, and is there truly no address?
// - Browser: headless chromium, signs in through the real password form. Every request
//   that is not a GET is aborted, except the one sign-in POST.
// - Database: BEGIN READ ONLY, no SET. Nothing is written.
// - Never prints passwords, tokens, cookies, signed links or address values.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r22-review.mjs <tag>
import { chromium } from "playwright";
import pg from "pg";
import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const NAME = "Sim Combo-20260918";
const TAG = process.argv[2] || "pass";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22/review";
const RAW = "/private/tmp/claude-501/-Users-chrisstanbridge-Developer-fundhub-platform/29675f55-19d2-4df6-b763-23603c0bbb05/scratchpad/r22-files";
mkdirSync(SHOTS, { recursive: true });
mkdirSync(RAW, { recursive: true });
const out = { at: new Date().toISOString(), tag: TAG };

// ---------------- database, read only ----------------
const ADDR_KEY = /(addr|street|zip|postal|city|line_?1|line_?2|state|province|county)/i;
const ADDR_TEXT = /\b\d{2,6}\s+[A-Za-z0-9 .'-]{2,40}\s(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|way|ct|court|pl|place|pkwy|hwy|cir|circle|ter|terrace)\b/i;

function walk(v, path, hits) {
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, hits)); return; }
  if (typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (ADDR_KEY.test(k) && !/(status|statement|state_key|stage|estate|statu|_at$|tier|template)/i.test(k)) {
        const empty = x === null || x === "" || (typeof x === "object" && Object.keys(x).length === 0);
        hits.push({ path: p, kind: "key", filled: !empty, type: Array.isArray(x) ? "array" : typeof x, len: typeof x === "string" ? x.length : Array.isArray(x) ? x.length : null });
      }
      walk(x, p, hits);
    }
    return;
  }
  if (typeof v === "string" && ADDR_TEXT.test(v)) hits.push({ path, kind: "text-looks-like-street", len: v.length });
}

async function dbSnapshot(label) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("BEGIN READ ONLY");
  const snap = { label };
  const q = async (sql, params = []) => {
    await c.query("SAVEPOINT s");
    try { const r = (await c.query(sql, params)).rows; await c.query("RELEASE SAVEPOINT s"); return r; }
    catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 160) }]; }
  };
  try {
    snap.role = (await q("select current_user u"))[0].u;
    await q("select set_config('statement_timeout', '20000', true)"); // transaction-local, not a bare SET
    snap.client = (await q(`select id, first_name, last_name, (to_jsonb(c)->>'email') is not null has_email, created_at from clients c where id=$1`, [COMBO]))[0];
    snap.documents = await q(`select id, kind, subtype, title, to_jsonb(d)->>'status' status, to_jsonb(d)->>'sent_at' sent_at,
                                     to_jsonb(d)->>'storage_path' storage_path_set, to_jsonb(d)->>'size_bytes' size_bytes, created_at
                                from documents d where client_id=$1 order by created_at`, [COMBO]);
    snap.documents = snap.documents.map((d) => ({ ...d, storage_path_set: Boolean(d.storage_path_set) }));
    snap.messages = await q(`select channel, template_key, status, created_at from messages where client_id=$1 order by created_at`, [COMBO]);
    snap.eventsCount = (await q(`select count(*)::int n, max(created_at) last from events where client_id=$1`, [COMBO]))[0];
    snap.eventsAfterBackfill = await q(`select name, created_at from events where client_id=$1 and created_at > '2026-09-18T14:30:00Z' order by created_at`, [COMBO]);
    snap.piiRows = (await q(`select count(*)::int n from pii_identity where client_id=$1`, [COMBO]))[0].n;

    // Every live table that has a client_id column; every Combo row; look for address keys / street-like text.
    const tabs = (await q(`select c.table_name from information_schema.columns c
                             join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
                            where c.column_name='client_id' and c.table_schema='public' and t.table_type='BASE TABLE' order by 1`)).map((r) => r.table_name);
    snap.addressScan = {};
    const clientRow = (await q(`select to_jsonb(c) j from clients c where id=$1`, [COMBO]))[0]?.j;
    { const hits = []; walk(clientRow, "clients", hits); snap.addressScan.clients = { rows: clientRow ? 1 : 0, hits }; }
    for (const t of tabs) {
      const rows = await q(`select to_jsonb(x) j from public."${t}" x where client_id::text=$1`, [COMBO]);
      if (!rows.length) continue;
      if (rows[0].error) { snap.addressScan[t] = { error: rows[0].error }; continue; }
      const hits = [];
      rows.forEach((r, i) => walk(r.j, `${t}[${i}]`, hits));
      snap.addressScan[t] = { rows: rows.length, hits };
    }
    // Rows anywhere that mention Combo by id or email but not through client_id (leads, survey, intake...).
    const email = (await q(`select lower(to_jsonb(c)->>'email') e from clients c where id=$1`, [COMBO]))[0]?.e || null;
    const all = (await q(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`)).map((r) => r.table_name);
    snap.mentions = {};
    for (const t of all) {
      if (tabs.includes(t) || t === "clients") continue;
      const r = await q(`select to_jsonb(x) j from public."${t}" x where to_jsonb(x)::text ilike $1 ${email ? "or lower(to_jsonb(x)::text) like $2" : ""} limit 50`,
        email ? [`%${COMBO}%`, `%${email}%`] : [`%${COMBO}%`]);
      if (!r.length) continue;
      if (r[0].error) { snap.mentions[t] = { error: r[0].error }; continue; }
      const hits = [];
      r.forEach((x, i) => walk(x.j, `${t}[${i}]`, hits));
      snap.mentions[t] = { rows: r.length, hits };
    }
    snap.rowsSince1430 = {};
    for (const t of [...tabs, ...Object.keys(snap.mentions)]) {
      const r = await q(`select count(*)::int n from public."${t}" x where (to_jsonb(x)::text ilike $1)
                           and greatest(coalesce((to_jsonb(x)->>'created_at')::timestamptz, 'epoch'), coalesce((to_jsonb(x)->>'updated_at')::timestamptz, 'epoch')) > '2026-09-18T14:30:00Z'`, [`%${COMBO}%`]);
      if (r[0]?.error) snap.rowsSince1430[t] = r[0].error; else if (r[0]?.n) snap.rowsSince1430[t] = r[0].n;
    }
    snap.crsScores = (await q(`select result->'scores' s from crs_results where client_id=$1 order by created_at desc limit 1`, [COMBO]))[0]?.s ?? null;
    snap.otherClientNames = (await q(`select distinct trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) n from clients where id<>$1`, [COMBO]))
      .map((r) => r.n).filter((n) => n && n.length >= 8);
  } finally { await c.query("ROLLBACK"); await c.end(); }
  return snap;
}

// ---------------- file text ----------------
function pdfText(buf) {
  const s = buf.toString("latin1");
  const parts = [];
  const re = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf("endstream", start);
    if (end < 0) break;
    let raw = buf.subarray(start, end);
    if (/FlateDecode/.test(m[1])) { try { raw = zlib.inflateSync(raw); } catch { try { raw = zlib.inflateRawSync(raw); } catch { continue; } } }
    parts.push(raw.toString("latin1"));
  }
  const src = parts.join("\n") || s;
  const txt = [];
  // text-showing operators only: (literal) Tj and <hex> Tj
  for (const mm of src.matchAll(/(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>)\s*Tj/g)) {
    const t = mm[1];
    txt.push(t.startsWith("<") ? Buffer.from(t.slice(1, -1).replace(/\s/g, ""), "hex").toString("latin1") : t.slice(1, -1).replace(/\\([()\\])/g, "$1"));
  }
  return { pages: ((s + parts.join("\n")).match(/\/Type\s*\/Page(?![s\w])/g) || []).length, text: txt.join(" ").replace(/\s+/g, " ").trim() };
}
function htmlText(buf) {
  return buf.toString("utf8").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// ---------------- run ----------------
out.dbBefore = await dbSnapshot("before");
const otherNames = out.dbBefore.otherClientNames;
const scoreNums = [...new Set((JSON.stringify(out.dbBefore.crsScores || {}).match(/\b[3-8]\d{2}\b/g) || []))];
out.crsScoreNumbers = scoreNums;
delete out.dbBefore.otherClientNames;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const blocked = [];
let signInPosts = 0;
let mainPage = null;
const captured = []; // bodies of files opened by Download
const apiJson = {};
await ctx.route("**/*", async (route) => {
  const r = route.request();
  const u = new URL(r.url());
  if (r.method() === "POST" && u.hostname === "fundhub.ai" && u.pathname === "/api/auth/login" && signInPosts === 0) { signInPosts++; return route.continue(); }
  if (r.method() !== "GET") { blocked.push(`${r.method()} ${u.hostname}${u.pathname}`); return route.abort(); }
  let pg0 = null;
  if (r.isNavigationRequest()) { try { pg0 = r.frame().page(); } catch { pg0 = "new-popup"; } }
  if (mainPage && pg0 && pg0 !== mainPage) {
    const resp = await route.fetch();
    const body = await resp.body();
    captured.push({ host: u.hostname, pathHead: u.pathname.split("/").slice(0, 3).join("/"), status: resp.status(), type: resp.headers()["content-type"] || null, body });
    return route.fulfill({ response: resp, body });
  }
  return route.continue();
});

const page = await ctx.newPage();
mainPage = page;
page.on("response", async (resp) => {
  const u = new URL(resp.url());
  if (u.hostname !== "fundhub.ai" || !u.pathname.startsWith("/api/")) return;
  if (!/repair-cases|documents/.test(u.pathname) || /documents-download/.test(u.pathname)) return;
  try { apiJson[`${u.pathname}${u.search.replace(/token=[^&]+/, "token=***")}`] = await resp.json(); } catch {}
});

// sign in through the real form
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", process.env.STAFF_INITIAL_PASSWORD || "");
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 30_000 }).then((r) => { out.loginStatus = r.status(); }),
  page.click("#go"),
]);
await page.waitForTimeout(2500);
out.signedIn = (await ctx.cookies(BASE)).some((c) => c.name === "fundhub_session");

// ---- documents page ----
await page.goto(`${BASE}/app/documents.html?client_id=${COMBO}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForFunction(() => document.querySelectorAll("#body tr").length > 0, null, { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(2500);
out.docsPage = await page.evaluate(() => ({
  url: location.pathname + location.search,
  total: document.getElementById("kTotal")?.textContent.trim() ?? null,
  classCards: [...document.querySelectorAll(".classcard")].map((c) => c.innerText.replace(/\s+/g, " ").trim()),
  rows: [...document.querySelectorAll("#body tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim()),
  downloadButtons: document.querySelectorAll("#body [data-dl]").length,
  alert: document.getElementById("b-alert")?.innerText?.trim() || null,
}));

// open every Download, one by one
out.downloads = [];
const ids = await page.$$eval("#body [data-dl]", (bs) => bs.map((b) => b.getAttribute("data-dl")));
for (const id of ids) {
  const before = captured.length;
  const popupP = ctx.waitForEvent("page", { timeout: 20_000 }).catch(() => null);
  const mintP = page.waitForResponse((r) => r.url().includes("/api/documents-download") && r.url().includes(id), { timeout: 20_000 }).catch(() => null);
  await page.click(`#body [data-dl="${id}"]`);
  const mint = await mintP;
  const popup = await popupP;
  let rowTitle = await page.evaluate((i) => document.querySelector(`#body [data-dl="${i}"]`)?.closest("tr")?.innerText.replace(/\s+/g, " ").trim().slice(0, 90), id);
  if (popup) { await popup.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {}); }
  for (let k = 0; k < 20 && captured.length === before; k++) await page.waitForTimeout(250);
  const got = captured[before] || null;
  const rec = { id, row: rowTitle, mintStatus: mint ? mint.status() : null, opened: Boolean(got) };
  if (got) {
    const isPdf = /pdf/i.test(got.type || "") || got.body.subarray(0, 5).toString() === "%PDF-";
    const ext = isPdf ? "pdf" : "html";
    writeFileSync(`${RAW}/${TAG}-${id}.${ext}`, got.body);
    const t = isPdf ? pdfText(got.body) : { text: htmlText(got.body) };
    Object.assign(rec, {
      host: got.host, pathHead: got.pathHead, status: got.status, type: got.type, bytes: got.body.length,
      pdfPages: t.pages ?? null, textChars: t.text.length,
      namesComboFull: t.text.includes(NAME), namesCombo: /Combo/i.test(t.text),
      otherClientNamesFound: otherNames.filter((n) => t.text.toLowerCase().includes(n.toLowerCase())),
      crsScoresFound: scoreNums.filter((n) => new RegExp(`\\b${n}\\b`).test(t.text)),
      junk: { undefined: (t.text.match(/\bundefined\b/g) || []).length, NaN: (t.text.match(/\bNaN\b/g) || []).length, null: (t.text.match(/\bnull\b/g) || []).length },
      head: t.text.slice(0, 260),
    });
    // screenshot the opened report with the client name boxed (web-page reports only)
    if (popup && !isPdf) {
      await popup.setViewportSize({ width: 1280, height: 900 }).catch(() => {});
      const marked = await popup.evaluate((name) => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let el = null;
        while (w.nextNode()) { if (w.currentNode.nodeValue.includes(name)) { el = w.currentNode.parentElement; break; } }
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.style.outline = "3px solid #e00"; el.style.outlineOffset = "3px";
        const r = el.getBoundingClientRect();
        const tag = document.createElement("div"); tag.textContent = "1";
        Object.assign(tag.style, { position: "absolute", left: `${r.left + scrollX - 28}px`, top: `${r.top + scrollY - 2}px`, background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px", zIndex: 2147483647 });
        document.body.appendChild(tag);
        const lg = document.createElement("div");
        lg.textContent = `1 — Opened from the Download button: this report names ${name}`;
        Object.assign(lg.style, { position: "fixed", left: "16px", bottom: "16px", background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 10px", zIndex: 2147483647 });
        document.body.appendChild(lg);
        return true;
      }, NAME).catch(() => false);
      if (marked) {
        const slug = (rowTitle || id).replace(/[^a-z]+/gi, "-").toLowerCase().slice(0, 40).replace(/-+$/, "");
        const file = `${SHOTS}/${TAG}-opened-${slug}.png`;
        await popup.screenshot({ path: file });
        rec.shot = file;
      }
    }
  }
  if (popup) await popup.close().catch(() => {});
  out.downloads.push(rec);
}

// mark + shot the documents page
await page.evaluate(() => {
  const legend = [];
  const box = (el, n, text) => {
    if (!el) return;
    el.style.outline = "3px solid #e00"; el.style.outlineOffset = "2px";
    const r = el.getBoundingClientRect();
    const tag = document.createElement("div"); tag.textContent = String(n);
    Object.assign(tag.style, { position: "absolute", left: `${r.left + scrollX - 4}px`, top: `${r.top + scrollY - 26}px`, background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px", zIndex: 2147483647 });
    document.body.appendChild(tag);
    legend.push(`${n} — ${text}`);
  };
  window.scrollTo(0, 0);
  box(document.getElementById("kTotal")?.closest(".stat"), 1, "Documents total for Sim Combo-20260918 (was 0)");
  box([...document.querySelectorAll(".classcard")].find((c) => /UnderwriteIQ/i.test(c.innerText)), 2, "UnderwriteIQ deliverables class count");
  box(document.getElementById("body"), 3, "The report rows, each with its own Download button");
  const lg = document.createElement("div"); lg.innerHTML = legend.join("<br>");
  const up = [...document.querySelectorAll(".classcard")].find((c) => /Uploads/i.test(c.innerText));
  const ur = up ? up.getBoundingClientRect() : { right: 560, top: 560 };
  Object.assign(lg.style, { position: "absolute", left: `${ur.right + scrollX + 30}px`, top: `${ur.top + scrollY + 20}px`, background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 10px", zIndex: 2147483647, maxWidth: "560px" });
  document.body.appendChild(lg);
});
await page.screenshot({ path: `${SHOTS}/${TAG}-documents.png`, fullPage: true });

// ---- repair desk ----
await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForTimeout(2500);
await page.click("#tab-repair").catch(() => {});
await page.waitForFunction(() => document.querySelectorAll("[data-repair-row]").length > 0, null, { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(2000);
out.repairPage = await page.evaluate((id) => {
  const row = document.querySelector(`[data-repair-row="${id}"]`);
  const all = [...document.querySelectorAll("[data-repair-row]")];
  return {
    rowsOnDesk: all.length,
    comboRow: row ? row.innerText.replace(/\s+/g, " ").trim() : null,
    comboRowSaysNoAddress: row ? /no address on file/i.test(row.innerText) : null,
    readyHeader: [...document.querySelectorAll("#pane-repair *")].map((e) => e.children.length === 0 ? e.textContent.trim() : "").filter((t) => /ready/i.test(t)).slice(0, 5),
  };
}, COMBO);
out.repairApiCombo = (() => {
  for (const [k, v] of Object.entries(apiJson)) {
    if (!/repair-cases/.test(k)) continue;
    const f = (v?.files || []).find((x) => x.client_id === COMBO);
    if (f) return { endpoint: k, name: f.name, stage_key: f.stage_key, address_ok: f.address_ok, can_send: f.can_send, letters_ready: f.letters_ready, docs: f.docs, warnings: f.warnings, chip: f.chip };
  }
  return null;
})();
await page.evaluate((id) => {
  const row = document.querySelector(`[data-repair-row="${id}"]`);
  if (!row) return;
  row.scrollIntoView({ block: "center" });
  const legend = [];
  const box = (el, n, text) => {
    el.style.outline = "3px solid #e00"; el.style.outlineOffset = "2px";
    const r = el.getBoundingClientRect();
    const tag = document.createElement("div"); tag.textContent = String(n);
    Object.assign(tag.style, { position: "absolute", left: `${r.left + scrollX - 28}px`, top: `${r.top + scrollY}px`, background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px", zIndex: 2147483647 });
    document.body.appendChild(tag);
    legend.push(`${n} — ${text}`);
  };
  box(row, 1, "Sim Combo-20260918 on the Repair desk");
  const w = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  let el = null;
  while (w.nextNode()) { if (/no address on file/i.test(w.currentNode.nodeValue)) { el = w.currentNode.parentElement; break; } }
  if (el) box(el, 2, "Red line the desk shows for Combo: \u201cno address on file\u201d");
  const lg = document.createElement("div"); lg.innerHTML = legend.join("<br>");
  Object.assign(lg.style, { position: "fixed", left: "260px", bottom: "16px", background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 10px", zIndex: 2147483647, maxWidth: "620px" });
  document.body.appendChild(lg);
}, COMBO);
await page.screenshot({ path: `${SHOTS}/${TAG}-repair.png` });
// open Combo's row (it only expands; every non-GET is aborted anyway) and read what it says about an address
await page.evaluate(() => document.querySelectorAll("body > div[style*='2147483647']").forEach((d) => d.remove()));
await page.click(`[data-repair-row="${COMBO}"] td:first-child`).catch((e) => { out.repairExpandError = e.message.slice(0, 120); });
await page.waitForTimeout(3000);
out.repairExpanded = await page.evaluate((id) => {
  const row = document.querySelector(`[data-repair-row="${id}"]`);
  if (!row) return null;
  const parts = [];
  let n = row.nextElementSibling;
  for (let i = 0; n && i < 3 && !n.hasAttribute("data-repair-row"); i++, n = n.nextElementSibling) parts.push(n);
  const txt = parts.map((p) => p.innerText.replace(/\s+/g, " ").trim()).join(" || ");
  const lines = txt.split(/(?<=[.!?])\s+|\s\u00b7\s|\|\|/).filter((t) => /address|addr|home|mail/i.test(t)).slice(0, 12);
  // box the detail and the first line that talks about an address
  if (parts[0]) {
    parts[0].scrollIntoView({ block: "center" });
    parts[0].style.outline = "3px solid #e00"; parts[0].style.outlineOffset = "2px";
    const r = parts[0].getBoundingClientRect();
    const tag = document.createElement("div"); tag.textContent = "1";
    Object.assign(tag.style, { position: "absolute", left: `${r.left + scrollX - 28}px`, top: `${r.top + scrollY}px`, background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px", zIndex: 2147483647 });
    document.body.appendChild(tag);
    const w = document.createTreeWalker(parts[0], NodeFilter.SHOW_TEXT);
    let el = null;
    while (w.nextNode()) { if (/address/i.test(w.currentNode.nodeValue)) { el = w.currentNode.parentElement; break; } }
    const legend = ["1 \u2014 Combo's row opened on the Repair desk (look only, nothing sent)"];
    if (el) {
      el.style.outline = "3px solid #e00"; el.style.outlineOffset = "2px";
      const r2 = el.getBoundingClientRect();
      const t2 = document.createElement("div"); t2.textContent = "2";
      Object.assign(t2.style, { position: "absolute", left: `${r2.right + scrollX + 8}px`, top: `${r2.top + scrollY - 2}px`, background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px", zIndex: 2147483647 });
      document.body.appendChild(t2);
      legend.push("2 \u2014 What the opened row says about Combo's address");
    }
    const lg = document.createElement("div"); lg.innerHTML = legend.join("<br>");
    Object.assign(lg.style, { position: "fixed", left: "260px", bottom: "16px", background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 10px", zIndex: 2147483647, maxWidth: "620px" });
    document.body.appendChild(lg);
  }
  return { detailChars: txt.length, addressLines: lines, detailHead: txt.slice(0, 900) };
}, COMBO);
await page.screenshot({ path: `${SHOTS}/${TAG}-repair-opened.png` });

await ctx.close();
await browser.close();
out.blockedNonGet = blocked;
out.signInPosts = signInPosts;
out.documentsApi = Object.fromEntries(Object.entries(apiJson).filter(([k]) => /documents/.test(k)).map(([k, v]) => {
  const rows = v?.rows || v?.items || v?.data || v?.documents || [];
  return [k, { topKeys: v ? Object.keys(v) : null, count: Array.isArray(rows) ? rows.length : null }];
}));
out.dbAfter = await dbSnapshot("after");
delete out.dbAfter.otherClientNames;
out.messagesBefore = out.dbBefore.messages.length;
out.messagesAfter = out.dbAfter.messages.length;
writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
