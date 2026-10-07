// src/yesdoor/util.mjs — small pure helpers shared by the matcher, the schedule
// and the providers. No database, no network, no clock (callers pass `now`).

export const DAY_MS = 86_400_000;

/** Date | ISO string | epoch ms -> Date, or null when missing or invalid. */
export function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(date, days) {
  return new Date(toDate(date).getTime() + days * DAY_MS);
}

/** Calendar months in UTC. Jan 31 + 1 month = Feb 28 (or 29), never March. */
export function addMonths(date, months) {
  const d = toDate(date);
  const day = d.getUTCDate();
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

/** The moment `years` years before `now`. Something dated after this is inside the window. */
export function yearsBack(now, years) {
  return addMonths(now, -Math.round(Number(years) * 12));
}

/** Whole days from a to b (negative when b is earlier). */
export function wholeDaysBetween(a, b) {
  return Math.floor((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);
}

/** Integer ceiling division for non-negative integers (no float drift at a boundary). */
export function ceilDiv(a, b) {
  return Math.floor((a + b - 1) / b);
}

/** A finite number, or null. Accepts numeric strings (Postgres numeric comes back as text). */
export function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 155000 -> "$1,550". Whole dollars; cents shown only when not whole. */
export function dollars(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const rem = abs % 100;
  const text = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${text}${rem ? "." + String(rem).padStart(2, "0") : ""}`;
}

export function isoDate(date) {
  const d = toDate(date);
  return d ? d.toISOString().slice(0, 10) : null;
}
