// HOLE 12 — look only. Where on the control panel does the quiet
// "Saved on the record" line (#ccp-saved) sit, and is it on screen?
// GET-only browser; every other request is aborted. Never prints the cookie.
import { chromium } from "playwright";

const BASE = "https://fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h12-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (!m) { console.log("login failed", r.status); process.exit(1); }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([{ name: "fundhub_session", value: m[1], domain: "fundhub.ai", path: "/", httpOnly: true, secure: true }]);
await context.route("**/*", (route) => (["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort()));
const page = await context.newPage();
await page.goto(`${BASE}/app/client-control-panel.html?id=${EIGHT}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => /Eight/.test(document.getElementById("ccp-name")?.textContent || ""), null, { timeout: 45000 });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const s = document.getElementById("ccp-saved");
  const chain = [];
  for (let n = s; n && n !== document.body; n = n.parentElement) {
    chain.push(`${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}${n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\s+/).join(".") : ""}${n.tagName === "DETAILS" ? `[open=${n.open}]` : ""}${n.hidden ? "[hidden]" : ""}`);
  }
  const sec = s?.closest(".group, section, details, .card");
  return {
    hidden: s?.hidden, text: s?.textContent, chain,
    sectionTitle: sec?.querySelector(".card-title, summary, h2, h3, .eyebrow")?.textContent?.trim() || null,
    rect: s?.parentElement?.getBoundingClientRect().toJSON(),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
