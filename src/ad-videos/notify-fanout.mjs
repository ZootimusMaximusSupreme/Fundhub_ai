// The buzz when a finished ad is ready: Chris's phone by TEXT, and the ntfy topic.
//
// WHY THIS EXISTS. The pipeline's notify port was ntfy only. ntfy is a push app;
// Chris asked to be TEXTED the finished video. src/pulse/notify.mjs already
// holds the one sanctioned "text Chris" path — "Chris: dest from PULSE_SMS_TO
// (or CHRIS_PULSE_SMS). Do not hardcode." — so this reuses its number lookup
// and the Twilio provider it sends through. No number is written down here.
//
// TRANSMISSION STAYS IN THE PROVIDERS. This module calls two provider send()
// functions and nothing else; there is no fetch in this file (CLAUDE.md §12).
//
// Either channel landing is a success — the point is that a person finds out.
// Both failing is a failure the caller keeps on the row.

import { send as sendNtfy } from "../messaging/providers/ntfy.mjs";
import { send as sendSms } from "../messaging/providers/twilio.mjs";
import { chrisPulseSmsTo } from "../pulse/notify.mjs";

/** The text. Short, and every link on its own line so a phone makes each one tappable. */
export function smsBody(notification = {}) {
  const lines = [String(notification.title || "A Fundhub ad is ready").trim()];
  if (notification.click) lines.push(`Watch: ${notification.click}`);
  for (const a of notification.actions || []) {
    if (a?.url) lines.push(`${a.label || "Open"}: ${a.url}`);
  }
  return lines.join("\n");
}

export async function send(message = {}, options = {}) {
  const env = options.env || process.env;
  const out = { ntfy: null, sms: null };

  try { out.ntfy = await sendNtfy(message, options); }
  catch (err) { out.ntfy = { ok: false, status: "failed", error: String((err && err.message) || err) }; }

  const to = chrisPulseSmsTo(env);
  if (to) {
    try {
      out.sms = await sendSms(
        { id: message.id, to, body: smsBody(message.notification), channel: "sms" },
        { env, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs, signal: options.signal }
      );
    } catch (err) {
      out.sms = { ok: false, status: "failed", error: String((err && err.message) || err) };
    }
  } else {
    out.sms = { ok: false, status: "skipped", error: "PULSE_SMS_TO is not set — no text was attempted" };
  }

  const ntfyOk = out.ntfy?.ok === true || out.ntfy?.status === "sent";
  const smsOk = out.sms?.ok === true || out.sms?.status === "sent";
  if (ntfyOk || smsOk) {
    return { ok: true, status: "sent", channels: { ntfy: ntfyOk, sms: smsOk },
      error: smsOk ? null : `text not sent: ${out.sms?.error || "unknown"}` };
  }
  return { ok: false, status: "failed", channels: { ntfy: false, sms: false },
    error: `ntfy: ${out.ntfy?.error || "failed"}; sms: ${out.sms?.error || "failed"}` };
}

export default send;
