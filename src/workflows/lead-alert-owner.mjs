// Lead alert to Chris — owner-set 2026-10-07.
// Trigger: entry.captured and booking.created. One text and one email to Chris
// the moment a new lead exists. Chris answers the lead himself from his business
// cell, so he hears about every lead first.
// Spec: ops/workflows/team-setup-sarah-justice-2026-10-07/w2-lead-alerts-spec.md.
// Flow: docs/journeys/lead-alert-flow.md.
//
// THE PATTERN IS S-00's. Each channel claims a once-only stamp on the client's
// file (claimCustomFieldLock) before it sends, so two events at the same moment
// cannot both win, and a person who fires entry.captured five times, or books
// after surveying, still produces one text and one email, ever. The stamps are
// per channel: a text that worked is never sent again because the email had to
// retry.
//
// WHO IS ALERTED ABOUT. Only a lead made in the last 24 hours. An old client
// whose ClickFunnels contact is touched again fires the same events, and Chris
// does not want a text for every one of them. A test file (is_demo, the
// +fhtest address) and a journey-runner synthetic client are never alerted.
// A person who books with no survey fires booking.created and no entry.captured;
// that path is covered because the client row is brand new at that moment.
//
// WHAT FAILS HOW. A send that cannot be delivered clears its own stamp and
// throws inside its own step, so Inngest retries that step alone. The other
// channel still goes. If a channel is still failing after its retries, the run
// ends failed (so the Inngest screen shows it) and the stamp stays empty, which
// turns the daily pulse red (checkLeadAlerts) and lets the next event for the
// same person try again. A channel with nowhere to send (setting unset) is
// skipped with a log line and is never claimed or thrown.
//
// NOTHING PERSONAL IS KEPT IN INNGEST. Each step returns a status word, never
// the lead's name, number or address: the details are read fresh inside the
// step that sends them. Logs carry the client id and nothing else.

import { NonRetriableError } from "inngest";
import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { resolveClient } from "../handlers/client-lifecycle.mjs";
import { claimCustomFieldLock } from "./custom-fields.mjs";
import { readClientAdAttribution } from "../ads/store.mjs";
import { isSynthetic } from "../messaging/live-fence.mjs";
import { fenceVerdict, MESSAGING_DRY_RUN } from "../lib/dry-run.mjs";
import {
  SMS_STAMP,
  EMAIL_STAMP,
  leadAlertSmsTo,
  leadAlertEmailTo,
  buildLeadAlertText,
  buildLeadAlertEmail,
  sendLeadAlertSms,
  sendLeadAlertEmail,
  scrubError
} from "../staff/lead-alert.mjs";

export { SMS_STAMP, EMAIL_STAMP };

/** A lead older than this is not new. */
export const MAX_LEAD_AGE_MS = 24 * 60 * 60 * 1000;

const LEAD_COLUMNS =
  `SELECT id, first_name, last_name, email, phone, channel_source, is_demo, created_at, custom_fields
     FROM clients WHERE id = $1 AND org_id = $2`;

async function readLeadRow(db, orgId, clientId) {
  if (!orgId || !clientId) return null;
  const r = await db.query(LEAD_COLUMNS, [clientId, orgId]);
  return r.rows[0] || null;
}

/* Put the stamp back after a send that did not land, so the next event for this
   person (or Inngest's retry of this step) can try again. */
async function releaseStamp(db, clientId, field) {
  await db.query(
    `UPDATE clients
        SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) - $2::text
      WHERE id = $1`,
    [clientId, field]
  );
}

/* Is this person someone Chris should be told about? Returns a status word and
   nothing personal. */
export function eligibility(row, now) {
  if (!row) return { ok: false, reason: "no_client" };
  if (row.is_demo === true) return { ok: false, reason: "demo_client" };
  if (isSynthetic(row)) return { ok: false, reason: "synthetic_client" };
  const created = new Date(row.created_at).getTime();
  if (!Number.isFinite(created)) return { ok: false, reason: "no_created_at" };
  if (now.getTime() - created > MAX_LEAD_AGE_MS) return { ok: false, reason: "older_than_24h" };
  return { ok: true, reason: null };
}

async function readAttribution(db, orgId, clientId) {
  try {
    return await readClientAdAttribution(db, { orgId, clientId });
  } catch (err) {
    // A missing ad row only changes the Source line. The lead is never held up.
    console.warn(`[lead-alert] client ${clientId}: ad row not read (${scrubError(err && err.message)})`);
    return null;
  }
}

/* One channel, in one step. Claim, send, and on a failure put the stamp back.
   Returns a status word. Throws (so Inngest retries this step) only when the
   send failed in a way a retry can fix. */
async function alertChannel({ db, orgId, clientId, channel, env, now, fetchImpl, sendImpl }) {
  const isSms = channel === "sms";
  const field = isSms ? SMS_STAMP : EMAIL_STAMP;
  const envName = isSms ? "LEAD_ALERT_SMS_TO" : "LEAD_ALERT_EMAIL_TO";

  const recipients = isSms ? leadAlertSmsTo(env) : leadAlertEmailTo(env);
  if (!recipients.length) {
    console.warn(`[lead-alert] ${envName} is not set to a usable value; no ${channel} sent for client ${clientId}`);
    return { channel, status: "not_configured" };
  }

  const claimed = await claimCustomFieldLock(db, clientId, field);
  if (!claimed) return { channel, status: "already_alerted" };

  let out;
  try {
    const row = await readLeadRow(db, orgId, clientId);
    if (!row) throw new Error("client row not found");
    const attribution = await readAttribution(db, orgId, clientId);
    const lead = {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      channelSource: row.channel_source
    };
    if (isSms) {
      out = await sendLeadAlertSms({
        body: buildLeadAlertText(lead, { attribution, env }),
        env, fetchImpl, sendImpl
      });
    } else {
      const mail = buildLeadAlertEmail(lead, { attribution, env, at: now });
      out = await sendLeadAlertEmail({ ...mail, env, fetchImpl, sendImpl });
    }
  } catch (err) {
    out = { status: "failed", retryable: true, error: scrubError(err && err.message) };
  }

  if (out.status === "sent") {
    /* With two or more recipients one can be accepted while another fails. The
       channel still counts as sent and is NOT retried (a retry would send to the
       person who already has it), but the miss is written down: how many, and the
       scrubbed reason. The reason never holds a number or an address. */
    if (out.failed > 0) {
      console.warn(
        `[lead-alert] ${channel} PARTLY sent for client ${clientId}: ` +
        `${out.accepted} accepted, ${out.failed} failed (${out.error || "no reason given"})`
      );
    } else {
      console.log(`[lead-alert] ${channel} sent for client ${clientId}`);
    }
    return { channel, status: "sent", accepted: out.accepted, failed: out.failed || 0 };
  }

  await releaseStamp(db, clientId, field);
  console.error(`[lead-alert] ${channel} NOT sent for client ${clientId}: ${out.error}`);
  if (out.retryable) throw new Error(`lead alert ${channel} not sent: ${out.error}`);
  return { channel, status: "rejected", error: out.error };
}

export async function handle({
  event,
  db,
  step,
  env = process.env,
  now = () => new Date(),
  fetchImpl,
  sendSms,
  sendEmail
}) {
  const clientId = await step.run("resolve-client", () => resolveClient(db, event));
  if (!clientId) return { done: false, reason: "no_client" };

  const orgId = event.orgId;
  const eligible = await step.run("check-eligible", async () =>
    eligibility(await readLeadRow(db, orgId, clientId), now()));
  if (!eligible.ok) return { done: false, reason: eligible.reason };

  /* The messaging fence. A context that is not live (MESSAGING_DRY_RUN not set
     to an explicit off value) sends nothing, and says so once rather than
     claiming a stamp and failing the providers four times over. */
  const fence = fenceVerdict(MESSAGING_DRY_RUN, env);
  if (!fence.allowed) {
    console.warn(`[lead-alert] client ${clientId}: messaging fence is up, nothing sent`);
    return { done: false, reason: "fence_held" };
  }

  const failures = [];
  const results = {};
  for (const [channel, id, sendImpl] of [
    ["sms", "alert-sms", sendSms],
    ["email", "alert-email", sendEmail]
  ]) {
    try {
      results[channel] = await step.run(id, () =>
        alertChannel({ db, orgId, clientId, channel, env, now: now(), fetchImpl, sendImpl }));
    } catch (err) {
      results[channel] = { channel, status: "failed" };
      failures.push(scrubError(err && err.message));
    }
  }

  /* One channel failing never stops the other, but the run must not look
     green. NonRetriableError: the steps above have already used their retries. */
  if (failures.length) throw new NonRetriableError(failures.join("; "));
  return { done: true, ...results };
}

export const leadAlertOwner = inngest.createFunction(
  { id: "lead-alert-owner", name: "Lead alert to Chris (text and email)" },
  [{ event: "entry.captured" }, { event: "booking.created" }],
  ({ event, step }) => handle({ event: event.data, db, step })
);
