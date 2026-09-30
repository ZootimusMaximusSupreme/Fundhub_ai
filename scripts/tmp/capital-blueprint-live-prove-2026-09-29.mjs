#!/usr/bin/env node
// Live prove — Sim Eleven Capital Blueprint. Staff session only.
// No card charge. No ClickFunnels. Does not print cookies or secrets.
import { readFileSync } from "node:fs";
import { pool, close } from "../../src/db.mjs";
import { resolveDefaultOrg } from "../../src/auth/org.mjs";
import { isCapitalBlueprintBuyer } from "../../src/blueprint/coach-exception.mjs";
import { financeOsEntitlement } from "../../src/finance/finance-os-entitlement.mjs";
import { evaluateWaypoints } from "../../src/waypoints/verify.mjs";

const BASE = "https://fundhub.ai";
const CLIENT_ID = process.env.BLUEPRINT_CLIENT_ID || "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const EMAIL = "chris@fundhub.ai";
const PASSWORD = process.env.STAFF_INITIAL_PASSWORD || "";

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() || [];
  const joined = raw.length ? raw.join("\n") : (res.headers.get("set-cookie") || "");
  const m = String(joined).match(/fundhub_session=([^;]+)/);
  return m ? m[1] : null;
}

async function jsonReq(path, { method = "GET", cookie, body } = {}) {
  const headers = { cookie: `fundhub_session=${cookie}`, "user-agent": "fundhub-blueprint-prove" };
  let payload;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { parse_error: true, text: text.slice(0, 240) }; }
  return { status: res.status, json };
}

async function main() {
  const out = { clientId: CLIENT_ID, checks: {} };
  const db = pool();
  const orgId = await resolveDefaultOrg(db);

  const client = (await db.query(
    `SELECT id, first_name, last_name, email, assigned_csm_staff_id
       FROM clients WHERE org_id = $1 AND id = $2`,
    [orgId, CLIENT_ID]
  )).rows[0] || null;
  const txs = (await db.query(
    `SELECT product_name, status, amount_paid FROM transactions
      WHERE org_id = $1 AND client_id = $2 ORDER BY created_at DESC`,
    [orgId, CLIENT_ID]
  )).rows;
  const ents = (await db.query(
    `SELECT entitlement_code, revoked_at FROM entitlements
      WHERE org_id = $1 AND client_id = $2`,
    [orgId, CLIENT_ID]
  )).rows;
  const wps = (await db.query(
    `SELECT key, state, verify_kind FROM client_waypoints
      WHERE org_id = $1 AND client_id = $2 ORDER BY key`,
    [orgId, CLIENT_ID]
  )).rows;
  const buyer = await isCapitalBlueprintBuyer(db, { orgId, clientId: CLIENT_ID });
  const fos = await financeOsEntitlement(db, { orgId, clientId: CLIENT_ID });
  const staffRoles = (await db.query(
    `SELECT role, count(*)::int AS n FROM staff WHERE org_id = $1 GROUP BY role ORDER BY role`,
    [orgId]
  )).rows;

  out.checks.db = {
    client: client ? `${client.first_name} ${client.last_name}` : null,
    email: client?.email || null,
    assigned_csm_staff_id: client?.assigned_csm_staff_id || null,
    paidConsultingPackage: txs.some((t) =>
      String(t.product_name).toLowerCase().includes("consulting services package")
      && String(t.status).toLowerCase() === "succeeded"),
    txs,
    entitlements: ents,
    waypointKeys: wps.map((w) => w.key),
    disputeMailReceipt: wps.find((w) => w.key === "blueprint_dispute_mail_receipt") || null,
    buyer,
    financeOs: fos,
    staffRoles
  };

  if (!PASSWORD) {
    out.login = "missing STAFF_INITIAL_PASSWORD";
    console.log(JSON.stringify(out, null, 2));
    await close();
    process.exit(2);
  }

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "fundhub-blueprint-prove" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const cookie = cookieFrom(login);
  out.login = { status: login.status, hasSession: Boolean(cookie) };
  if (!cookie) {
    console.log(JSON.stringify(out, null, 2));
    await close();
    process.exit(1);
  }

  out.checks.combined = await jsonReq(
    `/api/read/blueprint-combined-approval?client_id=${CLIENT_ID}`,
    { cookie }
  );

  out.checks.listBankBefore = await jsonReq("/api/blueprint/staff-actions", {
    method: "POST", cookie, body: { action: "list_bank_todos", client_id: CLIENT_ID }
  });

  out.checks.offerTracker = await jsonReq("/api/blueprint/staff-actions", {
    method: "POST", cookie, body: { action: "offer_bank_tracker", client_id: CLIENT_ID, offered: true }
  });
  out.checks.addTodo = await jsonReq("/api/blueprint/staff-actions", {
    method: "POST",
    cookie,
    body: {
      action: "add_bank_todo",
      client_id: CLIENT_ID,
      bank_key: "chase",
      account_kind: "personal",
      notes: "prove Done/Skipped"
    }
  });
  out.checks.listBankAfterAdd = await jsonReq("/api/blueprint/staff-actions", {
    method: "POST", cookie, body: { action: "list_bank_todos", client_id: CLIENT_ID }
  });
  const todoId = out.checks.addTodo.json?.todo?.id
    || out.checks.listBankAfterAdd.json?.todos?.[0]?.id
    || null;
  out.todoId = todoId;
  if (todoId) {
    out.checks.markDone = await jsonReq("/api/blueprint/staff-actions", {
      method: "POST",
      cookie,
      body: { action: "update_bank_todo_state", client_id: CLIENT_ID, todo_id: todoId, state: "done" }
    });
    out.checks.putBack = await jsonReq("/api/blueprint/staff-actions", {
      method: "POST",
      cookie,
      body: { action: "update_bank_todo_state", client_id: CLIENT_ID, todo_id: todoId, state: "open" }
    });
  }

  out.checks.paydown = await jsonReq("/api/finance/paydown-simulator", {
    method: "POST", cookie, body: { client_id: CLIENT_ID, cash_on_hand: 2000 }
  });

  out.checks.csmQueue = await jsonReq("/api/read/csm-queue?limit=50", { cookie });
  const items = out.checks.csmQueue.json?.items || [];
  out.checks.csmRow = items.find((r) => r.client_id === CLIENT_ID) || null;
  out.checks.csmHasAssignedNameField = items.some((r) => Object.prototype.hasOwnProperty.call(r, "assigned_csm_name"))
    || (out.checks.csmQueue.json && Object.prototype.hasOwnProperty.call(out.checks.csmQueue.json, "items"));

  const png = readFileSync("docs/workflows/sim-documents/11/proof-of-address-1.png");
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "mailing-proof.png");
  form.append("client_id", CLIENT_ID);
  form.append("kind", "client_upload");
  form.append("subtype", "dispute_mail_receipt");
  const up = await fetch(`${BASE}/api/documents-upload`, {
    method: "POST",
    headers: { cookie: `fundhub_session=${cookie}`, "user-agent": "fundhub-blueprint-prove" },
    body: form
  });
  const upText = await up.text();
  let upJson = null;
  try { upJson = JSON.parse(upText); } catch { upJson = { parse_error: true, text: upText.slice(0, 240) }; }
  out.checks.upload = { status: up.status, ok: upJson?.ok === true, error: upJson?.error || null };

  const afterUpload = (await db.query(
    `SELECT key, state FROM client_waypoints
      WHERE org_id = $1 AND client_id = $2 AND key = 'blueprint_dispute_mail_receipt'`,
    [orgId, CLIENT_ID]
  )).rows[0] || null;
  out.checks.mailStepAfterUpload = afterUpload;

  const progress = await jsonReq(`/api/read/client-progress?client_id=${CLIENT_ID}`, { cookie });
  const progWp = (progress.json?.waypoints || []).find((w) => w.key === "blueprint_dispute_mail_receipt")
    || (progress.json?.checklist || []).find((w) => w.key === "blueprint_dispute_mail_receipt");
  out.checks.progress = { status: progress.status, ok: progress.json?.ok, mailStep: progWp || null };

  if (afterUpload && afterUpload.state !== "complete") {
    const evalOut = await evaluateWaypoints(db, { orgId, clientId: CLIENT_ID });
    const afterEval = (await db.query(
      `SELECT key, state FROM client_waypoints
        WHERE org_id = $1 AND client_id = $2 AND key = 'blueprint_dispute_mail_receipt'`,
      [orgId, CLIENT_ID]
    )).rows[0] || null;
    out.checks.evaluateWaypointsDirect = {
      completed: evalOut.completed,
      mailAfter: afterEval
    };
  }

  console.log(JSON.stringify(out, null, 2));
  await close();
}

main().catch(async (e) => {
  console.error(e);
  try { await close(); } catch { /* noop */ }
  process.exit(1);
});
