// HOLE N22 — LOOK ONLY. Is the owner's staff profile photo on live the sim
// photo ID (docs/workflows/sim-documents/08/photo-id-1.png)?
//
// Three looks, none of them writes:
//   1. The screen: sign in on the real login page as the owner, open a staff
//      page, read the header photo chip (#fh-shell-avatar), screenshot it.
//      Every non-GET request is blocked except the one sign-in POST.
//   2. The API the chip uses: GET /api/auth/session (avatarUrl) and
//      GET /api/staff/avatar (the bytes), sha256 compared to the sim file.
//   3. The row: BEGIN READ ONLY on the live database — does the owner's
//      staff.avatar_key exist, and does its content-addressed path carry the
//      sim file's sha256? Prints yes/no only, never the key (it is a bearer
//      credential under the blob provider).
// Never prints a password, token, cookie, storage key or full email.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n22-verify.mjs <tag>
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, close } from "../../../src/db.mjs";

const BASE = "https://fundhub.ai";
const OWNER = "chris@fundhub.ai";
const TAG = process.argv[2] || "verify";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N22";
mkdirSync(SHOTS, { recursive: true });

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SIM = readFileSync(join(REPO, "docs/workflows/sim-documents/08/photo-id-1.png"));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const SIM_SHA = sha(SIM);

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

const out = { at: new Date().toISOString(), tag: TAG, sim_file: { bytes: SIM.length, sha256: SIM_SHA }, blocked: [] };

// ── 1 + 2. The screen and the API, one signed-in browser.
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const path = new URL(req.url()).pathname;
  if (m === "POST" && path === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${path}`);
  return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", OWNER);
await page.fill("#pw", password);
const loginResp = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
const lr = await loginResp;
out.login = { status: lr.status() };
if (lr.status() !== 200) {
  writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2000);
out.landed = new URL(page.url()).pathname;

// Two looks at the chip, a fresh page load each time.
out.chip = [];
for (const n of [1, 2]) {
  await page.goto(`${BASE}/app/calendar.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#fh-shell-avatar", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const chip = await page.evaluate(() => {
    const el = document.getElementById("fh-shell-avatar");
    if (!el) return { present: false };
    const r = el.getBoundingClientRect();
    return {
      present: true,
      tag: el.tagName.toLowerCase(),
      src: el.getAttribute("src"),
      label: el.getAttribute("aria-label") || el.getAttribute("alt"),
      title: el.getAttribute("title"),
      text: (el.textContent || "").trim(),
      naturalWidth: el.naturalWidth || null,
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  });
  out.chip.push({ look: n, ...chip });
  await page.screenshot({ path: `${SHOTS}/${TAG}-look${n}-page.png` });
  if (chip.present && chip.box) {
    const b = chip.box;
    const pad = 120;
    await page.screenshot({
      path: `${SHOTS}/${TAG}-look${n}-chip.png`,
      clip: { x: Math.max(0, b.x - pad * 2), y: Math.max(0, b.y - 20), width: pad * 3, height: 60 },
    });
  }
}

const sess = await ctx.request.get(`${BASE}/api/auth/session`);
let sj = null;
try { sj = await sess.json(); } catch { sj = null; }
out.api_session = { status: sess.status(), role: sj?.staff?.role ?? null, avatarUrl: sj?.staff?.avatarUrl ?? null };

const av = await ctx.request.get(`${BASE}/api/staff/avatar`);
const avBody = Buffer.from(await av.body());
const avType = av.headers()["content-type"] || "";
out.api_avatar = {
  status: av.status(),
  type: avType,
  bytes: avBody.length,
  sha256: avType.startsWith("image/") ? sha(avBody) : null,
  is_sim_photo_id: avType.startsWith("image/") ? sha(avBody) === SIM_SHA : false,
  body: avType.includes("json") ? JSON.parse(avBody.toString("utf8") || "null") : undefined,
};
if (avType.startsWith("image/")) writeFileSync(`${SHOTS}/${TAG}-avatar-bytes.${avType.includes("png") ? "png" : "jpg"}`, avBody);
await browser.close();

// ── 3. The row, read only.
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const rows = (await c.query(
    `SELECT id, org_id, role, status, updated_at,
            avatar_key IS NOT NULL AS has_photo,
            coalesce(position($2 in avatar_key) > 0, false) AS key_is_sim_photo
       FROM staff WHERE lower(email) = lower($1)`, [OWNER, SIM_SHA])).rows;
  out.db_owner_rows = rows;
  out.db_all_staff = (await c.query(
    `SELECT count(*)::int AS staff,
            count(*) FILTER (WHERE avatar_key IS NOT NULL)::int AS with_photo,
            count(*) FILTER (WHERE position($1 in coalesce(avatar_key, '')) > 0)::int AS with_sim_photo
       FROM staff`, [SIM_SHA])).rows[0];
  await c.query("ROLLBACK");
} finally {
  c.release();
  await close();
}

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
