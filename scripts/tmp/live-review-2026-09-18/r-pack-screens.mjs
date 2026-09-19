// Independent re-review screen pass. Password login then cookie+token. Look only.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  twelve: "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
  thirteen: "7ccbeb76-df98-4125-8c14-0d1c9f5e3042",
  combo: "567c12ce-64de-4043-aa98-d842434bd267",
};
const OUT = "/tmp/live-rereview-2026-09-18-morning";
mkdirSync(OUT, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: pw }),
});
const login = await loginRes.json();
const token = login.token || "";
const role = login.staff?.role || "owner";
const setCookie = loginRes.headers.get("set-cookie") || "";
const cookieVal = (/fundhub_session=([^;]+)/.exec(setCookie) || [])[1] || "";
if (!token || !cookieVal) {
  console.log(JSON.stringify({ loginFail: { status: loginRes.status, ok: login.ok, hasToken: !!token, hasCookie: !!cookieVal } }));
  process.exit(1);
}

const result = { at: new Date().toISOString(), login: { status: loginRes.status, role, name: login.staff?.name || null }, holes: {} };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "fundhub_session", value: cookieVal, domain: "fundhub.ai", path: "/" }]);
await ctx.addInitScript(({ token, role }) => {
  try {
    localStorage.setItem("fh_token", token);
    localStorage.setItem("fh_role", String(role).toLowerCase());
  } catch {}
}, { token, role });
await ctx.route("**/*", (route) => {
  const r = route.request();
  const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  return route.abort();
});

const page = await ctx.newPage();

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {});
}

async function load(url, waitMs = 4000) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(waitMs);
}

function text() {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
}

// 7 + 16 on #9 CCP twice
{
  const looks = [];
  for (const i of [1, 2]) {
    await load(`${BASE}/app/client-control-panel.html?id=${IDS.nine}`, 5000);
    await shot(`h7-h16-nine-${i}`);
    looks.push(await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        name: (document.querySelector("#who-name") || {}).innerText || null,
        nextEl: (document.querySelector("#next-action, #nextAction") || {}).innerText || null,
        noStep: /no step applies/i.test(body),
        unread: /not been read|nobody has read|unread/i.test(body),
        startRepair: /start the repair/i.test(body),
        reader: /document reader|no credits|429/i.test(body),
        nextSnip: (body.match(/Next[^\n]{0,120}/) || body.match(/next step[^\n]{0,120}/i) || [""])[0],
        clip: body.replace(/\s+/g, " ").slice(0, 900),
      };
    }));
  }
  result.holes[7] = looks;
  result.holes[16] = looks.map((l) => ({ reader: l.reader, unread: l.unread, clip: l.clip.slice(0, 400) }));
}

// 8 + 12 on #8 CCP twice
{
  const looks = [];
  for (const i of [1, 2]) {
    await load(`${BASE}/app/client-control-panel.html?id=${IDS.eight}`, 5000);
    await shot(`h8-h12-eight-${i}`);
    looks.push(await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        name: (document.querySelector("#who-name") || {}).innerText || null,
        noStep: /no step applies/i.test(body),
        remove: /remove inquiries/i.test(body),
        collect: /collect documents/i.test(body),
        notFunded: /not funded/i.test(body),
        fundedSnips: (body.match(/Funded[^\n]{0,80}/gi) || []).slice(0, 8),
        approvedSnips: (body.match(/Approver?d[^\n]{0,80}/gi) || []).slice(0, 8),
        nextSnip: (body.match(/Next[^\n]{0,120}/) || [""])[0],
        clip: body.replace(/\s+/g, " ").slice(0, 900),
      };
    }));
  }
  result.holes[8] = { ccp: looks };
  result.holes[12] = looks.map((l) => ({ remove: l.remove, collect: l.collect, nextSnip: l.nextSnip }));
}

// pipeline fulfillment
{
  await load(`${BASE}/app/pipeline.html`, 4000);
  const tab = page.getByText("Fulfillment", { exact: true }).first();
  if (await tab.count()) await tab.click().catch(() => {});
  await page.waitForTimeout(3000);
  await shot("h8-fulfillment");
  result.holes[8].fulfillment = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      noApproval: /no bank approval has ever been recorded|no honest source/i.test(body),
      totalApproved: (body.match(/TOTAL APPROVED[^\n]{0,80}/i) || [""])[0],
      eight: /eight-funding|sim eight/i.test(body),
      clip: body.replace(/\s+/g, " ").slice(0, 1000),
    };
  });
}

// ops / finance money
{
  await load(`${BASE}/app/ops-admin.html`, 3500);
  await shot("h8-ops");
  result.holes[8].ops = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      funded: (body.match(/FUNDED[^\n]{0,50}/g) || []).slice(0, 6),
      clip: body.replace(/\s+/g, " ").slice(0, 700),
    };
  });
  await load(`${BASE}/app/finance-os.html`, 4000);
  await shot("h8-finance");
  result.holes[8].finance = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      funded: (body.match(/FUNDED[^\n]{0,60}|Funded[^\n]{0,60}/g) || []).slice(0, 8),
      clip: body.replace(/\s+/g, " ").slice(0, 800),
    };
  });
  await load(`${BASE}/app/my-numbers.html`, 3500);
  await shot("h8-mynumbers");
  result.holes[8].myNumbers = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      funded: (body.match(/FUNDED[^\n]{0,60}|Funded[^\n]{0,60}|\$50k/g) || []).slice(0, 8),
      clip: body.replace(/\s+/g, " ").slice(0, 700),
    };
  });
}

// 9 payments
{
  const pays = [];
  for (const i of [1, 2]) {
    await load(`${BASE}/app/client-portal.html?id=${IDS.eight}`, 4000);
    const hist = page.getByText(/Account & history|Payments/i).first();
    if (await hist.count()) await hist.click().catch(() => {});
    await page.waitForTimeout(800);
    const pay = page.getByText("Payments", { exact: false }).first();
    if (await pay.count()) await pay.click().catch(() => {});
    await page.waitForTimeout(2000);
    await shot(`h9-pay-${i}`);
    pays.push(await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        greeting: (document.querySelector("#greeting") || {}).innerText || null,
        has2500: /2,?500/.test(body),
        dueNow: /due now/i.test(body),
        cardStack: /card stacking/i.test(body),
        clip: body.replace(/\s+/g, " ").slice(0, 900),
      };
    }));
  }
  result.holes[9] = pays;
}

// 11 what you own
{
  const looks = [];
  for (const i of [1, 2]) {
    await load(`${BASE}/app/client-portal.html?id=${IDS.twelve}`, 4000);
    await shot(`h11-twelve-${i}`);
    looks.push(await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        greeting: (document.querySelector("#greeting") || {}).innerText || null,
        nothing: /nothing to download yet/i.test(body),
        course: /funding mastery|capital academy|open course/i.test(body),
        own: (body.match(/What You Own[\s\S]{0,280}/i) || [""])[0].replace(/\s+/g, " ").slice(0, 280),
      };
    }));
  }
  result.holes[11] = looks;
}

// 13 greeting
{
  const idLooks = [];
  const cidLooks = [];
  for (const i of [1, 2]) {
    await load(`${BASE}/app/client-portal.html?id=${IDS.eleven}`, 4000);
    await shot(`h13-id-${i}`);
    idLooks.push(await page.evaluate(() => ({
      greeting: (document.querySelector("#greeting") || {}).innerText || null,
      who: (document.querySelector("#who-name") || {}).innerText || null,
      chris: /welcome back,\s*chris/i.test(document.body.innerText),
      sim: /welcome back,\s*sim/i.test(document.body.innerText),
    })));
  }
  for (const i of [1, 2]) {
    await load(`${BASE}/app/client-portal.html?client_id=${IDS.eleven}`, 4000);
    await shot(`h13-cid-${i}`);
    cidLooks.push(await page.evaluate(() => ({
      greeting: (document.querySelector("#greeting") || {}).innerText || null,
      who: (document.querySelector("#who-name") || {}).innerText || null,
      chris: /welcome back,\s*chris/i.test(document.body.innerText),
      sim: /welcome back,\s*sim/i.test(document.body.innerText),
    })));
  }
  result.holes[13] = { idLooks, cidLooks };
}

// 14 specialist
{
  const looks = [];
  for (const i of [1, 2]) {
    await load(`${BASE}/app/inquiry-remover.html`, 3500);
    const repair = page.getByRole("button", { name: /Repair/i }).first();
    if (await repair.count()) await repair.click().catch(() => {});
    else {
      const t = page.getByText("Repair", { exact: true }).first();
      if (await t.count()) await t.click().catch(() => {});
    }
    await page.waitForTimeout(3000);
    await shot(`h14-repair-${i}`);
    looks.push(await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        everyWaiting: /every file is waiting on a bureau/i.test(body),
        header: (body.match(/Nothing needs you[^\n.]{0,90}|waiting on a bureau[^\n.]{0,90}/gi) || []).slice(0, 6),
        needMe: (body.match(/Need me[^\n]{0,24}/i) || [""])[0],
        waiting: (body.match(/waiting on bureau[^\n]{0,24}/i) || [""])[0],
        stuck: (body.match(/Stuck[^\n]{0,24}/) || [""])[0],
        clip: body.replace(/\s+/g, " ").slice(0, 800),
      };
    }));
  }
  result.holes[14] = looks;
}

// 17 #13 portal upload door
{
  await load(`${BASE}/app/client-portal.html?id=${IDS.thirteen}`, 4000);
  await shot("h17-thirteen");
  result.holes[17] = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      door: /upload inquiry|inquiry documents|ftc/i.test(body),
      send1: /send 1 file/i.test(body),
      clip: body.replace(/\s+/g, " ").slice(0, 800),
    };
  });
}

// 18 + 22 combo
{
  await load(`${BASE}/app/client-control-panel.html?id=${IDS.combo}`, 5000);
  await shot("h18-combo-ccp");
  result.holes[18] = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      pending: /pending/i.test(body),
      threek: /3,?000/.test(body),
      round: /round 1|funding round/i.test(body),
      snip: (body.match(/pay[^\n]{0,70}|pending[^\n]{0,70}|round[^\n]{0,50}/gi) || []).slice(0, 8),
      clip: body.replace(/\s+/g, " ").slice(0, 800),
    };
  });
  await load(`${BASE}/app/inquiry-remover.html`, 3500);
  const repair = page.getByText("Repair", { exact: true }).first();
  if (await repair.count()) await repair.click().catch(() => {});
  await page.waitForTimeout(3000);
  await shot("h22-combo-repair");
  result.holes[22] = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      hasCombo: /combo-20260918|sim combo/i.test(body),
      noAddress: /no address on file/i.test(body),
      clip: body.replace(/\s+/g, " ").slice(0, 900),
    };
  });
}

// 19 progress
{
  const looks = [];
  for (const i of [1, 2]) {
    await load(`${BASE}/progress.html?client_id=${IDS.twelve}`, 4000);
    await shot(`h19-progress-${i}`);
    looks.push(await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        url: location.pathname,
        notSetUp: /checklist has not been set up/i.test(body),
        bounce: /email me a sign-in link/i.test(body),
        lines: (body.match(/no new credit|personal loan|llc|ein|checking/gi) || []).slice(0, 8),
        clip: body.replace(/\s+/g, " ").slice(0, 600),
      };
    }));
  }
  result.holes[19] = looks;
}

// 23 consent
{
  const looks = [];
  for (const i of [1, 2]) {
    await load(`${BASE}/app/client-control-panel.html?id=${IDS.thirteen}`, 5000);
    await shot(`h23-thirteen-${i}`);
    looks.push(await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        scores: (body.match(/771|778|766/g) || []).slice(0, 6),
        noPermission: /no written permission|cannot pull/i.test(body),
        sample: /sample scores|not a real credit pull/i.test(body),
        snip: (body.match(/permission[^\n]{0,90}|cannot pull[^\n]{0,90}|sample scores[^\n]{0,90}/gi) || []).slice(0, 8),
        clip: body.replace(/\s+/g, " ").slice(0, 800),
      };
    }));
  }
  result.holes[23] = looks;
}

await browser.close();
writeFileSync(`${OUT}/screens.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
