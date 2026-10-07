// Disputes (spec §5b, §8: POST staff/disputes). Staff open one; ops (and the owner)
// decide it within 14 days (the database fills due_by = opened + 14 days).
//
//   attribution   "who sent this renter first". Upheld = the building already knew
//                 the renter: NO fee is earned, and one already earned is taken back.
//                 Rejected = Yesdoor keeps the credit: a fee held back while the
//                 dispute was open is earned now.
//   fee           the building disputes what it was billed. Upheld = the fee is taken back.
//   denial        a denial someone contests. Recorded; nothing moves by itself.
//
// "Upheld" always means the person who opened the dispute was right. A decided
// dispute is never re-decided (a database trigger), so repeating the same decision
// is a harmless 200 and a different one is a 409.

import { YD_DEFAULTS } from "../config.mjs";
import { YdError } from "../http.mjs";
import { withTransaction } from "../tx.mjs";
import { actorOf, recordEvent, setActor } from "../events.mjs";
import { reqEnum, reqUuid, longText } from "../validate.mjs";
import { earnPlacementFee, reversePlacementFee } from "./fee-ledger.mjs";

export const DISPUTE_KINDS = Object.freeze(["attribution", "denial", "fee"]);
export const DECISIONS = Object.freeze(["upheld", "rejected"]);

const shape = (d) => ({
  id: d.id, kind: d.kind, subject: d.subject, status: d.status,
  openedBy: { kind: d.opened_by_kind, id: d.opened_by_id }, openedAt: d.opened_at, dueBy: d.due_by,
  decision: d.decision, decidedBy: d.decided_by, decidedAt: d.decided_at
});
const COLS = `id, kind, subject, status, opened_by_kind, opened_by_id, opened_at, due_by, decision, decided_by, decided_at`;

/** POST staff/disputes (open). Body: { kind, applicationId, note? }. Returns { dispute, created }. */
export async function openDispute(db, who, body) {
  const kind = reqEnum(body, "kind", DISPUTE_KINDS, "the kind of dispute");
  const applicationId = reqUuid(body, "applicationId", "the placement it is about");
  const note = longText(body, "note", "the note") ?? null;
  const actor = actorOf(who);

  return withTransaction(db, async (tx) => {
    await setActor(tx, actor);
    const app = (await tx.query(
      `SELECT id, renter_id, building_id, broker_id FROM yd_applications WHERE id = $1 AND org_id = $2 FOR UPDATE`,
      [applicationId, who.orgId])).rows[0];
    if (!app) throw new YdError(404, "not_found", "We could not find that placement.");

    const open = (await tx.query(
      `SELECT id FROM yd_disputes
        WHERE org_id = $1 AND kind = $2 AND status = 'open' AND subject->>'application_id' = $3::text`,
      [who.orgId, kind, applicationId])).rows[0];
    if (open) throw new YdError(409, "dispute_open", `There is already an open ${kind} dispute on this placement.`);

    const subject = { application_id: applicationId, renter_id: app.renter_id, building_id: app.building_id };
    if (app.broker_id) subject.broker_id = app.broker_id;
    if (note) subject.note = note;
    const d = (await tx.query(
      `INSERT INTO yd_disputes (org_id, kind, subject, opened_by_kind, opened_by_id)
       VALUES ($1,$2,$3::jsonb,'staff',$4) RETURNING ${COLS}`,
      [who.orgId, kind, JSON.stringify(subject), who.staffId])).rows[0];
    await recordEvent(tx, {
      orgId: who.orgId, name: "dispute.opened", entityKind: "dispute", entityId: d.id,
      payload: { kind, application_id: applicationId, due_by: d.due_by }, actor
    });
    return { dispute: shape(d), created: true };
  });
}

/**
 * POST staff/disputes (decide). Body: { disputeId, decision: "upheld" | "rejected", note? }.
 * Returns { dispute, effect, unchanged }. `effect` says what happened to the fee:
 *   { fee: "none" | "voided" | "reversed" | "earned" | "kept", ... }
 */
export async function decideDispute(db, who, body) {
  const disputeId = reqUuid(body, "disputeId", "the dispute");
  const decision = reqEnum(body, "decision", DECISIONS, "the decision");
  const note = longText(body, "note", "the note") ?? null;
  const actor = actorOf(who);

  return withTransaction(db, async (tx) => {
    await setActor(tx, actor);
    const d = (await tx.query(`SELECT ${COLS} FROM yd_disputes WHERE id = $1 AND org_id = $2 FOR UPDATE`, [disputeId, who.orgId])).rows[0];
    if (!d) throw new YdError(404, "not_found", "We could not find that dispute.");
    if (d.status === "decided") {
      if (d.decision === decision) return { dispute: shape(d), effect: { fee: "kept" }, unchanged: true };
      throw new YdError(409, "already_decided", `This dispute was already decided (${d.decision}). A decided dispute is never re-decided.`);
    }

    const applicationId = d.subject?.application_id;
    const subject = note ? { ...d.subject, decision_note: note } : d.subject;
    await tx.query(
      `UPDATE yd_disputes SET status = 'decided', decision = $3, decided_by = $4, decided_at = now(), subject = $5::jsonb
        WHERE id = $1 AND org_id = $2`, [disputeId, who.orgId, decision, who.staffId, JSON.stringify(subject)]);

    // What the decision does to the money. Only attribution and fee disputes touch it.
    let effect = { fee: "none" };
    if (applicationId && (d.kind === "attribution" || d.kind === "fee")) {
      const app = (await tx.query(
        `SELECT id, stage FROM yd_applications WHERE id = $1 AND org_id = $2 FOR UPDATE`, [applicationId, who.orgId])).rows[0];
      if (app) {
        if (decision === "upheld") {
          const out = await reversePlacementFee(tx, {
            orgId: who.orgId, applicationId, actor, why: `${d.kind} dispute ${disputeId} upheld`
          });
          effect = { fee: out.action, ...(out.refundFeeId ? { refundFeeId: out.refundFeeId } : {}) };
        } else if (d.kind === "attribution" && app.stage === "moved_in") {
          // The fee was held back while the dispute was open; Yesdoor keeps the credit, so earn it now.
          const out = await earnPlacementFee(tx, { orgId: who.orgId, applicationId, actor });
          effect = out.earned
            ? { fee: "earned", feeId: out.feeId, invoiceNumber: out.invoiceNumber, amountCents: out.amountCents }
            : { fee: "kept", reason: out.reason };
        } else {
          effect = { fee: "kept" };
        }
      }
    }

    await recordEvent(tx, {
      orgId: who.orgId, name: "dispute.decided", entityKind: "dispute", entityId: disputeId,
      payload: { kind: d.kind, decision, application_id: applicationId || null, effect, within_days: YD_DEFAULTS.disputeDays },
      actor
    });
    const fresh = (await tx.query(`SELECT ${COLS} FROM yd_disputes WHERE id = $1 AND org_id = $2`, [disputeId, who.orgId])).rows[0];
    return { dispute: shape(fresh), effect, unchanged: false };
  });
}

