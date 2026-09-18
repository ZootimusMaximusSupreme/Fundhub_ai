// r12 optional — LOOK ONLY. Other clients where the saved next action differs from what the screen shows.
// Password sign-in, pipeline → Fulfillment (view switch only), read the row chip + the API it read,
// then compare with the saved value read from the live database (BEGIN READ ONLY).
// Blocks every non-GET except the one sign-in POST. Never prints a password, token or cookie.
import { chromium } from "playwright";
import pg from "pg";

const BASE = "https://fundhub.ai";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");

// saved values, read only
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
let saved = [];
let cct = [];
try {
  await c.query("BEGIN READ ONLY");
  saved = (await c.query(`select id, first_name||' '||last_name nm, custom_fields->>'employee_next_action' saved, updated_at from clients
    where org_id=(select org_id from clients where id='d682c13b-11f3-4bd5-a0c5-232b6a7875c4') and custom_fields ? 'employee_next_action'`)).rows;
  cct = (await c.query(`select * from client_custom_fields where client_id='d682c13b-11f3-4bd5-a0c5-232b6a7875c4' limit 3`).catch((e) => ({ rows: [{ error: e.message.slice(0, 120) }] }))).rows;
  await c.query("ROLLBACK");
} finally { await c.end(); }
console.log("#8 client_custom_fields row(s):", JSON.stringify(cct).slice(0, 600));

const blocked = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const p = new URL(r.url()).pathname;
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  blocked.push(`${m} ${p}`); return route.abort();
});
const lp = await ctx.newPage();
await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await lp.fill("#email", "chris@fundhub.ai");
await lp.fill("#pw", pw);
const lr = lp.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await lp.click("#go");
const st = (await lr).status();
await lp.waitForTimeout(2500);
await lp.close();
if (st !== 200) { console.log("sign-in failed", st); await browser.close(); process.exit(1); }

const page = await ctx.newPage();
let fx = null;
page.on("response", async (res) => {
  const u = new URL(res.url());
  if (u.pathname === "/api/dashboard/clients" && u.searchParams.get("fulfillment") === "1") { try { fx = await res.json(); } catch {} }
});
await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#lensFulfillment", { timeout: 20000 });
await page.waitForTimeout(1500);
await page.click("#lensFulfillment");
for (let i = 0; i < 100 && !fx; i++) await page.waitForTimeout(200);
await page.waitForTimeout(2500);
const chips = await page.evaluate(() => Array.from(document.querySelectorAll(".fh-lens-row")).map((r) => ({
  name: r.querySelector(".lr-name")?.innerText.trim(), chip: r.querySelector("button.fh-chip")?.innerText.trim() ?? null,
})));
await browser.close();

const rows = fx?.clients || [];
console.log(`fulfillment API rows: ${rows.length}; screen rows: ${chips.length}`);
for (const s of saved) {
  const r = rows.find((x) => x.id === s.id);
  const chip = chips.find((x) => x.name === s.nm)?.chip ?? null;
  const shown = r?.next_action?.label ?? null;
  console.log(`${s.saved === shown ? "AGREE   " : "DISAGREE"} ${s.nm} (${s.id}) saved=${JSON.stringify(s.saved)} (row updated ${new Date(s.updated_at).toISOString()}) api.next_action=${JSON.stringify(shown)} degraded=${r?.next_action_degraded} chip=${JSON.stringify(chip)}`);
}
console.log("blocked non-GET:", JSON.stringify(blocked));
