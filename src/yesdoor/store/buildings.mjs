// The building portal's reads (spec §8: GET building/renters, building/rules,
// building/invoices).
//
// A building user sees THEIR renters (applications at buildings they are linked to
// in yd_account_buildings) as: approved / likely / no, income verified, risk tier,
// max rent. NEVER the raw report, and no credit field of any kind (owner-set,
// spec §16). The response shapes below are built field by field from an explicit
// SELECT list on purpose: there is no `SELECT *` and no spreading of a row, so a
// new credit column can never ride along by accident. The endpoint tests assert
// the absence of the credit keys on every response.

import { YD_DEFAULTS } from "../config.mjs";
import { YdError, cents } from "../http.mjs";

/** The building ids this principal may see, narrowed to ?buildingId= when given. */
export function scopeBuildings(principal, buildingId = null) {
  const own = principal.buildingIds || [];
  if (!buildingId) return own;
  if (!own.includes(buildingId)) throw new YdError(403, "forbidden", "that building is not on your account");
  return [buildingId];
}

export async function listBuildingsFor(db, { orgId, buildingIds }) {
  if (!buildingIds.length) return [];
  const r = await db.query(
    `SELECT id, name, address, city, state, zip, status, is_sample
       FROM yd_buildings WHERE org_id = $1 AND id = ANY($2) ORDER BY name, id`, [orgId, buildingIds]);
  return r.rows.map((b) => ({
    id: b.id, name: b.name, address: b.address, city: b.city, state: b.state, zip: b.zip,
    status: b.status, isSample: b.is_sample
  }));
}

export async function listBuildingRenters(db, { orgId, buildingIds, limit }) {
  if (!buildingIds.length) return [];
  const r = await db.query(
    `SELECT a.id AS application_id, a.building_id, b.name AS building_name, a.stage,
            a.registration_sent_at, a.denial_reason,
            to_char(a.lease_start, 'YYYY-MM-DD') AS lease_start,
            to_char(a.lease_end, 'YYYY-MM-DD') AS lease_end,
            a.rent_cents AS lease_rent_cents,
            r.first_name, r.last_name, r.email, r.phone,
            r.income_verified, r.risk_tier,
            COALESCE(m.max_rent_cents, r.approved_max_rent_cents) AS max_rent_cents,
            m.result AS match_result,
            l.unit_label, l.rent_cents AS listing_rent_cents,
            t.starts_at AS tour_starts_at, t.status AS tour_status
       FROM yd_applications a
       JOIN yd_buildings b ON b.id = a.building_id AND b.org_id = a.org_id
       JOIN yd_renters r ON r.id = a.renter_id AND r.org_id = a.org_id
       LEFT JOIN yd_matches m ON m.id = a.match_id AND m.org_id = a.org_id
       LEFT JOIN yd_listings l ON l.id = a.listing_id
       LEFT JOIN LATERAL (
         SELECT starts_at, status FROM yd_tours
          WHERE application_id = a.id AND org_id = a.org_id
          ORDER BY created_at DESC, id DESC LIMIT 1
       ) t ON true
      WHERE a.org_id = $1 AND a.building_id = ANY($2)
      ORDER BY a.updated_at DESC, a.id DESC
      LIMIT $3`, [orgId, buildingIds, limit]);

  return r.rows.map((x) => ({
    applicationId: x.application_id,
    building: { id: x.building_id, name: x.building_name },
    stage: x.stage,
    renter: { firstName: x.first_name, lastName: x.last_name, email: x.email, phone: x.phone },
    result: x.match_result,                  // approved | likely | no
    incomeVerified: x.income_verified,
    riskTier: x.risk_tier,
    maxRentCents: cents(x.max_rent_cents),
    registeredAt: x.registration_sent_at,
    denialReason: x.denial_reason,
    unit: x.unit_label,
    listingRentCents: cents(x.listing_rent_cents),
    lease: x.lease_start ? { start: x.lease_start, end: x.lease_end, rentCents: cents(x.lease_rent_cents) } : null,
    tour: x.tour_starts_at ? { startsAt: x.tour_starts_at, status: x.tour_status } : null
  }));
}

/** Every rules version for the building, newest first. The latest says whether it
 *  has gone stale (not confirmed within rulesStaleDays): stale rules pause matches. */
export async function listBuildingRules(db, { orgId, buildingIds }) {
  if (!buildingIds.length) return [];
  const buildings = await listBuildingsFor(db, { orgId, buildingIds });
  const rows = (await db.query(
    `SELECT building_id, version, effective_at, confirmed_at,
            min_score, income_multiple::float8 AS income_multiple, max_evictions,
            eviction_lookback_years, criminal_policy, accepts_second_chance, notes, source,
            (confirmed_at IS NULL OR confirmed_at < now() - ($3::int * interval '1 day')) AS past_due
       FROM yd_building_rules
      WHERE org_id = $1 AND building_id = ANY($2)
      ORDER BY building_id, version DESC`,
    [orgId, buildingIds, YD_DEFAULTS.rulesStaleDays])).rows;

  const byBuilding = new Map();
  for (const r of rows) {
    if (!byBuilding.has(r.building_id)) byBuilding.set(r.building_id, []);
    byBuilding.get(r.building_id).push(r);
  }
  return buildings.map((b) => {
    const versions = byBuilding.get(b.id) || [];
    return {
      building: b,
      current: versions[0] ? versions[0].version : null,
      stale: versions[0] ? versions[0].past_due : null,   // null = no rules on file at all
      versions: versions.map((v) => ({
        version: v.version,
        effectiveAt: v.effective_at,
        confirmedAt: v.confirmed_at,
        minScore: v.min_score,
        incomeMultiple: v.income_multiple,
        maxEvictions: v.max_evictions,
        evictionLookbackYears: v.eviction_lookback_years,
        criminalPolicy: v.criminal_policy,
        acceptsSecondChance: v.accepts_second_chance,
        notes: v.notes,
        source: v.source
      }))
    };
  });
}

/** Invoices for the user's buildings. Every line carries the proof a leasing office
 *  expects from a locator (spec §5b): the registration timestamp, renter name, unit,
 *  move-in date and lease term. Lines are limited to the user's own buildings. */
export async function listBuildingInvoices(db, { orgId, buildingIds, limit }) {
  if (!buildingIds.length) return [];
  const lines = (await db.query(
    `SELECT f.id AS fee_id, f.invoice_id, f.application_id, f.building_id, f.kind, f.amount_cents, f.status,
            r.first_name, r.last_name, l.unit_label,
            a.registration_sent_at,
            to_char(a.moved_in_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS move_in_date,
            CASE WHEN a.lease_start IS NOT NULL AND a.lease_end IS NOT NULL THEN
              (extract(year FROM age(a.lease_end + 1, a.lease_start)) * 12
               + extract(month FROM age(a.lease_end + 1, a.lease_start)))::int
            END AS lease_term_months
       FROM yd_fee_ledger f
       JOIN yd_applications a ON a.id = f.application_id AND a.org_id = f.org_id
       JOIN yd_renters r ON r.id = a.renter_id AND r.org_id = a.org_id
       LEFT JOIN yd_listings l ON l.id = a.listing_id
      WHERE f.org_id = $1 AND f.building_id = ANY($2) AND f.invoice_id IS NOT NULL
      ORDER BY f.invoiced_at DESC NULLS LAST, f.id`, [orgId, buildingIds])).rows;
  const ids = [...new Set(lines.map((x) => x.invoice_id))];
  const invs = (await db.query(
    `SELECT id, number, total_cents, issued_at, due_at, status, paid_at, payment_method, building_id, company_id
       FROM yd_invoices
      WHERE org_id = $1 AND (id = ANY($2) OR building_id = ANY($3))
      ORDER BY issued_at DESC, id DESC LIMIT $4`, [orgId, ids, buildingIds, limit])).rows;

  return invs.map((i) => shapeInvoice(i, lines.filter((x) => x.invoice_id === i.id)));
}

function shapeInvoice(i, lines) {
  return {
    id: i.id,
    number: i.number,
    totalCents: cents(i.total_cents),
    issuedAt: i.issued_at,
    dueAt: i.due_at,
    status: i.status,
    paidAt: i.paid_at,
    paymentMethod: i.payment_method,
    buildingId: i.building_id,
    lines: lines.map((x) => ({
      feeId: x.fee_id,
      applicationId: x.application_id,
      kind: x.kind,
      amountCents: cents(x.amount_cents),
      status: x.status,
      renterName: [x.first_name, x.last_name].filter(Boolean).join(" ") || null,
      unit: x.unit_label,
      registeredAt: x.registration_sent_at,
      moveInDate: x.move_in_date,
      leaseTermMonths: x.lease_term_months
    }))
  };
}
