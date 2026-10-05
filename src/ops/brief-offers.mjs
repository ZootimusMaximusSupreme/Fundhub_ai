// Ad and sales numbers for the morning and evening brief, PER OFFER and PER
// FUNNEL (owner-set 2026-10-05, MB6: "every hole of the company").
//
// WHERE THE GROUPING COMES FROM — read from the repo, never invented:
//   * OFFER = the ad's script label, ad_scripts.offer_key, carried to the ad by
//     v_ad_label_spine (db/migrations/377_marketing_label_spine.sql). Spend joins
//     on ad_metrics_daily.ad_id = ad_row_id. A person joins on their first-touch
//     ad number, client_ad_attribution.ad_id = fundhub_ad_number (the bridge that
//     view's header names). This is the first rule of the marketing machine's
//     lead → offer tag (docs/specs/marketing-machine-2026-10-04.md §11.1). The
//     other two rules (campaign mapping, landing page → offer) have no table on
//     main yet, so they are not guessed here.
//   * FUNNEL = the person's first landing page, client_ad_attribution.landing_path,
//     looked up in src/funnel/pages.mjs (watch / roadmap / homepage).
//   * NULL stays unknown: no label → "no offer label", no landing page →
//     "no landing page", a page not on the map → "other page".
//
// Spend belongs to an ad, and an ad has no funnel, so spend, cost per booked
// person and return on ad spend are per offer only. Said once in `notes`.
//
// Read only. Money is integer cents. Every number is a plain SQL read.

import { funnelFor } from "../funnel/pages.mjs";
import { costPerBooked } from "./meta-marketing.mjs";
import { readDyingAds, pageChangeCandidates } from "./suggestions.mjs";
import { asStaff } from "../partners/rls.mjs";

export const NO_OFFER = "no_offer_label";
export const NO_PAGE = "no_landing_page";
export const OTHER_PAGE = "other_page";

export const OFFER_NOTES = Object.freeze([
  "Offer comes from each ad's script label (ad_scripts.offer_key). Ads and people with no label show as \"no offer label\".",
  "Funnel comes from the person's first landing page (src/funnel/pages.mjs).",
  "Spend is per ad and an ad has no funnel, so spend, cost per booked person and return on ad spend are per offer only.",
  "Cash and sales with no person on them are left out of the offer split; the company total is in the team section."
]);

export function offerOf(offerKey) {
  const k = offerKey == null ? "" : String(offerKey).trim();
  return k || NO_OFFER;
}

export function funnelOf(landingPath) {
  if (landingPath == null || String(landingPath).trim() === "") return NO_PAGE;
  // Attribution stores the full path; the map is keyed by the first segment form.
  const path = String(landingPath).split(/[?#]/)[0];
  const hit = funnelFor(path);
  return hit ? hit.funnel : OTHER_PAGE;
}

const METRICS = ["leads", "booked", "showed", "no_shows", "sales"];
const blank = () => ({ leads: 0, booked: 0, showed: 0, no_shows: 0, sales: 0, cash_cents: 0 });
const METRIC_FIELD = { lead: "leads", booked: "booked", showed: "showed", no_show: "no_shows", sale: "sales" };

function roas(cashCents, spendCents) {
  if (!spendCents || spendCents <= 0) return null;
  return Math.round((cashCents / spendCents) * 100) / 100;
}

/**
 * Pure. spendRows: [{ offer_key, spend_cents, rows }]
 * activityRows: [{ offer_key, landing_path, metric, n, cents }]
 * → { totals, by_offer: [{ offer, spend_cents, ..., funnels: [{ funnel, ... }] }] }
 * Offers sorted by spend, then cash; funnels by leads.
 */
export function groupByOfferFunnel(spendRows = [], activityRows = []) {
  const offers = new Map();
  const get = (offer) => {
    if (!offers.has(offer)) offers.set(offer, { offer, spend_cents: null, ...blank(), funnels: new Map() });
    return offers.get(offer);
  };
  for (const r of spendRows) {
    if (!Number(r.rows || 0)) continue;
    const o = get(offerOf(r.offer_key));
    o.spend_cents = (o.spend_cents || 0) + Number(r.spend_cents || 0);
  }
  for (const r of activityRows) {
    const field = r.metric === "cash" ? "cash_cents" : METRIC_FIELD[r.metric];
    if (!field) continue;
    const o = get(offerOf(r.offer_key));
    const fk = funnelOf(r.landing_path);
    if (!o.funnels.has(fk)) o.funnels.set(fk, { funnel: fk, ...blank() });
    const f = o.funnels.get(fk);
    const v = field === "cash_cents" ? Number(r.cents || 0) : Number(r.n || 0);
    o[field] += v;
    f[field] += v;
  }

  const totals = { spend_cents: null, ...blank() };
  const by_offer = [...offers.values()].map((o) => {
    if (o.spend_cents != null) totals.spend_cents = (totals.spend_cents || 0) + o.spend_cents;
    for (const m of [...METRICS, "cash_cents"]) totals[m] += o[m];
    const funnels = [...o.funnels.values()].map((f) => ({ ...f, close_rate: f.showed ? f.sales / f.showed : null }));
    funnels.sort((a, b) => b.leads - a.leads || b.booked - a.booked || a.funnel.localeCompare(b.funnel));
    return {
      offer: o.offer,
      spend_cents: o.spend_cents,
      ...Object.fromEntries([...METRICS, "cash_cents"].map((m) => [m, o[m]])),
      close_rate: o.showed ? o.sales / o.showed : null,
      cost_per_booked: costPerBooked({ spendCents: o.spend_cents, bookedN: o.booked }),
      roas: roas(o.cash_cents, o.spend_cents),
      funnels
    };
  });
  by_offer.sort((a, b) => (b.spend_cents || 0) - (a.spend_cents || 0) || b.cash_cents - a.cash_cents || a.offer.localeCompare(b.offer));
  totals.close_rate = totals.showed ? totals.sales / totals.showed : null;
  totals.cost_per_booked = costPerBooked({ spendCents: totals.spend_cents, bookedN: totals.booked });
  totals.roas = roas(totals.cash_cents, totals.spend_cents);
  return { totals, by_offer };
}

/* First touch wins: client_ad_attribution is one row per client (its primary
   key), so the join below cannot double a person. An ad number shared by two
   ad rows is collapsed to one label. */
const ATTR_CTE = `
  attr AS (
    SELECT caa.client_id, caa.landing_path,
           (SELECT v.offer_key FROM v_ad_label_spine v
             WHERE v.org_id = caa.org_id AND v.fundhub_ad_number = caa.ad_id
               AND v.offer_key IS NOT NULL
             ORDER BY v.offer_key LIMIT 1) AS offer_key
      FROM client_ad_attribution caa
     WHERE caa.org_id = $1
  )`;

export async function readSpendByOffer(tx, { orgId, day }) {
  const r = await tx.query(
    `SELECT v.offer_key, COUNT(*)::int AS rows, COALESCE(SUM(m.spend_cents), 0)::bigint AS spend_cents
       FROM ad_metrics_daily m
       LEFT JOIN v_ad_label_spine v ON v.ad_row_id = m.ad_id
      WHERE m.org_id = $1 AND m.date = $2::date
      GROUP BY v.offer_key`,
    [orgId, day]
  );
  return r.rows;
}

/* What happened in [from, to): new people, bookings made, calls held and
   no-shows, sales, cash — each tagged with the person's offer and funnel.
   Leads, booked, showed and no-shows count PEOPLE; sales count sales rows. */
export async function readActivityByOffer(tx, { orgId, from, to }) {
  const r = await tx.query(
    `WITH ${ATTR_CTE},
     ev AS (
       SELECT 'lead' AS metric, c.id AS client_id, NULL::uuid AS row_id, 0::bigint AS cents
         FROM clients c
        WHERE c.org_id = $1 AND COALESCE(c.is_demo, false) = false
          AND c.created_at >= $2::timestamptz AND c.created_at < $3::timestamptz
       UNION ALL
       SELECT 'booked', b.client_id, NULL, 0
         FROM bookings b
        WHERE b.org_id = $1 AND b.client_id IS NOT NULL
          AND b.created_at >= $2::timestamptz AND b.created_at < $3::timestamptz
       UNION ALL
       SELECT CASE WHEN o.outcome = 'no_show' THEN 'no_show' ELSE 'showed' END, o.client_id, NULL, 0
         FROM call_outcomes o
        WHERE o.org_id = $1 AND COALESCE(o.is_demo, false) = false
          AND o.logged_at >= $2::timestamptz AND o.logged_at < $3::timestamptz
       UNION ALL
       SELECT 'sale', s.client_id, s.id, 0
         FROM sales s
        WHERE s.org_id = $1 AND s.status = 'active' AND COALESCE(s.is_demo, false) = false
          AND s.sold_at >= $2::timestamptz AND s.sold_at < $3::timestamptz
       UNION ALL
       SELECT 'cash', t.client_id, t.id, round(t.amount_paid * 100)::bigint
         FROM transactions t
        WHERE t.org_id = $1 AND t.status = 'succeeded' AND t.client_id IS NOT NULL
          AND COALESCE(t.is_demo, false) = false AND t.amount_paid IS NOT NULL
          AND t.created_at >= $2::timestamptz AND t.created_at < $3::timestamptz
     )
     SELECT a.offer_key, a.landing_path, ev.metric,
            CASE WHEN ev.metric = 'sale' THEN count(*) ELSE count(DISTINCT ev.client_id) END::int AS n,
            COALESCE(sum(ev.cents), 0)::bigint AS cents
       FROM ev
       LEFT JOIN attr a ON a.client_id = ev.client_id
      GROUP BY a.offer_key, a.landing_path, ev.metric`,
    [orgId, from, to]
  );
  return r.rows;
}

/* Per closer, per offer and funnel: calls held, no-shows, deposits (the sale
   as src/sales/metrics.mjs counts it), close rate = deposits ÷ held. */
export async function readClosersByOffer(tx, { orgId, from, to }) {
  const r = await tx.query(
    `WITH ${ATTR_CTE}
     SELECT o.staff_id, s.name, a.offer_key, a.landing_path,
            count(*) FILTER (WHERE o.outcome <> 'no_show')::int AS calls_held,
            count(*) FILTER (WHERE o.outcome = 'no_show')::int AS no_shows,
            count(*) FILTER (WHERE o.outcome = 'deposit')::int AS deposits,
            count(*) FILTER (WHERE o.outcome = 'downsell')::int AS downsells
       FROM call_outcomes o
       JOIN staff s ON s.id = o.staff_id AND s.org_id = o.org_id
       LEFT JOIN attr a ON a.client_id = o.client_id
      WHERE o.org_id = $1
        AND COALESCE(o.is_demo, false) = false
        AND o.logged_at >= $2::timestamptz
        AND o.logged_at < $3::timestamptz
      GROUP BY o.staff_id, s.name, a.offer_key, a.landing_path`,
    [orgId, from, to]
  );
  return r.rows;
}

/** Pure. Rows from readClosersByOffer → one entry per closer with by_offer → funnels. */
export function groupClosers(rows = []) {
  const people = new Map();
  for (const r of rows) {
    if (!people.has(r.staff_id)) {
      people.set(r.staff_id, { staff_id: r.staff_id, name: r.name, calls_held: 0, no_shows: 0, deposits: 0, downsells: 0, offers: new Map() });
    }
    const p = people.get(r.staff_id);
    const offer = offerOf(r.offer_key);
    const funnel = funnelOf(r.landing_path);
    if (!p.offers.has(offer)) p.offers.set(offer, { offer, calls_held: 0, no_shows: 0, deposits: 0, downsells: 0, funnels: new Map() });
    const o = p.offers.get(offer);
    if (!o.funnels.has(funnel)) o.funnels.set(funnel, { funnel, calls_held: 0, no_shows: 0, deposits: 0, downsells: 0 });
    const f = o.funnels.get(funnel);
    for (const k of ["calls_held", "no_shows", "deposits", "downsells"]) {
      const v = Number(r[k] || 0);
      p[k] += v; o[k] += v; f[k] += v;
    }
  }
  const rate = (x) => (x.calls_held ? x.deposits / x.calls_held : null);
  return [...people.values()]
    .map((p) => ({
      staff_id: p.staff_id,
      name: p.name,
      calls_held: p.calls_held,
      no_shows: p.no_shows,
      deposits: p.deposits,
      downsells: p.downsells,
      close_rate: rate(p),
      by_offer: [...p.offers.values()].map((o) => ({
        offer: o.offer,
        calls_held: o.calls_held, no_shows: o.no_shows, deposits: o.deposits, downsells: o.downsells,
        close_rate: rate(o),
        funnels: [...o.funnels.values()].map((f) => ({ ...f, close_rate: rate(f) }))
      }))
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Dying ads (the watch-curve rule MB4 uses), each with its offer. */
export async function readDyingByOffer(tx, { orgId, date }) {
  const dying = pageChangeCandidates(await readDyingAds(tx, { orgId, date }));
  if (!dying.length) return [];
  const ids = dying.map((d) => d.numbers.ad_id);
  const r = await tx.query(
    `SELECT ad_row_id, offer_key FROM v_ad_label_spine WHERE ad_row_id = ANY($1::uuid[])`,
    [ids]
  );
  const offerById = new Map(r.rows.map((x) => [String(x.ad_row_id), x.offer_key]));
  return dying.map((d) => ({
    ad_id: d.numbers.ad_id,
    ad_name: d.numbers.ad_name,
    offer: offerOf(offerById.get(String(d.numbers.ad_id))),
    plays: d.numbers.plays,
    reached_25_rate: d.numbers.reached_25_rate,
    spend_7d_cents: d.numbers.spend_7d_cents
  }));
}

/**
 * Everything the brief needs per offer and funnel, in one staff-scoped
 * transaction (ads, ad_metrics_daily and ad_scripts carry partner row-level
 * security and read EMPTY without a staff scope).
 */
export async function loadOfferNumbers(db, { orgId, day, from, to, briefDate, staffScope = asStaff }) {
  return staffScope(async (tx) => {
    const spend = await readSpendByOffer(tx, { orgId, day });
    const activity = await readActivityByOffer(tx, { orgId, from, to });
    const closers = await readClosersByOffer(tx, { orgId, from, to });
    const dying = await readDyingByOffer(tx, { orgId, date: briefDate });
    return { spend, activity, closers, dying };
  });
}

export default { groupByOfferFunnel, groupClosers, loadOfferNumbers, offerOf, funnelOf, OFFER_NOTES };
