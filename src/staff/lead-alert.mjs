// New-lead alert to Chris. One text and one email per new lead.
// Owner-set 2026-10-07: "I need to be notified immediately when leads come in
// (text/email). All incoming leads should alert me first." Spec:
// ops/workflows/team-setup-sarah-justice-2026-10-07/w2-lead-alerts-spec.md.
//
// This file builds the words and hands them to the two providers. It decides
// nothing about WHEN to alert: src/workflows/lead-alert-owner.mjs does that.
//
// WHY THIS DOES NOT GO THROUGH sendTemplated AND THE MESSAGE QUEUE. The queue
// checks the consent and quiet hours of the person a message is FOR. This
// message is for Chris, not for the lead, so the lead's consent has nothing to
// do with it. The queue also waits for a five-minute sweeper, and Chris asked
// for the moment. Same direct pattern as src/staff/blake-lead-watch.mjs.
//
// NO fetch HERE. The only outbound calls are the two provider send() functions
// (src/messaging/providers/twilio.mjs and resend.mjs). Both sit behind the
// messaging fence (MESSAGING_DRY_RUN), so a context that is not live sends
// nothing. CLAUDE.md section 12: outbound transmission lives in providers only.
//
// WHERE THE NUMBER AND THE ADDRESS COME FROM. Two settings, and only these two:
//   LEAD_ALERT_SMS_TO     one phone number, or several separated by commas
//   LEAD_ALERT_EMAIL_TO   one address, or several separated by commas
// There is NO fallback to PULSE_SMS_TO. That one is shared with the morning
// check and may still hold a test phone, and a fallback would silently send
// leads' names and numbers to the wrong place. Unset means no alert on that
// channel, and the daily pulse goes red (checkLeadAlerts). The values are never
// written into code, tests, docs, logs or error text.

import { send as defaultSendSms } from "../messaging/providers/twilio.mjs";
import { send as defaultSendEmail } from "../messaging/providers/resend.mjs";
import { normalizeUsNumber } from "../pulse/notify.mjs";
import { looksLikeEmail } from "../auth/staff-mail.mjs";

export const LEAD_ALERT_SMS_TO_ENV = "LEAD_ALERT_SMS_TO";
export const LEAD_ALERT_EMAIL_TO_ENV = "LEAD_ALERT_EMAIL_TO";

/** The two once-only stamps, on clients.custom_fields. One per channel, so a
    text that worked is never sent again when only the email has to retry. */
export const SMS_STAMP = "lead_alert_sms_at";
export const EMAIL_STAMP = "lead_alert_email_at";

/** Same zone the rest of the messaging code uses (src/workflows/messaging.mjs). */
export const ALERT_TZ = "America/Phoenix";

const E164 = /^\+[1-9]\d{7,14}$/;

function splitList(raw) {
  return String(raw == null ? "" : raw).split(",").map((s) => s.trim()).filter(Boolean);
}

/** The phone numbers that get the text, cleaned to the shape Twilio wants.
    An entry that is not a dialable number is dropped, never guessed at. */
export function leadAlertSmsTo(env = process.env) {
  const out = [];
  for (const item of splitList(env && env[LEAD_ALERT_SMS_TO_ENV])) {
    const n = normalizeUsNumber(item);
    if (E164.test(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

/** The addresses that get the email, lower-cased. Anything that is not an
    address is dropped. */
export function leadAlertEmailTo(env = process.env) {
  const out = [];
  for (const item of splitList(env && env[LEAD_ALERT_EMAIL_TO_ENV])) {
    const e = item.toLowerCase();
    if (looksLikeEmail(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

/** Which channels have somewhere to go. Names only; never the values. */
export function leadAlertConfigured(env = process.env) {
  return {
    sms: leadAlertSmsTo(env).length > 0,
    email: leadAlertEmailTo(env).length > 0
  };
}

/* One line of plain text. The name, email and source come off a public form, so
   anyone can type anything there: newlines and control characters are removed
   and the length is capped before the words reach Chris's phone or inbox. */
function oneLine(value, max = 120) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function leadName(lead = {}) {
  return oneLine([lead.firstName, lead.lastName].filter(Boolean).join(" "), 80);
}

/** (602) 555-0142 for a US number. Anything else is shown as stored. */
export function formatPhone(raw) {
  const s = oneLine(raw, 40);
  if (!s) return "";
  const digits = s.replace(/\D+/g, "");
  const ten = digits.length === 10 ? digits : (digits.length === 11 && digits[0] === "1" ? digits.slice(1) : "");
  if (ten) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return s;
}

/** "Ad 42 (42-ringlights)" from the typed ad row, else the channel the lead
    came in on, else "not tagged". A lead added by staff says so. */
export function leadSource({ attribution, channelSource } = {}) {
  const adId = attribution && attribution.ad_id != null ? oneLine(attribution.ad_id, 12) : "";
  if (adId) {
    const content = oneLine(attribution.utm_content, 80);
    return content && content !== adId ? `Ad ${adId} (${content})` : `Ad ${adId}`;
  }
  const channel = oneLine(channelSource, 80);
  if (channel === "pipeline") return "added by staff on the Pipeline board";
  return channel || "not tagged";
}

/** The CRM link. Base is APP_BASE_URL, then URL, then the live site: the same
    rule src/messaging/dispatch.mjs uses. The page reads `id`. */
export function leadCrmLink(clientId, env = process.env) {
  const base = String((env && (env.APP_BASE_URL || env.URL)) || "https://fundhub.ai").replace(/\/+$/, "");
  return `${base}/app/client-control-panel.html?id=${encodeURIComponent(String(clientId || ""))}`;
}

/** "3:42 PM Arizona". Newer Node prints a narrow no-break space before PM. */
export function formatAlertTime(at = new Date()) {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const t = d.toLocaleTimeString("en-US", { timeZone: ALERT_TZ, hour: "numeric", minute: "2-digit" });
  return `${t.replace(/[\u202f\u00a0]/g, " ")} Arizona`;
}

function fields(lead, { attribution, env }) {
  return {
    name: leadName(lead),
    phone: formatPhone(lead.phone),
    email: oneLine(lead.email, 120),
    source: leadSource({ attribution, channelSource: lead.channelSource }),
    link: leadCrmLink(lead.id, env)
  };
}

/** The text. About 200 characters: two segments. The link is on its own line. */
export function buildLeadAlertText(lead, { attribution = null, env = process.env } = {}) {
  const f = fields(lead, { attribution, env });
  return [
    "New Fundhub lead",
    f.name || "Name not given",
    f.phone || "Phone: not given yet",
    f.email || "Email: not given",
    `Source: ${f.source}`,
    `Open: ${f.link}`
  ].join("\n");
}

/** The email. The subject alone says who it is and what number to text. */
export function buildLeadAlertEmail(lead, { attribution = null, env = process.env, at = new Date() } = {}) {
  const f = fields(lead, { attribution, env });
  const who = f.name || f.email || "name not given";
  const subject = `New Fundhub lead: ${who}, ${f.phone || "no phone yet"}`;
  const time = formatAlertTime(at);
  const body = [
    "A new lead just came in.",
    "",
    `Name: ${f.name || "not given"}`,
    `Phone: ${f.phone || "not given yet"}`,
    `Email: ${f.email || "not given"}`,
    `Source: ${f.source}`,
    ...(time ? [`Time: ${time}`] : []),
    "",
    "Open the lead in the CRM:",
    f.link
  ].join("\n");
  return { subject, body };
}

/* A provider's error can echo the number or address it was given (Twilio does).
   Whatever leaves this file as text is scrubbed first, so a number or an
   address never reaches a log line or a thrown error. */
export function scrubError(text) {
  return String(text == null ? "" : text)
    .replace(/[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]+/g, "[address]")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, "[number]")
    .slice(0, 200);
}

/* One channel, every recipient. The channel counts as delivered when at least
   one recipient was accepted. If none was: `failed` when any failure can be
   retried, `rejected` when every one is permanent. */
async function deliver(recipients, makeMessage, send, options) {
  if (!recipients.length) return { status: "not_configured", accepted: 0, failed: 0, retryable: false, error: null };
  let accepted = 0;
  let failed = 0;
  let retryable = false;
  let error = null;
  for (const to of recipients) {
    let out;
    try {
      out = await send(makeMessage(to), options);
    } catch (err) {
      out = { status: "failed", retryable: true, error: String((err && err.message) || err) };
    }
    if (out && out.status === "sent") {
      accepted += 1;
    } else {
      failed += 1;
      if (!out || out.retryable !== false) retryable = true;
      if (!error) error = scrubError((out && out.error) || "send failed");
    }
  }
  if (accepted > 0) return { status: "sent", accepted, failed, retryable: false, error };
  return { status: retryable ? "failed" : "rejected", accepted, failed, retryable, error };
}

/** Send the text to everyone in LEAD_ALERT_SMS_TO. */
export function sendLeadAlertSms({ body, env = process.env, fetchImpl, sendImpl = defaultSendSms } = {}) {
  return deliver(
    leadAlertSmsTo(env),
    (to) => ({ to, body, channel: "sms" }),
    sendImpl,
    { env, fetchImpl }
  );
}

/** Send the email to everyone in LEAD_ALERT_EMAIL_TO. No clientId on purpose:
    the provider would turn it into a reply address for a CLIENT thread, and
    this mail is for Chris. */
export function sendLeadAlertEmail({ subject, body, env = process.env, fetchImpl, sendImpl = defaultSendEmail } = {}) {
  return deliver(
    leadAlertEmailTo(env),
    (to) => ({ to, subject, body, channel: "email" }),
    sendImpl,
    { env, fetchImpl }
  );
}
