// Postgres-backed tests for how supply is onboarded and signed:
//   POST /api/yesdoor/staff/companies        POST /api/yesdoor/staff/buildings
//   POST /api/yesdoor/staff/agreement        POST /api/yesdoor/webhooks/esign
//
// Proved: role gates (401 / 403), another company's rows never touched, fee terms
// and the unknown application fee kept honestly, a building gets renters only after
// the agreement is signed, the signing link is the credential (forged, expired and
// unknown links are all one 404), and every change writes an event.
//
// SCRATCH database only, as fundhub_app. Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture, call, creditLeaks } from "../yesdoor/testing/fixture.mjs";
import { useFixtureEnv, LINK_SECRET, mkSignedBuilding, one, rows } from "../yesdoor/testing/b4.mjs";
import { createSigningLink } from "../yesdoor/providers/esign-sandbox.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("yesdoor supply onboarding and agreements", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, h;
  const t = () => fx.tokens;
  const post = (door, token, body, extra = {}) => call(h[door], { method: "POST", token, body, ...extra });
  const eventsFor = (entityId) => rows(db, `SELECT name, actor_kind, payload FROM yd_events WHERE entity_id = $1 ORDER BY occurred_at, id`, [entityId]);

  const buildingBody = (over = {}) => ({
    name: `Onboard Test Flats ${Math.random().toString(36).slice(2, 8)}`, address: "12 Onboard Way", city: "Tempe", state: "AZ",
    zip: "85281", leasingEmail: "Leasing@Onboard.example.test", ...over
  });

  before(async () => {
    fx = await buildYdFixture(db);
    useFixtureEnv(fx);
    h = {};
    for (const [name, file] of [
      ["companies", "staff/companies"], ["buildings", "staff/buildings"], ["agreement", "staff/agreement"],
      ["esign", "webhooks/esign"], ["pubListings", "public/listings"]
    ]) h[name] = (await import(`../../api/yesdoor/${file}.mjs`)).default;
  });
  after(async () => { await close(); });

  /* ── who may do what ──────────────────────────────────────────────────── */

  test("every onboarding door: nobody 401, an account session 401, a non-Yesdoor role 403, collections 403", async () => {
    for (const door of ["companies", "buildings", "agreement"]) {
      assert.equal((await post(door, undefined, {})).code, 401, `${door} without a session`);
      assert.equal((await post(door, t().renterA, {})).code, 401, `${door} with a renter session`);
      assert.equal((await post(door, t().buildingA, {})).code, 401, `${door} with a building session`);
      assert.equal((await post(door, t().brokerA, {})).code, 401, `${door} with a broker session`);
      assert.equal((await post(door, t().closerA, {})).code, 403, `${door} with a closer`);
      assert.equal((await post(door, t().collectionsA, {})).code, 403, `${door} with collections`);
    }
  });

  /* ── companies ────────────────────────────────────────────────────────── */

  describe("POST staff/companies", () => {
    test("ops, sales and the owner can add a company; it starts as a target", async () => {
      for (const who of ["opsA", "salesA", "ownerA"]) {
        const r = await post("companies", t()[who], { name: `Cactus Rows ${who}`, tier: 2, hqState: "az", software: "yardi" });
        assert.equal(r.code, 201, who);
        assert.equal(r.body.company.name, `Cactus Rows ${who}`);
        assert.equal(r.body.company.status, "target");
        assert.equal(r.body.company.hqState, "AZ");
        assert.equal(r.body.company.isSample, false);
        assert.equal((await eventsFor(r.body.company.id)).map((e) => e.name)[0], "company.created");
      }
    });

    test("defaults: tier 3, software none, status target; pitched is allowed at the start", async () => {
      const r = await post("companies", t().opsA, { name: "Defaults Only Co", status: "pitched" });
      assert.equal(r.code, 201);
      assert.equal(r.body.company.tier, 3);
      assert.equal(r.body.company.software, "none");
      assert.equal(r.body.company.status, "pitched");
    });

    test("bad input is a plain 400, never a 500", async () => {
      const bad = [
        {}, { name: "  " }, { name: "X", tier: 9 }, { name: "X", tier: "2" }, { name: "X", hqState: "Arizona" },
        { name: "X", software: "excel" }, { name: "X", status: "signed" }, { name: "X", status: "live" }, { name: "x".repeat(300) }
      ];
      for (const body of bad) assert.equal((await post("companies", t().opsA, body)).code, 400, JSON.stringify(body).slice(0, 60));
    });

    test("a company cannot be signed by hand: status comes only from the agreement flow", async () => {
      const r = await post("companies", t().opsA, { name: "Sneaky Signed Co", status: "signed" });
      assert.equal(r.code, 400);
      assert.equal(await one(db, `SELECT id FROM yd_companies WHERE name = 'Sneaky Signed Co'`), null);
    });

    test("the same name twice is a 409 (any casing), and the other company can use it", async () => {
      assert.equal((await post("companies", t().opsA, { name: "Twin Name Holdings" })).code, 201);
      const again = await post("companies", t().opsA, { name: "TWIN NAME holdings" });
      assert.equal(again.code, 409);
      assert.equal(again.body.error, "company_exists");
      assert.equal((await post("companies", t().opsB, { name: "Twin Name Holdings" })).code, 201);
    });

    test("another company's staff never sees it, and it lands in the staff member's own company", async () => {
      const made = await post("companies", t().opsB, { name: "Org B Only Properties" });
      assert.equal(made.code, 201);
      const row = await one(db, `SELECT org_id FROM yd_companies WHERE id = $1`, [made.body.company.id]);
      assert.equal(row.org_id, fx.orgB);
      const seenByA = await call(h.companies, { token: t().opsA });
      assert.ok(!seenByA.body.companies.some((c) => c.name === "Org B Only Properties"));
    });

    test("GET still works and still carries no credit data", async () => {
      const r = await call(h.companies, { token: t().salesA });
      assert.equal(r.code, 200);
      assert.deepEqual(creditLeaks(r.body), []);
      assert.equal((await call(h.companies, { method: "DELETE", token: t().opsA })).code, 405);
    });
  });

  /* ── buildings ────────────────────────────────────────────────────────── */

  describe("POST staff/buildings (onboard)", () => {
    test("onboards a building with its details, fee terms, refund days, tour hours, connection and flags", async () => {
      const r = await post("buildings", t().salesA, buildingBody({
        name: "Full Terms Lofts", companyId: fx.A.company, unitsCount: 120, connection: "csv", lat: 33.42, lng: -111.93,
        tourHours: { "mon-fri": "09:00-17:00", sat: "10:00-16:00" },
        appFeeCents: 5500, appFeeWaived: false, secondChance: true, allowsRenterIncentive: true,
        feeKind: "percent_first_month", feePercent: 75, refundDays: 45, paymentTermsDays: 21
      }));
      assert.equal(r.code, 201, JSON.stringify(r.body));
      const b = r.body.building;
      assert.equal(b.name, "Full Terms Lofts");
      assert.equal(b.status, "target");
      assert.equal(b.leasingEmail, "leasing@onboard.example.test", "the email is stored lower-case");
      assert.equal(b.connection, "csv");
      assert.equal(b.software, "yardi", "software follows the company when not sent");
      assert.deepEqual(b.fee, { kind: "percent_first_month", percent: 75, flatCents: null, refundDays: 45, paymentTermsDays: 21 });
      assert.equal(b.appFeeCents, 5500);
      assert.equal(b.secondChance, true);
      assert.equal(b.allowsRenterIncentive, true);
      assert.deepEqual(b.tourHours, { "mon-fri": "09:00-17:00", sat: "10:00-16:00" });
      assert.equal(b.matchable, false, "no signed agreement, so no renters");
      assert.equal(b.isSample, false);
      const ev = await eventsFor(b.id);
      assert.equal(ev[0].name, "building.created");
      assert.equal(ev[0].actor_kind, "staff");
    });

    test("defaults: a full month's rent, 60 refund days, 30 payment days, manual connection, flags off", async () => {
      const r = await post("buildings", t().opsA, buildingBody());
      assert.equal(r.code, 201);
      const b = r.body.building;
      assert.deepEqual(b.fee, { kind: "percent_first_month", percent: 100, flatCents: null, refundDays: 60, paymentTermsDays: 30 });
      assert.equal(b.connection, "manual");
      assert.equal(b.secondChance, false);
      assert.equal(b.allowsRenterIncentive, false);
      assert.equal(b.appFeeWaived, false);
      assert.deepEqual(b.tourHours, {});
    });

    test("an application fee nobody told us stays UNKNOWN (null), never 0; a stated 0 is a real 0", async () => {
      const unknown = await post("buildings", t().opsA, buildingBody());
      assert.equal(unknown.body.building.appFeeCents, null);
      const nullFee = await post("buildings", t().opsA, buildingBody({ appFeeCents: null }));
      assert.equal(nullFee.body.building.appFeeCents, null);
      const zero = await post("buildings", t().opsA, buildingBody({ appFeeCents: 0 }));
      assert.equal(zero.body.building.appFeeCents, 0);
      const row = await one(db, `SELECT app_fee_cents FROM yd_buildings WHERE id = $1`, [unknown.body.building.id]);
      assert.equal(row.app_fee_cents, null);
    });

    test("a flat fee needs its amount and refuses a percent; a percent fee refuses a flat amount", async () => {
      const ok = await post("buildings", t().opsA, buildingBody({ feeKind: "flat", feeFlatCents: 100000 }));
      assert.equal(ok.code, 201);
      assert.deepEqual(ok.body.building.fee, { kind: "flat", percent: null, flatCents: 100000, refundDays: 60, paymentTermsDays: 30 });
      assert.equal((await post("buildings", t().opsA, buildingBody({ feeKind: "flat" }))).code, 400);
      assert.equal((await post("buildings", t().opsA, buildingBody({ feeKind: "flat", feeFlatCents: 100000, feePercent: 50 }))).code, 400);
      assert.equal((await post("buildings", t().opsA, buildingBody({ feeKind: "percent_first_month", feeFlatCents: 1000 }))).code, 400);
      assert.equal((await post("buildings", t().opsA, buildingBody({ feeKind: "percent_first_month", feePercent: -5 }))).code, 400);
    });

    test("bad input is a plain 400: name, address, city, state, email, tour hours, connection, status", async () => {
      const bad = [
        { name: "" }, { address: "" }, { city: "" }, { state: "Arizona" }, { state: undefined },
        { leasingEmail: "not-an-email" }, { leasingEmail: undefined },
        { tourHours: { funday: "09:00-17:00" } }, { tourHours: { mon: "9am-5pm" } }, { tourHours: [] },
        { connection: "fax" }, { status: "signed" }, { status: "live" }, { software: "excel" },
        { unitsCount: 0 }, { appFeeCents: -1 }, { appFeeCents: "5000" }, { refundDays: 999 }, { secondChance: "yes" },
        { lat: 120 }, { companyId: "nope" }
      ];
      for (const over of bad) {
        const body = buildingBody(over);
        for (const k of Object.keys(over)) if (over[k] === undefined) delete body[k];
        assert.equal((await post("buildings", t().opsA, body)).code, 400, JSON.stringify(over));
      }
    });

    test("a company id from another company is a 404, not a quiet cross-link", async () => {
      const r = await post("buildings", t().opsA, buildingBody({ companyId: fx.B.company }));
      assert.equal(r.code, 404);
      assert.equal(r.body.error, "company_not_found");
    });

    test("the same building twice is a 409; the other company can onboard it", async () => {
      const body = buildingBody({ name: "Twin Tower Flats", address: "1 Twin Way" });
      assert.equal((await post("buildings", t().opsA, body)).code, 201);
      assert.equal((await post("buildings", t().opsA, { ...body, name: "TWIN TOWER FLATS" })).code, 409);
      assert.equal((await post("buildings", t().opsB, body)).code, 201);
    });

    test("a new building shows up in GET with matchable false, and in no public search", async () => {
      const made = await post("buildings", t().opsA, buildingBody({ name: "Quiet Until Signed Flats" }));
      const list = await call(h.buildings, { token: t().salesA, query: { limit: "500" } });
      const row = list.body.buildings.find((b) => b.id === made.body.building.id);
      assert.ok(row);
      assert.equal(row.matchable, false);
      assert.equal(row.status, "target");
      assert.deepEqual(creditLeaks(list.body), []);
    });
  });

  describe("POST staff/buildings (status by hand)", () => {
    test("target <-> pitched works; signed and agreement_sent can never be set by hand", async () => {
      const b = (await post("buildings", t().opsA, buildingBody())).body.building;
      const up = await post("buildings", t().opsA, { buildingId: b.id, status: "pitched", reason: "met them" });
      assert.equal(up.code, 200);
      assert.equal(up.body.building.status, "pitched");
      for (const status of ["signed", "agreement_sent", "live"]) {
        const r = await post("buildings", t().opsA, { buildingId: b.id, status });
        assert.equal(r.code, 409, status);
      }
      const bad = await post("buildings", t().opsA, { buildingId: b.id, status: "bogus" });
      assert.equal(bad.code, 400);
      const events = (await eventsFor(b.id)).map((e) => e.name);
      assert.ok(events.includes("building.status_changed"));
    });

    test("pausing and resuming: resume needs a signed agreement; repeating a status is a no-op", async () => {
      const sb = await mkSignedBuilding(db, fx);
      const paused = await post("buildings", t().opsA, { buildingId: sb.buildingId, status: "paused", reason: "slow pay" });
      assert.equal(paused.code, 200);
      assert.equal(paused.body.building.status, "paused");
      const again = await post("buildings", t().opsA, { buildingId: sb.buildingId, status: "paused" });
      assert.equal(again.body.unchanged, true);
      const live = await post("buildings", t().opsA, { buildingId: sb.buildingId, status: "live" });
      assert.equal(live.code, 200);
      assert.equal(live.body.building.status, "live");

      // A building whose agreement was never signed cannot be resumed, only left paused.
      const orphan = (await post("buildings", t().opsA, buildingBody())).body.building;
      await db.query(`UPDATE yd_buildings SET status = 'paused' WHERE id = $1`, [orphan.id]);
      const refused = await post("buildings", t().opsA, { buildingId: orphan.id, status: "live" });
      assert.equal(refused.code, 409);
      assert.equal(refused.body.error, "no_signed_agreement");
    });

    test("another company's building is a 404", async () => {
      const r = await post("buildings", t().opsA, { buildingId: fx.B.bSigned, status: "paused" });
      assert.equal(r.code, 404);
      const row = await one(db, `SELECT status FROM yd_buildings WHERE id = $1`, [fx.B.bSigned]);
      assert.equal(row.status, "signed");
    });
  });

  /* ── agreements and signing ───────────────────────────────────────────── */

  describe("agreements: draft, send, sign", () => {
    const newBuilding = async (over = {}) => (await post("buildings", t().opsA, buildingBody(over))).body.building;
    const signWith = (link, over = {}) => call(h.esign, { method: "POST", body: { url: link.url, signerName: "Pat Leasing", ...over } });

    test("a draft snapshots the building's fee terms and sends nothing", async () => {
      const b = await newBuilding({ feePercent: 80, refundDays: 50, paymentTermsDays: 15 });
      const r = await post("agreement", t().salesA, { partyKind: "building", partyId: b.id, action: "draft" });
      assert.equal(r.code, 201);
      assert.equal(r.body.agreement.status, "draft");
      assert.equal(r.body.agreement.kind, "building_fee");
      assert.deepEqual(r.body.agreement.terms, { fee_kind: "percent_first_month", fee_percent: 80, fee_flat_cents: null, refund_days: 50, payment_terms_days: 15 });
      assert.equal(r.body.signing, null);
      assert.equal(await one(db, `SELECT id FROM yd_outbox WHERE related_id = $1`, [r.body.agreement.id]), null);
      const st = await one(db, `SELECT status FROM yd_buildings WHERE id = $1`, [b.id]);
      assert.equal(st.status, "target");
    });

    test("sending: a link comes back, one email is queued with it, the building becomes agreement_sent", async () => {
      const b = await newBuilding();
      const r = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      assert.equal(r.code, 201);
      assert.equal(r.body.agreement.status, "sent");
      assert.ok(r.body.agreement.sentAt);
      assert.equal(r.body.signing.sandbox, true);
      assert.match(r.body.signing.url, /\/yesdoor\/agreement\.html\?id=.+&exp=\d+&sig=[0-9a-f]{64}$/);
      assert.ok(new Date(r.body.signing.expiresAt) > new Date());

      const mail = await rows(db, `SELECT channel, to_address, template_key, context, status FROM yd_outbox WHERE related_id = $1`, [r.body.agreement.id]);
      assert.equal(mail.length, 1);
      assert.equal(mail[0].to_address, b.leasingEmail);
      assert.equal(mail[0].template_key, "yd-agreement-sign");
      assert.equal(mail[0].status, "queued", "nothing transmits: the sandbox dispatcher is a later step");
      assert.equal(mail[0].context.agreement.url, r.body.signing.url);
      assert.equal((await one(db, `SELECT status FROM yd_buildings WHERE id = $1`, [b.id])).status, "agreement_sent");
      assert.deepEqual((await eventsFor(r.body.agreement.id)).map((e) => e.name), ["agreement.drafted", "agreement.sent"]);
    });

    test("a second open agreement for the same building is a 409 that names the first; sending again makes a fresh link", async () => {
      const b = await newBuilding();
      const first = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      const dupe = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      assert.equal(dupe.code, 409);
      assert.equal(dupe.body.error, "agreement_open");
      assert.match(dupe.body.message, new RegExp(first.body.agreement.id));
      const resend = await post("agreement", t().opsA, { agreementId: first.body.agreement.id, action: "send" });
      assert.equal(resend.code, 200);
      assert.equal(resend.body.agreement.status, "sent");
      assert.equal((await rows(db, `SELECT id FROM yd_outbox WHERE related_id = $1`, [first.body.agreement.id])).length, 2);
      assert.ok((await eventsFor(first.body.agreement.id)).some((e) => e.name === "agreement.resent"));
    });

    test("a draft can be sent later by its id", async () => {
      const b = await newBuilding();
      const draft = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id, action: "draft" });
      const sent = await post("agreement", t().opsA, { agreementId: draft.body.agreement.id, action: "send" });
      assert.equal(sent.code, 200);
      assert.equal(sent.body.agreement.status, "sent");
      assert.ok(sent.body.signing.url);
    });

    test("signing with the link: agreement signed, building signed and now matchable, one event, signer recorded", async () => {
      const b = await newBuilding();
      const sent = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      const signed = await signWith(sent.body.signing, { signerName: "  Dana Regional  " });
      assert.equal(signed.code, 200);
      assert.equal(signed.body.status, "signed");
      assert.equal(signed.body.alreadySigned, false);
      const a = await one(db, `SELECT status, signer_name, signed_at, host(signer_ip) AS ip FROM yd_agreements WHERE id = $1`, [sent.body.agreement.id]);
      assert.equal(a.status, "signed");
      assert.equal(a.signer_name, "Dana Regional");
      assert.ok(a.signed_at);
      const row = await one(db, `SELECT status, public.yd_building_is_matchable(id) AS matchable FROM yd_buildings WHERE id = $1`, [b.id]);
      assert.equal(row.status, "signed");
      assert.equal(row.matchable, true);
      const ev = (await eventsFor(sent.body.agreement.id)).filter((e) => e.name === "agreement.signed");
      assert.equal(ev.length, 1);
      assert.equal(ev[0].actor_kind, "sandbox");
    });

    test("signing twice is a harmless 200 that changes nothing", async () => {
      const b = await newBuilding();
      const sent = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      await signWith(sent.body.signing);
      const before = await one(db, `SELECT signed_at, signer_name FROM yd_agreements WHERE id = $1`, [sent.body.agreement.id]);
      const again = await signWith(sent.body.signing, { signerName: "Someone Else" });
      assert.equal(again.code, 200);
      assert.equal(again.body.alreadySigned, true);
      const after2 = await one(db, `SELECT signed_at, signer_name FROM yd_agreements WHERE id = $1`, [sent.body.agreement.id]);
      assert.deepEqual(after2, before);
      assert.equal((await eventsFor(sent.body.agreement.id)).filter((e) => e.name === "agreement.signed").length, 1);
    });

    test("the three parts of the link work in place of the whole url", async () => {
      const b = await newBuilding();
      const sent = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      const u = new URL(sent.body.signing.url, "http://x.invalid");
      const r = await call(h.esign, { method: "POST", body: { id: u.searchParams.get("id"), exp: u.searchParams.get("exp"), sig: u.searchParams.get("sig"), signerName: "Parts Signer" } });
      assert.equal(r.code, 200);
    });

    test("a forged, expired, wrong-secret or unknown link is ONE answer: 404 not_found, and nothing signs", async () => {
      const b = await newBuilding();
      const sent = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      const id = sent.body.agreement.id;
      const good = new URL(sent.body.signing.url, "http://x.invalid");
      const forged = `/yesdoor/agreement.html?id=${id}&exp=${good.searchParams.get("exp")}&sig=${"0".repeat(64)}`;
      const expired = createSigningLink({ agreementId: id, ttlSeconds: 5, secret: LINK_SECRET, now: () => Date.now() - 60_000 });
      const wrongSecret = createSigningLink({ agreementId: id, secret: "another-secret-another-secret-another-secret" });
      const unknown = createSigningLink({ agreementId: "11111111-1111-4111-8111-111111111111", secret: LINK_SECRET });
      const answers = [];
      for (const url of [forged, expired.url, wrongSecret.url, unknown.url, "", "not a url", "/x?id=1"]) {
        const r = await call(h.esign, { method: "POST", body: { url, signerName: "Eve" } });
        answers.push([r.code, r.body.error]);
      }
      assert.deepEqual([...new Set(answers.map(String))], ["404,not_found"]);
      assert.equal((await one(db, `SELECT status FROM yd_agreements WHERE id = $1`, [id])).status, "sent");
    });

    test("a genuine link with no signer name is a 400 and signs nothing", async () => {
      const b = await newBuilding();
      const sent = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      for (const signerName of [undefined, "", "   ", 42]) {
        const r = await signWith(sent.body.signing, { signerName });
        assert.equal(r.code, 400);
        assert.equal(r.body.error, "signer_name_required");
      }
      assert.equal((await one(db, `SELECT status FROM yd_agreements WHERE id = $1`, [sent.body.agreement.id])).status, "sent");
    });

    test("another company's agreement cannot be signed through this door, even with a perfectly valid link", async () => {
      const bB = (await post("buildings", t().opsB, buildingBody())).body.building;
      const sentB = await post("agreement", t().opsB, { partyKind: "building", partyId: bB.id });
      assert.equal(sentB.code, 201);
      const r = await signWith(sentB.body.signing);       // the public doors serve company A (YD_ORG_SLUG)
      assert.equal(r.code, 404);
      assert.equal((await one(db, `SELECT status FROM yd_agreements WHERE id = $1`, [sentB.body.agreement.id])).status, "sent");
    });

    test("only POST; and an agreement that was voided or never sent cannot be signed", async () => {
      assert.equal((await call(h.esign, { method: "GET" })).code, 405);
      const b = await newBuilding();
      const draft = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id, action: "draft" });
      const link = createSigningLink({ agreementId: draft.body.agreement.id, secret: LINK_SECRET });
      const early = await signWith(link);
      assert.equal(early.code, 409);
      assert.equal(early.body.error, "not_sent");
      await post("agreement", t().opsA, { agreementId: draft.body.agreement.id, action: "send" });
      await post("agreement", t().opsA, { agreementId: draft.body.agreement.id, action: "void" });
      const late = await signWith(link);
      assert.equal(late.code, 409);
      assert.equal(late.body.error, "agreement_void");
    });

    test("a signed agreement is never edited: it cannot be re-sent, only voided", async () => {
      const b = await newBuilding();
      const sent = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      await signWith(sent.body.signing);
      const resend = await post("agreement", t().opsA, { agreementId: sent.body.agreement.id, action: "send" });
      assert.equal(resend.code, 409);
      assert.equal(resend.body.error, "already_signed");
      const dupe = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      assert.equal(dupe.code, 409);
      assert.equal(dupe.body.error, "already_signed");
    });

    test("voiding a signed agreement pauses the building it opened, and it can no longer take renters", async () => {
      const b = await newBuilding();
      const sent = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      await signWith(sent.body.signing);
      const voided = await post("agreement", t().opsA, { agreementId: sent.body.agreement.id, action: "void" });
      assert.equal(voided.code, 200);
      assert.equal(voided.body.agreement.status, "void");
      assert.deepEqual(voided.body.paused, [b.id]);
      const row = await one(db, `SELECT status, public.yd_building_is_matchable(id) AS matchable FROM yd_buildings WHERE id = $1`, [b.id]);
      assert.equal(row.status, "paused");
      assert.equal(row.matchable, false);
      assert.equal((await post("agreement", t().opsA, { agreementId: sent.body.agreement.id, action: "void" })).code, 200, "voiding twice is harmless");
    });

    test("a company-wide agreement must state its terms, then signs every building still onboarding", async () => {
      const co = (await post("companies", t().opsA, { name: `Group Deal Co ${Math.random().toString(36).slice(2, 6)}` })).body.company;
      const b1 = await newBuilding({ companyId: co.id });
      const b2 = await newBuilding({ companyId: co.id });
      const paused = await newBuilding({ companyId: co.id });
      await db.query(`UPDATE yd_buildings SET status = 'paused' WHERE id = $1`, [paused.id]);
      const noTerms = await post("agreement", t().opsA, { partyKind: "company", partyId: co.id, toEmail: "deals@group.example.test" });
      assert.equal(noTerms.code, 400, "a company has no fee columns, so its agreement must state them");
      const noEmail = await post("agreement", t().opsA, {
        partyKind: "company", partyId: co.id, terms: { feeKind: "percent_first_month", feePercent: 90, refundDays: 60, paymentTermsDays: 30 }
      });
      assert.equal(noEmail.code, 409, "a company has no email on file");
      assert.equal(noEmail.body.error, "no_recipient");
      // The draft from that attempt is still there: send it with an address.
      const draftId = (await one(db, `SELECT id FROM yd_agreements WHERE party_id = $1`, [co.id])).id;
      const sent = await post("agreement", t().opsA, { agreementId: draftId, action: "send", toEmail: "deals@group.example.test" });
      assert.equal(sent.code, 200);
      assert.deepEqual(sent.body.agreement.terms, { fee_kind: "percent_first_month", fee_percent: 90, fee_flat_cents: null, refund_days: 60, payment_terms_days: 30 });
      assert.equal((await one(db, `SELECT to_address FROM yd_outbox WHERE related_id = $1`, [draftId])).to_address, "deals@group.example.test");
      assert.equal((await one(db, `SELECT status FROM yd_buildings WHERE id = $1`, [b1.id])).status, "agreement_sent");

      const signed = await signWith(sent.body.signing);
      assert.equal(signed.code, 200);
      for (const id of [b1.id, b2.id]) {
        const row = await one(db, `SELECT status, public.yd_building_is_matchable(id) AS m FROM yd_buildings WHERE id = $1`, [id]);
        assert.equal(row.status, "signed");
        assert.equal(row.m, true, "the company's signature covers its buildings");
      }
      assert.equal((await one(db, `SELECT status FROM yd_buildings WHERE id = $1`, [paused.id])).status, "paused", "a paused building stays paused");
      assert.equal((await one(db, `SELECT status FROM yd_companies WHERE id = $1`, [co.id])).status, "signed");
    });

    test("sample companies, sample buildings and unknown parties cannot be sent an agreement", async () => {
      const sample = await post("agreement", t().opsA, { partyKind: "building", partyId: fx.A.bSample });
      assert.equal(sample.code, 409);
      assert.equal(sample.body.error, "sample_party");
      assert.equal((await post("agreement", t().opsA, { partyKind: "building", partyId: "11111111-1111-4111-8111-111111111111" })).code, 404);
      assert.equal((await post("agreement", t().opsA, { partyKind: "building", partyId: fx.B.bSigned })).code, 404, "another company's building");
    });

    test("a broker partner agreement: signed makes an unlicensed split partner wait, a licensed one active", async () => {
      const mk = async (plan, verified) => (await db.query(
        `INSERT INTO yd_brokers (org_id, name, email, plan, status, licence_state, licence_verified_at)
         VALUES ($1,$2,$3,$4,'applied','AZ',$5) RETURNING id`,
        [fx.orgA, `Partner ${plan}`, `partner-${plan}-${Math.random().toString(36).slice(2, 7)}@example.test`, plan, verified ? new Date() : null])).rows[0].id;
      const unlicensed = await mk("split", false);
      const licensed = await mk("split", true);
      const software = await mk("software", false);
      for (const [id, expected] of [[unlicensed, "applied"], [licensed, "active"], [software, "active"]]) {
        const sent = await post("agreement", t().opsA, { partyKind: "broker", partyId: id });
        assert.equal(sent.code, 201);
        assert.equal(sent.body.agreement.kind, "broker_partner");
        assert.deepEqual(Object.keys(sent.body.agreement.terms).sort(), ["plan", "split_percent"]);
        assert.equal((await signWith(sent.body.signing)).code, 200);
        assert.equal((await one(db, `SELECT status FROM yd_brokers WHERE id = $1`, [id])).status, expected);
      }
      assert.equal((await post("agreement", t().opsA, { partyKind: "building", partyId: licensed, kind: "broker_partner" })).code, 400, "a building agreement is a fee agreement, not a partner one");
    });

    test("bad requests: no party, bad kind, bad action, kind that does not match the party", async () => {
      const b = await newBuilding();
      assert.equal((await post("agreement", t().opsA, {})).code, 400);
      assert.equal((await post("agreement", t().opsA, { partyKind: "tenant", partyId: b.id })).code, 400);
      assert.equal((await post("agreement", t().opsA, { partyKind: "building" })).code, 400);
      assert.equal((await post("agreement", t().opsA, { partyKind: "building", partyId: b.id, action: "shred" })).code, 400);
      assert.equal((await post("agreement", t().opsA, { partyKind: "building", partyId: b.id, kind: "broker_partner" })).code, 400);
      assert.equal((await post("agreement", t().opsA, { agreementId: "nope" })).code, 400);
      assert.equal((await post("agreement", t().opsA, { agreementId: "11111111-1111-4111-8111-111111111111" })).code, 404);
      assert.equal((await call(h.agreement, { token: t().opsA })).code, 405);
    });

    test("without YD_LINK_SECRET sending fails closed with a 503 and changes nothing", async () => {
      const b = await newBuilding();
      const draft = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id, action: "draft" });
      const saved = process.env.YD_LINK_SECRET;
      delete process.env.YD_LINK_SECRET;
      try {
        const r = await post("agreement", t().opsA, { agreementId: draft.body.agreement.id, action: "send" });
        assert.equal(r.code, 503);
        assert.equal(r.body.error, "signing_not_configured");
      } finally { process.env.YD_LINK_SECRET = saved; }
      assert.equal((await one(db, `SELECT status FROM yd_agreements WHERE id = $1`, [draft.body.agreement.id])).status, "draft");
      assert.equal((await one(db, `SELECT status FROM yd_buildings WHERE id = $1`, [b.id])).status, "target");
    });

    test("the end of the road: a signed building appears in the public search once it has a listing", async () => {
      const b = await newBuilding();
      await db.query(
        `INSERT INTO yd_listings (org_id, building_id, unit_label, beds, rent_cents, active) VALUES ($1,$2,'Z9',1,155000,true)`, [fx.orgA, b.id]);
      const before = await call(h.pubListings, { query: { maxRent: "1550" } });
      assert.ok(!before.body.listings.some((l) => l.building.id === b.id), "not public while it is only a target");
      const sent = await post("agreement", t().opsA, { partyKind: "building", partyId: b.id });
      await signWith(sent.body.signing);
      const afterSign = await call(h.pubListings, { query: { maxRent: "1550" } });
      assert.ok(afterSign.body.listings.some((l) => l.building.id === b.id), "public once signed");
    });
  });
});
