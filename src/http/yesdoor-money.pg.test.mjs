// Postgres-backed tests for the money:
//   POST /api/yesdoor/staff/payment   POST /api/yesdoor/staff/refund
//   POST /api/yesdoor/staff/broker-payout   POST /api/yesdoor/staff/disputes
//   and the daily yd-fee-safe job.
//
// Proved: only the money roles (and the owner) log payments, refunds and payouts;
// the fee lifecycle earned -> invoiced -> paid -> safe (60 days after payment, never
// sooner), a refund is a NEW negative row that reverses the original in full, a broker's
// share is held -> payable -> paid and is payable only after the fee is safe, an
// attribution dispute decides whether a fee exists at all, and another company's
// rows are never touched.
//
// SCRATCH database only, as fundhub_app. Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture, call, creditLeaks } from "../yesdoor/testing/fixture.mjs";
import { useFixtureEnv, mkSignedBuilding, mkPlacement, mkPaidFee, one, rows } from "../yesdoor/testing/b4.mjs";
import { releaseSafeFees } from "../yesdoor/store/money.mjs";
import { createAccountSession } from "../yesdoor/auth/session.mjs";
import { runFeeSafe, FEE_SAFE_JOB, FEE_SAFE_CRON, ydFeeSafe } from "../yesdoor/workflows/yd-fee-safe.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const NOWHERE = "11111111-1111-4111-8111-111111111111";

describe("yesdoor money", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, h;
  const t = () => fx.tokens;
  const post = (door, token, body) => call(h[door], { method: "POST", token, body });
  const eventsOf = (id) => rows(db, `SELECT name, payload FROM yd_events WHERE entity_id = $1 ORDER BY occurred_at, id`, [id]);
  const mkBroker = async (status = "active", plan = "split") => (await db.query(
    `INSERT INTO yd_brokers (org_id, name, email, plan, split_percent, status) VALUES ($1,'Pay Test Broker',$2,$3,25,$4) RETURNING id`,
    [fx.orgA, `pay-${Math.random().toString(36).slice(2, 9)}@example.test`, plan, status])).rows[0].id;
  /** Move a lease-signed placement in through the real endpoint: a fee, an invoice. */
  const moveIn = async (b, p) => {
    const r = await call(h.update, { method: "POST", token: b.token, body: { applicationId: p.applicationId, stage: "moved_in" } });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    return r.body.fee;
  };
  const invoicedFee = async (opts = {}) => {
    const b = opts.building || await mkSignedBuilding(db, fx, opts.buildingOpts || {});
    const p = await mkPlacement(db, fx, b, { to: "lease_signed", leaseRentCents: opts.rent || 150000, brokerId: opts.brokerId || null });
    return { b, p, fee: await moveIn(b, p) };
  };
  const pay = (invoice, over = {}) => post("payment", t().collectionsA, { invoiceId: invoice, method: "ach", ref: `ACH-${Math.random().toString(36).slice(2, 9)}`, ...over });

  before(async () => {
    fx = await buildYdFixture(db);
    useFixtureEnv(fx);
    h = {};
    for (const [name, file] of [
      ["payment", "staff/payment"], ["refund", "staff/refund"], ["payout", "staff/broker-payout"], ["disputes", "staff/disputes"],
      ["update", "building/update"], ["ledger", "staff/ledger"], ["brokerMoney", "broker/money"]
    ]) h[name] = (await import(`../../api/yesdoor/${file}.mjs`)).default;
  });
  after(async () => { await close(); });

  /* ── who may touch the money ──────────────────────────────────────────── */

  test("payment, refund and payout: nobody 401, any account login 401, a closer 403, sales 403; ops, collections and the owner get through", async () => {
    for (const door of ["payment", "refund", "payout"]) {
      assert.equal((await post(door, undefined, {})).code, 401, `${door} no session`);
      assert.equal((await post(door, t().renterA, {})).code, 401, `${door} renter`);
      assert.equal((await post(door, t().buildingA, {})).code, 401, `${door} building`);
      assert.equal((await post(door, t().brokerA, {})).code, 401, `${door} broker`);
      assert.equal((await post(door, t().closerA, {})).code, 403, `${door} closer`);
      assert.equal((await post(door, t().salesA, {})).code, 403, `${door} sales`);
      for (const who of ["opsA", "collectionsA", "ownerA"]) assert.equal((await post(door, t()[who], {})).code, 400, `${door} ${who} gets through to a plain 400`);
      assert.equal((await call(h[door], { token: t().ownerA, method: "GET" })).code, 405, `${door} GET`);
    }
  });

  /* ── a building pays an invoice ───────────────────────────────────────── */

  describe("POST staff/payment (an invoice)", () => {
    test("logging a payment: invoice paid, fee paid, placement paid, the broker's share held for the refund window", async () => {
      const broker = await mkBroker();
      const { p, fee } = await invoicedFee({ brokerId: broker, rent: 170000, buildingOpts: { refundDays: 45 } });
      const r = await pay(fee.invoiceId, { method: "wire", ref: "WIRE-77" });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.alreadyPaid, false);
      assert.deepEqual([r.body.invoice.status, r.body.invoice.method, r.body.invoice.ref, r.body.invoice.totalCents], ["paid", "wire", "WIRE-77", 170000]);
      assert.deepEqual(r.body.fees.map((f) => [f.id, f.amountCents, f.status]), [[fee.feeId, 170000, "paid"]]);
      assert.equal(r.body.brokerHeld, 1);

      const inv = await one(db, `SELECT status, payment_method, payment_ref, paid_at FROM yd_invoices WHERE id = $1`, [fee.invoiceId]);
      assert.deepEqual([inv.status, inv.payment_method, inv.payment_ref], ["paid", "wire", "WIRE-77"]);
      const row = await one(db, `SELECT status, paid_at FROM yd_fee_ledger WHERE id = $1`, [fee.feeId]);
      assert.equal(row.status, "paid");
      assert.equal(new Date(row.paid_at).getTime(), new Date(inv.paid_at).getTime(), "the fee and the invoice share the payment moment");
      assert.equal((await one(db, `SELECT stage FROM yd_applications WHERE id = $1`, [p.applicationId])).stage, "paid");
      const share = await one(db, `SELECT status, hold_until, amount_cents FROM yd_broker_ledger WHERE fee_ledger_id = $1`, [fee.feeId]);
      assert.equal(share.status, "held");
      assert.equal(Number(share.amount_cents), 42500);
      assert.equal(Math.round((new Date(share.hold_until) - new Date(row.paid_at)) / 86_400_000), 45, "held for THIS building's refund days");

      const names = (await eventsOf(p.applicationId)).map((e) => e.name);
      assert.ok(names.includes("fee.paid") && names.includes("application.paid"));
      assert.ok((await eventsOf(fee.invoiceId)).some((e) => e.name === "invoice.paid"));
      assert.deepEqual(creditLeaks(r.body), []);
    });

    test("the invoice can be named by its number; paidAt records when the money really arrived", async () => {
      const { fee } = await invoicedFee();
      const inv = await one(db, `SELECT number, issued_at FROM yd_invoices WHERE id = $1`, [fee.invoiceId]);
      const r = await post("payment", t().opsA, { invoiceNumber: inv.number, method: "check", ref: "CHECK-1001", paidAt: new Date(inv.issued_at).toISOString() });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(new Date((await one(db, `SELECT paid_at FROM yd_invoices WHERE id = $1`, [fee.invoiceId])).paid_at).getTime(), new Date(inv.issued_at).getTime());
    });

    test("paying the same invoice again with the same reference is a harmless 200; another reference is a 409", async () => {
      const { p, fee } = await invoicedFee();
      assert.equal((await pay(fee.invoiceId, { ref: "SAME-1" })).code, 200);
      const eventsBefore = (await eventsOf(p.applicationId)).length;
      const again = await pay(fee.invoiceId, { ref: "SAME-1" });
      assert.equal(again.code, 200);
      assert.equal(again.body.alreadyPaid, true);
      assert.equal((await eventsOf(p.applicationId)).length, eventsBefore);
      const other = await pay(fee.invoiceId, { ref: "DIFFERENT" });
      assert.equal(other.code, 409);
      assert.equal(other.body.error, "already_paid");
      assert.equal((await one(db, `SELECT payment_ref FROM yd_invoices WHERE id = $1`, [fee.invoiceId])).payment_ref, "SAME-1");
    });

    test("bad requests: no invoice named, a bad method, no reference, a future or too-early date, an unknown or voided invoice", async () => {
      const { fee } = await invoicedFee();
      assert.equal((await post("payment", t().opsA, { method: "ach", ref: "X" })).code, 400);
      assert.equal((await pay(fee.invoiceId, { method: "bitcoin" })).code, 400);
      assert.equal((await pay(fee.invoiceId, { method: undefined })).code, 400);
      assert.equal((await pay(fee.invoiceId, { ref: "" })).code, 400);
      assert.equal((await pay(fee.invoiceId, { ref: undefined })).code, 400);
      assert.equal((await pay(fee.invoiceId, { paidAt: new Date(Date.now() + 86_400_000).toISOString() })).code, 400);
      assert.equal((await pay(fee.invoiceId, { paidAt: "yesterday-ish" })).code, 400);
      assert.equal((await pay(fee.invoiceId, { paidAt: new Date(Date.now() - 400 * 86_400_000).toISOString() })).code, 400, "before the invoice was issued");
      assert.equal((await pay("nope")).code, 400);
      assert.equal((await pay(NOWHERE)).code, 404);
      assert.equal((await one(db, `SELECT status FROM yd_invoices WHERE id = $1`, [fee.invoiceId])).status, "open", "nothing above paid it");
      await db.query(`UPDATE yd_invoices SET status = 'void' WHERE id = $1`, [fee.invoiceId]);
      const voided = await pay(fee.invoiceId);
      assert.equal(voided.code, 409);
      assert.equal(voided.body.error, "invoice_void");
    });

    test("another company's invoice is a 404 and stays open; an already-paid fixture invoice refuses a new reference", async () => {
      const r = await post("payment", t().opsA, { invoiceId: fx.B.invoice, method: "ach", ref: "CROSS-ORG" });
      assert.equal(r.code, 404);
      assert.equal((await one(db, `SELECT payment_ref FROM yd_invoices WHERE id = $1`, [fx.B.invoice])).payment_ref, "ACH-TEST-1");
      const done = await post("payment", t().opsA, { invoiceId: fx.A.invoice, method: "ach", ref: "NEW-REF" });
      assert.equal(done.code, 409);
    });
  });

  /* ── the fee goes safe ────────────────────────────────────────────────── */

  describe("the daily yd-fee-safe job", () => {
    test("a fee paid 61 days ago goes safe, its placement goes safe, the broker's share becomes payable; a second run does nothing", async () => {
      const b = await mkSignedBuilding(db, fx);
      const broker = await mkBroker();
      const old = await mkPaidFee(db, fx, b, { paidDaysAgo: 61, brokerId: broker });
      const young = await mkPaidFee(db, fx, b, { paidDaysAgo: 30, brokerId: broker });
      const out = await releaseSafeFees(db, { orgId: fx.orgA });
      assert.deepEqual(out.errors, []);
      assert.ok(out.fees >= 1 && out.brokersReleased >= 1);

      const fee = await one(db, `SELECT status, paid_at, safe_at FROM yd_fee_ledger WHERE id = $1`, [old.feeId]);
      assert.equal(fee.status, "safe");
      assert.ok(fee.safe_at >= fee.paid_at);
      assert.equal((await one(db, `SELECT stage, safe_at FROM yd_applications WHERE id = $1`, [old.placement.applicationId])).stage, "safe");
      assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE id = $1`, [old.brokerLedgerId])).status, "payable");
      const names = (await eventsOf(old.placement.applicationId)).map((e) => e.name);
      assert.ok(names.includes("fee.safe") && names.includes("application.safe"));
      assert.ok((await eventsOf(broker)).some((e) => e.name === "broker.payable"));

      // 30 days is not 60: nothing moves.
      assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [young.feeId])).status, "paid");
      assert.equal((await one(db, `SELECT stage FROM yd_applications WHERE id = $1`, [young.placement.applicationId])).stage, "paid");
      assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE id = $1`, [young.brokerLedgerId])).status, "held");

      const again = await releaseSafeFees(db, { orgId: fx.orgA });
      assert.equal(again.fees, 0);
      assert.equal(again.brokersReleased, 0);
    });

    test("the building's own refund days decide: a 30-day building's fee is safe after 31 days", async () => {
      const b = await mkSignedBuilding(db, fx, { refundDays: 30 });
      const x = await mkPaidFee(db, fx, b, { paidDaysAgo: 31, refundDays: 30 });
      const y = await mkPaidFee(db, fx, b, { paidDaysAgo: 29, refundDays: 30 });
      await releaseSafeFees(db, { orgId: fx.orgA });
      assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [x.feeId])).status, "safe");
      assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [y.feeId])).status, "paid");
    });

    test("a fee that was refunded never goes safe, even after its 60 days", async () => {
      const b = await mkSignedBuilding(db, fx);
      const x = await mkPaidFee(db, fx, b, { paidDaysAgo: 61 });
      await db.query(
        `INSERT INTO yd_fee_ledger (org_id, application_id, building_id, kind, amount_cents, reverses_id, idempotency_key)
         VALUES ($1,$2,$3,'refund',-150000,$4,$5)`, [fx.orgA, x.placement.applicationId, b.buildingId, x.feeId, `refund:${x.feeId}`]);
      await releaseSafeFees(db, { orgId: fx.orgA });
      assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [x.feeId])).status, "paid");
    });

    test("it works one company at a time, and the job never crosses companies when asked not to", async () => {
      const bB = await mkSignedBuilding(db, fx, { side: "B" });
      const inB = await mkPaidFee(db, fx, bB, { paidDaysAgo: 61, side: "B" });
      const bA = await mkSignedBuilding(db, fx);
      const inA = await mkPaidFee(db, fx, bA, { paidDaysAgo: 61 });
      await releaseSafeFees(db, { orgId: fx.orgB });
      assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [inB.feeId])).status, "safe");
      assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [inA.feeId])).status, "paid", "company A was not asked");
      await releaseSafeFees(db, { orgId: fx.orgA });
      assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [inA.feeId])).status, "safe");
    });

    test("the database itself refuses 'safe' too early and a broker payable before the fee is safe", async () => {
      const b = await mkSignedBuilding(db, fx);
      const broker = await mkBroker();
      const young = await mkPaidFee(db, fx, b, { paidDaysAgo: 10, brokerId: broker });
      await assert.rejects(db.query(`UPDATE yd_fee_ledger SET status = 'safe' WHERE id = $1`, [young.feeId]), /yd_not_safe_yet/);
      await assert.rejects(db.query(`UPDATE yd_broker_ledger SET status = 'payable' WHERE id = $1`, [young.brokerLedgerId]), /yd_broker_hold/);
    });

    test("it is a registered daily job, and one pass reports ok", async () => {
      assert.equal(ydFeeSafe.opts.id, FEE_SAFE_JOB);
      assert.equal(FEE_SAFE_JOB, "yd-fee-safe");
      assert.equal(FEE_SAFE_CRON, "0 8 * * *");
      const { functions } = await import("../workflows/index.mjs");
      assert.ok(functions.some((f) => f.opts?.id === "yd-fee-safe"));
      const { INNGEST_JOBS } = await import("../pulse/heartbeats.mjs");
      assert.ok(INNGEST_JOBS.some(([id, cron]) => id === "yd-fee-safe" && cron === FEE_SAFE_CRON));
      const out = await runFeeSafe(db, { orgId: fx.orgA });
      assert.equal(out.ok, true);
      assert.deepEqual(out.errors, []);
    });
  });

  /* ── the lifecycle end to end ─────────────────────────────────────────── */

  test("the whole life of a fee: earned and invoiced at move-in, paid by the building, still held at day 10, safe after 60, the broker then paid", async () => {
    const broker = await mkBroker();
    const b = await mkSignedBuilding(db, fx);
    const p = await mkPlacement(db, fx, b, { to: "lease_signed", leaseRentCents: 160000, brokerId: broker });

    // earned + invoiced at move-in (through the endpoint)
    const fee = await moveIn(b, p);
    assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [fee.feeId])).status, "invoiced");
    assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE fee_ledger_id = $1`, [fee.feeId])).status, "earned");

    // paid (through the endpoint)
    assert.equal((await pay(fee.invoiceId)).code, 200);
    assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [fee.feeId])).status, "paid");
    assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE fee_ledger_id = $1`, [fee.feeId])).status, "held");

    // the job today changes nothing about it: the window is open
    await releaseSafeFees(db, { orgId: fx.orgA });
    assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [fee.feeId])).status, "paid");
    assert.equal((await one(db, `SELECT stage FROM yd_applications WHERE id = $1`, [p.applicationId])).stage, "paid");
    const early = await post("payout", t().opsA, { brokerId: broker, payoutRef: "TOO-EARLY" });
    assert.equal(early.code, 409);
    assert.equal(early.body.error, "nothing_payable");

    // sixty-one days later (the same shape, built with backdated times), then safe and paid out
    const b2 = await mkSignedBuilding(db, fx);
    const aged = await mkPaidFee(db, fx, b2, { paidDaysAgo: 61, brokerId: broker });
    await releaseSafeFees(db, { orgId: fx.orgA });
    assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [aged.feeId])).status, "safe");
    const paidOut = await post("payout", t().collectionsA, { brokerId: broker, payoutRef: "WIRE-LIFE-1" });
    assert.equal(paidOut.code, 200, JSON.stringify(paidOut.body));
    assert.equal(paidOut.body.paid, 1, "only the aged one: the young one is still held");
    assert.equal(paidOut.body.totalCents, 37500);
    assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE fee_ledger_id = $1`, [fee.feeId])).status, "held");
    assert.equal((await one(db, `SELECT status, payout_ref FROM yd_broker_ledger WHERE id = $1`, [aged.brokerLedgerId])).payout_ref, "WIRE-LIFE-1");
  });

  /* ── broker payouts ───────────────────────────────────────────────────── */

  describe("POST staff/broker-payout", () => {
    test("held -> payable -> paid: a share is held until the job releases it, then it is paid with a reference", async () => {
      const b = await mkSignedBuilding(db, fx);
      const broker = await mkBroker();
      const x = await mkPaidFee(db, fx, b, { paidDaysAgo: 61, brokerId: broker, rentCents: 162500 });
      const before = await post("payout", t().opsA, { brokerId: broker, payoutRef: "WIRE-1" });
      assert.equal(before.code, 409, "held until the fee is safe");
      assert.equal(before.body.error, "nothing_payable");
      assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE id = $1`, [x.brokerLedgerId])).status, "held");

      await releaseSafeFees(db, { orgId: fx.orgA });
      assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE id = $1`, [x.brokerLedgerId])).status, "payable");

      const r = await post("payout", t().opsA, { brokerId: broker, payoutRef: "WIRE-1" });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.paid, 1);
      assert.equal(r.body.totalCents, 40625);
      assert.deepEqual(r.body.rows, [{ id: x.brokerLedgerId, amountCents: 40625 }]);
      const row = await one(db, `SELECT status, payout_ref, paid_at FROM yd_broker_ledger WHERE id = $1`, [x.brokerLedgerId]);
      assert.deepEqual([row.status, row.payout_ref], ["paid", "WIRE-1"]);
      assert.ok(row.paid_at);
      assert.ok((await eventsOf(broker)).some((e) => e.name === "broker.paid"));

      // The broker sees it on their own money page.
      const acct = (await db.query(`INSERT INTO yd_accounts (org_id, kind, email, broker_id) VALUES ($1,'broker',$2,$3) RETURNING id`,
        [fx.orgA, `pay-acct-${Math.random().toString(36).slice(2, 8)}@example.test`, broker])).rows[0].id;
      const token = (await createAccountSession(db, { accountId: acct, orgId: fx.orgA })).token;
      const money = await call(h.brokerMoney, { token });
      assert.equal(money.body.summary.paidCents, 40625);
      assert.equal(money.body.rows.find((y) => y.id === x.brokerLedgerId).payoutRef, "WIRE-1");
      assert.deepEqual(creditLeaks(money.body), []);

      // The same payout reference again changes nothing; a new one finds nothing to pay.
      const same = await post("payout", t().opsA, { brokerId: broker, payoutRef: "WIRE-1" });
      assert.equal(same.code, 200);
      assert.equal(same.body.alreadyPaid, true);
      assert.equal(same.body.paid, 0);
      assert.equal((await post("payout", t().opsA, { brokerId: broker, payoutRef: "WIRE-2" })).code, 409);
    });

    test("the fixture's own broker share (paid 61 days ago) is released and paid the same way", async () => {
      await releaseSafeFees(db, { orgId: fx.orgA });
      const r = await post("payout", t().ownerA, { brokerId: fx.A.broker, payoutRef: "WIRE-FIXTURE" });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.ok(r.body.rows.some((x) => x.id === fx.A.brokerRow && x.amountCents === 40625));
    });

    test("a subset by id; held rows and other brokers' rows cannot be named", async () => {
      const b = await mkSignedBuilding(db, fx);
      const broker = await mkBroker();
      const one1 = await mkPaidFee(db, fx, b, { paidDaysAgo: 61, brokerId: broker });
      const one2 = await mkPaidFee(db, fx, b, { paidDaysAgo: 61, brokerId: broker });
      const held = await mkPaidFee(db, fx, b, { paidDaysAgo: 5, brokerId: broker });
      await releaseSafeFees(db, { orgId: fx.orgA });

      const notPayable = await post("payout", t().opsA, { brokerId: broker, payoutRef: "R1", ledgerIds: [one1.brokerLedgerId, held.brokerLedgerId] });
      assert.equal(notPayable.code, 409);
      assert.equal(notPayable.body.error, "not_payable");
      const foreign = await post("payout", t().opsA, { brokerId: broker, payoutRef: "R1", ledgerIds: [fx.A.brokerRow] });
      assert.equal(foreign.code, 404);

      const some = await post("payout", t().opsA, { brokerId: broker, payoutRef: "R2", ledgerIds: [one1.brokerLedgerId] });
      assert.equal(some.code, 200);
      assert.equal(some.body.paid, 1);
      assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE id = $1`, [one2.brokerLedgerId])).status, "payable", "the other stays payable");
      assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE id = $1`, [held.brokerLedgerId])).status, "held");
      const rest = await post("payout", t().opsA, { brokerId: broker, payoutRef: "R3" });
      assert.equal(rest.body.paid, 1);
      assert.equal(rest.body.rows[0].id, one2.brokerLedgerId);
    });

    test("a broker who is not an active partner is not paid, and another company's broker is a 404", async () => {
      const b = await mkSignedBuilding(db, fx);
      const broker = await mkBroker("active");
      await mkPaidFee(db, fx, b, { paidDaysAgo: 61, brokerId: broker });
      await releaseSafeFees(db, { orgId: fx.orgA });
      await db.query(`UPDATE yd_brokers SET status = 'paused' WHERE id = $1`, [broker]);
      const r = await post("payout", t().opsA, { brokerId: broker, payoutRef: "PAUSED" });
      assert.equal(r.code, 409);
      assert.equal(r.body.error, "broker_not_active");
      assert.equal((await post("payout", t().opsA, { brokerId: fx.B.broker, payoutRef: "CROSS" })).code, 404);
      assert.equal((await post("payout", t().opsA, { brokerId: NOWHERE, payoutRef: "NONE" })).code, 404);
    });

    test("bad requests: no broker, no payout reference, a bad id list", async () => {
      assert.equal((await post("payout", t().opsA, { payoutRef: "X" })).code, 400);
      assert.equal((await post("payout", t().opsA, { brokerId: fx.A.broker })).code, 400);
      assert.equal((await post("payout", t().opsA, { brokerId: "nope", payoutRef: "X" })).code, 400);
      assert.equal((await post("payout", t().opsA, { brokerId: fx.A.broker, payoutRef: "X", ledgerIds: [] })).code, 400);
      assert.equal((await post("payout", t().opsA, { brokerId: fx.A.broker, payoutRef: "X", ledgerIds: ["nope"] })).code, 400);
      assert.equal((await post("payout", t().opsA, { brokerId: fx.A.broker, payoutRef: "X", ledgerIds: "all" })).code, 400);
    });
  });

  /* ── refunds ──────────────────────────────────────────────────────────── */

  describe("POST staff/refund and the refund payout", () => {
    test("inside the window: a NEW negative row reverses the paid fee in full, the original stays, the placement is refunded, the broker's share is void", async () => {
      const broker = await mkBroker();
      const { p, fee } = await invoicedFee({ brokerId: broker, rent: 180000 });
      await pay(fee.invoiceId);
      const r = await post("refund", t().collectionsA, { applicationId: p.applicationId, reason: "Renter left in week 3" });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.stage, "refunded");
      assert.equal(r.body.alreadyRefunded, false);
      const ledger = await rows(db, `SELECT id, kind, amount_cents, status, reverses_id FROM yd_fee_ledger WHERE application_id = $1 ORDER BY created_at, id`, [p.applicationId]);
      assert.deepEqual(ledger.map((x) => [x.kind, Number(x.amount_cents), x.status]), [["placement_fee", 180000, "paid"], ["refund", -180000, "earned"]]);
      assert.equal(ledger[1].reverses_id, fee.feeId);
      assert.equal(r.body.refundFeeId, ledger[1].id);
      assert.equal((await one(db, `SELECT stage FROM yd_applications WHERE id = $1`, [p.applicationId])).stage, "refunded");
      assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE fee_ledger_id = $1`, [fee.feeId])).status, "void");
      // The net on the ledger is zero.
      assert.equal(ledger.reduce((n, x) => n + Number(x.amount_cents), 0), 0);
      assert.ok((await eventsOf(p.applicationId)).some((e) => e.name === "fee.reversed"));
    });

    test("refunding twice is a harmless 200; after the window the fee is safe and no refund is owed", async () => {
      const { p, fee } = await invoicedFee();
      await pay(fee.invoiceId);
      await post("refund", t().opsA, { applicationId: p.applicationId, reason: "left" });
      const again = await post("refund", t().opsA, { applicationId: p.applicationId, reason: "left" });
      assert.equal(again.code, 200);
      assert.equal(again.body.alreadyRefunded, true);
      assert.equal((await rows(db, `SELECT id FROM yd_fee_ledger WHERE application_id = $1 AND kind = 'refund'`, [p.applicationId])).length, 1);

      const b = await mkSignedBuilding(db, fx);
      const old = await mkPaidFee(db, fx, b, { paidDaysAgo: 61 });
      const closed = await post("refund", t().opsA, { applicationId: old.placement.applicationId, reason: "too late" });
      assert.equal(closed.code, 409);
      assert.equal(closed.body.error, "refund_window_closed");
      assert.equal((await rows(db, `SELECT id FROM yd_fee_ledger WHERE application_id = $1 AND kind = 'refund'`, [old.placement.applicationId])).length, 0);
    });

    test("no paid fee, unknown placement, another company's placement, no reason: each is refused", async () => {
      const { p } = await invoicedFee();                              // invoiced, not yet paid
      const unpaid = await post("refund", t().opsA, { applicationId: p.applicationId, reason: "x" });
      assert.equal(unpaid.code, 409);
      assert.equal(unpaid.body.error, "no_paid_fee");
      assert.equal((await post("refund", t().opsA, { applicationId: NOWHERE, reason: "x" })).code, 404);
      assert.equal((await post("refund", t().opsA, { applicationId: fx.B.app1, reason: "x" })).code, 404);
      assert.equal((await post("refund", t().opsA, { applicationId: p.applicationId })).code, 400);
      assert.equal((await post("refund", t().opsA, { reason: "x" })).code, 400);
    });

    test("paying the refund back to the building: owed -> paid once; a made-up id is a 404", async () => {
      const { p, fee } = await invoicedFee();
      await pay(fee.invoiceId);
      const refund = await post("refund", t().opsA, { applicationId: p.applicationId, reason: "left" });
      const paid = await post("payment", t().collectionsA, { feeRefundId: refund.body.refundFeeId, method: "ach", ref: "ACH-REFUND-1" });
      assert.equal(paid.code, 200, JSON.stringify(paid.body));
      assert.equal(paid.body.refund.status, "paid");
      assert.equal((await one(db, `SELECT status, paid_at FROM yd_fee_ledger WHERE id = $1`, [refund.body.refundFeeId])).status, "paid");
      const again = await post("payment", t().collectionsA, { feeRefundId: refund.body.refundFeeId, method: "ach", ref: "ACH-REFUND-1" });
      assert.equal(again.body.alreadyPaid, true);
      assert.equal((await post("payment", t().collectionsA, { feeRefundId: NOWHERE, method: "ach", ref: "X" })).code, 404);
      assert.equal((await post("payment", t().collectionsA, { feeRefundId: fee.feeId, method: "ach", ref: "X" })).code, 404, "a fee row is not a refund row");
      assert.equal((await post("payment", t().collectionsA, { feeRefundId: refund.body.refundFeeId, method: "ach" })).code, 400);
    });

    test("paying a renter their application fee back: owed -> paid once", async () => {
      const b = await mkSignedBuilding(db, fx, { appFeeCents: 4500 });
      const p = await mkPlacement(db, fx, b, { to: "applied" });
      await call(h.update, { method: "POST", token: b.token, body: { applicationId: p.applicationId, stage: "denied", reason: "rules" } });
      const owed = await one(db, `SELECT id, status FROM yd_renter_refunds WHERE application_id = $1`, [p.applicationId]);
      assert.equal(owed.status, "owed");
      const r = await post("payment", t().collectionsA, { renterRefundId: owed.id, ref: "ACH-RENTER-1" });
      assert.equal(r.code, 200);
      assert.equal(r.body.refund.amountCents, 4500);
      assert.equal((await one(db, `SELECT status, paid_at FROM yd_renter_refunds WHERE id = $1`, [owed.id])).status, "paid");
      assert.equal((await post("payment", t().collectionsA, { renterRefundId: owed.id, ref: "ACH-RENTER-1" })).body.alreadyPaid, true);
      assert.equal((await post("payment", t().collectionsA, { renterRefundId: owed.id })).code, 400);
    });

    test("every money response is free of credit data", async () => {
      const { p, fee } = await invoicedFee();
      const bodies = [
        (await pay(fee.invoiceId)).body,
        (await post("refund", t().opsA, { applicationId: p.applicationId, reason: "left" })).body,
        (await call(h.ledger, { token: t().collectionsA })).body
      ];
      for (const body of bodies) assert.deepEqual(creditLeaks(body), []);
    });
  });

  /* ── disputes ─────────────────────────────────────────────────────────── */

  describe("POST staff/disputes", () => {
    const open = (kind, applicationId, token = t().salesA, extra = {}) => post("disputes", token, { kind, applicationId, ...extra });
    const decide = (disputeId, decision, token = t().opsA, extra = {}) => post("disputes", token, { disputeId, decision, ...extra });

    test("anyone on the desk can open one; it is due in 14 days; only one open of a kind per placement", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "registered" });
      for (const who of ["salesA", "opsA", "collectionsA", "ownerA"]) {
        const kind = { salesA: "attribution", opsA: "fee", collectionsA: "denial", ownerA: "attribution" }[who];
        if (who === "ownerA") continue;                              // the owner repeats a kind; covered below
        const r = await open(kind, p.applicationId, t()[who], { note: `from ${who}` });
        assert.equal(r.code, 201, `${who}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.dispute.status, "open");
        assert.equal(r.body.dispute.kind, kind);
        assert.equal(r.body.dispute.subject.application_id, p.applicationId);
        assert.equal(r.body.dispute.openedBy.kind, "staff");
        const days = (new Date(r.body.dispute.dueBy) - new Date(r.body.dispute.openedAt)) / 86_400_000;
        assert.ok(Math.abs(days - 14) < 0.01, "due in 14 days");
      }
      const dupe = await open("attribution", p.applicationId, t().ownerA);
      assert.equal(dupe.code, 409);
      assert.equal(dupe.body.error, "dispute_open");
      const list = await call(h.disputes, { token: t().salesA, query: { status: "open" } });
      assert.ok(list.body.disputes.filter((d) => d.subject.application_id === p.applicationId).length >= 3);
      assert.deepEqual(creditLeaks(list.body), []);
    });

    test("bad requests: unknown kind, no placement, unknown or another company's placement", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "registered" });
      assert.equal((await post("disputes", t().salesA, { applicationId: p.applicationId })).code, 400);
      assert.equal((await open("complaint", p.applicationId)).code, 400);
      assert.equal((await post("disputes", t().salesA, { kind: "fee" })).code, 400);
      assert.equal((await open("fee", NOWHERE)).code, 404);
      assert.equal((await open("fee", fx.B.app1)).code, 404);
    });

    test("only ops and the owner decide; sales and collections cannot, and the dispute stays open", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "registered" });
      const d = (await open("denial", p.applicationId)).body.dispute;
      for (const who of ["salesA", "collectionsA"]) assert.equal((await decide(d.id, "upheld", t()[who])).code, 403, who);
      assert.equal((await decide(d.id, "upheld", t().closerA)).code, 403);
      assert.equal((await decide(d.id, "upheld", t().renterA)).code, 401);
      assert.equal((await decide(d.id, "upheld", null)).code, 401);
      assert.equal((await one(db, `SELECT status FROM yd_disputes WHERE id = $1`, [d.id])).status, "open");
      const ok = await decide(d.id, "rejected", t().ownerA, { note: "The denial stands." });
      assert.equal(ok.code, 200);
      assert.equal(ok.body.dispute.status, "decided");
      assert.equal(ok.body.dispute.decision, "rejected");
      assert.equal(ok.body.dispute.decidedBy, fx.staffIds.ownerA);
      assert.equal(ok.body.dispute.subject.decision_note, "The denial stands.");
      assert.deepEqual(ok.body.effect, { fee: "none" }, "a denial dispute moves no money");
    });

    test("a decided dispute is never re-decided: the same decision is a harmless 200, another is a 409", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "registered" });
      const d = (await open("fee", p.applicationId)).body.dispute;
      assert.equal((await decide(d.id, "rejected")).code, 200);
      const same = await decide(d.id, "rejected");
      assert.equal(same.code, 200);
      assert.equal(same.body.unchanged, true);
      const flip = await decide(d.id, "upheld");
      assert.equal(flip.code, 409);
      assert.equal(flip.body.error, "already_decided");
      assert.equal((await one(db, `SELECT decision FROM yd_disputes WHERE id = $1`, [d.id])).decision, "rejected");
      assert.equal((await decide(NOWHERE, "upheld")).code, 404);
      assert.equal((await decide(fx.B.dispute, "upheld")).code, 404, "another company's dispute");
      assert.equal((await one(db, `SELECT status FROM yd_disputes WHERE id = $1`, [fx.B.dispute])).status, "open");
      assert.equal((await decide(d.id, "maybe")).code, 400);
      assert.equal((await post("disputes", t().opsA, { disputeId: "nope", decision: "upheld" })).code, 400);
    });

    test("attribution upheld BEFORE move-in: no fee is ever earned at that building for this renter", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "lease_signed" });
      const d = (await open("attribution", p.applicationId)).body.dispute;
      const won = await decide(d.id, "upheld");
      assert.deepEqual(won.body.effect, { fee: "none" });
      const r = await call(h.update, { method: "POST", token: b.token, body: { applicationId: p.applicationId, stage: "moved_in" } });
      assert.equal(r.body.fee.earned, false);
      assert.equal(r.body.fee.reason, "known_prospect");
      assert.equal(await one(db, `SELECT id FROM yd_fee_ledger WHERE application_id = $1`, [p.applicationId]), null);
    });

    test("attribution claim open at move-in holds the fee; rejected earns it now, with its invoice", async () => {
      const b = await mkSignedBuilding(db, fx);
      const broker = await mkBroker();
      const p = await mkPlacement(db, fx, b, { to: "lease_signed", leaseRentCents: 140000, brokerId: broker });
      const claim = await call(h.update, { method: "POST", token: b.token, body: {
        applicationId: p.applicationId, knownProspect: { evidenceAt: new Date(Date.now() - 9 * 86_400_000).toISOString(), evidence: "Our own guest card" } } });
      assert.equal(claim.code, 200);
      const held = await call(h.update, { method: "POST", token: b.token, body: { applicationId: p.applicationId, stage: "moved_in" } });
      assert.equal(held.body.fee.reason, "dispute_open");

      const rejected = await decide(claim.body.dispute.id, "rejected");
      assert.equal(rejected.code, 200, JSON.stringify(rejected.body));
      assert.equal(rejected.body.effect.fee, "earned");
      assert.equal(rejected.body.effect.amountCents, 140000);
      assert.match(rejected.body.effect.invoiceNumber, /^YD-INV-/);
      assert.equal((await one(db, `SELECT stage FROM yd_applications WHERE id = $1`, [p.applicationId])).stage, "invoiced");
      const share = await one(db, `SELECT amount_cents, status FROM yd_broker_ledger WHERE fee_ledger_id = $1`, [rejected.body.effect.feeId]);
      assert.deepEqual([Number(share.amount_cents), share.status], [35000, "earned"]);
    });

    test("attribution upheld AFTER a fee exists: an unpaid fee is voided with its invoice and the broker's share; a paid one is reversed by a negative row", async () => {
      const broker = await mkBroker();
      const unpaid = await invoicedFee({ brokerId: broker });
      const d1 = (await open("attribution", unpaid.p.applicationId)).body.dispute;
      const voided = await decide(d1.id, "upheld");
      assert.equal(voided.body.effect.fee, "voided");
      assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [unpaid.fee.feeId])).status, "void");
      assert.equal((await one(db, `SELECT status FROM yd_invoices WHERE id = $1`, [unpaid.fee.invoiceId])).status, "void");
      assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE fee_ledger_id = $1`, [unpaid.fee.feeId])).status, "void");
      assert.ok((await eventsOf(unpaid.p.applicationId)).some((e) => e.name === "fee.voided"));

      const paid = await invoicedFee({ brokerId: broker, rent: 130000 });
      await pay(paid.fee.invoiceId);
      const d2 = (await open("fee", paid.p.applicationId, t().opsA)).body.dispute;
      const reversed = await decide(d2.id, "upheld");
      assert.equal(reversed.body.effect.fee, "reversed");
      const ledger = await rows(db, `SELECT kind, amount_cents, status FROM yd_fee_ledger WHERE application_id = $1 ORDER BY created_at, id`, [paid.p.applicationId]);
      assert.deepEqual(ledger.map((x) => [x.kind, Number(x.amount_cents), x.status]), [["placement_fee", 130000, "paid"], ["refund", -130000, "earned"]]);
      assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE fee_ledger_id = $1`, [paid.fee.feeId])).status, "void");
    });

    test("a fee dispute rejected keeps the fee exactly as it was", async () => {
      const { p, fee } = await invoicedFee();
      const d = (await open("fee", p.applicationId)).body.dispute;
      const r = await decide(d.id, "rejected");
      assert.deepEqual(r.body.effect, { fee: "kept" });
      assert.equal((await one(db, `SELECT status FROM yd_fee_ledger WHERE id = $1`, [fee.feeId])).status, "invoiced");
    });

    test("the fixture's open dispute shows in the list with its due date, and a decided one leaves the open list", async () => {
      const open1 = await call(h.disputes, { token: t().collectionsA, query: { status: "open" } });
      assert.ok(open1.body.disputes.some((d) => d.id === fx.A.dispute));
      assert.ok(!open1.body.disputes.some((d) => d.id === fx.B.dispute), "never another company's");
      const d = (await open("denial", (await mkPlacement(db, fx, await mkSignedBuilding(db, fx), { to: "registered" })).applicationId)).body.dispute;
      await decide(d.id, "upheld");
      const decided = await call(h.disputes, { token: t().collectionsA, query: { status: "decided" } });
      assert.ok(decided.body.disputes.some((x) => x.id === d.id && x.decision === "upheld"));
      assert.equal((await call(h.disputes, { token: t().collectionsA, query: { status: "bogus" } })).code, 400);
    });
  });
});
