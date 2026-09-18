#!/usr/bin/env node
// Live Repair-lane e2e for #9 Nine-Repair. Tester only. No product-code edits.
// Stage once. No Send (paper mail). No Pull. No Enroll. No remint.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";
import { loadEnv } from "../load-env.mjs";
loadEnv();
import { db, close } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";
import { gmailConfigFromEnv, createGmailClientFromConfig } from "../../src/gmail/index.mjs";

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const PACK = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/sim-documents/09";
const OUT = "/tmp/full-e2e-repair-2026-09-18";
const AGENT_PHONE = "+16616054248";
mkdirSync(OUT, { recursive: true });

const ev = {
  started_at: new Date().toISOString(),
  file: { id: NINE, name: "Sim Nine-Repair" },
  health: null,
  login: null,
  session: null,
  db_before: null,
  identity_prep: null,
  screen: {},
  uploads: [],
  stage: null,
  generate_api: null,
  db_after: null,
  gmail: null,
  sms: null,
  extra_sms: null,
  errors: []
};

function clip(s, n = 800) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}
function dump(name, obj) {
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(obj, null, 2));
}

async function q(label, sql, params = []) {
  try {
    return (await db.query(sql, params)).rows;
  } catch (err) {
    ev.errors.push(`${label}: ${err && err.message ? err.message : err}`);
    return [];
  }
}

async function snapshot(tag) {
  const client = (await q("client",
    `SELECT id, first_name, last_name, email, phone,
            (custom_fields ? 'address_line1') AS has_addr,
            (custom_fields ? 'dob') AS has_dob,
            custom_fields->>'employee_next_action' AS stored_next
       FROM clients WHERE id = $1`,
    [NINE]
  ))[0] || null;
  const program = await q("program",
    `SELECT status, program, rounds_cap, created_at
       FROM repair_programs WHERE client_id = $1 ORDER BY created_at DESC LIMIT 3`,
    [NINE]
  );
  const letters = (await q("letters",
    `SELECT count(*)::int AS n FROM dispute_letters WHERE client_id = $1`,
    [NINE]
  ))[0] || { n: null };
  const docs = await q("docs",
    `SELECT kind, subtype, title, created_at
       FROM documents WHERE client_id = $1
       ORDER BY created_at DESC LIMIT 30`,
    [NINE]
  );
  const contracts = await q("contracts",
    `SELECT title, status, signed_at::text FROM contracts WHERE client_id = $1`,
    [NINE]
  );
  const agents = await q("agents",
    `SELECT code, status, length(coalesce(prompt,''))::int AS prompt_letters
       FROM agents WHERE code IN ('DOC-CHECK','AG-04','AG-09','GHL-DOC')
       ORDER BY code`
  );
  const tasks = await q("tasks",
    `SELECT title, created_at
       FROM tasks WHERE client_id = $1
         AND (title ILIKE '%id%' OR title ILIKE '%proof%' OR title ILIKE '%document%' OR title ILIKE '%read%')
       ORDER BY created_at DESC LIMIT 12`,
    [NINE]
  );
  const entitlements = await q("entitlements",
    `SELECT entitlement_code, revoked_at, granted_at
       FROM entitlements WHERE client_id = $1 ORDER BY granted_at DESC`,
    [NINE]
  );
  const messages = await q("messages",
    `SELECT channel, status, template_key, to_address, created_at, sent_at
       FROM messages WHERE client_id = $1
       ORDER BY created_at DESC LIMIT 40`,
    [NINE]
  );
  const runs = await q("runs",
    `SELECT agent_code, outcome, created_at
       FROM agent_runs WHERE client_id = $1
       ORDER BY created_at DESC LIMIT 12`,
    [NINE]
  );
  return { tag, at: new Date().toISOString(), client, program, letters, docs, contracts, agents, tasks, entitlements, messages, runs };
}

async function jsonGet(ctx, path) {
  const res = await ctx.request.get(BASE + path);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { parse_error: true, text: clip(text, 400) }; }
  return { status: res.status(), json };
}

async function jsonPost(ctx, path, body) {
  const res = await ctx.request.post(BASE + path, { data: body });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { parse_error: true, text: clip(text, 400) }; }
  return { status: res.status(), json };
}

function visClass(page, cls) {
  return page.evaluate((c) => !document.body.classList.contains(c), cls);
}

async function portalUpload(page, doorSelector, subtype, filePath, label) {
  const row = { label, subtype, file: filePath.split("/").pop(), ok: false };
  try {
    const door = page.locator(doorSelector);
    const visible = await door.isVisible().catch(() => false);
    row.door_visible = visible;
    if (!visible) {
      row.error = "door not visible";
      return row;
    }
    await door.locator("[data-subtype]").selectOption(subtype);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15_000 }),
      door.locator("[data-upload-btn]").click()
    ]);
    await chooser.setFiles(filePath);
    await page.waitForTimeout(400);
    const btn = door.locator("[data-upload-btn]");
    row.button_after_pick = clip(await btn.innerText());
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/documents-upload") && r.request().method() === "POST", { timeout: 60_000 }),
      btn.click()
    ]);
    row.http = resp.status();
    try { row.body = await resp.json(); } catch { row.body = { text: clip(await resp.text(), 300) }; }
    row.ok = !!(row.body && row.body.ok);
    row.button_after_send = clip(await btn.innerText());
    await page.screenshot({ path: `${OUT}/upload-${label}.png`, fullPage: true });
  } catch (err) {
    row.error = String(err && err.message ? err.message : err);
    await page.screenshot({ path: `${OUT}/upload-${label}-err.png`, fullPage: true }).catch(() => {});
  }
  return row;
}

async function waitDocCheck(afterIso, ms = 120_000) {
  const start = Date.now();
  let last = [];
  while (Date.now() - start < ms) {
    last = await q("doccheck-poll",
      `SELECT agent_code, outcome, created_at
         FROM agent_runs
        WHERE client_id = $1 AND created_at >= $2::timestamptz
        ORDER BY created_at DESC LIMIT 8`,
      [NINE, afterIso]
    );
    if (last.some((r) => String(r.agent_code || "").toUpperCase().includes("DOC"))) return last;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return last;
}

try {
  const healthRes = await fetch(`${BASE}/api/health`);
  const healthJson = await healthRes.json().catch(() => ({}));
  ev.health = {
    status: healthRes.status,
    ok: healthJson.ok,
    db: healthJson.database || healthJson.db,
    pending: healthJson.pending ?? healthJson.migrations_pending ?? healthJson.pending_migrations
  };

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: EMAIL,
      password: process.env.STAFF_E2E_PASSWORD || process.env.STAFF_INITIAL_PASSWORD || ""
    })
  });
  ev.login = { status: loginRes.status, injected: loginRes.status === 401 };
  if (loginRes.status !== 401 && loginRes.status !== 200) {
    ev.login.body_error = clip(await loginRes.text(), 200);
  }

  ev.db_before = await snapshot("before");

  const hasAddr = ev.db_before.client && ev.db_before.client.has_addr === true;
  const hasDob = ev.db_before.client && ev.db_before.client.has_dob === true;
  if (!hasAddr || !hasDob) {
    const run = spawnSync(
      process.execPath,
      ["scripts/sim/put-identity-on-file.mjs", "--client", "9", "--write"],
      { cwd: "/Users/chrisstanbridge/Developer/fundhub-platform", encoding: "utf8" }
    );
    ev.identity_prep = {
      needed: true,
      status: run.status,
      stdout: clip(run.stdout, 400),
      stderr: clip(run.stderr, 400)
    };
  } else {
    ev.identity_prep = { needed: false, already_on_file: true };
  }

  const staffRow = (await db.query(
    `SELECT id, org_id, email, role, name FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
    [EMAIL]
  )).rows[0];
  if (!staffRow) throw new Error("no staff row");
  const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });
  ev.session = { role: staffRow.role, name: staffRow.name, injected: true };

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await ctx.addCookies([
    { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
    { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true }
  ]);
  const page = await ctx.newPage();

  const sess = await jsonGet(ctx, "/api/auth/session");
  ev.session.api = { status: sess.status, role: sess.json?.staff?.role || sess.json?.role, email: sess.json?.staff?.email || sess.json?.email };

  const dash = await jsonGet(ctx, `/api/dashboard/client?id=${NINE}`);
  ev.screen.dashboard_api = {
    status: dash.status,
    name: dash.json?.client?.first_name || dash.json?.first_name,
    next_action: dash.json?.fulfillment?.next_action || dash.json?.next_action,
    blockers: dash.json?.fulfillment?.blockers || dash.json?.active_blockers || dash.json?.blockers,
    degraded: dash.json?.fulfillment?.degraded || dash.json?.next_action_degraded
  };

  const repairList = await jsonGet(ctx, "/api/read/repair-cases");
  ev.screen.repair_queue_api = {
    status: repairList.status,
    ok: repairList.json?.ok,
    files: (repairList.json?.files || []).map((f) => ({
      name: f.name, client_id: f.client_id, program: f.program, stage_key: f.stage_key,
      need: f.need || f.needs, letters_ready: f.letters_ready, round: f.round
    }))
  };
  const repairOne = await jsonGet(ctx, `/api/read/repair-cases?client_id=${NINE}`);
  ev.screen.repair_file_api = {
    status: repairOne.status,
    ok: repairOne.json?.ok,
    letters: (repairOne.json?.letters || []).length,
    items: (repairOne.json?.items || []).length,
    can_send: (repairOne.json?.letters || []).filter((l) => l.can_send).length,
    rounds: repairOne.json?.rounds,
    file: repairOne.json?.file
  };

  // CCP — next action lie
  await page.goto(`${BASE}/app/client-control-panel.html?id=${NINE}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  const ccpEarly = await page.evaluate(() => ({
    name: (document.getElementById("ccp-name") || {}).innerText || "",
    next: (document.getElementById("ccp-next-action") || {}).innerText || "",
    blockers: (document.getElementById("ccp-cp-blockers") || {}).innerText || "",
    body: (document.body ? document.body.innerText : "").slice(0, 2500)
  }));
  ev.screen.ccp_early = { name: clip(ccpEarly.name, 120), next: clip(ccpEarly.next, 200), blockers: clip(ccpEarly.blockers, 600) };
  await page.screenshot({ path: `${OUT}/ccp-early.png`, fullPage: true });
  await page.waitForTimeout(7000);
  const ccp = await page.evaluate(() => ({
    name: (document.getElementById("ccp-name") || {}).innerText || "",
    next: (document.getElementById("ccp-next-action") || {}).innerText || "",
    blockers: (document.getElementById("ccp-cp-blockers") || {}).innerText || "",
    waiting: (document.getElementById("ccp-waiting-what") || {}).innerText || "",
    bodyHasNine: (document.body ? document.body.innerText : "").includes("Nine-Repair"),
    body: (document.body ? document.body.innerText : "").slice(0, 4000)
  }));
  ev.screen.ccp = {
    name: clip(ccp.name, 120),
    next: clip(ccp.next, 240),
    blockers: clip(ccp.blockers, 800),
    waiting: clip(ccp.waiting, 240),
    bodyHasNine: ccp.bodyHasNine,
    unread_jobs: /id has not been read|nobody has read|photo id|proof of address|start the repair/i.test(ccp.body + " " + ccp.blockers),
    lie_no_step: /no step applies/i.test(ccp.next)
  };
  await page.screenshot({ path: `${OUT}/ccp.png`, fullPage: true });

  // Specialist Repair desk
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2000);
  const repairToggle = page.locator('button, [role="tab"], a, label').filter({ hasText: /^Repair$/ }).first();
  if (await repairToggle.count()) await repairToggle.click();
  await page.waitForTimeout(2500);
  const desk = await page.evaluate(() => {
    const body = document.body ? document.body.innerText : "";
    return {
      header: clipHead(body),
      hasNine: body.includes("Nine-Repair"),
      hasTen: body.includes("Ten-Trial"),
      body: body.slice(0, 3500)
    };
    function clipHead(t) { return String(t || "").replace(/\s+/g, " ").trim().slice(0, 500); }
  });
  ev.screen.repair_desk = {
    hasNine: desk.hasNine,
    hasTen: desk.hasTen,
    header: clip(desk.header, 500),
    lie_waiting_bureau: /waiting on a bureau/i.test(desk.body) && /Stuck/i.test(desk.body)
  };
  await page.screenshot({ path: `${OUT}/repair-desk.png`, fullPage: true });

  const nineRow = page.locator("tr, [role=row], li, button").filter({ hasText: "Nine-Repair" }).first();
  if (await nineRow.count()) {
    await nineRow.click();
    await page.waitForTimeout(2500);
  }
  const drawer = await page.evaluate(() => ({
    body: (document.body ? document.body.innerText : "").slice(0, 4500),
    stage: !!document.querySelector("[data-act=repair-stage]"),
    send: !!document.querySelector("[data-act=repair-send]"),
    sendDisabled: (() => {
      const b = document.querySelector("[data-act=repair-send]");
      return b ? b.disabled : null;
    })()
  }));
  ev.screen.repair_drawer = {
    stage_btn: drawer.stage,
    send_btn: drawer.send,
    send_disabled: drawer.sendDisabled,
    letters_on_screen: /no letters ready/i.test(drawer.body),
    snippet: clip(drawer.body, 900)
  };
  await page.screenshot({ path: `${OUT}/repair-drawer.png`, fullPage: true });

  // Documents desk
  await page.goto(`${BASE}/app/documents.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  const docsScreen = await page.evaluate(() => (document.body ? document.body.innerText : "").slice(0, 2500));
  ev.screen.documents = { snippet: clip(docsScreen, 700), hasNine: /Nine-Repair|sim-09/i.test(docsScreen) };
  await page.screenshot({ path: `${OUT}/documents.png`, fullPage: true });

  // Portal doors + uploads
  await page.goto(`${BASE}/app/client-portal.html?id=${NINE}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(4000);
  const doors = {
    identity: await visClass(page, "no-funding-door"),
    inquiry: await visClass(page, "no-inquiry-door"),
    bureau: await visClass(page, "no-bureau-door"),
    any: await visClass(page, "no-upload-doors"),
    greeting: clip(await page.locator("body").innerText(), 500)
  };
  ev.screen.portal_doors = doors;
  await page.screenshot({ path: `${OUT}/portal.png`, fullPage: true });

  const uploadAt = new Date().toISOString();
  const idFile = `${PACK}/photo-id-1.png`;
  const proofFile = `${PACK}/proof-of-address-1.png`;
  const blurFile = `${PACK}/photo-id-2.png`;
  const ftcFile = `${PACK}/photo-id-1.png`;
  const bureauBlur = `${PACK}/bureau-letter-2.png`;

  if (!existsSync(idFile)) throw new Error("missing sim pack photo-id-1");

  ev.uploads.push(await portalUpload(page, ".upload-door.door-funding", "id_document", idFile, "id-good"));
  await page.waitForTimeout(1500);
  ev.uploads.push(await portalUpload(page, ".upload-door.door-funding", "proof_of_address", proofFile, "proof-good"));

  if (doors.inquiry) {
    ev.uploads.push(await portalUpload(page, ".upload-door.door-inquiry", "ftc_report", ftcFile, "ftc"));
  } else {
    ev.uploads.push({ label: "ftc", door_visible: false, skipped: "inquiry/FTC door closed on this repair file" });
  }

  ev.screen.doc_check_wait = await waitDocCheck(uploadAt, 150_000);

  // One AI doc follow-up: blurry ID → request_more chase (one). Skip if door gone.
  await page.goto(`${BASE}/app/client-portal.html?id=${NINE}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3000);
  ev.uploads.push(await portalUpload(page, ".upload-door.door-funding", "id_document", blurFile, "id-blurry-chase"));
  ev.screen.doc_check_wait_chase = await waitDocCheck(uploadAt, 90_000);

  // Stage once on Specialist desk — real next job after docs, and the live letter path.
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1500);
  if (await repairToggle.count()) await repairToggle.click();
  await page.waitForTimeout(2500);
  const nineRow2 = page.locator("tr, [role=row], li, button").filter({ hasText: "Nine-Repair" }).first();
  if (await nineRow2.count()) {
    await nineRow2.click();
    await page.waitForTimeout(2500);
  }
  const stageBtn = page.locator("[data-act=repair-stage]");
  ev.stage = { present: await stageBtn.count() > 0, clicked: false };
  if (ev.stage.present) {
    const [genResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/repair/generate") && r.request().method() === "POST", { timeout: 180_000 }).catch(() => null),
      stageBtn.click()
    ]);
    ev.stage.clicked = true;
    ev.stage.clicks = 1;
    if (genResp) {
      ev.stage.http = genResp.status();
      try { ev.stage.body = await genResp.json(); } catch { ev.stage.body = { text: clip(await genResp.text(), 400) }; }
    }
    await page.waitForTimeout(2000);
    ev.stage.notify = clip(await page.locator("[data-send-msg]").innerText().catch(() => ""), 400);
    ev.stage.button = clip(await stageBtn.innerText().catch(() => ""), 80);
    await page.screenshot({ path: `${OUT}/stage-once.png`, fullPage: true });
  } else {
    ev.stage.error = "Stage button not on screen";
    await page.screenshot({ path: `${OUT}/stage-missing.png`, fullPage: true });
  }

  // Direct generate capture if the click missed the network (still one Stage click above).
  if (ev.stage.clicked && !ev.stage.body) {
    ev.generate_api = await jsonPost(ctx, "/api/repair/generate", { client_id: NINE });
  }

  const lettersAfter = await jsonGet(ctx, `/api/read/repair-cases?client_id=${NINE}`);
  ev.screen.repair_file_after = {
    status: lettersAfter.status,
    letters: (lettersAfter.json?.letters || []).length,
    items: (lettersAfter.json?.items || []).length,
    can_send: (lettersAfter.json?.letters || []).filter((l) => l.can_send).length,
    file: lettersAfter.json?.file
  };

  // Simulated letter loop: UI requires mail:true (paper). mail:false is no_channel.
  ev.simulated_letter_loop = {
    door: "none on live desk",
    note: "Specialist Send always posts mail:true (paper / PostGrid). API mail:false returns no_channel. Not used."
  };

  // Bureau blurry only if letters staged (MATRIX: after round letters). Else skip.
  if ((ev.screen.repair_file_after.letters || 0) > 0 && doors.bureau) {
    await page.goto(`${BASE}/app/client-portal.html?id=${NINE}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2500);
    ev.uploads.push(await portalUpload(page, ".upload-door.door-bureau", "bureau_letter", bureauBlur, "bureau-blurry"));
  } else {
    ev.uploads.push({
      label: "bureau-blurry",
      skipped: (ev.screen.repair_file_after.letters || 0) > 0 ? "bureau door closed" : "no letters staged — MATRIX says bureau after round letters"
    });
  }

  ev.db_after = await snapshot("after");

  const newMsgs = (ev.db_after.messages || []).filter((m) => {
    const t = new Date(m.created_at).getTime();
    return t >= Date.parse(uploadAt) - 5000;
  });
  ev.sms = {
    since_upload: newMsgs.filter((m) => String(m.channel || "").toLowerCase().includes("sms") || String(m.channel || "").toLowerCase() === "text"),
    email_since_upload: newMsgs.filter((m) => String(m.channel || "").toLowerCase().includes("email") || String(m.channel || "").toLowerCase() === "email"),
    all_since_upload: newMsgs
  };
  ev.extra_sms = {
    count: (ev.sms.since_upload || []).length,
    note: "Uploads may queue SMS-DOC-02 request_more (one chase in scope) and SMS-DOC-03 accept. Anything else is extra."
  };

  try {
    const cfg = gmailConfigFromEnv(process.env);
    if (!cfg.ready) {
      ev.gmail = { ok: false, reason: "not_configured", missing: cfg.missing };
    } else {
      const g = createGmailClientFromConfig(cfg);
      const q = `in:anywhere (to:stanbridgejchris+sim-09@gmail.com OR sim-09 OR "Nine-Repair" OR "retake" OR "documents approved" OR "Got your upload") newer_than:1d`;
      const listed = await g.listMessages({ maxResults: 15, q });
      const rows = [];
      for (const m of (listed.messages || []).slice(0, 10)) {
        const full = await g.getMessage(m.id);
        rows.push({
          date: g.headerValue(full, "Date"),
          to: g.headerValue(full, "To"),
          subject: g.headerValue(full, "Subject"),
          snippet: clip(full.snippet, 160)
        });
      }
      ev.gmail = { ok: true, query: q, count: listed.messages?.length || 0, est: listed.resultSizeEstimate, rows };
    }
  } catch (err) {
    ev.gmail = { ok: false, error: String(err && err.message ? err.message : err) };
  }

  await browser.close();
  ev.finished_at = new Date().toISOString();
  dump("evidence", ev);
  console.log(JSON.stringify({
    out: OUT,
    health: ev.health,
    login: ev.login,
    next: ev.screen.ccp && ev.screen.ccp.next,
    lie: ev.screen.ccp && ev.screen.ccp.lie_no_step,
    unread: ev.screen.ccp && ev.screen.ccp.unread_jobs,
    stage: ev.stage && { http: ev.stage.http, notify: ev.stage.notify, ok: ev.stage.body && ev.stage.body.ok },
    letters_after: ev.screen.repair_file_after && ev.screen.repair_file_after.letters,
    uploads: ev.uploads.map((u) => ({ label: u.label, ok: u.ok, http: u.http, error: u.error, skipped: u.skipped })),
    gmail: ev.gmail && { ok: ev.gmail.ok, count: ev.gmail.count, error: ev.gmail.error },
    sms_n: (ev.sms && ev.sms.since_upload && ev.sms.since_upload.length) || 0
  }, null, 2));
} catch (err) {
  ev.errors.push(String(err && err.stack ? err.stack : err));
  dump("evidence", ev);
  console.error("WALKER FAIL", err);
  process.exitCode = 1;
} finally {
  await close().catch(() => {});
}
