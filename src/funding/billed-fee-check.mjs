/* After the bill — does the success fee still follow the rule?

   THE RULE (owner-set 2026-08-30, docs/CLOSEOUT-FEE-BASIS.md): the success fee
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

   WHY THIS FLAGS AND DOES NOT RE-PRICE. A bill that has left draft is locked
   in the database (invoices_guard, db/migrations/031_invoices.sql): "the way
   to change what a client owes after that is to void and reissue, which leaves
   both facts on the record." A paid bill cannot be voided at all, and what to
   do with money paid over the fee is a refund decision. None of that is a
   thing to do silently inside a button press that records a bank's answer.
   So the bank decision is saved exactly as before, and when it leaves the
   round's bill disagreeing with the rule, a person gets a task that states
   both figures. Nothing is sent to the client.

   SCOPE. Card-stacking rounds only — the same scope as the funded guard in
   src/handlers/money-chain.mjs. The alt-fin rail records no per-bank rows and
   bills off the Lendflow figure on the event, so the per-bank rule does not
   describe its bills.

   NULL IS UNKNOWN (CLAUDE.md §12). A round with nothing confirmed left has NO
   rule fee — it is reported as "none", never as a $0 fee. */

import { toCents, fromCents } from "../commissions/money.mjs";
import { resolveSuccessFee, amountOrNull } from "./success-fee.mjs";
import { invoiceDisplayNumber, formatBalanceDue } from "../invoices/index.mjs";
import { paidOnInvoiceCents } from "../invoices/allocate.mjs";
import { createTask } from "../lib/create-task.mjs";

/** Same value as PRODUCT in ./card-stacking-rounds.mjs. Not imported from
 *  there because that module pulls in the event bus, and this one is loaded by
 *  src/applications/status.mjs. billed-fee-check.test.mjs pins the two equal. */
export const CARD_STACKING = "card_stacking";

export const FEE_DRIFT_TASK_SOURCE = "success-fee-after-bill";

/* The bill for a round is the success-fee invoice F-07 raised for it. A voided
   or written-off bill is no longer asking anyone for money, so it is not
   checked. Oldest first — F-07 raises one per round (successFeeKey). */
const SQL_ROUND_BILL = `
SELECT i.id, i.org_id, i.client_id, i.status, i.amount_due, i.funding_round_id
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
    "The success fee is a percent of the bank approvals that carry a dollar amount (docs/CLOSEOUT-FEE-BASIS.md).",
    "",
    `Bill ${bill}: ${dollars(check.billedCents)} (status: ${check.invoice.status}).`,
    check.confirmedApprovedAmount != null
      ? `Approvals with a dollar amount now on this round: ${formatBalanceDue(check.confirmedApprovedAmount)}.`
      : "Approvals with a dollar amount now on this round: none.",
    `What the fee should be now: ${check.ruleFeeCents == null ? "nothing to bill" : dollars(check.ruleFeeCents)}.`,
    `Paid on this bill so far: ${dollars(check.paidCents)}.`,
    "",
    check.invoice.status === "paid"
      ? "The bill does not change by itself. It is paid, so it cannot be voided or changed."
      : "The bill does not change by itself. Once a bill has gone out its amount is locked; to change it, void it and raise a new one."
  ];
  const target = check.ruleFeeCents ?? 0;
  if (check.paidCents > target) {
    lines.push(`${dollars(check.paidCents - target)} has been paid over what the fee should be. Whether to refund it is an owner decision.`);
  }
  lines.push("", `[fee-drift:${check.invoice.id}:${check.ruleFeeCents ?? "none"}:${check.paidCents}]`);
  return { title, body: lines.join("\n") };
}

/**
 * Called after a bank decision is saved. When the application sits on a
 * card-stacking round whose success-fee bill no longer matches the rule, make
 * one task for a person (one per distinct state — pressing the same button
 * twice does not stack a second task).
 *
 * NEVER THROWS. The bank's answer is already saved by the time this runs; a
 * fault here must not turn that into an error on the button. It is logged with
 * a greppable prefix instead.
 *
 * @returns {Promise<null | { matches: boolean, task: object|null, check: object }>}
 */
export async function flagBilledFeeDrift(db, { orgId = null, application = null } = {}) {
  const fundingRoundId = application?.funding_round_id || null;
  if (!fundingRoundId) return null;
  try {
    const check = await checkBilledSuccessFee(db, { orgId, fundingRoundId });
    if (!check) return null;
    if (check.matches) return { matches: true, task: null, check };

    const { title, body } = feeDriftTask(check);
    const task = await createTask(db, {
      orgId: check.invoice.org_id || orgId,
      clientId: check.invoice.client_id || application.client_id || null,
      title,
      body,
      sourceWorkflow: FEE_DRIFT_TASK_SOURCE,
      // Same owner as F-07's own fee tasks (src/workflows/f-07-funding-locked.mjs).
      assigneeRole: "funding_advisor"
    });
    return { matches: false, task, check };
  } catch (err) {
    console.error(
      `[billed-fee-check] could not compare the bill with the rule ` +
      `(round=${fundingRoundId}): ${err?.message || err}`
    );
    return null;
  }
}
