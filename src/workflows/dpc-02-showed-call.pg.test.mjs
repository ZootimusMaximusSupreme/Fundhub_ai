/* Postgres-backed test for the "showed" rule (K3, owner-set 2026-10-05):
 * src/sales/call-outcomes.mjs closerLoggedShowed, DPC-02 and its Late Show, and
 * the Meta ShowedCall handler, against the real schema.
 *
 * Every fixture row and every read happen inside ONE transaction that is rolled
 * back at the end, stamped as staff the way src/partners/rls.mjs does, so it runs
 * as the unprivileged fundhub_app role and leaves nothing behind. The Meta sender
 * is a stand-in: nothing here reaches Meta.
 *
 * Skipped without DATABASE_URL, like every *.pg.test.mjs — and a skip is not
 * green. Never point this at the live database. */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { pool, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { closerLoggedShowed, logCallOutcome } from "../sales/call-outcomes.mjs";
import { handle, handleLateShow } from "./dpc-02-call-outcome-enforcement.mjs";
import { onCallCompletedForMeta } from "../handlers/meta-showed-call.mjs";
import { emit } from "../events/bus.mjs";
import { fakeStep } from "./test-support.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const TAG = "k3_showed_pg";
const HOUR = 60 * 60 * 1000;

async function inTx(fn) {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('fundhub.actor', 'staff', true)");
    await client.query("SELECT set_config('fundhub.partner_id', '', true)");
    const tx = { query: (sql, params) => client.query(sql, params) };
    return await fn(tx);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

async function fixtures(tx) {
  const one = async (sql, params) => (await tx.query(sql, params)).rows[0].id;
  const org = await resolveDefaultOrg(tx);
  const closer = await one(
    `INSERT INTO staff (org_id, name, role, email, status) VALUES ($1,'K3 Closer','closer',$2,'active') RETURNING id`,
    [org, `${TAG}.closer@fh-scratch.dev`]);
  const person = (tag) => one(
    `INSERT INTO clients (org_id, email, phone, first_name, last_name) VALUES ($1,$2,'+16025550142','K3',$3) RETURNING id`,
    [org, `${TAG}.${tag}@fh-scratch.dev`, tag]);
  const log = (clientId, outcome, at, isDemo = false) => tx.query(
    `INSERT INTO call_outcomes (org_id, client_id, staff_id, outcome, logged_at, is_demo) VALUES ($1,$2,$3,$4,$5,$6)`,
    [org, clientId, closer, outcome, at, isDemo]);
  const fields = async (clientId) =>
    (await tx.query(`SELECT custom_fields, tags FROM clients WHERE id = $1`, [clientId])).rows[0];
  const stage = async (clientId) => (await tx.query(
    `SELECT ps.key FROM cards c JOIN pipeline_stages ps ON ps.id = c.stage_id JOIN pipelines p ON p.id = c.pipeline_id
      WHERE c.client_id = $1 AND p.key = 'sales'`, [clientId])).rows[0]?.key ?? null;
  return { org, closer, person, log, fields, stage };
}

/* resolveClient's CRM backfill (src/handlers/client-lifecycle.mjs) still reads
   clients.ghl_contact_id, which migration 372 renamed to legacy_contact_id, so on a
   database built from today's migrations it throws before any K3 code runs. That is
   outside K3 (reported as a leftover). The step that calls it is answered with the
   event's own client id; every step after it runs for real. */
const stepFor = (event) => ({
  ...fakeStep(),
  run: (id, fn) => (id === "resolve-client" ? event.clientId : fn())
});

const booking = (org, clientId, { start, end, uid }) => ({
  id: `evt-${uid}`, orgId: org, clientId, name: "booking.created",
  payload: { startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), bookingUid: uid, email: `${uid}@fh-scratch.dev` }
});

describe("the showed rule, against the real schema", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  after(async () => { await close(); });

  test("closerLoggedShowed: held outcomes from the booked start; never No show, demo or an older call", async () => {
    await inTx(async (tx) => {
      const f = await fixtures(tx);
      const t0 = Date.now() - 2 * HOUR;
      const held = await f.person("held");
      const noShow = await f.person("noshow");
      const demo = await f.person("demo");
      const fit = await f.person("notafit");
      const cb = await f.person("callback");
      await f.log(held, "deposit", new Date(t0).toISOString());
      await f.log(noShow, "no_show", new Date(t0).toISOString());
      await f.log(demo, "deposit", new Date(t0).toISOString(), true);
      await f.log(fit, "not_a_fit", new Date(t0).toISOString());
      await f.log(cb, "callback", new Date(t0).toISOString());

      assert.equal(await closerLoggedShowed(tx, { clientId: held, since: new Date(t0 - HOUR).toISOString() }), true);
      assert.equal(await closerLoggedShowed(tx, { clientId: held, since: new Date(t0).toISOString() }), true, "at the start counts");
      assert.equal(await closerLoggedShowed(tx, { clientId: held, since: new Date(t0 + HOUR).toISOString() }), false, "an older call does not count");
      assert.equal(await closerLoggedShowed(tx, { clientId: held }), true);
      assert.equal(await closerLoggedShowed(tx, { clientId: noShow }), false);
      assert.equal(await closerLoggedShowed(tx, { clientId: demo }), false);
      assert.equal(await closerLoggedShowed(tx, { clientId: fit }), true);
      assert.equal(await closerLoggedShowed(tx, { clientId: cb }), true);
    });
  });

  test("DPC-02 end to end: a closer log is showed; a Bland call alone is a no-show; a late log undoes it; ShowedCall is written", async () => {
    await inTx(async (tx) => {
      const f = await fixtures(tx);
      const start = Date.now() - 90 * 60 * 1000;
      const end = start + 30 * 60 * 1000;

      // 1. Showed: the closer logged a Deposit through the real save path.
      const a = await f.person("a");
      await logCallOutcome(tx, { orgId: f.org, clientId: a, staffId: f.closer, outcome: "deposit" });
      const ea = booking(f.org, a, { start, end, uid: `${TAG}-a` });
      const ra = await handle({ event: ea, db: tx, step: stepFor(ea) });
      assert.equal(ra.outcome, "showed");
      assert.equal((await f.fields(a)).custom_fields.call_outcome, "showed");
      assert.equal(await f.stage(a), "showed");

      // 2. No-show: only the AI setter's confirm call finished (Bland), no closer log.
      const b = await f.person("b");
      await emit(tx, "call.completed",
        { callId: `${TAG}-call`, status: "completed", disposition: "voicemail", outcome: "no_answer", source: "bland" },
        { orgId: f.org, clientId: b, idempotencyKey: `${TAG}:bland:b`, skipInngest: true });
      const eb = booking(f.org, b, { start, end, uid: `${TAG}-b` });
      const rb = await handle({ event: eb, db: tx, step: stepFor(eb) });
      assert.equal(rb.outcome, "no_show");
      assert.equal((await f.fields(b)).custom_fields.call_outcome, "no_show");
      assert.ok((await f.fields(b)).tags.includes("call:no_show"));
      assert.equal(await f.stage(b), "lost");
      const noshow = (await tx.query(
        `SELECT idempotency_key FROM events WHERE client_id = $1 AND name = 'booking.noshow'`, [b])).rows;
      assert.equal(noshow.length, 1);
      assert.equal(noshow[0].idempotency_key, `dpc-02:${TAG}-b:${new Date(end).toISOString()}:booking.noshow`);

      // 3. Late: the closer logs Not a fit after the check. Late Show undoes the no-show.
      await logCallOutcome(tx, { orgId: f.org, clientId: b, staffId: f.closer, outcome: "not_a_fit" });
      const row = (await tx.query(
        `SELECT id, org_id, client_id, payload FROM events
          WHERE client_id = $1 AND name = 'call.completed' AND payload->>'disposition' = 'closer'`, [b])).rows[0];
      const closerEvent = { id: row.id, name: "call.completed", orgId: row.org_id, clientId: row.client_id, payload: row.payload };
      const late = await handleLateShow({ event: closerEvent, db: tx, step: stepFor(closerEvent) });
      assert.equal(late.outcome, "showed");
      assert.equal((await f.fields(b)).custom_fields.call_outcome, "showed");
      assert.ok(!(await f.fields(b)).tags.includes("call:no_show"));
      assert.equal(await f.stage(b), "showed");

      // 4. ShowedCall for that log, through a stand-in sender, written on the event row.
      const sent = [];
      const res = await onCallCompletedForMeta(closerEvent, tx, {
        sendMetaEvents: async (events) => { sent.push(...events); return { ok: true, sent: events.length }; }
      });
      assert.equal(res.sent, true);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].event_name, "ShowedCall");
      assert.equal(sent[0].event_id, `showed.${row.payload.callOutcomeId}`);
      const meta = (await tx.query(`SELECT payload->'meta' AS meta FROM events WHERE id = $1`, [row.id])).rows[0].meta;
      assert.equal(meta.event_name, "ShowedCall");
      assert.equal(meta.sent, 1);
      assert.equal(meta.outcome, "not_a_fit");

      // 5. The Bland call never reaches Meta.
      const bland = (await tx.query(
        `SELECT id, org_id, client_id, payload FROM events WHERE idempotency_key = $1`, [`${TAG}:bland:b`])).rows[0];
      const skip = await onCallCompletedForMeta(
        { id: bland.id, name: "call.completed", orgId: bland.org_id, clientId: bland.client_id, payload: bland.payload },
        tx, { sendMetaEvents: async () => { throw new Error("must not send"); } });
      assert.equal(skip.skip, "not_a_trigger");
    });
  });
});
