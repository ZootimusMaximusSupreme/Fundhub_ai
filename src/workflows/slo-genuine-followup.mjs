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
import { claimCustomFieldLock, mergeCustomFields } from "./custom-fields.mjs";
import { classifyVisitor } from "../slo/visitor.mjs";
import { SLO_PURPOSE, SLO_SOURCE, sloRoadmapBookUrl } from "../slo/offer.mjs";
import { declinesRoadmap, DISCOUNT_REF_KEY, FIRST_FIVE, FREE_KEY, REPLIED_KEY, SLOT_KEY, discountCheckoutUrl, newDiscountRef } from "../slo/discount-197.mjs";
import { enrollSloDrip } from "../slo/drip-plan.mjs";
import { createTask } from "../lib/create-task.mjs";
import { formatQuestionList } from "../insights/questions.mjs";
import { meetBookingUrl } from "../insights/meet.mjs";

export const SMS_M1_KEY = "SMS-SLO-GENUINE-01";
export const EMAIL_M1_KEY = "EMAIL-SLO-GENUINE-01";
export const SMS_FIRST5_KEY = "SMS-SLO-FIRST5-01";
export const EMAIL_FIRST5_KEY = "EMAIL-SLO-FIRST5-01";
export const SMS_GIFT_KEY = "SMS-SLO-GIFT-01";
export const EMAIL_GIFT_KEY = "EMAIL-SLO-GIFT-01";
export const SMS_COUPON_KEY = "SMS-SLO-COUPON-01";
export const EMAIL_COUPON_KEY = "EMAIL-SLO-COUPON-01";
export const SMS_FIRST5_REPLY_KEY = "SMS-SLO-FIRST5-REPLY";
export const EMAIL_FIRST5_REPLY_KEY = "EMAIL-SLO-FIRST5-REPLY";

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

  const slot = await step.run("assign-text-slot", () => assignTextSlot(db, { orgId, clientId }));
  const smsKey = slot ? SMS_FIRST5_KEY : SMS_GIFT_KEY;
  const emailKey = slot ? EMAIL_FIRST5_KEY : EMAIL_GIFT_KEY;
  const eventId = event.id;
  const sms = await step.run("send-sms-m1", () =>
    sendTemplated(db, {
      orgId, clientId, channel: "sms", templateKey: smsKey, eventId, context: CHRIS
    }));
  const email = await step.run("send-email-m1", () =>
    sendTemplated(db, {
      orgId, clientId, channel: "email", templateKey: emailKey, eventId, context: CHRIS
    }));

  return { done: true, sent: true, clientId, sms, email, slot };
}

/**
 * Free Meet text while fewer than FIRST_FIVE people have both agreed
 * (slo_roadmap_free_at) and booked. Offered-but-unbooked does not consume a seat.
 */
export async function assignTextSlot(db, { orgId, clientId }) {
  const r = await db.query(
    `SELECT count(*)::int AS n
       FROM clients c
      WHERE c.org_id = $1
        AND c.custom_fields->>$2 IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM bookings b
             WHERE b.client_id = c.id
               AND b.org_id = c.org_id
          )
          OR EXISTS (
            SELECT 1 FROM events e
             WHERE e.client_id = c.id
               AND e.org_id = c.org_id
               AND e.name = 'booking.created'
          )
        )`,
    [orgId, FREE_KEY]
  );
  const used = Number(r.rows[0]?.n || 0);
  if (used >= FIRST_FIVE) return null;
  const slot = String(used + 1);
  await mergeCustomFields(db, clientId, { [SLOT_KEY]: slot });
  return slot;
}

async function clientFields(db, clientId) {
  const r = await db.query(
    `SELECT custom_fields FROM clients WHERE id = $1`,
    [clientId]
  );
  return r.rows[0]?.custom_fields || {};
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

export async function handleFirstFiveReply({ event, db, step, clientId, body }) {
  const orgId = event.orgId;
  const eventId = event.id;
  if (declinesRoadmap(body)) {
    await step.run("enroll-drip", () => enrollSloDrip(db, clientId));
    return { done: true, sent: false, reason: "first_five_no_agree", clientId };
  }
  const claimed = await step.run("claim-free", () =>
    claimCustomFieldLock(db, clientId, "slo_roadmap_free_at"));
  if (!claimed) return { done: false, reason: "already_free" };
  const bookUrl = meetBookingUrl() || sloRoadmapBookUrl();
  const context = { ...CHRIS, book_url: bookUrl };
  const sms = await step.run("send-sms-first5-reply", () =>
    sendTemplated(db, {
      orgId, clientId, channel: "sms", templateKey: SMS_FIRST5_REPLY_KEY, eventId, context
    }));
  const email = await step.run("send-email-first5-reply", () =>
    sendTemplated(db, {
      orgId, clientId, channel: "email", templateKey: EMAIL_FIRST5_REPLY_KEY, eventId, context
    }));
  const task = await step.run("task-interview", () =>
    createTask(db, {
      orgId,
      clientId,
      title: "Free roadmap, then the video interview",
      sourceWorkflow: "slo-first-five-interview",
      assigneeRole: "csm",
      eventId,
      meetingUrl: bookUrl,
      body: [
        "They agreed. The roadmap is free.",
        "Do the soft pull on the interview before you hand them the roadmap. That is how we know the file is real.",
        bookUrl
          ? `Then send this Google Meet link: ${bookUrl}`
          : "Then book the Google Meet (INSIGHT_MEET_BOOKING_URL).",
        "Ask these questions and save the answers.",
        formatQuestionList("post"),
        `[event:${eventId}]`
      ].join("\n")
    }));
  return { done: true, sent: true, lane: "free_roadmap", clientId, sms, email, bookUrl, task };
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

  await step.run("mark-replied", () =>
    mergeCustomFields(db, clientId, { [REPLIED_KEY]: new Date().toISOString() }));

  const fields = await step.run("read-lane", () => clientFields(db, clientId));
  if (fields[SLOT_KEY]) {
    return handleFirstFiveReply({
      event, db, step, clientId, body: payload.body
    });
  }

  if (declinesRoadmap(payload.body)) {
    await step.run("enroll-drip-no", () => enrollSloDrip(db, clientId));
    return { done: true, sent: false, reason: "declined", clientId };
  }

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

  const claimed = await step.run("claim-coupon", () =>
    claimCustomFieldLock(db, clientId, LOCK_M2));
  if (!claimed) return { done: false, reason: "already_sent_m2" };

  const orgId = event.orgId;
  const eventId = event.id;
  const ref = newDiscountRef();
  const payUrl = discountCheckoutUrl(ref);
  await step.run("save-coupon-ref", () =>
    mergeCustomFields(db, clientId, { [DISCOUNT_REF_KEY]: ref }));
  const context = { ...CHRIS, pay_url: payUrl };
  const sms = await step.run("send-sms-coupon", () =>
    sendTemplated(db, {
      orgId, clientId, channel: "sms", templateKey: SMS_COUPON_KEY, eventId, context
    }));
  const email = await step.run("send-email-coupon", () =>
    sendTemplated(db, {
      orgId, clientId, channel: "email", templateKey: EMAIL_COUPON_KEY, eventId, context
    }));
  await step.run("enroll-drip", () => enrollSloDrip(db, clientId));

  return { done: true, sent: true, clientId, sms, email, payUrl };
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
