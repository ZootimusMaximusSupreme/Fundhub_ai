// S-DOC-REMIND — the documents request, chased on day 1, 3 and 5.
// W8 on Chris's list (2026-10-04): "Credit-optimization doc reminders: texts on
// day 1, 3 and 5 until documents are uploaded."
//
// The request itself is src/workflows/s-doc-collection.mjs: on deposit.paid it
// queues EMAIL-/SMS-DOC-01-REQUEST once (lock doc_01_request_sent_at) and puts
// the client on the documents hold. doc-check only runs after an upload
// (docs.received), so before this file nothing chased a client who never sent
// anything at all.
//
// SAME TRIGGER AS THE REQUEST, so day 1 is counted from the moment it goes out.
// Sleep, check, text — three times. Before each text it checks, fresh:
//   1. the request really went out — a DOC-01 message is on file. The same
//      "already asked" test src/handlers/inquiry-docs.mjs uses.
//   2. nothing has been uploaded — the same rule the client portal uses to tick
//      "documents received" (src/portal/stepper.mjs): a client_upload document,
//      or a docs.received / repair.docs.complete event on their record.
//   3. the client is still on the documents hold — round_hold_reason is
//      "Documents Pending Approval", which s-doc-collection sets and doc-check
//      clears. A client whose hold says anything else is at another step and
//      gets nothing.
// Any "no" ends the run. Nothing after it is sent.
//
// AN UPLOAD STOPS IT TWICE. cancelOn ends the run the moment docs.received
// arrives for the same client. The fresh check covers what cancelOn cannot see:
// an event with no client id on it, an upload that landed before the run
// started, a file staff filed for the client.
//
// NEVER CHECKED IN QUIET HOURS. A text queued at 9pm waits in the queue until
// 8am (src/messaging/dispatch.mjs), so a client who uploads at 10pm would still
// read "we still need your documents" at 8am. A wake inside quiet hours sleeps
// until they end FIRST, and the check runs after that, right before the text is
// queued. Same wait the Josh setter uses (src/workflows/ai-set-01-josh-setter.mjs).
//
// IT ONLY QUEUES. sendTemplated writes a queued row and checks opt-out; the
// dispatcher puts that row through the messaging gate (opt-out again, quiet
// hours) at the moment of sending. Nothing here talks to a provider.
//
// ONCE PER CLIENT, NOT ONCE PER EVENT. The idempotency key is the client, so a
// second deposit.paid, a replay, or two runs at once can never text the same
// reminder twice: the messages unique index (org_id, provider_ref) refuses the
// second row.
//
// The words live in db/seed/037_doc_reminder_texts.sql. Without that file every
// send is a template_pending no-op.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { resolveClient } from "../handlers/client-lifecycle.mjs";
import { sendTemplated } from "./messaging.mjs";
import { alreadySentDoc01 } from "../handlers/inquiry-docs.mjs";
import { FUNDING_DOC_HOLD } from "../inquiry-ops/doc-gate.mjs";
import { inQuietHours, recipientSkipsQuietHours } from "../messaging/gate.mjs";
import { nextQuietHoursEnd } from "../messaging/dispatch.mjs";

/* Day 1, 3 and 5 after the request. `wait` is the sleep since the step before
   it, so the three add up to 1, 3 and 5 days. */
export const REMINDERS = Object.freeze([
  Object.freeze({ day: 1, wait: "1d", templateKey: "SMS-DOC-REMIND-DAY1" }),
  Object.freeze({ day: 3, wait: "2d", templateKey: "SMS-DOC-REMIND-DAY3" }),
  Object.freeze({ day: 5, wait: "2d", templateKey: "SMS-DOC-REMIND-DAY5" })
]);

/** True when anything has been uploaded for this client. Same rule as the
    portal's "documents received" tick (src/portal/stepper.mjs). A failed read
    throws, so the step retries and no text goes out on a guess. */
export async function documentsUploaded(database, { orgId, clientId }) {
  const { rows } = await database.query(
    `SELECT EXISTS (
              SELECT 1 FROM documents
               WHERE org_id = $1 AND client_id = $2 AND kind = 'client_upload'
            )
         OR EXISTS (
              SELECT 1 FROM events
               WHERE org_id = $1 AND client_id = $2
                 AND name IN ('docs.received', 'repair.docs.complete')
            ) AS uploaded`,
    [orgId, clientId]
  );
  return rows[0]?.uploaded === true;
}

/** Why this client must not get a reminder now, or null when they should. */
export async function whyStop(database, { orgId, clientId }) {
  if (!(await alreadySentDoc01(database, clientId))) return "never_asked";
  if (await documentsUploaded(database, { orgId, clientId })) return "uploaded";
  const r = await database.query(`SELECT custom_fields FROM clients WHERE id = $1`, [clientId]);
  if (r.rows[0]?.custom_fields?.round_hold_reason !== FUNDING_DOC_HOLD) return "not_on_doc_hold";
  return null;
}

export async function handle({ event, db: database, step, now = () => new Date() }) {
  const clientId = await step.run("resolve-client", () => resolveClient(database, event));
  if (!clientId) return { done: false, reason: "no_client" };
  const orgId = event.orgId;
  if (!orgId) return { done: false, reason: "no_org" };

  const sent = [];
  for (const r of REMINDERS) {
    await step.sleep(`wait-day-${r.day}`, r.wait);

    // Memoized, so a replay after 8am does not schedule a second wait.
    const wakeAt = await step.run(`quiet-hours-wake-day-${r.day}`, async () => {
      if (await recipientSkipsQuietHours(database, clientId)) return null;
      const when = now();
      if (!inQuietHours(when)) return null;
      return nextQuietHoursEnd(when).toISOString();
    });
    if (wakeAt) await step.sleepUntil(`wait-quiet-hours-day-${r.day}`, new Date(wakeAt));

    const stop = await step.run(`check-day-${r.day}`, () => whyStop(database, { orgId, clientId }));
    if (stop) return { done: true, stopped: stop, atDay: r.day, sent };

    const res = await step.run(`send-day-${r.day}`, () =>
      sendTemplated(database, {
        orgId, clientId, channel: "sms", templateKey: r.templateKey,
        eventId: `doc-remind:${clientId}`
      }));
    sent.push({ day: r.day, templateKey: r.templateKey, ...res });
    if (res?.reason === "opted_out") return { done: true, stopped: "opted_out", atDay: r.day, sent };
  }

  return { done: true, stopped: null, sent };
}

export const sDocReminders = inngest.createFunction(
  {
    id: "s-doc-reminders",
    name: "S-DOC-REMIND — Document Reminder Texts (day 1, 3, 5)",
    cancelOn: [
      {
        event: "docs.received",
        if: "event.data.clientId != null && event.data.clientId == async.data.clientId"
      }
    ]
  },
  { event: "deposit.paid" },
  ({ event, step }) => handle({ event: event.data, db, step })
);
