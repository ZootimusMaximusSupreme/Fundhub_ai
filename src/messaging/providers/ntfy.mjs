// ntfy — the buzz on Chris's phone, and the only place it leaves the building.
//
// CLAUDE.md §12: "Outbound transmission is permitted in src/messaging/providers/*
// and nowhere else." That is why the POST lives here and not in src/video/.
//
// SHIPS UNROUTED, DELIBERATELY. `ENABLED = false` and this module is NOT in
// providers/index.mjs. There is no `ops_push` channel in message_channel_routing
// and the dispatcher has never heard of it, so nothing in the message queue can
// reach this code by accident. Its one caller is the ad-video pipeline. It
// still wears the full provider contract (PROVIDER / CHANNELS / ADDRESS_FIELD /
// ENABLED / TRANSMITS / send) so that registering it later is one line in
// index.mjs rather than a rewrite — the same posture as web-push.mjs.
//
// ═══════════════════════════════════════════════════════════════════════════
// *** WHY fence: INTERNAL AND NOT MESSAGING — READ THIS BEFORE COPYING IT ***
//
// This is a judgement call and it is worth being able to overturn in one line.
//
// The MESSAGING fence exists so that a dry-run environment cannot text or email
// a real CLIENT. Its dry-run flag is a consumer-protection device. This
// provider cannot reach a consumer: it publishes to one fixed topic URL that
// comes from NTFY_TOPIC_URL, it takes no recipient from any caller, and there
// is no argument to send() that can redirect it. The only person it can reach
// is the owner, on his own phone, about his own video.
//
// Behind MESSAGING it would be held by MESSAGING_DRY_RUN, and the effect of
// that hold would not be that a consumer is protected — nothing here can reach
// one — it would be that the approval step of the pipeline stops dead in any
// environment with the flag up, with no notification and no error anybody sees.
// That is the same reasoning src/underwrite/black-report-pdf.mjs is INTERNAL
// for: holding it protects nobody and quietly breaks the product for staff.
//
// It is still NOT a bypass. INTERNAL has to be named out loud and
// src/lib/no-unfenced-transmit.test.mjs pins the exact set of modules allowed
// to name it, so this file had to be added to a list a reviewer reads.
//
// IF THIS PROVIDER EVER LEARNS TO TAKE A RECIPIENT FROM A CALLER, it stops
// being internal that same day and belongs behind MESSAGING. The single fixed
// destination is the whole argument.
//
// ═══════════════════════════════════════════════════════════════════════════
// NOTHING SECRET IS LOGGED, AND THE TOKEN IS THE POINT
//
// The decision links carry a one-time token that is, by itself, permission to
// approve a video. So the URL never goes to a log line, never comes back in an
// error, and is never echoed into the returned result. The errors below name a
// status code and stop. redact() in the chokepoint scrubs vendor echoes on top
// of that.
//
// CONFIGURATION, read at call time:
//   NTFY_TOPIC_URL   the full publish URL including the topic, e.g.
//                    https://ntfy.sh/<something-long-and-unguessable>. The
//                    topic IS the credential on ntfy — anyone who knows it can
//                    read the notifications — so it is a secret, it is set with
//                    `--secret`, and it is never printed.

import { postJsonTo, INTERNAL } from "../../lib/outbound-fetch.mjs";
import { classify, success, failure, rejection } from "./http.mjs";

/** Must equal the `provider` value in message_channel_routing, if it is ever
    routed there. Not routed today — see the header. */
export const PROVIDER = "ntfy";

/** The channel this provider would carry. `ops_push` is not in the routing
    table's channel set today; adding it is part of a wiring change, not of
    this file. Named `ops_push` rather than `push` so it can never be confused
    with web-push.mjs, which carries client notifications. */
export const CHANNELS = new Set(["ops_push"]);

/** Not a column on `clients`, and never will be. This provider has exactly one
    destination and it comes from the environment, not from a row. Declared so
    the registry's contract check passes unchanged, and named so nobody wires a
    dispatcher to read an `ntfy_topic` column that does not exist. */
export const ADDRESS_FIELD = "ntfy_topic";

/** False: not registered, not routed, nothing in the queue can reach it. */
export const ENABLED = false;

/** True: this provider makes a real outbound HTTP request. */
export const TRANSMITS = true;

/** ntfy's own ceiling on a message body is 4 KB. Ours is far under it; the cap
    is here so a runaway caller is refused locally rather than by the vendor. */
export const MAX_MESSAGE_CHARS = 1200;

/**
 * ntfyTarget(env) → { ok, base, topic } | { ok:false, error }
 *
 * WHY THE URL IS TAKEN APART. ntfy has two publish shapes: POST the message
 * text to <base>/<topic>, or POST a JSON object to <base> with the topic inside
 * it. Only the second one can carry action buttons without hand-escaping them
 * into a header, and getting that escaping wrong on a header that contains a
 * one-time approval URL is not a mistake worth risking. So the configured URL
 * is split and the JSON shape is used.
 *
 * https only. An http topic URL would put a live approval token on the wire in
 * the clear, and this function refuses rather than downgrading quietly.
 */
export function ntfyTarget(env = process.env) {
  const raw = String(env.NTFY_TOPIC_URL || "").trim();
  if (!raw) return { ok: false, error: "NTFY_TOPIC_URL is not set" };

  let u;
  try { u = new URL(raw); } catch { return { ok: false, error: "NTFY_TOPIC_URL is not a URL" }; }

  if (u.protocol !== "https:") {
    return { ok: false, error: "NTFY_TOPIC_URL must be https — a decision token may not travel in the clear" };
  }
  // Credentials in the URL would end up in the request line. Refused.
  if (u.username || u.password) {
    return { ok: false, error: "NTFY_TOPIC_URL must not carry a username or password" };
  }

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) {
    return { ok: false, error: "NTFY_TOPIC_URL must end in exactly one path segment, the topic" };
  }

  return { ok: true, base: `${u.origin}/`, topic: parts[0] };
}

/** isNtfyConfigured(env) → boolean. Reports; never throws. */
export function isNtfyConfigured(env = process.env) {
  return ntfyTarget(env).ok === true;
}

/**
 * send(message, options) → SendResult
 *
 * message: {
 *   id?       a row id for the returned handle only — never a credential
 *   title     the notification's heading
 *   body      the notification's text
 *   priority? ntfy 1–5, default 4 (high: it buzzes a locked phone)
 *   tags?     ntfy emoji shortcodes, e.g. ["clapper"]
 *   click?    URL opened when the notification itself is tapped
 *   actions?  ntfy action buttons, already built. See
 *             src/video/approval-notice.mjs — this file does not invent them.
 * }
 *
 * NEVER THROWS. The provider contract; the try/catch is the backstop.
 */
export async function send(message = {}, options = {}) {
  try {
    return await attempt(message, options);
  } catch (err) {
    return failure(`ntfy provider error: ${String((err && err.message) || err)}`);
  }
}

async function attempt(message, { fetchImpl, timeoutMs, signal, env = process.env } = {}) {
  const target = ntfyTarget(env);
  if (!target.ok) {
    /* Retryable: the notification is fine, the configuration is not, and it
       should go out once somebody sets the variable. */
    return failure(`ntfy is not configured: ${target.error}`);
  }

  const title = String(message.title || "").trim();
  const body = String(message.body || "").trim();
  if (!body) return rejection("ntfy message has no body");
  if (body.length > MAX_MESSAGE_CHARS) {
    // Permanent for this message as written; a retry sends the same thing.
    return rejection(`ntfy message is over ${MAX_MESSAGE_CHARS} characters`);
  }

  const payload = {
    topic: target.topic,
    message: body,
    // 4 = high. A take waiting on approval is the thing blocking the pipeline,
    // and 5 (max) is reserved for something actually broken.
    priority: clampPriority(message.priority),
    ...(title ? { title } : {}),
    ...(Array.isArray(message.tags) && message.tags.length ? { tags: message.tags.map(String) } : {}),
    ...(message.click ? { click: String(message.click) } : {}),
    ...(Array.isArray(message.actions) && message.actions.length
      ? { actions: message.actions }
      : {})
  };

  const res = await postJsonTo(target.base, {
    body: JSON.stringify(payload),
    timeoutMs,
    fetchImpl,
    signal,
    env,
    // No URL, no topic, no token — this string reaches the server log.
    what: "ntfy notification",
    fence: INTERNAL
  });

  if (res.blocked) return failure(res.error || "ntfy held by the outbound fence");
  if (res.status === 0) return failure(res.error || "ntfy request failed");

  const verdict = classify(res.status);
  if (verdict.status === "rejected") {
    return rejection(`ntfy rejected the notification (HTTP ${res.status})`);
  }
  if (verdict.status === "failed") {
    return failure(`ntfy returned HTTP ${res.status}`, { retryable: true });
  }

  /* ntfy answers with the published message as JSON, including its own id. It
     is worth keeping — it is the handle for "did this actually publish" — but
     only when it is a plain string, and never the whole body, which echoes the
     message back and with it the decision URLs. */
  const vendorId = res.body && typeof res.body.id === "string" ? res.body.id : null;
  return success(vendorId || (message.id ? String(message.id) : null));
}

function clampPriority(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 4;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export default {
  PROVIDER, CHANNELS, ADDRESS_FIELD, ENABLED, TRANSMITS,
  send, ntfyTarget, isNtfyConfigured, MAX_MESSAGE_CHARS
};
