// Field checks for the $297 pull form (identity, home address, businesses).
//
// Spec: docs/specs/roadmap-checkout-soft-pull-2026-09-22.md §2-§3, READ WITH
// ITS "Independent check" SECTION, which corrects the draft:
//
//   * No age rule (owner-set 2026-09-22): the 18+ check the draft asked for
//     is gone. A birth date only has to be a real date, 1900 or later, not in
//     the future.
//   * An SSN starting 666 is NOT blocked. Every CRS sandbox person uses 666,
//     and blocking it breaks vendor test runs. Only the parts of an SSN that
//     are never issued (000 area, 00 group, 0000 serial) are refused.
//   * A P.O. box is a WARNING, not a block. The source is a TransUnion guide,
//     not CRS, and it does not name P.O. boxes.
//   * The length caps (first 20, middle 15, last 32, street 48, city 28) come
//     from the public "basic" endpoints. The Standard Format endpoints we call
//     publish no limits, so these are ASSUMED caps, kept because a name or a
//     street longer than them is almost certainly a typo.
//
// Every check returns { value } or { error: { field, code, message } }.
// Messages are plain words the buyer reads next to the field.
//
// Pure. No database, no clock except the one passed in.

export const MAX_FIRST = 20;
export const MAX_MIDDLE = 15;
export const MAX_LAST = 32;
export const MAX_STREET = 48;
export const MAX_APT = 10;
export const MAX_CITY = 28;

/** The suffixes the form may store (migration 387 CHECK). */
export const SUFFIXES = Object.freeze(["JR", "SR", "II", "III", "IV"]);

/** 50 states, DC, the inhabited territories, and the three military codes. */
export const US_STATES = Object.freeze([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "PR", "VI", "GU", "AS", "MP", "AA", "AE", "AP"
]);

const STATE_SET = new Set(US_STATES);

export function fieldError(field, code, message) {
  return { error: { field, code, message } };
}

export function str(v) {
  return v == null ? "" : String(v);
}

/** Trim and squeeze runs of spaces to one. */
export function squeeze(v) {
  return str(v).replace(/\s+/g, " ").trim();
}

/** José → Jose. Curly apostrophes become straight ones. */
export function stripAccents(v) {
  return str(v)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[‘’ʼ]/g, "'");
}

export function isChecked(v) {
  return v === true || v === "true" || v === "on" || v === "1" || v === 1 || v === "yes";
}

/* A legal name part: letters, space, dash, apostrophe. Periods are dropped
   ("J." → "J", "St. John" → "St John") because a bureau matches on letters. */
function namePart(raw, { field, label, max, required }) {
  const typed = squeeze(str(raw).replace(/\./g, " "));
  if (!typed) {
    return required
      ? fieldError(field, `${field}_required`, `Please enter ${label}.`)
      : { value: null };
  }
  const plain = stripAccents(typed);
  if (/\d/.test(plain)) {
    return fieldError(field, `${field}_invalid`, "Names cannot have numbers in them.");
  }
  if (!/^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(plain)) {
    return fieldError(field, `${field}_invalid`,
      "Use only the letters on your Social Security card. Spaces, dashes and apostrophes are fine.");
  }
  if (plain.length > max) {
    return fieldError(field, `${field}_too_long`, `Keep this to ${max} letters or fewer.`);
  }
  return { value: typed.replace(/[‘’ʼ]/g, "'") };
}

export function checkFirstName(raw) {
  return namePart(raw, { field: "first_name", label: "your legal first name", max: MAX_FIRST, required: true });
}

export function checkLastName(raw) {
  return namePart(raw, { field: "last_name", label: "your legal last name", max: MAX_LAST, required: true });
}

export function checkMiddleName(raw) {
  return namePart(raw, { field: "middle_name", label: "your middle name", max: MAX_MIDDLE, required: false });
}

/** "Jr." / "jr" / "JR" → "JR". Blank → null. Anything off the list → error. */
export function checkSuffix(raw) {
  const s = squeeze(raw).replace(/\./g, "").toUpperCase();
  if (!s) return { value: null };
  if (!SUFFIXES.includes(s)) {
    return fieldError("suffix", "suffix_invalid", "Pick Jr, Sr, II, III or IV, or leave it blank.");
  }
  return { value: s };
}

function utcDay(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/**
 * Date of birth: YYYY-MM-DD (the date picker) or MM/DD/YYYY (typed).
 * A real calendar date, 1900 or later, not in the future. No age rule
 * (owner-set 2026-09-22).
 */
export function checkDob(raw, { now = new Date() } = {}) {
  const s = squeeze(raw);
  if (!s) return fieldError("dob", "dob_required", "Please enter your date of birth.");
  let y; let m; let d;
  let hit = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (hit) { [, y, m, d] = hit.map(Number); }
  else if ((hit = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    m = Number(hit[1]); d = Number(hit[2]); y = Number(hit[3]);
  } else {
    return fieldError("dob", "dob_invalid", "Enter your date of birth as MM/DD/YYYY.");
  }
  const birth = utcDay(y, m, d);
  if (!birth || y < 1900) {
    return fieldError("dob", "dob_invalid", "That date is not a real date. Please check it.");
  }
  const today = utcDay(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  if (birth.getTime() > today.getTime()) {
    return fieldError("dob", "dob_invalid", "That date is in the future. Please check it.");
  }
  return { value: `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

/**
 * SSN: 9 digits. Refuses only what is never issued: a 000 area, a 00 group, a
 * 0000 serial. 666 and 9xx are NOT refused here (see header).
 */
export function checkSsn(raw) {
  const digits = str(raw).replace(/\D/g, "");
  if (!digits) return fieldError("ssn", "ssn_required", "Please enter your Social Security number.");
  if (digits.length !== 9) {
    return fieldError("ssn", "ssn_invalid", "A Social Security number has 9 digits. Please check it.");
  }
  if (digits.slice(0, 3) === "000" || digits.slice(3, 5) === "00" || digits.slice(5) === "0000") {
    return fieldError("ssn", "ssn_invalid", "That number is not valid. Please check it.");
  }
  return { value: digits };
}

const PO_BOX = /\b(?:p\s*\.?\s*o\s*\.?\s*box|post\s+office\s+box|pob\s+\d)/i;

export const MIN_STREET = 3;

/* THE STREET RULE (2026-09-22 review). Required, 3 to 48 characters, and at
   least one digit SOMEWHERE. It used to demand a digit FIRST, which refused
   real homes: military mail (PSC 1234 Box 5678, Unit 2050 Box 4190, CMR 480
   Box 123), Puerto Rico (Calle Luna 55, Urb ...), and Wisconsin grid
   addresses (N7450 Aanstad Rd). A P.O. box stays a warning only. */

/* Apartment / unit, as a bureau reads it: capitals, periods dropped, and the
   space after a # closed up. "Apt. 4B" -> "APT 4B", "Ste. 200" -> "STE 200",
   "# 12" -> "#12". The 10-character cap is checked AFTER this. */
export function normalizeApt(raw) {
  return squeeze(str(raw).replace(/\./g, " ")).toUpperCase().replace(/#\s+/g, "#");
}

export function isPoBox(line) {
  return PO_BOX.test(str(line));
}

/**
 * One address: street, optional apt/unit, city, state, ZIP.
 * `prefix` names the fields: "" for home ("address", "apt", "city", ...),
 * "prev_" for the previous address, "businesses.0." for a business.
 *
 * Returns { value: {addressLine1, addressLine2, city, state, postalCode},
 *           errors: [...], warnings: [...] }.
 */
export function checkAddress(input = {}, { prefix = "", streetKey = "address", aptKey = "apt", who = "your" } = {}) {
  const errors = [];
  const warnings = [];
  const f = (k) => `${prefix}${k}`;

  const street = squeeze(input[streetKey]);
  const apt = normalizeApt(input[aptKey]);
  const city = squeeze(input.city);
  const state = squeeze(input.state).toUpperCase();
  const zipRaw = squeeze(input.zip);

  if (!street) {
    errors.push({ field: f(streetKey), code: "street_required", message: `Please enter ${who} street address.` });
  } else if (street.length > MAX_STREET) {
    errors.push({ field: f(streetKey), code: "street_too_long", message: `Keep the street to ${MAX_STREET} characters or fewer. Put the apartment in its own box.` });
  } else if (street.length < MIN_STREET) {
    errors.push({ field: f(streetKey), code: "street_too_short", message: "Please enter the full street address, like 123 Main St." });
  } else if (!/\d/.test(street)) {
    errors.push({ field: f(streetKey), code: "street_number", message: "Include the house or box number, like 123 Main St." });
  } else if (isPoBox(street)) {
    warnings.push({ field: f(streetKey), code: "po_box",
      message: "A P.O. box can stop a bureau from finding the file. Use the street address if you have one." });
  }

  if (apt && !/^[A-Z0-9#][A-Z0-9 #/-]*$/.test(apt)) {
    errors.push({ field: f(aptKey), code: "apt_invalid", message: "Use letters, numbers, spaces, # or - only, like Apt 4B or #12." });
  } else if (apt.length > MAX_APT) {
    errors.push({ field: f(aptKey), code: "apt_invalid", message: `Keep the apartment or unit to ${MAX_APT} characters or fewer, like Apt 4B.` });
  }

  const cityPlain = stripAccents(city);
  if (!city) {
    errors.push({ field: f("city"), code: "city_required", message: `Please enter ${who} city.` });
  } else if (!/^[A-Za-z][A-Za-z .'-]*$/.test(cityPlain) || cityPlain.length > MAX_CITY) {
    errors.push({ field: f("city"), code: "city_invalid", message: "Use the city name only, in letters." });
  }

  if (!state) {
    errors.push({ field: f("state"), code: "state_required", message: `Please pick ${who} state.` });
  } else if (!STATE_SET.has(state)) {
    errors.push({ field: f("state"), code: "state_invalid", message: "Pick the state from the list." });
  }

  let postalCode = "";
  if (!zipRaw) {
    errors.push({ field: f("zip"), code: "zip_required", message: `Please enter ${who} ZIP code.` });
  } else if (!/^\d{5}(?:[-\s]?\d{4})?$/.test(zipRaw)) {
    errors.push({ field: f("zip"), code: "zip_invalid", message: "A ZIP code is 5 digits, like 90210." });
  } else {
    postalCode = zipRaw.replace(/\D/g, "");
  }

  return {
    value: {
      addressLine1: street,
      addressLine2: apt,
      city,
      state,
      postalCode
    },
    errors,
    warnings
  };
}
