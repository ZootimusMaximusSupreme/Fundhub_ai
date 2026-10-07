// Test support for the B4 write tests (src/http/yesdoor-{supply,building-writes,booking,
// placements,money}.pg.test.mjs). Nothing in api/ or src/ imports this outside a test.
//
// It builds on the shared fixture (./fixture.mjs): extra renters with their own
// consent, screening, income and matches, extra signed buildings, and applications
// walked to any stage. Every row goes in the org of the fixture side asked for
// ("A" or "B"). Yesdoor never deletes, so nothing is cleaned up: each test file's
// fixture is a pair of fresh orgs.

import crypto from "node:crypto";
import { createAccountSession } from "../auth/session.mjs";
import { _resetYdOrgCache } from "../store/org.mjs";
import { call } from "./fixture.mjs";

export const LINK_SECRET = "yd-test-link-secret-0123456789abcdef-0123456789";

/** Point the public doors and the signing links at this fixture's org A. */
export function useFixtureEnv(fx) {
  process.env.YD_ORG_SLUG = fx.slugA;
  process.env.YD_LINK_SECRET = LINK_SECRET;
  _resetYdOrgCache();
}

const sideOf = (fx, side) => (side === "B" ? { orgId: fx.orgB, ids: fx.B } : { orgId: fx.orgA, ids: fx.A });
const rand = () => crypto.randomBytes(3).toString("hex");

/** A signed building (its own signed fee agreement, rules v1 confirmed now, one listing). */
export async function mkSignedBuilding(db, fx, {
  side = "A", name, city = "Phoenix", state = "AZ", rentCents = 150000, beds = 1,
  appFeeCents = 5000, appFeeWaived = false, feeKind = "percent_first_month", feePercent = 100, feeFlatCents = null,
  refundDays = 60, leasingEmail, tourHours = {}, rules = {}
} = {}) {
  const { orgId, ids } = sideOf(fx, side);
  const tag = rand();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const b = (await q(
    `INSERT INTO yd_buildings (org_id, company_id, name, address, city, state, zip, status, app_fee_cents, app_fee_waived,
                               leasing_email, tour_hours, fee_kind, fee_percent, fee_flat_cents, refund_days)
     VALUES ($1,$2,$3,'9 Test Way',$4,$5,'85004','signed',$6,$7,$8,$9::jsonb,$10,$11,$12,$13) RETURNING id`,
    [orgId, ids.company, name || `B4 Test Court ${tag}`, city, state, appFeeCents, appFeeWaived,
     leasingEmail === undefined ? `leasing+${tag}@example.test` : leasingEmail, JSON.stringify(tourHours),
     feeKind, feeKind === "flat" ? null : feePercent, feeKind === "flat" ? feeFlatCents : null, refundDays]))[0].id;
  const r = { minScore: 600, incomeMultiple: 3, maxEvictions: 1, lookback: 5, policy: { felony: 7, violent: "never" }, ...rules };
  const rulesId = (await q(
    `INSERT INTO yd_building_rules (org_id, building_id, version, confirmed_at, min_score, income_multiple, max_evictions,
                                    eviction_lookback_years, criminal_policy, accepts_second_chance, source)
     VALUES ($1,$2,1,now(),$3,$4,$5,$6,$7::jsonb,false,'staff') RETURNING id`,
    [orgId, b, r.minScore, r.incomeMultiple, r.maxEvictions, r.lookback, JSON.stringify(r.policy)]))[0].id;
  const agreement = (await q(
    `INSERT INTO yd_agreements (org_id, party_kind, party_id, kind, status, terms)
     VALUES ($1,'building',$2,'building_fee','draft','{}') RETURNING id`, [orgId, b]))[0].id;
  await q(`UPDATE yd_agreements SET status='sent', sent_at=now() WHERE id=$1`, [agreement]);
  await q(`UPDATE yd_agreements SET status='signed', signed_at=now(), signer_name='Test Signer' WHERE id=$1`, [agreement]);
  const listingId = (await q(
    `INSERT INTO yd_listings (org_id, building_id, unit_label, beds, baths, sqft, rent_cents, available_on, active)
     VALUES ($1,$2,'1A',$3,1.0,700,$4,current_date + 7,true) RETURNING id`, [orgId, b, beds, rentCents]))[0].id;
  // A user to log in to this building's portal.
  const email = `leasing+${tag}@example.test`;
  const accountId = (await q(
    `INSERT INTO yd_accounts (org_id, kind, email) VALUES ($1,'building_user',$2) RETURNING id`, [orgId, email]))[0].id;
  await q(`INSERT INTO yd_account_buildings (org_id, account_id, building_id, role) VALUES ($1,$2,$3,'leasing')`, [orgId, accountId, b]);
  const token = (await createAccountSession(db, { accountId, orgId })).token;
  return { buildingId: b, rulesId, listingId, agreementId: agreement, accountId, token, orgId };
}

/** A renter with a consent, a finished screening, a verified income check, and a login. */
export async function mkRenter(db, fx, {
  side = "A", brokerId = null, stage = "matched", firstName = "Test", score = 700, income = 650000
} = {}) {
  const { orgId } = sideOf(fx, side);
  const tag = rand();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const email = `b4-${tag}@example.test`;
  const renterId = (await q(
    `INSERT INTO yd_renters (org_id, email, first_name, last_name, phone, source_kind, source_broker_id, stage, lane,
                             risk_tier, approved_max_rent_cents, income_verified)
     VALUES ($1,$2,$3,$4,'555-0199',$5,$6,$7,'verified','B',$8,true) RETURNING id`,
    [orgId, email, firstName, `Renter-${tag}`, brokerId ? "broker" : "organic", brokerId, stage, Math.floor(income / 3)]))[0].id;
  const consentId = (await q(
    `INSERT INTO yd_consents (org_id, renter_id, kind, consent_text, consent_version, method)
     VALUES ($1,$2,'screening','I agree to a soft credit and background check, now and for repeat checks.','v1','checkbox')
     RETURNING id`, [orgId, renterId]))[0].id;
  const screeningId = (await q(
    `INSERT INTO yd_screenings (org_id, renter_id, consent_id, kind, provider, status, credit_score, collections_count,
                                eviction_count, criminal_flags, raw_ref, result_at)
     VALUES ($1,$2,$3,'initial','crs_sandbox','complete',$4,0,0,'[]','sandbox:b4',now()) RETURNING id`,
    [orgId, renterId, consentId, score]))[0].id;
  const incomeId = (await q(
    `INSERT INTO yd_income_checks (org_id, renter_id, method, status, monthly_income_cents, sources, checked_at)
     VALUES ($1,$2,'plaid','verified',$3,'{}', now()) RETURNING id`, [orgId, renterId, income]))[0].id;
  const accountId = (await q(
    `INSERT INTO yd_accounts (org_id, kind, email, renter_id) VALUES ($1,'renter',$2,$3) RETURNING id`,
    [orgId, email, renterId]))[0].id;
  const token = (await createAccountSession(db, { accountId, orgId })).token;
  return { renterId, accountId, token, email, screeningId, incomeId, orgId, firstName };
}

/** The matcher's answer for a renter at a building (the row a booking looks for). */
export async function mkMatch(db, renter, { buildingId, listingId = null, result = "approved", maxRentCents = 216666 }) {
  const rulesId = (await db.query(
    `SELECT id FROM yd_building_rules WHERE building_id = $1 ORDER BY version DESC LIMIT 1`, [buildingId])).rows[0].id;
  return (await db.query(
    `INSERT INTO yd_matches (org_id, renter_id, building_id, listing_id, screening_id, income_check_id, rules_id,
                             result, reasons, max_rent_cents, is_backup)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[{"rule":"score","outcome":"pass"}]',$9,false) RETURNING id`,
    [renter.orgId, renter.renterId, buildingId, listingId, renter.screeningId, renter.incomeId, rulesId, result, maxRentCents])).rows[0].id;
}

/** A tour time `days` from now at `hour` UTC (a weekday-agnostic default far enough from now). */
export function tourAt(days = 3, hour = 17, minute = 0) {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Book through the real endpoint. */
export async function bookVia(handler, renter, { buildingId, listingId, startsAt = tourAt(), via = "body" }) {
  const body = { buildingId, listingId, startsAt };
  if (via === "body") body.renterToken = renter.token;
  return call(handler, { method: "POST", body, token: via === "header" ? renter.token : undefined });
}

/** Walk a booked application along the arrows with SQL (for setups the endpoints cannot backdate). */
export async function walkApplication(db, applicationId, to, { leaseRentCents = 150000, registeredAgoDays = 0 } = {}) {
  const order = ["registered", "toured", "applied", "approved", "lease_signed", "moved_in"];
  const q = (sql, params) => db.query(sql, params);
  for (const stage of order) {
    if (stage === "registered") {
      const orgId = (await q(`SELECT org_id, building_id FROM yd_applications WHERE id = $1`, [applicationId])).rows[0];
      const outbox = (await q(
        `INSERT INTO yd_outbox (org_id, channel, to_address, template_key, context, related_kind)
         VALUES ($1,'email','leasing@example.test','yd-registration','{}','application') RETURNING id`, [orgId.org_id])).rows[0].id;
      await q(
        `UPDATE yd_applications SET stage='registered', registration_sent_at = now() - ($3::int * interval '1 day'),
                registration_outbox_id = $2 WHERE id = $1`, [applicationId, outbox, registeredAgoDays]);
    } else if (stage === "lease_signed") {
      await q(
        `UPDATE yd_applications SET stage='lease_signed', lease_start=current_date + 10, lease_end=current_date + 10 + 364,
                rent_cents=$2 WHERE id = $1`, [applicationId, leaseRentCents]);
    } else {
      await q(`UPDATE yd_applications SET stage=$2 WHERE id=$1`, [applicationId, stage]);
    }
    if (stage === to) return;
  }
}

/** Insert a booked application (no registration yet) with SQL. */
export async function mkApplication(db, renter, { buildingId, listingId, matchId = null, brokerId = null }) {
  return (await db.query(
    `INSERT INTO yd_applications (org_id, renter_id, building_id, listing_id, match_id, broker_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [renter.orgId, renter.renterId, buildingId, listingId, matchId, brokerId])).rows[0].id;
}

/** One-shot: a renter, a match at the building, a booked application walked to `to`. */
export async function mkPlacement(db, fx, building, { to = "registered", brokerId = null, side = "A", leaseRentCents, registeredAgoDays = 0, matchResult = "approved" } = {}) {
  const renter = await mkRenter(db, fx, { side, brokerId });
  const matchId = await mkMatch(db, renter, { buildingId: building.buildingId, listingId: building.listingId, result: matchResult });
  const applicationId = await mkApplication(db, renter, { buildingId: building.buildingId, listingId: building.listingId, matchId, brokerId });
  await walkApplication(db, applicationId, to, { leaseRentCents: leaseRentCents ?? undefined, registeredAgoDays });
  return { ...renter, applicationId, matchId };
}

export const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0] || null;
export const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows;
