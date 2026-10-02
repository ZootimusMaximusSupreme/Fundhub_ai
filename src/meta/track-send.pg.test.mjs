// The Meta hook's two queries (src/meta/track-send.mjs, src/meta/user-data.mjs)
// against a real Postgres.
//
// What only a database can prove: the session contact lookup finds the
// slo.contact_started row by payload session_id (newest first, last two days),
// and the result UPDATE merges payload.meta without touching the rest of the
// row.
//
// Skipped without DATABASE_URL, like every other *.pg.test.mjs, and refuses a
// hosted Supabase address: LOCAL scratch database only. It inserts events rows
// keyed to this run and removes them after. Nothing here calls Meta.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { SESSION_CONTACT_SQL, sessionContact } from "./user-data.mjs";
import { RECORD_META_SQL } from "./track-send.mjs";

const URL_SET = process.env.DATABASE_URL || "";
const HOSTED = /supabase\.(co|com)\b|oqpnlusrotpxfenysfxz/i.test(URL_SET);
const SKIP = !URL_SET ? "no DATABASE_URL"
  : HOSTED ? "DATABASE_URL is a hosted Supabase database; scratch Postgres only"
  : false;

const RUN = `pgmeta${Date.now().toString(36)}`;
const SID = `${RUN}-sess`;

describe("Meta hook queries — real events table", { skip: SKIP }, () => {
  let org;

  async function insert(name, key, payload, age = "0 seconds") {
    const r = await db.query(
      `INSERT INTO events (org_id, name, idempotency_key, payload, created_at)
       VALUES ($1, $2, $3, $4, now() - $5::interval) RETURNING id`,
      [org, name, key, payload, age]
    );
    return r.rows[0].id;
  }

  before(async () => {
    org = await resolveDefaultOrg(db);
  });

  after(async () => {
    await db.query(`DELETE FROM events WHERE org_id = $1 AND idempotency_key LIKE $2`, [org, `${RUN}:%`]);
    await close();
  });

  test("the session's contact row: newest first, older than two days ignored", async () => {
    await insert("slo.contact_started", `${RUN}:c-old`, { session_id: SID, email: "old@gmail.com", actor: "person" }, "3 days");
    await insert("slo.contact_started", `${RUN}:c1`, { session_id: SID, email: "first@gmail.com", phone: null, actor: "person" }, "10 minutes");
    await insert("slo.contact_started", `${RUN}:c2`, { session_id: SID, email: "pat@gmail.com", phone: "+14155550134", actor: "person" }, "1 minute");
    await insert("slo.contact_started", `${RUN}:c3`, { session_id: `${SID}x`, email: "other@gmail.com", actor: "agent" });
    assert.deepEqual(await sessionContact(db, org, SID), { email: "pat@gmail.com", phone: "+14155550134", actor: "person" });
    assert.equal((await db.query(SESSION_CONTACT_SQL, [org, `${RUN}-none`])).rows.length, 0);
  });

  test("the result lands as payload.meta; the rest of the row is kept", async () => {
    const id = await insert("funnel.continue", `${RUN}:r1`, { session_id: SID, event: "continue", cf_contact: { ok: true } });
    await db.query(RECORD_META_SQL, [{ meta: { sent: 1, event_name: "Lead", event_id: `${SID}.1` } }, id]);
    const p = (await db.query(`SELECT payload FROM events WHERE id = $1`, [id])).rows[0].payload;
    assert.deepEqual(p.meta, { sent: 1, event_name: "Lead", event_id: `${SID}.1` });
    assert.equal(p.event, "continue");
    assert.deepEqual(p.cf_contact, { ok: true });
  });
});
