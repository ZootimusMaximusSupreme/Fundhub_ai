// Postgres-backed tests for booking a tour and changing it:
//   POST /api/yesdoor/public/book      POST /api/yesdoor/me/tour
//
// Proved: the renter proves who they are (401 without a live renter token), the
// building must be signed and the renter must already match it, a renter holds at most
// 3 open applications and one per building (also under a race), booking registers the
// building with a timestamped email in the SAME transaction (and books nothing if it
// cannot), tour hours and the time window are enforced, and cancelling frees a place.
//
// SCRATCH database only, as fundhub_app. Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture, call, creditLeaks } from "../yesdoor/testing/fixture.mjs";
import {
  useFixtureEnv, mkSignedBuilding, mkRenter, mkMatch, mkPlacement, bookVia, tourAt, one, rows
} from "../yesdoor/testing/b4.mjs";
import { createAccountSession, revokeAccountSession } from "../yesdoor/auth/session.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("yesdoor booking", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, h;
  const book = (renter, building, opts = {}) => bookVia(h.book, renter, { buildingId: building.buildingId, listingId: building.listingId, ...opts });
  const tour = (token, body) => call(h.tour, { method: "POST", token, body });
  const eventNames = (entityId) => rows(db, `SELECT name FROM yd_events WHERE entity_id = $1 ORDER BY occurred_at, id`, [entityId]).then((r) => r.map((x) => x.name));
  const openCount = async (renterId) => Number((await one(db,
    `SELECT count(*)::int AS n FROM yd_applications WHERE renter_id = $1 AND stage IN ('booked','registered','toured','applied','approved','lease_signed')`, [renterId])).n);

  /** A renter with an approved match at each building given. */
  const renterWith = async (buildings, opts = {}) => {
    const renter = await mkRenter(db, fx, opts);
    for (const b of buildings) await mkMatch(db, renter, { buildingId: b.buildingId, listingId: b.listingId, result: opts.result || "approved" });
    return renter;
  };

  before(async () => {
    fx = await buildYdFixture(db);
    useFixtureEnv(fx);
    h = {};
    h.book = (await import("../../api/yesdoor/public/book.mjs")).default;
    h.tour = (await import("../../api/yesdoor/me/tour.mjs")).default;
  });
  after(async () => { await close(); });

  /* ── who is booking ───────────────────────────────────────────────────── */

  describe("who is booking", () => {
    test("no token, a made-up token, a revoked token, a building or broker token, and another company's renter are all the same 401", async () => {
      const b = await mkSignedBuilding(db, fx);
      const renter = await renterWith([b]);
      const body = { buildingId: b.buildingId, listingId: b.listingId, startsAt: tourAt() };
      const attempts = [
        await call(h.book, { method: "POST", body }),
        await call(h.book, { method: "POST", body: { ...body, renterToken: "not-a-real-token" } }),
        await call(h.book, { method: "POST", body: { ...body, renterToken: fx.tokens.buildingA } }),
        await call(h.book, { method: "POST", body: { ...body, renterToken: fx.tokens.brokerA } }),
        await call(h.book, { method: "POST", body: { ...body, renterToken: fx.tokens.opsA } }),
        await call(h.book, { method: "POST", body: { ...body, renterToken: fx.tokens.renterB } })
      ];
      for (const r of attempts) {
        assert.equal(r.code, 401);
        assert.equal(r.body.error, "unauthorized");
      }
      const revoked = (await createAccountSession(db, { accountId: renter.accountId, orgId: fx.orgA })).token;
      await revokeAccountSession(db, revoked);
      assert.equal((await call(h.book, { method: "POST", body: { ...body, renterToken: revoked } })).code, 401);
      assert.equal(await openCount(renter.renterId), 0, "nothing was booked by any of them");
    });

    test("the token may ride in the body, in the Authorization header, or as the session cookie", async () => {
      const b1 = await mkSignedBuilding(db, fx);
      const b2 = await mkSignedBuilding(db, fx);
      const b3 = await mkSignedBuilding(db, fx);
      const renter = await renterWith([b1, b2, b3]);
      assert.equal((await book(renter, b1, { via: "body" })).code, 201);
      assert.equal((await book(renter, b2, { via: "header" })).code, 201);
      const cookie = await call(h.book, {
        method: "POST", body: { buildingId: b3.buildingId, listingId: b3.listingId, startsAt: tourAt() },
        headers: { cookie: `yesdoor_session=${encodeURIComponent(renter.token)}` }
      });
      assert.equal(cookie.code, 201);
    });

    test("only POST, and a malformed body is a plain 400", async () => {
      assert.equal((await call(h.book, { method: "GET" })).code, 405);
      assert.equal((await call(h.tour, { method: "GET", token: fx.tokens.renterA })).code, 405);
      const renter = await mkRenter(db, fx);
      assert.equal((await call(h.book, { method: "POST", body: { renterToken: renter.token } })).code, 400);
      assert.equal((await call(h.book, { method: "POST", body: { renterToken: renter.token, buildingId: "x", listingId: "y", startsAt: "z" } })).code, 400);
    });
  });

  /* ── the booking itself ───────────────────────────────────────────────── */

  describe("a booking", () => {
    test("one transaction: the application is born, the building is registered with a timestamped email, the tour is written", async () => {
      const b = await mkSignedBuilding(db, fx, { rentCents: 162500 });
      const renter = await renterWith([b]);
      const startsAt = tourAt(4, 18);
      const r = await book(renter, b, { startsAt });
      assert.equal(r.code, 201, JSON.stringify(r.body));
      assert.equal(r.body.registrationQueued, true);
      assert.equal(r.body.openApplications, 1);
      assert.equal(r.body.startsAt, startsAt);
      assert.equal(new Date(r.body.endsAt) - new Date(r.body.startsAt), 30 * 60_000);
      assert.match(r.body.buildingName, /B4 Test Court/);

      const app = await one(db, `SELECT * FROM yd_applications WHERE id = $1`, [r.body.applicationId]);
      assert.equal(app.stage, "registered");
      assert.equal(app.renter_id, renter.renterId);
      assert.equal(app.building_id, b.buildingId);
      assert.equal(app.listing_id, b.listingId);
      assert.ok(app.match_id, "the placement points at the match that allowed it");
      assert.ok(app.registration_sent_at, "the timestamp is the referral proof");
      assert.ok(app.registration_outbox_id);
      assert.equal(new Date(app.registration_sent_at).toISOString(), r.body.registrationAt);
      assert.ok(app.registered_at);
      assert.equal(app.broker_id, null);

      const reg = await one(db, `SELECT * FROM yd_outbox WHERE id = $1`, [app.registration_outbox_id]);
      assert.equal(reg.template_key, "building_registration");
      assert.equal(reg.status, "queued", "nothing transmits");
      assert.equal(reg.related_kind, "application");
      assert.equal(reg.related_id, app.id);
      assert.match(reg.to_address, /^leasing\+/);
      assert.equal(reg.context.source, "Yesdoor");
      assert.equal(reg.context.registered_at, r.body.registrationAt);
      assert.equal(reg.context.renter.email, renter.email);
      assert.equal(reg.context.unit.unit_label, "1A");
      assert.equal(reg.context.tour_starts_at, startsAt);
      assert.deepEqual(creditLeaks(reg.context), [], "the building is told a name and a time, never a credit file");

      const t = await one(db, `SELECT * FROM yd_tours WHERE id = $1`, [r.body.tourId]);
      assert.equal(t.application_id, app.id);
      assert.equal(t.status, "booked");
      assert.equal(new Date(t.starts_at).toISOString(), startsAt);

      assert.equal((await one(db, `SELECT stage FROM yd_renters WHERE id = $1`, [renter.renterId])).stage, "booked");
      assert.deepEqual(await eventNames(app.id), ["application.booked", "application.registered"]);
      assert.ok((await eventNames(t.id)).includes("tour.booked"));
      const ev = await one(db, `SELECT actor_kind, actor_id FROM yd_events WHERE entity_id = $1 AND name = 'application.registered'`, [app.id]);
      assert.equal(ev.actor_kind, "renter");
      assert.equal(ev.actor_id, renter.accountId);
      const confirm = await one(db, `SELECT to_address, template_key, status FROM yd_outbox WHERE related_id = $1`, [t.id]);
      assert.equal(confirm.to_address, renter.email);
      assert.equal(confirm.template_key, "yd-tour-booked");
      assert.deepEqual(creditLeaks(r.body), []);
    });

    test("the broker who first-touched the renter rides on the placement", async () => {
      const b = await mkSignedBuilding(db, fx);
      const renter = await renterWith([b], { brokerId: fx.A.broker });
      const r = await book(renter, b);
      assert.equal(r.code, 201);
      assert.equal((await one(db, `SELECT broker_id FROM yd_applications WHERE id = $1`, [r.body.applicationId])).broker_id, fx.A.broker);
    });

    test("approved and likely both book; no does not, and neither does a renter with no match at all", async () => {
      const b = await mkSignedBuilding(db, fx);
      const likely = await renterWith([b], { result: "likely" });
      assert.equal((await book(likely, b)).code, 201);

      const no = await renterWith([b], { result: "no" });
      const refused = await book(no, b);
      assert.equal(refused.code, 409);
      assert.equal(refused.body.error, "not_a_match");

      const never = await mkRenter(db, fx);
      const unscreened = await book(never, b);
      assert.equal(unscreened.code, 409);
      assert.equal(unscreened.body.error, "no_match_on_file");
      assert.equal(await openCount(no.renterId) + await openCount(never.renterId), 0);
    });

    test("only a signed building takes renters; a paused one does not; a flagged sample can (the demo funnel)", async () => {
      const paused = await mkSignedBuilding(db, fx);
      const renter = await renterWith([paused]);
      await db.query(`UPDATE yd_buildings SET status = 'paused' WHERE id = $1`, [paused.buildingId]);
      const r = await book(renter, paused);
      assert.equal(r.code, 409);
      assert.equal(r.body.error, "building_not_open");

      const unsigned = { buildingId: fx.A.bUnsigned, listingId: fx.A.lUnsigned };
      const r2 = await book(renter, unsigned);
      assert.equal(r2.code, 409);
      assert.equal(r2.body.error, "building_not_open");

      const sample = { buildingId: fx.A.bSample, listingId: fx.A.lSample };
      await mkMatch(db, renter, { buildingId: sample.buildingId, listingId: sample.listingId });
      assert.equal((await book(renter, sample)).code, 201);
      assert.equal(await openCount(renter.renterId), 1);
    });

    test("unknown, inactive, another building's and another company's building or unit are all 404", async () => {
      const b = await mkSignedBuilding(db, fx);
      const other = await mkSignedBuilding(db, fx);
      const renter = await renterWith([b, other]);
      const nowhere = "11111111-1111-4111-8111-111111111111";
      assert.equal((await book(renter, { buildingId: nowhere, listingId: b.listingId })).code, 404);
      assert.equal((await book(renter, { buildingId: b.buildingId, listingId: nowhere })).code, 404);
      assert.equal((await book(renter, { buildingId: b.buildingId, listingId: other.listingId })).code, 404, "a unit that belongs to another building");
      assert.equal((await book(renter, { buildingId: fx.B.bSigned, listingId: fx.B.lPublic1 })).code, 404, "another company's building");
      await db.query(`UPDATE yd_listings SET active = false WHERE id = $1`, [b.listingId]);
      assert.equal((await book(renter, b)).code, 404, "a unit that was switched off");
      assert.equal(await openCount(renter.renterId), 0);
    });

    test("a failed booking leaves nothing behind: a building that cannot be registered books nothing at all", async () => {
      const b = await mkSignedBuilding(db, fx, { leasingEmail: null });
      const renter = await renterWith([b]);
      const r = await book(renter, b);
      assert.equal(r.code, 409);
      assert.equal(r.body.error, "registration_failed");
      assert.equal((await rows(db, `SELECT id FROM yd_applications WHERE renter_id = $1`, [renter.renterId])).length, 0);
      assert.equal((await rows(db, `SELECT t.id FROM yd_tours t JOIN yd_applications a ON a.id = t.application_id WHERE a.renter_id = $1`, [renter.renterId])).length, 0);
      assert.equal((await one(db, `SELECT stage FROM yd_renters WHERE id = $1`, [renter.renterId])).stage, "matched");
    });

    test("an API-style connector (entrata sandbox) still keeps the timestamped email as the paper trail", async () => {
      const b = await mkSignedBuilding(db, fx);
      await db.query(`UPDATE yd_buildings SET connection = 'entrata_api', software = 'entrata' WHERE id = $1`, [b.buildingId]);
      const renter = await renterWith([b]);
      const r = await book(renter, b);
      assert.equal(r.code, 201);
      const app = await one(db, `SELECT registration_outbox_id FROM yd_applications WHERE id = $1`, [r.body.applicationId]);
      const mail = await one(db, `SELECT context FROM yd_outbox WHERE id = $1`, [app.registration_outbox_id]);
      assert.match(mail.context.guest_card_id, /^sandbox-gc-[0-9a-f]{12}$/);
    });
  });

  /* ── the cap and the one-per-building rule ────────────────────────────── */

  describe("the open-application cap", () => {
    test("three open applications is the most; the fourth is a clear 409 and writes nothing; cancelling one frees a place", async () => {
      const bs = [];
      for (let i = 0; i < 4; i += 1) bs.push(await mkSignedBuilding(db, fx));
      const renter = await renterWith(bs);
      const made = [];
      for (let i = 0; i < 3; i += 1) {
        const r = await book(renter, bs[i], { startsAt: tourAt(3 + i) });
        assert.equal(r.code, 201);
        assert.equal(r.body.openApplications, i + 1);
        made.push(r.body);
      }
      const fourth = await book(renter, bs[3]);
      assert.equal(fourth.code, 409);
      assert.equal(fourth.body.error, "open_application_cap");
      assert.match(fourth.body.message, /3 open applications/);
      assert.equal(await openCount(renter.renterId), 3);
      assert.equal((await rows(db, `SELECT id FROM yd_applications WHERE renter_id = $1 AND building_id = $2`, [renter.renterId, bs[3].buildingId])).length, 0);

      const cancelled = await tour(renter.token, { tourId: made[0].tourId, action: "cancel" });
      assert.equal(cancelled.code, 200);
      assert.equal(await openCount(renter.renterId), 2);
      assert.equal((await book(renter, bs[3])).code, 201, "the cancelled one freed a place");
    });

    test("the cap holds under a race: six bookings at once, exactly three get in", async () => {
      const bs = [];
      for (let i = 0; i < 6; i += 1) bs.push(await mkSignedBuilding(db, fx));
      const renter = await renterWith(bs);
      const results = await Promise.all(bs.map((b, i) => book(renter, b, { startsAt: tourAt(3 + i) })));
      const codes = results.map((r) => r.code).sort();
      assert.deepEqual(codes, [201, 201, 201, 409, 409, 409]);
      assert.ok(results.filter((r) => r.code === 409).every((r) => r.body.error === "open_application_cap"));
      assert.equal(await openCount(renter.renterId), 3);
    });

    test("one open application per building: a second booking there is a 409, even for a different unit", async () => {
      const b = await mkSignedBuilding(db, fx);
      const unit2 = (await db.query(
        `INSERT INTO yd_listings (org_id, building_id, unit_label, beds, rent_cents) VALUES ($1,$2,'2B',2,190000) RETURNING id`, [fx.orgA, b.buildingId])).rows[0].id;
      const renter = await renterWith([b]);
      assert.equal((await book(renter, b)).code, 201);
      const again = await book(renter, { buildingId: b.buildingId, listingId: unit2 });
      assert.equal(again.code, 409);
      assert.equal(again.body.error, "already_booked_here");
    });

    test("a building that recently said no to this renter is not booked again", async () => {
      const b = await mkSignedBuilding(db, fx);
      const placed = await mkPlacement(db, fx, b, { to: "applied" });
      await db.query(`UPDATE yd_applications SET stage = 'denied', denial_reason = 'income' WHERE id = $1`, [placed.applicationId]);
      const r = await book(placed, b);
      assert.equal(r.code, 409);
      assert.equal(r.body.error, "denied_here");
    });

    test("a no-show frees a place too", async () => {
      const b = await mkSignedBuilding(db, fx);
      const placed = await mkPlacement(db, fx, b, { to: "registered" });
      assert.equal(await openCount(placed.renterId), 1);
      await db.query(`UPDATE yd_applications SET stage = 'no_show' WHERE id = $1`, [placed.applicationId]);
      assert.equal(await openCount(placed.renterId), 0);
    });
  });

  /* ── tour time and hours ──────────────────────────────────────────────── */

  describe("the tour time", () => {
    test("too soon, too far out, not a date: each is a plain 400 and books nothing", async () => {
      const b = await mkSignedBuilding(db, fx);
      const renter = await renterWith([b]);
      const soon = await book(renter, b, { startsAt: new Date(Date.now() + 10 * 60_000).toISOString() });
      assert.equal(soon.code, 400);
      assert.equal(soon.body.error, "tour_too_soon");
      const past = await book(renter, b, { startsAt: new Date(Date.now() - 86_400_000).toISOString() });
      assert.equal(past.body.error, "tour_too_soon");
      const far = await book(renter, b, { startsAt: tourAt(90) });
      assert.equal(far.body.error, "tour_too_far");
      const junk = await book(renter, b, { startsAt: "next tuesday" });
      assert.equal(junk.code, 400);
      assert.equal(junk.body.error, "invalid_time");
      assert.equal(await openCount(renter.renterId), 0);
    });

    test("a building's tour hours are read in its own time zone: Arizona has no daylight saving", async () => {
      const b = await mkSignedBuilding(db, fx, { state: "AZ", tourHours: { "mon-fri": "09:00-17:00" } });
      const renter = await renterWith([b]);
      // Find the next Wednesday at least 2 days out; 16:00 UTC is 09:00 in Phoenix.
      const d = new Date(Date.now() + 2 * 86_400_000);
      while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
      const at = (hourUtc, minute = 0) => { const x = new Date(d); x.setUTCHours(hourUtc, minute, 0, 0); return x.toISOString(); };
      const early = await book(renter, b, { startsAt: at(15, 59) });       // 08:59 in Phoenix
      assert.equal(early.code, 400);
      assert.equal(early.body.error, "outside_tour_hours");
      assert.match(early.body.message, /Mon 09:00-17:00/);
      const late = await book(renter, b, { startsAt: at(23, 45) });        // 16:45 + 30 min runs past 17:00
      assert.equal(late.body.error, "outside_tour_hours");
      const ok = await book(renter, b, { startsAt: at(16, 0) });           // 09:00 sharp
      assert.equal(ok.code, 201);
    });

    test("a closed day is refused; a building with no hours on file takes any time", async () => {
      const weekdays = await mkSignedBuilding(db, fx, { tourHours: { "mon-fri": "09:00-17:00" } });
      const renter = await renterWith([weekdays]);
      const d = new Date(Date.now() + 2 * 86_400_000);
      while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);          // a Sunday
      d.setUTCHours(18, 0, 0, 0);
      const closed = await book(renter, weekdays, { startsAt: d.toISOString() });
      assert.equal(closed.code, 400);
      assert.equal(closed.body.error, "outside_tour_hours");

      const open = await mkSignedBuilding(db, fx, { tourHours: {} });
      const r2 = await renterWith([open]);
      assert.equal((await book(r2, open, { startsAt: tourAt(3, 4) })).code, 201, "03:00 or 04:00 is fine when no hours are on file");
    });
  });

  /* ── changing a tour ──────────────────────────────────────────────────── */

  describe("POST me/tour", () => {
    const booked = async (opts = {}) => {
      const b = await mkSignedBuilding(db, fx, opts.building || {});
      const renter = await renterWith([b]);
      const r = await book(renter, b, { startsAt: opts.startsAt || tourAt(3, 17) });
      assert.equal(r.code, 201);
      return { b, renter, ...r.body };
    };

    test("cancel: the tour and the placement are cancelled, the registration proof stays, the building is told", async () => {
      const x = await booked();
      const r = await tour(x.renter.token, { tourId: x.tourId, action: "cancel" });
      assert.equal(r.code, 200);
      assert.equal(r.body.status, "cancelled");
      assert.equal(r.body.applicationStage, "cancelled");
      const app = await one(db, `SELECT stage, registration_sent_at, cancelled_at FROM yd_applications WHERE id = $1`, [x.applicationId]);
      assert.equal(app.stage, "cancelled");
      assert.ok(app.registration_sent_at, "who sent the renter first is still on record");
      assert.ok(app.cancelled_at);
      assert.equal((await one(db, `SELECT status FROM yd_tours WHERE id = $1`, [x.tourId])).status, "cancelled");
      assert.equal((await one(db, `SELECT stage FROM yd_renters WHERE id = $1`, [x.renter.renterId])).stage, "matched", "no open application left");
      const notice = await one(db, `SELECT to_address, template_key, status FROM yd_outbox WHERE related_id = $1 AND template_key = 'building_tour_cancelled'`, [x.tourId]);
      assert.match(notice.to_address, /^leasing\+/);
      assert.equal(notice.status, "queued");
      assert.ok((await eventNames(x.tourId)).includes("tour.cancelled"));
      // And the same building can be booked again.
      assert.equal((await book(x.renter, x.b)).code, 201);
    });

    test("cancelling twice is a clean 409, not a second cancel", async () => {
      const x = await booked();
      assert.equal((await tour(x.renter.token, { tourId: x.tourId, action: "cancel" })).code, 200);
      const again = await tour(x.renter.token, { tourId: x.tourId, action: "cancel" });
      assert.equal(again.code, 409);
      assert.equal(again.body.error, "tour_not_active");
    });

    test("reschedule: a new time inside the hours, status rescheduled, the building is told, the placement is unchanged", async () => {
      const x = await booked();
      const newTime = tourAt(5, 19);
      const r = await tour(x.renter.token, { tourId: x.tourId, action: "reschedule", startsAt: newTime });
      assert.equal(r.code, 200);
      assert.equal(r.body.status, "rescheduled");
      assert.equal(r.body.startsAt, newTime);
      assert.equal(r.body.applicationStage, "registered");
      const t = await one(db, `SELECT starts_at, ends_at, status FROM yd_tours WHERE id = $1`, [x.tourId]);
      assert.equal(new Date(t.starts_at).toISOString(), newTime);
      assert.equal(new Date(t.ends_at) - new Date(t.starts_at), 30 * 60_000);
      assert.equal(t.status, "rescheduled");
      assert.equal((await one(db, `SELECT stage FROM yd_applications WHERE id = $1`, [x.applicationId])).stage, "registered");
      const notice = await one(db, `SELECT context FROM yd_outbox WHERE related_id = $1 AND template_key = 'building_tour_rescheduled'`, [x.tourId]);
      assert.equal(notice.context.tour_starts_at, newTime);
      assert.equal(notice.context.old_starts_at, x.startsAt);
      // It can be moved again.
      assert.equal((await tour(x.renter.token, { tourId: x.tourId, action: "reschedule", startsAt: tourAt(6, 19) })).code, 200);
    });

    test("reschedule obeys the same time rules as booking, and a refusal leaves the tour where it was", async () => {
      const b = await mkSignedBuilding(db, fx, { tourHours: { "mon-fri": "09:00-17:00" } });
      const renter = await renterWith([b]);
      const d = new Date(Date.now() + 2 * 86_400_000);
      while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);          // a Wednesday
      const at = (hourUtc) => { const x = new Date(d); x.setUTCHours(hourUtc, 0, 0, 0); return x.toISOString(); };
      const r = await book(renter, b, { startsAt: at(17) });                  // 10:00 in Phoenix
      assert.equal(r.code, 201);
      const outside = await tour(renter.token, { tourId: r.body.tourId, action: "reschedule", startsAt: at(15) });   // 08:00
      assert.equal(outside.code, 400);
      assert.equal(outside.body.error, "outside_tour_hours");
      const soon = await tour(renter.token, { tourId: r.body.tourId, action: "reschedule", startsAt: new Date(Date.now() + 600_000).toISOString() });
      assert.equal(soon.body.error, "tour_too_soon");
      const row = await one(db, `SELECT starts_at, status FROM yd_tours WHERE id = $1`, [r.body.tourId]);
      assert.equal(new Date(row.starts_at).toISOString(), at(17));
      assert.equal(row.status, "booked");
    });

    test("a tour that has happened cannot be cancelled or moved by the renter", async () => {
      const b = await mkSignedBuilding(db, fx);
      const placed = await mkPlacement(db, fx, b, { to: "registered" });
      const t = (await db.query(
        `INSERT INTO yd_tours (org_id, application_id, starts_at, status) VALUES ($1,$2, now() + interval '2 days','booked') RETURNING id`, [fx.orgA, placed.applicationId])).rows[0].id;
      await db.query(`UPDATE yd_applications SET stage = 'toured' WHERE id = $1`, [placed.applicationId]);
      await db.query(`UPDATE yd_applications SET stage = 'applied' WHERE id = $1`, [placed.applicationId]);
      const cancel = await tour(placed.token, { tourId: t, action: "cancel" });
      assert.equal(cancel.code, 409);
      assert.equal(cancel.body.error, "too_late_to_cancel");
      const move = await tour(placed.token, { tourId: t, action: "reschedule", startsAt: tourAt(4) });
      assert.equal(move.code, 409);
      assert.equal(move.body.error, "too_late_to_change");
      await db.query(`UPDATE yd_tours SET status = 'completed' WHERE id = $1`, [t]);
      assert.equal((await tour(placed.token, { tourId: t, action: "cancel" })).body.error, "tour_not_active");
    });

    test("another renter's tour is a 404 (never a 403), another company's too, and the wrong kind of login is refused", async () => {
      const x = await booked();
      const stranger = await mkRenter(db, fx);
      assert.equal((await tour(stranger.token, { tourId: x.tourId, action: "cancel" })).code, 404);
      assert.equal((await tour(fx.tokens.renterB, { tourId: x.tourId, action: "cancel" })).code, 404);
      assert.equal((await tour(undefined, { tourId: x.tourId, action: "cancel" })).code, 401);
      assert.equal((await tour(fx.tokens.buildingA, { tourId: x.tourId, action: "cancel" })).code, 403);
      assert.equal((await tour(fx.tokens.brokerA, { tourId: x.tourId, action: "cancel" })).code, 403);
      assert.equal((await tour(fx.tokens.opsA, { tourId: x.tourId, action: "cancel" })).code, 401);
      assert.equal((await one(db, `SELECT status FROM yd_tours WHERE id = $1`, [x.tourId])).status, "booked");
    });

    test("bad requests: no action, a made-up action, no tour id, no new time", async () => {
      const x = await booked();
      assert.equal((await tour(x.renter.token, { tourId: x.tourId })).code, 400);
      assert.equal((await tour(x.renter.token, { tourId: x.tourId, action: "delete" })).code, 400);
      assert.equal((await tour(x.renter.token, { action: "cancel" })).code, 400);
      assert.equal((await tour(x.renter.token, { tourId: x.tourId, action: "reschedule" })).code, 400);
      assert.equal((await tour(x.renter.token, { tourId: x.tourId, action: "reschedule", startsAt: "whenever" })).code, 400);
      assert.equal((await tour(x.renter.token, { tourId: "nope", action: "cancel" })).code, 400);
      assert.equal((await tour(x.renter.token, { tourId: "11111111-1111-4111-8111-111111111111", action: "cancel" })).code, 404);
    });
  });
});
