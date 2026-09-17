// Live proof on fundhub.ai for F1 and F3, after ship 8a35bd30.
// Reads plus one session row. No deletes, no money, no public posts, no connects.
import { chromium } from "playwright";
import { db } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const HOUSE = "55272246-b97f-4c4b-a693-bce3f7e2dfd2";
const say = (s) => console.log(s);

const staff = (await db.query(
  `SELECT id, org_id, email, role FROM staff WHERE email = $1 LIMIT 1`, ["chris@fundhub.ai"]
)).rows[0];
if (!staff) throw new Error("no staff row for chris@fundhub.ai");
say(`staff: ${staff.email} role=${staff.role}`);

const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });
say("session minted (token not printed)");

const browser = await chromium.launch();
const ctx = await browser.newContext();
for (const name of ["fundhub_session"]) {
  await ctx.addCookies([{ name, value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true }]);
}
const page = await ctx.newPage();

await page.goto(`https://fundhub.ai/app/creative-factory.html?partner_id=${HOUSE}`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const f1 = await page.evaluate(() => ({
  options: (() => { const s = document.getElementById("genScript"); return s ? Array.from(s.options).map(o => o.textContent.trim()) : null; })(),
  live: typeof LIVE_CF !== "undefined" ? LIVE_CF.scripts : "undefined",
  count: typeof SCRIPTS !== "undefined" ? SCRIPTS.length : "undefined",
}));
say(`F1 picker options after a full reload: ${JSON.stringify(f1.options)}`);
say(`F1 LIVE_CF.scripts=${f1.live}  SCRIPTS.length=${f1.count}`);

const api = await page.evaluate(async (pid) => {
  const r = await fetch(`/api/scripts/list?partner_id=${pid}&limit=5`, { credentials: "include" });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, ok: j && j.ok, count: j && j.data && j.data.count };
}, HOUSE);
say(`F1 GET /api/scripts/list -> HTTP ${api.status} ok=${api.ok} count=${api.count}`);

const health = await page.evaluate(async () => {
  const r = await fetch("/api/health", { credentials: "include" });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
});
say(`live /api/health -> HTTP ${health.status} ${JSON.stringify(health.body).slice(0, 220)}`);

await browser.close();
if (db.end) await db.end();
