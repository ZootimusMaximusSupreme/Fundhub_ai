// Postgres-backed tests for what a building does to a placement:
//   POST /api/yesdoor/building/update   (stage moves, the denial flow, lease, move-in,
//                                        the known-prospect claim)
//
// Proved: only a building user at THAT building gets in (404 for anything else), stages
// move only along the §3 arrows (the code list and the database agree), a denial after
// an "approved" match runs the whole flow in one transaction (mismatch count, pause at
// 3 in 90 days, the application fee owed back unless waived, backups offered, events),
// a lease needs its dates and rent, moving in earns the fee and issues the invoice,
// a stale registration earns nothing, and no credit field ever appears in a response.
//
// SCRATCH database only, as fundhub_app. Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture, call, creditLeaks } from "../yesdoor/testing/fixture.mjs";
import { useFixtureEnv, mkSignedBuilding, mkMatch, mkPlacement, one, rows } from "../yesdoor/testing/b4.mjs";
import { ARROWS, stageMoveOk } from "../yesdoor/stages.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const STAGES = ["booked", "registered", "toured", "no_show", "applied", "approved", "denied", "lease_signed",
  "moved_in", "invoiced", "paid", "safe", "refunded", "cancelled"];

describe("yesdoor building updates", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, h;
  const update = (token, body) => call(h.update, { method: "POST", token, body });
  const move = (b, p, stage, extra = {}) => update(b.token, { applicationId: p.applicationId, stage, ...extra });
  const LEASE = { start: "2026-11-01", end: "2027-10-31", rentCents: 170000 };
  const eventsOf = (entityId) => rows(db, `SELECT name, actor_kind, actor_id, payload FROM yd_events WHERE entity_id = $1 ORDER BY occurred_at, id`, [entityId]);
  const appRow = (id) => one(db, `SELECT * FROM yd_applications WHERE id = $1`, [id]);
  const mkBroker = async (plan = "split", split = 25) => (await db.query(
    `INSERT INTO yd_brokers (org_id, name, email, plan, split_percent, status) VALUES ($1,$2,$3,$4,$5,'active') RETURNING id`,
    [fx.orgA, `Broker ${plan}`, `broker-${plan}-${Math.random().toString(36).slice(2, 8)}@example.test`, plan, split])).rows[0].id;

  before(async () => {
    fx = await buildYdFixture(db);
    useFixtureEnv(fx);
    h = {};
    h.update = (await import("../../api/yesdoor/building/update.mjs")).default;
    h.payment = (await import("../../api/yesdoor/staff/payment.mjs")).default;
    h.invoices = (await import("../../api/yesdoor/building/invoices.mjs")).default;
    h.renters = (await import("../../api/yesdoor/building/renters.mjs")).default;
  });
  after(async () => { await close(); });

  test("the stage arrows in code are exactly the arrows in the database", async () => {
    for (const from of STAGES) {
      for (const to of STAGES) {
        const dbSays = (await one(db, `SELECT yd_stage_move_ok($1,$2) AS ok`, [from, to])).ok;
        assert.equal(stageMoveOk(from, to), dbSays, `${from} -> ${to}`);
      }
    }
    assert.equal(ARROWS.length, 15);
  });

  /* ── who may move a placement ─────────────────────────────────────────── */

  describe("who may move a placement", () => {
    test("nobody 401, a renter 403, a broker 403, staff 401, and only POST", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b);
      const body = { applicationId: p.applicationId, stage: "toured" };
      assert.equal((await update(undefined, body)).code, 401);
      assert.equal((await update(fx.tokens.renterA, body)).code, 403);
      assert.equal((await update(fx.tokens.brokerA, body)).code, 403);
      assert.equal((await update(fx.tokens.opsA, body)).code, 401);
      assert.equal((await call(h.update, { token: b.token, method: "GET" })).code, 405);
      assert.equal((await appRow(p.applicationId)).stage, "registered");
    });

    test("an application at another building (same company) or another company is a 404 and nothing changes", async () => {
      const mine = await mkSignedBuilding(db, fx);
      const theirs = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, theirs);
      const r = await update(mine.token, { applicationId: p.applicationId, stage: "toured" });
      assert.equal(r.code, 404);
      assert.equal(r.body.error, "not_found");
      const rB = await update(mine.token, { applicationId: fx.B.app1, stage: "toured" });
      assert.equal(rB.code, 404);
      assert.equal((await appRow(p.applicationId)).stage, "registered");
      assert.equal(await one(db, `SELECT id FROM yd_events WHERE entity_id = $1 AND name = 'building.updated_stage'`, [p.applicationId]), null);
    });

    test("a made-up id is a 404, a malformed id or missing stage is a 400", async () => {
      const b = await mkSignedBuilding(db, fx);
      assert.equal((await update(b.token, { applicationId: "11111111-1111-4111-8111-111111111111", stage: "toured" })).code, 404);
      assert.equal((await update(b.token, { applicationId: "nope", stage: "toured" })).code, 400);
      assert.equal((await update(b.token, { stage: "toured" })).code, 400);
      assert.equal((await update(b.token, { applicationId: "11111111-1111-4111-8111-111111111111" })).code, 400);
    });
  });

  /* ── the arrows ───────────────────────────────────────────────────────── */

  describe("stages move only along the arrows", () => {
    test("a skip or a step back is a 409 with a plain sentence, and changes nothing", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "registered" });
      for (const stage of ["applied", "approved", "denied", "lease_signed", "moved_in"]) {
        const r = await move(b, p, stage, { reason: "x", lease: LEASE });
        assert.equal(r.code, 409, stage);
        assert.equal(r.body.error, "bad_stage_move");
        assert.match(r.body.message, /A renter cannot move from "registered" to/);
      }
      assert.equal((await appRow(p.applicationId)).stage, "registered");
    });

    test("stages that belong to the system or to staff cannot be set from the building portal", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "lease_signed", leaseRentCents: 150000 });
      for (const stage of ["booked", "registered", "invoiced", "paid", "safe", "cancelled", "bogus"]) {
        const r = await move(b, p, stage);
        assert.equal(r.code, 400, stage);
      }
      assert.equal((await appRow(p.applicationId)).stage, "lease_signed");
    });

    test("toured, applied, approved: each is a stamp, in order; toured closes the tour", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "registered" });
      await db.query(`INSERT INTO yd_tours (org_id, application_id, starts_at, status) VALUES ($1,$2, now() + interval '1 day','booked')`, [fx.orgA, p.applicationId]);
      for (const stage of ["toured", "applied", "approved"]) {
        const r = await move(b, p, stage);
        assert.equal(r.code, 200, `${stage}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.application.stage, stage);
        assert.equal(r.body.unchanged, false);
      }
      const app = await appRow(p.applicationId);
      assert.ok(app.toured_at && app.applied_at && app.approved_at, "every stage stamped its own time");
      assert.equal((await one(db, `SELECT status FROM yd_tours WHERE application_id = $1`, [p.applicationId])).status, "completed");
      const names = (await eventsOf(p.applicationId)).map((e) => e.name);
      for (const n of ["application.toured", "application.applied", "application.approved", "building.updated_stage"]) assert.ok(names.includes(n), n);
      const ev = (await eventsOf(p.applicationId)).find((e) => e.name === "application.applied");
      assert.equal(ev.actor_kind, "building_user");
      assert.equal(ev.actor_id, b.accountId, "the building user is on the automatic stage event");
    });

    test("no_show closes the tour as a no-show and frees the renter's place", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "registered" });
      await db.query(`INSERT INTO yd_tours (org_id, application_id, starts_at, status) VALUES ($1,$2, now() + interval '1 day','booked')`, [fx.orgA, p.applicationId]);
      const r = await move(b, p, "no_show");
      assert.equal(r.code, 200);
      assert.equal((await one(db, `SELECT status FROM yd_tours WHERE application_id = $1`, [p.applicationId])).status, "noshow");
      const after2 = await move(b, p, "toured");
      assert.equal(after2.code, 409, "a no-show is final");
    });

    test("repeating a move that already happened answers 200 {unchanged} and writes nothing new", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "registered" });
      await move(b, p, "toured");
      const eventsBefore = (await eventsOf(p.applicationId)).length;
      const again = await move(b, p, "toured");
      assert.equal(again.code, 200);
      assert.equal(again.body.unchanged, true);
      assert.equal(again.body.application.stage, "toured");
      await move(b, p, "applied");
      const stale = await move(b, p, "toured");        // an old button clicked late
      assert.equal(stale.code, 200);
      assert.equal(stale.body.unchanged, true);
      assert.equal((await appRow(p.applicationId)).stage, "applied");
      assert.equal((await eventsOf(p.applicationId)).length, eventsBefore + 2, "only the applied move wrote events");
    });
  });

  /* ── lease ────────────────────────────────────────────────────────────── */

  describe("lease_signed", () => {
    test("needs the lease dates and the rent; real dates; the end after the start; whole cents", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "approved" });
      const bad = [
        undefined, {}, { start: "2026-11-01", end: "2027-10-31" }, { start: "2026-11-01", rentCents: 170000 },
        { ...LEASE, end: "2026-11-01" }, { ...LEASE, end: "2026-10-01" }, { ...LEASE, start: "2026-02-30" },
        { ...LEASE, start: "soon" }, { ...LEASE, rentCents: 0 }, { ...LEASE, rentCents: -1 },
        { ...LEASE, rentCents: 1700.5 }, { ...LEASE, rentCents: "1700" }, "a year"
      ];
      for (const lease of bad) {
        const r = await update(b.token, { applicationId: p.applicationId, stage: "lease_signed", ...(lease === undefined ? {} : { lease }) });
        assert.equal(r.code, 400, JSON.stringify(lease));
      }
      assert.equal((await appRow(p.applicationId)).stage, "approved");
      const ok = await move(b, p, "lease_signed", { lease: LEASE });
      assert.equal(ok.code, 200);
      assert.deepEqual(ok.body.application.lease, { start: "2026-11-01", end: "2027-10-31", rentCents: 170000 });
      const app = await appRow(p.applicationId);
      assert.equal(app.stage, "lease_signed");
      assert.ok(app.lease_signed_at);
      assert.equal(Number(app.rent_cents), 170000);
    });
  });

  /* ── the denial flow ──────────────────────────────────────────────────── */

  describe("denied: the building said no to a renter we said was approved", () => {
    test("one transaction: mismatch counted, application fee owed back, backups offered, events written", async () => {
      const b = await mkSignedBuilding(db, fx, { appFeeCents: 5000 });
      const backup1 = await mkSignedBuilding(db, fx, { rentCents: 150000 });
      const backup2 = await mkSignedBuilding(db, fx, { rentCents: 160000 });
      const p = await mkPlacement(db, fx, b, { to: "applied" });
      await mkMatch(db, p, { buildingId: backup1.buildingId, listingId: backup1.listingId });
      await mkMatch(db, p, { buildingId: backup2.buildingId, listingId: backup2.listingId });
      await mkMatch(db, p, { buildingId: (await mkSignedBuilding(db, fx)).buildingId, result: "likely" });   // only approved ones are offered

      const r = await move(b, p, "denied", { reason: "  Income could not be verified  " });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.mismatch, true);
      assert.equal(r.body.refundOwed, true);
      assert.equal(r.body.refundAmountCents, 5000);
      assert.equal(r.body.backupsOffered, 2);
      assert.equal(r.body.application.stage, "denied");
      assert.equal(r.body.application.denialReason, "Income could not be verified");
      assert.equal(r.body.buildingPaused, false);

      const app = await appRow(p.applicationId);
      assert.equal(app.stage, "denied");
      assert.equal(app.denial_reason, "Income could not be verified");
      assert.ok(app.denied_at);
      assert.equal((await one(db, `SELECT mismatch_count FROM yd_buildings WHERE id = $1`, [b.buildingId])).mismatch_count, 1);

      const refund = await one(db, `SELECT renter_id, amount_cents, status, reason FROM yd_renter_refunds WHERE application_id = $1`, [p.applicationId]);
      assert.deepEqual([refund.renter_id, Number(refund.amount_cents), refund.status, refund.reason], [p.renterId, 5000, "owed", "app_fee_mismatch"]);

      const mail = await one(db, `SELECT to_address, template_key, status, context FROM yd_outbox WHERE related_id = $1 AND template_key = 'yd-backups-offered'`, [p.applicationId]);
      assert.equal(mail.to_address, p.email);
      assert.equal(mail.status, "queued");
      assert.deepEqual(mail.context.backups.map((x) => x.building_id).sort(), [backup1.buildingId, backup2.buildingId].sort());
      assert.equal(mail.context.refund_owed, true);
      assert.deepEqual(creditLeaks(mail.context), [], "the offer names buildings and rents, never the credit reason");

      const names = (await eventsOf(p.applicationId)).map((e) => e.name);
      for (const n of ["application.denied", "renter_refund.owed", "building.updated_stage"]) assert.ok(names.includes(n), n);
      assert.ok((await eventsOf(b.buildingId)).some((e) => e.name === "building.mismatch"));
      assert.ok((await eventsOf(p.renterId)).some((e) => e.name === "renter.backups_offered"));
      assert.deepEqual(creditLeaks(r.body), []);
    });

    test("the backups are the OTHER approved buildings, best rent fit first, and never a building the renter already has an open application at", async () => {
      const b = await mkSignedBuilding(db, fx);
      const far = await mkSignedBuilding(db, fx, { rentCents: 90000 });
      const near = await mkSignedBuilding(db, fx, { rentCents: 210000 });
      const open = await mkSignedBuilding(db, fx, { rentCents: 216000 });
      const p = await mkPlacement(db, fx, b, { to: "applied" });
      await mkMatch(db, p, { buildingId: far.buildingId, listingId: far.listingId });
      await mkMatch(db, p, { buildingId: near.buildingId, listingId: near.listingId });
      await mkMatch(db, p, { buildingId: open.buildingId, listingId: open.listingId });
      const openMatch = await one(db, `SELECT id FROM yd_matches WHERE renter_id = $1 AND building_id = $2`, [p.renterId, open.buildingId]);
      await db.query(`INSERT INTO yd_applications (org_id, renter_id, building_id, listing_id, match_id) VALUES ($1,$2,$3,$4,$5)`,
        [fx.orgA, p.renterId, open.buildingId, open.listingId, openMatch.id]);
      const r = await move(b, p, "denied", { reason: "rules" });
      assert.equal(r.body.backupsOffered, 2);
      const mail = await one(db, `SELECT context FROM yd_outbox WHERE related_id = $1 AND template_key = 'yd-backups-offered'`, [p.applicationId]);
      assert.deepEqual(mail.context.backups.map((x) => x.building_id), [near.buildingId, far.buildingId], "$2,166 max rent: $2,100 fits better than $900");
    });

    test("a denial needs a reason", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "applied" });
      for (const reason of [undefined, "", "   "]) {
        const r = await move(b, p, "denied", reason === undefined ? {} : { reason });
        assert.equal(r.code, 400);
        assert.equal(r.body.error, "reason_required");
      }
      assert.equal((await appRow(p.applicationId)).stage, "applied");
    });

    test("a building that waived its application fee owes the renter nothing back", async () => {
      const b = await mkSignedBuilding(db, fx, { appFeeCents: 5000, appFeeWaived: true });
      const p = await mkPlacement(db, fx, b, { to: "applied" });
      const r = await move(b, p, "denied", { reason: "rules" });
      assert.equal(r.body.mismatch, true);
      assert.equal(r.body.refundOwed, false);
      assert.equal(await one(db, `SELECT id FROM yd_renter_refunds WHERE application_id = $1`, [p.applicationId]), null);
    });

    test("an application fee nobody told us stays unknown: no made-up refund row, and staff get an event to fill it in", async () => {
      const b = await mkSignedBuilding(db, fx, { appFeeCents: null });
      const p = await mkPlacement(db, fx, b, { to: "applied" });
      const r = await move(b, p, "denied", { reason: "rules" });
      assert.equal(r.body.mismatch, true);
      assert.equal(r.body.refundOwed, true);
      assert.equal(r.body.refundAmountCents, null);
      assert.equal(await one(db, `SELECT id FROM yd_renter_refunds WHERE application_id = $1`, [p.applicationId]), null);
      assert.ok((await eventsOf(p.applicationId)).some((e) => e.name === "renter_refund.amount_unknown"));
    });

    test("when we only said 'likely', the building's no is not a mismatch: no count, no refund", async () => {
      const b = await mkSignedBuilding(db, fx, { appFeeCents: 5000 });
      const p = await mkPlacement(db, fx, b, { to: "applied", matchResult: "likely" });
      const r = await move(b, p, "denied", { reason: "income" });
      assert.equal(r.code, 200);
      assert.equal(r.body.mismatch, false);
      assert.equal(r.body.refundOwed, false);
      assert.equal((await one(db, `SELECT mismatch_count FROM yd_buildings WHERE id = $1`, [b.buildingId])).mismatch_count, 0);
      assert.equal(await one(db, `SELECT id FROM yd_renter_refunds WHERE application_id = $1`, [p.applicationId]), null);
    });

    test("denying twice (a double click) changes nothing the second time", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "applied" });
      await move(b, p, "denied", { reason: "rules" });
      const again = await move(b, p, "denied", { reason: "rules" });
      assert.equal(again.code, 200);
      assert.equal(again.body.unchanged, true);
      assert.equal((await one(db, `SELECT mismatch_count FROM yd_buildings WHERE id = $1`, [b.buildingId])).mismatch_count, 1);
      assert.equal((await rows(db, `SELECT id FROM yd_renter_refunds WHERE application_id = $1`, [p.applicationId])).length, 1);
    });

    test("three approved-then-denied inside 90 days pauses the building and asks staff to review its rules", async () => {
      const b = await mkSignedBuilding(db, fx);
      const results = [];
      for (let i = 0; i < 3; i += 1) {
        const p = await mkPlacement(db, fx, b, { to: "applied" });
        results.push(await move(b, p, "denied", { reason: `reason ${i}` }));
      }
      assert.deepEqual(results.map((r) => r.body.buildingPaused), [false, false, true]);
      const row = await one(db, `SELECT status, mismatch_count, public.yd_building_is_matchable(id) AS m FROM yd_buildings WHERE id = $1`, [b.buildingId]);
      assert.equal(row.status, "paused");
      assert.equal(row.mismatch_count, 3);
      assert.equal(row.m, false, "a paused building takes no more renters");
      const names = (await eventsOf(b.buildingId)).map((e) => e.name);
      assert.equal(names.filter((n) => n === "building.mismatch").length, 3);
      assert.ok(names.includes("building.paused"));
      assert.ok(names.includes("staff.rules_review"));
      // The rules were NOT changed by the pause: rules never change automatically.
      assert.equal((await rows(db, `SELECT id FROM yd_building_rules WHERE building_id = $1`, [b.buildingId])).length, 1);
    });

    test("mismatches older than 90 days do not count toward the pause", async () => {
      const b = await mkSignedBuilding(db, fx);
      for (let i = 0; i < 2; i += 1) {
        await db.query(
          `INSERT INTO yd_events (org_id, name, entity_kind, entity_id, payload, actor_kind, occurred_at)
           VALUES ($1,'building.mismatch','building',$2,'{}','system', now() - interval '100 days')`, [fx.orgA, b.buildingId]);
      }
      const p = await mkPlacement(db, fx, b, { to: "applied" });
      const r = await move(b, p, "denied", { reason: "rules" });
      assert.equal(r.body.buildingPaused, false);
      assert.equal((await one(db, `SELECT status FROM yd_buildings WHERE id = $1`, [b.buildingId])).status, "signed");
    });
  });

  /* ── moving in earns the fee ──────────────────────────────────────────── */

  describe("moved_in: the fee is earned and the invoice is issued", () => {
    test("the placement fee is the building's percent of the LEASE rent; the invoice carries the proof; the application is invoiced", async () => {
      const b = await mkSignedBuilding(db, fx, { rentCents: 150000, feePercent: 100 });
      const p = await mkPlacement(db, fx, b, { to: "lease_signed", leaseRentCents: 170000 });
      const r = await move(b, p, "moved_in");
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.fee.earned, true);
      assert.equal(r.body.fee.amountCents, 170000, "100% of the lease rent, not the listing rent");
      assert.match(r.body.fee.invoiceNumber, /^YD-INV-\d{6,}$/);
      assert.equal(r.body.application.stage, "invoiced");

      const fee = await one(db, `SELECT * FROM yd_fee_ledger WHERE application_id = $1`, [p.applicationId]);
      assert.equal(fee.kind, "placement_fee");
      assert.equal(Number(fee.amount_cents), 170000);
      assert.equal(fee.status, "invoiced");
      assert.equal(fee.idempotency_key, `fee:${p.applicationId}`);
      assert.ok(fee.invoiced_at && fee.invoice_id);
      const inv = await one(db, `SELECT * FROM yd_invoices WHERE id = $1`, [fee.invoice_id]);
      assert.equal(inv.building_id, b.buildingId);
      assert.equal(Number(inv.total_cents), 170000);
      assert.equal(inv.status, "open");
      assert.equal(Math.round((new Date(inv.due_at) - new Date(inv.issued_at)) / 86_400_000), 30, "net 30 by default");

      const app = await appRow(p.applicationId);
      assert.equal(app.stage, "invoiced");
      assert.ok(app.moved_in_at && app.invoiced_at);
      assert.equal((await one(db, `SELECT stage FROM yd_renters WHERE id = $1`, [p.renterId])).stage, "placed");

      // The building sees the proof a leasing office expects: registration time, renter, unit, move-in, term.
      const seen = await call(h.invoices, { token: b.token });
      const line = seen.body.invoices.find((i) => i.id === inv.id).lines[0];
      assert.equal(line.amountCents, 170000);
      assert.equal(line.unit, "1A");
      assert.ok(line.registeredAt);
      assert.ok(line.moveInDate);
      assert.equal(line.leaseTermMonths, 12);
      assert.deepEqual(creditLeaks(seen.body), []);

      const names = (await eventsOf(p.applicationId)).map((e) => e.name);
      for (const n of ["application.moved_in", "application.invoiced", "fee.earned"]) assert.ok(names.includes(n), n);
      assert.ok((await eventsOf(inv.id)).some((e) => e.name === "invoice.issued"));
      const mail = await one(db, `SELECT to_address, status FROM yd_outbox WHERE related_id = $1 AND template_key = 'yd-invoice-issued'`, [inv.id]);
      assert.equal(mail.status, "queued");
      assert.match(mail.to_address, /^leasing\+/);
    });

    test("a percent below 100, a flat fee, and the invoice's net terms all come from the building", async () => {
      const pct = await mkSignedBuilding(db, fx, { feePercent: 75 });
      const p1 = await mkPlacement(db, fx, pct, { to: "lease_signed", leaseRentCents: 150000 });
      assert.equal((await move(pct, p1, "moved_in")).body.fee.amountCents, 112500);

      const flat = await mkSignedBuilding(db, fx, { feeKind: "flat", feeFlatCents: 100000 });
      await db.query(`UPDATE yd_buildings SET payment_terms_days = 45 WHERE id = $1`, [flat.buildingId]);
      const p2 = await mkPlacement(db, fx, flat, { to: "lease_signed", leaseRentCents: 150000 });
      const r2 = await move(flat, p2, "moved_in");
      assert.equal(r2.body.fee.amountCents, 100000);
      const inv = await one(db, `SELECT issued_at, due_at FROM yd_invoices WHERE id = $1`, [r2.body.fee.invoiceId]);
      assert.equal(Math.round((new Date(inv.due_at) - new Date(inv.issued_at)) / 86_400_000), 45);
    });

    test("the first-touch broker earns their split of the fee; a software partner earns nothing", async () => {
      const b = await mkSignedBuilding(db, fx);
      const split = await mkBroker("split", 25);
      const p = await mkPlacement(db, fx, b, { to: "lease_signed", leaseRentCents: 170000, brokerId: split });
      const r = await move(b, p, "moved_in");
      assert.equal(r.body.fee.brokerShareCents, 42500);
      const row = await one(db, `SELECT broker_id, amount_cents, status, hold_until FROM yd_broker_ledger WHERE fee_ledger_id = $1`, [r.body.fee.feeId]);
      assert.deepEqual([row.broker_id, Number(row.amount_cents), row.status, row.hold_until], [split, 42500, "earned", null]);
      assert.ok((await eventsOf(split)).some((e) => e.name === "broker.earned"));

      const software = await mkBroker("software", 25);
      const p2 = await mkPlacement(db, fx, b, { to: "lease_signed", leaseRentCents: 170000, brokerId: software });
      const r2 = await move(b, p2, "moved_in");
      assert.equal(r2.body.fee.earned, true);
      assert.equal(r2.body.fee.brokerShareCents, 0);
      assert.equal(await one(db, `SELECT id FROM yd_broker_ledger WHERE fee_ledger_id = $1`, [r2.body.fee.feeId]), null);

      const none = await mkPlacement(db, fx, b, { to: "lease_signed" });
      assert.equal((await move(b, none, "moved_in")).body.fee.brokerShareCents, 0);
    });

    test("repeating moved_in earns nothing twice", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "lease_signed" });
      await move(b, p, "moved_in");
      const again = await move(b, p, "moved_in");
      assert.equal(again.code, 200);
      assert.equal(again.body.unchanged, true);
      assert.equal((await rows(db, `SELECT id FROM yd_fee_ledger WHERE application_id = $1`, [p.applicationId])).length, 1);
      assert.equal((await rows(db, `SELECT id FROM yd_invoices WHERE building_id = $1`, [b.buildingId])).length, 1);
    });

    test("a lease signed more than 90 days after the registration earns no fee, and says why", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "lease_signed", registeredAgoDays: 100 });
      const r = await move(b, p, "moved_in");
      assert.equal(r.code, 200);
      assert.equal(r.body.fee.earned, false);
      assert.equal(r.body.fee.reason, "expired");
      assert.equal(r.body.application.stage, "moved_in", "no invoice, so it stays at moved in");
      assert.equal(await one(db, `SELECT id FROM yd_fee_ledger WHERE application_id = $1`, [p.applicationId]), null);
      const ev = (await eventsOf(p.applicationId)).find((e) => e.name === "fee.not_earned");
      assert.equal(ev.payload.reason, "expired");
      assert.ok(ev.payload.days_after_registration >= 100);
    });

    test("a lease signed on day 89 still earns it", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "lease_signed", registeredAgoDays: 89 });
      assert.equal((await move(b, p, "moved_in")).body.fee.earned, true);
    });

    test("a building whose fee terms cannot give an amount earns nothing and tells staff, instead of inventing a number", async () => {
      const b = await mkSignedBuilding(db, fx, { feePercent: 0 });
      const p = await mkPlacement(db, fx, b, { to: "lease_signed" });
      const r = await move(b, p, "moved_in");
      assert.equal(r.body.fee.earned, false);
      assert.equal(r.body.fee.reason, "zero_fee");
    });

    test("the building cannot reach a stage past moved_in itself, and the answer carries no credit data", async () => {
      // The fixture's placement is paid already and its renter carries credit markers.
      const r = await update(fx.tokens.buildingA, { applicationId: fx.A.app1, stage: "moved_in" });
      assert.equal(r.code, 200);
      assert.equal(r.body.unchanged, true);
      assert.deepEqual(creditLeaks(r.body), []);
      const back = await update(fx.tokens.buildingA, { applicationId: fx.A.app1, stage: "lease_signed", lease: LEASE });
      assert.equal(back.body.unchanged, true);
      const tooLate = await update(fx.tokens.buildingA, { applicationId: fx.A.app1, stage: "refunded" });
      assert.equal(tooLate.code, 409);
      assert.equal(tooLate.body.error, "refund_window_closed", "paid 61 days ago, so the fee is past its 60-day window");
    });
  });

  /* ── the renter leaves inside the refund window ───────────────────────── */

  describe("refunded: the renter left inside the refund window", () => {
    const moveInAndPay = async (b, p) => {
      const m = await move(b, p, "moved_in");
      assert.equal(m.body.fee.earned, true);
      const pay = await call(h.payment, { method: "POST", token: fx.tokens.collectionsA, body: { invoiceId: m.body.fee.invoiceId, method: "ach", ref: `ACH-${p.applicationId.slice(0, 8)}` } });
      assert.equal(pay.code, 200, JSON.stringify(pay.body));
      return m.body.fee;
    };

    test("the paid fee is reversed in full by a NEW negative row, the original stays, the placement is refunded, the broker's unpaid share is voided", async () => {
      const b = await mkSignedBuilding(db, fx);
      const broker = await mkBroker();
      const p = await mkPlacement(db, fx, b, { to: "lease_signed", leaseRentCents: 150000, brokerId: broker });
      const fee = await moveInAndPay(b, p);
      assert.equal((await appRow(p.applicationId)).stage, "paid");

      const r = await move(b, p, "refunded", { reason: "Left after three weeks" });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.application.stage, "refunded");
      assert.equal(r.body.fee.feeId, fee.feeId);
      const ledger = await rows(db, `SELECT id, kind, amount_cents, status, reverses_id FROM yd_fee_ledger WHERE application_id = $1 ORDER BY created_at, id`, [p.applicationId]);
      assert.equal(ledger.length, 2);
      assert.deepEqual([ledger[0].kind, Number(ledger[0].amount_cents), ledger[0].status], ["placement_fee", 150000, "paid"], "the original stays");
      assert.deepEqual([ledger[1].kind, Number(ledger[1].amount_cents), ledger[1].reverses_id], ["refund", -150000, fee.feeId]);
      assert.equal((await one(db, `SELECT status FROM yd_broker_ledger WHERE fee_ledger_id = $1`, [fee.feeId])).status, "void");
      assert.ok((await eventsOf(p.applicationId)).some((e) => e.name === "fee.reversed"));
    });

    test("only a paid fee can be refunded: an invoiced one cannot", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "lease_signed" });
      await move(b, p, "moved_in");
      const r = await move(b, p, "refunded");
      assert.equal(r.code, 409);
      assert.equal(r.body.error, "bad_stage_move", "invoiced -> refunded is not an arrow");
    });
  });

  /* ── "we already knew this renter" ────────────────────────────────────── */

  describe("known prospect", () => {
    const claim = (b, p, over = {}) => update(b.token, {
      applicationId: p.applicationId,
      knownProspect: { evidenceAt: new Date(Date.now() - 20 * 86_400_000).toISOString(), evidence: "Walk-in guest card dated three weeks ago", ...over }
    });

    test("a claim inside 3 days, with an earlier record of its own, opens an attribution dispute for ops", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "registered" });
      const r = await claim(b, p);
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.dispute.kind, "attribution");
      const due = new Date(r.body.dispute.dueBy);
      assert.ok(due > new Date(Date.now() + 13 * 86_400_000) && due < new Date(Date.now() + 15 * 86_400_000), "14 days to decide");
      const app = await appRow(p.applicationId);
      assert.ok(app.known_prospect_at);
      assert.equal(app.known_prospect_evidence, "Walk-in guest card dated three weeks ago");
      const d = await one(db, `SELECT kind, status, opened_by_kind, opened_by_id, subject FROM yd_disputes WHERE id = $1`, [r.body.dispute.id]);
      assert.deepEqual([d.kind, d.status, d.opened_by_kind, d.opened_by_id], ["attribution", "open", "building_user", b.accountId]);
      assert.equal(d.subject.application_id, p.applicationId);
      assert.ok((await eventsOf(r.body.dispute.id)).some((e) => e.name === "dispute.opened"));
      assert.deepEqual(creditLeaks(r.body), []);
    });

    test("too late (the registration is more than 3 days old) is a 409; evidence that is not earlier is a 400; one claim per renter", async () => {
      const b = await mkSignedBuilding(db, fx);
      const old = await mkPlacement(db, fx, b, { to: "registered", registeredAgoDays: 5 });
      const late = await claim(b, old);
      assert.equal(late.code, 409);
      assert.equal(late.body.error, "claim_too_late");

      const fresh = await mkPlacement(db, fx, b, { to: "registered" });
      const notEarlier = await claim(b, fresh, { evidenceAt: new Date(Date.now() + 3_600_000).toISOString() });
      assert.equal(notEarlier.code, 400);
      assert.equal(notEarlier.body.error, "claim_evidence_not_earlier");
      assert.equal((await claim(b, fresh)).code, 200);
      const twice = await claim(b, fresh);
      assert.equal(twice.code, 409);
      assert.equal(twice.body.error, "claim_already_filed");
      assert.equal((await rows(db, `SELECT id FROM yd_disputes WHERE subject->>'application_id' = $1`, [fresh.applicationId])).length, 1);
      assert.equal(await one(db, `SELECT id FROM yd_disputes WHERE subject->>'application_id' = $1`, [old.applicationId]), null);
    });

    test("a claim needs evidence and a date; sending a stage with it is refused; another building's renter is a 404", async () => {
      const b = await mkSignedBuilding(db, fx);
      const other = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "registered" });
      for (const knownProspect of [{}, { evidence: "x" }, { evidenceAt: new Date().toISOString() }, { evidence: "", evidenceAt: "2026-01-01" }, "yes"]) {
        assert.equal((await update(b.token, { applicationId: p.applicationId, knownProspect })).code, 400, JSON.stringify(knownProspect));
      }
      const both = await update(b.token, { applicationId: p.applicationId, stage: "toured", knownProspect: { evidence: "x", evidenceAt: "2026-01-01" } });
      assert.equal(both.code, 400);
      assert.equal((await claim(other, p)).code, 404);
      assert.equal(await one(db, `SELECT known_prospect_at FROM yd_applications WHERE id = $1 AND known_prospect_at IS NOT NULL`, [p.applicationId]), null);
    });

    test("while the claim is open, moving in earns NO fee yet and says so; nothing is invoiced", async () => {
      const b = await mkSignedBuilding(db, fx);
      const p = await mkPlacement(db, fx, b, { to: "lease_signed" });
      assert.equal((await claim(b, p)).code, 200);
      const r = await move(b, p, "moved_in");
      assert.equal(r.code, 200);
      assert.equal(r.body.fee.earned, false);
      assert.equal(r.body.fee.reason, "dispute_open");
      assert.equal(r.body.application.stage, "moved_in");
      assert.equal(await one(db, `SELECT id FROM yd_fee_ledger WHERE application_id = $1`, [p.applicationId]), null);
    });
  });
});
