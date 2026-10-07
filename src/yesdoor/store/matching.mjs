// Matching, with the database around it (spec §4). The rules themselves are the
// pure functions in src/yesdoor/match/; this file loads what they need, stores
// what they say, and moves the renter along.
//
// WHICH BUILDINGS. Only buildings the database itself calls matchable
// (yd_building_is_matchable: signed/live with a signed fee agreement, or a flagged
// SAMPLE so the demo funnel runs), not paused or churned, with a rules version on
// file and an active listing. `status` handed to the pure matcher is "signed" for
// those: the database function is the authority, the matcher's own status check
// would wrongly skip samples.
//
// WHICH LISTING. A building is matched once, at its best listing (best answer,
// then the lowest rent, then id). The income rule depends on the rent, so
// listings of one building can answer differently; the renter is shown the best
// one and books any of them later (B4).
//
// BACKUPS. The results are the buildings in the searched city. Backups are the
// top YD_DEFAULTS.maxBackups other buildings the renter is APPROVED at, from
// outside that city in the same state, ranked by rent fit, then payer score
// (none stored yet), then distance from the searched city. They are stored
// with is_backup = true so the denied-after-approved flow (B4) can offer them.
//
// HISTORY IS KEPT. Every run inserts new yd_matches rows; nothing is overwritten.
// The newest row per building is the current answer (what GET me reads).

import { YD_DEFAULTS, YD_PRESCREEN } from "../config.mjs";
import { cents } from "../http.mjs";
import { matchCandidates, rankBackups, riskTier, lane as laneOf } from "../match/match.mjs";
import { centroid, milesBetween } from "../match/geo.mjs";
import { recordEvent } from "../events.mjs";

const RESULT_RANK = { approved: 0, likely: 1, no: 2 };

/* --------------------------------------------------------------- loading */

/** The newest finished screening, in the shape the matcher reads, or null. */
export async function latestCompleteScreening(db, { orgId, renterId }) {
  const r = await db.query(
    `SELECT id, consent_id, kind, status, credit_score, collections_count, eviction_count,
            to_char(eviction_last_at, 'YYYY-MM-DD') AS eviction_last_at,
            criminal_flags, result_at
       FROM yd_screenings
      WHERE renter_id = $1 AND org_id = $2 AND status = 'complete'
      ORDER BY result_at DESC, id DESC LIMIT 1`, [renterId, orgId]);
  return r.rows[0] || null;
}

/** The newest VERIFIED income check, or null. A pending or review check does not count. */
export async function latestVerifiedIncome(db, { orgId, renterId }) {
  const r = await db.query(
    `SELECT id, method, status, monthly_income_cents, checked_at
       FROM yd_income_checks
      WHERE renter_id = $1 AND org_id = $2 AND status = 'verified'
      ORDER BY checked_at DESC, id DESC LIMIT 1`, [renterId, orgId]);
  return r.rows[0] || null;
}

/** Where this renter searched: the newest prescreen.completed event, else the
 *  city on their current address, else nothing (every matchable building). */
export async function searchAreaFor(db, { orgId, renter }) {
  const ev = (await db.query(
    `SELECT payload FROM yd_events
      WHERE org_id = $1 AND entity_kind = 'renter' AND entity_id = $2 AND name = 'prescreen.completed'
      ORDER BY occurred_at DESC, id DESC LIMIT 1`, [orgId, renter.id])).rows[0];
  const p = ev?.payload?.search;
  if (p && typeof p === "object" && p.city) {
    return { city: p.city, state: p.state ?? null, beds: p.beds ?? null, maxRentCents: p.maxRentCents ?? null };
  }
  const a = renter.current_address;
  if (a && typeof a === "object" && typeof a.city === "string" && a.city.trim()) {
    return { city: a.city.trim(), state: typeof a.state === "string" ? a.state : null, beds: null, maxRentCents: null };
  }
  return { city: null, state: null, beds: null, maxRentCents: null };
}

/** The stages where a placement is still in play (the same set the 435 open-pair index uses). */
export const OPEN_APPLICATION_STAGES = Object.freeze(["booked", "registered", "toured", "applied", "approved", "lease_signed"]);

/** Open applications for a renter: [{ id, buildingId, stage }]. */
export async function openApplications(db, { orgId, renterId }) {
  const r = await db.query(
    `SELECT id, building_id, stage FROM yd_applications
      WHERE org_id = $1 AND renter_id = $2 AND stage = ANY($3::text[])
      ORDER BY created_at, id`, [orgId, renterId, OPEN_APPLICATION_STAGES]);
  return r.rows.map((x) => ({ id: x.id, buildingId: x.building_id, stage: x.stage }));
}

const CANDIDATE_SELECT = `
  SELECT b.id AS building_id, b.name AS building_name, b.address, b.city, b.state, b.is_sample, b.status,
         b.lat, b.lng,
         r.id AS rules_id, r.version, r.min_score, r.income_multiple, r.max_evictions,
         r.eviction_lookback_years, r.criminal_policy, r.accepts_second_chance, r.confirmed_at,
         l.id AS listing_id, l.unit_label, l.beds, l.rent_cents`;

/* Buildings that may take renters, have rules, and a live listing that passes the
   renter's filters. `where` and `params` add the area. */
async function queryCandidates(db, { orgId, where = [], params = [], cap, listingFilters = [], listingParams = [] }) {
  const all = [orgId, ...params, ...listingParams];
  const idx = (n) => `$${n}`;
  const baseWhere = [
    `b.org_id = $1`,
    `b.status NOT IN ('paused', 'churned')`,
    `yd_building_is_matchable(b.id)`,
    ...where
  ];
  // listing filters reference params after the area params
  const offset = 1 + params.length;
  const lf = listingFilters.map((f) => f.replace(/\$L(\d+)/g, (_, n) => idx(offset + Number(n))));
  const listingWhere = [`l.org_id = b.org_id`, `l.building_id = b.id`, `l.active`, ...lf].join(" AND ");

  const sql = `${CANDIDATE_SELECT}
      FROM (
        SELECT b.* FROM yd_buildings b
         WHERE ${baseWhere.join(" AND ")}
           AND EXISTS (SELECT 1 FROM yd_building_rules x WHERE x.building_id = b.id AND x.org_id = b.org_id)
           AND EXISTS (SELECT 1 FROM yd_listings l WHERE ${listingWhere})
         ORDER BY b.id
         LIMIT ${Number(cap)}
      ) b
      JOIN LATERAL (
        SELECT * FROM yd_building_rules x
         WHERE x.building_id = b.id AND x.org_id = b.org_id
         ORDER BY x.version DESC LIMIT 1
      ) r ON true
      JOIN yd_listings l ON ${listingWhere}
     ORDER BY b.id, l.rent_cents, l.id`;
  return (await db.query(sql, all)).rows;
}

function listingFilterSql(area) {
  const filters = [];
  const params = [];
  if (area.beds !== null && area.beds !== undefined) {
    params.push(area.beds); filters.push(`l.beds = $L${params.length}`);
  }
  if (area.maxRentCents !== null && area.maxRentCents !== undefined) {
    params.push(area.maxRentCents); filters.push(`l.rent_cents <= $L${params.length}`);
  }
  return { listingFilters: filters, listingParams: params };
}

/**
 * Candidate rows: the searched area, the backup pool outside it, and any extra
 * buildings (an open application's building is always re-matched, even when it is
 * not in the searched city, so a drop is never missed).
 */
export async function loadCandidates(db, { orgId, area, extraBuildingIds = [] }) {
  const lf = listingFilterSql(area);
  const areaWhere = [];
  const areaParams = [];
  if (area.city) { areaParams.push(area.city); areaWhere.push(`lower(b.city) = lower($${areaParams.length + 1})`); }
  if (area.state) { areaParams.push(area.state); areaWhere.push(`b.state = $${areaParams.length + 1}`); }

  const areaRows = await queryCandidates(db, {
    orgId, where: areaWhere, params: areaParams, cap: YD_PRESCREEN.areaBuildingCap, ...lf
  });

  // The backup pool: the same state, outside the searched city.
  const state = area.state || areaRows.find((r) => r.state)?.state || null;
  let poolRows = [];
  if (area.city && state) {
    poolRows = await queryCandidates(db, {
      orgId,
      where: [`b.state = $2`, `lower(b.city) <> lower($3)`],
      params: [state, area.city],
      cap: YD_PRESCREEN.backupPoolCap, ...lf
    });
  }

  const have = new Set([...areaRows, ...poolRows].map((r) => r.building_id));
  const missing = [...new Set(extraBuildingIds)].filter((id) => !have.has(id));
  const extraRows = missing.length ? await queryExtraCandidates(db, { orgId, buildingIds: missing }) : [];
  return { areaRows, poolRows, extraRows };
}

/* The buildings of a renter's open applications that the searched area did not
   bring in. They are matched even when they have no live unit right now (the
   rent is then unknown, so the answer is at best "likely"): a renter with an
   application there must never silently drop out of the re-check. A building
   that has since been paused or churned, or can no longer take renters, is not
   matched at all. */
async function queryExtraCandidates(db, { orgId, buildingIds }) {
  return (await db.query(
    `${CANDIDATE_SELECT}
       FROM yd_buildings b
       JOIN LATERAL (
         SELECT * FROM yd_building_rules x
          WHERE x.building_id = b.id AND x.org_id = b.org_id
          ORDER BY x.version DESC LIMIT 1
       ) r ON true
       LEFT JOIN LATERAL (
         SELECT * FROM yd_listings m
          WHERE m.building_id = b.id AND m.org_id = b.org_id AND m.active
          ORDER BY m.rent_cents, m.id LIMIT 1
       ) l ON true
      WHERE b.org_id = $1 AND b.id = ANY($2::uuid[])
        AND b.status NOT IN ('paused', 'churned')
        AND yd_building_is_matchable(b.id)
      ORDER BY b.id`, [orgId, buildingIds])).rows;
}

/** yd_state_rules for the org as { STATE: { key: value } }. */
async function loadStateRules(db, orgId) {
  const rows = (await db.query(`SELECT state, key, value FROM yd_state_rules WHERE org_id = $1`, [orgId])).rows;
  const out = {};
  for (const r of rows) (out[r.state] ||= {})[r.key] = r.value;
  return out;
}

/* ------------------------------------------------------------ computation */

const toCandidate = (row, stateRules, distance) => ({
  buildingId: row.building_id,
  listingId: row.listing_id,
  // The database's own matchable check already ran (samples included); see the header.
  status: "signed",
  rules: {
    version: row.version, min_score: row.min_score, income_multiple: row.income_multiple,
    max_evictions: row.max_evictions, eviction_lookback_years: row.eviction_lookback_years,
    criminal_policy: row.criminal_policy, accepts_second_chance: row.accepts_second_chance,
    confirmed_at: row.confirmed_at
  },
  listingRentCents: cents(row.rent_cents),
  stateRules: stateRules[row.state] || null,
  ...(distance === undefined ? {} : { distance })
});

/** The best listing's answer for each building: best result, then the lowest
 *  rent, then listing id. */
function bestPerBuilding(matches) {
  const best = new Map();
  for (const m of matches) {
    const cur = best.get(m.buildingId);
    const rank = RESULT_RANK[m.result];
    const better = !cur
      || rank < RESULT_RANK[cur.result]
      || (rank === RESULT_RANK[cur.result] && (
        (m.listingRentCents ?? Infinity) < (cur.listingRentCents ?? Infinity)
        || ((m.listingRentCents ?? Infinity) === (cur.listingRentCents ?? Infinity)
          && String(m.listingId ?? "") < String(cur.listingId ?? ""))));
    if (better) best.set(m.buildingId, m);
  }
  return [...best.values()];
}

/**
 * Pure join of rows and the matcher: no database writes.
 * Returns { area: [match], backups: [match], tier, lane, approvedMaxRentCents }.
 * Each match carries rulesId plus `info` (the building and listing to show).
 */
export function computeMatches({ screening, income, rows, stateRules = {}, now = new Date(), defaults = YD_DEFAULTS }) {
  const { areaRows, poolRows, extraRows } = rows;
  const centre = centroid(areaRows.map((r) => ({ lat: r.lat, lng: r.lng })));
  const distanceOf = (row) => {
    const d = centre ? milesBetween(centre, { lat: row.lat, lng: row.lng }) : null;
    return d === null ? undefined : d;
  };

  const all = [
    ...areaRows.map((r) => ({ r, zone: "area" })),
    ...poolRows.map((r) => ({ r, zone: "pool" })),
    ...extraRows.map((r) => ({ r, zone: "extra" }))
  ];
  const zoneOf = new Map();
  const infoOf = new Map();
  const rulesOf = new Map();
  for (const { r, zone } of all) {
    zoneOf.set(r.building_id, zone);
    rulesOf.set(r.building_id, r.rules_id);
    infoOf.set(`${r.building_id}|${r.listing_id}`, {
      building: { id: r.building_id, name: r.building_name, address: r.address, city: r.city, state: r.state, isSample: r.is_sample },
      listing: r.listing_id ? { id: r.listing_id, unit: r.unit_label, beds: r.beds, rentCents: cents(r.rent_cents) } : null
    });
  }

  const candidates = all.map(({ r, zone }) => toCandidate(r, stateRules, zone === "pool" ? distanceOf(r) : undefined));
  const { matches } = matchCandidates({ screening, income, candidates, now, defaults });
  const best = bestPerBuilding(matches).map((m) => ({
    ...m,
    rulesId: rulesOf.get(m.buildingId),
    zone: zoneOf.get(m.buildingId),
    info: infoOf.get(`${m.buildingId}|${m.listingId}`)
  }));

  const area = best.filter((m) => m.zone === "area" || m.zone === "extra");
  const poolMatches = best.filter((m) => m.zone === "pool");
  const distance = {};
  for (const r of poolRows) { const d = distanceOf(r); if (d !== undefined) distance[r.building_id] = d; }
  const backups = rankBackups(poolMatches, { distance, maxBackups: defaults.maxBackups })
    .map((m) => ({ ...m, rulesId: rulesOf.get(m.buildingId), info: infoOf.get(`${m.buildingId}|${m.listingId}`) }));

  const tier = riskTier({ screening, income, now, defaults });
  const approved = area.filter((m) => m.zone === "area" && m.result === "approved" && m.maxRentCents !== null);
  const approvedMaxRentCents = approved.length ? Math.max(...approved.map((m) => m.maxRentCents)) : null;

  return { area, backups, tier, lane: laneOf(tier), approvedMaxRentCents };
}

/* ---------------------------------------------------------------- storing */

async function insertMatch(db, { orgId, renterId, screeningId, incomeCheckId, m, isBackup }) {
  const r = await db.query(
    `INSERT INTO yd_matches
       (org_id, renter_id, building_id, listing_id, screening_id, income_check_id, rules_id,
        result, reasons, max_rent_cents, is_backup)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
     RETURNING id, computed_at`,
    [orgId, renterId, m.buildingId, m.listingId, screeningId, incomeCheckId, m.rulesId,
     m.result, JSON.stringify(m.reasons), m.maxRentCents, isBackup]);
  return r.rows[0];
}

/** Move the renter to what the new answers say. Forward only along
 *  lead -> screened -> matched; a booked, placed or inactive renter keeps its stage. */
export async function applyRenterProfile(db, { orgId, renter, tier, lane, approvedMaxRentCents, incomeVerified, haveMatches }) {
  let stage = renter.stage;
  if (stage === "lead" || stage === "screened" || stage === "matched") {
    const target = haveMatches ? "matched" : "screened";
    const order = { lead: 0, screened: 1, matched: 2 };
    if (order[target] > order[stage]) stage = target;
  }
  const before = {
    lane: renter.lane, risk_tier: renter.risk_tier,
    approved_max_rent_cents: cents(renter.approved_max_rent_cents), income_verified: renter.income_verified
  };
  const after = {
    lane, risk_tier: tier, approved_max_rent_cents: approvedMaxRentCents, income_verified: Boolean(incomeVerified)
  };

  const upd = await db.query(
    `UPDATE yd_renters
        SET stage = $3, lane = $4, risk_tier = $5, approved_max_rent_cents = $6, income_verified = $7
      WHERE id = $1 AND org_id = $2
      RETURNING *`,
    [renter.id, orgId, stage, lane, tier, approvedMaxRentCents, Boolean(incomeVerified)]);
  const next = upd.rows[0];

  if (stage !== renter.stage) {
    await recordEvent(db, {
      orgId, name: "renter.stage_changed", entityKind: "renter", entityId: renter.id,
      payload: { from: renter.stage, to: stage }, actorKind: "system"
    });
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    await recordEvent(db, {
      orgId, name: "renter.profile_updated", entityKind: "renter", entityId: renter.id,
      payload: { from: before, to: after }, actorKind: "system"
    });
  }
  return next;
}

/**
 * Compute, store and apply: one full matching run for a renter, inside the
 * caller's transaction. Uses the newest finished screening and the newest
 * verified income; it NEVER runs a screening (no new paid pull).
 *
 * Returns the results plus, for the cron, what each building said BEFORE this
 * run (`previous`) and the renter's open applications.
 */
export async function runMatching(db, { orgId, renter, area = null, now = new Date() }) {
  const screening = await latestCompleteScreening(db, { orgId, renterId: renter.id });
  if (!screening) return { ok: false, reason: "no_screening" };
  const income = await latestVerifiedIncome(db, { orgId, renterId: renter.id });
  const search = area || await searchAreaFor(db, { orgId, renter });

  // What each building said last time, before this run writes new rows.
  const previous = new Map((await db.query(
    `SELECT DISTINCT ON (building_id) building_id, result
       FROM yd_matches WHERE renter_id = $1 AND org_id = $2
      ORDER BY building_id, computed_at DESC, id DESC`, [renter.id, orgId])).rows.map((r) => [r.building_id, r.result]));

  // An open application's building is always re-matched, even outside the searched
  // city, so a renter who drops to "no" there is never missed.
  const apps = await openApplications(db, { orgId, renterId: renter.id });
  const rows = await loadCandidates(db, { orgId, area: search, extraBuildingIds: apps.map((a) => a.buildingId) });
  const stateRules = await loadStateRules(db, orgId);
  const out = computeMatches({ screening, income, rows, stateRules, now });

  const stored = [];
  for (const m of out.area) {
    const row = await insertMatch(db, { orgId, renterId: renter.id, screeningId: screening.id, incomeCheckId: income?.id ?? null, m, isBackup: false });
    stored.push({ ...m, id: row.id, computedAt: row.computed_at, isBackup: false });
  }
  const storedBackups = [];
  for (const m of out.backups) {
    const row = await insertMatch(db, { orgId, renterId: renter.id, screeningId: screening.id, incomeCheckId: income?.id ?? null, m, isBackup: true });
    storedBackups.push({ ...m, id: row.id, computedAt: row.computed_at, isBackup: true });
  }

  const haveMatches = stored.some((m) => m.result !== "no");
  const updated = await applyRenterProfile(db, {
    orgId, renter, tier: out.tier, lane: out.lane,
    approvedMaxRentCents: out.approvedMaxRentCents, incomeVerified: Boolean(income), haveMatches
  });

  await recordEvent(db, {
    orgId, name: "renter.matched", entityKind: "renter", entityId: renter.id,
    payload: {
      screening_id: screening.id, income_check_id: income?.id ?? null,
      approved: stored.filter((m) => m.result === "approved").length,
      likely: stored.filter((m) => m.result === "likely").length,
      no: stored.filter((m) => m.result === "no").length,
      backups: storedBackups.length
    },
    actorKind: "system"
  });

  return {
    ok: true, renter: updated, screening, income, search,
    results: stored, backups: storedBackups, previous, openApplications: apps, tier: out.tier, lane: out.lane,
    approvedMaxRentCents: out.approvedMaxRentCents
  };
}

/* ------------------------------------------------------------- the views */

/**
 * What the RENTER may see of one result: the answer, their own reasons (which
 * quote their own file and the building's rules, because the renter is told why),
 * the building and unit, and the date of the rules used. This is NOT what a
 * building user gets: buildings only ever get buildingView() (answer, tier,
 * income verified, max rent; no reasons, no credit numbers).
 */
export function renterResultView(m) {
  return {
    result: m.result,
    maxRentCents: m.maxRentCents,
    reasons: m.reasons.map((r) => ({ rule: r.rule, result: r.result, reason: r.reason })),
    notices: (m.notices || []).map((n) => ({ key: n.key, text: n.text, ...(n.capCents !== undefined ? { capCents: n.capCents } : {}) })),
    rulesVersion: m.rulesVersion,
    rulesConfirmedAt: m.rulesConfirmedAt,
    rulesStale: m.rulesStale,
    building: m.info.building,
    listing: m.info.listing
  };
}

/** The whole renter-safe answer to a pre-screen or an income check. */
export function renterAnswer(run) {
  return {
    renter: {
      stage: run.renter.stage,
      lane: run.renter.lane,
      riskTier: run.renter.risk_tier,
      approvedMaxRentCents: cents(run.renter.approved_max_rent_cents),
      incomeVerified: run.renter.income_verified
    },
    search: {
      city: run.search.city, state: run.search.state, beds: run.search.beds, maxRentCents: run.search.maxRentCents
    },
    results: run.results.map(renterResultView),
    // A backup is another building the renter is already approved at. Reasons are
    // not repeated: they all passed.
    backups: run.backups.map((m) => ({
      result: m.result, maxRentCents: m.maxRentCents,
      rulesVersion: m.rulesVersion, rulesConfirmedAt: m.rulesConfirmedAt,
      building: m.info.building, listing: m.info.listing
    })),
    nextStep: run.renter.income_verified ? null : "verify_income"
  };
}
