// s-doc-reminders against a real Postgres: the upload read, the real unique
// index that keeps every reminder to once per client, and the words from
// db/seed/037 rendered through the real sendTemplated.
//
// Run it only against a scratch database (CLAUDE.md §12). It writes one org,
// its clients and their rows, and wipes them before and after.

import { test, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db, pool, close } from "../db.mjs";
import { handle, REMINDERS, documentsUploaded } from "./s-doc-reminders.mjs";
import { SMS_TEMPLATE_KEY as REQUEST_SMS } from "./s-doc-collection.mjs";
import { FUNDING_DOC_HOLD } from "../inquiry-ops/doc-gate.mjs";
import { fakeStep } from "./test-support.mjs";

const HAS_DB = !!process.env.DATABASE_URL;
const ORG_SLUG = "doc-reminders-pg-test";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEYS = REMINDERS.map((r) => r.templateKey);
const DAYTIME = () => new Date("2026-10-05T18:00:00Z"); // 11:00 in Arizona

let orgId = null;

/* The seed writes these keys for every org that existed when it ran. This org
   is made afterwards, so it gets its own copies, taken word for word from the
   seed file rather than re-running the seed (which would touch every org). */
function seedBodies() {
  const sql = fs.readFileSync(path.resolve(HERE, "../../db/seed/037_doc_reminder_texts.sql"), "utf8");
  return [...sql.matchAll(/\('(SMS-DOC-REMIND-[A-Z0-9]+)',\s*\$c\$([\s\S]*?)\$c\$\)/g)].map((m) => [m[1], m[2]]);
}

async function wipe() {
  if (!orgId) return;
  await db.query(`DELETE FROM messages WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM conversations WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM events WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM opt_outs WHERE client_id IN (SELECT id FROM clients WHERE org_id = $1)`, [orgId]);
  await db.query(`DELETE FROM clients WHERE org_id = $1`, [orgId]);
}

async function makeClient(tag, { hold = FUNDING_DOC_HOLD, asked = true } = {}) {
  const id = (await db.query(
    `INSERT INTO clients (org_id, first_name, email, phone, custom_fields)
     VALUES ($1, 'Dana', $2, '+16025550100', $3::jsonb) RETURNING id`,
    [orgId, `dana-${tag}@doc-reminders-pg-test.example.com`, JSON.stringify({ round_hold_reason: hold })]
  )).rows[0].id;
  if (asked) {
    await db.query(
      `INSERT INTO messages (org_id, client_id, direction, channel, template_key, rendered_body, provider, provider_ref, status, compliance_check_passed)
       VALUES ($1, $2, 'outbound', 'sms', $3, 'request', 'internal', $4, 'queued', true)`,
      [orgId, id, REQUEST_SMS, `workflow:${REQUEST_SMS}:pg-${tag}`]
    );
  }
  return id;
}

const deposit = (clientId, id) => ({ id, orgId, clientId, name: "deposit.paid", payload: {} });

async function reminderRows(clientId) {
  return (await db.query(
    `SELECT template_key, channel, status, provider, provider_ref, rendered_body
       FROM messages
      WHERE client_id = $1 AND template_key = ANY($2::text[])
      ORDER BY created_at, template_key`,
    [clientId, KEYS]
  )).rows;
}

before(async () => {
  if (!HAS_DB) return;
  orgId = (await db.query(
    `INSERT INTO orgs (slug, name) VALUES ($1, 'Doc Reminders Pg Test')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [ORG_SLUG]
  )).rows[0].id;
  await wipe();
  for (const [key, body] of seedBodies()) {
    await db.query(
      `INSERT INTO message_templates (org_id, template_key, channel, subject, body, compliance_passed)
       VALUES ($1, $2, 'sms', NULL, $3, true)
       ON CONFLICT (org_id, template_key) DO UPDATE SET body = EXCLUDED.body, compliance_passed = true`,
      [orgId, key, body]
    );
  }
});

after(async () => {
  if (HAS_DB) await wipe();
  await close();
});

/* Documents are append-only by trigger and cannot be deleted, and fundhub_app
   cannot switch that trigger off. So this read is proved inside a transaction
   that is rolled back: nothing it writes survives the test. */
test("the upload read: nothing, then a document, then an event — and only for this client", { skip: !HAS_DB }, async () => {
  const tx = await pool().connect();
  try {
    await tx.query("BEGIN");
    const mk = async (tag) => (await tx.query(
      `INSERT INTO clients (org_id, first_name, email) VALUES ($1, 'Dana', $2) RETURNING id`,
      [orgId, `dana-${tag}@doc-reminders-pg-test.example.com`]
    )).rows[0].id;
    const a = await mk("upload-a");
    const b = await mk("upload-b");
    assert.equal(await documentsUploaded(tx, { orgId, clientId: a }), false);

    await tx.query(
      `INSERT INTO documents (org_id, client_id, document_key, kind, title, storage_key, mime_type)
       VALUES ($1, $2, 'pg-test/id', 'client_upload', 'Photo ID', 'pg-test/id.jpg', 'image/jpeg')`,
      [orgId, a]
    );
    assert.equal(await documentsUploaded(tx, { orgId, clientId: a }), true);
    assert.equal(await documentsUploaded(tx, { orgId, clientId: b }), false, "another client's upload does not count");

    await tx.query(`INSERT INTO events (org_id, client_id, name) VALUES ($1, $2, 'docs.received')`, [orgId, b]);
    assert.equal(await documentsUploaded(tx, { orgId, clientId: b }), true);
  } finally {
    await tx.query("ROLLBACK");
    tx.release();
  }
});

test("three texts, queued only, once per client even across two deposit events", { skip: !HAS_DB }, async () => {
  const c = await makeClient("happy");
  const first = await handle({ event: deposit(c, "pg-dep-1"), db, step: fakeStep(), now: DAYTIME });
  await handle({ event: deposit(c, "pg-dep-2"), db, step: fakeStep(), now: DAYTIME });

  assert.equal(first.stopped, null);
  const rows = await reminderRows(c);
  assert.deepEqual(rows.map((r) => r.template_key), KEYS, "one of each, the unique index refused the second run");
  for (const r of rows) {
    assert.equal(r.channel, "sms");
    assert.equal(r.status, "queued", "queued for the dispatcher, never sent from here");
    assert.equal(r.provider, "internal");
    assert.equal(r.provider_ref, `workflow:${r.template_key}:doc-remind:${c}`);
    assert.ok(r.rendered_body.startsWith("Hey Dana, Fundhub. "), r.rendered_body);
    assert.ok(r.rendered_body.includes("/app/client-portal.html?email="), "the portal link rendered");
    assert.ok(!r.rendered_body.includes("{{"), "no merge tag left unrendered");
  }
});

test("an upload on file, another hold, or no request: nothing is queued", { skip: !HAS_DB }, async () => {
  const uploaded = await makeClient("uploaded");
  await db.query(`INSERT INTO events (org_id, client_id, name) VALUES ($1, $2, 'docs.received')`, [orgId, uploaded]);
  const paused = await makeClient("paused", { hold: "Funding Paused" });
  const neverAsked = await makeClient("never-asked", { asked: false });

  const results = [];
  for (const id of [uploaded, paused, neverAsked]) {
    results.push((await handle({ event: deposit(id, `pg-dep-${id}`), db, step: fakeStep(), now: DAYTIME })).stopped);
    assert.equal((await reminderRows(id)).length, 0);
  }
  assert.deepEqual(results, ["uploaded", "not_on_doc_hold", "never_asked"]);
});
