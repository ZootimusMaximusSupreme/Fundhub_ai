// rr2-n11 reviewer — ONE live sim sign-up through the homepage survey (the write
// named in the N11 fixer's reviewer_steps). Email goes to a plus-tag of the sim
// prove inbox (same base as sim-13). No phone, no SMS consent -> no text, no call.
// Every non-GET request is blocked except exactly one POST /api/public/survey-submit.
// Prints no email. Run 2026-09-18 as `a` (19:54 UTC) and `b` (20:03 UTC).
import pg from "pg";
import { chromium } from "playwright";
const LABEL = process.argv[2] || "a";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N11/review";
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN READ ONLY");
const base = (await c.query(`SELECT email FROM clients WHERE id = '7ccbeb76-df98-4125-8c14-0d1c9f5e3042'`)).rows[0].email;
await c.query("ROLLBACK"); await c.end();
const m = base.match(/^([^+@]+)\+[^@]*@(.+)$/);
if (!m) throw new Error("sim-13 email has no plus tag; stop");
const tag = `sim-rr2n11${LABEL}-${stamp}`;
const email = `${m[1]}+${tag}@${m[2]}`;
console.log(`plus-tag ${tag}`);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
let allowedPosts = 0; const blocked = [];
await page.route("**/*", async (route) => {
  const r = route.request(); const meth = r.method(); const u = new URL(r.url());
  if (meth === "GET" || meth === "HEAD" || meth === "OPTIONS") return route.continue();
  if (meth === "POST" && u.hostname === "fundhub.ai" && u.pathname === "/api/public/survey-submit" && allowedPosts === 0) { allowedPosts += 1; return route.continue(); }
  blocked.push(`${meth} ${u.hostname}${u.pathname}`); return route.abort();
});
let submitStatus = null;
page.on("response", (resp) => { if (resp.url().includes("/api/public/survey-submit")) submitStatus = resp.status(); });
await page.goto("https://fundhub.ai/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#appform .sv-opt", { timeout: 20000 });
const pick = async (opt) => { await page.locator(`#appform .sv-opt[data-opt="${opt}"]`).click(); await page.locator('#appform [data-act="next"]').click(); };
for (const o of ["$50k - $100k", "Not sure yet", "Stability (cover bills / buffer slow weeks)", "650-699", "No", "Yes, 1-2 years", "$100k - $249k", "Yes, bank statements", "$5k - $25k"]) await pick(o);
await page.waitForSelector("#sv-name");
await page.fill("#sv-name", `Sim Review${LABEL.toUpperCase()} Nelevenunsub`);
await page.fill("#sv-business", "Sim Review LLC");
await page.fill("#sv-email", email);
await page.addStyleTag({ content: "#sv-email{filter:blur(6px)}" });
await page.locator("#appform").screenshot({ path: `${OUT}/rr2-${LABEL}-00-contact-step-raw.png` });
await page.locator('#appform [data-act="submit"]').click();
await page.waitForTimeout(6000);
console.log("submit status:", submitStatus, "landed on:", new URL(page.url()).pathname);
console.log("allowed POSTs:", allowedPosts, "blocked non-GET:", JSON.stringify(blocked));
await browser.close();
