// Database checks for the daily pulse (Recon AG-07). MB2, 2026-10-05.
// Spec gaps 3 (stuck messages), 4 (dead letters), 6 (money in), 7 (ad tracking).
//
// Plain reads. No network, no writes. Each returns the pulse's check shape:
//   { id, group, status: PASS | FAIL | skip, detail, suggestedFix, customerSees }
// "skip" becomes "not_checked" on the scorecard and is never counted as a pass.

import {
  SMS_STAMP,
  EMAIL_STAMP,
  LEAD_ALERT_SMS_TO_ENV,
  LEAD_ALERT_EMAIL_TO_ENV,
  leadAlertConfigured
} from "../staff/lead-alert.mjs";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/* Windows. Owner-set defaults relayed 2026-10-05 (default pending Chris):
   queue 30 minutes, Commas 72 hours. */
export const QUEUE_MAX_AGE_MS = 30 * MIN;
export const COMMAS_WINDOW_MS = 72 * HOUR;
export const DAY_MS = 24 * HOUR;

function row(id, group, status, detail, suggestedFix = null, customerSees = null) {
  return { id, group, status, detail, suggestedFix, customerSees };
}

function noDb(ids, group, what) {
  return ids.map((id) => row(id, group, "skip", `no database in this run — ${what} not read`));
}

function minutes(ms) {
  return `${Math.round(ms / MIN)} min`;
}

/* Message queue, by channel: oldest waiting outbound message, and send
   failures in the last 24 hours. Reads `messages` (status 'queued' / 'failed',
   set by src/messaging/dispatch.mjs). A message scheduled for later (quiet
   hours) is not "waiting" until its scheduled_at has passed. */
export async function checkMessageQueue({ db, orgId, now = new Date(), channels = ["sms", "email"] } = {}) {
  const ids = channels.map((c) => `msg-queue-${c}`);
  if (!db || !orgId) return noDb(ids, "messages", "the message queue");
  const { rows } = await db.query(
    `SELECT channel,
            min(COALESCE(scheduled_at, created_at))
              FILTER (WHERE status = 'queued' AND COALESCE(scheduled_at, created_at) <= $2) AS oldest_due,
            count(*) FILTER (WHERE status = 'queued' AND COALESCE(scheduled_at, created_at) <= $2)::int AS due,
            count(*) FILTER (WHERE status = 'failed' AND updated_at >= $2::timestamptz - interval '24 hours')::int AS failed_24h
       FROM messages
      WHERE org_id = $1 AND direction = 'outbound' AND channel = ANY($3::text[])
      GROUP BY channel`,
    [orgId, now, channels]
  );
  const by = new Map(rows.map((r) => [r.channel, r]));
  return channels.map((channel) => {
    const id = `msg-queue-${channel}`;
    const r = by.get(channel) || { oldest_due: null, due: 0, failed_24h: 0 };
    const age = r.oldest_due ? now.getTime() - new Date(r.oldest_due).getTime() : 0;
    const word = channel === "sms" ? "texts" : `${channel}s`;
    const problems = [];
    if (r.oldest_due && age > QUEUE_MAX_AGE_MS) problems.push(`oldest waiting ${channel} is ${minutes(age)} old (${r.due} waiting)`);
    if (r.failed_24h > 0) problems.push(`${r.failed_24h} failed to send in the last 24 hours`);
    if (problems.length) {
      return row(id, "messages", "FAIL", problems.join("; "),
        "Open the messages queue and read last_error on the stuck or failed rows. Check messaging_settings.outbound_enabled and the provider key. Do not resend from this pulse.",
        `Clients and staff are not getting some ${word} on time.`);
    }
    return row(id, "messages", "PASS",
      `${r.due} ${channel} waiting${r.oldest_due ? `, oldest ${minutes(age)}` : ""}; 0 failed in 24 hours`);
  });
}

/* Lead alerts to Chris (W2, 2026-10-07). Every new lead is supposed to text and
   email Chris the moment it lands (src/workflows/lead-alert-owner.mjs). That
   workflow leaves one once-only stamp per channel on the client's file, so this
   check can tell a lead that was alerted from one that was not.

   Red when either is true:
     * a lead made in the last 24 hours (a real person, not a test file) came in
       through entry.captured or booking.created and is missing a text stamp or
       an email stamp; or
     * LEAD_ALERT_SMS_TO or LEAD_ALERT_EMAIL_TO has no usable value. Checked by
       name. The values are never read into the detail line.

   A lead made in the last 15 minutes is not counted yet: its alert may still be
   on the way. Plain reads. No network, no writes. */
export const LEAD_ALERT_GRACE_MS = 15 * MIN;

export async function checkLeadAlerts({ db, orgId, now = new Date(), env = process.env } = {}) {
  if (!db || !orgId) return row("lead-alerts", "messages", "skip", "no database in this run — new-lead alert stamps not read");

  const configured = leadAlertConfigured(env);
  const unset = [];
  if (!configured.sms) unset.push(LEAD_ALERT_SMS_TO_ENV);
  if (!configured.email) unset.push(LEAD_ALERT_EMAIL_TO_ENV);

  const since = new Date(now.getTime() - DAY_MS);
  const until = new Date(now.getTime() - LEAD_ALERT_GRACE_MS);
  const { rows } = await db.query(
    `SELECT count(*)::int AS expected,
            count(*) FILTER (WHERE COALESCE(c.custom_fields->>$4, '') = '')::int AS no_sms,
            count(*) FILTER (WHERE COALESCE(c.custom_fields->>$5, '') = '')::int AS no_email
       FROM clients c
      WHERE c.org_id = $1
        AND c.is_demo IS NOT TRUE
        AND COALESCE(c.custom_fields->>'synthetic', '') <> 'true'
        AND c.created_at >= $2::timestamptz
        AND c.created_at <= $3::timestamptz
        AND EXISTS (SELECT 1 FROM events e
                     WHERE e.org_id = c.org_id AND e.client_id = c.id
                       AND e.name IN ('entry.captured', 'booking.created'))`,
    [orgId, since, until, SMS_STAMP, EMAIL_STAMP]
  );
  const r = rows[0] || { expected: 0, no_sms: 0, no_email: 0 };

  const problems = [];
  if (unset.length) problems.push(`${unset.join(" and ")} ${unset.length > 1 ? "have" : "has"} no usable value, so that alert cannot go out`);
  if (r.no_sms > 0 || r.no_email > 0) {
    problems.push(`${r.no_sms} of ${r.expected} new lead(s) in the last 24 hours have no text alert and ${r.no_email} have no email alert`);
  }
  if (problems.length) {
    return row("lead-alerts", "messages", "FAIL", problems.join("; "),
      "Set LEAD_ALERT_SMS_TO and LEAD_ALERT_EMAIL_TO in Netlify (by name only), ship once, then read the lead-alert-owner runs and the Twilio and Resend delivery logs. Do not resend from this pulse.",
      "Chris is not being told right away when a new lead comes in.");
  }
  return row("lead-alerts", "messages", "PASS",
    `${r.expected} new lead(s) in the last 24 hours, all alerted by text and email`);
}

/* Dead letters. failed_events rows still open ('pending' retrying, 'exhausted'
   gave up) and rows first seen in the last 24 hours. */
export async function checkFailedEvents({ db, orgId, now = new Date() } = {}) {
  if (!db || !orgId) return noDb(["failed-events"], "backend", "failed_events")[0];
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE status IN ('pending', 'exhausted'))::int AS open,
            count(*) FILTER (WHERE status = 'exhausted')::int AS exhausted,
            count(*) FILTER (WHERE first_seen_at >= $2::timestamptz - interval '24 hours')::int AS new_24h,
            (array_agg(handler_name ORDER BY last_seen_at DESC)
               FILTER (WHERE status IN ('pending', 'exhausted')))[1] AS newest_handler
       FROM failed_events
      WHERE org_id = $1`,
    [orgId, now]
  );
  const r = rows[0] || { open: 0, exhausted: 0, new_24h: 0 };
  const detail = `${r.open} open (${r.exhausted} gave up), ${r.new_24h} new in 24 hours`;
  if (r.open > 0 || r.new_24h > 0) {
    return row("failed-events", "backend", "FAIL",
      `${detail}${r.newest_handler ? `; newest open in ${r.newest_handler}` : ""}`,
      "Open GET /api/read/failed-events and read error_message on the newest rows. Fix the handler; do not resolve rows from this pulse.",
      "Some automatic steps (texts, file moves, records) did not happen for some clients.");
  }
  return row("failed-events", "backend", "PASS", detail);
}

/* Money in. The newest payment notice per provider.
   Commas: commas_inbox.received_at (db/migrations/156).
   ClickFunnels orders: NOT CHECKED — src/adapters/clickfunnels.mjs maps
   appointments, forms and surveys and has no order event, so there is no field
   to read and none is guessed. ClarityPay: no code in this repo. */
export async function checkMoneyIn({ db, orgId, now = new Date() } = {}) {
  const out = [];
  if (!db || !orgId) {
    out.push(row("pay-commas", "money_in", "skip", "no database in this run — payment notices not read"));
  } else {
    const { rows } = await db.query(
      `SELECT max(received_at) AS last_at,
              count(*) FILTER (WHERE received_at >= $2::timestamptz - interval '72 hours')::int AS n_72h
         FROM commas_inbox WHERE org_id = $1`,
      [orgId, now]
    );
    const last = rows[0]?.last_at ? new Date(rows[0].last_at) : null;
    if (!last) {
      out.push(row("pay-commas", "money_in", "FAIL", "no Commas payment notice has ever arrived",
        "Check the Commas webhook points at /api/webhooks/commas and its signing secret.",
        "Payments may be taken but never reach the CRM, so nobody is moved forward or paid out."));
    } else if (now.getTime() - last.getTime() > COMMAS_WINDOW_MS) {
      out.push(row("pay-commas", "money_in", "FAIL",
        `last Commas payment notice ${last.toISOString()} — over 72 hours ago`,
        "Check the Commas webhook and whether sales stopped. Commas' own dashboard shows payments taken.",
        "Payments may be taken but never reach the CRM."));
    } else {
      out.push(row("pay-commas", "money_in", "PASS",
        `last Commas payment notice ${last.toISOString()}; ${rows[0].n_72h} in 72 hours`));
    }
  }
  out.push(row("pay-clickfunnels", "money_in", "skip",
    "no ClickFunnels order notice is handled anywhere in the code (src/adapters/clickfunnels.mjs has no order event), so there is nothing to check"));
  out.push(row("pay-claritypay", "money_in", "skip",
    "no ClarityPay connection exists in this repo yet — no payment notices to check"));
  return out;
}

/* Ad tracking. Meta server events: each send writes its result on the events
   row as payload.meta = { sent, error?, skipped? } (src/meta/track-send.mjs,
   src/handlers/meta-purchase.mjs). Green: something was accepted in 24 hours
   and nothing errored. */
export async function checkMetaTracking({ db, orgId, now = new Date(), env = process.env } = {}) {
  if (env?.META_CAPI_ENABLED !== "1") {
    return row("meta-capi", "tracking", "skip", "META_CAPI_ENABLED is not 1 — server events are switched off, nothing to check");
  }
  if (!db || !orgId) return row("meta-capi", "tracking", "skip", "no database in this run — Meta sends not read");
  const { rows } = await db.query(
    `SELECT COALESCE(sum(CASE WHEN (payload->'meta'->>'sent') ~ '^[0-9]+$'
                              THEN (payload->'meta'->>'sent')::int ELSE 0 END), 0)::int AS accepted,
            count(*) FILTER (WHERE payload->'meta' ? 'error')::int AS errors,
            count(*)::int AS attempts
       FROM events
      WHERE org_id = $1
        AND created_at >= $2::timestamptz - interval '24 hours'
        AND payload ? 'meta'`,
    [orgId, now]
  );
  const r = rows[0] || { accepted: 0, errors: 0, attempts: 0 };
  const detail = `${r.accepted} accepted, ${r.errors} error(s), ${r.attempts} send result(s) in 24 hours`;
  if (r.errors > 0) {
    return row("meta-capi", "tracking", "FAIL", detail,
      "Read payload.meta.error on the newest events rows. Check META_ACCESS_TOKEN and META_PIXEL_ID.",
      "Meta is not told about some leads, bookings or purchases, so ads optimise on less data.");
  }
  if (r.accepted === 0) {
    return row("meta-capi", "tracking", "FAIL", detail,
      "Check that funnel pages still send events and META_CAPI_ENABLED is on.",
      "Meta got no server events from us for a day.");
  }
  return row("meta-capi", "tracking", "PASS", detail);
}
