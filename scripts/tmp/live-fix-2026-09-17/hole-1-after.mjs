// HOLE 1 AFTER-CHECK — look only. Read-only SELECTs, GET-only browser.
// Every non-GET request from the page is blocked. Nothing is clicked.
// The only write is the owner session row createSession() makes, the same
// pattern as scripts/tmp/live-prove-no-send.mjs.
//
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//        scripts/tmp/live-fix-2026-09-17/hole-1-after.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
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
const ANALYSIS = ["credit_analysis_report", "credit_optimization_roadmap", "funding_snapshot", "bank_lender_match_list"];
const SRC = "live-fix-2026-09-17:hole-1:%";
mkdirSync(OUT, { recursive: true });

// ---------- database, read only ----------
const c = await pool().connect();
const dbOut = {};
try {
  await c.query("BEGIN READ ONLY");
  dbOut.t0 = (await c.query(
    `SELECT min(created_at) AS t0 FROM document_versions WHERE source_event_id LIKE $1`, [SRC])).rows[0].t0;
  dbOut.deliverables = (await c.query(
    `SELECT client_id, subtype, title, mime_type, current_version, byte_size, delivery_status,
            metadata->>'engine' AS engine, id
       FROM documents WHERE client_id = ANY($1::uuid[]) AND kind = 'deliverable'
      ORDER BY client_id, subtype, title`, [ALL])).rows;
  dbOut.analysisVersions = (await c.query(
    `SELECT d.client_id, d.subtype, v.version, v.mime_type, v.byte_size, v.generated_by,
            v.source_event_id, v.created_at
       FROM document_versions v JOIN documents d ON d.id = v.document_id
      WHERE d.client_id = ANY($1::uuid[]) AND d.subtype = ANY($2::text[])
      ORDER BY d.client_id, d.subtype, v.version`, [ALL, ANALYSIS])).rows;
  dbOut.docCounts = (await c.query(
    `SELECT client_id, count(*)::int AS n FROM documents WHERE client_id = ANY($1::uuid[])
      GROUP BY client_id`, [ALL])).rows;
  // No-send proof: nothing queued and no event for these three clients since the save began.
  dbOut.messagesSinceT0 = (await c.query(
    `SELECT client_id, status, created_at FROM messages
      WHERE client_id = ANY($1::uuid[]) AND created_at >= $2::timestamptz - interval '1 minute'`,
    [ALL, dbOut.t0])).rows;
  dbOut.eventsSinceT0 = (await c.query(
    `SELECT client_id, name, created_at FROM events
      WHERE client_id = ANY($1::uuid[]) AND created_at >= $2::timestamptz - interval '1 minute'`,
    [ALL, dbOut.t0])).rows;
  dbOut.custom = (await c.query(
    `SELECT id, custom_fields->>'funding_letters_delivered_event_id' AS stamp, tags
       FROM clients WHERE id = ANY($1::uuid[])`, [ALL])).rows;
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
const blocked = [];
await context.route("**/*", (route) => {
  const m = route.request().method();
  if (m === "GET" || m === "HEAD") return route.continue();
  blocked.push(`${m} ${route.request().url()}`);
  return route.abort();
});
const request = context.request;
async function getJson(path) {
  const res = await request.get(BASE + path);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { parse_error: true }; }
  return { status: res.status(), json };
}

const live = {};
live.health = (await getJson("/api/health")).json;
live.docs = {};
const toOpen = [];
for (const [name, id] of Object.entries(IDS)) {
  const r = await getJson(`/api/read/documents?client_id=${id}`);
  const rows = r.json.rows || r.json.items || [];
  const uiq = rows.filter((d) => ANALYSIS.includes(d.subtype));
  live.docs[name] = {
    status: r.status,
    count: rows.length,
    deliverables: rows.filter((d) => d.kind === "deliverable").length,
    uwiqFiles: uiq.length,
    goldHtml: uiq.filter((d) => /html/i.test(d.mime_type || "")).length,
  };
  if (name !== "nine") {
    const pick = uiq.find((d) => d.subtype === "credit_analysis_report");
    if (pick) toOpen.push({ name, id: pick.id, title: pick.title });
  }
}

live.opened = [];
for (const d of toOpen) {
  const mint = await getJson(`/api/documents-download?id=${d.id}`);
  const dl = mint.json?.document?.download;
  const path = typeof dl === "string" ? dl : dl?.url || dl?.path;
  const row = { client: d.name, title: d.title, mintStatus: mint.status, mime: mint.json?.document?.mime_type };
  if (typeof path === "string") {
    const f = await request.get(path.startsWith("http") ? path : BASE + path);
    const body = await f.text();
    row.fileStatus = f.status();
    row.contentType = f.headers()["content-type"];
    row.bytes = body.length;
    row.isHtml = /^\s*<!doctype html/i.test(body);
    row.pageTitle = (body.match(/<title>([^<]*)<\/title>/i) || [])[1] || null;
  }
  live.opened.push(row);
}

// Documents screen, look only. A red box is drawn on the UnderwriteIQ count
// from its real position in the page, with a one-line legend.
const page = await context.newPage();
live.screens = {};
for (const [key, id, caption] of [
  ["after-docs8", IDS.eight, "1  #8 UnderwriteIQ deliverables: was 0, now filled"],
  ["after-docs11", IDS.eleven, "1  #11 UnderwriteIQ deliverables: now the gold HTML pages"],
]) {
  await page.goto(`${BASE}/app/documents.html?client_id=${id}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(6000);
  const body = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const m = body.match(/UnderwriteIQ deliverables\s*(\d+)/i);
  const box = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (/UnderwriteIQ deliverables/i.test(n.textContent || "")) {
        let el = n.parentElement;
        for (let i = 0; i < 3 && el && el.parentElement; i++) {
          if (/\d/.test(el.innerText || "") && el.getBoundingClientRect().width > 120) break;
          el = el.parentElement;
        }
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
      }
    }
    return null;
  });
  if (box) {
    await page.evaluate(({ b, cap }) => {
      const mk = (css, text) => {
        const d = document.createElement("div");
        d.setAttribute("style", `position:absolute;z-index:2147483647;pointer-events:none;${css}`);
        if (text) d.textContent = text;
        document.body.appendChild(d);
      };
      mk(`left:${b.x - 6}px;top:${b.y - 6}px;width:${b.w + 12}px;height:${b.h + 12}px;border:4px solid #ff2828;border-radius:6px;`);
      mk(`left:${b.x - 18}px;top:${b.y - 22}px;width:26px;height:26px;background:#ff2828;color:#fff;font:bold 16px/26px sans-serif;text-align:center;border-radius:13px;`, "1");
      mk(`left:${scrollX + 16}px;top:${scrollY + 16}px;padding:8px 12px;background:rgba(0,0,0,.85);color:#fff;font:bold 15px/1.3 sans-serif;border:2px solid #ff2828;border-radius:6px;`, cap);
    }, { b: box, cap: caption });
  }
  await page.screenshot({ path: `${OUT}/${key}.png` });
  live.screens[key] = { url: page.url(), uwiqCount: m ? Number(m[1]) : null, marked: Boolean(box) };
}
await browser.close();

const out = { at: new Date().toISOString(), no_send: true, db: dbOut, live, blocked };
writeFileSync(`${OUT}/after.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  t0: dbOut.t0,
  docCounts: dbOut.docCounts,
  deliverablesByClient: dbOut.deliverables.reduce((m, d) => {
    const k = d.client_id.slice(0, 8);
    (m[k] ||= []).push(`${d.subtype} v${d.current_version} ${d.mime_type}${d.engine ? " " + d.engine : ""}`);
    return m;
  }, {}),
  analysisVersions11: dbOut.analysisVersions
    .filter((v) => v.client_id === IDS.eleven)
    .map((v) => `${v.subtype} v${v.version} ${v.mime_type} ${String(v.source_event_id || "").startsWith("live-fix") ? "backfill" : "old"}`),
  messagesSinceT0: dbOut.messagesSinceT0.length,
  eventsSinceT0: dbOut.eventsSinceT0.length,
  stamps: dbOut.custom.map((r) => ({ id: r.id.slice(0, 8), stamp: r.stamp })),
  live: { health: live.health, docs: live.docs, opened: live.opened, screens: live.screens },
  blockedRequests: blocked.length,
}, null, 2));
await close();
