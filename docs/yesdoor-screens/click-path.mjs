// Yesdoor I1 click path: the real pages on the real API, over a SCRATCH database.
//
// Not a test in the suite (it needs a browser, a running dev server and a scratch
// database). It clicks the path a person would, in order, and saves a marked
// screenshot of each step next to this file:
//
//   broker link -> home -> search -> listing -> pre-screen (sample renter Priya) -> book a tour
//   -> renter portal -> building portal (sign in by emailed link, move the renter
//   toured -> applied -> approved -> lease signed -> moved in, see the invoice)
//   -> staff desk (sign in, add a building, send its agreement, sign it through the
//   sandbox e-sign webhook, log the building's payment) -> broker portal (the
//   renter came from the broker's link, so the broker's share is now held).
//
// Run it on a FRESH scratch database: the sample renter can be pre-screened once.
//
// How to run (scratch only; it refuses any database that is not on 127.0.0.1):
//   1. a scratch Postgres with every migration applied (node db/migrate.mjs)
//   2. DATABASE_URL=<scratch, fundhub_app> YD_LINK_SECRET=<32+ chars> DEFAULT_ORG_SLUG=yesdoor \
//        YD_BASE_URL=http://127.0.0.1:8899 node scripts/dev-server.mjs --port 8899
//   3. a staff owner: YD_STAFF_PASSWORD=... node scripts/yesdoor/create-first-staff.mjs --apply --email owner+i1@yesdoor.example
//   4. DATABASE_URL=<scratch owner> YD_STAFF_PASSWORD=... CHROME=<chromium binary> node docs/yesdoor-screens/click-path.mjs
//
// Every screenshot carries numbered red boxes on the thing it proves, with a legend
// (CLAUDE.md §8, annotated screenshots).

import { chromium } from "playwright";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.YD_SITE || "http://127.0.0.1:8899";
const DB_URL = process.env.DATABASE_URL || "";
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(DB_URL)) {
  console.error("REFUSED: DATABASE_URL must be a scratch database on 127.0.0.1");
  process.exit(2);
}
const STAFF_EMAIL = process.env.YD_STAFF_EMAIL || "owner+i1@yesdoor.example";
const STAFF_PASSWORD = process.env.YD_STAFF_PASSWORD;
const RUN = Date.now().toString(36);
const RENTER = { first: "Priya", last: "Raman-Sample", email: "priya.raman@sample.yesdoor.test" };
const ADDRESS = { line1: "4410 N Example Way", city: "Scottsdale", state: "AZ", zip: "85251" };

const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });
const q = async (sql, params) => (await pool.query(sql, params)).rows;

const results = [];
let shotNo = 0;
function step(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
}

/** Numbered red boxes on each target, a legend, then the screenshot. */
async function shot(page, file, marks) {
  await page.evaluate((ms) => {
    document.querySelectorAll(".i1-mark").forEach((n) => n.remove());
    const legend = document.createElement("div");
    legend.className = "i1-mark";
    legend.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:99999;background:#fff;border:3px solid #d00;padding:8px 12px;font:600 14px/1.4 system-ui;color:#111;max-width:420px;box-shadow:0 2px 8px rgba(0,0,0,.3)";
    ms.forEach((m, i) => {
      const all = typeof m.sel === "string" ? Array.from(document.querySelectorAll(m.sel)) : [];
      const el = m.text ? all.find((n) => n.textContent.includes(m.text)) : all[0];
      const line = document.createElement("div");
      line.textContent = `${i + 1}. ${m.label}${el ? "" : " (not found)"}`;
      legend.appendChild(line);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.className = "i1-mark";
      box.style.cssText = `position:absolute;z-index:99998;border:4px solid #d00;border-radius:6px;pointer-events:none;left:${r.left + window.scrollX - 6}px;top:${r.top + window.scrollY - 6}px;width:${r.width + 4}px;height:${r.height + 4}px`;
      const tag = document.createElement("div");
      tag.textContent = String(i + 1);
      tag.style.cssText = "position:absolute;left:-14px;top:-14px;width:26px;height:26px;border-radius:13px;background:#d00;color:#fff;font:700 15px/26px system-ui;text-align:center";
      box.appendChild(tag);
      document.body.appendChild(box);
    });
    document.body.appendChild(legend);
  }, marks);
  shotNo += 1;
  const name = `${String(shotNo).padStart(2, "0")}-${file}.png`;
  await page.screenshot({ path: path.join(HERE, name), fullPage: false });
  await page.evaluate(() => document.querySelectorAll(".i1-mark").forEach((n) => n.remove()));
  return name;
}

async function waitText(page, text, timeout = 15000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-proxy-server"] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("dialog", (d) => d.dismiss());

  /* ---------------------------------------------------------- 0. a broker partner */
  // There is no door that adds a broker or makes a broker login yet (see the board).
  // The scratch database gets an active, licensed partner with a login.
  const org = (await q(`SELECT id FROM orgs WHERE slug = 'yesdoor'`))[0];
  const code = `YD-${String(Date.now()).slice(-6)}`;
  const brEmail = `partner+${RUN}@broker.example`;
  const broker = (await q(
    `INSERT INTO yd_brokers (org_id, name, company, email, licence_state, licence_number, licence_verified_at, plan, split_percent, tracking_code, status)
     VALUES ($1,'Harbor Test Realty','Harbor Test Realty LLC',$2,'AZ','BR-TEST-1',now(),'split',25,$3,'active') RETURNING id`, [org.id, brEmail, code]))[0];
  await q(`INSERT INTO yd_accounts (org_id, kind, email, broker_id) VALUES ($1,'broker',$2,$3)`, [org.id, brEmail, broker.id]);

  /* ---------------------------------------------------------- 1. home (from the broker's link) */
  await page.goto(`${BASE}/yesdoor/?b=${encodeURIComponent(code)}&demo=0`);
  const src = await page.evaluate(() => localStorage.getItem("yd-source"));
  step("the broker link (?b=) is remembered as the first touch", !!src && src.includes(code), src || "none");
  await page.locator(".listing-card").first().waitFor();
  const demoBanner = await page.evaluate(() => window.YD.api.isDemo());
  step("home loads real listings (not demo mode)", !demoBanner, `${await page.locator(".listing-card").count()} cards`);
  await shot(page, "home", [{ sel: ".listing-card", label: "Real API listing, flagged Sample listing" }, { sel: "form", label: "Search" }]);

  /* ---------------------------------------------------------- 2. search */
  await page.goto(`${BASE}/yesdoor/search.html?city=Phoenix`);
  await page.locator(".listing-card").first().waitFor();
  const count = await page.locator("#count").innerText();
  step("search filters by city", /apartment/.test(count), count);
  await shot(page, "search-phoenix", [{ sel: "#count", label: `Phoenix only: ${count}` }, { sel: ".listing-card", label: "Cheapest first" }]);

  /* ---------------------------------------------------------- 3. listing */
  await page.locator(".listing-card").first().click();
  await page.locator("#cta").waitFor();
  const rulesItems = await page.locator("#rules-h + ul li").count();
  const hoursText = await page.locator("aside p.caption", { hasText: "Tour hours" }).first().innerText();
  step("listing shows the building's rules and tour hours", rulesItems > 0 && /Tour hours/.test(hoursText), `${rulesItems} rules; ${hoursText}`);
  const listingUrl = page.url();
  await shot(page, "listing", [{ sel: "#rules-h", label: "Rules from GET public/listing (new detail fields)" }, { sel: "aside p.caption", text: "Tour hours", label: "Tour hours from the building" }, { sel: "#cta", label: "Start the pre-screen" }]);

  /* ---------------------------------------------------------- 4. pre-screen */
  await page.locator("#cta").click();
  await page.locator("#f1").waitFor();
  await page.fill("#first", RENTER.first);
  await page.fill("#last", RENTER.last);
  await page.fill("#email", RENTER.email);
  await shot(page, "prescreen-1", [{ sel: "#f1", label: "Step 1: name and email (sample renter Priya)" }]);
  await page.click("#go1");
  await page.locator("#f2").waitFor();
  await page.fill("#line1", ADDRESS.line1);
  await page.fill("#city", ADDRESS.city);
  await page.fill("#state", ADDRESS.state);
  await page.fill("#zip", ADDRESS.zip);
  await page.check("#consent");
  await shot(page, "prescreen-2", [{ sel: "#f2 .group", label: "Permission text and version are sent" }]);
  await page.click("#go2");
  await page.locator("h1.big-number").waitFor({ timeout: 20000 });
  const headline = await page.locator("h1.big-number").innerText();
  const token = await page.evaluate(() => (window.YD.api.renter() || {}).token);
  step("pre-screen answers and hands back a renter session", !!token && !String(token).startsWith("demo-"), headline);
  await shot(page, "prescreen-results", [{ sel: "h1.big-number", label: headline }, { sel: "#link-bank", label: "Sandbox bank link" }]);

  // Link the bank (sandbox) so the answer is "approved".
  if (await page.locator("#link-bank").count()) {
    await page.click("#link-bank");
    await page.waitForFunction(() => !document.getElementById("link-bank"), null, { timeout: 15000 });
  }
  const headline2 = await page.locator("h1.big-number").innerText();
  step("income check (sandbox) updates the answer", /Approved|Likely/.test(headline2), headline2);
  await shot(page, "prescreen-verified", [{ sel: "h1.big-number", label: headline2 }, { sel: "#ap-h", label: "Approved buildings" }]);

  /* ---------------------------------------------------------- 5. book */
  const bookLink = page.locator('a[href^="book.html"]').first();
  await bookLink.click();
  await page.locator("#days .slot").first().waitFor();
  await page.locator("#days .slot").nth(1).click().catch(() => {});
  await page.locator("#times .slot").first().click();
  await shot(page, "book-pick", [{ sel: "#days", label: "Days from the building's tour hours" }, { sel: "#times", label: "Hourly slots (Arizona time)" }, { sel: "#confirm", label: "Book with the renter session" }]);
  await page.click("#confirm");
  await page.locator("#conf-h").waitFor({ timeout: 15000 });
  const conf = await page.locator("#conf-h").innerText();
  step("tour booked through public/book with the pre-screen's renterToken", /booked at/.test(conf), conf);
  await shot(page, "book-confirmed", [{ sel: "#conf-h", label: conf }, { sel: "p.caption", text: "open application", label: "Open applications of 3" }]);

  const app = (await q(
    `SELECT a.id, a.stage, a.building_id, b.name FROM yd_applications a JOIN yd_renters r ON r.id = a.renter_id
       JOIN yd_buildings b ON b.id = a.building_id WHERE r.email = $1 ORDER BY a.created_at DESC LIMIT 1`, [RENTER.email]))[0];
  step("database: application registered with the building", app && app.stage === "registered", app ? `${app.name}, ${app.stage}` : "none");

  /* ---------------------------------------------------------- 6. renter portal */
  await page.goto(`${BASE}/yesdoor/renter.html`);
  await page.locator("#who-name").waitFor();
  const who = await page.locator("#who-name").innerText();
  step("renter portal opens on the same session", /Priya/.test(who), who);
  await shot(page, "renter-overview", [{ sel: "#who-name", label: who }, { sel: ".kpis", label: "Approved up to, path, open applications" }, { sel: "#apps", label: "The new application" }]);
  await page.goto(`${BASE}/yesdoor/renter.html#tours`);
  await page.locator("#tours table, #tours .empty").first().waitFor();
  await shot(page, "renter-tours", [{ sel: "#tours", label: "Tour with reschedule and cancel" }]);

  const firstTouch = (await q(`SELECT source_kind, source_broker_id FROM yd_renters WHERE email = $1`, [RENTER.email]))[0];
  step("database: the renter's first touch is the broker", firstTouch && firstTouch.source_kind === "broker" && firstTouch.source_broker_id === broker.id,
    firstTouch ? firstTouch.source_kind : "none");

  /* ---------------------------------------------------------- 7. building portal */
  // There is no door that creates a building user's login yet (see the board). The
  // scratch database gets one, linked to the building the renter booked.
  const buEmail = `leasing+${RUN}@building.example`;
  const acct = (await q(`INSERT INTO yd_accounts (org_id, kind, email) VALUES ($1,'building_user',$2) RETURNING id`, [org.id, buEmail]))[0];
  await q(`INSERT INTO yd_account_buildings (org_id, account_id, building_id) VALUES ($1,$2,$3)`, [org.id, acct.id, app.building_id]);

  const bpage = await ctx.newPage();
  bpage.on("dialog", (d) => d.dismiss());
  await bpage.goto(`${BASE}/yesdoor/building.html`);
  await bpage.locator("#login-email").waitFor();
  await bpage.fill("#login-email", buEmail);
  await bpage.click("#login-send");
  await waitText(bpage, "Check your email");
  await shot(bpage, "building-link-sent", [{ sel: "#login-out", label: "Sign-in link queued (yd_outbox, nothing sent)" }]);
  const link = (await q(
    `SELECT context->'magic_link'->>'url' AS url FROM yd_outbox WHERE to_address = $1 AND template_key = 'yd-magic-link' ORDER BY created_at DESC LIMIT 1`, [buEmail]))[0];
  step("the emailed link points at /yesdoor/login.html", !!link && /\/yesdoor\/login\.html\?t=/.test(link.url), link ? link.url.replace(/t=.*/, "t=…") : "none");
  await bpage.goto(link.url);
  await bpage.waitForURL(/building\.html/, { timeout: 15000 });
  await bpage.locator("#tbl").waitFor();
  await shot(bpage, "building-renters", [{ sel: "#tbl", label: "The renter Yesdoor sent: our answer, income, tier, no report" }, { sel: ".kpis", label: "Renters to update" }]);

  async function move(stage, extra) {
    await bpage.locator(`[data-update="${app.id}"]`).click();
    await bpage.locator("#up-stage").waitFor();
    await bpage.selectOption("#up-stage", stage);
    if (extra) await extra();
    await bpage.click("#up-go");
    await bpage.locator("#up-stage").waitFor({ state: "detached", timeout: 15000 });
    await bpage.locator("#tbl").waitFor();
    const st = (await q(`SELECT stage FROM yd_applications WHERE id = $1`, [app.id]))[0].stage;
    return st;
  }
  step("building marks toured", (await move("toured")) === "toured");
  step("building marks applied", (await move("applied")) === "applied");
  step("building marks approved", (await move("approved")) === "approved");
  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10);
  const start = new Date(today.getTime() + 3 * 86400000);
  const end = new Date(start.getTime() + 365 * 86400000);
  const leaseStage = await move("lease_signed", async () => {
    await bpage.fill("#up-start", ymd(start));
    await bpage.fill("#up-end", ymd(end));
    await bpage.fill("#up-rent", "1650");
  });
  step("building marks lease signed (dates and rent)", leaseStage === "lease_signed");
  await bpage.locator(`[data-update="${app.id}"]`).click();
  await bpage.selectOption("#up-stage", "moved_in");
  await shot(bpage, "building-move-in", [{ sel: "#up-stage", label: "Moved in" }, { sel: "#up-extra .notice", label: "Confirming sends the invoice" }]);
  await bpage.click("#up-go");
  await bpage.locator("#up-stage").waitFor({ state: "detached", timeout: 15000 });
  const afterMove = (await q(`SELECT stage FROM yd_applications WHERE id = $1`, [app.id]))[0].stage;
  step("moved in earns the fee and issues the invoice", afterMove === "invoiced", afterMove);
  await bpage.goto(`${BASE}/yesdoor/building.html#invoices`);
  await bpage.locator("#inv-t").waitFor();
  await waitText(bpage, "YD-");
  await shot(bpage, "building-invoice", [{ sel: "#inv-t", label: "Invoice with the proof: registered time, unit, move-in, term" }, { sel: ".kpis", label: "Open to pay" }]);

  // Rules: save a new dated version.
  await bpage.goto(`${BASE}/yesdoor/building.html#rules`);
  await bpage.locator("#rf").waitFor();
  const before = (await q(`SELECT max(version) AS v FROM yd_building_rules WHERE building_id = $1`, [app.building_id]))[0].v;
  await bpage.fill("#r-score", "640");
  await bpage.click("#r-go");
  await waitText(bpage, `version ${before + 1}`);
  const after = (await q(`SELECT max(version) AS v FROM yd_building_rules WHERE building_id = $1`, [app.building_id]))[0].v;
  step("building saves its rules as a new version", after === before + 1, `v${before} -> v${after}`);
  await shot(bpage, "building-rules", [{ sel: "#rf", label: "Rules form (minimum score now 640)" }, { sel: "aside.card", label: `Version history: now version ${after}` }]);

  // Listings: add one unit.
  await bpage.goto(`${BASE}/yesdoor/building.html#listings`);
  await bpage.locator("#lf").waitFor();
  const unit = `I1-${RUN}`.slice(0, 12);
  await bpage.fill("#l-unit", unit);
  await bpage.fill("#l-rent", "1500");
  await bpage.fill("#l-beds", "1");
  await bpage.click("#l-go");
  await waitText(bpage, unit);
  const added = (await q(`SELECT rent_cents FROM yd_listings WHERE building_id = $1 AND unit_label = $2`, [app.building_id, unit]))[0];
  step("building adds a listing", added && Number(added.rent_cents) === 150000, added ? `$${Number(added.rent_cents) / 100}` : "none");
  await bpage.getByText(unit).first().scrollIntoViewIfNeeded();
  await shot(bpage, "building-listings", [{ sel: "#ltbl", label: `Unit ${unit} added at $1,500` }]);

  /* ---------------------------------------------------------- 8. staff */
  const spage = await ctx.newPage();
  spage.on("dialog", (d) => d.dismiss());
  await spage.goto(`${BASE}/yesdoor/staff.html`);
  await spage.locator('a[href^="/login.html"]').waitFor();
  await shot(spage, "staff-signin", [{ sel: 'a[href^="/login.html"]', label: "Staff use the staff login" }]);
  // The Fundhub staff login (this local run uses DEFAULT_ORG_SLUG=yesdoor, as Yesdoor's own deploy will).
  const login = await spage.request.post(`${BASE}/api/auth/login`, { data: { email: STAFF_EMAIL, password: STAFF_PASSWORD } });
  const lj = await login.json();
  step("staff password login (POST /api/auth/login)", login.ok() && !!lj.token, `HTTP ${login.status()}`);
  await spage.evaluate((t) => localStorage.setItem("fh_token", t), lj.token);
  await spage.goto(`${BASE}/yesdoor/staff.html`);
  await spage.locator("#ptbl").waitFor({ timeout: 15000 });
  await shot(spage, "staff-pipeline", [{ sel: ".kpis", label: "Needs attention, open, leases, renters" }, { sel: "#ptbl", label: "Priya's application, invoiced" }]);

  // Add a building, send its agreement.
  await spage.goto(`${BASE}/yesdoor/staff.html#buildings`);
  await spage.locator("#add-b").waitFor();
  await spage.click("#add-b");
  const bName = `I1 Test Lofts ${RUN}`;
  await spage.fill("#ab-name", bName);
  await spage.fill("#ab-addr", "100 E Test St");
  await spage.fill("#ab-city", "Phoenix");
  await spage.fill("#ab-zip", "85004");
  await spage.fill("#ab-email", `leasing+new-${RUN}@building.example`);
  await shot(spage, "staff-add-building", [{ sel: "#ab", label: "Onboard a building (starts as a target)" }]);
  await spage.click("#ab-go");
  await spage.locator("#ab").waitFor({ state: "detached", timeout: 15000 });
  const nb = (await q(`SELECT id, status FROM yd_buildings WHERE name = $1`, [bName]))[0];
  step("staff onboard a building", nb && nb.status === "target", nb ? nb.status : "none");
  await spage.locator(`[data-agree="${nb.id}"]`).waitFor();
  await spage.locator(`[data-agree="${nb.id}"]`).click();
  await spage.click("#ag-go");
  await spage.waitForTimeout(800);
  const sent = (await q(`SELECT status FROM yd_buildings WHERE id = $1`, [nb.id]))[0].status;
  step("staff send the fee agreement", sent === "agreement_sent", sent);
  const sign = (await q(
    `SELECT context->'signing'->>'url' AS url, context FROM yd_outbox WHERE related_kind = 'agreement' OR template_key LIKE '%agreement%' ORDER BY created_at DESC LIMIT 1`))[0];
  const signUrl = sign && (sign.url || (sign.context && (sign.context.signing_url || (sign.context.agreement && sign.context.agreement.url))));
  const wh = await spage.request.post(`${BASE}/api/yesdoor/webhooks/esign`, { data: { url: signUrl, signerName: "Lee Leasing" } });
  const whj = await wh.json().catch(() => ({}));
  const signed = (await q(`SELECT status FROM yd_buildings WHERE id = $1`, [nb.id]))[0].status;
  step("sandbox e-sign webhook signs it", wh.ok() && signed === "signed", `HTTP ${wh.status()} ${whj.status || whj.error || ""}; building ${signed}`);
  await spage.goto(`${BASE}/yesdoor/staff.html#pipeline`);
  await spage.goto(`${BASE}/yesdoor/staff.html#buildings`);
  await spage.locator("#bt").waitFor();
  await spage.getByText(bName).first().scrollIntoViewIfNeeded();
  await shot(spage, "staff-building-signed", [{ sel: "#bt", label: `${bName}: Signed after the webhook` }]);

  // Log the building's payment.
  await spage.goto(`${BASE}/yesdoor/staff.html#money`);
  await spage.locator("[data-pay]").first().waitFor({ timeout: 15000 });
  await spage.locator("[data-pay]").first().click();
  await spage.selectOption("#pm", "ach");
  await spage.fill("#pr", `ACH-${RUN}`);
  await shot(spage, "staff-log-payment", [{ sel: "#pf", label: "Log the building's payment, with its reference" }]);
  await spage.click("#pgo");
  await spage.locator("#pf").waitFor({ state: "detached", timeout: 15000 });
  const paid = (await q(`SELECT stage FROM yd_applications WHERE id = $1`, [app.id]))[0].stage;
  step("staff log payment: invoice paid, placement paid", paid === "paid", paid);
  await spage.locator("#mi").waitFor();
  await shot(spage, "staff-money-paid", [{ sel: "#mi", label: "Invoice paid by ACH" }, { sel: ".kpis", label: "Paid, inside the 60-day window" }]);

  /* ---------------------------------------------------------- 9. broker portal */
  const kpage = await ctx.newPage();
  kpage.on("dialog", (d) => d.dismiss());
  await kpage.goto(`${BASE}/yesdoor/broker.html`);
  await kpage.locator("#login-email").waitFor();
  await kpage.fill("#login-email", brEmail);
  await kpage.click("#login-send");
  await waitText(kpage, "Check your email");
  const blink = (await q(
    `SELECT context->'magic_link'->>'url' AS url FROM yd_outbox WHERE to_address = $1 AND template_key = 'yd-magic-link' ORDER BY created_at DESC LIMIT 1`, [brEmail]))[0];
  await kpage.goto(blink.url);
  await kpage.waitForURL(/broker\.html/, { timeout: 15000 });
  await kpage.locator("#money").waitFor();
  const held = (await q(`SELECT status, amount_cents FROM yd_broker_ledger WHERE broker_id = $1`, [broker.id]))[0];
  step("broker share is held after the building paid", held && held.status === "held", held ? `${held.status} $${Number(held.amount_cents) / 100}` : "none");
  await shot(kpage, "broker-money", [{ sel: ".kpis", label: "Held: the building paid, the 60-day hold runs" }, { sel: "#money", label: "One row for the renter this broker sent" }]);
  await kpage.goto(`${BASE}/yesdoor/broker.html#renters`);
  await kpage.locator("#rt table, #rt .empty").first().waitFor();
  await shot(kpage, "broker-renters", [{ sel: "#rt", label: "Name and stage only, no credit details" }]);
  await kpage.goto(`${BASE}/yesdoor/broker.html#link`);
  await kpage.locator("#lk-url").waitFor();
  const shareUrl = await kpage.locator("#lk-url").inputValue();
  step("broker link page shows the shareable ?b= link", shareUrl.includes(`b=${code}`), shareUrl);
  await shot(kpage, "broker-link", [{ sel: "#lk-url", label: "The link renters start from" }]);

  /* ---------------------------------------------------------- 10. demo mode still works */
  const dpage = await ctx.newPage();
  await dpage.goto(`${BASE}/yesdoor/search.html?demo=1`);
  await dpage.locator(".listing-card").first().waitFor();
  step("demo mode still renders (?demo=1)", await dpage.evaluate(() => window.YD.api.isDemo()));
  await dpage.goto(`${BASE}/yesdoor/search.html?demo=0`);

  step("no page errors in the browser", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  await browser.close();
  await pool.end();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error("CLICK PATH STOPPED:", e && e.message ? e.message : e);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} steps passed before the stop`);
  await pool.end().catch(() => {});
  process.exit(1);
});
