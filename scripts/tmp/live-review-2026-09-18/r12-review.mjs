// Review of hole 12 — "#8 stored next-action still says Collect Documents". LOOK ONLY.
// Independent re-try on live by the reviewer (not the fixer).
//
// Two fresh loads, each in a brand-new headless browser with a real password sign-in:
//   /app/client-control-panel.html?id=<#8> — wait for the name + 4 s, record the big "Do this next"
//   line and the inquiries under it, then open the collapsed Details (a show/hide toggle only, no save)
//   and record whether a "Saved on the record" line shows and what it says. Record the API it read.
// Blocks every non-GET except the one sign-in POST. Never prints a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r12-review.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const ID = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const NAME = "Sim Eight-Funding";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-12/review";
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const out = { at: new Date().toISOString(), base: BASE, client: ID, no_send: true, loads: [], blocked: [] };

async function newCtx() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route("**/*", (route) => {
    const r = route.request(); const m = r.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    const p = new URL(r.url()).pathname;
    if (m === "POST" && p === "/api/auth/login") return route.continue();
    out.blocked.push(`${m} ${p}`); return route.abort();
  });
  return { browser, ctx };
}

async function signIn(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", "chris@fundhub.ai");
  await page.fill("#pw", pw);
  const lr = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
  await page.click("#go");
  const status = (await lr).status();
  await page.waitForTimeout(2500);
  const landed = new URL(page.url()).pathname;
  await page.close();
  return { status, landed };
}

function hookApis(page, bag, wanted) {
  page.on("response", async (res) => {
    const u = new URL(res.url());
    if (!u.pathname.startsWith("/api/")) return;
    bag.calls.push(`${res.request().method()} ${u.pathname}${u.search} -> ${res.status()}`);
    if (wanted(u)) { try { bag.bodies.push({ path: u.pathname + u.search, body: await res.json() }); } catch (e) { bag.bodies.push({ path: u.pathname + u.search, parseError: String(e).slice(0, 80) }); } }
  });
}

// Red numbered boxes + legend, drawn in viewport space (the page scrolls inside its own column,
// so a full-page shot comes out blank below the fold). Scroll the first item into view first.
async function markAndShoot(page, items, file) {
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "center" }), items[0].sel);
  await page.waitForTimeout(400);
  const clip = await page.evaluate((items) => {
    const layer = document.createElement("div");
    layer.id = "__r12marks";
    layer.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647";
    const legend = []; let top = Infinity, bottom = 0;
    for (const it of items) {
      const el = document.querySelector(it.sel);
      const vis = el && !el.hidden && el.getBoundingClientRect().height > 0;
      if (!vis) { legend.push(`${it.n} = ${it.label}: ${it.missing || "not on the page"}`); continue; }
      const r = el.getBoundingClientRect();
      const b = document.createElement("div");
      b.style.cssText = `position:fixed;left:${r.left - 5}px;top:${r.top - 4}px;width:${r.width + 10}px;height:${r.height + 8}px;border:3px solid #e00;border-radius:4px;box-sizing:border-box`;
      const tag = document.createElement("div");
      tag.textContent = it.n;
      tag.style.cssText = `position:fixed;left:${Math.max(0, r.left - 30)}px;top:${r.top - 10}px;background:#e00;color:#fff;font:700 14px/22px sans-serif;width:22px;text-align:center;border-radius:11px`;
      layer.append(b, tag);
      const words = (el.innerText || "").trim().replace(/\s*\n\s*/g, " / ");
      legend.push(`${it.n} = ${it.label}: "${words.length > 240 ? words.slice(0, 240) + "…" : words}"`);
      top = Math.min(top, r.top - 14); bottom = Math.max(bottom, r.top + r.height + 10);
    }
    if (top === Infinity) { top = 0; bottom = 200; }
    const lg = document.createElement("div");
    lg.style.cssText = `position:fixed;left:240px;top:${Math.min(bottom + 12, innerHeight - 130)}px;width:960px;box-sizing:border-box;background:#fff;color:#111;border:2px solid #e00;font:15px/22px sans-serif;padding:8px 12px`;
    lg.innerHTML = legend.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");
    layer.append(lg);
    document.body.append(layer);
    bottom = Math.max(bottom, lg.getBoundingClientRect().bottom + 10);
    const y0 = Math.max(0, top - 60);
    return { x: 0, y: y0, width: document.documentElement.clientWidth, height: Math.min(innerHeight - y0, bottom - y0 + 10), legend };
  }, items);
  await page.screenshot({ path: file, clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } });
  await page.evaluate(() => document.getElementById("__r12marks")?.remove()).catch(() => {});
  return { file, legend: clip.legend };
}

const READ = () => {
  const t = (s) => { const el = document.querySelector(s); return el && !el.hidden ? el.innerText.trim() : null; };
  const saved = document.getElementById("ccp-saved");
  const mirrorSaved = document.getElementById("ccp-cp-saved");
  const body = document.body.innerText;
  return {
    nameShown: body.includes("Sim Eight-Funding"),
    big: t("#ccp-next-action"),
    why: t("#ccp-cp-why"),
    note: t("#ccp-cp-note"),
    inquiries: t("#ccp-next-inquiries"),
    detailsOpen: !(document.getElementById("details-body")?.hidden ?? true),
    path: t("#ccp-path"),
    savedHidden: saved ? saved.hidden : null,
    savedText: saved ? saved.innerText.trim() : null,
    mirrorSavedHidden: mirrorSaved ? mirrorSaved.hidden : null,
    mirrorSavedText: mirrorSaved ? mirrorSaved.textContent.trim() : null,
    savedOnRecordAnywhere: (body.match(/Saved on the record[^\n]{0,80}/g) || []),
    collectDocsAnywhere: (body.match(/[^\n]{0,60}Collect Documents[^\n]{0,60}/g) || []),
  };
};

async function lookCcp(ctx, n) {
  const page = await ctx.newPage();
  const bag = { calls: [], bodies: [] };
  hookApis(page, bag, (u) => u.pathname === "/api/dashboard/client");
  const t0 = Date.now();
  await page.goto(`${BASE}/app/client-control-panel.html?id=${ID}`, { waitUntil: "commit" });
  const trace = []; let last = ""; let nameAt = null;
  while (Date.now() - t0 < 30000) {
    const s = await page.evaluate(READ).catch(() => null);
    if (s) {
      const k = JSON.stringify({ nm: s.nameShown, big: s.big, inq: s.inquiries });
      if (k !== last) { last = k; trace.push({ ms: Date.now() - t0, name: s.nameShown, big: s.big, inquiries: s.inquiries }); }
      if (s.nameShown && nameAt === null) nameAt = Date.now() - t0;
      if (nameAt !== null && Date.now() - t0 > nameAt + 4000) break;
    }
    await page.waitForTimeout(50);
  }
  const before = await page.evaluate(READ);
  // Shot 1: the big line + inquiries under it.
  const shotBig = await markAndShoot(page, [
    { sel: "#ccp-next-action", n: 1, label: "Big 'Do this next' line" },
    { sel: "#ccp-next-inquiries", n: 2, label: "Inquiries listed under it", missing: "no inquiry list showing" },
  ], `${SHOTS}/load${n}-big-line-marked.png`);
  // Open the collapsed Details (show/hide toggle only — no save, no request).
  const tog = page.locator('button.tog[aria-controls="details-body"]');
  await tog.scrollIntoViewIfNeeded();
  await tog.click();
  await page.waitForTimeout(600);
  const after = await page.evaluate(READ);
  const shotDetails = await markAndShoot(page, [
    { sel: "#details-body", n: 1, label: "Details block, opened" },
    { sel: "#ccp-path", n: 2, label: "Path" },
    { sel: "#ccp-saved", n: 3, label: "'Saved on the record' line", missing: "no 'Saved on the record' line shows (hidden)" },
  ], `${SHOTS}/load${n}-details-open-marked.png`);
  const api = bag.bodies.find((b) => b.path.startsWith("/api/dashboard/client?"))?.body;
  await page.close();
  return {
    nameAtMs: nameAt, trace, before, after,
    api: {
      path: bag.bodies.map((b) => b.path),
      next_action_label: api?.next_action?.label ?? null,
      next_action: api?.next_action ?? null,
      next_action_degraded: api?.next_action_degraded,
      saved_employee_next_action: api?.client?.custom_fields?.employee_next_action ?? null,
      custom_fields_present: !!api?.client?.custom_fields,
    },
    apiCalls: bag.calls,
    shots: [shotBig, shotDetails],
  };
}

for (const n of [1, 2]) {
  const { browser, ctx } = await newCtx();
  const si = await signIn(ctx);
  const load = { load: n, signIn: si };
  out.loads.push(load);
  if (si.status !== 200) { console.log(`load ${n}: sign-in failed with status ${si.status} — stopping`); await browser.close(); break; }
  load.ccp = await lookCcp(ctx, n);
  await browser.close();
}
writeFileSync(`${SHOTS}/review.json`, JSON.stringify(out, null, 2));

for (const L of out.loads) {
  console.log(`\n######## LOAD ${L.load} — sign-in status ${L.signIn.status}, landed ${L.signIn.landed}`);
  const c = L.ccp; if (!c) continue;
  console.log(`name shown at ${c.nameAtMs} ms`);
  for (const t of c.trace) console.log(`   ${t.ms}ms name=${t.name} big=${JSON.stringify(t.big)} inq=${JSON.stringify(t.inquiries)}`);
  console.log(`FINAL big line: ${JSON.stringify(c.before.big)}`);
  console.log(`FINAL why: ${JSON.stringify(c.before.why)} note=${JSON.stringify(c.before.note)}`);
  console.log(`FINAL inquiries: ${JSON.stringify(c.before.inquiries)}`);
  console.log(`Details open=${c.after.detailsOpen} path=${JSON.stringify(c.after.path)} savedHidden=${c.after.savedHidden} savedText=${JSON.stringify(c.after.savedText)} mirrorSavedHidden=${c.after.mirrorSavedHidden} mirrorSavedText=${JSON.stringify(c.after.mirrorSavedText)}`);
  console.log(`'Saved on the record' visible anywhere: ${JSON.stringify(c.after.savedOnRecordAnywhere)}; 'Collect Documents' visible anywhere: ${JSON.stringify(c.after.collectDocsAnywhere)}`);
  console.log(`API ${c.api.path.join(", ")}: next_action.label=${JSON.stringify(c.api.next_action_label)} degraded=${c.api.next_action_degraded} client.custom_fields.employee_next_action=${JSON.stringify(c.api.saved_employee_next_action)}`);
  console.log(`API next_action full: ${JSON.stringify(c.api.next_action).slice(0, 500)}`);
  for (const s of c.shots) console.log(`shot ${s.file}\n   legend: ${s.legend.join(" | ")}`);
  console.log(`api calls: ${c.apiCalls.join(" ; ")}`);
}
console.log(`\nblocked non-GET: ${JSON.stringify(out.blocked)}`);
