// Pure logic of the marketing clock, time zones, buzzes and prices. No database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { batchSlot, BATCH_WINDOW_HOURS } from "./clock.mjs";
import { localParts, nextSendTime, inQuietHours, minutesOfDay, zonedInstant } from "./time.mjs";
import { costUsd, MODEL_PRICES } from "./model-usage.mjs";
import { wakeWorker, WORKER_PATH } from "./wake.mjs";
import { runWorker } from "./worker.mjs";
import { handler as clockHandler, SWEEP_CRON } from "../../netlify/functions/marketing-clock.mjs";
import { handler as workerHandler } from "../../netlify/functions/marketing-worker-background.mjs";
import fs from "node:fs";

const PHX = "America/Phoenix";
// Monday 2026-10-05 07:00 Arizona = 14:00 UTC (UTC-7 all year).
const MON_7AM = new Date("2026-10-05T14:00:00Z");

test("Arizona local time: Monday 07:00 is 14:00 UTC", () => {
  const lp = localParts(MON_7AM, PHX);
  assert.equal(lp.weekday, 1);
  assert.equal(lp.hour, 7);
  assert.equal(lp.date, "2026-10-05");
  assert.equal(zonedInstant({ year: 2026, month: 10, day: 5 }, "07:00", PHX).toISOString(), MON_7AM.toISOString());
});

test("batchSlot: due Monday 07:00 Arizona, not before, not on Tuesday, not after the window", () => {
  const s = { batch_weekday: 1, batch_time: "07:00", timezone: PHX };
  assert.equal(batchSlot(s, MON_7AM), "2026-10-05 07:00");
  assert.equal(batchSlot(s, new Date("2026-10-05T13:45:00Z")), null);
  assert.equal(batchSlot(s, new Date(MON_7AM.getTime() + (BATCH_WINDOW_HOURS * 60 - 1) * 60000)), "2026-10-05 07:00");
  assert.equal(batchSlot(s, new Date(MON_7AM.getTime() + BATCH_WINDOW_HOURS * 60 * 60000)), null);
  assert.equal(batchSlot(s, new Date("2026-10-06T14:00:00Z")), null);
});

test("batchSlot: the slot is the same for every tick in the window (so a job queues once)", () => {
  const s = { batch_weekday: 1, batch_time: "07:00", timezone: PHX };
  const slots = [0, 15, 30, 45, 60].map((m) => batchSlot(s, new Date(MON_7AM.getTime() + m * 60000)));
  assert.equal(new Set(slots).size, 1);
});

test("quiet hours wrap midnight; start == end is never quiet", () => {
  const start = minutesOfDay("21:00"), end = minutesOfDay("07:00");
  assert.equal(inQuietHours(22 * 60, start, end), true);
  assert.equal(inQuietHours(3 * 60, start, end), true);
  assert.equal(inQuietHours(7 * 60, start, end), false);
  assert.equal(inQuietHours(12 * 60, start, end), false);
  assert.equal(inQuietHours(5, 600, 600), false);
});

test("a buzz at 10 pm waits until 7 am Arizona; at 3 am it waits until 7 am the same day; at noon it goes now", () => {
  const q = { quiet_start: "21:00", quiet_end: "07:00", timezone: PHX };
  const at10pm = new Date("2026-10-06T05:00:00Z"); // Mon 22:00 Arizona
  assert.equal(nextSendTime(at10pm, q).toISOString(), "2026-10-06T14:00:00.000Z"); // Tue 07:00
  const at3am = new Date("2026-10-06T10:00:00Z"); // Tue 03:00 Arizona
  assert.equal(nextSendTime(at3am, q).toISOString(), "2026-10-06T14:00:00.000Z");
  const noon = new Date("2026-10-05T19:00:00Z");
  assert.equal(nextSendTime(noon, q).getTime(), noon.getTime());
});

test("costUsd: Sonnet 5.5 at $2 / $10 per million, cache reads at $0.20; unknown model is null", () => {
  assert.ok(MODEL_PRICES["claude-sonnet-5-5"]);
  const c = costUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_tokens: 1_000_000 });
  assert.ok(Math.abs(c - 12.2) < 1e-9);
  assert.equal(costUsd("gpt-4o-mini", { input_tokens: 5 }), null);
});

test("wakeWorker reports a missing URL or secret instead of throwing, and posts the secret header", async () => {
  assert.equal((await wakeWorker({ env: {} })).started, false);
  assert.match((await wakeWorker({ env: { URL: "https://x.test" } })).error, /MARKETING_WORKER_SECRET/);
  let seen;
  const r = await wakeWorker({
    env: { URL: "https://x.test", MARKETING_WORKER_SECRET: "s3" },
    fetchImpl: async (url, init) => { seen = { url, init }; return { status: 202, ok: true }; }
  });
  assert.equal(r.started, true);
  assert.equal(seen.url, `https://x.test${WORKER_PATH}`);
  assert.equal(seen.init.headers["x-fundhub-worker"], "s3");
  assert.equal((await wakeWorker({ env: { URL: "https://x.test", MARKETING_WORKER_SECRET: "s" }, fetchImpl: async () => { throw new Error("down"); } })).started, false);
});

test("the worker refuses a wrong or missing secret with 404, and is closed when no secret is set", async () => {
  const had = process.env.MARKETING_WORKER_SECRET;
  try {
    process.env.MARKETING_WORKER_SECRET = "right";
    assert.equal((await workerHandler(new Request("https://x.test", { method: "POST" }))).status, 404);
    assert.equal((await workerHandler(new Request("https://x.test", { method: "POST", headers: { "x-fundhub-worker": "wrong" } }))).status, 404);
    delete process.env.MARKETING_WORKER_SECRET;
    assert.equal((await workerHandler(new Request("https://x.test", { method: "POST", headers: { "x-fundhub-worker": "" } }))).status, 404);
  } finally {
    if (had === undefined) delete process.env.MARKETING_WORKER_SECRET; else process.env.MARKETING_WORKER_SECRET = had;
  }
});

test("the clock returns a 200 Response even when the database is unreachable", async () => {
  const had = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const res = await clockHandler();
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, false);
  } finally {
    if (had !== undefined) process.env.DATABASE_URL = had;
  }
});

test("SWEEP_CRON matches netlify.toml", () => {
  const toml = fs.readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
  const m = /\[functions\."marketing-clock"\]\s*\n\s*schedule\s*=\s*"([^"]+)"/.exec(toml);
  assert.ok(m, "marketing-clock is scheduled in netlify.toml");
  assert.equal(m[1], SWEEP_CRON);
  assert.equal(SWEEP_CRON, "*/15 * * * *");
});

// A fake database for the worker loop: jobs live in an array, the SQL strings are
// matched by what they do. This proves the loop's control flow; the SQL itself is
// proved against Postgres in src/marketing/worker.pg.test.mjs.
test("runWorker with nothing queued drains the outbox once, sends buzzes, and stops", async () => {
  const calls = [];
  const db = { query: async (sql) => { calls.push(sql); return { rows: sql.includes("count(*)") ? [{ n: 0 }] : [] }; } };
  const out = await runWorker({
    db, pool: {}, handlers: {},
    drainOutbox: async () => { calls.push("DRAIN"); return { status: "empty", committed: 0 }; },
    sendDueBuzzes: async () => { calls.push("BUZZ"); return { sent: 0 }; },
    sleep: async () => {}
  });
  assert.equal(calls.filter((c) => c === "DRAIN").length, 1);
  assert.equal(out.moreWork, false);
  assert.equal(out.ran, 0);
});

test("runWorker survives an outbox drain that throws", async () => {
  const db = { query: async (sql) => ({ rows: sql.includes("count(*)") ? [{ n: 0 }] : [] }) };
  const out = await runWorker({
    db, pool: {}, handlers: {},
    drainOutbox: async () => { throw new Error("github down"); },
    sendDueBuzzes: async () => ({ sent: 0 }), sleep: async () => {}
  });
  assert.equal(out.drains, 0);
});
