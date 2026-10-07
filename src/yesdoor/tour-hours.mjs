// src/yesdoor/tour-hours.mjs — a building's tour hours (yd_buildings.tour_hours).
// Pure: no database, no clock.
//
// Shape (the seed data uses it): an object of day keys to a window or a list of
// windows, each "HH:MM-HH:MM" on a 24-hour clock in the building's own time zone.
//
//   { "mon-fri": "09:00-17:00", "sat": "10:00-16:00" }
//   { "mon-fri": ["09:00-12:00", "13:00-17:00"], "sun": "11:00-15:00" }
//
// A key is one day ("sat") or a range ("mon-fri", and "fri-mon" wraps over the
// weekend). Days that are not named are closed. An EMPTY object means the
// building has not told us its hours yet: any time is accepted (the booking still
// has to be in the future and not too far out).
//
//   parseTourHours(obj)          -> { ok, windows, errors }
//   tourFits({...})              -> { ok, reason }   does a tour of N minutes fit?

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WINDOW_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

const toMinutes = (h, m) => Number(h) * 60 + Number(m);

function daysOfKey(key) {
  const k = String(key).trim().toLowerCase();
  const parts = k.split("-").map((p) => p.trim());
  const idx = (d) => DAYS.indexOf(d.slice(0, 3));
  if (parts.length === 1) {
    const i = idx(parts[0]);
    return i === -1 ? null : [i];
  }
  if (parts.length === 2) {
    const a = idx(parts[0]); const b = idx(parts[1]);
    if (a === -1 || b === -1) return null;
    const out = [];
    for (let i = a; ; i = (i + 1) % 7) {
      out.push(i);
      if (i === b) break;
    }
    return out;
  }
  return null;
}

function parseWindow(text) {
  const m = WINDOW_RE.exec(String(text).trim());
  if (!m) return null;
  const open = toMinutes(m[1], m[2]); const close = toMinutes(m[3], m[4]);
  if (Number(m[1]) > 23 || Number(m[3]) > 24 || Number(m[2]) > 59 || Number(m[4]) > 59) return null;
  if (close <= open) return null;
  return { open, close };
}

/** Validate and normalise. `windows` is { 0..6: [{open, close}] } in minutes after midnight. */
export function parseTourHours(hours) {
  const windows = {};
  const errors = [];
  if (hours === null || hours === undefined) return { ok: true, windows, errors };
  if (typeof hours !== "object" || Array.isArray(hours)) {
    return { ok: false, windows, errors: ["Tour hours must be a list of days and times."] };
  }
  for (const [key, value] of Object.entries(hours)) {
    const days = daysOfKey(key);
    if (!days) { errors.push(`"${key}" is not a day or a range of days (use mon, tue, ... or mon-fri).`); continue; }
    const list = Array.isArray(value) ? value : [value];
    if (!list.length) { errors.push(`"${key}" has no hours.`); continue; }
    for (const w of list) {
      const win = parseWindow(w);
      if (!win) { errors.push(`"${key}": "${w}" is not a time window like 09:00-17:00.`); continue; }
      for (const d of days) (windows[d] ||= []).push(win);
    }
  }
  return { ok: errors.length === 0, windows, errors };
}

/** The day of the week (0 = Sunday) and minutes after midnight of `date` in a time zone. */
export function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = DAYS.indexOf(String(get("weekday")).toLowerCase().slice(0, 3));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * Does a tour starting at `startsAt` and lasting `minutes` sit wholly inside the
 * building's hours? `hours` is the raw tour_hours object.
 *   { ok: true }                      fits (or the building has no hours on file)
 *   { ok: false, reason: "closed" }   that day has no hours
 *   { ok: false, reason: "outside" }  the day is open but not at that time
 *   { ok: false, reason: "bad_hours" } the building's own hours do not parse
 */
export function tourFits({ startsAt, minutes, hours, timeZone }) {
  const parsed = parseTourHours(hours);
  if (!parsed.ok) return { ok: false, reason: "bad_hours" };
  if (Object.keys(parsed.windows).length === 0) return { ok: true, reason: null };
  const { day, minutes: start } = localParts(new Date(startsAt), timeZone);
  const today = parsed.windows[day];
  if (!today) return { ok: false, reason: "closed" };
  const end = start + minutes;
  const inside = today.some((w) => start >= w.open && end <= w.close);
  return inside ? { ok: true, reason: null } : { ok: false, reason: "outside" };
}

/** A person-readable line for the refusal. */
export function hoursSummary(hours) {
  const parsed = parseTourHours(hours);
  if (!parsed.ok || Object.keys(parsed.windows).length === 0) return "";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return Object.entries(parsed.windows)
    .map(([d, wins]) => `${names[d]} ${wins.map((w) => `${fmt(w.open)}-${fmt(w.close)}`).join(", ")}`)
    .join("; ");
}
