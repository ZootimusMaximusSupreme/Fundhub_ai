// Yesdoor's own timeline (yd_events, spec §2). Every state change writes one row.
// It does not use Fundhub's CANONICAL_EVENTS. Rows are never changed or deleted.
//
// Application stage moves already write their own events from a database trigger
// (435), so the stores here write the OTHER state changes: lead created, consent,
// screening, matches, renter stage and profile, income.
//
// A repeat with the same idempotency key writes nothing the second time, so a
// retried request or a cron that runs twice never doubles the timeline.

/** @param {{query: Function}} db a pool or a transaction client
 *  @returns {Promise<{id: string|null, written: boolean}>} */
export async function recordEvent(db, {
  orgId, name, entityKind, entityId, payload = {}, actorKind = "system", actorId = null, idempotencyKey = null
}) {
  if (!orgId || !name || !entityKind || !entityId) throw new Error("recordEvent needs orgId, name, entityKind and entityId");
  const r = await db.query(
    `INSERT INTO yd_events (org_id, name, entity_kind, entity_id, payload, actor_kind, actor_id, idempotency_key)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
     ON CONFLICT (org_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [orgId, name, entityKind, entityId, JSON.stringify(payload ?? {}), actorKind, actorId, idempotencyKey]
  );
  return { id: r.rows[0]?.id ?? null, written: r.rows.length > 0 };
}
