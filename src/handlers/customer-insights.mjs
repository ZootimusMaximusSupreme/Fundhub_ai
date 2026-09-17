// Three collections: start (existing apply survey), mid accountability call, end-of-service accountability call.
// Google Meet is only for the sales call and the ending interview.
// Mid is a phone / AI reach-out, due at the halfway point of the service.

import { on } from "../events/registry.mjs";
import { createTask } from "../lib/create-task.mjs";
import { resolveClient } from "./client-lifecycle.mjs";
import { formatQuestionList } from "../insights/questions.mjs";
import { isInterviewBooking, meetBookingUrl, RECORDING_NOTE } from "../insights/meet.mjs";

/* The CSM owns every conversation after the sale (db/migrations/290_csm_role.sql,
   owner-set 2026-09-05). This was the funding advisor, which is why the check-in
   and the interview kept losing to funding work: the advisor's job is to get the
   file funded, and a "how is it going" call is always the thing that slips.
   Moving the constant moves both tasks — the mid check-in and the post
   interview — because both read it. */
export const ASSIGNEE_ROLE = "csm";
/* HALFWAY THROUGH THE SERVICE, which is what Chris asked for (2026-09-05) and
   is not what this was.

   It was 7. A week after somebody pays, nothing has happened yet — the pull may
   not be back, the first round may not have gone out — so "how is it going"
   had no answer and the call was really a welcome call wearing the wrong name.

   WHY A NUMBER AND NOT A COMPUTED MIDPOINT. The obvious version is
   `contracts.signed_at + term_days/2`. It cannot be built: `term_days` is a
   merge value for rendering one template's sentence, nothing in src/ or api/
   ever writes it to a contract, and 287 deliberately MOVED how long the work
   runs out of this catalogue and into the agreement text Chris supplies
   ("Neither was ever a number this catalogue owns" — src/config/offers.mjs).
   Measured 2026-09-05 on a database with every migration applied: zero
   contracts carry a term. A midpoint computed from absent data is a guess with
   a formula wrapped around it.

   So: 90 days, the midpoint of the 180-day term that is the only program
   length actually stated anywhere in this repo
   (REPAIR-AND-FUNDING-AGREEMENT). One number, one place, change it here. */
export const MID_DUE_DAYS = 90;

export const SOURCE_WORKFLOW = "customer-insights-post";
/* ACCOUNTABILITY CALL, not "interview". Chris's word, 2026-09-05, and it is the
   honest one: the CSM holds the client accountable to their own progress,
   gathers what they say, and nudges toward the next product. Naming it an
   interview when money and an offer also come up is the part that would need
   defending later; naming it what it is does not. */
export const TASK_TITLE = "Accountability call — results and what's next";

export const MID_SOURCE_WORKFLOW = "customer-insights-mid";
export const MID_TASK_TITLE = "Accountability call — halfway check-in";

export function interviewTaskBody(eventId, env = process.env) {
  const questions = formatQuestionList("post");
  const bookUrl = meetBookingUrl(env);
  const lines = [
    bookUrl
      ? `Send the client this booking link (Google Meet is created when they book): ${bookUrl}`
      : "Book a Google Meet (set INSIGHT_MEET_BOOKING_URL on Netlify).",
    "Click Record in Google Meet. Ask these questions, then save the answers on the CSM queue (/app/csm-queue.html) — open this row and fill in the form.",
    RECORDING_NOTE,
    "",
    /* Owner-set 2026-09-05, after the Cole Gordon research. One call, and the
       answers are the point of it. The CSM is paid 10% on upsells and nothing
       on collections, deliberately: a rep paid to collect leans on the client
       mid-conversation, and a rep paid on the next sale is motivated to make
       this one work first.

       So the offer is a NUDGE, not a pitch — Chris's words, "nothing too crazy,
       just pushes and nudges". A client can be sold another product while still
       halfway through this one; do not wait for the current service to finish.
       What they already own is on the CSM queue, so this task does not repeat
       facts that go stale before anyone reads it. */
    "THEN, once you have their answers:",
    "  Nudge, do not pitch. If they are in a good place, mention what they do not",
    "  already have. Being mid-service is not a reason to hold off.",
    "The answers are the reason this call exists. The offer rides along.",
    "",
    questions,
    "",
    `[event:${eventId}]`
  ];
  return lines.join("\n");
}

export function checkinTaskBody(eventId) {
  const questions = formatQuestionList("mid");
  return [
    "Call them (phone or AI reach-out). This is not a Google Meet.",
    "An accountability call: how are they doing against what they came here for.",
    "Ask these questions, then save the answers on the CSM queue (/app/csm-queue.html) — open this row and fill in the form.",
    "If they are in a good place, nudge toward what they do not already have. A nudge, not a pitch.",
    "",
    questions,
    "",
    `[event:${eventId}]`
  ].join("\n");
}

function dueInDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function onRoundFundedInsights(event, db, env = process.env) {
  const clientId = await resolveClient(db, event);
  if (!clientId) return { created: false, reason: "no_client" };

  const eventId = event.id || null;
  const bookUrl = meetBookingUrl(env);
  return createTask(db, {
    orgId: event.orgId,
    clientId,
    title: TASK_TITLE,
    sourceWorkflow: SOURCE_WORKFLOW,
    assigneeRole: ASSIGNEE_ROLE,
    eventId,
    body: interviewTaskBody(eventId, env),
    meetingUrl: bookUrl,
    /* DUE THE DAY FUNDING LANDS, because the task's own first instruction is
       "send the client this booking link" and that is work for today. No
       post-funding interval is written down anywhere in this repo to borrow —
       searched src/, scripts/, db/ and docs/, there is no POST_DUE_DAYS and no
       spec line — so this deliberately does not invent one. Without a date the
       row fell into the calendar's "No date" pile and nobody ever saw it
       (live walk 2026-09-17, GAP 36). onInterviewBooked below overwrites with
       `due_at = COALESCE($4, due_at)`, so the real meeting time wins the moment
       the client books. */
    dueAt: new Date(),
    /* ONE RESULTS CALL PER CLIENT, matching onPaidMidCheckin below.
       The default dedupe key is the event id, which is embedded in the body as
       `[event:...]` — so two round.funded events produce two different bodies,
       two different keys and two identical open calls. That is exactly what
       Sim Eight-Funding had. Keying on the title is what the mid check-in has
       always done.

       KNOWN AND ACCEPTED: createTask's title dedupe does not filter on
       done=false, so once a CSM ticks this off, a later second funding for the
       same client is also suppressed. The halfway task already behaves that
       way; changing it means editing src/lib/create-task.mjs, which nineteen
       other workflows share. */
    dedupeOn: "title"
  });
}

export async function onPaidMidCheckin(event, db) {
  const clientId = await resolveClient(db, event);
  if (!clientId) return { created: false, reason: "no_client" };

  const eventId = event.id || null;
  return createTask(db, {
    orgId: event.orgId,
    clientId,
    title: MID_TASK_TITLE,
    sourceWorkflow: MID_SOURCE_WORKFLOW,
    assigneeRole: ASSIGNEE_ROLE,
    eventId,
    body: checkinTaskBody(eventId),
    dueAt: dueInDays(MID_DUE_DAYS),
    dedupeOn: "title"
  });
}

export async function onInterviewBooked(event, db) {
  const p = event.payload || {};
  if (!p.meetingUrl) return { updated: false, reason: "no_meeting_url" };
  if (!isInterviewBooking(p)) return { updated: false, reason: "not_interview" };

  const clientId = await resolveClient(db, event);
  if (!clientId) return { updated: false, reason: "no_client" };

  const upd = await db.query(
    `UPDATE tasks
        SET meeting_url = $3,
            due_at = COALESCE($4, due_at),
            updated_at = now()
      WHERE client_id = $1 AND source_workflow = $2
      RETURNING id`,
    [clientId, SOURCE_WORKFLOW, p.meetingUrl, p.startTime || null]
  );
  return { updated: Boolean(upd.rows[0]), id: upd.rows[0]?.id || null };
}

export function register() {
  on("round.funded", onRoundFundedInsights);
  /* ALL THREE MONEY-IN EVENTS, not two. `payment.received` is emitted for every
     successful payment (src/adapters/commas.mjs) and was the only one missing
     here, so repair, trial and academy clients paid and no halfway call was
     ever created for them — only the deposit/close shaped sales got one (live
     walk 2026-09-17, GAP 35).

     The trio is already treated as one set elsewhere: ROUTED_EVENTS in
     src/handlers/purchase-routing.mjs is these same three names, and
     src/workflows/repair-enrollment.mjs lists them too. Keep them together.
     onPaidMidCheckin dedupes on title, so a client who pays a deposit AND an
     installment still gets exactly one halfway task. */
  on("deposit.paid", onPaidMidCheckin);
  on("sale.closed", onPaidMidCheckin);
  on("payment.received", onPaidMidCheckin);
  on("booking.created", onInterviewBooked);
}

export default register;
