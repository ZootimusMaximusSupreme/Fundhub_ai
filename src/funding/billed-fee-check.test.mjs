/* N7 (live 2026-09-18) — a success-fee bill that stops matching the rule after
   a bank decision changes must reach a person.

   The stub below is Sim Eight-Funding round 2 as it stands on live: the bill
   INV-B4B9C768 was raised for 10% of $25,000 (Arizona Bank & Trust, Approved at
   funding time) and paid, then Arizona was moved to Denied and Native American
   Bank was recorded Approved at $10,000. The rule now says $1,000.

   Before the fix, setApplicationStatus saved the answer and nothing else: no
   task, no signal, the bill and the rule silently apart. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  checkBilledSuccessFee,
  flagBilledFeeDrift,
  feeDriftTask,
  CARD_STACKING,
  FEE_DRIFT_TASK_SOURCE
} from "./billed-fee-check.mjs";
import { PRODUCT } from "./card-stacking-rounds.mjs";
import { setApplicationStatus, setApprovalExclusion } from "../applications/status.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const ROUND = "bc9bb3a1-c043-4554-8512-a2e005612541";
const CLIENT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const INVOICE = "b4b9c768-5488-4202-9d2a-323a28b8aec6";
const APP = "2a5b7ba0-ab99-4179-8ebc-e786f3b5b266";

function stubDb({
  product = "card_stacking",
  invoice = { id: INVOICE, org_id: ORG, client_id: CLIENT, status: "paid", amount_due: "2500.00", funding_round_id: ROUND },
  confirmed = [{ id: APP, approved_amount: "10000.00", lender_name: "Native American Bank" }],
  pct = "10.0000",
  paid = "2500.00",
  appRow = { id: APP, org_id: ORG, client_id: CLIENT, funding_round_id: ROUND, status: "Approved", lender_name: "Native American Bank" }
} = {}) {
  const calls = [];
  const tasks = [];
  return {
    calls,
    tasks,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/UPDATE applications/i.test(sql) && /RETURNING/i.test(sql)) {
        return { rows: [{ ...appRow, status: params[2] ?? appRow.status }] };
      }
      if (/SELECT id, status, approval_excluded_at/i.test(sql)) return { rows: [appRow] };
      if (/INSERT INTO application_decisions/i.test(sql)) return { rows: [{ id: "d1" }] };
      if (/FROM funding_rounds\b/i.test(sql)) {
        return { rows: [{ id: ROUND, org_id: ORG, client_id: CLIENT, round_number: 2, product }] };
      }
      if (/FROM invoices\b/i.test(sql)) return { rows: invoice ? [invoice] : [] };
      if (/FROM funding_round_sales/i.test(sql)) {
        return { rows: pct == null ? [] : [{ sale_id: "sale-8", agreed_success_fee_percent: pct }] };
      }
      if (/FROM applications/i.test(sql)) return { rows: confirmed };
      if (/FROM invoice_payments/i.test(sql)) return { rows: [{ paid }] };
      if (/SELECT id FROM tasks/i.test(sql)) {
        const hit = tasks.find((t) => t.body === params[2]);
        return { rows: hit ? [{ id: hit.id }] : [] };
      }
      if (/INSERT INTO tasks/i.test(sql)) {
        const row = { id: `t${tasks.length + 1}`, title: params[2], body: params[3], source: params[5], role: params[6] };
        tasks.push(row);
        return { rows: [{ id: row.id }] };
      }
      return { rows: [] };
    }
  };
}

test("the scope constant is the card-stacking product the rounds are stamped with", () => {
  assert.equal(CARD_STACKING, PRODUCT);
});

test("#8 round 2 as it stands on live: billed $2,500, the rule now says $1,000", async () => {
  const check = await checkBilledSuccessFee(stubDb(), { orgId: ORG, fundingRoundId: ROUND });
  assert.equal(check.matches, false);
  assert.equal(check.billedCents, 250000);
  assert.equal(check.ruleFeeCents, 100000, "10% of the $10,000 confirmed approval");
  assert.equal(check.paidCents, 250000);
  assert.equal(check.invoiceNumber, "INV-B4B9C768");
});

test("a bank decision on a billed round whose bill no longer matches makes a task for a person", async () => {
  const db = stubDb();
  await setApplicationStatus(db, {
    orgId: ORG,
    applicationId: APP,
    status: "Approved",
    staff: { name: "Advisor" },
    patch: { approved_amount: "10000.00" }
  });
  assert.equal(db.tasks.length, 1, "the mismatch reached nobody");
  const [task] = db.tasks;
  assert.equal(task.source, FEE_DRIFT_TASK_SOURCE);
  assert.equal(task.role, "funding_advisor");
  assert.match(task.title, /INV-B4B9C768/);
  assert.match(task.title, /\$2,500\.00/);
  assert.match(task.title, /\$1,000\.00/);
  assert.match(task.body, /\$1,500\.00 has been paid over/);
  assert.match(task.body, /It is paid, so it cannot be voided/);
  assert.doesNotMatch(task.body, /void it and raise a new one/, "a paid bill cannot be voided — do not tell a person to");
  // The bill itself is never touched here — it is locked once sent (031).
  assert.ok(!db.calls.some((c) => /UPDATE invoices/i.test(c.sql)), "the bill must not be edited");
  assert.ok(!db.calls.some((c) => /INSERT INTO messages/i.test(c.sql)), "nothing goes to the client");
});

test("the same decision pressed twice does not stack a second task", async () => {
  const db = stubDb();
  const opts = { orgId: ORG, applicationId: APP, status: "Approved", staff: { name: "Advisor" } };
  await setApplicationStatus(db, opts);
  await setApplicationStatus(db, opts);
  assert.equal(db.tasks.length, 1);
});

test("marking an approval as not counting on a billed round is checked too", async () => {
  const db = stubDb();
  await setApprovalExclusion(db, {
    orgId: ORG, applicationId: APP, excluded: true, reason: "Withdrawn", staff: { name: "Advisor" }
  });
  assert.equal(db.tasks.length, 1);
});

test("a bill that still matches the rule makes no task", async () => {
  const db = stubDb({
    invoice: { id: INVOICE, org_id: ORG, client_id: CLIENT, status: "sent", amount_due: "1000.00", funding_round_id: ROUND },
    paid: "0"
  });
  await setApplicationStatus(db, { orgId: ORG, applicationId: APP, status: "Approved", staff: { name: "A" } });
  assert.equal(db.tasks.length, 0);
});

test("nothing confirmed left is 'nothing to bill', never a $0 fee", async () => {
  const db = stubDb({ confirmed: [] });
  const out = await flagBilledFeeDrift(db, { orgId: ORG, application: { funding_round_id: ROUND, client_id: CLIENT } });
  assert.equal(out.matches, false);
  assert.equal(out.check.ruleFeeCents, null);
  const [task] = db.tasks;
  assert.match(task.title, /no bank approval with a dollar amount is left/);
  assert.doesNotMatch(task.title, /\$0\.00/);
  assert.match(task.body, /nothing to bill/);
});

test("an alt-fin round is out of scope — it bills off the Lendflow figure", async () => {
  const db = stubDb({ product: "alt_fin" });
  const out = await flagBilledFeeDrift(db, { orgId: ORG, application: { funding_round_id: ROUND } });
  assert.equal(out, null);
  assert.equal(db.tasks.length, 0);
});

test("no bill on the round, or no round on the application: nothing to compare", async () => {
  assert.equal(await flagBilledFeeDrift(stubDb({ invoice: null }), { orgId: ORG, application: { funding_round_id: ROUND } }), null);
  assert.equal(await flagBilledFeeDrift(stubDb(), { orgId: ORG, application: { funding_round_id: null } }), null);
});

test("a fault while checking never turns the saved bank answer into an error", async () => {
  const db = {
    calls: 0,
    async query(sql) {
      this.calls += 1;
      if (/UPDATE applications/i.test(sql) && /RETURNING/i.test(sql)) {
        return { rows: [{ id: APP, funding_round_id: ROUND, status: "Denied" }] };
      }
      if (/FROM funding_rounds\b/i.test(sql)) throw new Error("boom");
      return { rows: [] };
    }
  };
  const row = await setApplicationStatus(db, { orgId: ORG, applicationId: APP, status: "Denied", staff: { name: "A" } });
  assert.equal(row.status, "Denied");
});

test("the task words: an unpaid bill that is too high names no overpayment", () => {
  const { title, body } = feeDriftTask({
    invoice: { id: INVOICE, status: "sent" },
    invoiceNumber: "INV-B4B9C768",
    roundNumber: 2,
    billedCents: 250000,
    ruleFeeCents: 100000,
    paidCents: 0,
    confirmedApprovedAmount: 10000,
    feePercent: 10
  });
  assert.match(title, /10% of the approvals now on file is \$1,000\.00/);
  assert.match(body, /void it and raise a new one/);
  assert.doesNotMatch(body, /paid over/);
});
