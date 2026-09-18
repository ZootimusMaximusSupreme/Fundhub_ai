#!/usr/bin/env node
// scripts/inngest-register.mjs — tell Inngest (the service that runs every timed job
// and every event job) which jobs the live build has.
//
//   node scripts/inngest-register.mjs     # re-register now, no deploy
//
// WHY. Inngest does not look at a deploy. It keeps the job list it was last handed, and
// only a PUT to /api/inngest hands it a new one. `npm run ship` deployed and stopped, so a
// job added in a ship never ran: hole 12's 5-minute catch-up shipped 16:13 UTC on
// 2026-09-18 and did not run until the app was re-registered by hand at 18:47 (board N25).
// scripts/ship.mjs now calls this after /api/health passes and before it logs the ship.
//
// SUCCESS is HTTP 200 with the SDK's exact "Successfully registered". Anything else is a
// failure, retried a few times (right after a deploy the function can answer 502 for a
// moment), then thrown. `modified` is printed, not judged: Inngest answered true on three
// PUTs in three minutes with no deploy between them (19:44:42, 19:45:03 and 19:47:41 UTC,
// 2026-09-18), so it is not proof the old list was wrong.

import { fileURLToPath } from "node:url";

export const REGISTERED = "Successfully registered";

export async function reregisterInngest({
  site = "https://fundhub.ai",
  fetchImpl = fetch,
  attempts = 3,
  waitMs = 5000,
  timeoutMs = 30000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms))
} = {}) {
  const url = `${site}/api/inngest`;
  let last = "no answer";
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetchImpl(url, { method: "PUT", signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch { /* not JSON — reported below */ }
      if (res.status === 200 && body?.message === REGISTERED) {
        return { modified: typeof body.modified === "boolean" ? body.modified : null, attempts: i };
      }
      last = `HTTP ${res.status}: ${body?.message ?? text.slice(0, 200)}`;
    } catch (e) {
      last = e?.message || String(e);
    }
    if (i < attempts) await sleep(waitMs);
  }
  throw new Error(`PUT ${url} did not register after ${attempts} tries (last: ${last})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { modified } = await reregisterInngest();
    console.log(`✔ Inngest registered the live build (modified: ${modified}).`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
