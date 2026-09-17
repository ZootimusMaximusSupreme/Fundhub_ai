// Document collection after deposit. Spec 4.6 (2026-08-22).
// On deposit.paid: request docs and close the funding gate until GHL-DOC accepts.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { resolveClient } from "../handlers/client-lifecycle.mjs";
import { sendTemplated } from "./messaging.mjs";
import { mergeCustomFields, claimCustomFieldLock } from "./custom-fields.mjs";
import { addTags } from "./tags.mjs";
import { FUNDING_DOC_HOLD } from "../inquiry-ops/doc-gate.mjs";

export const EMAIL_TEMPLATE_KEY = "EMAIL-DOC-01-REQUEST";
export const SMS_TEMPLATE_KEY = "SMS-DOC-01-REQUEST";
export const LOCK_FIELD = "doc_01_request_sent_at";

/* CLOSING THE FUNDING GATE AND SENDING ONE MESSAGE ARE TWO DIFFERENT JOBS, SO
   THEY GET TWO DIFFERENT LOCKS.

   LOCK_FIELD above is SHARED on purpose with src/handlers/inquiry-docs.mjs,
   which sends the same "send us your documents" message on inquiry.docs.needed.
   One lock, one message — a client must never be asked twice.

   But that handler does NOT close the funding gate, and this one claimed the
   shared lock BEFORE writing the gate. So whichever path ran first silenced the
   other completely, and if the inquiry path won, the gate was never closed at
   all.

   Measured 2026-09-16 on client d682c13b (Sim Eight-Funding): the inquiry path
   won the race at 17:46:53, the message went out, and clients.custom_fields
   never got a round_hold_reason. "On Hold Because" on the Client Control Panel
   read a dash on a client who was on hold, and the funding gate that should
   have blocked the round never blocked anything.

   The gate now has its own one-shot lock, claimed and released independently of
   the send. It stays one-shot: a replay of deposit.paid must not re-close a gate
   that src/handlers/doc-check.mjs has since cleared. */
export const GATE_LOCK_FIELD = "doc_gate_closed_at";

export async function handle({ event, db, step }) {
  const clientId = await step.run("resolve-client", () => resolveClient(db, event));
  if (!clientId) return { done: false, reason: "no_client" };

  /* The gate first, under its own lock — see GATE_LOCK_FIELD. This has to come
     before the send lock is claimed, or losing the shared send race takes the
     funding gate down with it. */
  const gateClaimed = await step.run("claim-doc-gate", () =>
    claimCustomFieldLock(db, clientId, GATE_LOCK_FIELD));
  if (gateClaimed) {
    await step.run("set-doc-gate", () => mergeCustomFields(db, clientId, {
      round_hold_reason: FUNDING_DOC_HOLD,
      employee_next_action: "Collect Documents"
    }));
    await step.run("tag-docs-missing", () => addTags(db, clientId, ["docs:missing"]));
  }

  const claimed = await step.run("claim-doc-request", () =>
    claimCustomFieldLock(db, clientId, LOCK_FIELD));
  if (!claimed) return { done: false, reason: "already_locked", gate: gateClaimed };

  const orgId = event.orgId;
  const eventId = event.id;

  const email = await step.run("send-email", () =>
    sendTemplated(db, { orgId, clientId, channel: "email", templateKey: EMAIL_TEMPLATE_KEY, eventId }));
  const sms = await step.run("send-sms", () =>
    sendTemplated(db, { orgId, clientId, channel: "sms", templateKey: SMS_TEMPLATE_KEY, eventId }));

  return { done: true, email, sms };
}

export const sDocCollection = inngest.createFunction(
  { id: "s-doc-collection", name: "S-DOC — Document Collection Request" },
  { event: "deposit.paid" },
  ({ event, step }) => handle({ event: event.data, db, step })
);
