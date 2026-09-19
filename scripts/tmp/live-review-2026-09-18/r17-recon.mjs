// HOLE 17 REVIEWER — recon only. Sign in, open #13 portal, describe the
// "Send a file" area by its words. No file staged. Every non-GET blocked
// except the one sign-in POST. Never prints a secret.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const blocked = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const p = new URL(r.url()).pathname;
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  blocked.push(`${m} ${p}`); return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
const inputs = await page.evaluate(() => Array.from(document.querySelectorAll("input,button")).map((e) => `${e.tagName} id=${e.id} type=${e.type} name=${e.name} text=${(e.textContent||"").trim().slice(0,30)}`));
console.log("login page controls:", inputs);
await page.locator('input[type=email], input[name=email], #email').first().fill("chris@fundhub.ai");
await page.locator('input[type=password]').first().fill(pw);
const lrP = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/login" && r.request().method() === "POST");
await page.locator('button[type=submit], #go').first().click();
const lr = await lrP;
console.log("login status", lr.status());
await page.waitForTimeout(2500);
await page.goto(`${BASE}/app/client-portal.html?id=${ID}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
const info = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,label,button,select,input[type=file]"));
  return all.filter((e) => e.getClientRects().length > 0 || e.type === "file").map((e) => {
    const t = e.tagName;
    const txt = t === "SELECT" ? Array.from(e.options).map((o) => `${o.value}=${o.text}`).join(" | ") : (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
    return `${t}${e.type === "file" ? "[file accept=" + e.accept + " multiple=" + e.multiple + " visible=" + (e.getClientRects().length>0) + " inHeader=" + !!e.closest("header,nav,.topbar,.shell-header") + "]" : ""} :: ${txt}`;
  });
});
console.log(info.join("\n"));
const body = await page.evaluate(() => document.body.innerText);
const i = body.indexOf("Send a file");
console.log("---- text near 'Send a file' ----\n" + (i >= 0 ? body.slice(i, i + 1200) : "(not found)"));
console.log("---- 'document' mentions ----\n" + body.split("\n").filter((l) => /document|file/i.test(l)).slice(0, 40).join("\n"));
console.log("blocked", blocked);
await browser.close();
