// ntfy — the buzz on Chris's phone when a video is ready to approve.
//
// CLAUDE.md §12: outbound transmission lives in src/messaging/providers/* and
// nowhere else. This is one HTTP POST to a topic, and the phone app is the
// subscriber.
//
// WHY NOT src/push/send.mjs. That path is real and it works, but its address is
// a row in client_push_subscriptions — one subscription per CLIENT, resolved by
// sendToClient(db, { orgId, clientId }). Chris's own phone is not a client and
// has no row there. Wiring a staff device into the client push table to reuse
// the code would put a staff endpoint in a client table, which is worse than a
// second provider.
//
// WHY NOT A TEXT MESSAGE. US carrier registration (A2P 10DLC) takes two to six
// weeks and unregistered traffic is dropped. That is in the API research.
//
// SHIPS UNROUTED. `ENABLED = false`, not in providers/index.mjs.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE FENCE IS `MESSAGING`, because this reaches a person. That is the exact
// test src/lib/outbound-fetch.mjs sets, and a staff phone is still a phone.
// postJson() from ./http.mjs binds that fence, so with MESSAGING_DRY_RUN unset
// no buzz goes out and the video simply waits in `awaiting_approval` — which is
// the correct behaviour for a deploy nobody has switched on.
// ═══════════════════════════════════════════════════════════════════════════
//
// NOTHING ABOUT A CLIENT EVER GOES HERE. A topic is a public-by-default name on
// a public server: anyone who guesses it reads everything on it. So this module
// carries an ad number, a take number and two links, and send() refuses outright
// if a caller hands it a clientId. Nothing is logged either — not the topic, not
// the token, not the body.
//
// CONFIGURATION, read at call time:
//   NTFY_TOPIC    the topic name. Required. Treat it as a secret: it is the
//                 whole address. Set it long and random.
//   NTFY_SERVER   optional. Defaults to the public server.
//   NTFY_TOKEN    optional. Only needed for an access-controlled topic.

import { postJson, classify, success, failure, rejection, redact } from "./http.mjs";

export const PROVIDER = "ntfy";
export const CHANNELS = new Set(["staff_push"]);
export const ADDRESS_FIELD = "ntfy_topic";
export const ENABLED = false;
export const TRANSMITS = true;

export const DEFAULT_SERVER = "https://ntfy.sh";

/** Caps. A notification is a nudge, not a report. */
export const MAX_TITLE_CHARS = 120;
export const MAX_BODY_CHARS = 500;
export const MAX_ACTIONS = 3;

/**
 * ntfyConfig(env) → { ok, server, topic, token, missing }
 * The topic and token are never returned into any log path.
 */
export function ntfyConfig(env = process.env) {
  const topic = String(env.NTFY_TOPIC || "").trim();
  const server = String(env.NTFY_SERVER || DEFAULT_SERVER).replace(/\/+$/, "");
  const token = String(env.NTFY_TOKEN || "").trim();
  if (!topic) return { ok: false, missing: ["NTFY_TOPIC"], server, topic: "", token };
  if (!/^https:\/\//i.test(server)) {
    return { ok: false, missing: [], problems: ["NTFY_SERVER must be an https:// URL"], server, topic, token };
  }
  return { ok: true, missing: [], problems: [], server, topic, token };
}

/** isNtfyConfigured(env) → boolean. Reports; never throws. */
export function isNtfyConfigured(env = process.env) {
  return ntfyConfig(env).ok === true;
}

const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/* buildPayload — the body, built HERE and never accepted pre-serialised.

   Same reasoning as web-push.mjs: a caller who could hand over finished JSON
   could hand over anything, and the checks below would never see it. */
export function buildPayload(notification = {}, { topic } = {}) {
  const title = clip(notification.title, MAX_TITLE_CHARS);
  const message = clip(notification.body ?? notification.message, MAX_BODY_CHARS);
  if (!title && !message) throw new Error("a notification with no title and no body is nothing");

  const payload = { topic, title: title || "Fundhub", message: message || title };

  if (notification.priority) {
    const p = Number(notification.priority);
    if (Number.isFinite(p) && p >= 1 && p <= 5) payload.priority = p;
  }
  if (Array.isArray(notification.tags) && notification.tags.length) {
    payload.tags = notification.tags.map((t) => clip(t, 30)).filter(Boolean).slice(0, 5);
  }
  if (notification.click && /^https:\/\//i.test(String(notification.click))) {
    payload.click = String(notification.click);
  }

  /* The two taps that are the whole point: Approve and Reject, as view actions
     rather than http actions. A view action opens the link in the browser, so
     the approval still goes through the signed public door and is attributed.
     An http action would fire an unauthenticated POST from the phone. */
  const actions = [];
  for (const a of (Array.isArray(notification.actions) ? notification.actions : []).slice(0, MAX_ACTIONS)) {
    const label = clip(a?.label, 30);
    const url = String(a?.url || "");
    if (!label || !/^https:\/\//i.test(url)) continue;
    actions.push({ action: "view", label, url, clear: true });
  }
  if (actions.length) payload.actions = actions;

  return payload;
}

/**
 * send(message, options) → SendResult
 *
 * message: {
 *   id?           a row id for the result only — never a credential
 *   notification  { title, body, priority?, tags?, click?, actions? }
 * }
 */
export async function send(message = {}, options = {}) {
  try {
    return await attempt(message, options);
  } catch (err) {
    // The contract says never throw. Backstop for a bug in the code above.
    return failure(`ntfy provider error: ${String((err && err.message) || err)}`);
  }
}

async function attempt(message, { fetchImpl, timeoutMs, signal, env = process.env } = {}) {
  /* THE ONE REFUSAL. A topic is a public address; a client's name or id on it is
     a leak with no way to take it back. Permanent, so a rejection not a failure. */
  if (message.clientId || message.notification?.clientId) {
    return rejection("a staff notification must never carry a client id");
  }

  const cfg = ntfyConfig(env);
  if (!cfg.ok) {
    // Retryable: the notification is fine, the configuration is not.
    return failure(`ntfy is not configured: ${[...(cfg.missing || []), ...(cfg.problems || [])].join(", ")}`);
  }

  let payload;
  try {
    payload = buildPayload(message.notification || {}, { topic: cfg.topic });
  } catch (err) {
    return rejection(String(err?.message || err));
  }

  const headers = {};
  if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;

  const res = await postJson(`${cfg.server}/`, {
    headers,
    body: JSON.stringify(payload),
    timeoutMs,
    fetchImpl,
    signal,
    env,
    /* The log line the fence writes on a hold. Deliberately does not name the
       topic — that is the address, and the address is the secret. */
    what: "staff notification"
  });

  if (res.blocked) return failure(res.error || "staff notification held by the messaging fence");
  if (res.status === 0) return failure(res.error || "staff notification request failed");

  const verdict = classify(res.status);
  if (verdict.status === "rejected") {
    return rejection(redact(res.error || `ntfy rejected the notification (HTTP ${res.status})`));
  }
  if (verdict.status === "failed") {
    return failure(redact(res.error || `ntfy returned HTTP ${res.status}`), { retryable: true });
  }
  return success(res.body?.id ? String(res.body.id) : (message.id ? String(message.id) : null));
}

export default { PROVIDER, CHANNELS, ADDRESS_FIELD, ENABLED, TRANSMITS, send, ntfyConfig, isNtfyConfigured, buildPayload };
