// The broker portal's reads (spec §8: GET broker/renters, broker/money, broker/link).
//
// A broker sees their renters' NAME and STAGE only, plus whether the tour was kept
// (owner, 2026-10-07: "whether their renters showed up to booked tours"). Never an
// approved / likely / no result, never a risk tier, never a credit field. And their
// own money: earned, held until the building's fee is safe, payable, paid.
//
// "Their renters": the broker first-touched them (yd_renters.source_broker_id) or
// the placement is tagged to them (yd_applications.broker_id).

import { cents, num } from "../http.mjs";
import { baseUrl } from "../auth/magic-link.mjs";

export async function listBrokerRenters(db, { orgId, brokerId, limit }) {
  const renters = (await db.query(
    `SELECT r.id, r.first_name, r.last_name, r.stage, r.first_touch_at
       FROM yd_renters r
      WHERE r.org_id = $1
        AND (r.source_broker_id = $2
             OR EXISTS (SELECT 1 FROM yd_applications a
                         WHERE a.renter_id = r.id AND a.org_id = r.org_id AND a.broker_id = $2))
      ORDER BY r.first_touch_at DESC, r.id DESC
      LIMIT $3`, [orgId, brokerId, limit])).rows;
  if (!renters.length) return [];

  const apps = (await db.query(
    `SELECT a.id, a.renter_id, a.stage, t.status AS tour_status
       FROM yd_applications a
       LEFT JOIN LATERAL (
         SELECT status FROM yd_tours
          WHERE application_id = a.id AND org_id = a.org_id
          ORDER BY created_at DESC, id DESC LIMIT 1
       ) t ON true
      WHERE a.org_id = $1 AND a.renter_id = ANY($2)
        AND (a.broker_id = $3 OR a.broker_id IS NULL)
      ORDER BY a.created_at, a.id`,
    [orgId, renters.map((r) => r.id), brokerId])).rows;

  return renters.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    stage: r.stage,
    firstTouchAt: r.first_touch_at,
    applications: apps.filter((a) => a.renter_id === r.id).map((a) => ({
      id: a.id, stage: a.stage, tourStatus: a.tour_status
    }))
  }));
}

export async function getBrokerMoney(db, { orgId, brokerId, limit }) {
  const rows = (await db.query(
    `SELECT bl.id, bl.amount_cents, bl.status, bl.hold_until, bl.paid_at, bl.payout_ref, bl.created_at,
            f.status AS fee_status, f.paid_at AS fee_paid_at,
            r.first_name, r.last_name, b.name AS building_name
       FROM yd_broker_ledger bl
       JOIN yd_fee_ledger f ON f.id = bl.fee_ledger_id AND f.org_id = bl.org_id
       JOIN yd_applications a ON a.id = f.application_id AND a.org_id = f.org_id
       JOIN yd_renters r ON r.id = a.renter_id AND r.org_id = a.org_id
       JOIN yd_buildings b ON b.id = a.building_id AND b.org_id = a.org_id
      WHERE bl.org_id = $1 AND bl.broker_id = $2
      ORDER BY bl.created_at DESC, bl.id DESC
      LIMIT $3`, [orgId, brokerId, limit])).rows;

  const sums = (await db.query(
    `SELECT status, COALESCE(sum(amount_cents), 0)::bigint AS cents, count(*)::int AS n
       FROM yd_broker_ledger WHERE org_id = $1 AND broker_id = $2 GROUP BY status`,
    [orgId, brokerId])).rows;
  const by = Object.fromEntries(sums.map((s) => [s.status, { cents: cents(s.cents), count: num(s.n) }]));
  const centsOf = (k) => (by[k] ? by[k].cents : 0);

  return {
    // Money in each stage. 0 here means "nothing in that stage", which is a known
    // fact about a ledger with rows; it is not an unknown amount.
    summary: {
      earnedCents: centsOf("earned"),
      heldCents: centsOf("held"),
      payableCents: centsOf("payable"),
      paidCents: centsOf("paid")
    },
    rows: rows.map((x) => ({
      id: x.id,
      amountCents: cents(x.amount_cents),
      status: x.status,
      holdUntil: x.hold_until,
      paidAt: x.paid_at,
      payoutRef: x.payout_ref,
      buildingPaidAt: x.fee_paid_at,          // when the building paid
      feeStatus: x.fee_status,
      renterName: [x.first_name, x.last_name].filter(Boolean).join(" ") || null,
      buildingName: x.building_name,
      earnedAt: x.created_at
    }))
  };
}

export async function getBrokerLink(db, { orgId, brokerId, env = process.env }) {
  const r = (await db.query(
    `SELECT name, tracking_code, plan, status, split_percent::float8 AS split_percent,
            licence_state, licence_verified_at
       FROM yd_brokers WHERE id = $1 AND org_id = $2`, [brokerId, orgId])).rows[0];
  if (!r) return null;
  const active = r.status === "active";
  return {
    name: r.name,
    status: r.status,
    plan: r.plan,
    splitPercent: r.split_percent,
    licence: { state: r.licence_state, verifiedAt: r.licence_verified_at },
    trackingCode: r.tracking_code,
    // The shareable link works only for an active partner.
    url: active ? `${baseUrl(env)}/yesdoor/?b=${encodeURIComponent(r.tracking_code)}` : null
  };
}
