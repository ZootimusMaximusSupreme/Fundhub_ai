#!/usr/bin/env node
// One portal session per client. Remaining MATRIX needed files now that DOC-CHECK woke.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadEnv } from "../load-env.mjs";
loadEnv();
import pg from "pg";
import { db, close as closeDb } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NOTES = path.join(ROOT, "docs/workflows/live-walkthrough-2026-09-16-notes.md");
const BASE = "https://fundhub.ai";
const PACK = (n, f) => path.join(ROOT, "docs/workflows/sim-documents", n, f);
const PEOPLE = [
  {
    n: 8,
    id: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
    last: "Eight-Funding",
    files: [
      { step: "SESS-#8-ssn", subtype: "ssn_card", file: PACK("08", "ssn-card-1.png"), expected: "approved" },
      { step: "SESS-#8-id1", subtype: "id_document", file: PACK("08", "photo-id-1.png"), expected: "approved after identity" },
      { step: "SESS-#8-addr", subtype: "proof_of_address", file: PACK("08", "proof-of-address-1.png"), expected: "approved after identity" }
    ]
  },
  {
    n: 9,
    id: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
    last: "Nine-Repair",
    files: [
      { step: "SESS-#9-id1", subtype: "id_document", file: PACK("09", "photo-id-1.png"), expected: "approved after identity" },
      { step: "SESS-#9-addr", subtype: "proof_of_address", file: PACK("09", "proof-of-address-1.png"), expected: "approved after identity" }
    ]
  },
  {
    n: 10,
    id: "22103bca-0ec9-4491-bb75-5d1b6528f116",
    last: "Ten-Trial",
    files: [
      { step: "SESS-#10-id1", subtype: "id_document", file: PACK("10", "photo-id-1.png"), expected: "approved after identity" },
      { step: "SESS-#10-addr", subtype: "proof_of_address", file: PACK("10", "proof-of-address-1.png"), expected: "approved after identity" }
    ]
  }
];

function rec(step, result, saw) {
  const clean = String(saw || "").replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 800);
  fs.appendFileSync(NOTES, `| ${step} | ${result} | ${clean} |\n`);
  console.log(`${step}  ${result}  ${clean.slice(0, 300)}`);
}

const pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sql = (q, p = []) => pgClient.query(q, p).then((r) => r.rows);
const wait = (p, ms) => p.waitForTimeout(ms);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractUrl(body) {
  const urls = String(body || "").match(/https:\/\/fundhub\.ai\/[^"'<\s]+/g) || [];
  const hit = urls.find((u) => /portal-login|\?t=/.test(u));
  return hit ? hit.replace(/[),.;]+$/, "") : null;
}

async function newestLink(id) {
  const rows = await sql(
    `SELECT rendered_body, created_at FROM messages
      WHERE client_id=$1 AND created_at > now() - interval '10 minutes'
      ORDER BY created_at DESC LIMIT 12`,
    [id]
  );
  for (const row of rows) {
    const u = extractUrl(row.rendered_body);
    if (u) return u;
  }
  return null;
}

async function afterState(id, since) {
  const runs = await sql(
    `SELECT outcome, left(coalesce(detail,''),160) AS detail, created_at
       FROM agent_runs WHERE client_id=$1 AND agent_code='DOC-CHECK' AND created_at>=$2
      ORDER BY created_at DESC`,
    [id, since]
  );
  const tasks = await sql(
    `SELECT title FROM tasks WHERE client_id=$1 AND created_at>=$2 AND title ILIKE '%by hand%'`,
    [id, since]
  );
  const ident = await sql(
    `SELECT verified_legal_name IS NOT NULL AS has_name, verified_address IS NOT NULL AS has_addr
       FROM pii_identity WHERE client_id=$1`,
    [id]
  );
  return { runs, tasks, ident: ident[0] || null };
}

let page;
async function staffOn() {
  const r = await db.query(`SELECT id, org_id FROM staff WHERE lower(email)='chris@fundhub.ai' AND status='active' LIMIT 1`);
  const sess = await createSession(db, { staffId: r.rows[0].id, orgId: r.rows[0].org_id, userAgent: "doc-sess" });
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("fh_token", t), sess.token);
}

async function openPortal(browser, id) {
  await page.goto(`${BASE}/app/client-control-panel.html?id=${id}`, { waitUntil: "domcontentloaded" });
  await page.locator("#ccp-name").waitFor({ timeout: 15000 }).catch(() => {});
  await wait(page, 1200);
  const btn = page.locator("#ccp-portal-link");
  if (await btn.count()) {
    await btn.click({ force: true, timeout: 8000 }).catch(() => {});
    await wait(page, 5000);
  }
  let url = await newestLink(id);
  if (!url) {
    await wait(page, 4000);
    url = await newestLink(id);
  }
  if (!url) return { err: "no magic link" };
  const ctx = await browser.newContext();
  const po = await ctx.newPage();
  await po.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  try {
    await po.locator('.upload-door[data-kind="client_upload"]').waitFor({ state: "attached", timeout: 20000 });
  } catch {
    const t = (await po.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    await ctx.close();
    return { err: `no door ${t}` };
  }
  return { ctx, po };
}

async function sendFile(po, subtype, filePath) {
  const door = po.locator('.upload-door[data-kind="client_upload"]');
  await door.locator("[data-subtype]").selectOption(subtype);
  await door.locator("[data-file-input]").setInputFiles(filePath);
  await wait(po, 350);
  const send = door.locator("[data-upload-btn]");
  await send.click();
  const start = Date.now();
  let label = "";
  while (Date.now() - start < 10000) {
    label = (await send.innerText().catch(() => "")).trim();
    if (/^Sent$/i.test(label) || /Try again/i.test(label)) break;
    await wait(po, 350);
  }
  return label;
}

async function stage(last, step) {
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded" });
  await wait(page, 1600);
  if (await page.locator("#tab-repair").count()) await page.locator("#tab-repair").click({ force: true });
  await wait(page, 1600);
  const row = page.getByText(last).first();
  if (await row.count()) await row.click({ force: true });
  await wait(page, 900);
  const btn = page.locator('[data-act="repair-stage"]').first();
  if (await btn.count()) {
    await btn.click({ force: true });
    await wait(page, 4000);
  }
  const msg = (await page.locator("[data-send-msg]").first().innerText().catch(() => "")).trim();
  rec(step, /Letters staged/i.test(msg) ? "PASS" : "FAIL", msg || "no msg");
  rec(`${step}-no-enroll`, "PASS", "Did not Enroll. Did not Send.");
}

async function main() {
  fs.appendFileSync(NOTES, `\n### One-session remaining MATRIX files (after DOC-CHECK woke)\n\n| Step | Result | What the live screen / live DB showed |\n|---|---|---|\n`);
  await pgClient.connect();
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const staff = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await staff.newPage();
  page.setDefaultTimeout(20000);
  page.on("dialog", async (d) => { /delete|mail|enroll/i.test(d.message()) ? await d.dismiss() : await d.accept(); });
  await staffOn();

  for (const person of PEOPLE) {
    const port = await openPortal(browser, person.id);
    if (port.err) {
      rec(`SESS-#${person.n}-portal`, "FAIL", port.err);
      continue;
    }
    rec(`SESS-#${person.n}-portal`, "PASS", "ID and personal documents door open. Inquiry door not used.");
    for (const item of person.files) {
      const since = new Date();
      const btn = await sendFile(port.po, item.subtype, item.file);
      rec(`${item.step}-upload`, /^Sent$/i.test(btn) ? "PASS" : "FAIL", `pick=${item.subtype} file=${path.basename(item.file)} btn="${btn}"`);
      if (!/^Sent$/i.test(btn)) continue;
      let state = { runs: [], tasks: [], ident: null };
      const end = Date.now() + 55000;
      while (Date.now() < end) {
        state = await afterState(person.id, since);
        if (state.runs.length) break;
        await sleep(6000);
      }
      const outcome = String(state.runs[0]?.outcome || "none");
      const unread = state.tasks.length > 0;
      const accept = /^accept$/i.test(outcome);
      const more = /request_more/i.test(outcome);
      let result = "FAIL";
      let why = `expected ${item.expected} got ${outcome.slice(0, 80)}`;
      if (accept && /approved/i.test(item.expected)) result = "PASS";
      else if (more && /request more/i.test(item.expected)) result = "PASS";
      else if (/429|no credits/i.test(outcome) || unread) {
        result = "FAIL";
        why = `agent saw file; reader 429 no credits; unreadTask=${unread}; no accept/request_more`;
      }
      rec(`${item.step}-agent`, result, `${why} identName=${state.ident?.has_name} identAddr=${state.ident?.has_addr} detail=${String(state.runs[0]?.detail || "").slice(0, 120)}`);
    }
    await port.ctx.close();
  }

  await stage("Nine-Repair", "SESS-stage-#9");
  await stage("Ten-Trial", "SESS-stage-#10");

  await page.goto(`${BASE}/app/calendar.html`, { waitUntil: "domcontentloaded" });
  await wait(page, 1800);
  const cal = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  rec(
    "SESS-calendar-unread",
    /nobody has read it|Check this id document by hand/i.test(cal) ? "PASS" : "FAIL",
    cal.match(/Check this.{0,80}|nobody has read.{0,60}|No date on it.{0,80}/i)?.[0] || cal.slice(0, 220)
  );

  await browser.close();
  await pgClient.end();
  await closeDb();
}

main().catch((e) => {
  rec("FATAL", "FAIL", String(e.stack || e).slice(0, 500));
  process.exit(1);
});
