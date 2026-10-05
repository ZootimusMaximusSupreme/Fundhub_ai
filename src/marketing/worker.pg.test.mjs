// The marketing job queue, worker loop, buzzes, clock and usage rows against real
// Postgres (spec M0 step 4). Lives under src/ because npm test's glob is
// src/** and scripts/** only. Skips with DATABASE_URL unset; a skipped
// .pg.test.mjs is not green (CLAUDE.md §12). Writes only in a throwaway org and
// uses a fake GitHub, never the real one.

import { test, before, beforeEach, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, pool, close } from "../db.mjs";
import { makeMarketingOrg, wipeMarketingOrg } from "./pg-fixture.mjs";
import { queueJob, claimJobs, reclaimStale } from "./jobs.mjs";
import { runWorker } from "./worker.mjs";
import { queueBuzz, sendDueBuzzes } from "./notify.mjs";
import { clockTick, BATCH_JOB_KIND } from "./clock.mjs";
import { recordMarketingUsage } from "./model-usage.mjs";
import { marketingHealth } from "./health.mjs";
import { enqueueRepoWrite } from "./repo-writes.mjs";
import { makeFakeGithub, FAKE_ENV } from "../repo/fake-github.mjs";

const HAS_DB = !!process.env.DATABASE_URL;
const noDrain = async () => ({ status: "empty", committed: 0 });
const noBuzz = async () => ({ sent: 0 });
const tick = () => new Promise((r) => setTimeout(r, 2));
const base = { sleep: tick, drainOutbox: noDrain, sendDueBuzzes: noBuzz };

describe("marketing worker, clock, buzzes", { skip: !HAS_DB ? "no DATABASE_URL" : false }, () => {
  let org;
  const jobs = async (where = "true") =>
    (await db.query(`SELECT * FROM marketing_jobs WHERE org_id = $1 AND ${where} ORDER BY created_at`, [org.orgId])).rows;

  before(async () => { org = await makeMarketingOrg("mm-worker-pg-test"); });
  beforeEach(async () => {
    for (const t of ["marketing_model_usage", "marketing_jobs", "marketing_buzzes", "marketing_settings"]) {
      await db.query(`DELETE FROM ${t} WHERE org_id = $1`, [org.orgId]);
    }
    await db.query(`DELETE FROM repo_outbox WHERE org_id = $1`, [org.orgId]);
  });
  after(async () => { if (org) await wipeMarketingOrg(org.orgId); await close(); });

  test("queueJob with a slot queues once", async () => {
    const a = await queueJob(db, { orgId: org.orgId, kind: "pgt_kind", slot: "2026-10-05 07:00" });
    const b = await queueJob(db, { orgId: org.orgId, kind: "pgt_kind", slot: "2026-10-05 07:00" });
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
    assert.equal(b.id, a.id);
    assert.equal((await jobs()).length, 1);
  });

  test("two workers claiming at once take different jobs (SKIP LOCKED)", async () => {
    for (let i = 0; i < 6; i++) await queueJob(db, { orgId: org.orgId, kind: "pgt_kind", payload: { i } });
    const [a, b] = await Promise.all([claimJobs(db, 3), claimJobs(db, 3)]);
    const ids = [...a, ...b].map((j) => j.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, 6);
    assert.ok([...a, ...b].every((j) => j.attempts === 1));
  });

  test("a job that has not reached run_after is not claimed", async () => {
    await queueJob(db, { orgId: org.orgId, kind: "pgt_kind", runAfter: new Date(Date.now() + 3600_000) });
    assert.equal((await claimJobs(db, 5)).filter((j) => j.org_id === org.orgId).length, 0);
  });

  test("the worker runs a job with its handler and stores the result", async () => {
    await queueJob(db, { orgId: org.orgId, kind: "pgt_kind", payload: { n: 2 } });
    const out = await runWorker({ ...base, db, pool: pool(), handlers: { pgt_kind: async (job) => ({ doubled: job.payload.n * 2 }) } });
    assert.equal(out.ran, 1);
    const [j] = await jobs();
    assert.equal(j.status, "done");
    assert.deepEqual(j.result, { doubled: 4 });
    assert.ok(j.finished_at);
  });

  test("never more than 3 jobs run at once", async () => {
    for (let i = 0; i < 7; i++) await queueJob(db, { orgId: org.orgId, kind: "pgt_kind" });
    let live = 0, peak = 0;
    const handler = async () => {
      live++; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 15));
      live--;
    };
    const out = await runWorker({ ...base, db, pool: pool(), handlers: { pgt_kind: handler } });
    assert.equal(out.ran, 7);
    assert.equal(peak, 3);
  });

  test("a failing job is retried, and fails with its reason on the 3rd attempt", async () => {
    await queueJob(db, { orgId: org.orgId, kind: "pgt_kind" });
    const handlers = { pgt_kind: async () => { throw new Error("the model said no"); } };
    for (let attempt = 1; attempt <= 3; attempt++) {
      await db.query(`UPDATE marketing_jobs SET run_after = now() WHERE org_id = $1 AND status = 'queued'`, [org.orgId]);
      await runWorker({ ...base, db, pool: pool(), handlers });
      const [j] = await jobs();
      assert.equal(j.attempts, attempt);
      assert.equal(j.status, attempt < 3 ? "queued" : "failed");
    }
    const [j] = await jobs();
    assert.match(j.error, /gave up after 3 attempts: the model said no/);
    assert.ok(j.finished_at);
  });

  test("a job kind with no handler fails at once with that reason", async () => {
    await queueJob(db, { orgId: org.orgId, kind: "pgt_unknown" });
    const out = await runWorker({ ...base, db, pool: pool(), handlers: {} });
    assert.equal(out.failed, 1);
    const [j] = await jobs();
    assert.equal(j.status, "failed");
    assert.match(j.error, /no handler for job kind "pgt_unknown"/);
  });

  test("claims older than 16 minutes are taken back; at 3 attempts the job fails", async () => {
    const mk = async (attempts, minutesAgo) => (await db.query(
      `INSERT INTO marketing_jobs (org_id, kind, status, attempts, claimed_at)
       VALUES ($1, 'pgt_kind', 'running', $2, now() - ($3::int * interval '1 minute')) RETURNING id`,
      [org.orgId, attempts, minutesAgo]
    )).rows[0].id;
    const stale1 = await mk(1, 17);
    const stale3 = await mk(3, 17);
    const fresh = await mk(1, 5);
    await reclaimStale(db);
    const by = Object.fromEntries((await jobs()).map((j) => [j.id, j]));
    assert.equal(by[stale1].status, "queued");
    assert.equal(by[stale3].status, "failed");
    assert.match(by[stale3].error, /gave up after 3 attempts/);
    assert.equal(by[fresh].status, "running");
  });

  test("past the stop-new-work mark the worker claims nothing and reports more work", async () => {
    await queueJob(db, { orgId: org.orgId, kind: "pgt_kind" });
    const out = await runWorker({ ...base, db, pool: pool(), stopNewWorkMs: 0, handlers: { pgt_kind: async () => ({}) } });
    assert.equal(out.ran, 0);
    assert.equal(out.moreWork, true);
    assert.equal((await jobs())[0].status, "queued");
  });

  test("a stale claim left by a dead worker is picked up and finished in the next run", async () => {
    await db.query(
      `INSERT INTO marketing_jobs (org_id, kind, status, attempts, claimed_at)
       VALUES ($1, 'pgt_kind', 'running', 1, now() - interval '20 minutes')`, [org.orgId]
    );
    const out = await runWorker({ ...base, db, pool: pool(), handlers: { pgt_kind: async () => ({ ok: true }) } });
    assert.equal(out.reclaimed, 1);
    assert.equal(out.ran, 1);
    assert.equal((await jobs())[0].attempts, 2);
  });

  // ── buzzes ────────────────────────────────────────────────────────────────

  const sends = () => {
    const sent = [];
    return { sent, send: async (m) => { sent.push(m); return { ok: true, status: "sent" }; } };
  };
  const buzzes = async () => (await db.query(`SELECT * FROM marketing_buzzes WHERE org_id = $1 ORDER BY created_at`, [org.orgId])).rows;

  test("a buzz queued in quiet hours waits until they end; one queued at noon is due now", async () => {
    const at10pm = new Date("2026-10-06T05:00:00Z"); // Monday 22:00 Arizona
    const q = await queueBuzz(db, { orgId: org.orgId, kind: "scripts_ready", body: "21 scripts", now: at10pm });
    assert.equal(q.deferred, true);
    assert.equal(q.send_after.toISOString(), "2026-10-06T14:00:00.000Z");
    const noon = await queueBuzz(db, { orgId: org.orgId, kind: "videos_ready", body: "2 videos", now: new Date("2026-10-05T19:00:00Z") });
    assert.equal(noon.deferred, false);
  });

  test("sendDueBuzzes sends what is due, skips what is deferred, and marks it sent", async () => {
    await db.query(
      `INSERT INTO marketing_buzzes (org_id, kind, body, send_after) VALUES
        ($1,'scripts_ready','due now', now() - interval '1 minute'),
        ($1,'videos_ready','later', now() + interval '5 hours')`, [org.orgId]);
    const s = sends();
    const out = await sendDueBuzzes(db, { send: s.send });
    assert.equal(out.sent, 1);
    assert.equal(s.sent.length, 1);
    assert.equal(s.sent[0].notification.body, "due now");
    assert.equal(s.sent[0].notification.title, "Scripts are ready");
    const rows = await buzzes();
    assert.ok(rows.find((r) => r.body === "due now").sent_at);
    assert.equal(rows.find((r) => r.body === "later").sent_at, null);
  });

  test("at most one buzz of a kind every 10 minutes", async () => {
    await db.query(
      `INSERT INTO marketing_buzzes (org_id, kind, body, send_after, sent_at)
       VALUES ($1,'stuck','earlier', now() - interval '3 minutes', now() - interval '2 minutes')`, [org.orgId]);
    await db.query(
      `INSERT INTO marketing_buzzes (org_id, kind, body, send_after) VALUES ($1,'stuck','again', now())`, [org.orgId]);
    const s = sends();
    const held = await sendDueBuzzes(db, { send: s.send });
    assert.equal(s.sent.length, 0);
    assert.equal(held.held, 1);
    await db.query(`UPDATE marketing_buzzes SET sent_at = now() - interval '11 minutes' WHERE body = 'earlier' AND org_id = $1`, [org.orgId]);
    await sendDueBuzzes(db, { send: s.send });
    assert.equal(s.sent.length, 1);
    assert.equal(s.sent[0].notification.body, "again");
  });

  test("two due buzzes of one kind go out as one send; the same group_key collapses with it", async () => {
    await db.query(
      `INSERT INTO marketing_buzzes (org_id, kind, body, group_key, send_after) VALUES
        ($1,'stuck','first','batch-1', now()), ($1,'stuck','second','batch-1', now()), ($1,'stuck','other','batch-2', now())`,
      [org.orgId]);
    const s = sends();
    await sendDueBuzzes(db, { send: s.send });
    assert.equal(s.sent.length, 1);
    const rows = await buzzes();
    assert.ok(rows.find((r) => r.body === "first").sent_at);
    assert.ok(rows.find((r) => r.body === "second").sent_at);
    assert.equal(rows.find((r) => r.body === "other").sent_at, null);
  });

  test("a send that fails leaves the row for the next pass", async () => {
    await queueBuzz(db, { orgId: org.orgId, kind: "stuck", body: "help", now: new Date("2026-10-05T19:00:00Z") });
    const out = await sendDueBuzzes(db, { send: async () => ({ ok: false, error: "no number" }) });
    assert.equal(out.failed, 1);
    assert.equal((await buzzes())[0].sent_at, null);
  });

  // ── the clock ─────────────────────────────────────────────────────────────

  test("the clock does nothing while the machine is off, and says so", async () => {
    await db.query(`INSERT INTO marketing_settings (org_id, enabled) VALUES ($1, false)`, [org.orgId]);
    const t = await clockTick(db, { now: new Date("2026-10-05T14:00:00Z") });
    assert.equal(t.disabled, true);
    assert.equal(t.queued, 0);
    assert.equal((await jobs()).length, 0);
  });

  test("with the machine on, the clock queues the weekly batch once and asks for the worker", async () => {
    await db.query(`INSERT INTO marketing_settings (org_id, enabled) VALUES ($1, true)`, [org.orgId]); // Monday 07:00 Phoenix
    const monday7 = new Date("2026-10-05T14:00:00Z");
    const first = await clockTick(db, { now: monday7 });
    assert.equal(first.disabled, false);
    assert.equal(first.queued, 1);
    assert.equal(first.wake, true);
    const again = await clockTick(db, { now: new Date(monday7.getTime() + 15 * 60000) });
    assert.equal(again.queued, 0);
    const rows = await jobs();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, BATCH_JOB_KIND);
    assert.equal(rows[0].payload.slot, "2026-10-05 07:00");
    const tuesday = await clockTick(db, { now: new Date("2026-10-06T14:00:00Z") });
    assert.equal(tuesday.queued, 0);
  });

  // ── the outbox, model usage, health ───────────────────────────────────────

  test("a card save queues an outbox row and the worker's drain commits it to the (fake) repo", async () => {
    const gh = makeFakeGithub();
    let woke = 0;
    const client = await pool().connect();
    let row;
    try {
      await client.query("BEGIN");
      row = await enqueueRepoWrite(client, {
        orgId: org.orgId, path: "marketing/offers/pgt_wired.md", content: "# wired\n"
      }, { wake: async () => { woke++; } });
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    assert.equal(woke, 1);
    await runWorker({
      db, pool: pool(), env: FAKE_ENV, fetchImpl: gh.fetchImpl, sleep: tick, sendDueBuzzes: noBuzz, handlers: {}
    });
    const r = (await db.query(`SELECT committed_at, committed_sha FROM repo_outbox WHERE id = $1`, [row.id])).rows[0];
    assert.ok(r.committed_at, "the worker drained the row");
    assert.ok(r.committed_sha);
  });

  test("model usage goes in marketing_model_usage with a cost", async () => {
    const r = await recordMarketingUsage(db, {
      orgId: org.orgId, model: "claude-sonnet-5-5",
      usage: { input_tokens: 1000, output_tokens: 500, cache_read_tokens: 2000, cache_creation_tokens: 100 }
    });
    assert.equal(r.priced, true);
    const row = (await db.query(`SELECT * FROM marketing_model_usage WHERE id = $1`, [r.id])).rows[0];
    assert.equal(row.model, "claude-sonnet-5-5");
    assert.equal(row.cache_read_tokens, 2000);
    assert.ok(Number(row.cost_usd) > 0);
    const unpriced = await recordMarketingUsage(db, { orgId: org.orgId, model: "mystery-model", usage: { input_tokens: 5 } });
    assert.equal(unpriced.priced, false);
  });

  test("marketingHealth reads the outbox, the queue and the buzzes", async () => {
    await queueJob(db, { orgId: org.orgId, kind: "pgt_kind" });
    const h = await marketingHealth(db);
    assert.ok(h.outbox && "waiting" in h.outbox && "blocked" in h.outbox && "last_error" in h.outbox);
    assert.ok(h.jobs.queued >= 1);
    assert.ok("waiting" in h.buzzes);
  });
});
