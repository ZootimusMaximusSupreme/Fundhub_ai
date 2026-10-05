// Job heartbeats — the parts that need no database (MB2, 2026-10-05).
// The database half is heartbeats.pg.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  JOBS,
  INNGEST_JOBS,
  NETLIFY_JOBS,
  SCHEDULED_EVENT,
  cronIntervalMs,
  lastMonthlyFire,
  heartbeatHooks,
  itemCountOf,
  recordHeartbeat,
  checkJobHeartbeats
} from "./heartbeats.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

test("every registered Inngest cron is watched, on the schedule it is registered on", async () => {
  const { functions } = await import("../workflows/index.mjs");
  const live = functions
    .map((f) => [f.opts?.id, (f.opts?.triggers || []).find((t) => t.cron)?.cron])
    .filter(([, cron]) => cron)
    .sort();
  assert.deepEqual([...INNGEST_JOBS].map((r) => [...r]).sort(), live,
    "INNGEST_JOBS in src/pulse/heartbeats.mjs must match the cron functions in src/workflows/index.mjs");
});

test("every Netlify scheduled function is watched, on the schedule netlify.toml gives it", () => {
  const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  const live = [];
  const re = /\[functions\."([^"]+)"\]\s*\n\s*schedule\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(toml))) live.push([m[1], m[2]]);
  assert.deepEqual([...NETLIFY_JOBS].map((r) => [...r]).sort(), live.sort());
  for (const [name] of NETLIFY_JOBS) {
    const src = fs.readFileSync(path.join(ROOT, "netlify/functions", `${name}.mjs`), "utf8");
    assert.match(src, new RegExp(`recordHeartbeat\\(db, \\{[\\s\\S]*?job: "${name}"`),
      `netlify/functions/${name}.mjs must write its own heartbeat`);
  }
});

test("job names are unique across both runners", () => {
  const names = JOBS.map((j) => j.job);
  assert.equal(new Set(names).size, names.length);
});

test("cron intervals for every shape this repo uses", () => {
  assert.equal(cronIntervalMs("* * * * *"), 60_000);
  assert.equal(cronIntervalMs("*/5 * * * *"), 5 * 60_000);
  assert.equal(cronIntervalMs("17 * * * *"), 3_600_000);
  assert.equal(cronIntervalMs("30 7 * * *"), 86_400_000);
  assert.equal(cronIntervalMs("0 2 * * 1"), 7 * 86_400_000);
  assert.equal(cronIntervalMs("0 3 1 * *"), null, "monthly uses lastMonthlyFire, not 3x a month");
  for (const j of JOBS) {
    assert.ok(cronIntervalMs(j.cron) != null || lastMonthlyFire(j.cron) != null,
      `${j.job}: schedule ${j.cron} must be readable`);
  }
});

test("monthly: the most recent fire time at or before now", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  assert.equal(lastMonthlyFire("0 3 1 * *", now).toISOString(), "2026-10-01T03:00:00.000Z");
  assert.equal(lastMonthlyFire("0 3 1 * *", new Date("2026-10-01T02:00:00Z")).toISOString(),
    "2026-09-01T03:00:00.000Z");
});

test("the Inngest add-on writes a heartbeat for a scheduled run only", async () => {
  const writes = [];
  const fakeDb = { query: async (sql, params) => { writes.push({ sql, params }); return { rows: [] }; } };
  const hooks = heartbeatHooks({ getDb: () => fakeDb });

  const eventRun = hooks.onFunctionRun({ fn: { opts: { id: "s-04-call-booked" } }, ctx: { event: { name: "booking.created" } } });
  assert.deepEqual(eventRun, {}, "event-driven runs have no schedule to be late against");

  const cronRun = hooks.onFunctionRun({ fn: { opts: { id: "message-dispatch-sweeper" } }, ctx: { event: { name: SCHEDULED_EVENT } } });
  await cronRun.finished({ result: { data: { claimed: 7 } } });
  await cronRun.finished({ result: { error: new Error("boom") } });
  assert.equal(writes.length, 2);
  assert.match(writes[0].sql, /INSERT INTO job_heartbeats/);
  assert.equal(writes[0].params[0], "message-dispatch-sweeper");
  assert.equal(writes[0].params[1], "inngest");
  assert.equal(writes[0].params[4], "ok");
  assert.equal(writes[0].params[5], 7);
  assert.equal(writes[1].params[4], "error");
  assert.equal(writes[1].params[6], "boom");
});

test("a heartbeat that cannot be written never throws", async () => {
  const out = await recordHeartbeat({ query: async () => { throw new Error("DATABASE_URL not set"); } },
    { job: "x", runner: "netlify" });
  assert.equal(out.recorded, false);
  assert.equal((await recordHeartbeat(null, { job: "x" })).recorded, false);
});

test("a count is taken only when the job said one — never defaulted to 0", () => {
  assert.equal(itemCountOf({ claimed: 3 }), 3);
  assert.equal(itemCountOf({ ok: true }), null);
  assert.equal(itemCountOf(null), null);
});

test("no database means not checked, never green", async () => {
  const rows = await checkJobHeartbeats({ db: null });
  assert.equal(rows.length, JOBS.length);
  assert.ok(rows.every((r) => r.status === "skip" && r.group === "jobs"));
});
