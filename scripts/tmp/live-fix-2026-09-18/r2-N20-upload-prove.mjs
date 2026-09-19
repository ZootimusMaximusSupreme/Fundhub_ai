// N20 — AFTER SHIP prove on live. Opens #13 Thirteen-NoBook's portal as staff,
// finds the "Inquiry documents" box by its words, checks its type list, picks
// "Proof of address", and (only with --send) sends ONE made-up sim image through
// that box. Then reads the live documents list and reports what the new row was
// filed as. The image is drawn here: plain text "SIM TEST — not a real
// document", no name, no address, nothing real.
//
// Every non-GET request is aborted except the one sign-in POST and, with
// --send only, exactly one POST /api/documents-upload. Never prints a secret.
//
// Side effect of --send, measured 2026-09-18 19:55 UTC: #13 has three Queued
// inquiry cases, no signed authorization and no DOC-01 lock, so the upload may
// queue EMAIL-DOC-01-REQUEST to #13's sim inbox and SMS-DOC-01-REQUEST to the
// agent phone ending 4248 — both test contacts.
//
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-N20-upload-prove.mjs <tag> [--send]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const TAG = process.argv[2] || "prove";
const SEND = process.argv.includes("--send");
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N20";
const SIM = `${OUT}/sim-proof-of-address.png`;
// --local-page: pre-ship dry run only — serve the page from this worktree. Never with --send.
const LOCAL = process.argv.includes("--local-page");
if (LOCAL && SEND) throw new Error("--local-page is a dry run; it never sends");
const LOCAL_PORTAL = LOCAL
  ? readFileSync(new URL("../../../public/app/client-portal.html", import.meta.url), "utf8")
  : null;
mkdirSync(OUT, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");

const out = { at: new Date().toISOString(), tag: TAG, send: SEND, blocked: [], uploads: [] };
let uploadsLeft = SEND ? 1 : 0;

const browser = await chromium.launch({ headless: true });

// --- draw the sim image (no network in this context) ---
{
  const c = await browser.newContext({ viewport: { width: 850, height: 1100 } });
  const p = await c.newPage();
  await p.setContent(`<body style="margin:0;font:28px/1.5 sans-serif;background:#fff;color:#111">
    <div style="margin:60px;border:6px dashed #c00;padding:40px">
    <h1 style="color:#c00">SIM TEST — NOT A REAL DOCUMENT</h1>
    <p>Proof of address (sim)</p><p>Made by the N20 fix prove, ${new Date().toISOString().slice(0, 10)}.</p>
    <p>No real name, no real address.</p></div></body>`);
  await p.screenshot({ path: SIM });
  await c.close();
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method();
  const p = new URL(r.url()).pathname;
  if (LOCAL && m === "GET" && p === "/app/client-portal.html") {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: LOCAL_PORTAL });
  }
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  if (m === "POST" && p === "/api/documents-upload" && uploadsLeft > 0) { uploadsLeft -= 1; return route.continue(); }
  out.blocked.push(`${m} ${p}`);
  return route.abort();
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", pw);
const lrP = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/login" && r.request().method() === "POST");
await page.click("#go");
out.login = (await lrP).status();
await page.waitForTimeout(2500);
if (out.login !== 200) { console.log(JSON.stringify(out, null, 2)); await browser.close(); process.exit(1); }

async function apiDocs() {
  const r = await ctx.request.get(`${BASE}/api/read/documents?client_id=${ID}`);
  let j = null; try { j = await r.json(); } catch { /* not json */ }
  const list = j?.documents || j?.data?.documents || j?.items || (Array.isArray(j?.data) ? j.data : []) || [];
  return { status: r.status(), count: list.length, rows: list.map((d) => ({ kind: d.kind, subtype: d.subtype, title: d.title, created_at: d.created_at })) };
}
out.apiBefore = await apiDocs();

page.on("response", async (res) => {
  if (new URL(res.url()).pathname !== "/api/documents-upload") return;
  let body = null;
  try { const j = await res.json(); body = { ok: j.ok, error: j.error, kinds: (j.documents || []).map((d) => `${d.kind}/${d.subtype}`) }; } catch { /* not json */ }
  out.uploads.push({ status: res.status(), body });
});

await page.goto(`${BASE}/app/client-portal.html?id=${ID}`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Upload inquiry docs" }).first().waitFor({ state: "visible", timeout: 30000 });
await page.waitForTimeout(4000);

const box = page.locator(".upload-door")
  .filter({ has: page.getByText("Inquiry documents", { exact: true }) })
  .filter({ has: page.getByRole("button", { name: "Upload inquiry docs" }) });
out.boxCount = await box.count();
await box.first().evaluate((e) => e.setAttribute("data-n20", "box"));
const theBox = page.locator('[data-n20="box"]');
const sel = theBox.locator("select");
out.note = await page.locator("#doc-agent-note").textContent();
out.options = await sel.evaluate((s) => Array.from(s.options).map((o) => o.textContent.trim()));
await sel.selectOption({ label: "Proof of address" });
out.picked = await sel.evaluate((s) => s.value);

const BTN_RE = /Upload inquiry docs|Send \d+ files?|Sent|Try again|Sending/;
const btn = theBox.getByRole("button", { name: BTN_RE }).first();
const chooserP = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null);
await btn.click();
const chooser = await chooserP;
out.chooserInsideBox = chooser ? await chooser.element().evaluate((i) => !!i.closest('[data-n20="box"]')) : false;
if (chooser) await chooser.setFiles(SIM);
await page.waitForTimeout(800);
out.buttonAfterPick = (await btn.textContent())?.trim();

async function shot(file, legend) {
  await sel.evaluate((s) => s.setAttribute("data-n20", "sel"));
  await btn.evaluate((b) => b.setAttribute("data-n20", "btn"));
  await theBox.scrollIntoViewIfNeeded();
  await page.evaluate((legend) => {
    document.querySelectorAll(".n20-mark").forEach((e) => e.remove());
    ["sel", "btn"].forEach((k, i) => {
      const el = document.querySelector(`[data-n20="${k}"]`); if (!el) return;
      const r = el.getBoundingClientRect();
      const d = document.createElement("div"); d.className = "n20-mark";
      Object.assign(d.style, { position: "fixed", left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`,
        border: "4px solid #e00", borderRadius: "6px", zIndex: 2147483646, pointerEvents: "none", boxSizing: "border-box" });
      const n = document.createElement("div"); n.textContent = String(i + 1);
      Object.assign(n.style, { position: "absolute", left: "-16px", top: "-16px", width: "28px", height: "28px", borderRadius: "50%", background: "#e00", color: "#fff", font: "bold 16px/28px sans-serif", textAlign: "center" });
      d.appendChild(n); document.body.appendChild(d);
    });
    const lg = document.createElement("div"); lg.className = "n20-mark";
    Object.assign(lg.style, { position: "fixed", left: "12px", bottom: "12px", maxWidth: "900px", background: "#fff", color: "#111", border: "3px solid #e00",
      padding: "10px 14px", font: "15px/1.45 sans-serif", zIndex: 2147483647, pointerEvents: "none", whiteSpace: "pre-line" });
    lg.textContent = legend; document.body.appendChild(lg);
  }, legend);
  await page.screenshot({ path: `${OUT}/${file}` });
  await page.evaluate(() => document.querySelectorAll(".n20-mark").forEach((e) => e.remove()));
}
await shot(`${TAG}-1-picked.png`, `N20 ${TAG} — #13 portal (${LOCAL ? "fixed page from the branch, not shipped, on live data — dry run" : "live page"}), "Inquiry documents" box\n1 = type list, picked: "Proof of address"\n2 = button after choosing the sim image: "${out.buttonAfterPick}"`);

if (SEND && /^Send 1 file$/.test(out.buttonAfterPick || "")) {
  const respP = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/documents-upload", { timeout: 45000 }).catch(() => null);
  await btn.click();
  await respP;
  await page.waitForTimeout(2500);
  out.buttonAfterSend = (await btn.textContent())?.trim();
  out.apiAfter = await apiDocs();
  const before = new Set(out.apiBefore.rows.map((r) => r.created_at));
  out.newRows = out.apiAfter.rows.filter((r) => !before.has(r.created_at));
  await shot(`${TAG}-2-sent.png`, `N20 ${TAG} — pressed Send once\n1 = type list: "Proof of address"\n2 = button: "${out.buttonAfterSend}"\nNew row on #13: ${out.newRows.map((r) => `${r.kind}/${r.subtype} "${r.title}"`).join(", ") || "none"}\n#13 documents: ${out.apiBefore.count} → ${out.apiAfter.count}`);
}

writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
