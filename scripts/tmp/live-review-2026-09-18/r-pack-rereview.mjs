// Independent re-review of holes 7–9, 11–14, 16–20, 22–24. LOOK ONLY.
// No SMS, email, Send, Pay, Apply, Stage, Pull, Enroll, or contract send.
// Never prints secrets. Writes JSON under /tmp.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { gmailConfigFromEnv } from "../../../src/gmail/config.mjs";
import { createGmailClientFromConfig } from "../../../src/gmail/index.mjs";

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

const result = { at: new Date().toISOString(), login: null, holes: {}, blocked: [] };
const tokenRef = { value: "" };

function clip(s, n = 400) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
}

async function api(page, path) {
  return page.evaluate(async ({ path, token }) => {
    const r = await fetch(path, { headers: { Authorization: "Bearer " + token } });
    let body = null;
    try { body = await r.json(); } catch { body = { _text: true }; }
    return { status: r.status, body };
  }, { path, token: tokenRef.value });
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request();
  const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const p = new URL(r.url()).pathname;
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  result.blocked.push(`${m} ${p}`);
  return route.abort();
});

const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", pw);
const loginWait = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await page.click('button[type="submit"], #go, button:has-text("Sign in"), button:has-text("Log in")');
const loginRes = await loginWait;
const loginJson = await loginRes.json().catch(() => ({}));
tokenRef.value = loginJson.token || loginJson.data?.token || "";
result.login = {
  status: loginRes.status(),
  hasToken: Boolean(tokenRef.value),
  name: loginJson.staff?.full_name || loginJson.data?.staff?.full_name || loginJson.user?.name || null,
  role: loginJson.staff?.role || loginJson.data?.staff?.role || null,
};
if (!tokenRef.value) {
  writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ login: result.login }, null, 2));
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1500);

async function openTwice(url, extract) {
  const a = await extractAfter(url, extract);
  const b = await extractAfter(url, extract);
  return { load1: a, load2: b };
}

async function extractAfter(url, extract) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  const shot = `${OUT}/${url.replace(/[^a-z0-9]+/gi, "-").slice(0, 80)}.png`;
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  const data = await page.evaluate(extract);
  return { url, title: await page.title(), text: clip(await page.locator("body").innerText().catch(() => ""), 1200), ...data };
}

// --- hole 7: #9 next-step lie ---
{
  const screen = await openTwice(
    `${BASE}/app/client-control-panel.html?id=${IDS.nine}`,
    () => {
      const body = document.body.innerText;
      return {
        name: (document.querySelector("#who-name, .who-name, [data-name]") || {}).innerText || null,
        next: (document.querySelector("#next-action, #nextAction, [data-next]") || {}).innerText || null,
        hasNoStep: /no step applies/i.test(body),
        hasUnread: /unread|not been read|nobody has read|identity/i.test(body),
        hasStartRepair: /start the repair/i.test(body),
        nextSnip: (body.match(/next[^\n]{0,80}/i) || [""])[0],
      };
    }
  );
  const dash = await api(page, `/api/dashboard/client?id=${IDS.nine}`);
  const c = dash.body?.data?.client || dash.body?.client || {};
  const tasks = dash.body?.data?.tasks || dash.body?.tasks || [];
  result.holes[7] = {
    screen,
    api: {
      status: dash.status,
      name: c.full_name || c.name,
      employee_next_action: c.custom_fields?.employee_next_action || c.employee_next_action || null,
      identity_verified: c.identity_verified ?? c.custom_fields?.identity_verified ?? null,
      taskTitles: (Array.isArray(tasks) ? tasks : []).slice(0, 12).map((t) => t.title || t.name || t.kind),
    },
  };
}

// --- hole 8: funded numbers ---
{
  const screen = await openTwice(
    `${BASE}/app/client-control-panel.html?id=${IDS.eight}`,
    () => {
      const body = document.body.innerText;
      return {
        fundedSnip: (body.match(/fund(?:ed)?[^\n]{0,80}/gi) || []).slice(0, 8),
        approvedSnip: (body.match(/approv[^\n]{0,80}/gi) || []).slice(0, 6),
        notFunded: /not funded/i.test(body),
      };
    }
  );
  const pipe = await extractAfter(`${BASE}/app/pipeline.html`, () => {
    const tabs = [...document.querySelectorAll("button, a, [role=tab]")].map((el) => el.innerText.trim());
    return { tabs: tabs.filter((t) => /fulfill|fund|ops/i.test(t)).slice(0, 12), bodyHas: /TOTAL APPROVED|No bank approval|No honest source/i.test(document.body.innerText) };
  });
  const fulfillTab = page.locator("text=Fulfillment").first();
  if (await fulfillTab.count()) {
    await fulfillTab.click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  const fulfillText = clip(await page.locator("body").innerText().catch(() => ""), 1500);
  const ops = await extractAfter(`${BASE}/app/ops-admin.html`, () => {
    const body = document.body.innerText;
    return {
      funded: (body.match(/FUNDED[^\n]{0,60}/g) || []).slice(0, 6),
      money: (body.match(/\$50k|\$50,000|Funded (files|dollars)[^\n]{0,40}/gi) || []).slice(0, 8),
    };
  });
  const dash = await api(page, `/api/dashboard/client?id=${IDS.eight}`);
  const rounds = await api(page, `/api/read/funding-rounds?client_id=${IDS.eight}`);
  const clients = await api(page, `/api/dashboard/clients?limit=200&fulfillment=1`);
  const c = dash.body?.data?.client || dash.body?.client || {};
  const list = clients.body?.data?.clients || clients.body?.clients || [];
  const row = list.find((x) => x.id === IDS.eight) || {};
  result.holes[8] = {
    screen,
    pipelineLook: { ...pipe, fulfillText },
    ops,
    api: {
      dashStatus: dash.status,
      personFunded: c.funded ?? c.is_funded ?? c.custom_fields?.funded ?? null,
      fundedAmount: c.funded_amount ?? c.custom_fields?.funded_amount ?? null,
      employee_next_action: c.custom_fields?.employee_next_action || c.employee_next_action || null,
      roundsStatus: rounds.status,
      rounds: (rounds.body?.data?.rounds || rounds.body?.rounds || []).map((r) => pick(r, ["status", "funded_cents", "approved_cents", "kind", "product"])),
      listRow: pick(row, ["full_name", "name", "funded", "funded_amount", "employee_next_action", "fulfillment_chip", "next_action"]),
    },
  };
}

// --- hole 9: Payments tab $2500 ---
{
  const screen = await openTwice(
    `${BASE}/app/client-portal.html?id=${IDS.eight}`,
    () => ({ greeting: (document.querySelector("#greeting") || {}).innerText || null })
  );
  const payTab = page.locator("text=Payments").first();
  let payText = "";
  if (await payTab.count()) {
    await payTab.click().catch(() => {});
    await page.waitForTimeout(2000);
    payText = clip(await page.locator("body").innerText().catch(() => ""), 1600);
  }
  // second Payments click
  if (await payTab.count()) {
    await payTab.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  const payText2 = clip(await page.locator("body").innerText().catch(() => ""), 1600);
  const summary = await api(page, `/api/read/portal-summary?client_id=${IDS.eight}`);
  const invoices = await api(page, `/api/read/invoices?client_id=${IDS.eight}`);
  const finance = await api(page, `/api/read/finance-os?client_id=${IDS.eight}`);
  const invList = invoices.body?.data?.invoices || invoices.body?.invoices || invoices.body?.data || [];
  result.holes[9] = {
    screen,
    payText,
    payText2,
    has2500Screen: /2,?500/.test(payText + payText2),
    hasDueNow: /due now/i.test(payText + payText2),
    api: {
      summaryStatus: summary.status,
      invoicesStatus: invoices.status,
      invoiceSnips: (Array.isArray(invList) ? invList : []).slice(0, 8).map((i) => pick(i, ["number", "invoice_number", "status", "amount_cents", "amount", "paid_cents", "balance_cents"])),
      financeStatus: finance.status,
    },
  };
}

// --- hole 11: #12 What You Own ---
{
  const screen = await openTwice(
    `${BASE}/app/client-portal.html?id=${IDS.twelve}`,
    () => {
      const body = document.body.innerText;
      return {
        greeting: (document.querySelector("#greeting") || {}).innerText || null,
        nothing: /nothing to download yet/i.test(body),
        ownSnip: (body.match(/what you own[\s\S]{0,240}/i) || [""])[0].replace(/\s+/g, " ").slice(0, 240),
        course: /funding mastery|capital academy|open course/i.test(body),
      };
    }
  );
  const ents = await api(page, `/api/read/entitlements?client_id=${IDS.twelve}`);
  const summary = await api(page, `/api/read/portal-summary?client_id=${IDS.twelve}`);
  result.holes[11] = {
    screen,
    api: {
      entsStatus: ents.status,
      ents: (ents.body?.data?.entitlements || ents.body?.entitlements || []).map((e) => pick(e, ["title", "name", "status", "kind", "product_title"])),
      summaryStatus: summary.status,
      own: summary.body?.data?.what_you_own || summary.body?.what_you_own || summary.body?.data?.owned || null,
    },
  };
}

// --- hole 12: stored next-action ---
{
  const dash = await api(page, `/api/dashboard/client?id=${IDS.eight}`);
  const clients = await api(page, `/api/dashboard/clients?limit=200&fulfillment=1`);
  const c = dash.body?.data?.client || dash.body?.client || {};
  const list = clients.body?.data?.clients || clients.body?.clients || [];
  const row = list.find((x) => x.id === IDS.eight) || {};
  const screen = await openTwice(
    `${BASE}/app/client-control-panel.html?id=${IDS.eight}`,
    () => {
      const body = document.body.innerText;
      return {
        remove: /remove inquiries/i.test(body),
        collect: /collect documents/i.test(body),
        nextSnip: (body.match(/next[^\n]{0,100}/i) || [""])[0],
      };
    }
  );
  result.holes[12] = {
    screen,
    api: {
      stored: c.custom_fields?.employee_next_action || c.employee_next_action || null,
      listStored: row.employee_next_action || row.custom_fields?.employee_next_action || null,
      chip: row.fulfillment_chip || row.next_action || row.employee_next_action || null,
    },
  };
}

// --- hole 13: ?id= greeting ---
{
  const idDoor = await openTwice(
    `${BASE}/app/client-portal.html?id=${IDS.eleven}`,
    () => ({
      greeting: (document.querySelector("#greeting") || {}).innerText || null,
      who: (document.querySelector("#who-name") || {}).innerText || null,
      bodyChris: /welcome back,\s*chris/i.test(document.body.innerText),
      bodySim: /welcome back,\s*sim/i.test(document.body.innerText),
    })
  );
  const cidDoor = await openTwice(
    `${BASE}/app/client-portal.html?client_id=${IDS.eleven}`,
    () => ({
      greeting: (document.querySelector("#greeting") || {}).innerText || null,
      who: (document.querySelector("#who-name") || {}).innerText || null,
      bodyChris: /welcome back,\s*chris/i.test(document.body.innerText),
      bodySim: /welcome back,\s*sim/i.test(document.body.innerText),
    })
  );
  result.holes[13] = { idDoor, cidDoor };
}

// --- hole 14: specialist header ---
{
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const repair = page.locator("text=Repair").first();
  if (await repair.count()) await repair.click().catch(() => {});
  await page.waitForTimeout(3000);
  const look1 = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      header: (body.match(/nothing needs you[^\n]{0,80}|waiting on a bureau[^\n]{0,80}|stuck[^\n]{0,40}/gi) || []).slice(0, 10),
      waitingOnBureauLine: /every file is waiting on a bureau/i.test(body),
      tiles: {
        needMe: (body.match(/need me[^\n]{0,20}/i) || [""])[0],
        waiting: (body.match(/waiting on bureau[^\n]{0,20}/i) || [""])[0],
        stuck: (body.match(/stuck[^\n]{0,20}/i) || [""])[0],
      },
      bodyClip: body.replace(/\s+/g, " ").slice(0, 900),
    };
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const repair2 = page.locator("text=Repair").first();
  if (await repair2.count()) await repair2.click().catch(() => {});
  await page.waitForTimeout(3000);
  const look2 = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      waitingOnBureauLine: /every file is waiting on a bureau/i.test(body),
      tiles: {
        needMe: (body.match(/need me[^\n]{0,20}/i) || [""])[0],
        waiting: (body.match(/waiting on bureau[^\n]{0,20}/i) || [""])[0],
        stuck: (body.match(/stuck[^\n]{0,20}/i) || [""])[0],
      },
      header: (body.match(/nothing needs you[^\n]{0,80}|waiting on a bureau[^\n]{0,80}/gi) || []).slice(0, 8),
    };
  });
  const cases = await api(page, `/api/read/repair-cases`);
  result.holes[14] = {
    look1,
    look2,
    api: {
      status: cases.status,
      counts: cases.body?.data?.counts || cases.body?.counts || null,
      rows: (cases.body?.data?.cases || cases.body?.cases || []).slice(0, 8).map((r) => pick(r, ["client_name", "name", "stage", "stuck", "status", "waiting_on_bureau"])),
    },
  };
}

// --- hole 16: ID reader 429 look only ---
{
  const dash = await api(page, `/api/dashboard/client?id=${IDS.nine}`);
  const docs = await api(page, `/api/read/documents?client_id=${IDS.nine}`);
  const screen = await extractAfter(
    `${BASE}/app/client-control-panel.html?id=${IDS.nine}`,
    () => {
      const body = document.body.innerText;
      return {
        reader: /document reader|429|no credits|not been read|waiting on the document/i.test(body),
        snip: (body.match(/document reader[^\n]{0,80}|not been read[^\n]{0,80}|credits[^\n]{0,60}/gi) || []).slice(0, 6),
      };
    }
  );
  const docList = docs.body?.data?.documents || docs.body?.documents || [];
  result.holes[16] = {
    screen,
    api: {
      identity: (dash.body?.data?.client || dash.body?.client || {}).identity_verified ?? null,
      docsStatus: docs.status,
      docs: (Array.isArray(docList) ? docList : []).slice(0, 12).map((d) => pick(d, ["title", "kind", "subtype", "status", "read_status", "ocr_status", "error"])),
    },
  };
}

// --- hole 17: inquiry upload look (no upload unless count 0; this script never POSTs except login) ---
{
  const screen = await openTwice(
    `${BASE}/app/client-portal.html?id=${IDS.thirteen}`,
    () => {
      const body = document.body.innerText;
      return {
        door: /upload inquiry|ftc|inquiry documents/i.test(body),
        send1: /send 1 file/i.test(body),
        snip: (body.match(/inquiry[\s\S]{0,200}/i) || [""])[0].replace(/\s+/g, " ").slice(0, 200),
      };
    }
  );
  const docs = await api(page, `/api/read/documents?client_id=${IDS.thirteen}`);
  const docList = docs.body?.data?.documents || docs.body?.documents || [];
  result.holes[17] = {
    screen,
    api: {
      status: docs.status,
      count: Array.isArray(docList) ? docList.length : null,
      docs: (Array.isArray(docList) ? docList : []).slice(0, 8).map((d) => pick(d, ["title", "kind", "subtype", "status", "bytes", "byte_size"])),
    },
  };
}

// --- hole 18: Combo pay pending ---
{
  const dash = await api(page, `/api/dashboard/client?id=${IDS.combo}`);
  const rounds = await api(page, `/api/read/funding-rounds?client_id=${IDS.combo}`);
  const invoices = await api(page, `/api/read/invoices?client_id=${IDS.combo}`);
  const tx = await api(page, `/api/read/transactions?client_id=${IDS.combo}`);
  const screen = await extractAfter(
    `${BASE}/app/client-control-panel.html?id=${IDS.combo}`,
    () => {
      const body = document.body.innerText;
      return {
        pending: /pending/i.test(body),
        threek: /3,?000/.test(body),
        rounds: /funding round|round 1/i.test(body),
        snip: (body.match(/pay[^\n]{0,80}|pending[^\n]{0,80}|round[^\n]{0,60}/gi) || []).slice(0, 8),
      };
    }
  );
  result.holes[18] = {
    screen,
    api: {
      dashStatus: dash.status,
      roundsStatus: rounds.status,
      rounds: rounds.body?.data?.rounds || rounds.body?.rounds || [],
      invoices: (invoices.body?.data?.invoices || invoices.body?.invoices || []).slice(0, 6).map((i) => pick(i, ["number", "status", "amount_cents", "paid_cents"])),
      txStatus: tx.status,
      tx: (tx.body?.data?.transactions || tx.body?.transactions || []).slice(0, 8).map((t) => pick(t, ["status", "amount_cents", "kind", "source", "provider_status"])),
    },
  };
}

// --- hole 19: #12 progress checklist ---
{
  const screen = await openTwice(
    `${BASE}/progress.html?client_id=${IDS.twelve}`,
    () => {
      const body = document.body.innerText;
      return {
        notSetUp: /checklist has not been set up/i.test(body),
        bounce: /email me a sign-in link/i.test(body),
        checklistLines: (body.match(/no new credit|personal loan|llc|ein|checking|waypoint/gi) || []).slice(0, 10),
        snip: body.replace(/\s+/g, " ").slice(0, 500),
      };
    }
  );
  const prog = await api(page, `/api/read/client-progress?client_id=${IDS.twelve}`);
  result.holes[19] = {
    screen,
    api: {
      status: prog.status,
      waypoints: prog.body?.data?.waypoints || prog.body?.waypoints || null,
      nextStep: prog.body?.data?.nextStep || prog.body?.nextStep || null,
      message: prog.body?.data?.message || prog.body?.message || null,
    },
  };
}

// --- hole 22: Combo 0 docs / no address ---
{
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const repair = page.locator("text=Repair").first();
  if (await repair.count()) await repair.click().catch(() => {});
  await page.waitForTimeout(2500);
  const specText = clip(await page.locator("body").innerText().catch(() => ""), 1600);
  const dash = await api(page, `/api/dashboard/client?id=${IDS.combo}`);
  const docs = await api(page, `/api/read/documents?client_id=${IDS.combo}`);
  const c = dash.body?.data?.client || dash.body?.client || {};
  const docList = docs.body?.data?.documents || docs.body?.documents || [];
  result.holes[22] = {
    specialistHasCombo: /combo-20260918|sim combo/i.test(specText),
    noAddressOnDesk: /no address on file/i.test(specText),
    specClip: specText,
    api: {
      address: c.address || c.street || c.home_address || c.custom_fields?.address || null,
      city: c.city || null,
      zip: c.zip || c.postal_code || null,
      docCount: Array.isArray(docList) ? docList.length : null,
      docs: (Array.isArray(docList) ? docList : []).slice(0, 8).map((d) => pick(d, ["title", "kind", "subtype"])),
    },
  };
}

// --- hole 23: consent lie ---
{
  const screen = await openTwice(
    `${BASE}/app/client-control-panel.html?id=${IDS.thirteen}`,
    () => {
      const body = document.body.innerText;
      return {
        scores: (body.match(/771|778|766/g) || []).slice(0, 6),
        noPermission: /no written permission|cannot pull/i.test(body),
        sampleLabel: /sample scores|not a real credit pull/i.test(body),
        snip: (body.match(/permission[^\n]{0,80}|cannot pull[^\n]{0,80}|sample scores[^\n]{0,80}/gi) || []).slice(0, 8),
      };
    }
  );
  const dash = await api(page, `/api/dashboard/client?id=${IDS.thirteen}`);
  result.holes[23] = {
    screen,
    api: {
      scores: (dash.body?.data?.crs_results || dash.body?.crs_results || []).slice(0, 3).map((r) => pick(r, ["bureau", "score", "simulated", "is_simulated"])),
      consent: (dash.body?.data?.client || dash.body?.client || {}).consent_on_file ?? null,
    },
  };
}

await browser.close();

// --- hole 20: gmail, no send, no secrets ---
{
  const cfg = gmailConfigFromEnv(process.env);
  let search = { tried: false };
  if (cfg.ready) {
    try {
      const client = createGmailClientFromConfig(cfg);
      const q = await client.listMessages({ q: "in:anywhere newer_than:30d", maxResults: 1 });
      search = { tried: true, ok: true, got: Array.isArray(q?.messages) ? q.messages.length : 0 };
    } catch (err) {
      search = { tried: true, ok: false, err: String(err?.message || err).slice(0, 80) };
    }
  }
  result.holes[20] = {
    ready: Boolean(cfg.ready),
    missing: cfg.missing || [],
    tokenSource: cfg.tokenSource || null,
    search,
  };
}

writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  login: result.login,
  blocked: result.blocked.slice(0, 20),
  holes: Object.fromEntries(Object.entries(result.holes).map(([k, v]) => [k, summarize(k, v)])),
}, null, 2));

function summarize(k, v) {
  if (k === "7") return { hasNoStep: v.screen?.load1?.hasNoStep, hasNoStep2: v.screen?.load2?.hasNoStep, next1: v.screen?.load1?.nextSnip, stored: v.api?.employee_next_action, tasks: v.api?.taskTitles };
  if (k === "8") return { notFunded: v.screen?.load1?.notFunded, personFunded: v.api?.personFunded, fundedAmount: v.api?.fundedAmount, rounds: v.api?.rounds, listRow: v.api?.listRow, ops: v.ops, fulfillHas: v.pipelineLook?.bodyHas, fulfillText: String(v.pipelineLook?.fulfillText || "").slice(0, 300) };
  if (k === "9") return { has2500Screen: v.has2500Screen, hasDueNow: v.hasDueNow, payText: v.payText?.slice(0, 400), invoices: v.api?.invoiceSnips };
  if (k === "11") return { nothing1: v.screen?.load1?.nothing, nothing2: v.screen?.load2?.nothing, course: v.screen?.load1?.course, ownSnip: v.screen?.load1?.ownSnip, ents: v.api?.ents };
  if (k === "12") return { remove: v.screen?.load1?.remove, collect: v.screen?.load1?.collect, stored: v.api?.stored, listStored: v.api?.listStored, chip: v.api?.chip };
  if (k === "13") return { id1: v.idDoor?.load1, id2: v.idDoor?.load2, cid1: v.cidDoor?.load1, cid2: v.cidDoor?.load2 };
  if (k === "14") return { look1: v.look1, look2: v.look2, counts: v.api?.counts };
  if (k === "16") return { reader: v.screen?.reader, snip: v.screen?.snip, identity: v.api?.identity, docs: v.api?.docs };
  if (k === "17") return { door: v.screen?.load1?.door, count: v.api?.count, docs: v.api?.docs };
  if (k === "18") return { pending: v.screen?.pending, threek: v.screen?.threek, rounds: v.api?.rounds, tx: v.api?.tx, invoices: v.api?.invoices };
  if (k === "19") return { notSetUp1: v.screen?.load1?.notSetUp, notSetUp2: v.screen?.load2?.notSetUp, bounce: v.screen?.load1?.bounce, waypoints: v.api?.waypoints, message: v.api?.message };
  if (k === "20") return v;
  if (k === "22") return { specialistHasCombo: v.specialistHasCombo, noAddressOnDesk: v.noAddressOnDesk, address: v.api?.address, city: v.api?.city, zip: v.api?.zip, docCount: v.api?.docCount, docs: v.api?.docs };
  if (k === "23") return { scores1: v.screen?.load1?.scores, noPerm1: v.screen?.load1?.noPermission, sample1: v.screen?.load1?.sampleLabel, snip: v.screen?.load1?.snip, apiScores: v.api?.scores };
  return v;
}
