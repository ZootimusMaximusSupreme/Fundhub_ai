// Funnel A live walk: the $297 roadmap page, checkout widget (demo mode), /roadmap-book, /roadmap-thank-you.
// Own headless Chromium. Demo tester data only. Never books a slot, never presses Book.
//
// usage (from the repo root):
//   node docs/workflows/site-proof-2026-09-22-evidence/_walk-funnel-a.mjs sales <width>
//   node docs/workflows/site-proof-2026-09-22-evidence/_walk-funnel-a.mjs book <width> "<roadmap-book url from sales>"
// then: python3 docs/workflows/site-proof-2026-09-22-evidence/_mark-funnel-a.py
//
// sales = steps 1-6 (ends on /roadmap-book). book = steps 7-8 (no writes of any kind).
// Pay is pressed ONLY after the page itself shows the demo notice (the server's answer).
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const HERE = "docs/workflows/site-proof-2026-09-22-evidence";
const OUT = `${HERE}/funnel-a`;
const RAW = `${OUT}/_raw`;
mkdirSync(RAW, { recursive: true });
const [phase, widthStr, bookUrlArg] = process.argv.slice(2);
const width = Number(widthStr);
const mobile = width < 600;
const dpr = mobile ? 2 : 1;
const vh = mobile ? 844 : 900;
const START = "https://apply.fundhub.ai/roadmap?utm_source=proof&utm_content=43";

const results = [];
const consoleErrs = [];
const netFails = [];
const manifestPath = `${OUT}/shot-marks-${width}.json`;
let manifest = {};
try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch {}

function rec(step, expected, happened, pass, shot) {
  results.push({ step, width, expected, happened, pass: pass ? "PASS" : "FAIL", shot: shot ? `${OUT}/${shot.replace(".png", "-MARKED.png")}` : "" });
  console.log(`[${width}] ${step}: ${pass ? "PASS" : "FAIL"} - ${happened}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: vh }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const loc = m.location() || {};
  consoleErrs.push({ page: page.url().split("?")[0], text: m.text().slice(0, 300), src: loc.url || "" });
});
page.on("pageerror", (e) => consoleErrs.push({ page: page.url().split("?")[0], text: "UNCAUGHT " + String(e.message).slice(0, 300), src: "page script" }));
page.on("response", (r) => {
  const u = r.url();
  if (/fundhub\.ai\/api\//.test(u) && r.status() >= 400) netFails.push({ url: u.split("?")[0], status: r.status() });
});

// ---- box helpers ----
// viewport box: CSS px from boundingBox -> image px, clipped to the viewport. null if off screen.
async function vbox(locator) {
  const b = await locator.boundingBox().catch(() => null);
  if (!b) return null;
  const x1 = Math.max(0, b.x), y1 = Math.max(0, b.y), x2 = Math.min(width, b.x + b.width), y2 = Math.min(vh, b.y + b.height);
  if (x2 - x1 < 2 || y2 - y1 < 2) return null;
  return { x: Math.round(x1 * dpr), y: Math.round(y1 * dpr), w: Math.round((x2 - x1) * dpr), h: Math.round((y2 - y1) * dpr) };
}
// element-shot box: relative to a container's box.
function rbox(b, c) {
  if (!b || !c) return null;
  const x1 = Math.max(0, b.x - c.x), y1 = Math.max(0, b.y - c.y);
  const x2 = Math.min(c.width, b.x - c.x + b.width), y2 = Math.min(c.height, b.y - c.y + b.height);
  if (x2 - x1 < 2 || y2 - y1 < 2) return null;
  return { x: Math.round(x1 * dpr), y: Math.round(y1 * dpr), w: Math.round((x2 - x1) * dpr), h: Math.round((y2 - y1) * dpr) };
}
function shotName(nn, step) { return `${nn}-${step}-${width}.png`; }
async function vshot(nn, step, legend, marks, notes = []) {
  const name = shotName(nn, step);
  await page.screenshot({ path: `${RAW}/${name}` });
  manifest[name] = { legend, marks: marks.filter((m) => m.box), notes };
  return name;
}
async function center(locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.waitForTimeout(700);
}

async function salesPhase() {
  // ---------- STEP 1: page load ----------
  await page.goto(START, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2500);
  const hero = page.locator(".fh-root .hero").first();
  const heroH = page.locator(".fh-root .hero h1, .fh-root .hero .h1").first();
  const media = page.locator("#fh-media");
  const heroBtn = page.locator(".fh-root a.btn[href='#fh-order']").first();
  const s1info = await page.evaluate(() => {
    const h = document.querySelector(".fh-root .hero");
    const v = document.getElementById("fh-vsl");
    return { hero: !!h && h.getBoundingClientRect().height > 50, heroText: h ? h.textContent.replace(/\s+/g, " ").trim().slice(0, 90) : "", video: !!v, videoReady: v ? v.readyState : -1, title: document.title };
  });
  let n = await vshot("01", "hero", `${width}px: /roadmap loads`, [
    { n: 1, caption: "Hero headline", box: await vbox((await heroH.count()) ? heroH : hero) },
    { n: 2, caption: `Sales video (readyState ${s1info.videoReady})`, box: await vbox(media) },
    { n: 3, caption: "First CTA button", box: await vbox(heroBtn) },
  ]);
  rec("1a page load + hero", "Hero shows", `hero=${s1info.hero}, video readyState=${s1info.videoReady}, text "${s1info.heroText.slice(0, 60)}"`, s1info.hero, n);

  // STEP 1b (approvals shuffle) runs in its own phase: `deck <width>` (deckPhase below).

  // ---------- STEP 1c: industry pills glow ----------
  const inds = page.locator("#fh-inds");
  const indsTop = await page.evaluate(() => { const d = document.getElementById("fh-inds"); return d.getBoundingClientRect().top + window.scrollY; });
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, indsTop - vh * 0.72));
  await page.waitForTimeout(400);
  const partial = await page.evaluate(() => document.querySelectorAll("#fh-inds span.is-lit").length);
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, indsTop - vh * 0.45));
  await page.waitForTimeout(700);
  const lit = await page.evaluate(() => {
    const s = [...document.querySelectorAll("#fh-inds span")];
    return { total: s.length, lit: s.filter((x) => x.classList.contains("is-lit")).length, glow: s.filter((x) => getComputedStyle(x).boxShadow !== "none").length, color: s[0] ? getComputedStyle(s[0]).color : "" };
  });
  n = await vshot("01c", "industry-pills", `${width}px: industry pills glow`, [
    { n: 1, caption: `${lit.lit}/${lit.total} pills lit blue with glow (${lit.glow} have the shadow)`, box: await vbox(inds) },
  ], [`Part-way (row at 72% of screen): ${partial} lit. Row at 45%: ${lit.lit} lit.`]);
  const pillsOk = lit.total === 6 && lit.lit === 6 && lit.glow === 6 && partial < 6;
  rec("1c industry pills glow", "Pills light in order as the row scrolls up", `part-way ${partial}/6 lit, then ${lit.lit}/6 lit, ${lit.glow}/6 glowing`, pillsOk, n);

  // ---------- STEP 1d: covers open the sample lightbox ----------
  const pages = ["analysis", "pack", "roadmap", "snapshot", "lenders"];
  const opened = {};
  for (const k of pages) {
    const t = page.locator(`[data-page="${k}"]`).first();
    await center(t);
    await t.click();
    await page.waitForTimeout(400);
    opened[k] = await page.evaluate(() => { const lb = document.getElementById("fh-lb"); return !lb.hidden ? (document.querySelector("#fh-lb-body .sp-doc")?.textContent || "").trim().slice(0, 60) : null; });
    if (k === "analysis") {
      n = await vshot("01d", "cover-lightbox", `${width}px: a cover opens the sample`, [
        { n: 1, caption: `Sample opened: "${opened[k]}"`, box: await vbox(page.locator("#fh-lb .lb-card")) },
        { n: 2, caption: "Close button", box: await vbox(page.locator("#fh-lb .lb-x")) },
      ]);
      var coverShot = n;
    }
    if (k === "pack") {
      const def = await page.evaluate(() => document.querySelector("#fh-lb-body .ptab.on")?.textContent);
      const tab = page.locator("#fh-lb-body .ptab", { hasText: "06 Complaints" });
      await tab.click();
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => ({ on: document.querySelector("#fh-lb-body .ptab.on")?.textContent, doc: document.querySelector("#fh-lb-body .sp-doc")?.textContent, tabs: document.querySelectorAll("#fh-lb-body .ptab").length }));
      const tabOn = page.locator("#fh-lb-body .ptab.on");
      await tabOn.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "center" }));
      n = await vshot("01e", "letter-pack-tab", `${width}px: letter pack sample, tab switched`, [
        { n: 1, caption: `Tab clicked: "${after.on}" (was "${def}")`, box: await vbox(tabOn) },
        { n: 2, caption: `Page shown: "${after.doc}"`, box: await vbox(page.locator("#fh-lb-body .sp-doc")) },
      ], [`${after.tabs} tabs in the pack`]);
      const packOk = after.tabs === 7 && /06 Complaints/.test(after.on || "") && /06 Complaints/.test(after.doc || "");
      rec("1e letter pack tab", "Pack opens with tabs; a tab click shows that page", `${after.tabs} tabs, default "${def}", after click "${after.on}" / "${after.doc}"`, packOk, n);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
  const allOpened = pages.every((k) => opened[k]);
  rec("1d covers open lightbox", "All 5 What You Get covers open a sample", pages.map((k) => `${k}:${opened[k] ? "open" : "NO"}`).join(", "), allOpened, coverShot);
  const lbClosed = await page.evaluate(() => document.getElementById("fh-lb").hidden);

  // ---------- STEP 2: Get My Roadmap -> widget ----------
  const go = page.locator("a.fh-go-pay").first();
  await center(go);
  await go.click();
  await page.waitForTimeout(1800);
  const s1 = page.locator("#fhw form.s1");
  const w2 = await page.evaluate(() => {
    const f = document.querySelector("#fhw form.s1"), b = f.querySelector("button[type=submit]");
    const r = f.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), btnVisible: rb.top >= 0 && rb.bottom <= window.innerHeight, on: f.classList.contains("on"), vh: window.innerHeight };
  });
  const s2ok = w2.on && w2.top >= 0 && w2.btnVisible;
  n = await vshot("02", "cta-scrolls-to-widget", `${width}px: Get My Roadmap -> checkout widget`, [
    { n: 1, caption: "Step tabs: 1 · Contact is on", box: await vbox(page.locator("#fhw [data-tabs]")) },
    { n: 2, caption: "Step 1 form on screen", box: await vbox(s1) },
    { n: 3, caption: "Continue button on screen", box: await vbox(s1.locator("button[type=submit]")) },
  ], [`lightbox closed before click: ${lbClosed}`]);
  rec("2 CTA scrolls to widget", "Step 1 on screen", `form top ${w2.top}px, bottom ${w2.bottom}px of ${w2.vh}, Continue visible=${w2.btnVisible}`, s2ok, n);

  // ---------- STEP 3: step 1 empty -> errors; fill -> step 2 ----------
  await s1.locator("button[type=submit]").click();
  await page.waitForTimeout(500);
  const e1 = await page.evaluate(() => ["c_first", "c_last", "email", "phone"].map((nm) => {
    const i = document.querySelector(`#fhw [name="${nm}"]`), f = i.closest("label").querySelector(".ferr");
    return { nm, msg: f && !f.hidden ? f.textContent : null };
  }));
  await center(s1);
  const e1marks = [];
  let k = 1;
  for (const nm of ["c_first", "c_last", "email", "phone"]) {
    const lab = page.locator(`#fhw [name="${nm}"]`).locator("xpath=ancestor::label[1]");
    const msg = e1.find((x) => x.nm === nm).msg;
    e1marks.push({ n: k++, caption: `${nm}: "${msg}"`, box: await vbox(lab.locator(".ferr")) });
  }
  n = await vshot("03a", "step1-empty-errors", `${width}px: step 1 empty Continue`, e1marks);
  const e1ok = e1.every((x) => x.msg);
  rec("3a step 1 empty errors", "Error under each of the 4 boxes", e1.map((x) => `${x.nm}="${x.msg}"`).join("; "), e1ok, n);

  const email = `demo+proof-${Date.now()}@fundhub.ai`;
  await s1.locator('[name="c_first"]').fill("Demo");
  await s1.locator('[name="c_last"]').fill("Tester");
  await s1.locator('[name="email"]').fill(email);
  await s1.locator('[name="phone"]').fill("5613048368");
  await s1.locator("button[type=submit]").click();
  await page.waitForTimeout(1200);
  const s2 = page.locator("#fhw form.s2");
  const st2 = await page.evaluate(() => ({ on: document.querySelector("#fhw form.s2").classList.contains("on"), tab: document.querySelector('#fhw [data-tab="2"]').classList.contains("on"), lf: document.querySelector('#fhw [name="first_name"]').value, ll: document.querySelector('#fhw [name="last_name"]').value }));
  await page.evaluate(() => document.getElementById("fhw").scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400);
  n = await vshot("03b", "step2-shown", `${width}px: Continue -> step 2`, [
    { n: 1, caption: "Tab 2 · Payment is on", box: await vbox(page.locator('#fhw [data-tab="2"]')) },
    { n: 2, caption: `Legal name carried over: "${st2.lf} ${st2.ll}"`, box: await vbox(s2.locator(".cfw-box").first().locator(".row2").first()) },
  ], [`email used: ${email}`]);
  rec("3b fill -> step 2", "Step 2 shows", `step2 on=${st2.on}, tab2 on=${st2.tab}, legal name prefilled "${st2.lf} ${st2.ll}"`, st2.on && st2.tab, n);

  // ---------- STEP 4: step 2 empty -> errors; add/remove business ----------
  // The page carries the step-1 name into the legal-name boxes; clear them so the submit is truly empty.
  await s2.locator('[name="first_name"]').fill("");
  await s2.locator('[name="last_name"]').fill("");
  const demoNote = await page.evaluate(() => { const d = document.querySelector("#fhw [data-demo]"); return { shown: !d.hidden, text: d.textContent, live: !document.querySelector("#fhw [data-livenote]").hidden }; });
  const netBefore = [];
  const listen = (r) => { if (/api\/public\/slo-(checkout|pull)/.test(r.url()) && r.request().method() === "POST") netBefore.push(r.url()); };
  page.on("request", listen);
  await s2.locator("[data-pay]").click();
  await page.waitForTimeout(800);
  page.off("request", listen);
  const e2names = ["first_name", "last_name", "dob", "ssn", "address", "city", "state", "zip", "consent"];
  const e2 = await page.evaluate((names) => names.map((nm) => {
    const i = document.querySelector(`#fhw form.s2 [name="${nm}"]`), lab = i.closest("label");
    const f = lab.classList.contains("check") ? lab.nextElementSibling : lab.querySelector(".ferr");
    return { nm, msg: f && f.classList.contains("ferr") && !f.hidden ? f.textContent : null };
  }), e2names);
  const wBox = await page.locator("#fhw").boundingBox();
  const e2marks = [];
  k = 1;
  for (const nm of e2names) {
    const i = s2.locator(`[name="${nm}"]`);
    const f = nm === "consent" ? i.locator("xpath=ancestor::label[1]/following-sibling::span[contains(@class,'ferr')][1]") : i.locator("xpath=ancestor::label[1]").locator(".ferr");
    const msg = e2.find((x) => x.nm === nm).msg;
    e2marks.push({ n: k++, caption: `${nm}: "${(msg || "none").slice(0, 70)}"`, box: rbox(await f.boundingBox().catch(() => null), wBox) });
  }
  const e2name = shotName("04a", "step2-empty-errors");
  await page.locator("#fhw").screenshot({ path: `${RAW}/${e2name}` });
  manifest[e2name] = { legend: `${width}px: step 2 empty Pay (whole widget)`, marks: e2marks.filter((m) => m.box), notes: [`No order request was sent: ${netBefore.length === 0}`] };
  const e2ok = e2.every((x) => x.msg) && netBefore.length === 0;
  rec("4a step 2 empty errors", "Error under every required box, nothing sent", e2.map((x) => `${x.nm}:${x.msg ? "err" : "NONE"}`).join(", ") + `; requests sent ${netBefore.length}`, e2ok, e2name);

  await s2.locator('[name="first_name"]').fill("Demo");
  await s2.locator('[name="last_name"]').fill("Tester");
  const add = s2.locator("[data-add]");
  await center(add);
  await add.click();
  await page.waitForTimeout(500);
  const pay = s2.locator("[data-pay]");
  const withBiz = await page.evaluate(() => ({ pay: document.querySelector("#fhw [data-pay]").textContent, total: document.querySelector("#fhw [data-total]").textContent, rows: document.querySelectorAll("#fhw .cfw-biz").length, line: document.querySelector("#fhw [data-totline]").textContent }));
  await center(s2.locator("[data-total]"));
  n = await vshot("04b", "add-business-312", `${width}px: + Add a business`, [
    { n: 1, caption: `Total: ${withBiz.total}`, box: await vbox(s2.locator(".cfw-total")) },
    { n: 2, caption: `Button: "${withBiz.pay}"`, box: await vbox(pay) },
    { n: 3, caption: `Line: "${withBiz.line}"`, box: await vbox(s2.locator("[data-totline]")) },
  ]);
  rec("4b add business -> $312", "Button shows $312", `button "${withBiz.pay}", total ${withBiz.total}, ${withBiz.rows} business boxes`, /\$312/.test(withBiz.pay) && withBiz.total === "$312", n);

  const rm = s2.locator(".cfw-biz").nth(1).locator("[data-rm]");
  await center(rm);
  await rm.click();
  await page.waitForTimeout(500);
  const noBiz = await page.evaluate(() => ({ pay: document.querySelector("#fhw [data-pay]").textContent, total: document.querySelector("#fhw [data-total]").textContent, rows: document.querySelectorAll("#fhw .cfw-biz").length }));
  await center(s2.locator("[data-total]"));
  n = await vshot("04c", "remove-business-297", `${width}px: Remove the extra business`, [
    { n: 1, caption: `Total: ${noBiz.total}`, box: await vbox(s2.locator(".cfw-total")) },
    { n: 2, caption: `Button: "${noBiz.pay}"`, box: await vbox(pay) },
  ], [`${noBiz.rows} business box left (Business 1, free)`]);
  rec("4c remove business -> $297", "Button back to $297", `button "${noBiz.pay}", total ${noBiz.total}, ${noBiz.rows} business box`, /\$297/.test(noBiz.pay) && noBiz.total === "$297", n);

  // ---------- STEP 5: unfindable address ----------
  if (!demoNote.shown || demoNote.live) {
    rec("5 SAFETY STOP", "Demo notice on the page before Pay", `demo notice shown=${demoNote.shown}, live note=${demoNote.live}. Pay NOT pressed.`, false, null);
    return;
  }
  await s2.locator('[name="dob"]').fill("01/02/1990");
  await s2.locator('[name="ssn"]').fill("666-12-3456");
  await s2.locator('[name="address"]').fill("1 Nowhere Fake Street");
  await s2.locator('[name="city"]').fill("Nowhere");
  await s2.locator('[name="state"]').selectOption("TX");
  await s2.locator('[name="zip"]').fill("79999");
  await s2.locator('[name="consent"]').check();
  let checkout = null, pull5 = null;
  const onResp = async (r) => {
    const u = r.url();
    if (r.request().method() !== "POST") return;
    if (/api\/public\/slo-checkout/.test(u)) { try { const b = await r.json(); checkout = { status: r.status(), ok: b.ok, demo: b.demo, ref: b.ref, client_id: b.client_id, price: b.priceDisplay }; } catch {} }
    if (/api\/public\/slo-pull/.test(u)) { try { const b = await r.json(); pull5 = pull5 || { status: r.status(), error: b.error, next: b.next, warnings: (b.warnings || []).map((w) => `${w.field}:${w.message}`) }; } catch {} }
  };
  page.on("response", onResp);
  await center(pay);
  const pullResp = page.waitForResponse((r) => /api\/public\/slo-pull/.test(r.url()) && r.request().method() === "POST", { timeout: 60000 });
  await pay.click();
  await pullResp.catch(() => null);
  await page.waitForTimeout(2500);
  const navigated5 = /roadmap-book/.test(page.url());
  if (navigated5) {
    rec("5 fake address warning", "Warning under street", `slo-pull ${pull5?.status} ${pull5?.next || pull5?.error}: the address PASSED, page went to /roadmap-book (geocoder did not stop it)`, false, null);
    results.push({ note: "step6 not run on this order: step 5 already completed the demo order", checkout });
    page.off("response", onResp);
    return { checkout, email };
  }
  const warn = await page.evaluate(() => { const i = document.querySelector('#fhw [name="address"]'), f = i.closest("label").querySelector(".ferr"); return f && !f.hidden ? { text: f.textContent, warn: f.classList.contains("fwarn") } : null; });
  const street = s2.locator('[name="address"]');
  await center(street);
  n = await vshot("05", "fake-address-warning", `${width}px: unfindable address -> Pay`, [
    { n: 1, caption: `Under street: "${(warn?.text || "nothing").slice(0, 80)}"`, box: await vbox(street.locator("xpath=ancestor::label[1]").locator(".ferr")) },
    { n: 2, caption: "Street box: 1 Nowhere Fake Street", box: await vbox(street) },
  ], [`slo-checkout: ${checkout?.status} demo=${checkout?.demo} ref=${checkout?.ref}`, `slo-pull: ${pull5?.status} ${pull5?.error || pull5?.next}`]);
  const warnOk = !!warn && /We couldn.t find that address/.test(warn.text) && pull5?.status === 422;
  rec("5 fake address warning", "\"We couldn't find that address...\" under street", `slo-pull ${pull5?.status} ${pull5?.error}; under street: "${warn?.text}"`, warnOk, n);

  // ---------- STEP 6: real address -> Pay -> /roadmap-book ----------
  await s2.locator('[name="address"]').fill("1600 Pennsylvania Ave NW");
  await s2.locator('[name="city"]').fill("Washington");
  await s2.locator('[name="state"]').selectOption("DC");
  await s2.locator('[name="zip"]').fill("20500");
  await center(pay);
  const pre = await page.evaluate(() => ({ consent: document.querySelector('#fhw [name="consent"]').checked, demo: document.querySelector("#fhw [data-demo]").textContent, pay: document.querySelector("#fhw [data-pay]").textContent }));
  await center(s2.locator("[data-demo]"));
  n = await vshot("06a", "pay-ready-demo", `${width}px: real-looking address, ready to Pay`, [
    { n: 1, caption: `Consent checked: ${pre.consent}`, box: await vbox(s2.locator(".consent").first()) },
    { n: 2, caption: `Notice: "${pre.demo}"`, box: await vbox(s2.locator("[data-demo]")) },
    { n: 3, caption: `Pay button: "${pre.pay}"`, box: await vbox(pay) },
  ]);
  pull5 = null;
  await pay.click();
  let landed = null;
  try { await page.waitForURL(/apply\.fundhub\.ai\/roadmap-book/, { timeout: 60000 }); landed = page.url(); } catch { landed = page.url(); }
  page.off("response", onResp);
  rec("6a Pay pressed (demo)", "Demo notice showing, consent on, $297", `consent ${pre.consent}, "${pre.demo}", "${pre.pay}"`, pre.consent && /not charged/i.test(pre.demo), n);
  await page.waitForTimeout(2500);
  const u = new URL(landed);
  const q = Object.fromEntries(u.searchParams.entries());
  const urlOk = u.origin + u.pathname === "https://apply.fundhub.ai/roadmap-book" && !!q.ref && !!q.client_id && q.utm_source === "proof" && q.utm_content === "43";
  const refMatch = checkout && q.ref === checkout.ref && q.client_id === checkout.client_id;
  const card = page.locator(".fh-book-embed").first();
  n = await vshot("06b", "landed-roadmap-book", `${width}px: after Pay -> /roadmap-book`, [
    { n: 1, caption: "Booking card on /roadmap-book", box: await vbox(card) },
  ], [`URL: ${u.origin}${u.pathname}`, `ref=${q.ref}`, `client_id=${q.client_id}`, `utm_source=${q.utm_source} utm_content=${q.utm_content}`, `slo-pull: ${pull5?.status} next=${pull5?.next}; ref matches the order: ${refMatch}`]);
  rec("6b lands on /roadmap-book", "URL has ref, client_id, utm_source=proof, utm_content=43", `${u.pathname}?ref=${q.ref}&client_id=${q.client_id}&utm_source=${q.utm_source}&utm_content=${q.utm_content} (slo-pull ${pull5?.status} next=${pull5?.next}; matches order ${refMatch})`, urlOk && refMatch, n);
  return { checkout, email, landed };
}

async function bookPhase(url) {
  if (page.url() !== url) await page.goto(url, { waitUntil: "load", timeout: 60000 });
  const frameEl = page.locator(".fh-book-embed iframe, iframe").first();
  await frameEl.scrollIntoViewIfNeeded();
  const handle = await frameEl.elementHandle();
  let frame = await handle.contentFrame();
  for (let i = 0; i < 60 && !frame; i++) { await page.waitForTimeout(500); frame = await handle.contentFrame(); }
  await frame.waitForSelector("#calContainer .cf2__calendar-header", { timeout: 45000 });
  await page.waitForTimeout(3000);
  const outer = await page.evaluate(() => ({ cards: document.querySelectorAll(".fh-book-embed").length, iframes: document.querySelectorAll("iframe").length }));
  const inner = await frame.evaluate(() => {
    const vis = (s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== "none"; };
    return { hero: vis(".fh-root .hero"), headerLogo: vis(".fh-root header .logo"), schedLogo: vis("#calContainer img"), scrollH: document.body.scrollHeight, innerH: window.innerHeight };
  });
  const fb = await frameEl.boundingBox();
  const fits = inner.scrollH <= Math.ceil(fb.height) + 4;
  const card = page.locator(".fh-book-embed").first();
  await card.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(600);
  const cardBox = await card.boundingBox();
  const month = frame.locator(".cf2__column--left").first();
  const slots = frame.locator(".cf2__slot-list").first();
  const left = frame.locator("#calContainer > div").first();
  let name = shotName("07a", "book-card-calendar");
  await card.screenshot({ path: `${RAW}/${name}` });
  const lb = await left.boundingBox();
  manifest[name] = {
    legend: `${width}px: /roadmap-book card (whole card)`,
    marks: [
      { n: 1, caption: "Event details; no second logo or hero inside", box: rbox(lb && { ...lb, height: Math.min(lb.height, 240) }, cardBox) },
      { n: 2, caption: "Month grid", box: rbox(await month.boundingBox(), cardBox) },
      { n: 3, caption: `Times list; frame ${Math.round(fb.height)}px vs calendar ${inner.scrollH}px`, box: rbox(await slots.boundingBox(), cardBox) },
    ].filter((m) => m.box),
    notes: [`cards on page ${outer.cards}; inside frame: hero ${inner.hero}, header logo ${inner.headerLogo}, side-panel logo ${inner.schedLogo}`],
  };
  const cleanOk = outer.cards === 1 && !inner.hero && !inner.headerLogo && !inner.schedLogo;
  rec("7a one clean card", "One card, calendar only, no second hero/logo", `cards=${outer.cards}, inner hero=${inner.hero}, header logo=${inner.headerLogo}, side logo=${inner.schedLogo}`, cleanOk, name);
  rec("7b frame fits", "Frame tall enough, no inner scroll", `frame ${Math.round(fb.height)}px, calendar content ${inner.scrollH}px`, fits, name);

  // pick a different available date, then a time
  const avail = frame.locator(".cf2__calendar-grid--available:not(.cf2__calendar-grid--selected)");
  const nAvail = await avail.count();
  let pickedDate = null;
  if (nAvail > 0) {
    const pick = avail.nth(Math.min(1, nAvail - 1));
    pickedDate = (await pick.textContent()).trim();
    await pick.click();
    await page.waitForTimeout(1800);
  }
  const selDate = await frame.evaluate(() => { const s = document.querySelector(".cf2__calendar-grid--selected"); return s ? s.textContent.trim() : null; });
  const header = await frame.evaluate(() => document.querySelector(".cf2__calendar-header--title")?.textContent.trim());
  const slot = frame.locator(".cf2__time-slot").first();
  await slot.scrollIntoViewIfNeeded();
  const slotText = (await slot.textContent()).trim();
  await slot.click();
  await page.waitForTimeout(1200);
  const confirm = frame.locator("button.cf2__confirm-button, button.DTP__confirm-button").first();
  const cCount = await confirm.count();
  let cb = cCount ? await confirm.boundingBox() : null;
  const confirmOnScreen = !!cb && cb.y >= 0 && cb.y + cb.height <= vh && cb.x >= 0 && cb.x + cb.width <= width;
  const cText = cCount ? (await confirm.textContent()).trim() : "";
  name = await vshot("07c", "date-time-confirm", `${width}px: date + time picked (no extra scrolling)`, [
    { n: 1, caption: `Date picked: ${header} ${selDate}`, box: await vbox(frame.locator(".cf2__calendar-grid--selected").first()) },
    { n: 2, caption: `Time picked: ${slotText}`, box: await vbox(slot) },
    { n: 3, caption: `"${cText}" button on screen: ${confirmOnScreen}`, box: await vbox(confirm) },
  ]);
  rec("7c pick date + time -> Confirm on screen", "Confirm visible without scrolling", `${nAvail} other open dates, picked ${pickedDate} (selected now ${selDate} ${header}), time ${slotText}, confirm button ${cCount ? `at y=${Math.round(cb?.y)}-${Math.round((cb?.y || 0) + (cb?.height || 0))} of ${vh}` : "MISSING"}`, !!selDate && confirmOnScreen, name);

  if (cCount) {
    await confirm.click();
    await page.waitForTimeout(2500);
  }
  const form = await frame.evaluate(() => {
    const f = document.querySelector("#formContainer");
    const r = f ? f.getBoundingClientRect() : null;
    const inputs = f ? [...f.querySelectorAll("input")].filter((i) => i.getBoundingClientRect().height > 0).map((i) => i.name || i.type) : [];
    return { shown: !!r && r.height > 0 && getComputedStyle(f).display !== "none", inputs };
  });
  const fc = frame.locator("#formContainer");
  await fc.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await page.waitForTimeout(600);
  const bookBtn = (await frame.locator("#formContainer a.elButton").count()) ? frame.locator("#formContainer a.elButton").first() : frame.locator("#formContainer").getByText(/Book/).first();
  name = await vshot("07d", "confirm-form-shows", `${width}px: Confirm -> name/email form (STOPPED, not booked)`, [
    { n: 1, caption: `Form shows, fields: ${form.inputs.slice(0, 5).join(", ")}`, box: await vbox(fc) },
    { n: 2, caption: `"${((await bookBtn.textContent().catch(() => "")) || "").trim()}" button: NOT pressed`, box: await vbox(bookBtn) },
  ]);
  rec("7d Confirm -> form shows (stopped)", "Name/email form appears; nothing booked", `form shown=${form.shown}, inputs [${form.inputs.join(", ")}]; not filled, Book not pressed`, form.shown && form.inputs.length > 0, name);

  // ---------- STEP 8: thank-you not-booked view ----------
  await page.goto("https://apply.fundhub.ai/roadmap-thank-you", { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2500);
  const ty = await page.evaluate(() => ({
    eye: document.getElementById("fh-eyebrow")?.textContent.trim(),
    sec: document.getElementById("fh-hero-sec")?.textContent.trim(),
    lede: document.getElementById("fh-hero-lede")?.textContent.trim(),
    cal: (() => { const c = document.getElementById("fh-cal-cta"); return c ? getComputedStyle(c).display : "missing"; })(),
    booking: (() => { try { return !!(localStorage.getItem("fh_booking_v1") || sessionStorage.getItem("fh_booking_v1")); } catch { return "err"; } })(),
  }));
  name = await vshot("08", "thank-you-not-booked", `${width}px: /roadmap-thank-you`, [
    { n: 1, caption: `Eyebrow: "${ty.eye}"`, box: await vbox(page.locator("#fh-eyebrow")) },
    { n: 2, caption: `Headline: "${ty.sec}"`, box: await vbox(page.locator("#fh-hero-sec")) },
  ], [`calendar block display: ${ty.cal}; booking saved in browser: ${ty.booking}`]);
  const tyOk = /Received/.test(ty.eye || "") && /We've Got Your Request/.test(ty.sec || "") && ty.cal === "none";
  rec("8 thank-you not-booked", "Not-booked view", `eyebrow "${ty.eye}", headline "${ty.sec}", calendar block ${ty.cal}`, tyOk, name);
}


// ---------- STEP 1b: approvals shuffle readable while scrolling ----------
// Two ways a person scrolls: wheel ticks (60px every 60ms) and a fast flick that skips cards.
// "Painted" = the card actually on top at the centre of the deck (elementFromPoint), which is
// what the eye sees; during a flip the old card flies out on top of the new one.
async function deckPhase() {
  await page.goto(START, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2500);
  const deckTop = await page.evaluate(() => document.getElementById("fh-proof-shuffle").getBoundingClientRect().top + scrollY);
  const sample = () => page.evaluate(() => {
    const d = document.getElementById("fh-proof-shuffle"), r = d.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const top = el && el.closest(".fh-card"), img = top && top.querySelector("img");
    return { idx: document.getElementById("fh-deck-i")?.textContent, onScreen: r.top > -r.height / 2 && r.bottom < innerHeight + r.height / 2,
      card: top ? [...d.children].indexOf(top) + 1 : null, opacity: top ? +(+getComputedStyle(top).opacity).toFixed(2) : null,
      img: img ? img.complete && img.naturalWidth > 0 : "no picture" };
  });
  await page.evaluate((y) => scrollTo(0, y), Math.max(0, deckTop - vh * 1.2));
  await page.waitForTimeout(800);
  const slow = [];
  let midShot = null;
  if (!mobile) await page.mouse.move(width / 2, vh / 2);
  for (let i = 0; i < 40; i++) {
    if (mobile) await page.evaluate(() => scrollBy(0, 60)); else await page.mouse.wheel(0, 60);
    await page.waitForTimeout(60);
    const s = await sample();
    slow.push(s);
    if (!midShot && s.onScreen && s.card && Number(s.idx) >= 6) {
      const d = page.locator("#fh-proof-shuffle");
      const painted = page.locator(`#fh-proof-shuffle > .fh-card:nth-child(${s.card})`);
      midShot = await vshot("01b", "approvals-shuffle-scrolling", `${width}px: approvals deck while wheel-scrolling`, [
        { n: 1, caption: `Card on top mid-scroll: #${s.card}, opacity ${s.opacity}, picture loaded ${s.img}`, box: await vbox(painted) },
        { n: 2, caption: `Counter ${s.idx}/16 + running total`, box: await vbox(page.locator("#fh-community-proof .deck-meta").first()) },
      ]);
    }
  }
  const on = slow.filter((s) => s.onScreen && s.card);
  const badSlow = on.filter((s) => s.opacity < 0.85 || s.img === false);
  const seen = [...new Set(on.map((s) => s.idx))];
  manifest[midShot]?.notes.push(`${on.length} wheel stops with the deck on screen; cards flipped ${seen.join(",")}; stops where the top card was faint or had no picture: ${badSlow.length}`);
  rec("1b approvals shuffle (wheel scroll)", "Top card readable (opaque, picture loaded) at every stop", `${on.length} stops, cards ${seen.join(",")}, faint/empty stops ${badSlow.length}`, on.length >= 8 && badSlow.length === 0, midShot);

  await page.evaluate((y) => scrollTo(0, y), Math.max(0, deckTop - vh * 0.9));
  await page.waitForTimeout(900);
  const fast = [];
  let fastShot = null;
  for (let i = 1; i <= 6; i++) {
    await page.evaluate((y) => scrollTo(0, y), Math.max(0, deckTop - vh * 0.9 + (vh * 0.85 * i) / 6));
    await page.waitForTimeout(120);
    const s = await sample();
    if (!fastShot && s.opacity != null && s.opacity < 0.85) {
      const painted = page.locator(`#fh-proof-shuffle > .fh-card:nth-child(${s.card})`);
      fastShot = await vshot("01b2", "approvals-shuffle-fast-flick", `${width}px: approvals deck 0.12s after a fast flick`, [
        { n: 1, caption: `Card on top: #${s.card}, opacity ${s.opacity} (fading in), picture loaded ${s.img}`, box: await vbox(painted) },
      ]);
    }
    await page.waitForTimeout(500);
    const later = await sample();
    fast.push({ s, later });
  }
  const faint = fast.filter((f) => f.s.opacity != null && f.s.opacity < 0.85);
  // a null card = something else (the sticky mobile CTA bar) sits on the deck centre; not a deck reading
  const recovered = fast.filter((f) => f.later.card).every((f) => f.later.opacity === 1 && f.later.img !== false);
  if (fastShot) manifest[fastShot].notes.push(`${faint.length} of ${fast.length} flicks (2-3 cards per jump) showed a faint card at 0.12s: opacity ${faint.map((f) => f.s.opacity).join(", ")}; all full at 0.62s: ${recovered}`);
  rec("1b2 approvals shuffle (fast flick)", "Top card readable right after a fast flick", `${faint.length}/${fast.length} flicks showed a faint top card at 0.12s (opacity ${faint.map((f) => f.s.opacity).join(", ") || "-"}); all full by 0.62s: ${recovered}`, faint.length === 0, fastShot);
}

let out = {};
try {
  if (phase === "sales") {
    out = (await salesPhase()) || {};
    if (out.landed && /roadmap-book/.test(out.landed)) await bookPhase(out.landed);
  } else if (phase === "deck") {
    await deckPhase();
  } else if (phase === "book") {
    await bookPhase(bookUrlArg);
  }
} catch (e) {
  results.push({ step: "CRASH", width, happened: String(e.stack || e).slice(0, 600), pass: "FAIL" });
  console.log("CRASH", e);
  try { await page.screenshot({ path: `${RAW}/crash-${phase}-${width}.png` }); } catch {}
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
writeFileSync(`${OUT}/_results-${phase}-${width}.json`, JSON.stringify({ width, phase, order: out.checkout || null, email: out.email || null, landed: out.landed || null, results, consoleErrs, netFails }, null, 2));
console.log("CONSOLE", JSON.stringify(consoleErrs, null, 1));
console.log("NETFAILS", JSON.stringify(netFails));
await browser.close();
