// DPC-02 — Call Outcome Enforcement + Call Held.
// Source: the CRM system map DECISION & PROGRESS CONTROL section.
// Trigger: booking.created or booking.rescheduled. Waits until 5 minutes after the
// appointment's end time, then asks the "showed" rule (src/sales/call-outcomes.mjs,
// owner-set 2026-10-05): did a closer log Deposit, Downsell, Callback or Not a fit
// for this client at or after this call's booked start? Showed moves the sales
// card to "showed" and records call_held; anything else is a no-show, which tags
// call:no_show, moves the card to "lost" and emits booking.noshow (S-05A's no-show
// texts).
//
// What does NOT count as showed, and why (this used to be "any call.completed
// ever", which counted all three):
//   - a closer logging "No show" (it also emits call.completed);
//   - an AI-setter (Bland) call — AI-SET-01 dials right after the booking to
//     confirm it, so that call ends before the meeting starts;
//   - a log from an older call — only logs at or after this call's start count.
//
// Cancelled or moved (owner-set 2026-10-05): the run stops when the booking is
// cancelled or moved — the same cancelOn S-04B and BS-01 use — and a move starts
// a fresh run that waits for the NEW end time. A cancelled call is never a no-show.
//
// Late closer log (owner-set 2026-10-05): a closer can log after the 5-minute check.
// DPC-02 — Late Show (below) undoes the no-show when that happens: the card goes
// back to "showed" and the no-show tag comes off. S-05A stops its remaining texts
// on the same rule before each send.
//
// Stage mapping (logged in workflow-migration-table.md): db/seed/002_pipelines.sql's
// sales pipeline has no distinct "no_show" stage (the CRM's "S4 No Show") — mapped
// to the closest existing stage, "lost", rather than inventing a new seed row. Also
// folds in S-05 (No Show) and merges DPC-04's decision-related actions where they
// overlap.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { emit } from "../events/bus.mjs";
import { resolveClient } from "../handlers/client-lifecycle.mjs";
import { closerLoggedShowed, isShowedOutcome } from "../sales/call-outcomes.mjs";
import { mergeCustomFields } from "./custom-fields.mjs";
import { moveCardToStage } from "./cards.mjs";
import { addTags, removeTags } from "./tags.mjs";

// Exported because BS-01's pre-call drip gates on the same question ("has the call
// been held?") and this workflow owns the concept — better one definition than two
// copies of the same SQL drifting apart. The rule itself lives in
// src/sales/call-outcomes.mjs. `since` is the call's booked start; without it a
// closer log at any time counts (BS-01 asks it that way).
export async function callHappened(db, clientId, { since = null } = {}) {
  return closerLoggedShowed(db, { clientId, since });
}

export async function handle({ event, db, step }) {
  const clientId = await step.run("resolve-client", () => resolveClient(db, event));
  if (!clientId) return { done: false, reason: "no_client" };

  const endTime = event.payload?.endTime ?? event.payload?.startTime;
  if (!endTime) return { done: false, reason: "no_appointment_time" };
  const wakeAt = new Date(new Date(endTime).getTime() + 5 * 60 * 1000);
  await step.sleepUntil("wait-until-5-min-after-end", wakeAt);

  const since = event.payload?.startTime ?? null;
  const showed = await step.run("check-call-happened", () => callHappened(db, clientId, { since }));
  const orgId = event.orgId;

  if (showed) {
    await step.run("set-call-outcome-showed", () => mergeCustomFields(db, clientId, { call_outcome: "showed", last_progress_action: "call_held" }));
    const card = await step.run("move-to-showed", () => moveCardToStage(db, { orgId, clientId, pipelineKey: "sales", stageKey: "showed" }));
    return { done: true, outcome: "showed", card };
  }

  await step.run("set-call-outcome-no-show", () => mergeCustomFields(db, clientId, { call_outcome: "no_show" }));
  await step.run("tag-no-show", () => addTags(db, clientId, ["call:no_show"]));
  const card = await step.run("move-to-no-show", () => moveCardToStage(db, { orgId, clientId, pipelineKey: "sales", stageKey: "lost" }));
  // Live detector: emit booking.noshow so S-05A can start. The booked end time is in
  // the key, so a moved call that is missed again is its own no-show.
  const payload = event.payload || {};
  await step.run("emit-booking-noshow", () =>
    emit(db, "booking.noshow", payload, {
      orgId,
      clientId,
      idempotencyKey: `dpc-02:${payload.bookingUid || event.id}:${endTime}:booking.noshow`
    })
  );
  return { done: true, outcome: "no_show", card };
}

export const dpc02CallOutcomeEnforcement = inngest.createFunction(
  {
    id: "dpc-02-call-outcome-enforcement",
    name: "DPC-02 — Call Outcome Enforcement",
    cancelOn: [
      {
        event: "booking.rescheduled",
        if: "event.data.payload.email != null && event.data.payload.email == async.data.payload.email"
      },
      {
        event: "booking.rescheduled",
        if: "event.data.payload.bookingUid != null && event.data.payload.bookingUid == async.data.payload.bookingUid"
      },
      {
        event: "booking.cancelled",
        if: "event.data.payload.bookingUid != null && event.data.payload.bookingUid == async.data.payload.bookingUid"
      },
      {
        event: "booking.cancelled",
        if: "event.data.payload.email != null && event.data.payload.email == async.data.payload.email"
      }
    ]
  },
  [{ event: "booking.created" }, { event: "booking.rescheduled" }],
  ({ event, step }) => handle({ event: event.data, db, step })
);

// ── DPC-02 — Late Show ──────────────────────────────────────────────────────
// A closer logs Deposit, Downsell, Callback or Not a fit AFTER the 5-minute check
// already called it a no-show. Only then (call_outcome still reads "no_show"):
// call_outcome goes back to "showed", the call:no_show tag comes off, and the sales
// card moves from "lost" back to "showed". A card that has already moved on from
// "lost" stays where it is. Anything else is left alone: a log that lands before
// the check is DPC-02's own showed branch, and a client who has booked again reads
// "booked", not "no_show".

const CURRENT_STAGE_SQL =
  `SELECT ps.key AS stage_key, ps.sort_order
     FROM cards c
     JOIN pipeline_stages ps ON ps.id = c.stage_id
     JOIN pipelines p ON p.id = c.pipeline_id
    WHERE c.client_id = $1 AND p.key = $2 AND p.org_id = $3
    LIMIT 1`;

async function lateShowState(db, { orgId, clientId }) {
  const c = await db.query(`SELECT custom_fields, tags FROM clients WHERE id = $1`, [clientId]);
  const fields = c.rows[0]?.custom_fields || {};
  const s = await db.query(CURRENT_STAGE_SQL, [clientId, "sales", orgId]);
  return { callOutcome: fields.call_outcome ?? null, salesStage: s.rows[0]?.stage_key ?? null };
}

export async function handleLateShow({ event, db, step }) {
  const p = event.payload || {};
  if (p.disposition !== "closer") return { done: false, reason: "not_a_closer_log" };
  if (!isShowedOutcome(p.outcome)) return { done: false, reason: "not_showed" };

  const clientId = await step.run("resolve-client", () => resolveClient(db, event));
  if (!clientId) return { done: false, reason: "no_client" };
  const orgId = event.orgId;

  const state = await step.run("read-no-show-state", () => lateShowState(db, { orgId, clientId }));
  if (state.callOutcome !== "no_show") return { done: false, reason: "not_marked_no_show" };

  await step.run("set-call-outcome-showed", () => mergeCustomFields(db, clientId, { call_outcome: "showed", last_progress_action: "call_held" }));
  await step.run("untag-no-show", () => removeTags(db, clientId, ["call:no_show"]));
  if (state.salesStage !== "lost") {
    return { done: true, outcome: "showed", late: true, card: { moved: false, reason: "card_not_on_lost", stageKey: state.salesStage } };
  }
  const card = await step.run("move-to-showed", () => moveCardToStage(db, { orgId, clientId, pipelineKey: "sales", stageKey: "showed" }));
  return { done: true, outcome: "showed", late: true, card };
}

export const dpc02LateShow = inngest.createFunction(
  { id: "dpc-02-late-show", name: "DPC-02 — Late Show (closer logged after the no-show check)" },
  { event: "call.completed" },
  ({ event, step }) => handleLateShow({ event: event.data, db, step })
);

// Two functions in one module: the journey runner (src/journeys/runner/registry.mjs)
// finds each one's handler here by function id.
export const handlers = {
  "dpc-02-call-outcome-enforcement": handle,
  "dpc-02-late-show": handleLateShow
};
