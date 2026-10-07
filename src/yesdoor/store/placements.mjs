// What a building does to a placement (spec §3, §5, §5b, §8: POST building/update).
//
//   updatePlacement   move an application along the §3 arrows:
//        toured / no_show / applied / approved   a stamp (and the tour is closed)
//        denied        the "approved, but the building said no" flow, ONE transaction
//        lease_signed  needs the lease dates and rent
//        moved_in      the fee is earned and the invoice is issued, same transaction
//        refunded      the renter left inside the refund window: the fee is reversed
//   fileKnownProspect   "we already knew this renter": evidence, within 3 days of the
//                       registration, opens an attribution dispute for ops to decide
//
// The building user is scoped by yd_account_buildings: an application at any other
// building (or another company) is a 404, never a 403. Replaying a move that has
// already happened is a no-op that answers 200, so a double click is harmless.
//
// Credit never appears here. The reply carries the same safe shape as
// GET building/renters.

import { YD_DEFAULTS } from "../config.mjs";
import { YdError } from "../http.mjs";
import { withTransaction } from "../tx.mjs";
import { actorOf, queueOutbox, recordEvent, setActor } from "../events.mjs";
import { decideMismatch } from "../match/mismatch.mjs";
import { rankBackups } from "../match/match.mjs";
import { knownProspectClaimValid } from "../match/attribution.mjs";
import { BUILDING_STAGES, OPEN_STAGES, badMoveMessage, stageColumn, stageMoveOk } from "../stages.mjs";
import { reqEnum, longText, reqString, reqInt, dateOnly, timestampOf, reqUuid } from "../validate.mjs";
import { listBuildingRenters } from "./buildings.mjs";
import { earnPlacementFee, refundPaidFee } from "./fee-ledger.mjs";

const num = (v) => (v === null || v === undefined ? null : Number(v));
const OPEN_LIST = OPEN_STAGES.map((s) => `'${s}'`).join(", ");

async function applicationView(tx, who, applicationId) {
  const rows = await listBuildingRenters(tx, {
    orgId: who.orgId, buildingIds: who.buildingIds, limit: 1, applicationId
  });
  return rows[0] || null;
}

/** Read the lease the building reports. Dates are real dates, the end is after the start, the rent is whole cents. */
export function readLease(body) {
  const lease = body.lease;
  if (!lease || typeof lease !== "object" || Array.isArray(lease)) {
    throw new YdError(400, "lease_required", "Add the lease start date, end date and monthly rent.");
  }
  const start = dateOnly(lease.start, "The lease start date");
  const end = dateOnly(lease.end, "The lease end date");
  if (end <= start) throw new YdError(400, "invalid_lease", "The lease end date must be after the start date.");
  const rentCents = reqInt(lease, "rentCents", "the monthly rent", { min: 1, max: 100_000_000 });
  return { start, end, rentCents };
}

/** The renter's other approved buildings, best first: the backups to offer after a denial (spec §5). */
async function backupMatches(tx, { orgId, renterId, deniedBuildingId }) {
  const r = await tx.query(
    `SELECT DISTINCT ON (m.building_id)
            m.building_id, m.listing_id, m.result, m.max_rent_cents,
            b.name AS building_name, b.city,
            l.unit_label, l.rent_cents AS listing_rent_cents
       FROM yd_matches m
       JOIN yd_buildings b ON b.id = m.building_id AND b.org_id = m.org_id
       LEFT JOIN yd_listings l ON l.id = m.listing_id AND l.active
      WHERE m.org_id = $1 AND m.renter_id = $2 AND m.building_id <> $3
        AND b.status NOT IN ('paused', 'churned') AND public.yd_building_is_matchable(b.id)
        AND NOT EXISTS (SELECT 1 FROM yd_applications a
                         WHERE a.renter_id = m.renter_id AND a.building_id = m.building_id
                           AND a.stage IN (${OPEN_LIST}))
      ORDER BY m.building_id, m.computed_at DESC, m.id DESC`, [orgId, renterId, deniedBuildingId]);
  const candidates = r.rows.map((x) => ({
    buildingId: x.building_id, listingId: x.listing_id, result: x.result,
    maxRentCents: num(x.max_rent_cents), listingRentCents: num(x.listing_rent_cents),
    buildingName: x.building_name, city: x.city, unit: x.unit_label
  }));
  return rankBackups(candidates, { excludeBuildingId: deniedBuildingId, maxBackups: YD_DEFAULTS.maxBackups });
}

/** The denial flow. spec §5: mismatch count, pause at the threshold, refund owed, backups offered, events. */
async function applyDenial(tx, { who, actor, app, building, reason }) {
  const orgId = who.orgId;
  const ourMatch = app.match_id
    ? (await tx.query(`SELECT result FROM yd_matches WHERE id = $1 AND org_id = $2`, [app.match_id, orgId])).rows[0] || null
    : null;
  const prior = (await tx.query(
    `SELECT occurred_at FROM yd_events
      WHERE org_id = $1 AND name = 'building.mismatch' AND entity_kind = 'building' AND entity_id = $2`,
    [orgId, building.id])).rows.map((x) => x.occurred_at);
  const backups = await backupMatches(tx, { orgId, renterId: app.renter_id, deniedBuildingId: building.id });

  const decision = decideMismatch({
    building: { id: building.id, status: building.status, appFeeCents: num(building.app_fee_cents), appFeeWaived: building.app_fee_waived },
    denial: { reason },
    ourMatch,
    priorMismatchAt: prior,
    backups
  });

  await tx.query(
    `UPDATE yd_applications SET stage = 'denied', denial_reason = $3 WHERE id = $1 AND org_id = $2`,
    [app.id, orgId, decision.denialReason]);

  const out = { mismatch: false, refundOwed: false, refundAmountCents: null, backupsOffered: 0, buildingPaused: false };

  if (decision.incrementMismatch) {
    out.mismatch = true;
    await tx.query(`UPDATE yd_buildings SET mismatch_count = mismatch_count + 1 WHERE id = $1 AND org_id = $2`, [building.id, orgId]);
    await recordEvent(tx, {
      orgId, name: "building.mismatch", entityKind: "building", entityId: building.id,
      payload: { application_id: app.id, renter_id: app.renter_id, reason: decision.denialReason, mismatches_in_window: decision.mismatchesInWindow },
      actor
    });
  }

  if (decision.pauseBuilding) {
    out.buildingPaused = true;
    await tx.query(`UPDATE yd_buildings SET status = 'paused' WHERE id = $1 AND org_id = $2`, [building.id, orgId]);
    await recordEvent(tx, {
      orgId, name: "building.paused", entityKind: "building", entityId: building.id,
      payload: { why: "mismatch_threshold", mismatches_in_window: decision.mismatchesInWindow, window_days: YD_DEFAULTS.mismatchWindowDays },
      actor
    });
    // The staff desk's rules-review task: an event, not a rule change. Rules never change by themselves.
    await recordEvent(tx, {
      orgId, name: "staff.rules_review", entityKind: "building", entityId: building.id,
      payload: { denial_reason: decision.denialReason, application_id: app.id }, actor,
      idempotencyKey: `rules-review:${building.id}:${app.id}`
    });
  }

  if (decision.incrementMismatch && !building.app_fee_waived) {
    if (decision.refundOwedCents === null) {
      // We owe the renter an application fee but nobody told us how much: unknown stays unknown.
      out.refundOwed = true;
      await recordEvent(tx, {
        orgId, name: "renter_refund.amount_unknown", entityKind: "application", entityId: app.id,
        payload: { building_id: building.id }, actor, idempotencyKey: `refund-unknown:${app.id}`
      });
    } else if (decision.refundOwedCents > 0) {
      out.refundOwed = true;
      out.refundAmountCents = decision.refundOwedCents;
      await tx.query(
        `INSERT INTO yd_renter_refunds (org_id, renter_id, application_id, reason, amount_cents)
         VALUES ($1,$2,$3,'app_fee_mismatch',$4) ON CONFLICT (application_id, reason) DO NOTHING`,
        [orgId, app.renter_id, app.id, decision.refundOwedCents]);
      await recordEvent(tx, {
        orgId, name: "renter_refund.owed", entityKind: "application", entityId: app.id,
        payload: { amount_cents: decision.refundOwedCents }, actor, idempotencyKey: `refund-owed:${app.id}`
      });
    }
  }

  out.backupsOffered = decision.backupsToOffer.length;
  const renter = (await tx.query(`SELECT email, first_name FROM yd_renters WHERE id = $1 AND org_id = $2`, [app.renter_id, orgId])).rows[0];
  if (renter?.email) {
    await queueOutbox(tx, {
      orgId, channel: "email", to: renter.email, templateKey: "yd-backups-offered",
      context: {
        first_name: renter.first_name, denied_building: building.name,
        refund_owed: out.refundOwed, refund_amount_cents: out.refundAmountCents,
        // Names and rents only: never a reason that quotes the credit file.
        backups: decision.backupsToOffer.map((b) => ({
          building_id: b.buildingId, building_name: b.buildingName, city: b.city, unit: b.unit, rent_cents: b.listingRentCents
        }))
      },
      relatedKind: "application", relatedId: app.id
    });
  }
  await recordEvent(tx, {
    orgId, name: "renter.backups_offered", entityKind: "renter", entityId: app.renter_id,
    payload: { application_id: app.id, count: out.backupsOffered, building_ids: decision.backupsToOffer.map((b) => b.buildingId) },
    actor, idempotencyKey: `backups-offered:${app.id}`
  });
  return out;
}

/**
 * POST building/update { applicationId, stage, reason?, lease? }  (or { applicationId, knownProspect }).
 * Returns { application, unchanged, mismatch, refundOwed, backupsOffered, fee? }.
 */
export async function updatePlacement(db, who, body, { now = new Date() } = {}) {
  const applicationId = reqUuid(body, "applicationId", "the renter's application");
  if (body.knownProspect !== undefined) {
    if (body.stage !== undefined) throw new YdError(400, "invalid_parameter", "Send a stage change or a known-prospect claim, not both.");
    return fileKnownProspect(db, who, applicationId, body.knownProspect, { now });
  }
  const stage = reqEnum(body, "stage", BUILDING_STAGES, "the new stage");
  const reason = longText(body, "reason", "the reason") ?? null;
  const actor = actorOf(who);

  return withTransaction(db, async (tx) => {
    await setActor(tx, actor);
    const app = (await tx.query(
      `SELECT * FROM yd_applications WHERE id = $1 AND org_id = $2 AND building_id = ANY($3) FOR UPDATE`,
      [applicationId, who.orgId, who.buildingIds])).rows[0];
    if (!app) throw new YdError(404, "not_found", "We could not find that renter at your buildings.");

    // A repeat of a move that already happened changes nothing.
    if (app.stage === stage || app[stageColumn(stage)]) {
      return { application: await applicationView(tx, who, applicationId), unchanged: true, mismatch: false, refundOwed: false, backupsOffered: 0 };
    }
    if (!stageMoveOk(app.stage, stage)) throw new YdError(409, "bad_stage_move", badMoveMessage(app.stage, stage));

    const building = (await tx.query(`SELECT * FROM yd_buildings WHERE id = $1 AND org_id = $2 FOR UPDATE`, [app.building_id, who.orgId])).rows[0];
    const result = { unchanged: false, mismatch: false, refundOwed: false, backupsOffered: 0 };

    if (stage === "denied") {
      const why = reqString({ reason: reason ?? undefined }, "reason", "why the renter was denied. We use it to keep your rules right");
      Object.assign(result, await applyDenial(tx, { who, actor, app, building, reason: why }));
    } else if (stage === "lease_signed") {
      const lease = readLease(body);
      await tx.query(
        `UPDATE yd_applications SET stage = 'lease_signed', lease_start = $3, lease_end = $4, rent_cents = $5
          WHERE id = $1 AND org_id = $2`, [applicationId, who.orgId, lease.start, lease.end, lease.rentCents]);
    } else if (stage === "moved_in") {
      await tx.query(`UPDATE yd_applications SET stage = 'moved_in' WHERE id = $1 AND org_id = $2`, [applicationId, who.orgId]);
      await tx.query(`UPDATE yd_renters SET stage = 'placed' WHERE id = $1 AND org_id = $2 AND stage IN ('lead', 'screened', 'matched', 'booked')`, [app.renter_id, who.orgId]);
      result.fee = await earnPlacementFee(tx, { orgId: who.orgId, applicationId, actor });
    } else if (stage === "refunded") {
      result.fee = await refundPaidFee(tx, { orgId: who.orgId, applicationId, actor, why: reason || "reported by the building", now });
    } else {
      // toured / no_show / applied / approved: a stamp. The tour row follows the stage.
      await tx.query(`UPDATE yd_applications SET stage = $3 WHERE id = $1 AND org_id = $2`, [applicationId, who.orgId, stage]);
      if (stage === "toured" || stage === "no_show") {
        await tx.query(
          `UPDATE yd_tours SET status = $3
            WHERE id = (SELECT id FROM yd_tours WHERE application_id = $1 AND org_id = $2
                         AND status IN ('booked', 'rescheduled') ORDER BY starts_at DESC LIMIT 1)`,
          [applicationId, who.orgId, stage === "toured" ? "completed" : "noshow"]);
      }
    }

    await recordEvent(tx, {
      orgId: who.orgId, name: "building.updated_stage", entityKind: "application", entityId: applicationId,
      payload: { from: app.stage, to: stage, building_id: app.building_id, reason: reason || undefined },
      actor
    });
    result.application = await applicationView(tx, who, applicationId);
    return result;
  });
}

/**
 * "We already knew this renter": a building may say so within knownProspectDays (3)
 * of receiving the registration, with its own EARLIER visitor-record date as
 * evidence. That opens an attribution dispute (14 days, ops decides). Until it is
 * decided no fee is earned on this placement; if the building wins, none ever is.
 */
export async function fileKnownProspect(db, who, applicationId, claim, { now = new Date() } = {}) {
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
    throw new YdError(400, "invalid_parameter", "Add the evidence: the date the renter first visited you, and a note about the record.");
  }
  const evidence = reqString(claim, "evidence", "a note about your own record of this renter", { max: 1000 });
  const evidenceAt = timestampOf(claim.evidenceAt, "The date of your own record");
  const actor = actorOf(who);

  return withTransaction(db, async (tx) => {
    await setActor(tx, actor);
    const app = (await tx.query(
      `SELECT id, renter_id, building_id, registration_sent_at, known_prospect_at FROM yd_applications
        WHERE id = $1 AND org_id = $2 AND building_id = ANY($3) FOR UPDATE`,
      [applicationId, who.orgId, who.buildingIds])).rows[0];
    if (!app) throw new YdError(404, "not_found", "We could not find that renter at your buildings.");
    if (app.known_prospect_at) throw new YdError(409, "claim_already_filed", "You already filed a claim on this renter.");

    const check = knownProspectClaimValid({
      registrationSentAt: app.registration_sent_at, claimedAt: now, evidenceAt
    });
    if (!check.valid) {
      const say = {
        no_registration: "This renter was never registered with you, so there is nothing to claim.",
        too_late: `A known-renter claim has to come within ${YD_DEFAULTS.knownProspectDays} days of the registration. That window has closed.`,
        evidence_not_earlier: "Your own record has to be dated BEFORE our registration. Yours is not."
      };
      throw new YdError(check.reason === "too_late" ? 409 : 400, `claim_${check.reason}`, say[check.reason] || "That claim cannot be filed.");
    }

    await tx.query(
      `UPDATE yd_applications SET known_prospect_at = $3, known_prospect_evidence = $4 WHERE id = $1 AND org_id = $2`,
      [applicationId, who.orgId, evidenceAt, evidence]);
    const dispute = (await tx.query(
      `INSERT INTO yd_disputes (org_id, kind, subject, opened_by_kind, opened_by_id)
       VALUES ($1,'attribution',$2::jsonb,'building_user',$3) RETURNING id, due_by`,
      [who.orgId, JSON.stringify({
        application_id: applicationId, renter_id: app.renter_id, building_id: app.building_id,
        registration_sent_at: new Date(app.registration_sent_at).toISOString(), known_prospect_at: evidenceAt.toISOString(),
        claim: "known_prospect"
      }), who.accountId])).rows[0];
    await recordEvent(tx, {
      orgId: who.orgId, name: "dispute.opened", entityKind: "dispute", entityId: dispute.id,
      payload: { kind: "attribution", application_id: applicationId, claim: "known_prospect" }, actor
    });
    return {
      application: await applicationView(tx, who, applicationId),
      unchanged: false, mismatch: false, refundOwed: false, backupsOffered: 0,
      dispute: { id: dispute.id, kind: "attribution", dueBy: dispute.due_by }
    };
  });
}

