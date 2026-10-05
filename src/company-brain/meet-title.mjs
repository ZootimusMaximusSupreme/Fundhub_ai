// Shared name rules for Meet recording + transcript files in Drive.

export function meetTitleStem(name) {
  return String(name || "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/\s*[-–—]\s*(gemini\s+)?(notes|transcript|recording|recap).*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function looksLikeTranscriptName(name) {
  return /\b(transcript|gemini\s+notes)\b/i.test(String(name || ""));
}

export function looksLikeRecordingMime(mimeType) {
  const mime = String(mimeType || "").trim().toLowerCase();
  return mime.startsWith("video/") || mime.startsWith("audio/");
}

/** Google Meet file names only. Course / VSL / Screen Recording do not match. */
export function looksLikeMeetRecordingName(name) {
  const n = String(name || "");
  if (/screen[- ]?record/i.test(n)) return false;
  return /(google\s+)?meet(ing)?\s+recording|\bgoogle\s+meet\b|\bgmt\d{8}\b/i.test(n);
}

/**
 * meetStartFromName(name) → ISO string | null
 * The meeting start time written in a Meet / Zoom file name:
 *   "Funding Call - Jane Doe (2026-08-24 15:00 GMT-7) - Recording.mp4"
 *   "Funding Call (2026-08-24 at 15:00 GMT-07:00)"
 *   "GMT20260824-150000_Recording.mp4" (UTC)
 * Any other shape → null. Never guesses a time zone.
 */
export function meetStartFromName(name) {
  const n = String(name || "");
  const gmt = /(\d{4})-(\d{2})-(\d{2})\s+(?:at\s+)?(\d{1,2}):(\d{2})\s+GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?/i.exec(n);
  if (gmt) {
    const [, y, mo, d, h, mi, sign, oh, om] = gmt;
    const offsetMin = sign ? (sign === "-" ? -1 : 1) * (Number(oh) * 60 + Number(om || 0)) : 0;
    const t = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) - offsetMin * 60_000);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
  }
  const zoom = /\bGMT(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(n);
  if (zoom) {
    const [, y, mo, d, h, mi, s] = zoom;
    const t = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
  }
  return null;
}

const SALES_MEETING = /\b(funding call|strategy|sales|discovery|closing|closer|consult(?:ation)?)\b/i;
const CSM_MEETING = /\b(check[- ]?in|onboarding|kick[- ]?off|interview|csm|success|docs? chase|document chase)\b/i;

/**
 * meetKindFromName(name) → 'sales' | 'csm' | null
 * Which kind of meeting the file name says it was. Both or neither → null.
 */
export function meetKindFromName(name) {
  const n = String(name || "");
  const sales = SALES_MEETING.test(n);
  const csm = CSM_MEETING.test(n);
  if (sales && !csm) return "sales";
  if (csm && !sales) return "csm";
  return null;
}
