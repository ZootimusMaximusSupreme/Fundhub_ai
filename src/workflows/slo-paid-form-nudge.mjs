// Paid the $297 and never submitted the soft-pull form.
//
// The card webhook fires payment.received and the credit check stops, because
// consent is not in yet. The unpaid check-in quits the moment they have paid.
// This job is the one that asks them back.
//
// One message, 15 minutes after the payment, and only if the form is still
// empty. The link is the same one the card page uses to reopen step 3.
// Demo orders, company and test emails, and a form already in send nothing.
// No backfill: only payments that fire after this job is registered.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { sendTemplated } from "./messaging.mjs";
import { claimCustomFieldLock } from "./custom-fields.mjs";
import { classifyVisitor } from "../slo/visitor.mjs";

export const SMS_KEY = "SMS-SLO-PAID-FORM-01";
export const EMAIL_KEY = "EMAIL-SLO-PAID-FORM-01";
export const LOCK = "slo_paid_form_nudge_at";
export const WAIT = "15m";

export const SLO_FORM_PAGE = "https://apply.fundhub.ai/roadmap";

const CHRIS = { sender_name: "Chris", sender: { name: "Chris" } };

/** The address that reopens step 3 for this order. */
export function sloPaidFormUrl(ref, clientId) {
  const q = new URLSearchParams();
  q.set("ref", String(ref));
  q.set("client_id", String(clientId));
  return `${SLO_FORM_PAGE}?${q.toString()}#fhw`;
}

export function isSloDiagnosticDescription(description) {
  return String(description || "").trim().toLowerCase().startsWith("slo diagnostic");
}

function orderIsPaid(row) {
  return row.status === "paid" || row.paid_at != null;
}

/** Real buyer email, or a reason to stay quiet. */
export function gatePersonEmail(email) {
  const addr = String(email || "").trim().toLowerCase();
  if (!addr || !addr.includes("@")) return { ok: false, reason: "no_email" };
  const who = classifyVisitor({ email: addr });
  if (who.actor !== "person") return { ok: false, reason: who.reason || "not_person" };
  return { ok: true, email: addr };
}

/**
 * Why this order must not wait. Null means wait, then look again.
 * A form already in stops here. Unpaid does not: the paid mark can land
 * in the same second as this event.
 */
export function blockBeforeWait(row) {
  if (!row) return "not_slo";
  if (row.is_demo === true) return "demo";
  if (!isSloDiagnosticDescription(row.description)) return "not_slo";
  const who = gatePersonEmail(row.email);
  if (!who.ok) return who.reason;
  if (row.identity_stored_at) return "form_in";
  return null;
}

/** Why this order must not be texted after the wait. Null means send. */
export function blockAfterWait(row) {
  const early = blockBeforeWait(row);
  if (early && early !== "form_in") return early;
  if (!row || !orderIsPaid(row)) return early === "form_in" ? "form_in" : "not_paid";
  if (row.identity_stored_at) return "form_in";
  return null;
}

export async function loadSloPaidOrder(db, { orgId, ref }) {
  if (!orgId || !ref) return null;
  const r = await db.query(
    `SELECT pl.id, pl.client_id, pl.link_ref, pl.description, pl.status, pl.paid_at,
            pl.identity_stored_at, COALESCE(pl.is_demo, false) AS is_demo,
            c.email, c.phone
       FROM payment_links pl
       JOIN clients c ON c.id = pl.client_id
      WHERE pl.org_id = $1::uuid
        AND pl.link_ref = $2
      LIMIT 1`,
    [orgId, String(ref)]
  );
  return r.rows[0] || null;
}

export async function handle({ event, db, step }) {
  const payload = event.payload || {};
  const ref = String(payload.ref || "").trim();
  if (!ref) return { done: false, reason: "not_slo" };

  const orgId = event.orgId;
  const first = await step.run("load-order", () => loadSloPaidOrder(db, { orgId, ref }));
  const early = blockBeforeWait(first);
  if (early) return { done: early === "form_in", sent: false, reason: early };

  await step.sleep("wait-15-min", WAIT);

  const again = await step.run("recheck-order", () => loadSloPaidOrder(db, { orgId, ref }));
  const late = blockAfterWait(again);
  if (late) return { done: true, sent: false, reason: late };

  const clientId = again.client_id;
  const claimed = await step.run("claim-nudge", () => claimCustomFieldLock(db, clientId, LOCK));
  if (!claimed) return { done: false, reason: "already_sent" };

  const formUrl = sloPaidFormUrl(again.link_ref || ref, clientId);
  const context = { ...CHRIS, form_url: formUrl };
  const eventId = event.id;
  const email = await step.run("send-email", () =>
    sendTemplated(db, {
      orgId, clientId, channel: "email", templateKey: EMAIL_KEY, eventId, context
    }));

  let sms = null;
  if (String(again.phone || "").trim()) {
    sms = await step.run("send-sms", () =>
      sendTemplated(db, {
        orgId, clientId, channel: "sms", templateKey: SMS_KEY, eventId, context
      }));
  }

  return { done: true, sent: true, clientId, email, sms, formUrl };
}

export const sloPaidFormNudge = inngest.createFunction(
  { id: "slo-paid-form-nudge", name: "SLO — paid, soft-pull form still empty" },
  { event: "payment.received" },
  ({ event, step }) => handle({ event: event.data, db, step })
);
