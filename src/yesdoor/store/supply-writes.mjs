// Staff writes that onboard supply (spec §8: POST staff/companies, POST staff/buildings).
//
// A company is the property manager; a building is one property with its fee terms,
// refund days, tour hours, leasing email, connection kind and flags. Both start as
// `target`/`pitched`. They become `agreement_sent` and `signed` ONLY through the
// agreement flow (./agreements.mjs), never by a status field in a request: nothing
// gets renters until the agreement is signed (the database refuses it anyway,
// yd_building_is_matchable). The one status change staff make by hand is
// setBuildingStatus, and it cannot resume a building that is not matchable.
//
// Every query filters org_id from the staff session. Unknown stays NULL: an
// application fee nobody told us is NULL, never 0.

import { YD_DEFAULTS } from "../config.mjs";
import { YdError, cents, isUuid } from "../http.mjs";
import { withTransaction } from "../tx.mjs";
import { actorOf, recordEvent, setActor } from "../events.mjs";
import { parseTourHours } from "../tour-hours.mjs";
import {
  reqString, optString, optBool, optInt, optNumber, optEnum, optEmail, optUuid, optStateCode,
  stateCode, emailOf
} from "../validate.mjs";

const SOFTWARE = ["yardi", "realpage", "entrata", "other", "none"];
const CONNECTIONS = ["manual", "csv", "feed", "entrata_api"];
const START_STATUSES = ["target", "pitched"];

/* ── fee terms: one parser for a building and for a company-wide agreement ── */

/**
 * Read fee terms out of a body. Returns the columns as the database holds them:
 *   { fee_kind, fee_percent, fee_flat_cents, refund_days, payment_terms_days }
 * With `defaults` true a missing field takes the platform default (a new building);
 * with false, only what was sent comes back (a company agreement must state them).
 */
export function readFeeTerms(body, { requireAll = false } = {}) {
  const kind = optEnum(body, "feeKind", ["percent_first_month", "flat"], "the fee type");
  const percent = optNumber(body, "feePercent", "the fee percent", { min: 0, max: 1000 });
  const flat = optInt(body, "feeFlatCents", "the flat fee", { min: 0, max: 100_000_000 });
  const refundDays = optInt(body, "refundDays", "the refund days", { min: 0, max: 365 });
  const termsDays = optInt(body, "paymentTermsDays", "the payment terms", { min: 0, max: 365 });

  const fee_kind = kind ?? "percent_first_month";
  const out = { fee_kind, fee_percent: null, fee_flat_cents: null };
  if (fee_kind === "percent_first_month") {
    if (percent === undefined || percent === null) {
      if (requireAll) throw new YdError(400, "feePercent_required", "Add the fee percent (100 means one full month's rent).");
      out.fee_percent = 100;
    } else out.fee_percent = percent;
    if (flat !== undefined && flat !== null) throw new YdError(400, "invalid_parameter", "A percent-of-first-month fee has no flat amount.");
  } else {
    if (flat === undefined || flat === null || flat <= 0) throw new YdError(400, "feeFlatCents_required", "Add the flat fee in cents.");
    out.fee_flat_cents = flat;
    if (percent !== undefined && percent !== null) throw new YdError(400, "invalid_parameter", "A flat fee has no percent.");
  }
  if (requireAll && (refundDays === undefined || refundDays === null)) throw new YdError(400, "refundDays_required", "Add the refund days.");
  if (requireAll && (termsDays === undefined || termsDays === null)) throw new YdError(400, "paymentTermsDays_required", "Add the payment terms in days.");
  out.refund_days = refundDays ?? YD_DEFAULTS.refundDays;
  out.payment_terms_days = termsDays ?? 30;
  return out;
}

/* ── shapes ───────────────────────────────────────────────────────────── */

const shapeCompany = (c) => ({
  id: c.id, name: c.name, tier: c.tier, hqState: c.hq_state, software: c.software,
  status: c.status, isSample: c.is_sample
});

const BUILDING_COLS = `id, company_id, name, address, city, state, zip, units_count, software, connection,
  leasing_email, tour_hours, app_fee_cents, app_fee_waived, second_chance, allows_renter_incentive,
  fee_kind, fee_percent::float8 AS fee_percent, fee_flat_cents, refund_days, payment_terms_days,
  status, mismatch_count, is_sample, public.yd_building_is_matchable(id) AS matchable`;

export const shapeBuildingRow = (b) => ({
  id: b.id, companyId: b.company_id, name: b.name, address: b.address, city: b.city, state: b.state, zip: b.zip,
  unitsCount: b.units_count, software: b.software, connection: b.connection, leasingEmail: b.leasing_email,
  tourHours: b.tour_hours,
  appFeeCents: cents(b.app_fee_cents), appFeeWaived: b.app_fee_waived,        // NULL = we do not know the fee
  secondChance: b.second_chance, allowsRenterIncentive: b.allows_renter_incentive,
  fee: { kind: b.fee_kind, percent: b.fee_percent, flatCents: cents(b.fee_flat_cents), refundDays: b.refund_days, paymentTermsDays: b.payment_terms_days },
  status: b.status, mismatchCount: b.mismatch_count, isSample: b.is_sample, matchable: b.matchable
});

export async function getBuildingRow(db, orgId, buildingId) {
  const r = await db.query(`SELECT ${BUILDING_COLS} FROM yd_buildings WHERE id = $1 AND org_id = $2`, [buildingId, orgId]);
  return r.rows[0] ? shapeBuildingRow(r.rows[0]) : null;
}

/* ── companies ────────────────────────────────────────────────────────── */

/** POST staff/companies. Returns { company, created }. A repeat of the same name is a 409. */
export async function createCompany(db, who, body) {
  const name = reqString(body, "name", "the company name");
  const tier = optInt(body, "tier", "the tier", { min: 1, max: 4 }) ?? 3;
  const hqState = optStateCode(body, "hqState", "the head-office state") ?? null;
  const software = optEnum(body, "software", SOFTWARE, "the property software") ?? "none";
  const status = optEnum(body, "status", START_STATUSES, "the status") ?? "target";

  return withTransaction(db, async (tx) => {
    await setActor(tx, actorOf(who));
    const dupe = await tx.query(
      `SELECT id FROM yd_companies WHERE org_id = $1 AND lower(name) = lower($2) LIMIT 1`, [who.orgId, name]);
    if (dupe.rows[0]) throw new YdError(409, "company_exists", "A company with that name is already on the list.");
    const r = await tx.query(
      `INSERT INTO yd_companies (org_id, name, tier, hq_state, software, status)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, tier, hq_state, software, status, is_sample`,
      [who.orgId, name, tier, hqState, software, status]);
    const company = shapeCompany(r.rows[0]);
    await recordEvent(tx, {
      orgId: who.orgId, name: "company.created", entityKind: "company", entityId: company.id,
      payload: { name, tier, software, status }, actor: actorOf(who)
    });
    return { company, created: true };
  });
}

/* ── buildings ────────────────────────────────────────────────────────── */

/** POST staff/buildings (create). Returns { building }. */
export async function createBuilding(db, who, body) {
  const name = reqString(body, "name", "the building name");
  const address = reqString(body, "address", "the street address");
  const city = reqString(body, "city", "the city", { max: 80 });
  const state = stateCode(body.state, "the state");
  const zip = optString(body, "zip", "the zip code", { max: 10 }) ?? null;
  const leasingEmail = emailOf(body.leasingEmail, "The leasing office email");
  const lat = optNumber(body, "lat", "the latitude", { min: -90, max: 90 }) ?? null;
  const lng = optNumber(body, "lng", "the longitude", { min: -180, max: 180 }) ?? null;
  const unitsCount = optInt(body, "unitsCount", "the number of units", { min: 1, max: 100000 }) ?? null;
  const companyId = optUuid(body, "companyId", "the company") ?? null;
  const connection = optEnum(body, "connection", CONNECTIONS, "the connection kind") ?? "manual";
  const status = optEnum(body, "status", START_STATUSES, "the status") ?? "target";
  const secondChance = optBool(body, "secondChance", "second chance") ?? false;
  const allowsRenterIncentive = optBool(body, "allowsRenterIncentive", "allows renter incentives") ?? false;
  const appFeeWaived = optBool(body, "appFeeWaived", "application fee waived") ?? false;
  // Absent or null stays NULL (unknown). 0 is a real "no application fee".
  const appFeeCents = optInt(body, "appFeeCents", "the application fee", { min: 0, max: 10_000_000 }) ?? null;
  const terms = readFeeTerms(body);

  let tourHours = {};
  if (Object.hasOwn(body, "tourHours") && body.tourHours !== null) {
    const parsed = parseTourHours(body.tourHours);
    if (!parsed.ok || typeof body.tourHours !== "object" || Array.isArray(body.tourHours)) {
      throw new YdError(400, "invalid_tour_hours", parsed.errors[0] || "Tour hours must be a list of days and times.");
    }
    tourHours = body.tourHours;
  }

  return withTransaction(db, async (tx) => {
    await setActor(tx, actorOf(who));
    let software = optEnum(body, "software", SOFTWARE, "the property software");
    if (companyId) {
      const c = await tx.query(`SELECT software FROM yd_companies WHERE id = $1 AND org_id = $2`, [companyId, who.orgId]);
      if (!c.rows[0]) throw new YdError(404, "company_not_found", "We could not find that company.");
      if (!software) software = c.rows[0].software;
    }
    software = software || "none";

    const dupe = await tx.query(
      `SELECT id FROM yd_buildings WHERE org_id = $1 AND lower(name) = lower($2) AND lower(address) = lower($3) LIMIT 1`,
      [who.orgId, name, address]);
    if (dupe.rows[0]) throw new YdError(409, "building_exists", "That building is already on the list.");

    const r = await tx.query(
      `INSERT INTO yd_buildings
         (org_id, company_id, name, address, city, state, zip, lat, lng, units_count, software, connection,
          leasing_email, tour_hours, app_fee_cents, app_fee_waived, second_chance, allows_renter_incentive,
          fee_kind, fee_percent, fee_flat_cents, refund_days, payment_terms_days, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING ${BUILDING_COLS}`,
      [who.orgId, companyId, name, address, city, state, zip, lat, lng, unitsCount, software, connection,
       leasingEmail, JSON.stringify(tourHours), appFeeCents, appFeeWaived, secondChance, allowsRenterIncentive,
       terms.fee_kind, terms.fee_percent, terms.fee_flat_cents, terms.refund_days, terms.payment_terms_days, status]);
    const building = shapeBuildingRow(r.rows[0]);
    await recordEvent(tx, {
      orgId: who.orgId, name: "building.created", entityKind: "building", entityId: building.id,
      payload: { name, city, state, company_id: companyId, connection, fee_kind: terms.fee_kind, status },
      actor: actorOf(who)
    });
    return { building };
  });
}

/* ── status changes staff may make by hand ────────────────────────────── */

const MANUAL_MOVES = {
  target: ["pitched", "churned"],
  pitched: ["target", "churned"],
  agreement_sent: ["pitched", "churned"],
  signed: ["live", "paused", "churned"],
  live: ["paused", "churned"],
  paused: ["live", "signed", "churned"],
  churned: []
};

/** POST staff/buildings {buildingId, status}. `signed` and `agreement_sent` come only
 *  from the agreement flow; `live`/`signed` (resuming) need a signed agreement. */
export async function setBuildingStatus(db, who, body) {
  const buildingId = body.buildingId;
  if (!isUuid(buildingId)) throw new YdError(400, "invalid_parameter", "buildingId is not a valid id.");
  const status = optEnum(body, "status", Object.keys(MANUAL_MOVES), "the status");
  if (!status) throw new YdError(400, "status_required", "Choose a status.");
  const reason = optString(body, "reason", "the reason", { max: 500 }) ?? null;

  return withTransaction(db, async (tx) => {
    await setActor(tx, actorOf(who));
    // "Has a signed fee agreement" is asked directly: yd_building_is_matchable also needs the
    // status to be signed/live, which a paused building (the one being resumed) is not.
    const cur = (await tx.query(
      `SELECT b.id, b.status,
              EXISTS (SELECT 1 FROM yd_agreements a
                       WHERE a.org_id = b.org_id AND a.kind = 'building_fee' AND a.status = 'signed'
                         AND ((a.party_kind = 'building' AND a.party_id = b.id)
                           OR (a.party_kind = 'company' AND b.company_id IS NOT NULL AND a.party_id = b.company_id))) AS matchable
         FROM yd_buildings b WHERE b.id = $1 AND b.org_id = $2 FOR UPDATE OF b`, [buildingId, who.orgId])).rows[0];
    if (!cur) throw new YdError(404, "not_found", "We could not find that building.");
    if (cur.status === status) return { building: await getBuildingRow(tx, who.orgId, buildingId), unchanged: true };
    if (!MANUAL_MOVES[cur.status].includes(status)) {
      throw new YdError(409, "bad_status_move", `A building cannot go from "${cur.status}" to "${status}" by hand.`);
    }
    if ((status === "live" || status === "signed") && !cur.matchable) {
      throw new YdError(409, "no_signed_agreement", "This building has no signed fee agreement, so it cannot take renters.");
    }
    await tx.query(`UPDATE yd_buildings SET status = $2 WHERE id = $1 AND org_id = $3`, [buildingId, status, who.orgId]);
    await recordEvent(tx, {
      orgId: who.orgId, name: "building.status_changed", entityKind: "building", entityId: buildingId,
      payload: { from: cur.status, to: status, reason }, actor: actorOf(who)
    });
    return { building: await getBuildingRow(tx, who.orgId, buildingId), unchanged: false };
  });
}
