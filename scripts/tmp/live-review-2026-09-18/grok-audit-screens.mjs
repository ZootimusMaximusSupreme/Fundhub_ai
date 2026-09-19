// Live screens for named holes. Password login. No Send/Pay/Apply/Stage/Pull.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/grok-audit-screens-2026-09-18";
mkdirSync(OUT, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");

const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  twelve: "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
  thirteen: "7ccbeb76-df98-4125-8c14-0d1c9f5e3042",
};

function clip(s, n = 400) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
}

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: pw }),
});
const loginJson = await loginRes.json().catch(() => ({}));
const token = loginJson.token || loginJson.data?.token || "";
const setCookie = loginRes.headers.get("set-cookie") || "";
const cookiePair = setCookie.split(";")[0] || "";
const cookieName = cookiePair.split("=")[0] || "fundhub_session";
const cookieVal = cookiePair.split("=").slice(1).join("=");
const result = { login: { status: loginRes.status, ok: Boolean(token), keys: Object.keys(loginJson) }, holes: {} };
if (!token) {
  writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ login: result.login }, null, 2));
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{
  name: cookieName,
  value: cookieVal || token,
  url: BASE,
}]);
await ctx.route("**/*", (route) => {
  const m = route.request().method();
  const p = new URL(route.request().url()).pathname;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);


async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

async function open(url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  return clip(await page.locator("body").innerText());
}

// hole 7 + 16 + 12 stored vs screen
{
  const t1 = await open(`${BASE}/app/client-control-panel.html?id=${IDS.nine}`);
  await shot("h7-nine-1");
  const t2 = await open(`${BASE}/app/client-control-panel.html?id=${IDS.nine}`);
  await shot("h7-nine-2");
  result.holes[7] = {
    noStep1: /no step applies/i.test(t1),
    noStep2: /no step applies/i.test(t2),
    next1: clip((t1.match(/do this next[^\n]{0,120}|waiting on the document[^\n]{0,120}|no step applies[^\n]{0,80}/i) || [])[0]),
    name: /sim nine-repair/i.test(t1),
    sample: clip(t1, 500),
  };
  result.holes[16] = {
    retake: /retake|request more|not been read|identity/i.test(t1),
    snip: clip((t1.match(/document reader[^\n]{0,140}|retake[^\n]{0,80}|id document[^\n]{0,80}/gi) || []).join(" | "), 400),
  };
}

{
  const t1 = await open(`${BASE}/app/client-control-panel.html?id=${IDS.eight}`);
  await shot("h8-eight-1");
  const t2 = await open(`${BASE}/app/client-control-panel.html?id=${IDS.eight}`);
  await shot("h8-eight-2");
  result.holes[8] = {
    fundedYes: /funded[^\n]{0,40}yes|yes[^\n]{0,20}\$50,000/i.test(t1),
    fifty: /\$50,000/.test(t1),
    notFunded: /not funded/i.test(t1),
    remove: /remove inquiries/i.test(t1),
    collect: /collect documents/i.test(t1),
    snip: clip((t1.match(/funded[^\n]{0,80}|remove inquiries[^\n]{0,60}|pull crs[^\n]{0,60}/gi) || []).join(" | ")),
  };
  result.holes[12] = {
    screenRemove: /remove inquiries/i.test(t1) && /remove inquiries/i.test(t2),
    screenCollect: /collect documents/i.test(t1),
  };
}

{
  const t1 = await open(`${BASE}/app/client-portal.html?id=${IDS.eight}`);
  await page.waitForTimeout(1500);
  // try payments tab
  const payBtn = page.getByText(/payments/i).first();
  if (await payBtn.count()) {
    try { await payBtn.click({ timeout: 3000 }); await page.waitForTimeout(1200); } catch {}
  }
  const payText = clip(await page.locator("body").innerText());
  await shot("h9-payments-1");
  result.holes[9] = {
    dueNow: /due now/i.test(payText),
    two500: /2,500/.test(payText),
    succeeded: /succeeded|paid/i.test(payText),
    snip: clip((payText.match(/payment[^\n]{0,80}|due now[^\n]{0,80}|2,500[^\n]{0,60}|3,000[^\n]{0,60}/gi) || []).join(" | ")),
  };
}

{
  const t1 = await open(`${BASE}/app/client-portal.html?id=${IDS.twelve}`);
  await shot("h11-twelve-1");
  const t2 = await open(`${BASE}/app/client-portal.html?id=${IDS.twelve}`);
  await shot("h11-twelve-2");
  result.holes[11] = {
    nothing1: /nothing to download yet/i.test(t1),
    nothing2: /nothing to download yet/i.test(t2),
    course: /funding mastery|capital academy|open course/i.test(t1),
    snip: clip((t1.match(/what you own[\s\S]{0,300}/i) || [])[0]),
  };
}

{
  const t1 = await open(`${BASE}/app/client-portal.html?id=${IDS.eleven}`);
  await shot("h13-eleven-id-1");
  const t2 = await open(`${BASE}/app/client-portal.html?id=${IDS.eleven}`);
  const c1 = await open(`${BASE}/app/client-portal.html?client_id=${IDS.eleven}`);
  await shot("h13-eleven-cid-1");
  result.holes[13] = {
    idChris: /welcome back,\s*chris/i.test(t1),
    idSim: /welcome back,\s*sim/i.test(t1) && /welcome back,\s*sim/i.test(t2),
    cidChris: /welcome back,\s*chris/i.test(c1),
    cidSim: /welcome back,\s*sim/i.test(c1),
    greet1: clip((t1.match(/welcome back[^\n]{0,40}/i) || [])[0]),
    greetCid: clip((c1.match(/welcome back[^\n]{0,40}/i) || [])[0]),
  };
  result.holes[2] = {
    metroNotReady: /metro 2[\s\S]{0,80}not ready/i.test(t1) || /not ready yet[\s\S]{0,40}metro/i.test(t1),
    disputeReady: /dispute letter pack[^\n]{0,40}ready|ready[^\n]{0,40}dispute/i.test(t1),
    snip: clip((t1.match(/metro[\s\S]{0,80}|dispute letter[\s\S]{0,80}|not ready yet/gi) || []).join(" | ")),
  };
}

{
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2000);
  const repairBtn = page.getByText(/^Repair$/i).first();
  if (await repairBtn.count()) {
    try { await repairBtn.click({ timeout: 3000 }); await page.waitForTimeout(1500); } catch {}
  }
  const t = clip(await page.locator("body").innerText());
  await shot("h14-repair-1");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const t2 = clip(await page.locator("body").innerText());
  await shot("h14-repair-2");
  result.holes[14] = {
    waitingBureau: /waiting on a bureau/i.test(t),
    stuck: /stuck\s*2|2 files are stuck/i.test(t),
    snip: clip((t.match(/nothing needs you[^\n]{0,80}|waiting on a bureau[^\n]{0,80}|stuck[^\n]{0,40}/gi) || []).join(" | ")),
    snip2: clip((t2.match(/nothing needs you[^\n]{0,80}|waiting on a bureau[^\n]{0,80}|stuck[^\n]{0,40}/gi) || []).join(" | ")),
  };
}

{
  const t1 = await open(`${BASE}/progress.html?client_id=${IDS.twelve}`);
  await shot("h19-twelve-1");
  const t2 = await open(`${BASE}/progress.html?id=${IDS.twelve}`);
  await shot("h19-twelve-2");
  result.holes[19] = {
    notSetUp: /checklist has not been set up/i.test(t1),
    reviewedLie: /as soon as your file is reviewed/i.test(t1) || /as soon as your file is reviewed/i.test(t2),
    bounce: /email me a sign-in link/i.test(t1),
    snip: clip((t1.match(/checklist[^\n]{0,160}|has not been[^\n]{0,120}/gi) || []).join(" | ")),
  };
}

{
  const t1 = await open(`${BASE}/app/client-control-panel.html?id=${IDS.thirteen}`);
  await shot("h23-thirteen-1");
  const t2 = await open(`${BASE}/app/client-control-panel.html?id=${IDS.thirteen}`);
  await shot("h23-thirteen-2");
  result.holes[23] = {
    scores: /771/.test(t1) && /778/.test(t1),
    sample: /sample scores|not a real credit pull/i.test(t1) && /sample scores|not a real credit pull/i.test(t2),
    noPerm: /no written permission|cannot pull/i.test(t1),
    snip: clip((t1.match(/sample scores[^\n]{0,80}|not a real credit pull[^\n]{0,80}|permission[^\n]{0,80}/gi) || []).join(" | ")),
  };
}

await browser.close();
writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
