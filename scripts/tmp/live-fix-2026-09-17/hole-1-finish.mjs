// HOLE 1 FINISH — look only. Read-only SELECTs, GET-only browser.
// Every non-GET request is blocked by a route. The only click is the
// Documents screen's class filter tab, which filters rows in the page.
// The only write is the owner session row createSession() makes, same as
// scripts/tmp/live-prove-no-send.mjs.
//
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//        scripts/tmp/live-fix-2026-09-17/hole-1-finish.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { db, pool, close } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/live-fix-2026-09-17/hole-1/finish";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-1";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
};
const NUM = { eight: "#8", nine: "#9", eleven: "#11" };
const ALL = Object.values(IDS);
const ANALYSIS = ["credit_analysis_report", "credit_optimization_roadmap", "funding_snapshot", "bank_lender_match_list"];
const PH = /PLACEHOLDER\. THIS IS NOT THE REAL AGREEMENT TEXT/i;
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

// ---------- database, read only ----------
const c = await pool().connect();
const dbOut = {};
try {
  await c.query("BEGIN READ ONLY");
  dbOut.deliverables = (await c.query(
    `SELECT client_id, subtype, count(*)::int n, string_agg(DISTINCT mime_type, ',') mimes
       FROM documents WHERE client_id = ANY($1::uuid[]) AND kind = 'deliverable'
      GROUP BY client_id, subtype ORDER BY client_id, subtype`, [ALL])).rows;
  dbOut.contracts = (await c.query(
    `SELECT client_id, template_key, status, (rendered_body ~* $2) AS has_placeholder
       FROM contracts WHERE client_id = ANY($1::uuid[]) ORDER BY created_at`,
    [ALL, "PLACEHOLDER\\. THIS IS NOT THE REAL AGREEMENT TEXT"])).rows;
  dbOut.messagesLast24h = (await c.query(
    `SELECT client_id, status, created_at FROM messages
      WHERE client_id = ANY($1::uuid[]) AND created_at >= '2026-09-18T05:54:41Z'`, [ALL])).rows;
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
const blocked = [];
async function freshContext() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1300 } });
  await ctx.addCookies([
    { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
    { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
  ]);
  await ctx.route("**/*", (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD") return route.continue();
    blocked.push(`${m} ${route.request().url()}`);
    return route.abort();
  });
  return ctx;
}
async function getJson(ctx, path) {
  const res = await ctx.request.get(BASE + path);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { parse_error: true }; }
  return { status: res.status(), json };
}
async function fetchDoc(ctx, id) {
  const mint = await getJson(ctx, `/api/documents-download?id=${id}`);
  const dl = mint.json?.document?.download;
  const path = typeof dl === "string" ? dl : dl?.url || dl?.path;
  if (typeof path !== "string") return { mintStatus: mint.status };
  const f = await ctx.request.get(path.startsWith("http") ? path : BASE + path);
  return { mintStatus: mint.status, fileStatus: f.status(), contentType: f.headers()["content-type"], body: await f.text() };
}

// Draws numbered red boxes on elements and a legend at the bottom of the viewport.
async function mark(page, marks, docBottom = false) {
  await page.evaluate(({ marks, docBottom }) => {
    const mk = (css, text) => {
      const d = document.createElement("div");
      d.setAttribute("style", `position:absolute;z-index:2147483647;pointer-events:none;${css}`);
      if (text) d.textContent = text;
      document.body.appendChild(d);
      return d;
    };
    const lines = [];
    marks.forEach((m, i) => {
      const n = String(i + 1);
      const b = m.box;
      if (b) {
        mk(`left:${b.x - 6}px;top:${b.y - 6}px;width:${b.w + 12}px;height:${b.h + 12}px;border:4px solid #ff2828;border-radius:6px;`);
        mk(`left:${b.x - 20}px;top:${b.y - 22}px;width:28px;height:28px;background:#ff2828;color:#fff;font:bold 17px/28px sans-serif;text-align:center;border-radius:14px;`, n);
      }
      lines.push(`${n}  ${m.caption}`);
    });
    const leg = mk(`left:${scrollX + 16}px;top:0px;max-width:${innerWidth - 60}px;padding:10px 14px;background:rgba(0,0,0,.88);color:#fff;font:bold 15px/1.45 sans-serif;border:3px solid #ff2828;border-radius:6px;white-space:pre-wrap;`, lines.join("\n"));
    const h = leg.getBoundingClientRect().height;
    leg.style.top = docBottom
      ? `${document.documentElement.scrollHeight - h - 16}px`
      : `${scrollY + innerHeight - h - 16}px`;
  }, { marks, docBottom });
}
async function boxOf(page, fn, arg) {
  return page.evaluate(({ src, arg }) => {
    const el = new Function("arg", src)(arg);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }, { src: fn, arg });
}

const live = { loads: [] };
for (const load of [1, 2]) {
  const ctx = await freshContext();
  const L = { load, api: {}, screens: {}, gold: {}, contracts: {} };

  // Underwrite read for #8 and the documents list for all three.
  const uw = await getJson(ctx, `/api/read/underwrite?client_id=${IDS.eight}`);
  L.api.underwrite8 = { status: uw.status, ok: uw.json.ok, scoreSource: uw.json?.dataCompleteness?.scoreSource };
  const docsBy = {};
  for (const [name, id] of Object.entries(IDS)) {
    const r = await getJson(ctx, `/api/read/documents?client_id=${id}`);
    const rows = r.json.rows || r.json.items || [];
    docsBy[name] = rows;
    const uiq = rows.filter((d) => ANALYSIS.includes(d.subtype));
    L.api[name] = {
      status: r.status,
      count: rows.length,
      deliverables: rows.filter((d) => d.kind === "deliverable").length,
      uwiqAnalysis: uiq.length,
      goldHtml: uiq.filter((d) => /html/i.test(d.mime_type || "")).map((d) => d.title),
      contractHtml: rows.filter((d) => d.kind === "contract" && /html/i.test(d.mime_type || "")).map((d) => d.title),
    };
  }

  const page = await ctx.newPage();

  // Documents screen, #8 and #11, filtered to UnderwriteIQ deliverables.
  for (const name of ["eight", "eleven"]) {
    await page.goto(`${BASE}/app/documents.html?client_id=${IDS[name]}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(6000);
    const body = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    const m = body.match(/UnderwriteIQ deliverables\s*(\d+)/i);
    // Filter the table to the deliverable class (client-side filter only).
    const tab = page.locator('[data-c="deliverable"]').last();
    if (await tab.count()) { await tab.click().catch(() => {}); await page.waitForTimeout(800); }
    const cardBox = await boxOf(page, `
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) if (/UnderwriteIQ deliverables/i.test(n.textContent||"")) {
        let el = n.parentElement;
        for (let i=0;i<4&&el&&el.parentElement;i++){ if(/\\d/.test(el.innerText||"")&&el.getBoundingClientRect().width>200) break; el=el.parentElement; }
        return el; }
      return null;`);
    const rowBox = await boxOf(page, `
      const rows=[...document.querySelectorAll('tbody tr')].filter(r=>/Credit Analysis|Funding Snapshot|Roadmap|Lender/i.test(r.innerText));
      if(!rows.length) return null;
      const a=rows[0].getBoundingClientRect(), b=rows[Math.min(rows.length,4)-1].getBoundingClientRect();
      const d=document.createElement('div'); d.style.cssText='position:absolute;pointer-events:none;left:'+(a.left+scrollX)+'px;top:'+(a.top+scrollY)+'px;width:'+a.width+'px;height:'+(b.bottom-a.top)+'px';
      document.body.appendChild(d); return d;`);
    const rowTitles = await page.evaluate(() =>
      [...document.querySelectorAll("tbody tr")].map((r) => (r.querySelector("td")?.innerText || "").split("\n")[0].trim()).filter(Boolean));
    const nm = NUM[name];
    await mark(page, [
      { box: cardBox, caption: `${nm} UnderwriteIQ deliverables card reads ${m ? m[1] : "?"} (load ${load}). The note said #8 was 0.` },
      { box: rowBox, caption: `${nm} the gold UnderwriteIQ pages are on file (Credit Analysis, Snapshot, Roadmap, Lender list).` },
    ], true);
    const shot = `${SHOTS}/finish-load${load}-docs-${name === "eight" ? "8" : "11"}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    L.screens[name] = { url: page.url(), uwiqCard: m ? Number(m[1]) : null, marked: Boolean(cardBox && rowBox), rowTitles, shot };
  }

  // Gold HTML page for #8: open the live Credit Analysis file and render it.
  for (const name of ["eight", "eleven"]) {
    const pick = docsBy[name].find((d) => d.subtype === "credit_analysis_report" && /html/i.test(d.mime_type || ""));
    if (!pick) { L.gold[name] = { found: false }; continue; }
    const f = await fetchDoc(ctx, pick.id);
    L.gold[name] = {
      found: true, title: pick.title, mintStatus: f.mintStatus, fileStatus: f.fileStatus, contentType: f.contentType,
      bytes: f.body?.length, isHtml: /^\s*<!doctype html/i.test(f.body || ""),
      pageTitle: ((f.body || "").match(/<title>([^<]*)<\/title>/i) || [])[1] || null,
      hasPlaceholder: PH.test(f.body || ""),
    };
    if (name === "eight" && f.body) {
      const gp = await ctx.newPage();
      await gp.setContent(f.body, { waitUntil: "load", timeout: 45_000 }).catch(() => {});
      await gp.waitForTimeout(1500);
      const hBox = await boxOf(gp, `const h=document.querySelector('h1')||document.querySelector('h2'); return h;`);
      await mark(gp, [
        { box: hBox, caption: `#8 gold HTML Credit Analysis, opened from the live site (${f.contentType}, ${f.body.length} bytes, load ${load}).` },
      ]);
      const shot = `${SHOTS}/finish-load${load}-gold-html-8.png`;
      await gp.screenshot({ path: shot });
      L.gold[name].shot = shot;
      await gp.close();
    }
  }

  // Contract HTML on file for each client: render it and mark the terms block.
  for (const name of Object.keys(IDS)) {
    const ct = docsBy[name].find((d) => d.kind === "contract" && /html/i.test(d.mime_type || ""));
    if (!ct) { L.contracts[name] = { found: false }; continue; }
    const f = await fetchDoc(ctx, ct.id);
    const body = f.body || "";
    const snip = (body.match(/AGREEMENT TERMS[\s\S]{0,200}/i) || [""])[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    L.contracts[name] = { found: true, title: ct.title, fileStatus: f.fileStatus, contentType: f.contentType, bytes: body.length, hasPlaceholder: PH.test(body), snip };
    const cp = await ctx.newPage();
    await cp.setViewportSize({ width: 1440, height: 520 });
    await cp.setContent(body, { waitUntil: "load" }).catch(() => {});
    // Box only the terms block: a text range from "AGREEMENT TERMS" to the end
    // of the placeholder (or the next heading when there is no placeholder).
    const pBox = await cp.evaluate(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n, start = null, end = null;
      while ((n = w.nextNode())) {
        const t = n.textContent || "";
        if (!start) { const i = t.search(/AGREEMENT TERMS/i); if (i >= 0) start = [n, i]; }
        if (start) { const j = t.search(/END OF PLACEHOLDER <<<|WHAT IT COSTS/i); if (j >= 0) { end = [n, j + (/END OF PLACEHOLDER/i.test(t) ? t.match(/END OF PLACEHOLDER <<</i)[0].length : 0)]; break; } }
      }
      if (!start) return null;
      const r = document.createRange();
      r.setStart(start[0], start[1]);
      if (end) r.setEnd(end[0], end[1]); else r.setEnd(start[0], start[0].textContent.length);
      const b = r.getBoundingClientRect();
      return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };
    });
    await mark(cp, [
      { box: pBox, caption: PH.test(body)
          ? `${NUM[name]} ${ct.title} on file still says PLACEHOLDER - not the real agreement text (load ${load}).`
          : `${NUM[name]} ${ct.title} agreement terms block - no placeholder line (load ${load}).` },
    ]);
    const shot = `${SHOTS}/finish-load${load}-contract-${name === "eight" ? "8" : name === "nine" ? "9" : "11"}.png`;
    await cp.screenshot({ path: shot });
    L.contracts[name].shot = shot;
    await cp.close();
  }

  await ctx.close();
  live.loads.push(L);
}
await browser.close();

const out = { at: new Date().toISOString(), no_send: true, db: dbOut, live, blocked };
writeFileSync(`${OUT}/finish.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await close();
