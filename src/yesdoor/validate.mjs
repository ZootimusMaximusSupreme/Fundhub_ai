// src/yesdoor/validate.mjs — read a request body field by field, or refuse with a
// plain-English 400. Pure: no database, no clock (callers pass `now`).
//
// Every reader takes the body object, the key, and a label (the words a person
// would use for it). Optional readers return `undefined` when the key is absent
// and `null` when it is present but empty, so a caller can tell "not sent" from
// "cleared". Nothing here guesses: a value that is the wrong shape is a 400, not
// a coerced default.

import { YdError, isUuid } from "./http.mjs";
import { YD_MONEY } from "./config.mjs";

const fail = (code, message) => new YdError(400, code, message);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The JSON body as a plain object, or a 400. */
export function bodyOf(req) {
  let b = req?.body;
  if (typeof b === "string") {
    try { b = JSON.parse(b); } catch { throw fail("invalid_body", "The request body is not valid JSON."); }
  }
  if (b === undefined || b === null) return {};
  if (typeof b !== "object" || Array.isArray(b)) throw fail("invalid_body", "The request body must be a JSON object.");
  return b;
}

const present = (body, key) => Object.hasOwn(body, key) && body[key] !== undefined;
const blank = (v) => v === null || (typeof v === "string" && v.trim() === "");

export function reqString(body, key, label = key, { max = 200 } = {}) {
  const v = body[key];
  if (typeof v !== "string" || v.trim() === "") throw fail(`${key}_required`, `Add ${label}.`);
  const t = v.trim();
  if (t.length > max) throw fail("too_long", `${label} is too long (most ${max} characters).`);
  return t;
}

export function optString(body, key, label = key, { max = 200 } = {}) {
  if (!present(body, key)) return undefined;
  if (blank(body[key])) return null;
  if (typeof body[key] !== "string") throw fail("invalid_parameter", `${label} must be text.`);
  const t = body[key].trim();
  if (t.length > max) throw fail("too_long", `${label} is too long (most ${max} characters).`);
  return t;
}

export function longText(body, key, label = key) {
  return optString(body, key, label, { max: YD_MONEY.maxTextChars });
}

export function reqUuid(body, key, label = key) {
  const v = body[key];
  if (typeof v !== "string" || v === "") throw fail(`${key}_required`, `Add ${label}.`);
  if (!isUuid(v)) throw fail("invalid_parameter", `${label} is not a valid id.`);
  return v;
}

export function optUuid(body, key, label = key) {
  if (!present(body, key)) return undefined;
  if (blank(body[key])) return null;
  if (!isUuid(body[key])) throw fail("invalid_parameter", `${label} is not a valid id.`);
  return body[key];
}

export function optBool(body, key, label = key) {
  if (!present(body, key)) return undefined;
  if (typeof body[key] !== "boolean") throw fail("invalid_parameter", `${label} must be true or false.`);
  return body[key];
}

/** A whole number (JSON number only: "12" is refused, so a typo cannot slip through). */
export function optInt(body, key, label = key, { min = -Infinity, max = Infinity } = {}) {
  if (!present(body, key)) return undefined;
  if (body[key] === null) return null;
  const n = body[key];
  if (typeof n !== "number" || !Number.isInteger(n)) throw fail("invalid_parameter", `${label} must be a whole number.`);
  if (n < min || n > max) throw fail("invalid_parameter", `${label} must be between ${min} and ${max}.`);
  return n;
}

export function reqInt(body, key, label = key, opts = {}) {
  const v = optInt(body, key, label, opts);
  if (v === undefined || v === null) throw fail(`${key}_required`, `Add ${label}.`);
  return v;
}

/** A finite number (decimals allowed). */
export function optNumber(body, key, label = key, { min = -Infinity, max = Infinity } = {}) {
  if (!present(body, key)) return undefined;
  if (body[key] === null) return null;
  const n = body[key];
  if (typeof n !== "number" || !Number.isFinite(n)) throw fail("invalid_parameter", `${label} must be a number.`);
  if (n < min || n > max) throw fail("invalid_parameter", `${label} must be between ${min} and ${max}.`);
  return n;
}

export function optEnum(body, key, allowed, label = key) {
  if (!present(body, key)) return undefined;
  if (blank(body[key])) return null;
  if (!allowed.includes(body[key])) throw fail("invalid_parameter", `${label} must be one of: ${allowed.join(", ")}.`);
  return body[key];
}

export function reqEnum(body, key, allowed, label = key) {
  const v = optEnum(body, key, allowed, label);
  if (v === undefined || v === null) throw fail(`${key}_required`, `Choose ${label}: ${allowed.join(", ")}.`);
  return v;
}

export function emailOf(value, label = "the email address") {
  const t = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!t || !EMAIL_RE.test(t)) throw fail("invalid_email", `${label} does not look right.`);
  return t;
}

export function optEmail(body, key, label = "the email address") {
  if (!present(body, key)) return undefined;
  if (blank(body[key])) return null;
  return emailOf(body[key], label);
}

/** A real calendar date, YYYY-MM-DD. Returns the same text. */
export function dateOnly(value, label = "the date") {
  const m = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim()) : null;
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && y >= 1900 && y <= 2200) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
  }
  throw fail("invalid_date", `${label} must be a real date like 2026-11-01.`);
}

export function optDateOnly(body, key, label = key) {
  if (!present(body, key)) return undefined;
  if (blank(body[key])) return null;
  return dateOnly(body[key], label);
}

/** A moment in time (ISO text). Returns a Date. */
export function timestampOf(value, label = "the time") {
  if (typeof value !== "string" || value.trim() === "") throw fail("invalid_time", `${label} is missing.`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw fail("invalid_time", `${label} is not a valid date and time.`);
  return d;
}

/** A 2-letter US state code, upper-cased. */
export function stateCode(value, label = "the state") {
  const t = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(t)) throw fail("invalid_state", `${label} must be a 2-letter state code like AZ.`);
  return t;
}

export function optStateCode(body, key, label = "the state") {
  if (!present(body, key)) return undefined;
  if (blank(body[key])) return null;
  return stateCode(body[key], label);
}
