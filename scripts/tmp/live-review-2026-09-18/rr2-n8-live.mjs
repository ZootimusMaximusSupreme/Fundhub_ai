// REVIEW N8 (independent reviewer) — live, headless, own browser.
// (Re-created 20:10 UTC after the worktree lost its untracked files; same logic
//  as the copy that ran at 19:5x–20:09 UTC.)
// Real password-form sign-in. Every non-GET request is blocked EXCEPT:
//   - POST /api/auth/login (sign-in)
//   - MODE=enroll only: POST /api/repair/enroll for the ONE fresh Sim file
//     (Sim SloEighteen) — the write the fixer's reviewer_steps name. At most
//     one per run. It ran exactly once, at 20:05:35 UTC. Do not re-run it.
// Screens: Specialist desk -> Repair tab (the "Waiting on papers" row) and the
// staff Messaging thread (what the client was sent). Red numbered boxes + legend.
// Emails and signed links are blanked on screen before any screenshot.
// Prints no password, cookie, token, full phone or full email.
//   MODE=look TAG=... THREADS=slo18,combo node --env-file=<repo>/.env rr2-n8-live.mjs
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://fundhub.ai";
const MODE = process.env.MODE || "look";
const TAG = process.env.TAG || MODE;
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N8/review";
mkdirSync(OUT, { recursive: true });
const SLO18 = "0dd8892c-6f1c-4fd5-84e4-4dc1b992b3d0"; // Sim SloEighteen — fresh file
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267"; // Sim Combo — already asked by funding flow
const THREADS = (process.env.THREADS || "slo18,combo").split(",");
const IDS = { slo18: SLO18, combo: COMBO };
const NAMES = { slo18: "Sim SloEighteen", combo: "Sim Combo-20260918" };

const out = { at: new Date().toISOString(), mode: MODE, tag: TAG, blocked: [], allowed: [], enroll: null, desk: null, threads: {} };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1300 } });
let enrollUsed = 0;
await context.route("**/*", (route) => {
  const q = route.request();
  const u = new URL(q.url());
  if (["GET", "HEAD", "OPTIONS"].includes(q.method())) return route.continue();
  if (q.method() === "POST" && u.hostname === "fundhub.ai" && u.pathname === "/api/auth/login") {
    out.allowed.push(`POST ${u.pathname}`);
    return route.continue();
  }
  if (MODE === "enroll" && q.method() === "POST" && u.hostname === "fundhub.ai" && u.pathname === "/api/repair/enroll") {
    let body = {};
    try { body = JSON.parse(q.postData() || "{}"); } catch {}
    if (body.client_id === SLO18 && enrollUsed === 0) {
      enrollUsed += 1;
      out.allowed.push(`POST ${u.pathname} client=${SLO18.slice(0, 8)} program=${body.program} price=${body.price_total} paid=${body.amount_paid}`);
      return route.continue();
    }
  }
  out.blocked.push(`${q.method()} ${u.hostname}${u.pathname}`);
  return route.abort();
});
const page = await context.newPage();

// Blank emails and signed-link parameters on screen before any screenshot.
async function redact() {
  await page.evaluate(() => {
    const EM = /[A-Za-z0-9._%+-]+(?:%2B|\+)?[A-Za-z0-9._%-]*(?:@|%40)(?:gmail|fundhub|yahoo|outlook|icloud)[A-Za-z0-9.-]*\.(?:com|ai|net)/gi;
    const SIG = /(sig|token|exp)=[A-Za-z0-9._-]+/g;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const t = n.nodeValue;
      if (EM.test(t) || SIG.test(t)) n.nodeValue = t.replace(EM, "[sim inbox]").replace(SIG, "$1=[redacted]");
      EM.lastIndex = 0; SIG.lastIndex = 0;
    }
    document.querySelectorAll("input,textarea").forEach((el) => {
      if (EM.test(el.value || "") || EM.test(el.placeholder || "")) { el.value = "[sim inbox]"; el.placeholder = "[sim inbox]"; }
      EM.lastIndex = 0;
    });
  });
}

// Mark helper: red numbered boxes over elements/rects + one-line legend.
async function mark(marks, legend) {
  await redact();
  await page.evaluate(({ marks, legend }) => {
    document.querySelectorAll(".rr-mark").forEach((n) => n.remove());
    marks.forEach((m, i) => {
      let r = m.rect;
      if (!r && m.sel) {
        const el = document.querySelector(m.sel);
        if (!el) return;
        const b = el.getBoundingClientRect();
        r = { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };
      }
      if (!r) return;
      const box = document.createElement("div");
      box.className = "rr-mark";
      Object.assign(box.style, { position: "absolute", left: `${r.x - 4}px`, top: `${r.y - 4}px`, width: `${r.w + 8}px`, height: `${r.h + 8}px`, border: "3px solid #e00", zIndex: 99999, pointerEvents: "none", boxSizing: "border-box" });
      const n = document.createElement("div");
      Object.assign(n.style, { position: "absolute", left: "-30px", top: "-3px", background: "#e00", color: "#fff", font: "bold 15px sans-serif", padding: "2px 7px" });
      n.textContent = String(i + 1);
      box.appendChild(n);
      document.body.appendChild(box);
    });
    const lg = document.createElement("div");
    lg.className = "rr-mark";
    Object.assign(lg.style, { position: "fixed", left: "12px", bottom: "12px", right: "12px", background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 12px", zIndex: 100000 });
    lg.innerHTML = legend.map((l, i) => `<b style="color:#e00">${i + 1}</b> ${l.replace(/</g, "&lt;")}`).join("<br>");
    document.body.appendChild(lg);
  }, { marks, legend });
}

// 1. Real sign-in through the password form.
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", process.env.STAFF_INITIAL_PASSWORD || "");
const [loginResp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST", { timeout: 30000 }),
  page.click("#go"),
]);
out.loginStatus = loginResp.status();
console.log("sign-in POST status", out.loginStatus);
if (out.loginStatus !== 200) {
  console.log("SIGN-IN FAILED — stopping, no session injected");
  writeFileSync(`${OUT}/rr2-${TAG}-live.json`, JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(2);
}
await page.waitForTimeout(2500);

// 2. Specialist desk -> Repair tab.
async function openRepairDesk() {
  const deskResp = page.waitForResponse((r) => r.url().endsWith("/api/read/repair-cases") && r.request().method() === "GET", { timeout: 45000 });
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#tab-repair", { timeout: 30000 });
  await page.click("#tab-repair");
  const r = await deskResp;
  const j = await r.json().catch(() => null);
  await page.waitForTimeout(2500);
  const files = (j?.files || []).filter((f) => /^(sim|walk)/i.test(String(f.name || "")));
  return { status: r.status(), files: files.map((f) => ({ client: String(f.client_id).slice(0, 8), name: f.name, program: f.program, stage_key: f.stage_key, stage_label: f.stage_label })) };
}

if (MODE === "enroll") {
  await openRepairDesk();
  // The desk only lists files already on repair, so a fresh file has no row
  // to press Enroll on. Send the same request the desk's Enroll button sends,
  // from this signed-in page (same session). Money: $200 trial price, $0 paid —
  // no fake payment recorded on live.
  out.enroll = await page.evaluate(async (id) => {
    const tok = (() => { try { return localStorage.getItem("fh_token") || ""; } catch { return ""; } })();
    const h = { accept: "application/json", "content-type": "application/json" };
    if (tok) h.authorization = "Bearer " + tok;
    const r = await fetch("/api/repair/enroll", { method: "POST", headers: h, body: JSON.stringify({ client_id: id, program: "trial", price_total: 200, amount_paid: 0 }) });
    const j = await r.json().catch(() => null);
    const ds = j?.event?.docState;
    return {
      at: new Date().toISOString(), http: r.status, ok: j?.ok,
      program: j?.program ? { program: j.program.program, status: j.program.status, rounds_cap: j.program.rounds_cap } : null,
      event: j?.event ? {
        ok: j.event.ok, stageKey: j.event.stageKey ?? null, moved: j.event.moved?.moved ?? null,
        email: j.event.email ? { sent: j.event.email.sent, reason: j.event.email.reason || null, templateKey: j.event.email.templateKey || null } : null,
        docState: ds ? { emitted: ds.emitted, name: ds.name, missing: ds.missing, deduped: ds.recorded?.deduped ?? null,
          handled: ds.handled ? { ok: ds.handled.ok, email: ds.handled.email ? { sent: ds.handled.email.sent, reason: ds.handled.email.reason || null, templateKey: ds.handled.email.templateKey || null } : null } : null } : null
      } : null,
      recorded: j?.recorded ? { deduped: j.recorded.deduped, handlers: j.recorded.dispatched?.handlers ?? null } : null,
      error: j?.error || null
    };
  }, SLO18);
  console.log("enroll", JSON.stringify(out.enroll));
  await page.waitForTimeout(3000);
}

out.desk = await openRepairDesk();
console.log("desk", out.desk.status, JSON.stringify(out.desk.files));

// Desk screenshot: box the fresh file's row and Combo's row.
{
  await redact();
  const marks = [];
  const legend = [];
  for (const [key, id] of [["slo18", SLO18], ["combo", COMBO]]) {
    const has = await page.locator(`tr[data-repair-row="${id}"]`).count();
    if (!has) { legend.push(`${NAMES[key]}: NOT on the Repair desk`); marks.push({ sel: "#repairNote" }); continue; }
    marks.push({ sel: `tr[data-repair-row="${id}"]` });
    const f = out.desk.files.find((x) => x.client === id.slice(0, 8));
    const pillText = await page.locator(`tr[data-repair-row="${id}"] .status-pill`).first().innerText().catch(() => "?");
    legend.push(`${NAMES[key]} on the Repair desk — stage on screen "${pillText.trim()}" (desk API label "${f?.stage_label || f?.stage_key || "?"}")`);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await mark(marks, legend);
  await page.screenshot({ path: `${OUT}/rr2-${TAG}-1-repair-desk.png`, fullPage: false });
}

// 3. Staff Messaging thread per file (email channel), fresh page load each.
for (const key of THREADS) {
  const id = IDS[key];
  const bodies = [];
  const h = async (r) => {
    const u = r.url();
    if (r.request().method() !== "GET") return;
    if (!/\/api\/read\/(conversations|messages|thread)/.test(u)) return;
    try { bodies.push({ url: new URL(u).pathname + new URL(u).search.replace(/client_id=[^&]+/, "client_id=…"), status: r.status(), json: await r.json() }); } catch {}
  };
  page.on("response", h);
  await page.goto(`${BASE}/app/messaging.html?client_id=${id}&channel=email`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  page.off("response", h);
  await redact(); // before measuring boxes, so the layout does not move after
  // /api/read/messages carries no template key: match the ask by its subject
  // (email) or, for a text, by the words the SMS-DOC-01 body uses.
  const rows = [];
  for (const b of bodies) {
    if (!/\/api\/read\/messages/.test(b.url)) continue;
    const list = b.json?.items || b.json?.messages || b.json?.rows || [];
    for (const m of list) {
      if (!m || m.direction !== "outbound") continue;
      const plain = String(m.rendered_body || "").replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
      rows.push({ id: String(m.id).slice(0, 8), at: m.created_at, channel: m.channel, status: m.status || null, provider: m.provider || null, subject: m.subject || null, starts: plain.slice(0, 110) });
    }
  }
  const uniq = [...new Map(rows.map((r) => [r.id, r])).values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const isDocAsk = (r) => /Documents needed before we can start/i.test(r.subject || "") || (r.channel === "sms" && /(photo ID|proof of address)/i.test(r.starts));
  const doc01 = uniq.filter(isDocAsk);
  const text = await page.evaluate(() => document.body.innerText);
  out.threads[key] = {
    name: NAMES[key],
    apiCalls: bodies.map((b) => `${b.status} ${b.url}`),
    outbound: uniq,
    doc01,
    screenSaysDocumentsNeeded: (text.match(/Documents needed before we can start/g) || []).length,
    screenSaysIdAndProof: /photo ID|proof of address/i.test(text),
  };
  console.log(key, "api", JSON.stringify(out.threads[key].apiCalls));
  console.log(key, "DOC-01 rows seen by the screen's API", JSON.stringify(doc01));
  console.log(key, "screen text 'Documents needed before we can start' x", out.threads[key].screenSaysDocumentsNeeded);
  const hit = page.getByText("Documents needed before we can start").first();
  const marks = [];
  const legend = [];
  if (await hit.count()) {
    await hit.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    const bb = await hit.boundingBox();
    if (bb) {
      const sy = await page.evaluate(() => scrollY);
      const sx = await page.evaluate(() => scrollX);
      marks.push({ rect: { x: bb.x + sx, y: bb.y + sy, w: bb.width, h: bb.height } });
    }
    legend.push(`${NAMES[key]} staff Messaging (email): "Documents needed before we can start" — ${doc01.filter((r) => r.channel === "email").length} DOC-01 email(s) [${doc01.map((r) => `${r.at.slice(11, 19)} UTC ${r.status}`).join(", ")}], ${doc01.filter((r) => r.channel === "sms").length} DOC-01 text(s) in this thread`);
  } else {
    marks.push({ sel: "main" });
    legend.push(`${NAMES[key]} staff Messaging (email): no "Documents needed before we can start" on screen — ${doc01.length} DOC-01 row(s) in the API the screen used`);
  }
  await mark(marks, legend);
  await page.screenshot({ path: `${OUT}/rr2-${TAG}-2-messaging-${key}.png`, fullPage: false });
}

console.log("allowed", JSON.stringify(out.allowed));
console.log("blocked non-GET", JSON.stringify(out.blocked));
writeFileSync(`${OUT}/rr2-${TAG}-live.json`, JSON.stringify(out, null, 1));
await browser.close();
