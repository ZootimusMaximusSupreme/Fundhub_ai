// HOLE 17 VERIFY — inquiry upload door on #13 Thirteen-NoBook, live.
// Signs in through the real login page, opens #13's portal as the owner, and
// uses the "Inquiry documents" door the way a person does: pick the type, press
// the door's own button, choose one sim photo, press "Send 1 file".
//
// Every non-GET request is aborted EXCEPT the one sign-in POST and, only when
// run with --send, exactly ONE POST /api/documents-upload. Without --send the
// file is picked but never sent (look only).
// Never prints a password, token or cookie.
//
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h17-verify.mjs <tag> [--send]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const BASE = "https://fundhub.ai";
const INQ = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const TAG = process.argv[2] || "verify";
const SEND = process.argv.includes("--send");
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-17";
const SIM = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/sim-documents/08/photo-id-1.png";
mkdirSync(SHOTS, { recursive: true });
if (!existsSync(SIM)) throw new Error("sim photo missing");

const out = { at: new Date().toISOString(), tag: TAG, send: SEND, blocked: [], uploads: [] };
const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

let uploadsLeft = SEND ? 1 : 0;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const path = new URL(req.url()).pathname;
  if (m === "POST" && path === "/api/auth/login") return route.continue();
  if (m === "POST" && path === "/api/documents-upload" && uploadsLeft > 0) {
    uploadsLeft -= 1;
    return route.continue();
  }
  out.blocked.push(`${m} ${path}`);
  return route.abort();
});

const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", password);
const loginResp = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
const lr = await loginResp;
out.login = { status: lr.status() };
await page.waitForTimeout(2500);
out.role = await page.evaluate(() => localStorage.getItem("fh_role"));
if (lr.status() !== 200) {
  writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

async function docCount() {
  const r = await ctx.request.get(`${BASE}/api/read/documents?client_id=${INQ}`);
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  const list = j?.documents || j?.data?.documents || j?.items || j?.data?.items || (Array.isArray(j?.data) ? j.data : null) || [];
  return { status: r.status(), count: Array.isArray(list) ? list.length : null,
    rows: Array.isArray(list) ? list.map((d) => ({ kind: d.kind, subtype: d.subtype, created_at: d.created_at })) : null,
    keys: j ? Object.keys(j) : null };
}
out.docsBefore = await docCount();

// Watch every upload request the page makes.
page.on("request", (req) => {
  if (new URL(req.url()).pathname === "/api/documents-upload") {
    out.uploads.push({ phase: "request", method: req.method(), at: new Date().toISOString() });
  }
});
page.on("response", async (res) => {
  if (new URL(res.url()).pathname === "/api/documents-upload") {
    let body = null;
    try { const j = await res.json(); body = { ok: j.ok, error: j.error, n: (j.documents || []).length,
      kinds: (j.documents || []).map((d) => `${d.kind}/${d.subtype}`), docs_missing: j.docs_missing }; } catch { body = null; }
    out.uploads.push({ phase: "response", status: res.status(), body });
  }
});
page.on("requestfailed", (req) => {
  if (new URL(req.url()).pathname === "/api/documents-upload") {
    out.uploads.push({ phase: "failed", error: req.failure()?.errorText });
  }
});

await page.goto(`${BASE}/app/client-portal.html?id=${INQ}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);

// Which doors does a person actually see?
out.doors = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll("input[type=file]"));
  return {
    bodyClass: document.body.className,
    fileInputs: inputs.map((i) => ({
      door: i.closest(".upload-door")?.getAttribute("data-kind") || i.id || i.name || "(not in a door)",
      doorVisible: !!(i.closest(".upload-door") || i).offsetParent || !!(i.closest(".upload-door")?.getClientRects().length),
    })),
    doors: Array.from(document.querySelectorAll(".upload-door")).map((d) => ({
      kind: d.getAttribute("data-kind"),
      visible: d.getClientRects().length > 0,
      button: d.querySelector("[data-upload-btn]")?.textContent.trim(),
    })),
    note: document.getElementById("action-sub")?.innerText,
  };
});

const door = page.locator('.upload-door[data-kind="inquiry_doc"]');
out.inquiryDoorVisible = await door.isVisible();
await page.locator("#action-card").scrollIntoViewIfNeeded();
await page.locator("#action-card").screenshot({ path: `${SHOTS}/${TAG}-1-door.png` });

if (out.inquiryDoorVisible) {
  // Pick the honest type for this picture: it is a photo ID, not an FTC report.
  await door.locator("[data-subtype]").selectOption("id_document");
  const btn = door.locator("[data-upload-btn]");
  const chooserP = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null);
  await btn.click();
  const chooser = await chooserP;
  out.fileChooserOpened = !!chooser;
  if (chooser) await chooser.setFiles(SIM);
  await page.waitForTimeout(800);
  out.buttonAfterPick = (await btn.textContent())?.trim();
  await page.locator("#action-card").screenshot({ path: `${SHOTS}/${TAG}-2-picked.png` });

  if (SEND && /^Send 1 file$/.test(out.buttonAfterPick || "")) {
    const respP = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/documents-upload", { timeout: 30000 }).catch(() => null);
    await btn.click();
    await respP;
    await page.waitForTimeout(1500);
    out.buttonAfterSend = (await btn.textContent())?.trim();
    await page.locator("#action-card").screenshot({ path: `${SHOTS}/${TAG}-3-sent.png` });
  }
}

await page.waitForTimeout(1500);
out.docsAfter = await docCount();

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
