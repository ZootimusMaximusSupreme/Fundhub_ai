// Hole 22 — look only. Combo-20260918: documents count and address on live.
// No Send, no Stage, no upload. Every non-GET request in the browser is aborted.
// Database reads run inside BEGIN READ ONLY. Never prints passwords, tokens,
// cookies, SSNs or street addresses (only whether one is there).
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h22-verify.mjs [tag]
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22";
mkdirSync(SHOTS, { recursive: true });
const TAG = process.argv[2] || "verify";
const out = { at: new Date().toISOString(), tag: TAG };

// ---------- live API, as the owner ----------
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h22-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
const cookie = m ? m[1] : null;
out.loginStatus = r.status;
out.gotCookie = Boolean(cookie);
if (!cookie) { console.log(JSON.stringify(out, null, 2)); process.exit(1); }
const H = { cookie: `fundhub_session=${cookie}`, accept: "application/json" };

async function get(path) {
  const a = await fetch(`${BASE}${path}`, { headers: H });
  const d = await a.json().catch(() => null);
  return { status: a.status, d };
}

{
  const { status, d } = await get(`/api/read/repair-cases`);
  const row = (d?.files || []).find((f) => f.client_id === COMBO) || null;
  out.repairList = {
    status,
    comboRow: row && {
      name: row.name, program: row.program, rounds_cap: row.rounds_cap, round: row.round,
      stage_key: row.stage_key, address_ok: row.address_ok, can_send: row.can_send,
      letters_ready: row.letters_ready, chip: row.chip, warnings: row.warnings, docs: row.docs,
    },
    ready: d?.ready ?? null,
  };
}
{
  const { status, d } = await get(`/api/read/repair-cases?client_id=${COMBO}`);
  out.repairDetail = { status, keys: d ? Object.keys(d) : null, sample: d ? JSON.stringify(d).slice(0, 1500) : null };
}
{
  const { status, d } = await get(`/api/read/documents?client_id=${COMBO}&limit=200`);
  const rows = d?.rows || d?.items || d?.data || [];
  const byKind = {};
  for (const x of rows) byKind[`${x.kind}/${x.subtype || "-"}`] = (byKind[`${x.kind}/${x.subtype || "-"}`] || 0) + 1;
  out.documentsApi = { status, count: rows.length, byKind, topKeys: d ? Object.keys(d) : null };
  // Open each file the way the Download button does: mint a short link, fetch it.
  out.opens = [];
  for (const x of rows) {
    const mint = await get(`/api/documents-download?id=${x.id}`);
    const url = mint.d?.document?.download?.url || null;
    let fetched = null;
    if (url) {
      const f = await fetch(url.startsWith("http") ? url : `${BASE}${url}`, { headers: H });
      const buf = Buffer.from(await f.arrayBuffer());
      fetched = {
        status: f.status,
        type: f.headers.get("content-type"),
        bytes: buf.length,
        namesCombo: /Sim Combo-20260918/i.test(buf.toString("latin1")),
      };
    }
    out.opens.push({ subtype: x.subtype, title: x.title, mint: mint.status, fetched });
  }
}

// ---------- live rows, read only ----------
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("BEGIN READ ONLY");
try {
  const q = async (sql, params = []) => {
    await client.query("SAVEPOINT s");
    try {
      const rows = (await client.query(sql, params)).rows;
      await client.query("RELEASE SAVEPOINT s");
      return rows;
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT s");
      return [{ error: e.message }];
    }
  };
  out.db = {};
  out.db.client = (await q(
    `SELECT c.id, c.first_name, c.last_name, c.created_at,
            to_jsonb(c)->>'outcome_tier' AS outcome_tier,
            to_jsonb(c)->'tags' AS tags,
            c.custom_fields->>'funding_letters_delivered_event_id' AS letters_event_id
       FROM clients c WHERE c.id = $1`, [COMBO]))[0] || null;
  out.db.pii = (await q(
    `SELECT count(*)::int AS rows,
            max(jsonb_array_length(addresses))::int AS address_count,
            bool_or(NULLIF(TRIM(COALESCE(addresses->0->>'address_line1', addresses->0->>'addressLine1',
                    addresses->0->>'line1', addresses->0->>'street','')),'') IS NOT NULL) AS has_street,
            bool_or(ssn_enc IS NOT NULL) AS has_ssn, bool_or(dob IS NOT NULL) AS has_dob
       FROM pii_identity WHERE client_id = $1`, [COMBO]))[0];
  out.db.businesses = await q(
    `SELECT name, (NULLIF(TRIM(COALESCE(entity_data->>'address_line1', entity_data->>'addressLine1',
                   entity_data->>'street', entity_data->>'line1','')),'') IS NOT NULL) AS has_street,
            (SELECT array_agg(k) FROM jsonb_object_keys(COALESCE(entity_data,'{}'::jsonb)) k) AS keys
       FROM businesses WHERE client_id = $1`, [COMBO]);
  out.db.documents = await q(
    `SELECT kind, subtype, count(*)::int AS n FROM documents WHERE client_id = $1 GROUP BY 1,2 ORDER BY 1,2`, [COMBO]);
  out.db.crs = await q(
    `SELECT id, created_at, outcome_tier,
            result->>'environment' AS environment,
            jsonb_typeof(result->'scores') AS scores_type
       FROM crs_results WHERE client_id = $1 ORDER BY created_at`, [COMBO]);
  out.db.events = await q(
    `SELECT id, name, created_at, payload->>'source' AS source
       FROM events WHERE client_id = $1 ORDER BY created_at`, [COMBO]);
  out.db.failed = await q(
    `SELECT event_name, handler_name, status, attempts, left(error_message, 300) AS error, first_seen_at
       FROM failed_events WHERE client_id = $1 ORDER BY first_seen_at`, [COMBO]);
  out.db.repair = await q(
    `SELECT program, rounds_cap, status FROM repair_programs WHERE client_id = $1`, [COMBO]);
  out.db.tasks = await q(
    `SELECT title, to_jsonb(t)->>'status' AS status, source_workflow, created_at FROM tasks t WHERE client_id = $1 ORDER BY created_at`, [COMBO]);
  out.db.messages = await q(
    `SELECT channel, template_key, status, created_at FROM messages WHERE client_id = $1 ORDER BY created_at`, [COMBO]);
  out.db.uploads = await q(
    `SELECT count(*)::int AS n FROM documents WHERE client_id = $1 AND kind <> 'deliverable'`, [COMBO]);
} finally {
  await client.query("ROLLBACK");
  await client.end();
}

// ---------- the live screens ----------
const browser = await chromium.launch({ headless: true });
out.passes = [];
for (let i = 1; i <= 2; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "fundhub_session", value: cookie, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true }]);
  const blocked = [];
  await ctx.route("**/*", (route) => {
    const q = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(q.method())) return route.continue();
    blocked.push(`${q.method()} ${new URL(q.url()).pathname}`);
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  await page.click("#tab-repair").catch(() => {});
  await page.waitForTimeout(4000);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("[data-repair-row]")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim()));
  const marks = { repair: false, docs: false };
  marks.repair = await page.evaluate(() => {
    const row = [...document.querySelectorAll("[data-repair-row]")].find((tr) => /Combo-20260918/.test(tr.innerText));
    if (!row) return false;
    row.scrollIntoView({ block: "center" });
    row.style.outline = "3px solid #e00";
    row.style.outlineOffset = "2px";
    const tag = document.createElement("div");
    tag.textContent = "1";
    Object.assign(tag.style, { position: "absolute", background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px", zIndex: 99999 });
    const r = row.getBoundingClientRect();
    tag.style.left = `${r.left + window.scrollX - 26}px`;
    tag.style.top = `${r.top + window.scrollY}px`;
    document.body.appendChild(tag);
    const legend = document.createElement("div");
    legend.textContent = "1 — Sim Combo-20260918 on Specialist Repair: awaiting documents, red \u201cno address on file\u201d";
    Object.assign(legend.style, { position: "fixed", left: "250px", bottom: "12px", background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 10px", zIndex: 99999, maxWidth: "560px" });
    document.body.appendChild(legend);
    return true;
  });
  await page.screenshot({ path: `${SHOTS}/${TAG}-repair-pass${i}.png`, fullPage: false });
  await page.goto(`${BASE}/app/documents.html?client_id=${COMBO}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(4000);
  const docsText = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 1600);
  const docsLook = await page.evaluate(() => {
    const total = document.getElementById("kTotal");
    const uiq = [...document.querySelectorAll(".classcard")].find((c) => /UnderwriteIQ/.test(c.innerText));
    const rowsTxt = [...document.querySelectorAll("#body tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim()).slice(0, 12);
    const box = (el, n) => {
      if (!el) return;
      el.style.outline = "3px solid #e00";
      el.style.outlineOffset = "2px";
      const tag = document.createElement("div");
      tag.textContent = String(n);
      Object.assign(tag.style, { position: "absolute", background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px", zIndex: 99999 });
      const r = el.getBoundingClientRect();
      tag.style.left = `${r.left + window.scrollX}px`;
      tag.style.top = `${r.top + window.scrollY - 24}px`;
      document.body.appendChild(tag);
    };
    box(total && total.closest(".stat"), 1);
    box(uiq, 2);
    const legend = document.createElement("div");
    legend.innerHTML = "1 — Documents total for Sim Combo-20260918<br>2 — UnderwriteIQ deliverables class count";
    Object.assign(legend.style, { position: "fixed", left: "250px", bottom: "12px", background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 10px", zIndex: 99999 });
    document.body.appendChild(legend);
    return { total: total ? total.textContent.trim() : null, uiq: uiq ? uiq.innerText.replace(/\s+/g, " ").trim() : null, rows: rowsTxt };
  });
  marks.docs = true;
  await page.screenshot({ path: `${SHOTS}/${TAG}-documents-pass${i}.png`, fullPage: false });
  out.passes.push({ pass: i, comboRows: rows.filter((t) => /Combo/i.test(t)), docsLook, docsText, marks, blocked });
  await ctx.close();
}
await browser.close();
writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
