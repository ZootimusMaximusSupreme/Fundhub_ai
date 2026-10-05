// Meta ShowedCall — the server tells Meta a person showed for a sales call (K3).
//
// Contract: the "Server-only events" section of docs/tracking/meta-events.md.
// Lead and Schedule start in the browser and reach Meta through the map in
// src/meta/map.mjs. ShowedCall has no browser side — a closer logs the call in
// the CRM — so it goes the way the server Purchase does
// (src/handlers/meta-purchase.mjs): one bus handler, the one sender
// (src/messaging/providers/meta-capi.mjs, sendMetaEvents, behind the
// META_CAPI_ENABLED switch), the result written on the event row.
//
// ── WHO FIRES IT ────────────────────────────────────────────────────────────
// The "showed" rule (src/sales/call-outcomes.mjs, owner-set 2026-10-05), from
// the one place a person says what happened: a closer log. call.completed with
// disposition "closer" and outcome Deposit, Downsell, Callback or Not a fit.
// Never a closer's "No show", never an AI-setter (Bland) call, never the
// calendar. One ShowedCall per closer log, so a second held call is a second
// ShowedCall — the way Schedule counts every booking.
//
// ── WHAT GOES TO META ───────────────────────────────────────────────────────
// event_name ShowedCall (custom), event_id "showed.<closer log id>",
// action_source "system_generated" (no web session behind it), no custom_data.
// user_data: SHA-256 email and phone, external_id = SHA-256 of our client id,
// and the fbc / fbp kept on the client (src/ads/meta-match.mjs). Never a raw
// email or phone, and nothing from the call itself.
//
// ── WHO IS SKIPPED ──────────────────────────────────────────────────────────
// Demo clients (clients.is_demo) and agents: company / test emails
// (src/slo/visitor.mjs). A client with no email and no phone.
//
// ── IT NEVER BREAKS A SAVE ──────────────────────────────────────────────────
// It runs on the bus after the closer's row is saved. It never throws: a
// sender failure, a missing row or a database error is caught and written on
// the event row as payload.meta — the same place the Purchase and the funnel
// sends write theirs, which is what the morning systems check reads
// (src/pulse/system-checks.mjs). A replay of an event already sent sends nothing.

import { on } from "../events/registry.mjs";
import { isShowedOutcome } from "../sales/call-outcomes.mjs";
import { cleanMetaEventId } from "../meta/map.mjs";
import { clientMetaClickIds } from "../ads/meta-match.mjs";
import { classifyVisitor } from "../slo/visitor.mjs";
import { purchaseUserData, RECORD_META_SQL } from "./meta-purchase.mjs";
import { sendMetaEvents } from "../messaging/providers/meta-capi.mjs";

export const SHOWED_CALL_EVENT = "ShowedCall";

/** Is this bus event a closer log that says the client showed? Pure, no reads. */
export function showedCallTrigger(name, payload) {
  const p = payload || {};
  return name === "call.completed" && p.disposition === "closer" && isShowedOutcome(p.outcome);
}

/** "showed.<closer log id>" (the event's own id for an older event without one), or null. */
export function showedCallEventId(payload, eventId) {
  const ref = payload?.callOutcomeId || eventId;
  return ref ? cleanMetaEventId(`showed.${ref}`) : null;
}

async function loadClient(db, { orgId, clientId }) {
  if (!orgId || !clientId) return null;
  const { rows } = await db.query(
    `SELECT id, email, phone, is_demo, custom_fields
       FROM clients WHERE org_id = $1::uuid AND id = $2::uuid LIMIT 1`,
    [orgId, clientId]
  );
  return rows[0] || null;
}

async function record(db, eventId, note) {
  if (!eventId) return;
  try {
    await db.query(RECORD_META_SQL, [JSON.stringify({ meta: note }), eventId]);
  } catch (err) {
    console.error("meta-showed-call: result not recorded —", err?.message || err);
  }
}

/* The closer log → one Meta event, or { skip }. */
async function planShowedCall(db, event, deps) {
  const p = event.payload || {};
  const client = await loadClient(db, { orgId: event.orgId, clientId: event.clientId || p.clientId || null });
  if (!client) return { skip: "client_missing" };
  if (client.is_demo === true) return { skip: "demo_client" };
  const email = client.email || null;
  if (!email && !client.phone) return { skip: "no_user_data" };
  if (email && classifyVisitor({ email }).actor !== "person") return { skip: "agent" };
  const eventId = showedCallEventId(p, event.id);
  if (!eventId) return { skip: "no_event_id" };
  const kept = clientMetaClickIds(client.custom_fields);
  return {
    metaEvent: {
      event_name: SHOWED_CALL_EVENT,
      event_time: Math.floor((deps.now ? deps.now() : Date.now()) / 1000),
      event_id: eventId,
      action_source: "system_generated",
      user_data: purchaseUserData({
        email,
        phone: client.phone || null,
        clientId: client.id,
        fbc: kept.fbc,
        fbp: kept.fbp
      })
    }
  };
}

/**
 * The bus handler, on call.completed. Never throws.
 * deps: sendMetaEvents (stand-in sender), env, fetchImpl, now.
 * → { sent, ok?, skip?, event_id? } — what was decided, for tests and logs.
 */
export async function onCallCompletedForMeta(event, db, deps = {}) {
  try {
    if (!showedCallTrigger(event?.name, event?.payload)) return { sent: false, skip: "not_a_trigger" };
    if (event.payload?.meta?.ok === true && Number(event.payload.meta.sent) > 0) {
      return { sent: false, skip: "already_sent" };
    }

    const plan = await planShowedCall(db, event, deps);
    const at = new Date(deps.now ? deps.now() : Date.now()).toISOString();
    if (plan.skip) {
      await record(db, event.id, { event_name: SHOWED_CALL_EVENT, skipped: plan.skip, at });
      return { sent: false, skip: plan.skip };
    }

    const send = deps.sendMetaEvents || sendMetaEvents;
    let result;
    try {
      result = await send([plan.metaEvent], {
        env: deps.env || process.env,
        db,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
      });
    } catch (err) {
      result = { ok: false, sent: 0, error: String(err?.message || err).slice(0, 300) };
    }
    const note = {
      event_name: SHOWED_CALL_EVENT,
      event_id: plan.metaEvent.event_id,
      outcome: event.payload.outcome,
      ok: result?.ok === true,
      sent: Number(result?.sent) || 0,
      at
    };
    if (result?.skipped) note.skipped = result.skipped;
    if (result?.error) note.error = String(result.error).slice(0, 300);
    await record(db, event.id, note);
    return { sent: note.sent > 0, ok: note.ok, event_id: note.event_id, error: note.error };
  } catch (err) {
    console.warn(`meta-showed-call: not sent — ${String(err?.message || err).slice(0, 200)}`);
    return { sent: false, skip: "error" };
  }
}

/* A literal on() call: scripts/diagrams/extract.mjs reads registrations off the source. */
export function register() {
  on("call.completed", onCallCompletedForMeta);
}
