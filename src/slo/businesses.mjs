// Businesses on the $297 pull form, and the three helpers the staff approve
// form shares with it.
//
// normalizeSoftPullEin / parseIncorporatedDate / ageMonthsFromIncorporated
// used to live in api/soft-pull-approve.mjs. src/ does not import from api/,
// so they moved here and that file re-exports them unchanged.
//
// ROWS. One `businesses` row per business, entity_data.source = 'slo'. The
// staff approve path deletes only its own rows (source 'soft_pull_approve'),
// so the two forms never erase each other's businesses. Keys match what the
// readers already read: entity_data.state (src/lenders/match.mjs) and
// entity_data.incorporated_date (src/sales/closer-deck.mjs).
//
// Spec §2 per business: legal name, street, city, state, ZIP (same checks as
// home), EIN 9 digits (optional here), business phone 10 digits (optional),
// month and year started (required, not in the future).

import { withTransaction } from "../db/with-transaction.mjs";
import { SLO_MAX_BUSINESSES } from "../finance/slo-business-pricing.mjs";
import { checkAddress, squeeze, stripAccents, str } from "./fields.mjs";

export const SLO_BUSINESS_SOURCE = "slo";
export const MAX_BUSINESS_NAME = 100;

/** Store EIN as XX-XXXXXXX. Accepts 9 digits or XX-XXXXXXX. */
export function normalizeSoftPullEin(raw) {
  const digits = String(raw == null ? "" : raw).replace(/\D/g, "");
  if (digits.length !== 9) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/** YYYY-MM or YYYY-MM-DD. No invented day. Invalid or empty → null. */
export function parseIncorporatedDate(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (/^\d{4}-\d{2}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(5, 7));
    if (y < 1800 || y > 2100 || m < 1 || m > 12) return null;
    return s;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(5, 7));
    const d = Number(s.slice(8, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (
      dt.getUTCFullYear() !== y
      || dt.getUTCMonth() + 1 !== m
      || dt.getUTCDate() !== d
      || y < 1800
      || y > 2100
    ) {
      return null;
    }
    return s;
  }
  return null;
}

/** Months from the stored date to `now`. Future or bad date → null. No default age. */
export function ageMonthsFromIncorporated(raw, now = new Date()) {
  const parsed = parseIncorporatedDate(raw);
  if (!parsed) return null;
  const y = Number(parsed.slice(0, 4));
  const m = Number(parsed.slice(5, 7));
  const day = parsed.length >= 10 ? Number(parsed.slice(8, 10)) : 1;
  const months =
    (now.getUTCFullYear() - y) * 12
    + (now.getUTCMonth() + 1 - m)
    - (now.getUTCDate() < day ? 1 : 0);
  if (!Number.isFinite(months) || months < 0) return null;
  return months;
}

/** "MM/YYYY", "M/YYYY" or "YYYY-MM" → "YYYY-MM". Anything else → null. */
export function monthYear(raw) {
  const s = squeeze(raw);
  let hit = s.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
  if (hit) return parseIncorporatedDate(`${hit[2]}-${hit[1].padStart(2, "0")}`);
  hit = s.match(/^(\d{4})-(\d{2})$/);
  if (hit) return parseIncorporatedDate(s);
  return null;
}

/** 10 digits. A leading US 1 on an 11-digit number is dropped. */
export function businessPhone(raw) {
  let digits = str(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}

function isBlankRow(row) {
  return ["name", "address", "apt", "city", "state", "zip", "ein", "phone", "started"]
    .every((k) => !squeeze(row?.[k]));
}

/**
 * parseSloBusinesses — 0 to 20 businesses off the pull form body.
 *
 * Returns { businesses, errors, warnings }. Errors name the field as
 * "businesses.<i>.<key>" so the page can put the message under the box.
 * A row with every box empty is skipped, not refused.
 */
export function parseSloBusinesses(raw, { now = new Date() } = {}) {
  const errors = [];
  const warnings = [];
  if (raw == null || raw === "") return { businesses: [], errors, warnings };
  if (!Array.isArray(raw)) {
    errors.push({ field: "businesses", code: "businesses_invalid", message: "Businesses must be a list." });
    return { businesses: [], errors, warnings };
  }
  const rows = raw.filter((row) => !isBlankRow(row));
  if (rows.length > SLO_MAX_BUSINESSES) {
    errors.push({
      field: "businesses",
      code: "businesses_max",
      message: `You can add up to ${SLO_MAX_BUSINESSES} businesses.`
    });
    return { businesses: [], errors, warnings };
  }

  const businesses = [];
  rows.forEach((row, i) => {
    const p = `businesses.${i}.`;
    const rowErrors = [];

    const name = squeeze(row.name);
    const letters = stripAccents(name).replace(/[^A-Za-z]/g, "");
    if (!name) {
      rowErrors.push({ field: `${p}name`, code: "business_name_required", message: "Please enter the legal business name." });
    } else if (letters.length < 2 || name.length > MAX_BUSINESS_NAME) {
      rowErrors.push({ field: `${p}name`, code: "business_name_invalid", message: "Use the name as filed with the state." });
    }

    const addr = checkAddress(row, { prefix: p, who: "the business" });
    rowErrors.push(...addr.errors);
    warnings.push(...addr.warnings);

    let ein = null;
    if (squeeze(row.ein)) {
      ein = normalizeSoftPullEin(row.ein);
      if (!ein) {
        rowErrors.push({ field: `${p}ein`, code: "business_ein_invalid", message: "An EIN has 9 digits, like 12-3456789." });
      }
    }

    let phone = null;
    if (squeeze(row.phone)) {
      phone = businessPhone(row.phone);
      if (!phone) {
        rowErrors.push({ field: `${p}phone`, code: "business_phone_invalid", message: "Use a 10-digit phone number." });
      }
    }

    const started = monthYear(row.started);
    let ageMonths = null;
    if (!squeeze(row.started)) {
      rowErrors.push({ field: `${p}started`, code: "business_started_required", message: "Please enter the month and year it started, like 03/2021." });
    } else if (!started) {
      rowErrors.push({ field: `${p}started`, code: "business_started_invalid", message: "Use month and year, like 03/2021." });
    } else {
      ageMonths = ageMonthsFromIncorporated(started, now);
      if (ageMonths == null) {
        rowErrors.push({ field: `${p}started`, code: "business_started_future", message: "That date is in the future. Please check it." });
      }
    }

    errors.push(...rowErrors);
    if (rowErrors.length) return;
    businesses.push({
      name,
      address_line1: addr.value.addressLine1,
      address_line2: addr.value.addressLine2 || null,
      city: addr.value.city,
      state: addr.value.state,
      postal_code: addr.value.postalCode,
      ein,
      phone,
      incorporated_date: started,
      age_months: ageMonths
    });
  });

  return { businesses: errors.length ? [] : businesses, errors, warnings };
}

/** Replace this client's SLO business rows in one transaction. */
export async function replaceSloBusinesses(database, { orgId, clientId, businesses = [] }) {
  return withTransaction(database, async (tx) => {
    await tx.query(
      `DELETE FROM businesses
        WHERE org_id = $1 AND client_id = $2
          AND COALESCE(entity_data->>'source', '') = $3`,
      [orgId, clientId, SLO_BUSINESS_SOURCE]
    );
    for (const b of businesses) {
      await tx.query(
        `INSERT INTO businesses (org_id, client_id, name, age_months, entity_data)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          orgId,
          clientId,
          b.name,
          b.age_months,
          JSON.stringify({
            source: SLO_BUSINESS_SOURCE,
            address_line1: b.address_line1,
            address_line2: b.address_line2 || null,
            city: b.city,
            state: b.state,
            postal_code: b.postal_code,
            ein: b.ein || null,
            phone: b.phone || null,
            incorporated_date: b.incorporated_date || null
          })
        ]
      );
    }
    return businesses.length;
  });
}
