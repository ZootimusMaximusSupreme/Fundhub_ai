// Time-zone helpers for the marketing clock and the quiet hours. No dependency:
// Intl does the zone math. Arizona has no daylight saving, but the setting is a
// zone name, so this works for any zone.

const HM = /^(\d\d):(\d\d)$/;

export const minutesOfDay = (hhmm) => {
  const m = HM.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** { year, month, day, hour, minute, weekday (0 = Sunday), date: 'YYYY-MM-DD' } in the zone. */
export function localParts(date, timeZone) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), weekday: WEEKDAYS[p.weekday],
    date: `${p.year}-${p.month}-${p.day}`
  };
}

/** The UTC instant at which the zone's wall clock reads y-m-d hh:mm. */
export function zonedInstant({ year, month, day }, hhmm, timeZone) {
  const mins = minutesOfDay(hhmm);
  const want = Date.UTC(year, month - 1, day, Math.floor(mins / 60), mins % 60);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const lp = localParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute);
    guess -= asUtc - want;
  }
  return new Date(guess);
}

/** Is a minute-of-day inside [start, end)? start > end wraps midnight; start == end is never. */
export function inQuietHours(minute, start, end) {
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/**
 * When may a buzz queued at `now` go out? `now` itself when outside quiet hours,
 * otherwise the next time quiet hours end.
 */
export function nextSendTime(now, { quiet_start, quiet_end, timezone }) {
  const start = minutesOfDay(quiet_start);
  const end = minutesOfDay(quiet_end);
  if (start == null || end == null) return now;
  const lp = localParts(now, timezone);
  const minute = lp.hour * 60 + lp.minute;
  if (!inQuietHours(minute, start, end)) return now;
  const wrapsToTomorrow = start > end && minute >= start;
  const base = new Date(Date.UTC(lp.year, lp.month - 1, lp.day + (wrapsToTomorrow ? 1 : 0)));
  return zonedInstant(
    { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate() },
    quiet_end, timezone
  );
}
