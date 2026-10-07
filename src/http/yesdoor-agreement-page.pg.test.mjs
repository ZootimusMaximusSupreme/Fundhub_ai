// Postgres-backed tests for the signing page's read:
//   GET /api/yesdoor/public/agreement?id&exp&sig        (the page: public/yesdoor/agreement.html)
// and its hand-off to POST /api/yesdoor/webhooks/esign.
//
// Proved: a good link returns the agreement's terms and nothing else (no signer, address or
// email); every bad link is ONE identical 404 (forged, tampered, expired, missing parts, unknown
// agreement, another company's agreement, a draft, no signing secret), so the door cannot be
// used to find out which agreements exist; reading changes nothing; the status follows the
// agreement (sent, signed, void); a building, a company and a broker agreement each show their
// own terms; signing from the page's own parameters works.
//
// SCRATCH database only, as fundhub_app. Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db, close } from "../db.mjs";
import { buildYdFixture, call } from "../yesdoor/testing/fixture.mjs";
import { useFixtureEnv, LINK_SECRET, one } from "../yesdoor/testing/b4.mjs";
import { createSigningLink } from "../yesdoor/providers/esign-sandbox.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("yesdoor agreement signing page read", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, h;
  const t = () => fx.tokens;
  const post = (door, token, body) => call(h[door], { method: "POST", token, body });
  const get = (query) => call(h.agreementPage, { query });
  const partsOf = (url) => Object.fromEntries(new URL(url, "http://x.invalid").searchParams.entries());
  const getLink = (url) => get(partsOf(url));
  let n = 0;

  /** A fresh target building and its sent fee agreement; returns { buildingId, agreement, signing }. */
  const sentBuildingAgreement = async (over = {}) => {
    const b = await post("buildings", t().opsA, {
      name: `Page Test Flats ${++n}-${fx.rand}`, address: `${n} Page Way`, city: "Tempe", state: "AZ",
      leasingEmail: `leasing-page-${n}-${fx.rand}@example.test`, feeKind: "percent_first_month", feePercent: 80,
      refundDays: 45, paymentTermsDays: 21, ...over
    });
    assert.equal(b.code, 201, JSON.stringify(b.body));
    const sent = await post("agreement", t().opsA, { partyKind: "building", partyId: b.body.building.id, action: "send" });
    assert.equal(sent.code, 201, JSON.stringify(sent.body));
    return { building: b.body.building, agreement: sent.body.agreement, signing: sent.body.signing };
  };

  before(async () => {
    fx = await buildYdFixture(db);
    useFixtureEnv(fx);
    h = {};
    for (const [name, file] of [
      ["agreementPage", "public/agreement"], ["agreement", "staff/agreement"], ["buildings", "staff/buildings"],
      ["brokers", "staff/brokers"], ["esign", "webhooks/esign"]
    ]) h[name] = (await import(`../../api/yesdoor/${file}.mjs`)).default;
  });
  after(async () => { await close(); });

  test("a good building link shows the agreement's terms and the building's name, and nothing about anyone", async () => {
    const { building, agreement, signing } = await sentBuildingAgreement();
    const r = await getLink(signing.url);
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true);
    const a = r.body.agreement;
    assert.equal(a.id, agreement.id);
    assert.equal(a.kind, "building_fee");
    assert.equal(a.partyKind, "building");
    assert.equal(a.partyName, building.name);
    assert.equal(a.status, "sent");
    assert.equal(a.signedAt, null);
    assert.equal(a.sandbox, true);
    assert.ok(Math.abs(new Date(a.expiresAt).getTime() - (Date.now() + 30 * 86_400_000)) < 120_000, "the link expires in about 30 days");
    assert.deepEqual(a.terms, { feeKind: "percent_first_month", feePercent: 80, feeFlatCents: null, refundDays: 45, paymentTermsDays: 21 });
    assert.deepEqual(Object.keys(a).sort(), ["expiresAt", "id", "kind", "partyKind", "partyName", "sandbox", "signedAt", "status", "terms"]);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes(`leasing-page-${n}-${fx.rand}`), "the leasing email is not in the page's data");
    assert.ok(!/signer|@/i.test(text), "no signer, address or email");
    assert.equal(r.headers["cache-control"], "no-store");
  });

  test("a flat-fee building shows its flat fee", async () => {
    const { signing } = await sentBuildingAgreement({ feeKind: "flat", feePercent: undefined, feeFlatCents: 120000 });
    const r = await getLink(signing.url);
    assert.deepEqual(r.body.agreement.terms, { feeKind: "flat", feePercent: null, feeFlatCents: 120000, refundDays: 45, paymentTermsDays: 21 });
  });

  test("a company agreement shows the terms staff stated; a broker agreement shows the plan and split", async () => {
    const company = await post("agreement", t().opsA, {
      partyKind: "company", partyId: fx.A.company, action: "send", toEmail: `legal-${fx.rand}@example.test`,
      terms: { feeKind: "percent_first_month", feePercent: 90, refundDays: 30, paymentTermsDays: 15 }
    });
    assert.equal(company.code, 201, JSON.stringify(company.body));
    const cr = await getLink(company.body.signing.url);
    assert.equal(cr.code, 200);
    assert.equal(cr.body.agreement.partyKind, "company");
    assert.deepEqual(cr.body.agreement.terms, { feeKind: "percent_first_month", feePercent: 90, feeFlatCents: null, refundDays: 30, paymentTermsDays: 15 });
    const broker = await post("brokers", t().opsA, {
      name: `Page Broker ${fx.rand}`, email: `page-broker-${fx.rand}@example.test`, plan: "split", splitPercent: 35, licenceState: "AZ", licenceNumber: "BR777"
    });
    const sent = await post("agreement", t().opsA, { partyKind: "broker", partyId: broker.body.broker.id, action: "send" });
    assert.equal(sent.code, 201);
    const r = await getLink(sent.body.signing.url);
    assert.equal(r.code, 200);
    assert.equal(r.body.agreement.kind, "broker_partner");
    assert.equal(r.body.agreement.partyName, broker.body.broker.name);
    assert.deepEqual(r.body.agreement.terms, { plan: "split", splitPercent: 35 });
  });

  test("EVERY bad link is the same 404: forged, tampered, expired, missing parts, unknown, other company, draft, no secret", async () => {
    const { agreement, signing } = await sentBuildingAgreement();
    const good = partsOf(signing.url);

    // another company's agreement, signed with the right secret: valid link, wrong company
    const foreignAgreement = (await one(db,
      `INSERT INTO yd_agreements (org_id, party_kind, party_id, kind, status, terms)
       VALUES ($1,'building',$2,'building_fee','draft','{}') RETURNING id`, [fx.orgB, fx.B.bUnsigned])).id;
    await db.query(`UPDATE yd_agreements SET status='sent', sent_at=now() WHERE id=$1`, [foreignAgreement]);
    const foreign = partsOf(createSigningLink({ agreementId: foreignAgreement, secret: LINK_SECRET }).url);

    // a draft that was never sent, with a genuine link minted by hand
    const draftBuilding = await post("buildings", t().opsA, {
      name: `Draft Only ${fx.rand}`, address: "1 Draft Way", city: "Mesa", state: "AZ", leasingEmail: `draft-${fx.rand}@example.test`
    });
    const draft = await post("agreement", t().opsA, { partyKind: "building", partyId: draftBuilding.body.building.id, action: "draft" });
    assert.equal(draft.code, 201);
    assert.equal(draft.body.agreement.status, "draft");
    const draftLink = partsOf(createSigningLink({ agreementId: draft.body.agreement.id, secret: LINK_SECRET }).url);

    const expired = partsOf(createSigningLink({ agreementId: agreement.id, secret: LINK_SECRET, ttlSeconds: 60, now: () => Date.now() - 3_600_000 }).url);
    const unknown = partsOf(createSigningLink({ agreementId: crypto.randomUUID(), secret: LINK_SECRET }).url);
    const notUuid = partsOf(createSigningLink({ agreementId: "not-a-uuid", secret: LINK_SECRET }).url);

    const bad = {
      "forged signature": { ...good, sig: "0".repeat(64) },
      "short signature": { ...good, sig: "abc" },
      "tampered id": { ...good, id: crypto.randomUUID() },
      "tampered expiry": { ...good, exp: String(Number(good.exp) + 1000) },
      "expired": expired,
      "no id": { exp: good.exp, sig: good.sig },
      "no exp": { id: good.id, sig: good.sig },
      "no sig": { id: good.id, exp: good.exp },
      "nothing": {},
      "unknown agreement": unknown,
      "id that is not a uuid": notUuid,
      "another company's agreement": foreign,
      "a draft": draftLink,
      "garbage": { id: "x", exp: "y", sig: "z" }
    };
    const answers = {};
    for (const [what, query] of Object.entries(bad)) {
      const r = await get(query);
      assert.equal(r.code, 404, what);
      answers[what] = JSON.stringify(r.body);
    }
    assert.equal(new Set(Object.values(answers)).size, 1, `the 404 differs by reason: ${JSON.stringify(answers)}`);
    assert.deepEqual(JSON.parse(Object.values(answers)[0]), { ok: false, error: "not_found" });

    // the good link still works afterwards, and fails closed with no signing secret
    assert.equal((await get(good)).code, 200);
    const saved = process.env.YD_LINK_SECRET;
    try {
      delete process.env.YD_LINK_SECRET;
      const r = await get(good);
      assert.equal(r.code, 404);
      assert.deepEqual(r.body, { ok: false, error: "not_found" });
    } finally {
      process.env.YD_LINK_SECRET = saved;
    }
  });

  test("reading changes nothing: no event, no row touched, however many times it is read", async () => {
    const { agreement, signing } = await sentBuildingAgreement();
    const snap = async () => ({
      events: (await one(db, `SELECT count(*)::int AS n FROM yd_events WHERE org_id = $1`, [fx.orgA])).n,
      agreement: await one(db, `SELECT status, updated_at, signed_at FROM yd_agreements WHERE id = $1`, [agreement.id]),
      outbox: (await one(db, `SELECT count(*)::int AS n FROM yd_outbox WHERE org_id = $1`, [fx.orgA])).n
    });
    const before = await snap();
    for (let i = 0; i < 3; i++) assert.equal((await getLink(signing.url)).code, 200);
    await get({});
    assert.deepEqual(await snap(), before);
  });

  test("the status follows the agreement: sent, then signed (with the time), and a signed one shows no form to fill", async () => {
    const { agreement, signing } = await sentBuildingAgreement();
    assert.equal((await getLink(signing.url)).body.agreement.status, "sent");
    const p = partsOf(signing.url);
    const signed = await post("esign", undefined, { id: p.id, exp: p.exp, sig: p.sig, signerName: "Pat Leasing" });
    assert.equal(signed.code, 200, JSON.stringify(signed.body));
    assert.equal(signed.body.alreadySigned, false);
    const after = (await getLink(signing.url)).body.agreement;
    assert.equal(after.status, "signed");
    assert.ok(after.signedAt);
    assert.equal(JSON.stringify(after).includes("Pat Leasing"), false, "the signer's name is not handed back to whoever holds the link");
    assert.equal(after.terms.feePercent, 80, "the terms they signed are still shown");
    const again = await post("esign", undefined, { id: p.id, exp: p.exp, sig: p.sig, signerName: "Someone Else" });
    assert.equal(again.code, 200);
    assert.equal(again.body.alreadySigned, true);
    const row = await one(db, `SELECT signer_name FROM yd_agreements WHERE id = $1`, [agreement.id]);
    assert.equal(row.signer_name, "Pat Leasing");
  });

  test("signing needs a typed name: the page's POST without one is a 400 and the agreement stays sent", async () => {
    const { agreement, signing } = await sentBuildingAgreement();
    const p = partsOf(signing.url);
    for (const signerName of [undefined, "", "   "]) {
      const r = await post("esign", undefined, { id: p.id, exp: p.exp, sig: p.sig, signerName });
      assert.equal(r.code, 400);
      assert.equal(r.body.error, "signer_name_required");
    }
    assert.equal((await one(db, `SELECT status FROM yd_agreements WHERE id = $1`, [agreement.id])).status, "sent");
  });

  test("a voided agreement says so and shows no terms; its link no longer signs", async () => {
    const { agreement, signing } = await sentBuildingAgreement();
    const v = await post("agreement", t().opsA, { agreementId: agreement.id, action: "void" });
    assert.equal(v.code, 200);
    const r = await getLink(signing.url);
    assert.equal(r.code, 200);
    assert.equal(r.body.agreement.status, "void");
    assert.equal(r.body.agreement.terms, null);
    const p = partsOf(signing.url);
    const s = await post("esign", undefined, { id: p.id, exp: p.exp, sig: p.sig, signerName: "Too Late" });
    assert.equal(s.code, 409);
  });

  test("only GET: POST, PUT and DELETE are a 405", async () => {
    const { signing } = await sentBuildingAgreement();
    for (const method of ["POST", "PUT", "DELETE"]) {
      const r = await call(h.agreementPage, { method, query: partsOf(signing.url) });
      assert.equal(r.code, 405, method);
      assert.equal(r.headers.allow, "GET");
    }
  });
});
