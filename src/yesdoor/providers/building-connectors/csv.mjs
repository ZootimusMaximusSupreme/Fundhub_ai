// building-connectors/csv.mjs — the building uploads a spreadsheet of units.
//
//   parseListingsCsv(text, { mapping, now }) -> { listings, errors, rowCount, columns }
//
// A bad row never sinks the file: every row that parses becomes a listing and
// every row that does not becomes an error with its row number (the header is
// row 1, so the first unit is row 2, as in a spreadsheet).
//
// Columns are found by name. The defaults accept the usual spellings ("Unit #",
// "Apt", "Bedrooms", "Monthly Rent", ...). `mapping` overrides them:
//   { unit_label: "Apt No.", rent: "Asking" }
// Fields: unit_label (required), rent (required, dollars) or rent_cents,
// beds, baths, sqft, available_on, specials.

import { dollarsToCents, isoFromParts, portalLeaseStatus, registrationEmail } from "./common.mjs";

export const PROVIDER = "csv";
export const SANDBOX = true;

export const FIELDS = Object.freeze(["unit_label", "rent", "rent_cents", "beds", "baths", "sqft", "available_on", "specials"]);

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES = {
  unit_label: ["unit", "unitlabel", "unitnumber", "unitno", "unitnum", "apt", "aptno", "aptnumber", "apartment", "apartmentnumber"],
  rent: ["rent", "price", "monthlyrent", "rentamount", "marketrent", "askingrent"],
  rent_cents: ["rentcents"],
  beds: ["beds", "bed", "bedrooms", "bedroom", "br", "bd"],
  baths: ["baths", "bath", "bathrooms", "bathroom", "ba"],
  sqft: ["sqft", "sf", "squarefeet", "squarefootage", "size"],
  available_on: ["available", "availableon", "availabledate", "dateavailable", "availability", "moveindate"],
  specials: ["specials", "special", "concession", "concessions", "promo", "promotion"]
};

/**
 * Minimal RFC 4180 reader: quoted fields, commas and line breaks inside quotes,
 * "" as an escaped quote, CRLF / LF / CR, a leading byte-order mark.
 * Blank lines are dropped. Returns { rows, unterminatedQuote }.
 */
export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let sawAny = false;

  const endCell = () => { row.push(cell); cell = ""; };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
    sawAny = false;
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") { inQuotes = true; sawAny = true; }
    else if (ch === ",") { endCell(); sawAny = true; }
    else if (ch === "\r") { if (src[i + 1] === "\n") i++; endRow(); }
    else if (ch === "\n") endRow();
    else { cell += ch; sawAny = true; }
  }
  if (sawAny || cell !== "" || row.length) endRow();
  return { rows, unterminatedQuote: inQuotes };
}

/** Find which column holds each field. Returns { index: {field: i}, columns: {field: headerText} }. */
function mapColumns(header, mapping) {
  const normalized = header.map(norm);
  const index = {};
  const columns = {};
  for (const field of FIELDS) {
    const wanted = mapping && mapping[field] !== undefined ? [norm(mapping[field])] : ALIASES[field];
    const at = normalized.findIndex((h) => h && wanted.includes(h));
    if (at !== -1) { index[field] = at; columns[field] = header[at].trim(); }
  }
  return { index, columns };
}

const parseBeds = (v) => {
  if (/^studio$/i.test(v)) return 0;
  const m = /^(\d{1,2})\s*(?:br|bd|bed|beds|bedroom|bedrooms)?$/i.exec(v);
  return m ? Number(m[1]) : undefined;
};
const parseBaths = (v) => {
  const m = /^(\d{1,2}(?:\.\d)?)\s*(?:ba|bath|baths|bathroom|bathrooms)?$/i.exec(v);
  return m ? Number(m[1]) : undefined;
};
const parseSqft = (v) => {
  const t = v.replace(/,/g, "").replace(/\s*(sq\.?\s*ft\.?|sf)$/i, "");
  return /^\d{2,5}$/.test(t) ? Number(t) : undefined;
};
function parseDate(v, now) {
  if (/^(now|immediate|immediately|available now)$/i.test(v)) return new Date(now).toISOString().slice(0, 10);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) return isoFromParts(m[1], m[2], m[3]) ?? undefined;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(v);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return isoFromParts(year, m[1], m[2]) ?? undefined;
  }
  return undefined;
}

export function parseListingsCsv(text, { mapping = null, now = new Date() } = {}) {
  const { rows, unterminatedQuote } = parseCsv(text);
  const fail = (message) => ({ listings: [], errors: [{ row: 1, field: null, message }], rowCount: 0, columns: {} });

  if (unterminatedQuote) return fail("The file has a quote that never closes. Check the last row you edited.");
  if (rows.length === 0) return fail("The file is empty.");

  const { index, columns } = mapColumns(rows[0], mapping);
  const missing = [];
  if (index.unit_label === undefined) missing.push("a unit column (for example \"Unit\")");
  if (index.rent === undefined && index.rent_cents === undefined) missing.push("a rent column (for example \"Rent\")");
  if (missing.length) {
    return { ...fail(`The file needs ${missing.join(" and ")}.`), columns };
  }

  const listings = [];
  const errors = [];
  const seen = new Set();
  const dataRows = rows.slice(1);

  dataRows.forEach((cells, i) => {
    const rowNo = i + 2;
    const get = (field) => (index[field] === undefined ? "" : String(cells[index[field]] ?? "").trim());
    const problems = [];
    const bad = (field, message) => problems.push({ row: rowNo, field, message });

    const unit = get("unit_label");
    if (!unit) bad("unit_label", "The unit is blank.");
    else if (seen.has(unit.toLowerCase())) bad("unit_label", `Unit ${unit} is already listed above.`);

    let rentCents = null;
    if (index.rent_cents !== undefined && get("rent_cents") !== "") {
      const n = Number(get("rent_cents").replace(/,/g, ""));
      if (Number.isInteger(n) && n > 0) rentCents = n; else bad("rent_cents", "The rent in cents is not a whole number.");
    } else {
      const raw = get("rent");
      if (raw === "") bad("rent", "The rent is blank.");
      else {
        rentCents = dollarsToCents(raw);
        if (rentCents === null || rentCents === 0) { rentCents = null; bad("rent", `"${raw}" is not a rent amount.`); }
      }
    }

    const optional = (field, parse, label) => {
      const raw = get(field);
      if (raw === "") return null;
      const v = parse(raw);
      if (v === undefined) { bad(field, `"${raw}" is not a valid ${label}.`); return null; }
      return v;
    };
    const beds = optional("beds", parseBeds, "number of bedrooms");
    const baths = optional("baths", parseBaths, "number of bathrooms");
    const sqft = optional("sqft", parseSqft, "square footage");
    const availableOn = optional("available_on", (v) => parseDate(v, now), "date (use 2026-11-01 or 11/1/2026)");
    const specials = get("specials") || null;

    if (problems.length) { errors.push(...problems); return; }
    seen.add(unit.toLowerCase());
    listings.push({
      unit_label: unit, beds, baths, sqft, rent_cents: rentCents,
      available_on: availableOn, specials, source: "csv"
    });
  });

  return { listings, errors, rowCount: dataRows.length, columns };
}

export async function listListings({ csvText, mapping = null, now = new Date() } = {}) {
  const { listings, errors } = parseListingsCsv(csvText, { mapping, now });
  return { listings, errors };
}

export async function pushGuestCard(ctx = {}) {
  return registrationEmail(ctx);
}

export async function getLeaseStatus() {
  return portalLeaseStatus();
}
