// Hole 22 round 2 — LOOK ONLY at the live Specialist Repair desk for Combo.
// Signs in through the real password form (the only non-GET let through is the
// sign-in POST), opens Inquiry Remover → Repair, reads Combo's row and the same
// queue API the desk paints from, and saves a marked screenshot. Two passes, each
// a fresh browser. Never clicks Send / Stage / Pull. Prints no secrets.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h22r2-desk.mjs <tag>
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22/round2";
mkdirSync(OUT, { recursive: true });
const TAG = process.argv[2] || "desk";
const out = { at: new Date().toISOString(), tag: TAG, passes: [] };

const browser = await chromium.launch({ headless: true });
for (let i = 1; i <= 2; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const blocked = [];
  let signInPosts = 0;
  await ctx.route("**/*", (route) => {
    const q = route.request();
    const path = new URL(q.url()).pathname;
    if (["GET", "HEAD", "OPTIONS"].includes(q.method())) return route.continue();
    if (q.method() === "POST" && path === "/api/auth/login" && signInPosts === 0) { signInPosts++; return route.continue(); }
    blocked.push(`${q.method()} ${path}`);
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.fill("#email", "chris@fundhub.ai");
  await page.fill("#pw", process.env.STAFF_INITIAL_PASSWORD || "");
  await Promise.all([
    page.waitForURL((u) => !/login\.html/.test(String(u)), { timeout: 30_000 }).catch(() => null),
    page.click("#go"),
  ]);
  const signedIn = !/login\.html/.test(page.url());
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  await page.click("#tab-repair").catch(() => {});
  await page.waitForSelector(`[data-repair-row="${COMBO}"]`, { timeout: 20_000 }).catch(() => null);
  await page.waitForTimeout(1500);

  // The same queue API the desk paints from (GET, same session).
  const api = await page.evaluate(async (id) => {
    const r = await fetch("/api/read/repair-cases", { credentials: "include", headers: { accept: "application/json" } });
    const d = await r.json().catch(() => null);
    const row = (d?.files || []).find((f) => f.client_id === id) || null;
    return {
      status: r.status,
      combo: row && { name: row.name, stage_key: row.stage_key, address_ok: row.address_ok, can_send: row.can_send,
        letters_ready: row.letters_ready, chip: row.chip, warnings: row.warnings },
    };
  }, COMBO);

  const look = await page.evaluate(({ id, tag }) => {
    const row = document.querySelector(`[data-repair-row="${id}"]`);
    if (!row) return { found: false };
    row.scrollIntoView({ block: "center" });
    const text = row.innerText.replace(/\s+/g, " ").trim();
    const dots = [...row.querySelectorAll(".repair-wdot")].map((d) => d.textContent.trim());
    row.style.outline = "3px solid #e00";
    row.style.outlineOffset = "2px";
    const r = row.getBoundingClientRect();
    const n = document.createElement("div");
    n.textContent = "1";
    Object.assign(n.style, { position: "absolute", background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px", zIndex: 99999, left: `${r.left + scrollX - 26}px`, top: `${r.top + scrollY}px` });
    document.body.appendChild(n);
    const addrDot = [...row.querySelectorAll(".repair-wdot")].find((d) => /no address on file/i.test(d.textContent));
    // Mark 2 goes on the red dot when it is there, else on the NEEDS cell it would sit in.
    const mark2 = addrDot || row.querySelectorAll("td")[4];
    if (mark2) {
      mark2.style.outline = "3px solid #e00";
      const a = mark2.getBoundingClientRect();
      const m = document.createElement("div");
      m.textContent = "2";
      Object.assign(m.style, { position: "absolute", background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px", zIndex: 99999, left: `${a.left + scrollX}px`, top: `${a.top + scrollY - 26}px` });
      document.body.appendChild(m);
    }
    const legend = document.createElement("div");
    legend.innerHTML = `1 — Sim Combo-20260918 on Specialist Repair (${tag})<br>` +
      (addrDot ? "2 — red “no address on file”" : "2 — no “no address on file” mark on this row");
    Object.assign(legend.style, { position: "fixed", left: "250px", bottom: "12px", background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 10px", zIndex: 99999, maxWidth: "620px" });
    document.body.appendChild(legend);
    return { found: true, text, dots, addressDotShown: Boolean(addrDot) };
  }, { id: COMBO, tag: TAG });
  await page.screenshot({ path: `${OUT}/${TAG}-repair-pass${i}.png`, fullPage: false });
  out.passes.push({ pass: i, signedIn, api, look, blocked });
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/${TAG}-desk.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
