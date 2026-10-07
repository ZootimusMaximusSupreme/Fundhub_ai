// yd-touches (hourly) — spec §6, the lifetime path. For every placed renter it
// queues the touches that have come due: move_in_welcome (at move-in), day_30,
// month_6, and lease_end_90 (90 days before the lease ends).
//
// WHAT IS DUE is decided by src/yesdoor/schedule.mjs (pure, tested): only
// applications at moved_in / invoiced / paid / safe, never a refunded or
// cancelled one, never a touch already written.
//
// WHAT THIS WRITES per due touch, in one transaction:
//   yd_touches   the record (unique per application + kind, held by the database)
//   yd_outbox    one queued email to the renter (the sandbox dispatcher marks it
//                sent; nothing is sent from here)
//   yd_events    touch.queued
// A touch whose row already exists is never written twice, so running the cron
// twice, or two crons at once, queues one email, not two.
//
// lease_end_90 does not run the re-check itself: yd-recheck already picks up a
// renter 90 days before the lease ends, on its own schedule.

import { YD_CRON, YD_TEMPLATES } from "../config.mjs";
import { touchesDue } from "../schedule.mjs";
import { recordEvent } from "../events.mjs";
import { withTransaction } from "../tx.mjs";

const PLACED_STAGES = ["moved_in", "invoiced", "paid", "safe"];

async function loadApplications(db, orgId) {
  const r = await db.query(
    `SELECT a.id, a.renter_id, a.stage, a.moved_in_at, to_char(a.lease_end, 'YYYY-MM-DD') AS lease_end
       FROM yd_applications a
      WHERE a.org_id = $1 AND a.stage = ANY($2::text[])
      ORDER BY a.id`, [orgId, PLACED_STAGES]);
  return r.rows.map((x) => ({
    id: x.id, renterId: x.renter_id, stage: x.stage, movedInAt: x.moved_in_at, leaseEnd: x.lease_end
  }));
}

async function loadExistingTouches(db, orgId, applicationIds) {
  if (!applicationIds.length) return [];
  const r = await db.query(
    `SELECT application_id, kind FROM yd_touches WHERE org_id = $1 AND application_id = ANY($2::uuid[])`,
    [orgId, applicationIds]);
  return r.rows.map((x) => ({ applicationId: x.application_id, kind: x.kind }));
}

/** Write one due touch. Returns true when it queued a new one. */
async function queueTouch(db, { orgId, due }) {
  return withTransaction(db, async (tx) => {
    const ins = await tx.query(
      `INSERT INTO yd_touches (org_id, renter_id, application_id, kind, due_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (application_id, kind) WHERE application_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [orgId, due.renterId, due.applicationId, due.kind, due.dueAt]);
    if (!ins.rows[0]) return false;
    const touchId = ins.rows[0].id;

    const who = (await tx.query(
      `SELECT r.email, r.first_name, b.name AS building_name,
              to_char(a.lease_end, 'YYYY-MM-DD') AS lease_end
         FROM yd_applications a
         JOIN yd_renters r ON r.id = a.renter_id AND r.org_id = a.org_id
         JOIN yd_buildings b ON b.id = a.building_id AND b.org_id = a.org_id
        WHERE a.id = $1 AND a.org_id = $2`, [due.applicationId, orgId])).rows[0];

    await tx.query(
      `INSERT INTO yd_outbox (org_id, channel, to_address, template_key, context, related_kind, related_id)
       VALUES ($1,'email',$2,$3,$4::jsonb,'touch',$5)`,
      [orgId, who.email, YD_TEMPLATES.touch[due.kind],
       JSON.stringify({ touch: due.kind, first_name: who.first_name, building_name: who.building_name, lease_end: who.lease_end }),
       touchId]);

    await recordEvent(tx, {
      orgId, name: "touch.queued", entityKind: "touch", entityId: touchId,
      payload: { kind: due.kind, application_id: due.applicationId, renter_id: due.renterId, due_at: due.dueAt },
      actorKind: "system", idempotencyKey: `touch:${due.applicationId}:${due.kind}`
    });
    return true;
  });
}

/**
 * One hourly pass.
 * @returns {Promise<{ ok: boolean, count: number, due: number, queued: number, failed: number, errors: string[] }>}
 */
export async function touchesSweep(db, { orgId, now = new Date(), limit = YD_CRON.touchBatch } = {}) {
  const out = { ok: true, count: 0, due: 0, queued: 0, failed: 0, errors: [] };
  if (!orgId) return { ...out, ok: false, errors: ["orgId required"] };
  let due;
  try {
    const applications = await loadApplications(db, orgId);
    const existingTouches = await loadExistingTouches(db, orgId, applications.map((a) => a.id));
    due = touchesDue({ applications, existingTouches, now });
  } catch (e) {
    return { ...out, ok: false, errors: [String(e?.message || e).slice(0, 300)] };
  }
  out.due = due.length;

  for (const d of due.slice(0, limit)) {
    try {
      if (await queueTouch(db, { orgId, due: d })) out.queued += 1;
    } catch (e) {
      out.failed += 1;
      if (out.errors.length < 5) out.errors.push(`${d.applicationId}/${d.kind}: ${String(e?.message || e).slice(0, 160)}`);
    }
  }
  out.count = out.queued;
  return out;
}
