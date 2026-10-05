/* Job heartbeats against a real Postgres (MB2, 2026-10-05).
 *
 * What is pinned:
 *   1. recordHeartbeat writes a row the table accepts (430's constraints).
 *   2. A job is green when it ran inside 3x its schedule, red when it did not,
 *      red when its last pass errored, and not checked when heartbeats have
 *      not been recording long enough to expect a run.
 *   3. The application cannot rewrite or delete a heartbeat (430's REVOKE).
 *
 * SKIPS WITHOUT A DATABASE, LOUDLY. A skipped run proves nothing:
 *   DATABASE_URL=postgres://… node --test src/pulse/heartbeats.pg.test.mjs
 *
 * Rows carry a per-run job-name prefix; the table refuses DELETE to the app
 * role on purpose, so in a scratch database they are left behind (harmless:
 * no real job has these names).
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { recordHeartbeat, checkJobHeartbeats } from "./heartbeats.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const NONCE = `hb-${process.pid}-${Date.now()}`;
const MIN = 60 * 1000;

describe("job heartbeats", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  after(async () => { await close(); });

  test("a heartbeat is written and read back", async () => {
    const now = new Date();
    const out = await recordHeartbeat(db, {
      job: `${NONCE}-write`, runner: "netlify", startedAt: new Date(now.getTime() - 1000),
      finishedAt: now, outcome: "ok", itemCount: 4
    });
    assert.equal(out.recorded, true);
    const { rows } = await db.query(
      `SELECT runner, outcome, item_count FROM job_heartbeats WHERE job = $1`, [`${NONCE}-write`]);
    assert.deepEqual(rows, [{ runner: "netlify", outcome: "ok", item_count: 4 }]);
  });

  test("the table refuses a made-up runner or outcome", async () => {
    await assert.rejects(db.query(
      `INSERT INTO job_heartbeats (job, runner, outcome) VALUES ($1, 'cron', 'ok')`, [`${NONCE}-bad`]));
    await assert.rejects(db.query(
      `INSERT INTO job_heartbeats (job, runner, outcome) VALUES ($1, 'inngest', 'maybe')`, [`${NONCE}-bad`]));
  });

  test("green inside 3x the schedule, red outside it, red on an errored last pass", async () => {
    const now = new Date();
    const at = (msAgo) => new Date(now.getTime() - msAgo);
    // Anchor "heartbeats have been recording for a while" for this run's jobs.
    await recordHeartbeat(db, { job: `${NONCE}-anchor`, runner: "inngest", finishedAt: at(10 * 24 * 60 * MIN) });
    await recordHeartbeat(db, { job: `${NONCE}-fresh`, runner: "inngest", finishedAt: at(4 * MIN) });
    await recordHeartbeat(db, { job: `${NONCE}-late`, runner: "inngest", finishedAt: at(16 * MIN) });
    await recordHeartbeat(db, { job: `${NONCE}-broke`, runner: "inngest", finishedAt: at(2 * MIN), outcome: "error", error: "provider 500" });

    const jobs = [
      { job: `${NONCE}-fresh`, cron: "*/5 * * * *", runner: "inngest" },
      { job: `${NONCE}-late`, cron: "*/5 * * * *", runner: "inngest" },
      { job: `${NONCE}-broke`, cron: "*/5 * * * *", runner: "inngest" },
      { job: `${NONCE}-never`, cron: "*/5 * * * *", runner: "netlify" }
    ];
    const rows = await checkJobHeartbeats({ db, now, jobs });
    const by = Object.fromEntries(rows.map((r) => [r.id.replace(`job:${NONCE}-`, ""), r]));
    assert.equal(by.fresh.status, "PASS", by.fresh.detail);
    assert.equal(by.late.status, "FAIL", by.late.detail);
    assert.ok(by.late.customerSees);
    assert.equal(by.broke.status, "FAIL");
    assert.match(by.broke.detail, /provider 500/);
    assert.equal(by.never.status, "FAIL", "heartbeats have run for days, so a job with none is red");
  });

  test("the application cannot rewrite or delete a heartbeat", async () => {
    const { rows } = await db.query(
      `SELECT has_table_privilege('fundhub_app', 'job_heartbeats', 'UPDATE') AS upd,
              has_table_privilege('fundhub_app', 'job_heartbeats', 'DELETE') AS del,
              has_table_privilege('fundhub_app', 'job_heartbeats', 'INSERT') AS ins`);
    assert.deepEqual(rows[0], { upd: false, del: false, ins: true });
  });
});
