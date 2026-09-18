// HOLE 15 VERIFY — one Apply click on Sim Eight-Funding's control panel, live.
// Only POST /api/proxy/launch may leave the page. Every other non-GET is
// blocked, and so is any page load on a host that is not fundhub.ai (no bank
// page). Counts messages rows for #8 before and after (no new notify).
// Never prints tokens, passwords or the proxy username.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { db, close } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const CLIENT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const OUT = "/tmp/live-fix-2026-09-18/h15";
mkdirSync(OUT, { recursive: true });

const staff = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = 'chris@fundhub.ai' LIMIT 1`
)).rows[0];
const msgCount = async () => (await db.query(
  `SELECT count(*)::int AS n FROM messages WHERE client_id = $1`, [CLIENT]
)).rows[0].n;
const msgsBefore = await msgCount();
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });

const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);

const blocked = [];
let launchPosts = 0;
await context.route("**/*", (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const isFundhub = url.hostname === "fundhub.ai" || url.hostname.endsWith(".fundhub.ai");
  if (req.method() !== "GET" && req.method() !== "HEAD" && req.method() !== "OPTIONS") {
    if (isFundhub && url.pathname === "/api/proxy/launch" && launchPosts === 0) {
      launchPosts++;
      return route.continue();
    }
    blocked.push(`${req.method()} ${url.hostname}${url.pathname}`);
    return route.abort();
  }
  if (req.resourceType() === "document" && !isFundhub) {
    blocked.push(`DOC ${url.hostname}${url.pathname}`);
    return route.abort();
  }
  return route.continue();
});

const page = await context.newPage();
const popups = [];
context.on("page", (p) => popups.push(p.url()));

await page.goto(`${BASE}/app/client-control-panel.html?id=${CLIENT}`, { waitUntil: "domcontentloaded" });
const btn = page.locator('button[data-fh-apply="1"]').first();
await btn.waitFor({ state: "visible", timeout: 45000 });
const lenderName = await btn.evaluate((b) => {
  const row = b.closest("[class*=lender]") || b.parentElement;
  const n = row && row.querySelector(".lender-name");
  return n ? n.textContent : null;
});

const respPromise = page.waitForResponse(
  (r) => r.url().includes("/api/proxy/launch") && r.request().method() === "POST",
  { timeout: 90000 }
);
await btn.click(); // THE one Apply click
const resp = await respPromise;
const status = resp.status();
let body = null;
try { body = await resp.json(); } catch { body = null; }
await page.waitForTimeout(2500);
const modalText = await page.evaluate(() => {
  const els = [...document.querySelectorAll("div,section,dialog")]
    .filter((e) => /Could not start Apply proxy|Verified exit|Starting proxy/.test(e.textContent || ""));
  const el = els.sort((a, b) => a.textContent.length - b.textContent.length)[0];
  return el ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 700) : null;
});
await page.screenshot({ path: `${OUT}/after-apply.png`, fullPage: false });

const msgsAfter = await msgCount();
const session = body && body.session_id ? (await db.query(
  `SELECT id, status, error_code, left(coalesce(error_message, ''), 200) AS error_message, started_at
     FROM proxy_sessions WHERE id = $1`, [body.session_id]
)).rows[0] || null : null;

const safeAttempts = Array.isArray(body && body.attempts)
  ? body.attempts.map((a) => ({ level: a.level, matched: a.matched, reason: a.reason }))
  : undefined;
const out = {
  lender_clicked: lenderName,
  apply_clicks: 1,
  launch_posts_sent: launchPosts,
  http: status,
  error: body && body.error,
  message: body && body.message,
  next_step: body && body.next_step,
  attempts: safeAttempts,
  ok: body && body.ok,
  session_row: session,
  modal: modalText,
  popups,
  blocked,
  messages_for_8_before: msgsBefore,
  messages_for_8_after: msgsAfter,
};
writeFileSync(`${OUT}/verify.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
await close();
process.exit(0);
