// The marketing machine's worker: the long half. A BACKGROUND function (name ends
// -background), so it gets 15 minutes where a scheduled function gets 30 seconds.
// The clock (marketing-clock.mjs) and every save that queues repo work start it.
//
// THIS IS AN OPEN URL, so it checks a shared secret. No secret configured is a
// CLOSED door, not an open one (same rule as ad-video-worker-background.mjs).
//
// What it does each run: drain the repo outbox (at most once a minute), send due
// buzzes, take back stale claims, run queued jobs 3 at a time. At minute 9 it
// stops taking new work and, if jobs are left, wakes itself again.

import { db, pool } from "../../src/db.mjs";
import { runWorker } from "../../src/marketing/worker.mjs";
import { wakeWorker, WORKER_HEADER } from "../../src/marketing/wake.mjs";
import { JOB_HANDLERS } from "../../src/marketing/handlers.mjs";

export const AUTH_HEADER = WORKER_HEADER;

export async function handler(req) {
  const expected = process.env.MARKETING_WORKER_SECRET || "";
  const got = req?.headers?.get ? req.headers.get(AUTH_HEADER) : null;
  if (!expected || got !== expected) {
    console.error("[marketing-worker] refused: the shared secret did not match");
    return new Response("no", { status: 404 });
  }

  console.log(`[marketing-worker] build ${String(process.env.COMMIT_REF || "unknown").slice(0, 8)} starting a run`);
  let result;
  try {
    result = await runWorker({ db, pool: pool(), handlers: JOB_HANDLERS });
  } catch (err) {
    const error = String((err && err.message) || err).slice(0, 300);
    console.error(`[marketing-worker] run failed: ${error}`);
    return new Response(JSON.stringify({ ok: false, error }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (result.moreWork) {
    const again = await wakeWorker();
    if (again.error) console.error(`[marketing-worker] could not wake itself: ${again.error}`);
  }
  console.log(`[marketing-worker] ran ${result.ran}, failed ${result.failed}, retried ${result.retried}, buzzes ${result.buzzes}`);
  return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers: { "content-type": "application/json" } });
}

export default handler;
