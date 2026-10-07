// What a building user writes (spec §8: POST building/rules, building/listings,
// building/import). The building's own rules and its own units: never a renter.
//
//   postRules          a NEW rules version (rules are never edited), confirmed now;
//                      or { confirmCurrent: true } to re-confirm the latest unchanged
//   saveListing        one unit, created or updated by its unit label
//   importListings     a spreadsheet (csv) or a listing feed (mits), through the
//                      building connectors; a bad row never sinks the file
//
// The building is read off the session (yd_account_buildings), never trusted from
// the body: a user can only write to a building on their own account.

import { YD_API } from "../config.mjs";
import { YdError, cents } from "../http.mjs";
import { withTransaction } from "../tx.mjs";
import { actorOf, recordEvent, setActor } from "../events.mjs";
import { getConnector } from "../providers/building-connectors/index.mjs";
import {
  reqString, optString, optBool, optInt, optNumber, optDateOnly, reqInt
} from "../validate.mjs";

/** The building this user is writing to. One building on the account needs no id. */
export function pickBuilding(who, body) {
  const own = who.buildingIds || [];
  const asked = body?.buildingId;
  if (asked === undefined || asked === null || asked === "") {
    if (own.length === 1) return own[0];
    throw new YdError(400, "buildingId_required", "Choose which building this is for.");
  }
  if (!own.includes(asked)) throw new YdError(404, "not_found", "We could not find that building on your account.");
  return asked;
}

/* ── rules ────────────────────────────────────────────────────────────── */

/** The criminal policy: { category: years | "never" | "case_by_case" }. Same shape the database checks. */
export function readCriminalPolicy(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new YdError(400, "invalid_criminal_policy", "The criminal-record policy must be a list of categories.");
  }
  const out = {};
  for (const [category, rule] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]{0,59}$/.test(category)) {
      throw new YdError(400, "invalid_criminal_policy", `"${category}" is not a valid category name (use lower-case words and underscores).`);
    }
    const ok = (typeof rule === "number" && Number.isFinite(rule) && rule >= 0 && rule <= 99)
      || rule === "never" || rule === "case_by_case";
    if (!ok) {
      throw new YdError(400, "invalid_criminal_policy",
        `The rule for "${category}" must be a number of years, "never" or "case_by_case".`);
    }
    out[category] = rule;
  }
  return out;
}

const shapeRules = (r) => ({
  version: r.version,
  effectiveAt: r.effective_at,
  confirmedAt: r.confirmed_at,
  minScore: r.min_score,
  incomeMultiple: r.income_multiple === null ? null : Number(r.income_multiple),
  maxEvictions: r.max_evictions,
  evictionLookbackYears: r.eviction_lookback_years,
  criminalPolicy: r.criminal_policy,
  acceptsSecondChance: r.accepts_second_chance,
  notes: r.notes,
  source: r.source
});

const RULE_COLS = `version, effective_at, confirmed_at, min_score, income_multiple, max_evictions,
  eviction_lookback_years, criminal_policy, accepts_second_chance, notes, source`;

/**
 * POST building/rules. Body: { buildingId?, rules: {...}, notes? } (or the same
 * fields flat), or { buildingId?, confirmCurrent: true }.
 * Returns { buildingId, rules, created }.
 */
export async function postRules(db, who, body) {
  const buildingId = pickBuilding(who, body);
  const confirmCurrent = optBool(body, "confirmCurrent", "confirm current") === true;
  const src = body.rules && typeof body.rules === "object" && !Array.isArray(body.rules) ? body.rules : body;

  if (confirmCurrent) {
    return withTransaction(db, async (tx) => {
      await setActor(tx, actorOf(who));
      await tx.query(`SELECT 1 FROM yd_buildings WHERE id = $1 AND org_id = $2 FOR UPDATE`, [buildingId, who.orgId]);
      const cur = (await tx.query(
        `SELECT id, version FROM yd_building_rules WHERE building_id = $1 AND org_id = $2 ORDER BY version DESC LIMIT 1`,
        [buildingId, who.orgId])).rows[0];
      if (!cur) throw new YdError(409, "no_rules_yet", "This building has no rules on file yet. Save them first.");
      // Only confirmed_at may change on a saved version (the database enforces it).
      const r = await tx.query(
        `UPDATE yd_building_rules SET confirmed_at = now() WHERE id = $1 AND org_id = $2 RETURNING ${RULE_COLS}`,
        [cur.id, who.orgId]);
      await recordEvent(tx, {
        orgId: who.orgId, name: "rules.confirmed", entityKind: "building", entityId: buildingId,
        payload: { version: cur.version }, actor: actorOf(who)
      });
      return { buildingId, rules: shapeRules(r.rows[0]), created: false };
    });
  }

  const minScore = reqInt(src, "minScore", "the minimum credit score", { min: 300, max: 850 });
  const incomeMultiple = optNumber(src, "incomeMultiple", "the income multiple", { min: 1, max: 10 });
  if (incomeMultiple === undefined || incomeMultiple === null) {
    throw new YdError(400, "incomeMultiple_required", "Add the income multiple (3 means income of 3 times the rent).");
  }
  const maxEvictions = optInt(src, "maxEvictions", "the most evictions allowed", { min: 0, max: 20 }) ?? 0;
  const lookback = optInt(src, "evictionLookbackYears", "the eviction look-back", { min: 0, max: 99 });
  const criminalPolicy = readCriminalPolicy(src.criminalPolicy);
  const acceptsSecondChance = optBool(src, "acceptsSecondChance", "accepts second chance") ?? false;
  const notes = optString(body, "notes", "the notes", { max: 1000 }) ?? optString(src, "notes", "the notes", { max: 1000 }) ?? null;

  return withTransaction(db, async (tx) => {
    await setActor(tx, actorOf(who));
    // Lock the building so two saves at once get version N and N+1, never the same N.
    const b = (await tx.query(`SELECT id FROM yd_buildings WHERE id = $1 AND org_id = $2 FOR UPDATE`, [buildingId, who.orgId])).rows[0];
    if (!b) throw new YdError(404, "not_found", "We could not find that building.");
    const r = await tx.query(
      `INSERT INTO yd_building_rules
         (org_id, building_id, confirmed_at, min_score, income_multiple, max_evictions,
          eviction_lookback_years, criminal_policy, accepts_second_chance, notes, source)
       VALUES ($1,$2, now(), $3,$4,$5,$6,$7::jsonb,$8,$9,'portal')
       RETURNING ${RULE_COLS}`,
      [who.orgId, buildingId, minScore, incomeMultiple, maxEvictions, lookback ?? null,
       JSON.stringify(criminalPolicy), acceptsSecondChance, notes]);
    await recordEvent(tx, {
      orgId: who.orgId, name: "rules.posted", entityKind: "building", entityId: buildingId,
      payload: { version: r.rows[0].version, accepts_second_chance: acceptsSecondChance }, actor: actorOf(who)
    });
    return { buildingId, rules: shapeRules(r.rows[0]), created: true };
  });
}

/* ── listings ─────────────────────────────────────────────────────────── */

const LISTING_COLS = `id, building_id, unit_label, beds, baths::float8 AS baths, sqft, rent_cents,
  to_char(available_on, 'YYYY-MM-DD') AS available_on, specials, photos, active, source, is_sample`;

export const shapeListingRow = (l) => ({
  id: l.id, buildingId: l.building_id, unitLabel: l.unit_label, beds: l.beds, baths: l.baths, sqft: l.sqft,
  rentCents: cents(l.rent_cents), availableOn: l.available_on, specials: l.specials, photos: l.photos,
  active: l.active, source: l.source, isSample: l.is_sample
});

function readPhotos(body) {
  if (!Object.hasOwn(body, "photos") || body.photos === undefined) return undefined;
  if (body.photos === null) return [];
  if (!Array.isArray(body.photos) || body.photos.length > 12 ||
      body.photos.some((p) => typeof p !== "string" || !/^https:\/\/\S{1,500}$/.test(p))) {
    throw new YdError(400, "invalid_photos", "Photos must be a list of up to 12 web addresses starting with https://.");
  }
  return body.photos;
}

/** One unit's fields, read and checked. Used by the single-unit endpoint and by imports. */
function readListing(body) {
  const unitLabel = reqString(body, "unitLabel", "the unit number or name", { max: 40 });
  const beds = reqInt(body, "beds", "the number of bedrooms (0 for a studio)", { min: 0, max: 10 });
  const rentCents = reqInt(body, "rentCents", "the monthly rent", { min: 1, max: 100_000_000 });
  const baths = optNumber(body, "baths", "the number of bathrooms", { min: 0, max: 20 });
  if (baths !== undefined && baths !== null && Math.round(baths * 2) !== baths * 2) {
    throw new YdError(400, "invalid_parameter", "Bathrooms must be a whole or half number (1, 1.5, 2).");
  }
  return {
    unitLabel, beds, rentCents,
    baths: baths ?? null,
    sqft: optInt(body, "sqft", "the square footage", { min: 1, max: 100000 }) ?? null,
    availableOn: optDateOnly(body, "availableOn", "the available date") ?? null,
    specials: optString(body, "specials", "the specials", { max: 300 }) ?? null,
    photos: readPhotos(body)
  };
}

const UPSERT = `
  INSERT INTO yd_listings (org_id, building_id, unit_label, beds, baths, sqft, rent_cents, available_on,
                           specials, photos, source, active, last_seen_at, is_sample)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::jsonb, '[]'::jsonb),$11,$12, now(), $13)
  ON CONFLICT (building_id, lower(unit_label)) DO UPDATE
     SET beds = EXCLUDED.beds, baths = EXCLUDED.baths, sqft = EXCLUDED.sqft, rent_cents = EXCLUDED.rent_cents,
         available_on = EXCLUDED.available_on, specials = EXCLUDED.specials,
         photos = CASE WHEN $10::jsonb IS NULL THEN yd_listings.photos ELSE EXCLUDED.photos END,
         source = EXCLUDED.source, active = EXCLUDED.active, last_seen_at = now()
  RETURNING ${LISTING_COLS}, (xmax = 0) AS inserted`;

async function buildingIsSample(tx, orgId, buildingId) {
  const r = (await tx.query(`SELECT is_sample FROM yd_buildings WHERE id = $1 AND org_id = $2`, [buildingId, orgId])).rows[0];
  if (!r) throw new YdError(404, "not_found", "We could not find that building.");
  return r.is_sample;
}

/** POST building/listings. Body: { buildingId?, unitLabel, beds, rentCents, baths?, sqft?, availableOn?, specials?, photos?, active? }.
 *  The same unit label (any case) updates that unit. Returns { listing, created }. */
export async function saveListing(db, who, body) {
  const buildingId = pickBuilding(who, body);
  const l = readListing(body);
  const active = optBool(body, "active", "active") ?? true;
  return withTransaction(db, async (tx) => {
    await setActor(tx, actorOf(who));
    const sample = await buildingIsSample(tx, who.orgId, buildingId);
    const r = await tx.query(UPSERT, [
      who.orgId, buildingId, l.unitLabel, l.beds, l.baths, l.sqft, l.rentCents, l.availableOn,
      l.specials, l.photos === undefined ? null : JSON.stringify(l.photos), "manual", active, sample]);
    const row = r.rows[0];
    await recordEvent(tx, {
      orgId: who.orgId, name: row.inserted ? "listing.created" : "listing.updated", entityKind: "listing", entityId: row.id,
      payload: { building_id: buildingId, unit: l.unitLabel, rent_cents: l.rentCents, active }, actor: actorOf(who)
    });
    return { listing: shapeListingRow(row), created: row.inserted };
  });
}

/* ── import ───────────────────────────────────────────────────────────── */

export const IMPORT_FORMATS = Object.freeze(["csv", "mits"]);
const MAX_IMPORT_CHARS = 5_000_000;

/**
 * POST building/import. Body: { buildingId?, format: "csv" | "mits", content, mapping?, replace?, propertyExternalId? }.
 * Every row that parses becomes a unit (created, or updated if the label exists);
 * every row that does not is an error with its row number. `replace` also turns
 * off this building's other units that came from the same kind of source.
 * Returns { imported, created, updated, deactivated, errors, skipped }.
 */
export async function importListings(db, who, body) {
  const buildingId = pickBuilding(who, body);
  const format = body.format ?? body.kind;
  if (!IMPORT_FORMATS.includes(format)) throw new YdError(400, "invalid_parameter", "format must be csv or mits.");
  const content = body.content ?? body.csv ?? body.xml;
  if (typeof content !== "string" || content.trim() === "") throw new YdError(400, "content_required", "Add the file's contents.");
  if (content.length > MAX_IMPORT_CHARS) throw new YdError(400, "too_large", "That file is too large to import in one go.");
  const replace = optBool(body, "replace", "replace") === true;
  const mapping = body.mapping && typeof body.mapping === "object" && !Array.isArray(body.mapping) ? body.mapping : null;

  const connector = getConnector(format === "csv" ? "csv" : "feed");
  const parsed = format === "csv"
    ? await connector.listListings({ csvText: content, mapping })
    : await connector.listListings({ xml: content, propertyExternalId: optString(body, "propertyExternalId", "the property id") ?? null });

  const errors = [...(parsed.errors || [])];
  const rows = [];
  parsed.listings.forEach((l) => {
    if (!Number.isInteger(l.beds)) { errors.push({ unit: l.unit_label, field: "beds", message: `Unit ${l.unit_label} has no bedroom count.` }); return; }
    if (l.beds < 0 || l.beds > 10) { errors.push({ unit: l.unit_label, field: "beds", message: `Unit ${l.unit_label} has an odd bedroom count.` }); return; }
    if (!Number.isInteger(l.rent_cents) || l.rent_cents <= 0) { errors.push({ unit: l.unit_label, field: "rent", message: `Unit ${l.unit_label} has no rent.` }); return; }
    rows.push(l);
  });
  if (rows.length > YD_API.importMaxRows) {
    throw new YdError(400, "too_many_rows", `That file has more than ${YD_API.importMaxRows} units. Split it into smaller files.`);
  }

  const source = format === "csv" ? "csv" : "feed";
  const out = await withTransaction(db, async (tx) => {
    await setActor(tx, actorOf(who));
    const sample = await buildingIsSample(tx, who.orgId, buildingId);
    let created = 0; let updated = 0;
    for (const l of rows) {
      const r = await tx.query(UPSERT, [
        who.orgId, buildingId, l.unit_label, l.beds, l.baths ?? null, l.sqft ?? null, l.rent_cents,
        l.available_on ?? null, l.specials ?? null, null, source, true, sample]);
      if (r.rows[0].inserted) created += 1; else updated += 1;
    }
    let deactivated = 0;
    if (replace && rows.length > 0) {
      const keep = rows.map((l) => String(l.unit_label).toLowerCase());
      const d = await tx.query(
        `UPDATE yd_listings SET active = false
          WHERE org_id = $1 AND building_id = $2 AND source = $3 AND active
            AND NOT (lower(unit_label) = ANY($4::text[]))`, [who.orgId, buildingId, source, keep]);
      deactivated = d.rowCount;
    }
    await recordEvent(tx, {
      orgId: who.orgId, name: "listings.imported", entityKind: "building", entityId: buildingId,
      payload: { format, created, updated, deactivated, errors: errors.length, skipped: (parsed.skipped || []).length },
      actor: actorOf(who)
    });
    return { created, updated, deactivated };
  });

  return {
    imported: out.created + out.updated, created: out.created, updated: out.updated, deactivated: out.deactivated,
    errors, skipped: parsed.skipped || []
  };
}

