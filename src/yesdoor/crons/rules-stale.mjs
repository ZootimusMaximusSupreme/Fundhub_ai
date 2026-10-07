// yd-rules-stale (daily) — spec §6. A signed or live building whose CURRENT rules
// were last confirmed more than rulesStaleDays (30) ago (or never) is flagged, and
// its leasing contact gets ONE re-confirm email.
//
// WHICH BUILDINGS is decided by src/yesdoor/schedule.mjs (pure, tested).
//
// ONE FLAG AND ONE EMAIL PER STALE EPISODE, NOT PER DAY. An episode is one rules
// version at one confirmation date: when the building confirms again (or posts a
// new version) the episode ends, and if it goes stale again that is a new episode
// with a new email. Within an episode:
//   - the yd_events row `building.rules_stale` is written once (idempotency key)
//   - the re-confirm email is queued once: a per-building advisory lock makes the
//     "already queued since the last confirmation?" check safe against two runs
//     at the same moment
// The cron changes NOTHING about the building or its rules (spec §5: rules never
// change automatically). The matcher already caps a stale building's answers at
// "likely"; this only asks the building to confirm.

import { YD_CRON, YD_TEMPLATES } from "../config.mjs";
import { buildingsWithStaleRules } from "../schedule.mjs";
import { recordEvent } from "../store/events.mjs";
import { withTransaction } from "../store/tx.mjs";

/** Signed/live buildings with their CURRENT (newest version) rules. */
async function loadBuildings(db, orgId) {
  const r = await db.query(
    `SELECT b.id, b.status, b.name, b.leasing_email,
            r.id AS rules_id, r.version, r.confirmed_at, r.created_at AS rules_created_at
       FROM yd_buildings b
       JOIN LATERAL (
         SELECT id, version, confirmed_at, created_at FROM yd_building_rules x
          WHERE x.building_id = b.id AND x.org_id = b.org_id
          ORDER BY x.version DESC LIMIT 1
       ) r ON true
      WHERE b.org_id = $1 AND b.status IN ('signed', 'live')
      ORDER BY b.id`, [orgId]);
  return r.rows;
}

async function flagOne(db, { orgId, stale, building }) {
  return withTransaction(db, async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`yd-rules-stale:${building.id}`]);

    const confirmedKey = building.confirmed_at ? new Date(building.confirmed_at).toISOString() : "never";
    const flagged = await recordEvent(tx, {
      orgId, name: "building.rules_stale", entityKind: "building", entityId: building.id,
      payload: {
        rules_id: building.rules_id, rules_version: building.version,
        confirmed_at: building.confirmed_at ? new Date(building.confirmed_at).toISOString() : null,
        never_confirmed: stale.neverConfirmed, days_since_confirmed: stale.daysSinceConfirmed
      },
      actorKind: "system", idempotencyKey: `rules-stale:${building.id}:${building.rules_id}:${confirmedKey}`
    });

    if (!building.leasing_email) return { flagged: flagged.written, queued: false, noEmail: true };

    // Queued since the rules were last confirmed (or since this version was posted)?
    const since = building.confirmed_at || building.rules_created_at;
    const already = (await tx.query(
      `SELECT 1 FROM yd_outbox
        WHERE org_id = $1 AND related_kind = 'building_rules_reconfirm' AND related_id = $2
          AND created_at >= $3 LIMIT 1`, [orgId, building.id, since])).rows[0];
    if (already) return { flagged: flagged.written, queued: false };

    await tx.query(
      `INSERT INTO yd_outbox (org_id, channel, to_address, template_key, context, related_kind, related_id)
       VALUES ($1,'email',$2,$3,$4::jsonb,'building_rules_reconfirm',$5)`,
      [orgId, building.leasing_email, YD_TEMPLATES.rulesReconfirm,
       JSON.stringify({
         building_name: building.name, rules_version: String(building.version),
         never_confirmed: stale.neverConfirmed, days_since_confirmed: stale.daysSinceConfirmed
       }),
       building.id]);
    return { flagged: flagged.written, queued: true };
  });
}

/**
 * One daily pass.
 * @returns {Promise<{ ok: boolean, count: number, stale: number, flagged: number, queued: number,
 *                     noEmail: number, failed: number, errors: string[] }>}
 */
export async function rulesStaleSweep(db, { orgId, now = new Date(), limit = YD_CRON.rulesStaleBatch } = {}) {
  const out = { ok: true, count: 0, stale: 0, flagged: 0, queued: 0, noEmail: 0, failed: 0, errors: [] };
  if (!orgId) return { ...out, ok: false, errors: ["orgId required"] };
  let rows;
  let stale;
  try {
    rows = await loadBuildings(db, orgId);
    stale = buildingsWithStaleRules({
      buildings: rows.map((b) => ({ id: b.id, status: b.status, rulesConfirmedAt: b.confirmed_at })), now
    });
  } catch (e) {
    return { ...out, ok: false, errors: [String(e?.message || e).slice(0, 300)] };
  }
  out.stale = stale.length;
  const byId = new Map(rows.map((b) => [b.id, b]));

  for (const s of stale.slice(0, limit)) {
    try {
      const r = await flagOne(db, { orgId, stale: s, building: byId.get(s.buildingId) });
      if (r.flagged) out.flagged += 1;
      if (r.queued) out.queued += 1;
      if (r.noEmail) out.noEmail += 1;
    } catch (e) {
      out.failed += 1;
      if (out.errors.length < 5) out.errors.push(`${s.buildingId}: ${String(e?.message || e).slice(0, 160)}`);
    }
  }
  out.count = out.flagged;
  return out;
}
