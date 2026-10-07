// Money writes (spec §3 Fee + Broker money, §8: POST staff/payment, staff/refund,
// staff/broker-payout, and the daily yd-fee-safe job).
//
//   recordPayment        a building's payment arrives: invoice paid, its fee paid,
//                        the placement `paid`, the broker's share held for refund_days
//   recordFeeRefundPaid  we paid a refund back to a building
//   recordRenterRefundPaid  we paid a renter their application fee back
//   refundPlacement      ops reverses a paid fee inside the refund window
//   releaseSafeFees      (cron) paid + refund_days -> safe; the broker's share -> payable
//   payBroker            mark a broker's payable shares paid (a payout reference is required)
//
// Everything is integer cents. The database refuses what must never happen (a fee
// is `safe` only refund_days after it was paid, a broker is payable only after the
// fee is safe, nothing is deleted); these functions make the allowed moves in the
// right order and write the events. Staff only: building and broker doors never
// reach this file.

import { YD_MONEY } from "../config.mjs";
import { YdError, cents, isUuid } from "../http.mjs";
import { withTransaction } from "../tx.mjs";
import { SYSTEM, actorOf, recordEvent, setActor } from "../events.mjs";
import { addDays } from "../util.mjs";
import { reqEnum, reqString, reqUuid, optUuid, optString } from "../validate.mjs";
import { refundPaidFee } from "./fee-ledger.mjs";

/* ── a building pays an invoice ───────────────────────────────────────── */

/**
 * POST staff/payment (invoice variant). Body: { invoiceId | invoiceNumber, method, ref, paidAt? }.
 * `paidAt` is when the money arrived (never in the future, never before the invoice).
 * Replaying the same payment (same ref) is a no-op that answers the same thing.
 */
export async function recordPayment(db, who, body, { now = new Date() } = {}) {
  const invoiceId = optUuid(body, "invoiceId", "the invoice");
  const number = optString(body, "invoiceNumber", "the invoice number", { max: 40 });
  if (!invoiceId && !number) throw new YdError(400, "invoice_required", "Say which invoice was paid (invoiceId or invoiceNumber).");
  const method = reqEnum(body, "method", YD_MONEY.paymentMethods, "how it was paid");
  const ref = reqString(body, "ref", "the payment reference (check number, wire or ACH id)", { max: 120 });
  let paidAt = null;
  if (body.paidAt !== undefined && body.paidAt !== null) {
    paidAt = new Date(body.paidAt);
    if (Number.isNaN(paidAt.getTime())) throw new YdError(400, "invalid_time", "paidAt is not a valid date and time.");
    if (paidAt > now) throw new YdError(400, "invalid_time", "The payment date cannot be in the future.");
  }
  const actor = actorOf(who);

  return withTransaction(db, async (tx) => {
    await setActor(tx, actor);
    const inv = (await tx.query(
      `SELECT id, number, total_cents, issued_at, status, paid_at, payment_method, payment_ref, building_id
         FROM yd_invoices
        WHERE org_id = $1 AND ($2::uuid IS NULL OR id = $2) AND ($3::text IS NULL OR number = $3)
        FOR UPDATE`, [who.orgId, invoiceId, number])).rows[0];
    if (!inv) throw new YdError(404, "not_found", "We could not find that invoice.");
    if (inv.status === "void") throw new YdError(409, "invoice_void", "That invoice was voided.");
    if (inv.status === "paid") {
      if (inv.payment_ref === ref) return { invoice: shapePaid(inv), fees: [], alreadyPaid: true, brokerHeld: 0 };
      throw new YdError(409, "already_paid", `Invoice ${inv.number} is already paid (reference ${inv.payment_ref}).`);
    }
    if (paidAt && paidAt < new Date(inv.issued_at)) {
      throw new YdError(400, "invalid_time", "The payment date cannot be before the invoice was issued.");
    }
    const when = paidAt || now;

    await tx.query(
      `UPDATE yd_invoices SET status = 'paid', paid_at = $3, payment_method = $4, payment_ref = $5
        WHERE id = $1 AND org_id = $2`, [inv.id, who.orgId, when, method, ref]);

    const fees = (await tx.query(
      `SELECT f.id, f.application_id, f.amount_cents, b.refund_days
         FROM yd_fee_ledger f JOIN yd_buildings b ON b.id = f.building_id AND b.org_id = f.org_id
        WHERE f.org_id = $1 AND f.invoice_id = $2 AND f.kind = 'placement_fee' AND f.status = 'invoiced'
        FOR UPDATE OF f`, [who.orgId, inv.id])).rows;

    let brokerHeld = 0;
    for (const f of fees) {
      await tx.query(`UPDATE yd_fee_ledger SET status = 'paid', paid_at = $3 WHERE id = $1 AND org_id = $2`, [f.id, who.orgId, when]);
      await tx.query(`UPDATE yd_applications SET stage = 'paid' WHERE id = $1 AND org_id = $2 AND stage = 'invoiced'`, [f.application_id, who.orgId]);
      // The broker's share waits for the building's refund window: held until paid + refund_days.
      const held = await tx.query(
        `UPDATE yd_broker_ledger SET status = 'held', hold_until = $3
          WHERE fee_ledger_id = $1 AND org_id = $2 AND status = 'earned' RETURNING id`,
        [f.id, who.orgId, addDays(when, f.refund_days)]);
      brokerHeld += held.rowCount;
      await recordEvent(tx, {
        orgId: who.orgId, name: "fee.paid", entityKind: "application", entityId: f.application_id,
        payload: { fee_id: f.id, amount_cents: Number(f.amount_cents), invoice_id: inv.id, safe_after_days: f.refund_days },
        actor
      });
    }
    await recordEvent(tx, {
      orgId: who.orgId, name: "invoice.paid", entityKind: "invoice", entityId: inv.id,
      payload: { number: inv.number, total_cents: Number(inv.total_cents), method, ref, paid_at: when.toISOString() }, actor
    });
    return {
      invoice: { id: inv.id, number: inv.number, totalCents: cents(inv.total_cents), status: "paid", paidAt: when.toISOString(), method, ref },
      fees: fees.map((f) => ({ id: f.id, applicationId: f.application_id, amountCents: cents(f.amount_cents), status: "paid" })),
      alreadyPaid: false, brokerHeld
    };
  });
}

const shapePaid = (inv) => ({
  id: inv.id, number: inv.number, totalCents: cents(inv.total_cents), status: "paid",
  paidAt: inv.paid_at, method: inv.payment_method, ref: inv.payment_ref
});

/* ── refunds paid out ─────────────────────────────────────────────────── */

/** POST staff/payment (feeRefundId variant): the refund row (negative) we owed a building is paid. */
export async function recordFeeRefundPaid(db, who, body, { now = new Date() } = {}) {
  const refundId = reqUuid(body, "feeRefundId", "the refund");
  const method = reqEnum(body, "method", YD_MONEY.paymentMethods, "how it was paid");
  const ref = reqString(body, "ref", "the payment reference", { max: 120 });
  const actor = actorOf(who);
  return withTransaction(db, async (tx) => {
    await setActor(tx, actor);
    const row = (await tx.query(
      `SELECT id, application_id, amount_cents, status FROM yd_fee_ledger
        WHERE id = $1 AND org_id = $2 AND kind = 'refund' FOR UPDATE`, [refundId, who.orgId])).rows[0];
    if (!row) throw new YdError(404, "not_found", "We could not find that refund.");
    if (row.status === "paid") return { refund: { id: row.id, status: "paid" }, alreadyPaid: true };
    if (row.status !== "earned") throw new YdError(409, "refund_not_owed", "That refund is no longer owed.");
    await tx.query(`UPDATE yd_fee_ledger SET status = 'paid', paid_at = $3 WHERE id = $1 AND org_id = $2`, [row.id, who.orgId, now]);
    await recordEvent(tx, {
      orgId: who.orgId, name: "fee.refund_paid", entityKind: "application", entityId: row.application_id,
      payload: { refund_fee_id: row.id, amount_cents: Number(row.amount_cents), method, ref }, actor
    });
    return { refund: { id: row.id, amountCents: cents(row.amount_cents), status: "paid" }, alreadyPaid: false };
  });
}

/** POST staff/payment (renterRefundId variant): a renter's application fee is paid back. */
export async function recordRenterRefundPaid(db, who, body, { now = new Date() } = {}) {
  const refundId = reqUuid(body, "renterRefundId", "the renter refund");
  const ref = reqString(body, "ref", "the payment reference", { max: 120 });
  const actor = actorOf(who);
  return withTransaction(db, async (tx) => {
    await setActor(tx, actor);
    const row = (await tx.query(
      `SELECT id, application_id, amount_cents, status FROM yd_renter_refunds
        WHERE id = $1 AND org_id = $2 FOR UPDATE`, [refundId, who.orgId])).rows[0];
    if (!row) throw new YdError(404, "not_found", "We could not find that refund.");
    if (row.status === "paid") return { refund: { id: row.id, status: "paid" }, alreadyPaid: true };
    if (row.status !== "owed") throw new YdError(409, "refund_not_owed", "That refund is no longer owed.");
    await tx.query(`UPDATE yd_renter_refunds SET status = 'paid', paid_at = $3 WHERE id = $1 AND org_id = $2`, [row.id, who.orgId, now]);
    await recordEvent(tx, {
      orgId: who.orgId, name: "renter_refund.paid", entityKind: "application", entityId: row.application_id,
      payload: { renter_refund_id: row.id, amount_cents: Number(row.amount_cents), ref }, actor
    });
    return { refund: { id: row.id, amountCents: cents(row.amount_cents), status: "paid" }, alreadyPaid: false };
  });
}

/* ── ops refunds a paid fee ───────────────────────────────────────────── */

/** POST staff/refund { applicationId, reason }: reverse a PAID fee inside the refund window. */
export async function refundPlacement(db, who, body, { now = new Date() } = {}) {
  const applicationId = reqUuid(body, "applicationId", "the placement to refund");
  const reason = reqString(body, "reason", "the reason for the refund", { max: YD_MONEY.maxTextChars });
  const actor = actorOf(who);
  return withTransaction(db, async (tx) => {
    await setActor(tx, actor);
    const app = (await tx.query(
      `SELECT id, stage FROM yd_applications WHERE id = $1 AND org_id = $2 FOR UPDATE`, [applicationId, who.orgId])).rows[0];
    if (!app) throw new YdError(404, "not_found", "We could not find that placement.");
    if (app.stage === "refunded") return { applicationId, stage: "refunded", alreadyRefunded: true };
    const out = await refundPaidFee(tx, { orgId: who.orgId, applicationId, actor, why: reason, now });
    return { applicationId, stage: "refunded", feeId: out.feeId, refundFeeId: out.refundFeeId, alreadyRefunded: false };
  });
}

/* ── the daily job: paid -> safe ──────────────────────────────────────── */

/**
 * yd-fee-safe. A paid fee becomes `safe` refund_days after it was paid (the database
 * checks the clock, not this code); its placement moves to `safe`; the broker's
 * share, held until then, becomes `payable`. A fee that has been reversed is skipped.
 * `orgId` limits the run to one company (tests); the cron passes none.
 * Returns { fees, brokersReleased, errors }.
 */
export async function releaseSafeFees(db, { orgId = null, limit = YD_MONEY.feeSafeBatch } = {}) {
  const due = (await db.query(
    `SELECT f.id, f.org_id, f.application_id
       FROM yd_fee_ledger f
       JOIN yd_buildings b ON b.id = f.building_id AND b.org_id = f.org_id
      WHERE f.kind = 'placement_fee' AND f.status = 'paid'
        AND f.paid_at + (b.refund_days * interval '1 day') <= now()
        AND NOT EXISTS (SELECT 1 FROM yd_fee_ledger r
                         WHERE r.reverses_id = f.id AND r.org_id = f.org_id AND r.status <> 'void')
        AND ($1::uuid IS NULL OR f.org_id = $1)
      ORDER BY f.paid_at, f.id
      LIMIT $2`, [orgId, limit])).rows;

  const out = { fees: 0, brokersReleased: 0, errors: [] };
  for (const f of due) {
    try {
      await withTransaction(db, async (tx) => {
        await setActor(tx, SYSTEM);
        const row = (await tx.query(
          `SELECT id, status FROM yd_fee_ledger WHERE id = $1 AND org_id = $2 FOR UPDATE SKIP LOCKED`, [f.id, f.org_id])).rows[0];
        if (!row || row.status !== "paid") return;
        await tx.query(`UPDATE yd_fee_ledger SET status = 'safe' WHERE id = $1 AND org_id = $2`, [f.id, f.org_id]);
        await tx.query(`UPDATE yd_applications SET stage = 'safe' WHERE id = $1 AND org_id = $2 AND stage = 'paid'`, [f.application_id, f.org_id]);
        await recordEvent(tx, {
          orgId: f.org_id, name: "fee.safe", entityKind: "application", entityId: f.application_id,
          payload: { fee_id: f.id }, actor: SYSTEM, idempotencyKey: `fee-safe:${f.id}`
        });
        out.fees += 1;
      });
    } catch (e) {
      out.errors.push({ feeId: f.id, error: e.message });
    }
  }

  // Held shares whose fee is now safe and whose hold has passed (this also catches one
  // left behind by a run that stopped halfway).
  const release = await db.query(
    `SELECT bl.id, bl.org_id, bl.broker_id
       FROM yd_broker_ledger bl
       JOIN yd_fee_ledger f ON f.id = bl.fee_ledger_id AND f.org_id = bl.org_id
      WHERE bl.status = 'held' AND f.status = 'safe' AND bl.hold_until <= now()
        AND ($1::uuid IS NULL OR bl.org_id = $1)
      ORDER BY bl.id LIMIT $2`, [orgId, limit]);
  for (const r of release.rows) {
    try {
      await withTransaction(db, async (tx) => {
        await setActor(tx, SYSTEM);
        const u = await tx.query(
          `UPDATE yd_broker_ledger SET status = 'payable' WHERE id = $1 AND org_id = $2 AND status = 'held' RETURNING id`,
          [r.id, r.org_id]);
        if (!u.rows[0]) return;
        await recordEvent(tx, {
          orgId: r.org_id, name: "broker.payable", entityKind: "broker", entityId: r.broker_id,
          payload: { broker_ledger_id: r.id }, actor: SYSTEM, idempotencyKey: `broker-payable:${r.id}`
        });
        out.brokersReleased += 1;
      });
    } catch (e) {
      out.errors.push({ brokerLedgerId: r.id, error: e.message });
    }
  }
  return out;
}

/* ── broker payouts ───────────────────────────────────────────────────── */

/**
 * POST staff/broker-payout { brokerId, payoutRef, ledgerIds? }. Marks the broker's
 * PAYABLE shares paid (all of them, or the listed ones), recording the payout
 * reference. The broker must be an active partner. Repeating the same payoutRef
 * after the shares are paid answers 200 with nothing new.
 * Returns { paid, totalCents, rows, alreadyPaid }.
 */
export async function payBroker(db, who, body, { now = new Date() } = {}) {
  const brokerId = reqUuid(body, "brokerId", "the broker being paid");
  const payoutRef = reqString(body, "payoutRef", "the payout reference (the transfer or check number)", { max: 120 });
  let ledgerIds = null;
  if (body.ledgerIds !== undefined) {
    if (!Array.isArray(body.ledgerIds) || body.ledgerIds.length === 0 || body.ledgerIds.length > 200 ||
        body.ledgerIds.some((x) => !isUuid(x))) {
      throw new YdError(400, "invalid_parameter", "ledgerIds must be a short list of ids.");
    }
    ledgerIds = body.ledgerIds;
  }
  const actor = actorOf(who);

  return withTransaction(db, async (tx) => {
    await setActor(tx, actor);
    const broker = (await tx.query(
      `SELECT id, name, status FROM yd_brokers WHERE id = $1 AND org_id = $2 FOR UPDATE`, [brokerId, who.orgId])).rows[0];
    if (!broker) throw new YdError(404, "not_found", "We could not find that broker.");

    const rows = (await tx.query(
      `SELECT id, amount_cents, status, payout_ref FROM yd_broker_ledger
        WHERE org_id = $1 AND broker_id = $2 AND ($3::uuid[] IS NULL OR id = ANY($3::uuid[]))
        FOR UPDATE`, [who.orgId, brokerId, ledgerIds])).rows;
    if (ledgerIds && rows.length !== ledgerIds.length) {
      throw new YdError(404, "not_found", "One of those payout rows is not this broker's.");
    }
    const payable = rows.filter((r) => r.status === "payable");
    if (ledgerIds && payable.length !== rows.length) {
      throw new YdError(409, "not_payable", "Only rows marked payable can be paid. Some of those are not.");
    }
    if (payable.length === 0) {
      if (rows.some((r) => r.status === "paid" && r.payout_ref === payoutRef)) {
        return { paid: 0, totalCents: 0, rows: [], alreadyPaid: true };
      }
      throw new YdError(409, "nothing_payable", "This broker has nothing payable right now.");
    }
    if (broker.status !== "active") {
      throw new YdError(409, "broker_not_active", "This broker is not an active partner, so nothing can be paid out yet.");
    }

    const paid = [];
    for (const r of payable) {
      await tx.query(
        `UPDATE yd_broker_ledger SET status = 'paid', paid_at = $3, payout_ref = $4 WHERE id = $1 AND org_id = $2`,
        [r.id, who.orgId, now, payoutRef]);
      paid.push({ id: r.id, amountCents: cents(r.amount_cents) });
    }
    const total = paid.reduce((n, r) => n + r.amountCents, 0);
    await recordEvent(tx, {
      orgId: who.orgId, name: "broker.paid", entityKind: "broker", entityId: brokerId,
      payload: { payout_ref: payoutRef, total_cents: total, ledger_ids: paid.map((p) => p.id) }, actor
    });
    return { paid: paid.length, totalCents: total, rows: paid, alreadyPaid: false };
  });
}

