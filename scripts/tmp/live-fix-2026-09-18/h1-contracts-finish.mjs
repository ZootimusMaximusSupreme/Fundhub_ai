// HOLE 1 contracts FINISH — look only. Read-only SELECTs (BEGIN READ ONLY), GET-only browser.
// Every non-GET request is aborted by a route and recorded. The only clicks are
// client-side: a wording row on the Contracts page (opens it in the editor, no
// save) and the Contracts class tab on the Documents page (filters rows).
// Nothing is sent, saved, signed or voided. The only write is the owner session
// row createSession() makes, same as scripts/tmp/live-prove-no-send.mjs.
//
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//        scripts/tmp/live-fix-2026-09-18/h1-contracts-finish.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { db, pool, close } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";
import { offersForClient } from "../../../src/config/offers.mjs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/live-fix-2026-09-18/h1-contracts";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/h1-contracts";
const IDS = {
  "8": "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  "9": "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  "11": "029964c5-4d8e-47ed-88c9-53ac13863fd4",
};
const ALL = Object.values(IDS);
const KEYS = ["FUNDING-AGREEMENT", "CREDIT-REPAIR-AGREEMENT", "CAPITAL-BLUEPRINT-AGREEMENT"];
const PH_TEXT = "THIS IS NOT THE REAL AGREEMENT TEXT";
const PH = /PLACEHOLDER\. THIS IS NOT THE REAL AGREEMENT TEXT/i;
const STARTED = new Date().toISOString();
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

// ---------- database, read only ----------
async function readDb(tag) {
  const c = await pool().connect();
  const o = { tag, at: new Date().toISOString() };
  try {
    await c.query("BEGIN READ ONLY");
    o.contracts = (await c.query(
      `SELECT client_id, id, template_key, status, signed_at, voided_at, created_at,
              (rendered_body LIKE '%' || $2 || '%') AS placeholder
         FROM contracts WHERE client_id = ANY($1::uuid[]) ORDER BY client_id, created_at`, [ALL, PH_TEXT])).rows;
    o.templates = (await c.query(
      `SELECT id, org_id, template_key, name, active, length(body) len,
              (body LIKE '%' || $2 || '%') AS placeholder
         FROM contract_templates WHERE template_key = ANY($1::text[]) ORDER BY template_key`, [KEYS, PH_TEXT])).rows;
    o.messagesSinceStart = (await c.query(
      `SELECT client_id, channel, status, created_at FROM messages
        WHERE client_id = ANY($1::uuid[]) AND created_at >= $2`, [ALL, STARTED])).rows;
    o.contractsSinceStart = (await c.query(
      `SELECT client_id, template_key, status, created_at FROM contracts
        WHERE client_id = ANY($1::uuid[]) AND (created_at >= $2 OR updated_at >= $2)`, [ALL, STARTED])).rows;
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  return o;
}
const dbBefore = await readDb("before");

// ---------- live site, GET only ----------
const staffRow = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`, ["chris@fundhub.ai"])).rows[0];
const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });

const browser = await chromium.launch({ headless: true });
const blocked = [];
async function freshContext() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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

// Numbered red boxes + a legend pinned to the bottom of the viewport.
async function mark(page, marks) {
  await page.evaluate(({ marks }) => {
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
        mk(`left:${Math.max(0, b.x - 20)}px;top:${Math.max(0, b.y - 22)}px;width:28px;height:28px;background:#ff2828;color:#fff;font:bold 17px/28px sans-serif;text-align:center;border-radius:14px;`, n);
      }
      lines.push(`${n}  ${m.caption}`);
    });
    const leg = mk(`left:${scrollX + 16}px;top:0px;max-width:${innerWidth - 60}px;padding:10px 14px;background:rgba(0,0,0,.9);color:#fff;font:bold 15px/1.45 sans-serif;border:3px solid #ff2828;border-radius:6px;white-space:pre-wrap;`, lines.join("\n"));
    const h = leg.getBoundingClientRect().height;
    leg.style.top = `${scrollY + innerHeight - h - 16}px`;
  }, { marks });
}
async function boxOf(page, fnSrc, arg) {
  return page.evaluate(({ src, arg }) => {
    const el = new Function("arg", src)(arg);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }, { src: fnSrc, arg });
}

// The picker, run from the exact present.js text the browser was served.
const BEGIN = "  function offer(key) {";
const END = "  /* No contract defaults live in this file any more";
function runPicker(src) {
  const a = src.indexOf(BEGIN);
  const b = src.indexOf(END, a);
  if (a < 0 || b < a) return { error: "picker block not found" };
  const block = src.slice(a, b);
  const rows = [];
  for (const tier of ["FULL_FUNDING", "FUNDING_PLUS_REPAIR", "REPAIR_ONLY"]) {
    for (const [label, s] of [
      ["funding sale", { edu: false, forceRepair: false, rung: 0 }],
      ["DIY letters + course (Blueprint)", { edu: false, forceRepair: true, rung: 2 }],
      ["Education > Course 1 (Blueprint)", { edu: true, forceRepair: false, rung: 1 }],
    ]) {
      const sb = { state: { offers: offersForClient(), tier, ...s } };
      vm.createContext(sb);
      vm.runInContext(block, sb);
      const offer = sb.selectedOfferKey();
      const agreement = sb.resolveContractTemplateKey();
      rows.push({ tier, path: label, offer, agreement, ok: offer !== "UWIQ_DELIVERABLES" || agreement === "CAPITAL-BLUEPRINT-AGREEMENT" });
    }
  }
  return { new_rule_live: block.includes('selectedOfferKey() === "FUNDING_DFY"'), bad: rows.filter((r) => !r.ok).length, rows };
}

const live = { loads: [] };
for (const load of [1, 2]) {
  const ctx = await freshContext();
  const L = { load, shots: [] };
  const page = await ctx.newPage();
  const shot = async (p, name) => { const f = `${SHOTS}/load${load}-${name}.png`; await p.screenshot({ path: f }); L.shots.push(f); return f; };

  // 1) Present screen for #11 — the screen whose picker chooses the agreement.
  let presentJs = null;
  page.on("response", async (r) => {
    if (/\/app\/present\.js(\?|$)/.test(r.url()) && r.request().method() === "GET") {
      presentJs = await r.text().catch(() => null);
    }
  });
  await page.goto(`${BASE}/app/present.html?client_id=${IDS["11"]}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(7000);
  const presentText = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  L.present = {
    url: page.url(),
    showsEleven: /Eleven/i.test(presentText),
    servedPresentJs: presentJs ? presentJs.length : null,
    picker: presentJs ? runPicker(presentJs) : { error: "present.js not captured" },
  };
  const nameBox = await boxOf(page, `const t=document.querySelector('.topbar .mono'); return t;`);
  const pk = L.present.picker;
  const bp = (pk.rows || []).filter((r) => r.offer === "UWIQ_DELIVERABLES");
  await mark(page, [
    { box: nameBox, caption: `Present screen opened for #11 ${L.present.showsEleven ? "(Sim Eleven-Blueprint)" : "(name not seen)"}, load ${load}. Nothing clicked.` },
    { box: null, caption: `The picker in the present.js this page loaded: Blueprint sale -> ${[...new Set(bp.map((r) => r.agreement))].join(", ") || "?"} on all 3 deck types (${bp.length} of ${bp.length} checks). Wrong picks: ${pk.bad ?? "?"}.` },
  ]);
  await shot(page, "present-11");

  // 2) The live present.js file itself, with the new rule line boxed.
  const jsPage = await ctx.newPage();
  await jsPage.goto(`${BASE}/app/present.js`, { waitUntil: "load", timeout: 45_000 });
  const ruleBox = await jsPage.evaluate(() => {
    const pre = document.querySelector("pre") || document.body;
    const w = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = n.textContent || "";
      const i = t.indexOf("function resolveContractTemplateKey()");
      if (i >= 0) {
        const j = t.indexOf("return (o && o.contractTemplateKey) || null;", i);
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, j >= 0 ? j + "return (o && o.contractTemplateKey) || null;".length : i + 400);
        const b = r.getBoundingClientRect();
        window.scrollTo(0, Math.max(0, b.top + scrollY - 200));
        const b2 = r.getBoundingClientRect();
        return { x: b2.left + scrollX, y: b2.top + scrollY, w: Math.min(b2.width, innerWidth - 40), h: b2.height };
      }
    }
    return null;
  });
  await mark(jsPage, [
    { box: ruleBox, caption: `Live https://fundhub.ai/app/present.js (load ${load}). The combined funding+repair agreement is now only for the funding sale. Any other sale takes its own offer's agreement, so a Blueprint sale gets the Capital Blueprint Agreement.` },
  ]);
  await shot(jsPage, "present-js-rule");
  await jsPage.close();

  // 3) Contracts page: the three wordings. Clicking a row only opens it in the editor.
  await page.setViewportSize({ width: 1440, height: 1250 });
  await page.goto(`${BASE}/app/contracts.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(6000);
  L.templates = {};
  for (const key of ["CAPITAL-BLUEPRINT-AGREEMENT", "FUNDING-AGREEMENT", "CREDIT-REPAIR-AGREEMENT"]) {
    const row = page.locator("#tplList tr[data-tid]").filter({ hasText: key }).first();
    if (!(await row.count())) { L.templates[key] = { found: false }; continue; }
    await row.click();
    await page.waitForTimeout(600);
    const body = await page.locator("#tBody").inputValue().catch(() => "");
    const hasPh = PH.test(body);
    // Scroll the text box so its placeholder line (or its first lines) is in view.
    await page.evaluate(({ hasPh }) => {
      const ta = document.getElementById("tBody");
      window.scrollTo(0, 0); // keep the chosen row clear of the floating owner bar
      if (hasPh) {
        const idx = ta.value.search(/PLACEHOLDER\. THIS IS NOT/i);
        const lineNo = ta.value.slice(0, idx).split("\n").length - 1;
        const lh = parseFloat(getComputedStyle(ta).lineHeight) || 18;
        ta.scrollTop = Math.max(0, (lineNo - 2) * lh);
      } else {
        ta.scrollTop = 0;
      }
    }, { hasPh });
    await page.waitForTimeout(300);
    const rowBox = await boxOf(page, `return [...document.querySelectorAll('#tplList tr[data-tid]')].find(r=>r.innerText.includes(arg));`, key);
    const taBox = await boxOf(page, `return document.getElementById('tBody');`);
    L.templates[key] = { found: true, bodyLen: body.length, hasPlaceholder: hasPh, startsWith: body.slice(0, 80) };
    await mark(page, [
      { box: rowBox, caption: `${key} opened on the live Contracts page (load ${load}). Not saved, not edited.` },
      { box: taBox, caption: hasPh
          ? `Its wording still says PLACEHOLDER. THIS IS NOT THE REAL AGREEMENT TEXT. The real wording is not in the repo. Waiting on Chris's file.`
          : `Its wording is the real agreement (${body.length} characters). No placeholder line.` },
    ]);
    await shot(page, `template-${key.toLowerCase()}`);
    await page.reload({ waitUntil: "domcontentloaded" }); // clear overlays
    await page.waitForTimeout(5000);
  }

  // 4) Contract HTML on file for #8, #9, #11 — what each client actually has.
  L.contracts = {};
  for (const [num, id] of Object.entries(IDS)) {
    const r = await getJson(ctx, `/api/read/documents?client_id=${id}`);
    const rows = r.json.rows || r.json.items || [];
    const cts = rows.filter((d) => d.kind === "contract" && /html/i.test(d.mime_type || ""));
    L.contracts[num] = { docsStatus: r.status, contractHtmlTitles: cts.map((d) => d.title), files: [] };
    for (const ct of cts) {
      const f = await fetchDoc(ctx, ct.id);
      const body = f.body || "";
      L.contracts[num].files.push({ title: ct.title, fileStatus: f.fileStatus, bytes: body.length, hasPlaceholder: PH.test(body), isBlueprint: /CAPITAL BLUEPRINT/i.test(body) });
    }
    const ct = cts[cts.length - 1];
    if (!ct) continue;
    const f = await fetchDoc(ctx, ct.id);
    const body = f.body || "";
    const cp = await ctx.newPage();
    await cp.setViewportSize({ width: 1440, height: 560 });
    await cp.setContent(body, { waitUntil: "load" }).catch(() => {});
    const pBox = await cp.evaluate(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n, start = null, end = null;
      while ((n = w.nextNode())) {
        const t = n.textContent || "";
        if (!start) { const i = t.search(/AGREEMENT TERMS/i); if (i >= 0) start = [n, i]; }
        if (start) { const m = t.match(/END OF PLACEHOLDER <<</i); if (m) { end = [n, t.indexOf(m[0]) + m[0].length]; break; } }
      }
      if (!start) return null;
      const r = document.createRange();
      r.setStart(start[0], start[1]);
      if (end) r.setEnd(end[0], end[1]); else r.setEnd(start[0], start[0].textContent.length);
      const b = r.getBoundingClientRect();
      return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };
    });
    const extra = num === "11"
      ? " It is a Funding Agreement, signed, and the database locks a signed contract. A real Capital Blueprint page needs a new send, which emails #11. Waiting on Chris's yes."
      : " Signed and locked. Even with new wording only new contracts change.";
    await mark(cp, [
      { box: pBox, caption: PH.test(body)
          ? `#${num} ${ct.title} on file still says PLACEHOLDER (load ${load}).${extra}`
          : `#${num} ${ct.title} on file: no placeholder line (load ${load}).` },
    ]);
    await shot(cp, `contract-${num}`);
    await cp.close();
  }

  await ctx.close();
  live.loads.push(L);
}
await browser.close();

const dbAfter = await readDb("after");
const out = { at: new Date().toISOString(), started: STARTED, no_send: true, dbBefore, dbAfter, live, blocked };
writeFileSync(`${OUT}/finish.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, (k, v) => (k === "rows" && Array.isArray(v) && v.length > 9 ? `[${v.length} rows]` : v), 2));
await close();
