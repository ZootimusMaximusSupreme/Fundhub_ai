/* After the bill — does the success fee still follow the rule?

   THE RULE (owner-set 2026-08-30, docs/finance/CLOSEOUT-FEE-BASIS.md): the success fee
   is the agreed percent of CONFIRMED APPROVALS on the round, defined once in
   ./success-fee.mjs. F-07 applies it at the moment the round is funded and
   freezes the figure on the bill.

   THE HOLE THIS CLOSES. Bank decisions keep being recorded after that moment,
   and nothing looked at the bill again. Measured on live 2026-09-18, Sim
   Eight-Funding round 2: Arizona Bank & Trust was Approved at $25,000 when the
   round was funded (18:58 UTC, 2026-09-17), so INV-B4B9C768 billed 10% of
   $25,000 = $2,500 — correct at that moment. Thirty minutes later the same bank
   was moved to Denied and Native American Bank was recorded Approved at
   $10,000. The rule now says $1,000. The bill still said $2,500, it was paid,
   and no person was ever told the two had come apart.

   THE FEE FOLLOWS THE APPROVALS (owner-set 2026-09-18, final). Chris, on the
   bill above: the fee must follow the real approval, not $25k. So when a bank
   answer leaves the bill disagreeing with the rule, the bill is REISSUED at
   the rule fee (followRuleFee below). The 2026-09-18 first pass only flagged
   it with a task; that is superseded.

   HOW, AND WHY THIS WAY. A bill that has left draft is locked in the database
   (invoices_guard, db/migrations/031_invoices.sql): "the way to change what a
   client owes after that is to void and reissue, which leaves both facts on
   the record." So the old bill is voided and a new one raised at the rule fee,
   in one transaction. Money already paid on the old bill is carried to the new
   one up to the new fee — a 'correction' row on the old bill, a 'payment' row
   on the new one, so the total received never changes. Anything paid OVER the
   new fee stays recorded on the old bill, and a person gets a task: whether to
   refund it is an owner decision, and no money moves here.

   A new bill already covered by what was paid is announced invoice.paid, and
   nothing chases it or reaches the client. A new bill with money still owing
   is announced invoice.sent exactly as F-07 announces the first one, so
   collections (ar-collections, first notice onward) follow the new bill
   instead of the void one.

   NOTHING CONFIRMED LEFT is not a $0 fee (CLAUDE.md §12) — the bill is left as
   it is and a person gets the task, as before.

   SCOPE. Card-stacking rounds only — the same scope as the funded guard in
   src/handlers/money-chain.mjs. The alt-fin rail records no per-bank rows and
   bills off the Lendflow figure on the event, so the per-bank rule does not
   describe its bills.

   NULL IS UNKNOWN (CLAUDE.md §12). A round with nothing confirmed left has NO
   rule fee — it is reported as "none", never as a $0 fee. */

import { toCents, fromCents } from "../commissions/money.mjs";
import { resolveSuccessFee, amountOrNull } from "./success-fee.mjs";
import {
  invoiceDisplayNumber, formatBalanceDue, createInvoice, markSent, markPaid, announceInvoice
} from "../invoices/index.mjs";
import { paidOnInvoiceCents } from "../invoices/allocate.mjs";
import { createTask } from "../lib/create-task.mjs";
import { withTransaction } from "../db/with-transaction.mjs";
import { createFundingCloseoutSafe } from "./closeout.mjs";

/** Same value as PRODUCT in ./card-stacking-rounds.mjs. Not imported from
 *  there because that module pulls in the event bus, and this one is loaded by
 *  src/applications/status.mjs. billed-fee-check.test.mjs pins the two equal. */
export const CARD_STACKING = "card_stacking";

export const FEE_DRIFT_TASK_SOURCE = "success-fee-after-bill";

/* The bill for a round is the success-fee invoice F-07 raised for it. A voided
   or written-off bill is no longer asking anyone for money, so it is not
   checked. Oldest first — F-07 raises one per round (successFeeKey). */
const SQL_ROUND_BILL = `
SELECT i.id, i.org_id, i.client_id, i.sale_id, i.status, i.amount_due, i.funding_round_id
  FROM invoices i
 WHERE i.funding_round_id = $1::uuid
   AND ($2::uuid IS NULL OR i.org_id = $2::uuid)
   AND (i.source = 'funding_success_fee' OR i.invoice_type = 'success_fee')
   AND i.status NOT IN ('void', 'written_off')
 ORDER BY i.created_at ASC, i.id ASC
 LIMIT 1`;

const SQL_ROUND = `
SELECT id, org_id, client_id, round_number, product
  FROM funding_rounds
 WHERE id = $1::uuid
   AND ($2::uuid IS NULL OR org_id = $2::uuid)
 LIMIT 1`;

/**
 * Compare a round's success-fee bill with what the rule says today.
 *
 * @returns {Promise<null | {
 *   matches: boolean, invoice: object, invoiceNumber: string, roundNumber: number|null,
 *   billedCents: number|null, ruleFeeCents: number|null, paidCents: number,
 *   confirmedApprovedAmount: number|null, feePercent: number|null, reason: string|null
 * }>}
 * null when there is nothing to compare: no such round, not a card-stacking
 * round, or no live success-fee bill on it.
 */
export async function checkBilledSuccessFee(db, { orgId = null, fundingRoundId } = {}) {
  if (!fundingRoundId) return null;
  const round = (await db.query(SQL_ROUND, [fundingRoundId, orgId || null])).rows?.[0];
  if (!round) return null;
  if (String(round.product || "") !== CARD_STACKING) return null;

  const invoice = (await db.query(SQL_ROUND_BILL, [fundingRoundId, orgId || null])).rows?.[0];
  if (!invoice) return null;

  const fee = await resolveSuccessFee(db, { orgId: orgId || round.org_id || null, fundingRoundId });
  const billed = amountOrNull(invoice.amount_due);
  const billedCents = billed == null ? null : toCents(billed);
  const ruleFeeCents = fee.ok ? fee.feeCents : null;
  const paidCents = await paidOnInvoiceCents(db, invoice.id);

  return {
    matches: billedCents != null && ruleFeeCents != null && billedCents === ruleFeeCents,
    invoice,
    invoiceNumber: invoiceDisplayNumber(invoice),
    roundNumber: round.round_number ?? null,
    billedCents,
    ruleFeeCents,
    paidCents,
    confirmedApprovedAmount: fee.confirmedApprovedAmount ?? null,
    feePercent: fee.feePercent ?? null,
    reason: fee.reason ?? null
  };
}

function dollars(cents) {
  return cents == null ? "unknown" : formatBalanceDue(fromCents(cents));
}

/** The task a person reads. Pure, so the words can be tested without a database. */
export function feeDriftTask(check) {
  const bill = check.invoiceNumber;
  const pct = check.feePercent != null ? `${check.feePercent}%` : "the agreed percent";
  const title = check.ruleFeeCents == null
    ? `Bill ${bill} no longer matches the bank approvals — it bills ${dollars(check.billedCents)}, and no bank approval with a dollar amount is left on this round`
    : `Bill ${bill} no longer matches the bank approvals — it bills ${dollars(check.billedCents)}, but ${pct} of the approvals now on file is ${dollars(check.ruleFeeCents)}`;

  const lines = [
    `A bank decision on round ${check.roundNumber ?? "?"} changed after this bill was raised.`,
    "The success fee is a percent of the bank approvals that carry a dollar amount (docs/finance/CLOSEOUT-FEE-BASIS.md).",
    "",
    `Bill ${bill}: ${dollars(check.billedCents)} (status: ${check.invoice.status}).`,
    check.confirmedApprovedAmount != null
      ? `Approvals with a dollar amount now on this round: ${formatBalanceDue(check.confirmedApprovedAmount)}.`
      : "Approvals with a dollar amount now on this round: none.",
    `What the fee should be now: ${check.ruleFeeCents == null ? "nothing to bill" : dollars(check.ruleFeeCents)}.`,
    `Paid on this bill so far: ${dollars(check.paidCents)}.`,
    "",
    check.ruleFeeCents == null
      ? "The bill is left as it is: no bank approval with a dollar amount is on this round, so there is no fee to reissue it at."
      : "The bill could not be reissued at the rule fee automatically. To change it, void it and raise a new one."
  ];
  const target = check.ruleFeeCents ?? 0;
  if (check.paidCents > target) {
    lines.push(`${dollars(check.paidCents - target)} has been paid over what the fee should be. Whether to refund it is an owner decision.`);
  }
  lines.push("", `[fee-drift:${check.invoice.id}:${check.ruleFeeCents ?? "none"}:${check.paidCents}]`);
  return { title, body: lines.join("\n") };
}

/** One replacement per bill: a second press, or two at once, cannot reissue twice. */
export function reissueKey(invoiceId) {
  return `invoice|success_fee|reissue-of|${invoiceId}`;
}

/**
 * Make the round's bill follow the rule: void it and raise a new one at the
 * rule fee, carrying what was paid across up to the new fee. One transaction.
 *
 * @returns {Promise<null | {
 *   alreadyReissued?: boolean, voided: object|null, invoice: object|null,
 *   carriedCents: number, overpaidCents: number
 * }>}
 * null when there is nothing to follow: the bill matches, or nothing is
 * confirmed (no fee is not a $0 fee). THROWS on a database fault — the caller
 * falls back to telling a person.
 */
export async function followRuleFee(db, check) {
  if (!check || check.matches || check.ruleFeeCents == null) return null;
  const old = check.invoice;
  const ruleCents = check.ruleFeeCents;
  const paidCents = Math.max(check.paidCents || 0, 0);
  const carriedCents = Math.min(paidCents, ruleCents);
  const why = `the success fee follows the bank approvals — ${check.feePercent}% of ` +
    `${formatBalanceDue(check.confirmedApprovedAmount)} confirmed = ${dollars(ruleCents)}`;

  const out = await withTransaction(db, async (tx) => {
    const next = await createInvoice(tx, {
      orgId: old.org_id,
      clientId: old.client_id,
      source: "funding_success_fee",
      amount: fromCents(ruleCents),
      saleId: old.sale_id ?? null,
      fundingRoundId: old.funding_round_id,
      idempotencyKey: reissueKey(old.id),
      notes: `Reissue of ${check.invoiceNumber}: ${why}`
    });
    if (!next) return { alreadyReissued: true };
    const nextNumber = invoiceDisplayNumber(next);

    if (carriedCents > 0) {
      // Stored positive; the balance views subtract a 'correction' (031).
      await tx.query(
        `INSERT INTO invoice_payments (org_id, invoice_id, kind, amount, method, notes)
         VALUES ($1, $2, 'correction', $3, 'reissue', $4)`,
        [old.org_id, old.id, fromCents(carriedCents), `Moved to ${nextNumber} — ${why}`]
      );
      await tx.query(
        `INSERT INTO invoice_payments (org_id, invoice_id, kind, amount, method, notes)
         VALUES ($1, $2, 'payment', $3, 'reissue', $4)`,
        [old.org_id, next.id, fromCents(carriedCents), `Moved from ${check.invoiceNumber} — paid there before the reissue`]
      );
    }

    // The amount is untouched, so invoices_guard allows this even on a paid bill.
    const voided = (await tx.query(
      `UPDATE invoices
          SET status = 'void', voided_at = now(),
              notes = concat_ws(E'\\n', notes, $2::text)
        WHERE id = $1 AND status NOT IN ('void', 'written_off')
      RETURNING *`,
      [old.id, `Void: replaced by ${nextNumber} — ${why}`]
    )).rows[0];
    if (!voided) throw new Error(`bill ${check.invoiceNumber} is already void or written off`);

    let invoice = next;
    if (old.status !== "draft" || carriedCents > 0) {
      invoice = (await markSent(tx, { invoiceId: next.id })) || invoice;
      if (carriedCents >= ruleCents) {
        invoice = (await markPaid(tx, { invoiceId: next.id })) || invoice;
      } else if (carriedCents > 0) {
        invoice = (await tx.query(
          `UPDATE invoices SET status = 'partially_paid' WHERE id = $1 AND status = 'sent' RETURNING *`,
          [next.id]
        )).rows[0] || invoice;
      }
    }
    return { voided, invoice, carriedCents, overpaidCents: paidCents - carriedCents };
  });
  if (out.alreadyReissued) return { ...out, voided: null, invoice: null, carriedCents: 0, overpaidCents: 0 };

  // Both facts on the record. invoice.sent only while money is still owing —
  // it is what starts collections (src/workflows/ar-collections.mjs) on the
  // right bill, exactly as F-07 does for the first one.
  await announceInvoice(db, "invoice.voided", out.voided);
  await announceInvoice(db, "invoice.created", out.invoice);
  if (out.invoice.status === "paid") await announceInvoice(db, "invoice.paid", out.invoice);
  else if (out.invoice.status !== "draft") await announceInvoice(db, "invoice.sent", out.invoice);

  // The closeout record carries the same fee; it reads the same rule.
  await createFundingCloseoutSafe(db, { orgId: old.org_id, fundingRoundId: old.funding_round_id });
  return out;
}

/** The task when more was paid than the new fee. Pure. */
export function overpaidTask(check, reissue) {
  const oldNo = check.invoiceNumber;
  const newNo = invoiceDisplayNumber(reissue.invoice);
  const over = dollars(reissue.overpaidCents);
  return {
    title: `Bill ${oldNo} was reissued as ${newNo} at ${dollars(check.ruleFeeCents)} — ${over} was paid over the new fee`,
    body: [
      `A bank decision on round ${check.roundNumber ?? "?"} changed after bill ${oldNo} was raised.`,
      `The success fee follows the bank approvals that carry a dollar amount: ${check.feePercent}% of ${formatBalanceDue(check.confirmedApprovedAmount)} = ${dollars(check.ruleFeeCents)} (docs/finance/CLOSEOUT-FEE-BASIS.md).`,
      "",
      `Old bill ${oldNo}: ${dollars(check.billedCents)}, now void.`,
      `New bill ${newNo}: ${dollars(check.ruleFeeCents)}, status ${reissue.invoice.status}.`,
      `${dollars(reissue.carriedCents)} of what was paid on ${oldNo} was moved to ${newNo}.`,
      `${over} was paid over the new fee and stays recorded on ${oldNo}. Whether to refund it is an owner decision. No money has moved.`,
      "",
      `[fee-overpaid:${check.invoice.id}:${reissue.invoice.id}]`
    ].join("\n")
  };
}

/**
 * Called after a bank decision is saved. When the application sits on a
 * card-stacking round whose success-fee bill no longer matches the rule, the
 * bill is reissued at the rule fee (followRuleFee). A person gets one task
 * when more was paid than the new fee, when nothing is confirmed left to bill
 * at, or when the reissue fails (one task per distinct state — pressing the
 * same button twice does not stack a second one).
 *
 * NEVER THROWS. The bank's answer is already saved by the time this runs; a
 * fault here must not turn that into an error on the button. It is logged with
 * a greppable prefix instead.
 *
 * @returns {Promise<null | { matches: boolean, task: object|null, check: object, reissue?: object }>}
 */
export async function flagBilledFeeDrift(db, { orgId = null, application = null } = {}) {
  const fundingRoundId = application?.funding_round_id || null;
  if (!fundingRoundId) return null;
  try {
    const check = await checkBilledSuccessFee(db, { orgId, fundingRoundId });
    if (!check) return null;
    if (check.matches) return { matches: true, task: null, check };

    const taskFor = (spec) => createTask(db, {
      orgId: check.invoice.org_id || orgId,
      clientId: check.invoice.client_id || application.client_id || null,
      ...spec,
      sourceWorkflow: FEE_DRIFT_TASK_SOURCE,
      // Same owner as F-07's own fee tasks (src/workflows/f-07-funding-locked.mjs).
      assigneeRole: "funding_advisor"
    });

    if (check.ruleFeeCents != null) {
      try {
        const reissue = await followRuleFee(db, check);
        if (reissue) {
          const task = reissue.overpaidCents > 0 ? await taskFor(overpaidTask(check, reissue)) : null;
          return { matches: false, reissue, task, check };
        }
      } catch (err) {
        console.error(
          `[billed-fee-check] could not reissue bill ${check.invoiceNumber} at the rule fee ` +
          `(round=${fundingRoundId}): ${err?.message || err}`
        );
      }
    }

    // Nothing confirmed left to bill at, or the reissue failed: a person is told.
    const task = await taskFor(feeDriftTask(check));
    return { matches: false, task, check };
  } catch (err) {
    console.error(
      `[billed-fee-check] could not compare the bill with the rule ` +
      `(round=${fundingRoundId}): ${err?.message || err}`
    );
    return null;
  }
}
