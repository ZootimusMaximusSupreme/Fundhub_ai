// F3 live proof: press "Write 3 posts for me" on the live Social Studio and see
// whether drafts now appear. Writes DRAFT rows only. Nothing is queued, approved
// or posted in public. No account is connected.
import { chromium } from "playwright";
import { db } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const HOUSE = "55272246-b97f-4c4b-a693-bce3f7e2dfd2";
const say = (s) => console.log(s);

const staff = (await db.query(
  `SELECT id, org_id, email FROM staff WHERE email = $1 LIMIT 1`, ["chris@fundhub.ai"]
)).rows[0];
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });
say("session minted (token not printed)");

const before = (await db.query(
  `SELECT count(*)::int AS n FROM social_posts WHERE partner_id = $1`, [HOUSE]
)).rows[0].n;
say(`drafts on file BEFORE: ${before}`);

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true }]);
const page = await ctx.newPage();
await page.goto(`https://fundhub.ai/app/social-studio.html?partner_id=${HOUSE}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const btn = page.locator('button:has-text("Write 3 posts for me")').first();
say(`button found: ${await btn.count() > 0}`);
await btn.click();
say("clicked — waiting for the writer");
await page.waitForTimeout(25000);

const shown = await page.evaluate(() => {
  const t = document.body.innerText;
  const i = t.indexOf("Write 3 posts");
  return t.slice(Math.max(0, i - 200), i + 400).replace(/\n{2,}/g, "\n");
});
say(`--- what the screen says ---\n${shown}\n---`);

const after = (await db.query(
  `SELECT count(*)::int AS n FROM social_posts WHERE partner_id = $1`, [HOUSE]
)).rows[0].n;
say(`drafts on file AFTER: ${after}   (new: ${after - before})`);

if (after > before) {
  const rows = (await db.query(
    `SELECT status, left(body, 90) AS preview FROM social_posts
      WHERE partner_id = $1 ORDER BY created_at DESC LIMIT 3`, [HOUSE]
  )).rows;
  for (const r of rows) say(`  [${r.status}] ${r.preview}`);
}

await browser.close();
if (db.end) await db.end();
