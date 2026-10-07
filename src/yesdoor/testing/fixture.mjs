// Shared fixture for the Yesdoor *.pg.test.mjs files. Test support only: nothing
// in api/ or src/ imports this outside a test.
//
// Every call builds TWO brand-new orgs (slug yesdoor-test-<random>-a / -b), so a
// run can never collide with another run, with the seeded 'yesdoor' org, or with
// Fundhub. Yesdoor tables keep every record forever (DELETE is revoked from the
// app role and a trigger blocks it anyway), so fixtures are never cleaned up;
// they are isolated instead. Run against a SCRATCH database only, as fundhub_app.
//
// Org A is the full story, one consistent renter file end to end:
//   renter "Rita Tester-<tag>" (the tag keeps the two orgs' names apart) first-touched by broker "Ben Broker", screened (complete),
//   income verified, matched `approved` at the signed building "Alder Test Lofts",
//   booked, registered (email queued + timestamped), toured, applied, approved,
//   lease signed, moved in, invoiced and paid (paid 61 days ago, so the 60-day fee
//   can go safe and the broker share can be released in the core tests).
// Plus a second renter at a second signed building, a sample building, listings in
// every visibility state, an open attribution dispute, and one account of each kind.
// Org B has just enough of its own rows to prove nothing crosses.
//
// Distinctive markers are planted in the credit data so a test can assert they
// never appear in a response that must not carry them.

import crypto from "node:crypto";
import { createSession } from "../../auth/session.mjs";
import { createAccountSession } from "../auth/session.mjs";

export const MARKERS = Object.freeze({
  criminalCategory: "tester-felony-marker",
  rawPayload: "RAW-MARKER-9f3a",
  creditScore: 618,
  evictions: 1,
  collections: 2
});

/** Keys no building, broker or renter response may contain, in any casing. */
export const CREDIT_KEYS = Object.freeze([
  "creditscore", "evictioncount", "criminalflags", "collectionscount",
  "evictionlastat", "rawref"
]);

/** Walk a JSON body and fail on any credit key or any `raw*` key, or any marker. */
export function creditLeaks(body) {
  const leaks = [];
  const walk = (v, where) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v)) {
        const n = k.toLowerCase().replace(/_/g, "");
        if (CREDIT_KEYS.includes(n) || n === "raw" || n.startsWith("raw")) leaks.push(`${where}.${k}`);
        walk(val, `${where}.${k}`);
      }
    }
  };
  walk(body, "$");
  const text = JSON.stringify(body);
  for (const m of [MARKERS.criminalCategory, MARKERS.rawPayload]) {
    if (text.includes(m)) leaks.push(`marker "${m}"`);
  }
  return leaks;
}

/** A fake req/res pair like the other pg tests use. */
export function makeRes() {
  const r = { code: null, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; return r; };
  return r;
}

export async function call(handler, { method = "GET", query = {}, body, token, headers = {} } = {}) {
  const res = makeRes();
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  await handler({ method, query, body, headers: h }, res);
  return res;
}

/** Create a company + buildings + rules + listings + people for one org. */
async function seedOrg(db, orgId, tag) {
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const one = async (sql, params) => (await q(sql, params))[0];

  const company = (await one(
    `INSERT INTO yd_companies (org_id, name, tier, hq_state, software, status)
     VALUES ($1,$2,2,'AZ','yardi','signed') RETURNING id`, [orgId, `Test Co ${tag}`])).id;

  const mkBuilding = async (name, { status = "signed", sample = false, city = "Phoenix", secondChance = false } = {}) => (await one(
    `INSERT INTO yd_buildings (org_id, company_id, name, address, city, state, zip, status, is_sample,
                               second_chance, app_fee_cents, leasing_email, refund_days)
     VALUES ($1,$2,$3,'1 Test Way',$4,'AZ','85004',$5,$6,$7,5000,$8,60) RETURNING id`,
    [orgId, company, name, city, status, sample, secondChance, `leasing+${tag}@example.test`])).id;

  const bSigned = await mkBuilding(`Alder Test Lofts ${tag}`, { city: "Phoenix" });
  const bOther = await mkBuilding(`Other Test Court ${tag}`, { city: "Tempe" });
  const bSample = await mkBuilding(`Sample Test Flats ${tag}`, { status: "target", sample: true, city: "Mesa", secondChance: true });
  const bUnsigned = await mkBuilding(`Unsigned Test Towers ${tag}`, { status: "target", city: "Chandler" });

  const mkRules = async (buildingId) => (await one(
    `INSERT INTO yd_building_rules (org_id, building_id, version, confirmed_at, min_score, income_multiple,
                                    max_evictions, eviction_lookback_years, criminal_policy, accepts_second_chance, source)
     VALUES ($1,$2,1,now(),600,3.0,1,5,'{"felony":7,"violent":"never"}',false,'staff') RETURNING id`,
    [orgId, buildingId])).id;
  const rSigned = await mkRules(bSigned);
  const rOther = await mkRules(bOther);
  await mkRules(bSample);
  await mkRules(bUnsigned);

  // Signed fee agreements for the two real buildings.
  const signAgreement = async (buildingId) => {
    const a = (await one(
      `INSERT INTO yd_agreements (org_id, party_kind, party_id, kind, status, terms)
       VALUES ($1,'building',$2,'building_fee','draft','{"fee_percent":100}') RETURNING id`, [orgId, buildingId])).id;
    await q(`UPDATE yd_agreements SET status='sent', sent_at=now() WHERE id=$1`, [a]);
    await q(`UPDATE yd_agreements SET status='signed', signed_at=now(), signer_name='Test Signer' WHERE id=$1`, [a]);
    return a;
  };
  await signAgreement(bSigned);
  await signAgreement(bOther);

  const mkListing = async (buildingId, unit, rentCents, { active = true, sample = false, beds = 1 } = {}) => (await one(
    `INSERT INTO yd_listings (org_id, building_id, unit_label, beds, baths, sqft, rent_cents, available_on, active, is_sample)
     VALUES ($1,$2,$3,$4,1.0,700,$5,current_date + 7,$6,$7) RETURNING id`,
    [orgId, buildingId, unit, beds, rentCents, active, sample])).id;
  const lPublic1 = await mkListing(bSigned, "101", 162500, { beds: 1 });
  const lPublic2 = await mkListing(bSigned, "205", 214000, { beds: 2 });
  const lOther = await mkListing(bOther, "7", 139500, { beds: 1 });
  const lInactive = await mkListing(bSigned, "999", 150000, { active: false });
  const lUnsigned = await mkListing(bUnsigned, "5", 120000);
  const lSample = await mkListing(bSample, "S1", 131000, { sample: true, beds: 0 });

  // Brokers and the renters they sent.
  const broker = (await one(
    `INSERT INTO yd_brokers (org_id, name, company, email, plan, status, licence_state)
     VALUES ($1,'Ben Broker','Locator Co',$2,'split','active','AZ') RETURNING id, tracking_code`,
    [orgId, `ben+${tag}@example.test`]));
  const renter1 = (await one(
    `INSERT INTO yd_renters (org_id, email, first_name, last_name, phone, source_kind, source_broker_id,
                             stage, lane, risk_tier, approved_max_rent_cents, income_verified)
     VALUES ($1,$2,'Rita',$4,'555-0101','broker',$3,'placed','verified','B',216666,true) RETURNING id`,
    [orgId, `rita+${tag}@example.test`, broker.id, `Tester-${tag}`])).id;
  const renter2 = (await one(
    `INSERT INTO yd_renters (org_id, email, first_name, last_name, source_kind, stage, lane, risk_tier, income_verified)
     VALUES ($1,$2,'Omar','Organic','organic','booked','second_chance','C',false) RETURNING id`,
    [orgId, `omar+${tag}@example.test`])).id;

  // Accounts: one of each kind.
  const acctRenter = (await one(
    `INSERT INTO yd_accounts (org_id, kind, email, renter_id) VALUES ($1,'renter',$2,$3) RETURNING id`,
    [orgId, `rita+${tag}@example.test`, renter1])).id;
  const acctBroker = (await one(
    `INSERT INTO yd_accounts (org_id, kind, email, broker_id) VALUES ($1,'broker',$2,$3) RETURNING id`,
    [orgId, `ben+${tag}@example.test`, broker.id])).id;
  const acctBuilding = (await one(
    `INSERT INTO yd_accounts (org_id, kind, email) VALUES ($1,'building_user',$2) RETURNING id`,
    [orgId, `leasing+${tag}@example.test`])).id;
  await q(`INSERT INTO yd_account_buildings (org_id, account_id, building_id, role) VALUES ($1,$2,$3,'leasing')`,
    [orgId, acctBuilding, bSigned]);

  // Consent + a finished screening with credit numbers and the raw payload.
  const consent = (await one(
    `INSERT INTO yd_consents (org_id, renter_id, kind, consent_text, consent_version, method)
     VALUES ($1,$2,'screening','I agree to a soft credit and background check, now and for repeat checks.','v1','checkbox')
     RETURNING id`, [orgId, renter1])).id;
  const screening = (await one(
    `INSERT INTO yd_screenings (org_id, renter_id, consent_id, kind, provider, status, credit_score,
                                collections_count, eviction_count, eviction_last_at, criminal_flags, raw_ref, result_at)
     VALUES ($1,$2,$3,'initial','crs_sandbox','complete',$4,$5,$6,'2023-01-15',$7::jsonb,'sandbox:rita',now()) RETURNING id`,
    [orgId, renter1, consent, MARKERS.creditScore, MARKERS.collections, MARKERS.evictions,
     JSON.stringify([{ category: MARKERS.criminalCategory, years_ago: 4 }])])).id;
  await q(`INSERT INTO yd_screening_raw (org_id, screening_id, payload) VALUES ($1,$2,$3::jsonb)`,
    [orgId, screening, JSON.stringify({ marker: MARKERS.rawPayload, bureau: "sandbox" })]);
  const income = (await one(
    `INSERT INTO yd_income_checks (org_id, renter_id, method, status, monthly_income_cents, sources, checked_at)
     VALUES ($1,$2,'plaid','verified',650000,'{"deposits":"biweekly"}', now()) RETURNING id`, [orgId, renter1])).id;

  const match = (await one(
    `INSERT INTO yd_matches (org_id, renter_id, building_id, listing_id, screening_id, income_check_id, rules_id,
                             result, reasons, max_rent_cents, is_backup)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'approved','[{"rule":"score","outcome":"pass"}]',216666,false) RETURNING id`,
    [orgId, renter1, bSigned, lPublic1, screening, income, rSigned])).id;

  // The placement: walk every arrow of the state machine, as a real one would.
  const outbox = (await one(
    `INSERT INTO yd_outbox (org_id, channel, to_address, template_key, context, related_kind)
     VALUES ($1,'email',$2,'yd-registration','{}','application') RETURNING id`,
    [orgId, `leasing+${tag}@example.test`])).id;
  const app1 = (await one(
    `INSERT INTO yd_applications (org_id, renter_id, building_id, listing_id, match_id, broker_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [orgId, renter1, bSigned, lPublic1, match, broker.id])).id;
  const tour = (await one(
    `INSERT INTO yd_tours (org_id, application_id, starts_at, ends_at, status)
     VALUES ($1,$2,now() + interval '3 days', now() + interval '3 days 30 minutes','booked') RETURNING id`,
    [orgId, app1])).id;
  await q(`UPDATE yd_applications SET stage='registered', registration_sent_at=now(), registration_outbox_id=$2 WHERE id=$1`, [app1, outbox]);
  await q(`UPDATE yd_applications SET stage='toured' WHERE id=$1`, [app1]);
  await q(`UPDATE yd_applications SET stage='applied' WHERE id=$1`, [app1]);
  await q(`UPDATE yd_applications SET stage='approved' WHERE id=$1`, [app1]);
  await q(`UPDATE yd_applications SET stage='lease_signed', lease_start=current_date + 10, lease_end=current_date + 10 + 364, rent_cents=162500 WHERE id=$1`, [app1]);
  await q(`UPDATE yd_applications SET stage='moved_in' WHERE id=$1`, [app1]);

  const fee = (await one(
    `INSERT INTO yd_fee_ledger (org_id, application_id, building_id, kind, amount_cents, idempotency_key, earned_at)
     VALUES ($1,$2,$3,'placement_fee',162500,$4, now() - interval '66 days') RETURNING id`, [orgId, app1, bSigned, `fee:${app1}`])).id;
  const invoice = (await one(
    `INSERT INTO yd_invoices (org_id, building_id, total_cents, issued_at)
     VALUES ($1,$2,162500, now() - interval '65 days') RETURNING id, number`,
    [orgId, bSigned]));
  await q(`UPDATE yd_fee_ledger SET status='invoiced', invoice_id=$2, invoiced_at = now() - interval '65 days' WHERE id=$1`, [fee, invoice.id]);
  await q(`UPDATE yd_applications SET stage='invoiced' WHERE id=$1`, [app1]);
  await q(`UPDATE yd_invoices SET status='paid', paid_at=now() - interval '61 days', payment_method='ach', payment_ref='ACH-TEST-1' WHERE id=$1`, [invoice.id]);
  await q(`UPDATE yd_fee_ledger SET status='paid', paid_at=now() - interval '61 days' WHERE id=$1`, [fee]);
  await q(`UPDATE yd_applications SET stage='paid' WHERE id=$1`, [app1]);
  const brokerRow = (await one(
    `INSERT INTO yd_broker_ledger (org_id, broker_id, fee_ledger_id, amount_cents, status, hold_until)
     VALUES ($1,$2,$3,40625,'earned',NULL) RETURNING id`, [orgId, broker.id, fee])).id;
  await q(`UPDATE yd_broker_ledger SET status='held', hold_until = now() - interval '1 day' WHERE id=$1`, [brokerRow]);

  // Renter 2: an open application at the other signed building, still at booked.
  const app2 = (await one(
    `INSERT INTO yd_applications (org_id, renter_id, building_id, listing_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    [orgId, renter2, bOther, lOther])).id;

  const dispute = (await one(
    `INSERT INTO yd_disputes (org_id, kind, subject, opened_by_kind) VALUES ($1,'attribution',$2::jsonb,'broker') RETURNING id`,
    [orgId, JSON.stringify({ application_id: app2 })])).id;

  return {
    company, bSigned, bOther, bSample, bUnsigned, rSigned, rOther,
    lPublic1, lPublic2, lOther, lInactive, lUnsigned, lSample,
    broker: broker.id, brokerCode: broker.tracking_code, renter1, renter2,
    acctRenter, acctBroker, acctBuilding, consent, screening, income, match,
    outbox, app1, app2, tour, fee, invoice: invoice.id, invoiceNumber: invoice.number, brokerRow, dispute
  };
}

/** Build both orgs, staff of every role, and a live session for every principal. */
export async function buildYdFixture(db) {
  const rand = crypto.randomBytes(4).toString("hex");
  const slugA = `yesdoor-test-${rand}-a`;
  const slugB = `yesdoor-test-${rand}-b`;
  const mkOrg = async (slug, name) => (await db.query(
    `INSERT INTO orgs (slug, name) VALUES ($1,$2) RETURNING id`, [slug, name])).rows[0].id;
  const orgA = await mkOrg(slugA, `Yesdoor Test A ${rand}`);
  const orgB = await mkOrg(slugB, `Yesdoor Test B ${rand}`);

  const mkStaff = async (org, role, tag) => (await db.query(
    `INSERT INTO staff (org_id, name, role, email, status) VALUES ($1,$2,$3,$4,'active') RETURNING id`,
    [org, `YD ${role} ${tag}`, role, `yd_${role}_${tag}_${rand}@example.test`])).rows[0].id;

  const staffIds = {
    ownerA: await mkStaff(orgA, "owner", "a"),
    opsA: await mkStaff(orgA, "ops", "a"),
    salesA: await mkStaff(orgA, "sales", "a"),
    collectionsA: await mkStaff(orgA, "collections", "a"),
    closerA: await mkStaff(orgA, "closer", "a"),       // a Fundhub-style role: must be refused
    opsB: await mkStaff(orgB, "ops", "b")
  };
  const staffToken = async (id, org) => (await createSession(db, { staffId: id, orgId: org })).token;
  const tokens = {
    ownerA: await staffToken(staffIds.ownerA, orgA),
    opsA: await staffToken(staffIds.opsA, orgA),
    salesA: await staffToken(staffIds.salesA, orgA),
    collectionsA: await staffToken(staffIds.collectionsA, orgA),
    closerA: await staffToken(staffIds.closerA, orgA),
    opsB: await staffToken(staffIds.opsB, orgB)
  };

  const A = await seedOrg(db, orgA, `a${rand}`);
  const B = await seedOrg(db, orgB, `b${rand}`);

  const acct = async (accountId, org) => (await createAccountSession(db, { accountId, orgId: org })).token;
  Object.assign(tokens, {
    renterA: await acct(A.acctRenter, orgA),
    buildingA: await acct(A.acctBuilding, orgA),
    brokerA: await acct(A.acctBroker, orgA),
    renterB: await acct(B.acctRenter, orgB),
    buildingB: await acct(B.acctBuilding, orgB),
    brokerB: await acct(B.acctBroker, orgB)
  });

  return { rand, slugA, slugB, orgA, orgB, staffIds, tokens, A, B };
}
