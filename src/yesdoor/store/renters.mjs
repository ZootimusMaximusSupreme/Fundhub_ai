// What a renter sees about themselves (spec §8: GET me).
//
// Own status, matches, tours and results. A renter sees the RESULT per building
// (approved / likely / no), the date of the rules it used, and their own stage.
// Never the building's rule numbers and never the raw credit fields: the credit
// details are for owner/ops on the staff endpoints.

import { cents } from "../http.mjs";

export async function getRenterMe(db, { orgId, renterId }) {
  const renterRow = (await db.query(
    `SELECT id, email, first_name, last_name, phone, stage, lane, risk_tier,
            approved_max_rent_cents, income_verified, first_touch_at
       FROM yd_renters WHERE id = $1 AND org_id = $2`, [renterId, orgId])).rows[0];
  if (!renterRow) return null;

  // Where the pre-screen stands, with no credit numbers.
  const screening = (await db.query(
    `SELECT kind, status, result_at, created_at
       FROM yd_screenings WHERE renter_id = $1 AND org_id = $2
      ORDER BY created_at DESC, id DESC LIMIT 1`, [renterId, orgId])).rows[0] || null;

  const income = (await db.query(
    `SELECT method, status, checked_at
       FROM yd_income_checks WHERE renter_id = $1 AND org_id = $2
      ORDER BY created_at DESC, id DESC LIMIT 1`, [renterId, orgId])).rows[0] || null;

  // The newest result per building. "Every result shows the date of the rules it used."
  const matches = (await db.query(
    `SELECT DISTINCT ON (m.building_id)
            m.id, m.result, m.max_rent_cents, m.is_backup, m.computed_at,
            b.id AS building_id, b.name AS building_name, b.city, b.state, b.is_sample AS building_is_sample,
            l.id AS listing_id, l.unit_label, l.rent_cents, l.beds,
            r.version AS rules_version, r.confirmed_at AS rules_confirmed_at
       FROM yd_matches m
       JOIN yd_buildings b ON b.id = m.building_id AND b.org_id = m.org_id
       JOIN yd_building_rules r ON r.id = m.rules_id AND r.org_id = m.org_id
       LEFT JOIN yd_listings l ON l.id = m.listing_id
      WHERE m.renter_id = $1 AND m.org_id = $2
      ORDER BY m.building_id, m.computed_at DESC, m.id DESC`, [renterId, orgId])).rows;

  const applications = (await db.query(
    `SELECT a.id, a.stage, a.denial_reason, a.registration_sent_at,
            to_char(a.lease_start, 'YYYY-MM-DD') AS lease_start,
            to_char(a.lease_end, 'YYYY-MM-DD') AS lease_end,
            a.booked_at, a.created_at,
            b.id AS building_id, b.name AS building_name, b.address, b.city, b.state, b.tour_hours,
            l.id AS listing_id, l.unit_label, l.rent_cents, l.beds,
            t.id AS tour_id, t.starts_at AS tour_starts_at, t.ends_at AS tour_ends_at, t.status AS tour_status
       FROM yd_applications a
       JOIN yd_buildings b ON b.id = a.building_id AND b.org_id = a.org_id
       LEFT JOIN yd_listings l ON l.id = a.listing_id
       LEFT JOIN LATERAL (
         SELECT id, starts_at, ends_at, status FROM yd_tours
          WHERE application_id = a.id AND org_id = a.org_id
          ORDER BY created_at DESC, id DESC LIMIT 1
       ) t ON true
      WHERE a.renter_id = $1 AND a.org_id = $2
      ORDER BY a.created_at DESC, a.id DESC`, [renterId, orgId])).rows;

  return {
    renter: {
      id: renterRow.id,
      email: renterRow.email,
      firstName: renterRow.first_name,
      lastName: renterRow.last_name,
      phone: renterRow.phone,
      stage: renterRow.stage,
      lane: renterRow.lane,
      riskTier: renterRow.risk_tier,
      approvedMaxRentCents: cents(renterRow.approved_max_rent_cents),
      incomeVerified: renterRow.income_verified
    },
    screening: screening && { kind: screening.kind, status: screening.status, resultAt: screening.result_at },
    incomeCheck: income && { method: income.method, status: income.status, checkedAt: income.checked_at },
    matches: matches.map((m) => ({
      id: m.id,
      result: m.result,
      maxRentCents: cents(m.max_rent_cents),
      isBackup: m.is_backup,
      computedAt: m.computed_at,
      rulesVersion: m.rules_version,
      rulesConfirmedAt: m.rules_confirmed_at,
      building: { id: m.building_id, name: m.building_name, city: m.city, state: m.state, isSample: m.building_is_sample },
      listing: m.listing_id ? { id: m.listing_id, unit: m.unit_label, beds: m.beds, rentCents: cents(m.rent_cents) } : null
    })),
    applications: applications.map((a) => ({
      id: a.id,
      stage: a.stage,
      denialReason: a.denial_reason,
      registeredAt: a.registration_sent_at,
      leaseStart: a.lease_start,
      leaseEnd: a.lease_end,
      bookedAt: a.booked_at,
      // The building's street address and tour hours, so the renter's portal can show
      // where the tour is and offer reschedule times the booking door accepts (I1).
      building: { id: a.building_id, name: a.building_name, address: a.address, city: a.city, state: a.state, tourHours: a.tour_hours || {} },
      listing: a.listing_id ? { id: a.listing_id, unit: a.unit_label, beds: a.beds, rentCents: cents(a.rent_cents) } : null,
      tour: a.tour_id ? { id: a.tour_id, startsAt: a.tour_starts_at, endsAt: a.tour_ends_at, status: a.tour_status } : null
    }))
  };
}
