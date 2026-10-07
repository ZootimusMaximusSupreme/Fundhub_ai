// The fee ledger's writes (spec §3 Fee, §5b). Every function here runs INSIDE the
// caller's transaction and expects the application row to be locked already.
//
//   earnPlacementFee     a move-in earns the fee: ledger row (earned), the invoice,
//                        the row on that invoice (invoiced), the application to
//                        `invoiced`, and the first-touch broker's share (earned)
//   reversePlacementFee  take a fee back: still unpaid -> void it (and the
//                        invoice, and the broker share); paid or safe -> a NEW
//                        negative row that reverses it in full (the original stays)
//   refundPaidFee        the building reports the renter left inside the refund
//                        window: reverse a PAID fee and move the application to
//                        `refunded`
//
// Money is integer cents. The database refuses everything these functions must
// not do (amount frozen once invoiced, one fee per application, a refund reverses
// in full and only once, a broker is owed only on the placement they first-touched),
// so a bug here is a rejected statement, not a wrong ledger.

import { feeEligible } from "../match/attribution.mjs";
import { brokerShareCents, placementFeeCents, refundWindowOpen, reversalCents } from "../fees.mjs";
import { YdError } from "../http.mjs";
import { queueOutbox, recordEvent } from "../events.mjs";

const num = (v) => (v === null || v === undefined ? null : Number(v));

/** The fee row for an application that is still live (not void), or null. */
export async function liveFeeFor(tx, orgId, applicationId) {
  const r = await tx.query(
    `SELECT id, status, amount_cents, invoice_id, paid_at, building_id
       FROM yd_fee_ledger
      WHERE org_id = $1 AND application_id = $2 AND kind = 'placement_fee' AND status <> 'void'
      FOR UPDATE`, [orgId, applicationId]);
  return r.rows[0] || null;
}

/** Attribution disputes on an application: is one open, and was a known-prospect claim upheld? */
export async function attributionState(tx, orgId, applicationId) {
  const r = await tx.query(
    `SELECT status, decision FROM yd_disputes
      WHERE org_id = $1 AND kind = 'attribution' AND subject->>'application_id' = $2::text`,
    [orgId, applicationId]);
  return {
    open: r.rows.some((d) => d.status === "open"),
    upheld: r.rows.some((d) => d.status === "decided" && d.decision === "upheld")
  };
}

/**
 * Earn the fee for an application that has moved in. Safe to call twice (the
 * ledger row has an idempotency key). Returns
 *   { earned: true, feeId, invoiceId, invoiceNumber, amountCents, brokerShareCents }
 *   { earned: false, reason }  reason: already_earned | dispute_open | no_registration |
 *                              expired | known_prospect | fee_terms_unknown | zero_fee
 * and writes a `fee.not_earned` event for every "no" that staff may need to see.
 */
export async function earnPlacementFee(tx, { orgId, applicationId, actor }) {
  const a = (await tx.query(
    `SELECT id, building_id, broker_id, rent_cents, stage, registration_sent_at, lease_signed_at, known_prospect_at,
            renter_id
       FROM yd_applications WHERE id = $1 AND org_id = $2`, [applicationId, orgId])).rows[0];
  if (!a) throw new YdError(404, "not_found", "We could not find that application.");

  if (await liveFeeFor(tx, orgId, applicationId)) return { earned: false, reason: "already_earned" };

  const dispute = await attributionState(tx, orgId, applicationId);
  if (dispute.open) {
    await recordEvent(tx, {
      orgId, name: "fee.not_earned", entityKind: "application", entityId: applicationId,
      payload: { reason: "dispute_open" }, actor, idempotencyKey: `fee-not-earned:${applicationId}:dispute_open`
    });
    return { earned: false, reason: "dispute_open" };
  }

  const elig = feeEligible({
    registrationSentAt: a.registration_sent_at,
    leaseSignedAt: a.lease_signed_at,
    // Only an UPHELD claim counts, and the application carries the building's own visitor-record date.
    knownProspectAt: dispute.upheld ? (a.known_prospect_at || new Date()) : null
  });
  if (!elig.eligible) {
    await recordEvent(tx, {
      orgId, name: "fee.not_earned", entityKind: "application", entityId: applicationId,
      payload: { reason: elig.reason, expires_at: elig.expiresAt, days_after_registration: elig.daysAfterRegistration },
      actor, idempotencyKey: `fee-not-earned:${applicationId}:${elig.reason}`
    });
    return { earned: false, reason: elig.reason };
  }

  const b = (await tx.query(
    `SELECT id, leasing_email, name, fee_kind, fee_percent, fee_flat_cents, refund_days, payment_terms_days
       FROM yd_buildings WHERE id = $1 AND org_id = $2`, [a.building_id, orgId])).rows[0];
  const amount = placementFeeCents({
    feeKind: b.fee_kind, feePercent: b.fee_percent, feeFlatCents: num(b.fee_flat_cents), rentCents: num(a.rent_cents)
  });
  if (amount === null || amount === 0) {
    const reason = amount === null ? "fee_terms_unknown" : "zero_fee";
    await recordEvent(tx, {
      orgId, name: "fee.not_earned", entityKind: "application", entityId: applicationId,
      payload: { reason }, actor, idempotencyKey: `fee-not-earned:${applicationId}:${reason}`
    });
    return { earned: false, reason };
  }

  const fee = (await tx.query(
    `INSERT INTO yd_fee_ledger (org_id, application_id, building_id, kind, amount_cents, idempotency_key)
     VALUES ($1,$2,$3,'placement_fee',$4,$5)
     ON CONFLICT (org_id, idempotency_key) DO NOTHING
     RETURNING id`, [orgId, applicationId, a.building_id, amount, `fee:${applicationId}`])).rows[0];
  if (!fee) return { earned: false, reason: "already_earned" };
  await recordEvent(tx, {
    orgId, name: "fee.earned", entityKind: "application", entityId: applicationId,
    payload: { fee_id: fee.id, amount_cents: amount, fee_kind: b.fee_kind, registration_sent_at: a.registration_sent_at },
    actor
  });

  // The invoice. due_at is filled by the database from the building's payment terms.
  const inv = (await tx.query(
    `INSERT INTO yd_invoices (org_id, building_id, total_cents) VALUES ($1,$2,$3)
     RETURNING id, number, due_at`, [orgId, a.building_id, amount])).rows[0];
  await tx.query(
    `UPDATE yd_fee_ledger SET status = 'invoiced', invoice_id = $3 WHERE id = $1 AND org_id = $2`, [fee.id, orgId, inv.id]);
  await tx.query(`UPDATE yd_applications SET stage = 'invoiced' WHERE id = $1 AND org_id = $2`, [applicationId, orgId]);
  await recordEvent(tx, {
    orgId, name: "invoice.issued", entityKind: "invoice", entityId: inv.id,
    payload: { number: inv.number, total_cents: amount, application_id: applicationId, due_at: inv.due_at }, actor
  });
  if (b.leasing_email) {
    await queueOutbox(tx, {
      orgId, channel: "email", to: b.leasing_email, templateKey: "yd-invoice-issued",
      context: { source: "Yesdoor", invoice: { number: inv.number, total_cents: amount, due_at: new Date(inv.due_at).toISOString() }, building: { name: b.name } },
      relatedKind: "invoice", relatedId: inv.id
    });
  }

  // The first-touch broker's share, only for a licensed split partner (a software
  // partner pays for the tool and shares nothing).
  let share = 0;
  if (a.broker_id) {
    const k = (await tx.query(
      `SELECT plan, split_percent FROM yd_brokers WHERE id = $1 AND org_id = $2`, [a.broker_id, orgId])).rows[0];
    share = k ? brokerShareCents({ feeCents: amount, splitPercent: k.split_percent, plan: k.plan }) : 0;
    if (share > 0) {
      const row = (await tx.query(
        `INSERT INTO yd_broker_ledger (org_id, broker_id, fee_ledger_id, amount_cents, status)
         VALUES ($1,$2,$3,$4,'earned') RETURNING id`, [orgId, a.broker_id, fee.id, share])).rows[0];
      await recordEvent(tx, {
        orgId, name: "broker.earned", entityKind: "broker", entityId: a.broker_id,
        payload: { broker_ledger_id: row.id, fee_id: fee.id, amount_cents: share, application_id: applicationId }, actor
      });
    }
  }
  return { earned: true, feeId: fee.id, invoiceId: inv.id, invoiceNumber: inv.number, amountCents: amount, brokerShareCents: share };
}

/**
 * Take a placement fee back.
 *   earned / invoiced  void the row, the invoice (it carries only this fee) and any broker share
 *   paid / safe        a new negative row that reverses it in full; the original stays
 * Returns { action: "none" | "voided" | "reversed", feeId, refundFeeId? }.
 */
export async function reversePlacementFee(tx, { orgId, applicationId, actor, why }) {
  const fee = await liveFeeFor(tx, orgId, applicationId);
  if (!fee) return { action: "none" };
  const amount = Number(fee.amount_cents);

  if (fee.status === "earned" || fee.status === "invoiced") {
    await tx.query(
      `UPDATE yd_broker_ledger SET status = 'void'
        WHERE fee_ledger_id = $1 AND org_id = $2 AND status IN ('earned', 'held')`, [fee.id, orgId]);
    await tx.query(`UPDATE yd_fee_ledger SET status = 'void' WHERE id = $1 AND org_id = $2`, [fee.id, orgId]);
    if (fee.invoice_id) {
      await tx.query(`UPDATE yd_invoices SET status = 'void' WHERE id = $1 AND org_id = $2 AND status = 'open'`, [fee.invoice_id, orgId]);
    }
    await recordEvent(tx, {
      orgId, name: "fee.voided", entityKind: "application", entityId: applicationId,
      payload: { fee_id: fee.id, amount_cents: amount, why }, actor
    });
    return { action: "voided", feeId: fee.id };
  }

  const refund = (await tx.query(
    `INSERT INTO yd_fee_ledger (org_id, application_id, building_id, kind, amount_cents, reverses_id, idempotency_key)
     VALUES ($1,$2,$3,'refund',$4,$5,$6)
     ON CONFLICT (org_id, idempotency_key) DO NOTHING
     RETURNING id`, [orgId, applicationId, fee.building_id, reversalCents(amount), fee.id, `refund:${fee.id}`])).rows[0];
  await recordEvent(tx, {
    orgId, name: "fee.reversed", entityKind: "application", entityId: applicationId,
    payload: { fee_id: fee.id, refund_fee_id: refund ? refund.id : null, amount_cents: amount, why }, actor
  });
  // A broker share that was already paid out cannot be taken back by a trigger: say so for staff.
  const paidOut = (await tx.query(
    `SELECT id, broker_id, amount_cents FROM yd_broker_ledger
      WHERE fee_ledger_id = $1 AND org_id = $2 AND status = 'paid'`, [fee.id, orgId])).rows[0];
  if (paidOut) {
    await recordEvent(tx, {
      orgId, name: "broker.clawback_needed", entityKind: "broker", entityId: paidOut.broker_id,
      payload: { broker_ledger_id: paidOut.id, amount_cents: Number(paidOut.amount_cents), application_id: applicationId },
      actor, idempotencyKey: `clawback:${paidOut.id}`
    });
  }
  return { action: "reversed", feeId: fee.id, refundFeeId: refund ? refund.id : null };
}

/**
 * The renter left inside the refund window: reverse the PAID fee and move the
 * application to `refunded`. Returns { feeId, refundFeeId }.
 */
export async function refundPaidFee(tx, { orgId, applicationId, actor, why, now = new Date() }) {
  const fee = await liveFeeFor(tx, orgId, applicationId);
  const b0 = fee ? (await tx.query(`SELECT refund_days FROM yd_buildings WHERE id = $1 AND org_id = $2`, [fee.building_id, orgId])).rows[0] : null;
  if (fee && fee.status === "safe") {
    throw new YdError(409, "refund_window_closed",
      `The ${b0.refund_days}-day refund window has closed: the fee is safe, so no refund is owed.`);
  }
  if (!fee || fee.status !== "paid") {
    throw new YdError(409, "no_paid_fee", "There is no paid fee on this placement to refund.");
  }
  const b = b0;
  if (!refundWindowOpen({ paidAt: fee.paid_at, refundDays: b.refund_days, now })) {
    throw new YdError(409, "refund_window_closed",
      `The ${b.refund_days}-day refund window has closed: the fee is safe, so no refund is owed.`);
  }
  const out = await reversePlacementFee(tx, { orgId, applicationId, actor, why });
  await tx.query(`UPDATE yd_applications SET stage = 'refunded' WHERE id = $1 AND org_id = $2 AND stage = 'paid'`, [applicationId, orgId]);
  return { feeId: out.feeId, refundFeeId: out.refundFeeId };
}
