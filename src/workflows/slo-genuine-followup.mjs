// Genuine follow-up after someone leaves name/email/phone on /roadmap and
// does not pay the $297 diagnostic.
//
// Message 1 — ~15 minutes after slo.contact_started, if still unpaid.
// Message 2 — only after they reply (message.inbound). Never before.
//
// Copy is Chris's. Not a pitch. Outbound goes through sendTemplated →
// messages queued → src/messaging/providers (Twilio / mail). No second sender.
//
// Skips actor=agent, company/test emails (classifyVisitor), missing phone,
// and anyone who already has a paid diagnostic payment_links row.
// No backfill: only contacts that fire Inngest after skipInngest is off.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { resolveClient } from "../handlers/client-lifecycle.mjs";
import { sendTemplated } from "./messaging.mjs";
import { claimCustomFieldLock } from "./custom-fields.mjs";
import { classifyVisitor } from "../slo/visitor.mjs";
import { SLO_PURPOSE, SLO_SOURCE } from "../slo/offer.mjs";

export const SMS_M1_KEY = "SMS-SLO-GENUINE-01";
export const EMAIL_M1_KEY = "EMAIL-SLO-GENUINE-01";
export const SMS_M2_KEY = "SMS-SLO-GENUINE-02";
export const EMAIL_M2_KEY = "EMAIL-SLO-GENUINE-02";

export const LOCK_M1 = "slo_genuine_m1_sent_at";
export const LOCK_M2 = "slo_genuine_m2_sent_at";

export const WAIT_M1 = "15m";

const CHRIS = { sender_name: "Chris", sender: { name: "Chris" } };

/* Opt-out only. A real answer like "YES" or "price" must still unlock message 2. */
const OPT_OUT_WORDS = new Set([
  "STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"
]);

/** True when this email (or client) already paid a real diagnostic. */
export async function hasPaidDiagnostic(db, { orgId, email, clientId } = {}) {
  const addr = String(email || "").trim().toLowerCase();
  if (!orgId) return false;
  if (!clientId && !addr) return false;
  const r = await db.query(
    `SELECT 1
       FROM payment_links pl
       JOIN clients c ON c.id = pl.client_id
      WHERE pl.org_id = $1::uuid
        AND pl.purpose = $2
        AND COALESCE(pl.is_demo, false) = false
        AND (pl.status = 'paid' OR pl.paid_at IS NOT NULL)
        AND (
          ($3::uuid IS NOT NULL AND pl.client_id = $3::uuid)
          OR ($4 <> '' AND lower(c.email) = $4)
        )
      LIMIT 1`,
    [orgId, SLO_PURPOSE, clientId || null, addr]
  );
  return Boolean(r.rows[0]);
}

/** Gates that do not need the database. */
export function eligibleForGenuineM1(payload = {}) {
  if (payload.actor !== "person") return { ok: false, reason: "not_person" };
  const phone = String(payload.phone || "").trim();
  if (!phone) return { ok: false, reason: "no_phone" };
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) return { ok: false, reason: "no_email" };
  const who = classifyVisitor({ email });
  if (who.actor !== "person") return { ok: false, reason: who.reason || "not_person" };
  return { ok: true, email, phone };
}

export async function handleM1({ event, db, step }) {
  const payload = event.payload || {};
  const gate = eligibleForGenuineM1(payload);
  if (!gate.ok) return { done: false, reason: gate.reason };

  await step.sleep("wait-15-min", WAIT_M1);

  const orgId = event.orgId;
  const paid = await step.run("check-still-unpaid", () =>
    hasPaidDiagnostic(db, { orgId, email: gate.email }));
  if (paid) return { done: true, sent: false, reason: "already_paid" };

  const clientId = await step.run("resolve-client", () =>
    resolveClient(db, {
      orgId,
      payload: {
        email: gate.email,
        name: payload.name || null,
        phone: gate.phone,
        source: SLO_SOURCE
      }
    }));
  if (!clientId) return { done: false, reason: "no_client" };

  const stillPaid = await step.run("recheck-paid-after-resolve", () =>
    hasPaidDiagnostic(db, { orgId, email: gate.email, clientId }));
  if (stillPaid) return { done: true, sent: false, reason: "already_paid" };

  const claimed = await step.run("claim-m1", () =>
    claimCustomFieldLock(db, clientId, LOCK_M1));
  if (!claimed) return { done: false, reason: "already_sent_m1" };

  const eventId = event.id;
  const sms = await step.run("send-sms-m1", () =>
    sendTemplated(db, {
      orgId, clientId, channel: "sms", templateKey: SMS_M1_KEY, eventId, context: CHRIS
    }));
  const email = await step.run("send-email-m1", () =>
    sendTemplated(db, {
      orgId, clientId, channel: "email", templateKey: EMAIL_M1_KEY, eventId, context: CHRIS
    }));

  return { done: true, sent: true, clientId, sms, email };
}

/** True when this client got message 1 and has not gotten message 2. */
export async function awaitingGenuineM2(db, clientId) {
  if (!clientId) return false;
  const r = await db.query(
    `SELECT custom_fields->>$2 AS m1, custom_fields->>$3 AS m2
       FROM clients WHERE id = $1 LIMIT 1`,
    [clientId, LOCK_M1, LOCK_M2]
  );
  const row = r.rows[0];
  if (!row) return false;
  return Boolean(row.m1) && !row.m2;
}

export async function handleReply({ event, db, step }) {
  const payload = event.payload || {};
  const channel = payload.channel || "sms";
  if (channel !== "sms" && channel !== "email") {
    return { done: false, reason: "wrong_channel" };
  }
  const word = String(payload.body || "").trim().toUpperCase();
  if (!word) return { done: false, reason: "empty_body" };
  if (OPT_OUT_WORDS.has(word)) return { done: false, reason: "opt_out" };

  const clientId = await step.run("resolve-client", () => resolveClient(db, event));
  if (!clientId) return { done: false, reason: "no_client" };

  const waiting = await step.run("check-awaiting-m2", () =>
    awaitingGenuineM2(db, clientId));
  if (!waiting) return { done: false, reason: "not_awaiting_m2" };

  const paid = await step.run("check-paid", () =>
    hasPaidDiagnostic(db, {
      orgId: event.orgId,
      clientId,
      email: (event.payload || {}).email
    }));
  if (paid) return { done: true, sent: false, reason: "already_paid" };

  const claimed = await step.run("claim-m2", () =>
    claimCustomFieldLock(db, clientId, LOCK_M2));
  if (!claimed) return { done: false, reason: "already_sent_m2" };

  const orgId = event.orgId;
  const eventId = event.id;
  const sms = await step.run("send-sms-m2", () =>
    sendTemplated(db, {
      orgId, clientId, channel: "sms", templateKey: SMS_M2_KEY, eventId, context: CHRIS
    }));
  const email = await step.run("send-email-m2", () =>
    sendTemplated(db, {
      orgId, clientId, channel: "email", templateKey: EMAIL_M2_KEY, eventId, context: CHRIS
    }));

  return { done: true, sent: true, clientId, sms, email };
}

export const sloGenuineFollowup = inngest.createFunction(
  { id: "slo-genuine-followup", name: "SLO — genuine unpaid follow-up (message 1)" },
  { event: "slo.contact_started" },
  ({ event, step }) => handleM1({ event: event.data, db, step })
);

export const sloGenuineReply = inngest.createFunction(
  { id: "slo-genuine-reply", name: "SLO — genuine follow-up after reply (message 2)" },
  { event: "message.inbound" },
  ({ event, step }) => handleReply({ event: event.data, db, step })
);
