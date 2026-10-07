// Staff reads (spec §8: GET staff/*).
//
// Two tiers, matching spec §1 and §17.6:
//   * the desk views (pipeline, companies, buildings, ledger, disputes, scoreboard)
//     carry NO credit fields, so every staff role can open them;
//   * the credit views (renterTimeline, screeningDetail) carry the score, the
//     evictions, the criminal flags and the raw bureau payload, and the handlers
//     gate them to ops and the owner.
//
// Every query filters org_id = $1 from the staff session. Nothing here takes an
// org from the request.

import { YD_DEFAULTS } from "../config.mjs";
import { cents, num } from "../http.mjs";

export const RENTER_STAGES = ["lead", "screened", "matched", "booked", "placed", "lifetime", "inactive"];
export const APPLICATION_STAGES = [
  "booked", "registered", "toured", "no_show", "applied", "approved", "denied",
  "lease_signed", "moved_in", "invoiced", "paid", "safe", "refunded", "cancelled"
];

const fullName = (first, last) => [first, last].filter(Boolean).join(" ") || null;

const zeroFilled = (keys, rows) => {
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) out[r.stage] = num(r.n);
  return out;
};

/* ── pipeline ──────────────────────────────────────────────────────────── */

export async function getPipeline(db, { orgId, stage, limit }) {
  const renterCounts = (await db.query(
    `SELECT stage, count(*)::int AS n FROM yd_renters WHERE org_id = $1 GROUP BY stage`, [orgId])).rows;
  const appCounts = (await db.query(
    `SELECT stage, count(*)::int AS n FROM yd_applications WHERE org_id = $1 GROUP BY stage`, [orgId])).rows;

  const renters = (await db.query(
    `SELECT id, first_name, last_name, email, stage, lane, risk_tier, income_verified,
            source_kind, source_ad_id, source_broker_id, first_touch_at, is_sample
       FROM yd_renters
      WHERE org_id = $1 AND ($2::text IS NULL OR stage = $2)
      ORDER BY updated_at DESC, id DESC LIMIT $3`, [orgId, stage, limit])).rows;

  const applications = (await db.query(
    `SELECT a.id, a.stage, a.rent_cents, a.registration_sent_at, a.updated_at,
            r.first_name, r.last_name, r.lane, r.risk_tier, r.source_kind,
            b.name AS building_name, l.unit_label
       FROM yd_applications a
       JOIN yd_renters r ON r.id = a.renter_id AND r.org_id = a.org_id
       JOIN yd_buildings b ON b.id = a.building_id AND b.org_id = a.org_id
       LEFT JOIN yd_listings l ON l.id = a.listing_id
      WHERE a.org_id = $1 AND ($2::text IS NULL OR a.stage = $2)
      ORDER BY a.updated_at DESC, a.id DESC LIMIT $3`, [orgId, stage, limit])).rows;

  return {
    renterStages: zeroFilled(RENTER_STAGES, renterCounts),
    applicationStages: zeroFilled(APPLICATION_STAGES, appCounts),
    renters: renters.map((r) => ({
      id: r.id, name: fullName(r.first_name, r.last_name), email: r.email, stage: r.stage,
      lane: r.lane, riskTier: r.risk_tier, incomeVerified: r.income_verified,
      source: { kind: r.source_kind, adId: r.source_ad_id, brokerId: r.source_broker_id },
      firstTouchAt: r.first_touch_at, isSample: r.is_sample
    })),
    applications: applications.map((a) => ({
      id: a.id, stage: a.stage, renterName: fullName(a.first_name, a.last_name),
      // The renter's path, tier and source, so the desk row says who this is (I1).
      lane: a.lane, riskTier: a.risk_tier, source: a.source_kind,
      buildingName: a.building_name, unit: a.unit_label,
      rentCents: cents(a.rent_cents), registeredAt: a.registration_sent_at, updatedAt: a.updated_at
    }))
  };
}

/* ── supply ────────────────────────────────────────────────────────────── */

export async function listCompanies(db, { orgId, limit }) {
  const r = await db.query(
    `SELECT c.id, c.name, c.tier, c.hq_state, c.software, c.status, c.is_sample,
            (SELECT count(*)::int FROM yd_buildings b WHERE b.company_id = c.id AND b.org_id = c.org_id) AS buildings,
            (SELECT count(*)::int FROM yd_buildings b WHERE b.company_id = c.id AND b.org_id = c.org_id
                AND b.status IN ('signed', 'live')) AS signed_buildings
       FROM yd_companies c WHERE c.org_id = $1
      ORDER BY c.tier, c.name, c.id LIMIT $2`, [orgId, limit]);
  return r.rows.map((c) => ({
    id: c.id, name: c.name, tier: c.tier, hqState: c.hq_state, software: c.software,
    status: c.status, isSample: c.is_sample,
    buildings: num(c.buildings), signedBuildings: num(c.signed_buildings)
  }));
}

export async function listBuildings(db, { orgId, status, companyId, limit }) {
  const r = await db.query(
    `SELECT b.id, b.name, b.address, b.city, b.state, b.zip, b.units_count, b.software, b.connection,
            b.leasing_email, b.app_fee_cents, b.app_fee_waived, b.second_chance, b.allows_renter_incentive,
            b.fee_kind, b.fee_percent::float8 AS fee_percent, b.fee_flat_cents, b.refund_days,
            b.payment_terms_days, b.status, b.mismatch_count, b.is_sample,
            c.id AS company_id, c.name AS company_name,
            ru.version AS rules_version, ru.confirmed_at AS rules_confirmed_at,
            (ru.id IS NOT NULL AND (ru.confirmed_at IS NULL OR ru.confirmed_at < now() - ($4::int * interval '1 day'))) AS rules_stale,
            public.yd_building_is_matchable(b.id) AS matchable,
            (SELECT count(*)::int FROM yd_listings l WHERE l.building_id = b.id AND l.org_id = b.org_id AND l.active) AS active_listings,
            (SELECT count(*)::int FROM yd_applications a WHERE a.building_id = b.id AND a.org_id = b.org_id
                AND a.stage IN ('booked', 'registered', 'toured', 'applied', 'approved', 'lease_signed')) AS open_applications
       FROM yd_buildings b
       LEFT JOIN yd_companies c ON c.id = b.company_id AND c.org_id = b.org_id
       LEFT JOIN LATERAL (
         SELECT id, version, confirmed_at FROM yd_building_rules
          WHERE building_id = b.id AND org_id = b.org_id ORDER BY version DESC LIMIT 1
       ) ru ON true
      WHERE b.org_id = $1
        AND ($2::text IS NULL OR b.status = $2)
        AND ($3::uuid IS NULL OR b.company_id = $3)
      ORDER BY b.city, b.name, b.id LIMIT $5`,
    [orgId, status, companyId, YD_DEFAULTS.rulesStaleDays, limit]);

  return r.rows.map((b) => ({
    id: b.id, name: b.name, address: b.address, city: b.city, state: b.state, zip: b.zip,
    unitsCount: b.units_count, software: b.software, connection: b.connection, leasingEmail: b.leasing_email,
    // NULL = unknown application fee. Never 0.
    appFeeCents: cents(b.app_fee_cents), appFeeWaived: b.app_fee_waived,
    secondChance: b.second_chance, allowsRenterIncentive: b.allows_renter_incentive,
    fee: { kind: b.fee_kind, percent: b.fee_percent, flatCents: cents(b.fee_flat_cents), refundDays: b.refund_days, paymentTermsDays: b.payment_terms_days },
    status: b.status, mismatchCount: b.mismatch_count, isSample: b.is_sample,
    company: b.company_id ? { id: b.company_id, name: b.company_name } : null,
    rules: b.rules_version === null ? null : { version: b.rules_version, confirmedAt: b.rules_confirmed_at, stale: b.rules_stale },
    matchable: b.matchable,
    activeListings: num(b.active_listings), openApplications: num(b.open_applications)
  }));
}

/* ── money ─────────────────────────────────────────────────────────────── */

export async function getLedger(db, { orgId, limit }) {
  const fees = (await db.query(
    `SELECT f.id, f.application_id, f.kind, f.amount_cents, f.status, f.reverses_id,
            f.earned_at, f.invoiced_at, f.paid_at, f.safe_at,
            i.id AS invoice_id, i.number AS invoice_number,
            b.id AS building_id, b.name AS building_name, r.first_name, r.last_name
       FROM yd_fee_ledger f
       JOIN yd_applications a ON a.id = f.application_id AND a.org_id = f.org_id
       JOIN yd_renters r ON r.id = a.renter_id AND r.org_id = a.org_id
       JOIN yd_buildings b ON b.id = f.building_id AND b.org_id = f.org_id
       LEFT JOIN yd_invoices i ON i.id = f.invoice_id AND i.org_id = f.org_id
      WHERE f.org_id = $1
      ORDER BY f.earned_at DESC, f.id DESC LIMIT $2`, [orgId, limit])).rows;

  const invoices = (await db.query(
    `SELECT i.id, i.number, i.total_cents, i.issued_at, i.due_at, i.status, i.paid_at, i.payment_method, i.payment_ref,
            b.name AS building_name, c.name AS company_name
       FROM yd_invoices i
       LEFT JOIN yd_buildings b ON b.id = i.building_id AND b.org_id = i.org_id
       LEFT JOIN yd_companies c ON c.id = i.company_id AND c.org_id = i.org_id
      WHERE i.org_id = $1
      ORDER BY i.issued_at DESC, i.id DESC LIMIT $2`, [orgId, limit])).rows;

  const brokerRows = (await db.query(
    `SELECT bl.id, bl.broker_id, bl.fee_ledger_id, bl.amount_cents, bl.status, bl.hold_until, bl.paid_at, bl.payout_ref,
            k.name AS broker_name
       FROM yd_broker_ledger bl
       JOIN yd_brokers k ON k.id = bl.broker_id AND k.org_id = bl.org_id
      WHERE bl.org_id = $1
      ORDER BY bl.created_at DESC, bl.id DESC LIMIT $2`, [orgId, limit])).rows;

  const feeTotals = (await db.query(
    `SELECT status, COALESCE(sum(amount_cents), 0)::bigint AS cents, count(*)::int AS n
       FROM yd_fee_ledger WHERE org_id = $1 GROUP BY status`, [orgId])).rows;
  const refunds = (await db.query(
    `SELECT status, COALESCE(sum(amount_cents), 0)::bigint AS cents, count(*)::int AS n
       FROM yd_renter_refunds WHERE org_id = $1 GROUP BY status`, [orgId])).rows;

  const group = (rows) => Object.fromEntries(rows.map((x) => [x.status, { cents: cents(x.cents), count: num(x.n) }]));

  return {
    feeTotals: group(feeTotals),
    renterRefunds: group(refunds),
    fees: fees.map((f) => ({
      id: f.id, applicationId: f.application_id, kind: f.kind, amountCents: cents(f.amount_cents), status: f.status,
      reversesId: f.reverses_id, earnedAt: f.earned_at, invoicedAt: f.invoiced_at, paidAt: f.paid_at, safeAt: f.safe_at,
      invoice: f.invoice_id ? { id: f.invoice_id, number: f.invoice_number } : null,
      building: { id: f.building_id, name: f.building_name },
      renterName: fullName(f.first_name, f.last_name)
    })),
    invoices: invoices.map((i) => ({
      id: i.id, number: i.number, totalCents: cents(i.total_cents), issuedAt: i.issued_at, dueAt: i.due_at,
      status: i.status, paidAt: i.paid_at, paymentMethod: i.payment_method, paymentRef: i.payment_ref,
      buildingName: i.building_name, companyName: i.company_name
    })),
    brokerRows: brokerRows.map((b) => ({
      id: b.id, brokerId: b.broker_id, brokerName: b.broker_name, feeLedgerId: b.fee_ledger_id,
      amountCents: cents(b.amount_cents), status: b.status, holdUntil: b.hold_until, paidAt: b.paid_at, payoutRef: b.payout_ref
    }))
  };
}

/* ── disputes ──────────────────────────────────────────────────────────── */

export async function listDisputes(db, { orgId, status, limit }) {
  const r = await db.query(
    `SELECT id, kind, subject, opened_by_kind, opened_by_id, opened_at, due_by, status,
            decision, decided_by, decided_at, (status = 'open' AND due_by < now()) AS overdue
       FROM yd_disputes
      WHERE org_id = $1 AND ($2::text IS NULL OR status = $2)
      ORDER BY (status = 'open') DESC, due_by ASC, id LIMIT $3`, [orgId, status, limit]);
  return r.rows.map((d) => ({
    id: d.id, kind: d.kind, subject: d.subject,
    openedBy: { kind: d.opened_by_kind, id: d.opened_by_id }, openedAt: d.opened_at,
    dueBy: d.due_by, overdue: d.overdue, status: d.status,
    decision: d.decision, decidedBy: d.decided_by, decidedAt: d.decided_at
  }));
}

/* ── scoreboard ────────────────────────────────────────────────────────── */

/** The weekly numbers the Scale Engine page tracks (spec §8). `from` / `to` default
 *  to the last 7 days. Flow numbers count events inside the window; the building
 *  and partner numbers are the standing counts right now. */
export async function getScoreboard(db, { orgId, from, to }) {
  const end = to || new Date();
  const start = from || new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const w = [orgId, start, end];

  const one = async (sql) => (await db.query(sql, w)).rows[0];

  const leads = await one(`SELECT count(*)::int AS n FROM yd_renters WHERE org_id = $1 AND created_at >= $2 AND created_at < $3`);
  const pulled = await one(`SELECT count(*)::int AS n FROM yd_screenings WHERE org_id = $1 AND status = 'complete' AND result_at >= $2 AND result_at < $3`);
  const registered = await one(`SELECT count(*)::int AS n FROM yd_applications WHERE org_id = $1 AND registration_sent_at >= $2 AND registration_sent_at < $3`);
  const leases = await one(`SELECT count(*)::int AS n FROM yd_applications WHERE org_id = $1 AND lease_signed_at >= $2 AND lease_signed_at < $3`);
  const movedIn = await one(`SELECT count(*)::int AS n FROM yd_applications WHERE org_id = $1 AND moved_in_at >= $2 AND moved_in_at < $3`);
  const feesIn = await one(
    `SELECT COALESCE(sum(amount_cents), 0)::bigint AS cents, count(*)::int AS n,
            avg(extract(epoch FROM (paid_at - invoiced_at)) / 86400.0)::float8 AS avg_days
       FROM yd_fee_ledger
      WHERE org_id = $1 AND kind = 'placement_fee' AND status IN ('paid', 'safe')
        AND paid_at >= $2 AND paid_at < $3`);
  const refundRows = await one(
    `SELECT COALESCE(-sum(amount_cents), 0)::bigint AS cents, count(*)::int AS n
       FROM yd_fee_ledger WHERE org_id = $1 AND kind = 'refund' AND status <> 'void' AND earned_at >= $2 AND earned_at < $3`);
  const renterRefunds = await one(
    `SELECT COALESCE(sum(amount_cents), 0)::bigint AS cents, count(*)::int AS n
       FROM yd_renter_refunds WHERE org_id = $1 AND status <> 'void' AND created_at >= $2 AND created_at < $3`);

  const standing = (await db.query(
    `SELECT
       (SELECT count(*)::int FROM yd_buildings WHERE org_id = $1 AND status = 'signed') AS buildings_signed,
       (SELECT count(*)::int FROM yd_buildings WHERE org_id = $1 AND status = 'live') AS buildings_live,
       (SELECT count(DISTINCT party_id)::int FROM yd_agreements
         WHERE org_id = $1 AND kind = 'broker_partner' AND status = 'signed') AS partners_signed,
       (SELECT count(*)::int FROM yd_brokers WHERE org_id = $1 AND status = 'active') AS partners_active`,
    [orgId])).rows[0];

  return {
    window: { from: start.toISOString(), to: end.toISOString() },
    leads: num(leads.n),
    pulled: num(pulled.n),
    registered: num(registered.n),
    leases: num(leases.n),
    movedIn: num(movedIn.n),
    feesInCents: cents(feesIn.cents),
    feesPaidCount: num(feesIn.n),
    // NULL when nothing was paid in the window: an average of nothing is unknown, not 0 days.
    avgDaysToPay: feesIn.avg_days === null ? null : Math.round(feesIn.avg_days * 10) / 10,
    refunds: { feeRefundsCents: cents(refundRows.cents), feeRefundsCount: num(refundRows.n),
               renterRefundsCents: cents(renterRefunds.cents), renterRefundsCount: num(renterRefunds.n) },
    buildings: { signed: num(standing.buildings_signed), live: num(standing.buildings_live) },
    partners: { signed: num(standing.partners_signed), active: num(standing.partners_active) }
  };
}

/* ── credit views: owner / ops only (handlers gate these) ──────────────── */

const shapeScreening = (s) => ({
  id: s.id, kind: s.kind, provider: s.provider, status: s.status, consentId: s.consent_id,
  creditScore: s.credit_score, collectionsCount: s.collections_count,
  evictionCount: s.eviction_count, evictionLastAt: s.eviction_last_at,
  criminalFlags: s.criminal_flags, rawRef: s.raw_ref, resultAt: s.result_at, createdAt: s.created_at
});

const SCREENING_COLS = `id, kind, provider, status, consent_id, credit_score, collections_count, eviction_count,
  to_char(eviction_last_at, 'YYYY-MM-DD') AS eviction_last_at, criminal_flags, raw_ref, result_at, created_at`;

/** The full timeline for one renter, every result ever kept. null if not in this org. */
export async function getRenterTimeline(db, { orgId, renterId }) {
  const renter = (await db.query(
    `SELECT id, email, first_name, last_name, phone, current_address, source_kind, source_ad_id,
            source_broker_id, first_touch_at, stage, lane, risk_tier, approved_max_rent_cents,
            income_verified, is_sample, created_at
       FROM yd_renters WHERE id = $1 AND org_id = $2`, [renterId, orgId])).rows[0];
  if (!renter) return null;

  const consents = (await db.query(
    `SELECT id, kind, consent_text, consent_version, captured_at, ip::text AS ip, user_agent, method
       FROM yd_consents WHERE renter_id = $1 AND org_id = $2 ORDER BY captured_at, id`, [renterId, orgId])).rows;
  const screenings = (await db.query(
    `SELECT ${SCREENING_COLS} FROM yd_screenings
      WHERE renter_id = $1 AND org_id = $2 ORDER BY created_at, id`, [renterId, orgId])).rows;
  const income = (await db.query(
    `SELECT id, method, status, monthly_income_cents, sources, checked_at, created_at
       FROM yd_income_checks WHERE renter_id = $1 AND org_id = $2 ORDER BY created_at, id`, [renterId, orgId])).rows;
  const matches = (await db.query(
    `SELECT m.id, m.result, m.reasons, m.max_rent_cents, m.is_backup, m.computed_at, m.screening_id,
            m.rules_id, ru.version AS rules_version, b.id AS building_id, b.name AS building_name
       FROM yd_matches m
       JOIN yd_buildings b ON b.id = m.building_id AND b.org_id = m.org_id
       JOIN yd_building_rules ru ON ru.id = m.rules_id AND ru.org_id = m.org_id
      WHERE m.renter_id = $1 AND m.org_id = $2 ORDER BY m.computed_at, m.id`, [renterId, orgId])).rows;
  const applications = (await db.query(
    `SELECT a.id, a.stage, a.denial_reason, a.registration_sent_at, a.known_prospect_at, a.known_prospect_evidence,
            to_char(a.lease_start, 'YYYY-MM-DD') AS lease_start, to_char(a.lease_end, 'YYYY-MM-DD') AS lease_end,
            a.rent_cents, a.broker_id, a.created_at, b.id AS building_id, b.name AS building_name
       FROM yd_applications a JOIN yd_buildings b ON b.id = a.building_id AND b.org_id = a.org_id
      WHERE a.renter_id = $1 AND a.org_id = $2 ORDER BY a.created_at, a.id`, [renterId, orgId])).rows;
  const tours = (await db.query(
    `SELECT t.id, t.application_id, t.starts_at, t.ends_at, t.status
       FROM yd_tours t JOIN yd_applications a ON a.id = t.application_id AND a.org_id = t.org_id
      WHERE a.renter_id = $1 AND t.org_id = $2 ORDER BY t.starts_at, t.id`, [renterId, orgId])).rows;
  const events = (await db.query(
    `SELECT id, name, entity_kind, entity_id, payload, actor_kind, actor_id, occurred_at
       FROM yd_events
      WHERE org_id = $2
        AND ((entity_kind = 'renter' AND entity_id = $1)
          OR (entity_kind = 'application' AND entity_id IN
               (SELECT id FROM yd_applications WHERE renter_id = $1 AND org_id = $2)))
      ORDER BY occurred_at, id`, [renterId, orgId])).rows;

  return {
    renter: {
      id: renter.id, email: renter.email, firstName: renter.first_name, lastName: renter.last_name,
      phone: renter.phone, currentAddress: renter.current_address,
      source: { kind: renter.source_kind, adId: renter.source_ad_id, brokerId: renter.source_broker_id },
      firstTouchAt: renter.first_touch_at, stage: renter.stage, lane: renter.lane, riskTier: renter.risk_tier,
      approvedMaxRentCents: cents(renter.approved_max_rent_cents), incomeVerified: renter.income_verified,
      isSample: renter.is_sample, createdAt: renter.created_at
    },
    consents: consents.map((c) => ({
      id: c.id, kind: c.kind, text: c.consent_text, version: c.consent_version, capturedAt: c.captured_at,
      ip: c.ip, userAgent: c.user_agent, method: c.method
    })),
    screenings: screenings.map(shapeScreening),
    incomeChecks: income.map((i) => ({
      id: i.id, method: i.method, status: i.status, monthlyIncomeCents: cents(i.monthly_income_cents),
      sources: i.sources, checkedAt: i.checked_at
    })),
    matches: matches.map((m) => ({
      id: m.id, result: m.result, reasons: m.reasons, maxRentCents: cents(m.max_rent_cents), isBackup: m.is_backup,
      computedAt: m.computed_at, screeningId: m.screening_id, rulesVersion: m.rules_version,
      building: { id: m.building_id, name: m.building_name }
    })),
    applications: applications.map((a) => ({
      id: a.id, stage: a.stage, denialReason: a.denial_reason, registeredAt: a.registration_sent_at,
      knownProspect: a.known_prospect_at ? { at: a.known_prospect_at, evidence: a.known_prospect_evidence } : null,
      lease: a.lease_start ? { start: a.lease_start, end: a.lease_end, rentCents: cents(a.rent_cents) } : null,
      brokerId: a.broker_id, createdAt: a.created_at,
      building: { id: a.building_id, name: a.building_name }
    })),
    tours: tours.map((t) => ({ id: t.id, applicationId: t.application_id, startsAt: t.starts_at, endsAt: t.ends_at, status: t.status })),
    events: events.map((e) => ({
      id: e.id, name: e.name, entityKind: e.entity_kind, entityId: e.entity_id, payload: e.payload,
      actor: { kind: e.actor_kind, id: e.actor_id }, occurredAt: e.occurred_at
    }))
  };
}

/** One screening with its raw bureau payload. null if not in this org. */
export async function getScreeningDetail(db, { orgId, screeningId }) {
  const s = (await db.query(
    `SELECT ${SCREENING_COLS}, renter_id FROM yd_screenings WHERE id = $1 AND org_id = $2`,
    [screeningId, orgId])).rows[0];
  if (!s) return null;
  const raw = (await db.query(
    `SELECT payload, created_at FROM yd_screening_raw WHERE screening_id = $1 AND org_id = $2`,
    [screeningId, orgId])).rows[0] || null;
  return {
    screening: { ...shapeScreening(s), renterId: s.renter_id },
    raw: raw ? { payload: raw.payload, storedAt: raw.created_at } : null
  };
}
