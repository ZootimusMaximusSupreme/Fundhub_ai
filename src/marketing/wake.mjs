// Wake the marketing worker (spec M0 step 4).
//
// The worker is a Netlify BACKGROUND function: it answers 202 at once and keeps
// running for up to 15 minutes. Netlify will not put a background function on a
// schedule, so the clock (and every save that queues repo work) starts it with
// this one POST to our own deploy, behind a shared secret. Nothing leaves
// fundhub.ai and no vendor is reached here. Same shape as
// netlify/functions/ad-video-sweeper.mjs.
//
// This is on ALLOWED_RAW_FETCH in src/lib/no-unfenced-transmit.test.mjs with that reason.

export const WORKER_PATH = "/.netlify/functions/marketing-worker-background";
export const WORKER_HEADER = "x-fundhub-worker";
const WAKE_TIMEOUT_MS = 5000;

/**
 * wakeWorker({ env?, fetchImpl?, timeoutMs? }) -> { ok, started, error }
 * Never throws. A missing site URL or secret is reported, not raised, so a
 * save never fails because the worker could not be woken.
 */
export async function wakeWorker({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = WAKE_TIMEOUT_MS } = {}) {
  const base = env.URL || env.DEPLOY_URL || "";
  const secret = env.MARKETING_WORKER_SECRET || "";
  if (!base || !secret) {
    const why = !base ? "no site URL in the environment" : "MARKETING_WORKER_SECRET is not set";
    return { ok: false, started: false, error: why };
  }
  if (typeof fetchImpl !== "function") return { ok: false, started: false, error: "fetch unavailable" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}${WORKER_PATH}`, {
      method: "POST",
      headers: { [WORKER_HEADER]: secret },
      signal: controller.signal
    });
    const started = res.status === 202 || res.ok;
    return { ok: started, started, error: started ? null : `the worker answered ${res.status}` };
  } catch (err) {
    return { ok: false, started: false, error: String((err && err.message) || err).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

export default wakeWorker;
