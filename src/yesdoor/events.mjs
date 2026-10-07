// src/yesdoor/events.mjs — Yesdoor's own timeline (yd_events). Spec §2, §0.5:
// every change writes an event. This is not Fundhub's CANONICAL_EVENTS bus.
//
// Stage moves on yd_applications write their own event from a database trigger
// (435). Everything else, from this file. Both read the actor from the
// transaction-local settings yd.actor_kind / yd.actor_id, which setActor() sets,
// so the same person is on the trigger's rows and on ours.

/** The kinds of actor the yd_events CHECK allows. */
export const ACTOR_KINDS = Object.freeze(["system", "staff", "renter", "building_user", "broker", "sandbox"]);

export const SYSTEM = Object.freeze({ kind: "system", id: null });

/** Put the actor on this transaction (SET LOCAL semantics). A no-op outside one. */
export async function setActor(tx, actor = SYSTEM) {
  await tx.query(
    `SELECT set_config('yd.actor_kind', $1, true), set_config('yd.actor_id', $2, true)`,
    [actor.kind || "system", actor.id || ""]
  );
}

/** A principal from the auth gates, as an actor. */
export function actorOf(who) {
  if (!who) return SYSTEM;
  if (who.kind === "staff") return { kind: "staff", id: who.staffId };
  if (who.kind === "renter") return { kind: "renter", id: who.accountId };
  if (who.kind === "building_user") return { kind: "building_user", id: who.accountId };
  if (who.kind === "broker") return { kind: "broker", id: who.accountId };
  return SYSTEM;
}

/**
 * Write one event. An idempotency key makes a replay a no-op (returns null).
 * `payload` must be a plain object (the CHECK requires it). Never put credit
 * numbers in a payload: events are read by more than credit-cleared staff.
 */
export async function recordEvent(tx, {
  orgId, name, entityKind, entityId, payload = {}, actor = SYSTEM, idempotencyKey = null
}) {
  if (!orgId || !name || !entityKind || !entityId) throw new Error("recordEvent needs orgId, name, entityKind and entityId");
  const r = await tx.query(
    `INSERT INTO yd_events (org_id, name, entity_kind, entity_id, payload, actor_kind, actor_id, idempotency_key)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
     ON CONFLICT (org_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [orgId, name, entityKind, entityId, JSON.stringify(payload || {}), actor.kind || "system", actor.id || null, idempotencyKey]
  );
  return r.rows[0] ? r.rows[0].id : null;
}

/** Queue one message (nothing sends it until the sandbox dispatcher runs). */
export async function queueOutbox(tx, {
  orgId, channel = "email", to, templateKey, context = {}, relatedKind = null, relatedId = null
}) {
  const r = await tx.query(
    `INSERT INTO yd_outbox (org_id, channel, to_address, template_key, context, related_kind, related_id)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id`,
    [orgId, channel, to, templateKey, JSON.stringify(context || {}), relatedKind, relatedId]
  );
  return r.rows[0].id;
}
