// kind "track" on POST /api/public/slo-interest — one funnel event, saved to
// our own events table.
//
// Contract: docs/tracking/tracking-spec.md. Read it before changing anything
// here; the shared browser tracker and every page hook follow the same file.
//
// What this saves: an events row named funnel.<event> carrying the page, the
// funnel and step worked out from the page (src/funnel/pages.mjs), the session,
// the per-session counter seq, the event, its allow-listed props, the UTMs, and
// whether a person or an agent sent it (src/slo/visitor.mjs).
//
// What this never saves: a typed value of any kind. The browser sends a form
// field's NAME only. A prop whose key names a sensitive field, or whose value
// looks like one (a long run of digits, a date, an email), is dropped here
// even if the browser sent it.
//
// It does not fan out to Inngest, create a client, or send anything.

import { db as defaultDb } from "../db.mjs";
import { defaultOrgId, emit } from "../events/bus.mjs";
import { pickAttribution } from "../ads/attribution-keys.mjs";
import { classifyVisitor } from "../slo/visitor.mjs";
import { funnelFor } from "./pages.mjs";

// Same session rule as api/public/slo-interest.mjs (sessionStorage.fh_sid).
const SESSION = /^[A-Za-z0-9_-]{8,80}$/;
export const MAX_SEQ = 100000;
export const MAX_TRACK_PER_SESSION = 500;
const MAX_SECONDS = 24 * 60 * 60;

// ── props allow-list ─────────────────────────────────────────────────────────
//
// One entry per event in the spec's Events table, and the props that event may
// carry. Anything not listed is dropped. Strings are slugged or clipped;
// numbers are clamped into the range given.

const slug = (max) => ({ type: "slug", max });
const text = (max) => ({ type: "text", max });
const path = (max) => ({ type: "path", max });
const int = (min, max) => ({ type: "number", min, max, int: true });
const dec = (min, max) => ({ type: "number", min, max, int: false });
const oneOf = (...values) => ({ type: "enum", values });

const SECONDS = int(0, MAX_SECONDS);
const PERCENT = int(0, 100);
const FORM = slug(40);
const FIELD = slug(64);
const CALENDAR = { calendar: slug(64) };

export const TRACK_EVENTS = Object.freeze({
  page_view: { title: text(120) },
  time_on_page: { seconds: SECONDS },
  exit: { seconds: SECONDS, max_scroll: PERCENT },
  click: {
    element_id: slug(64),
    label: slug(64),
    href_path: path(200),
    y_px: int(0, 200000),
    y_pct: PERCENT,
    section: slug(64),
    nth: int(0, 10000),
  },
  video: {
    video: slug(64),
    action: oneOf("play", "pause", "unmute", "mute", "progress"),
    pct: PERCENT,
    current_s: dec(0, MAX_SECONDS),
    duration_s: dec(0, MAX_SECONDS),
  },
  scroll: { depth: PERCENT },
  section_view: { section: slug(64) },
  carousel: { carousel: slug(64), action: oneOf("next", "prev", "play"), index: int(0, 1000) },
  faq_open: { question: slug(80) },
  survey_answer: { survey: slug(40), step_num: int(0, 100), question_id: slug(64) },
  survey_route: { survey: slug(40), offer: slug(40) },
  buybox_tab: { tab: int(1, 3) },
  field_focus: { form: FORM, field: FIELD },
  field_complete: { form: FORM, field: FIELD },
  continue: { step: int(0, 20) },
  validation_error: { form: FORM, field: FIELD, code: slug(40) },
  payment_attempt: { amount_cents: int(0, 10_000_000) },
  payment_result: { result: oneOf("success", "fail"), code: slug(40) },
  softpull_submit: { businesses: int(0, 50) },
  calendar_view: CALENDAR,
  time_selected: CALENDAR,
  booking_confirmed: CALENDAR,
});

// ── sensitive values ─────────────────────────────────────────────────────────
//
// A prop KEY made of any of these words names a field value we never keep
// (checked word by word on "_"), so it is dropped even if a later edit puts it
// on the allow-list above. A `field` prop whose VALUE is "ssn" is fine: that is
// the field's name, which is exactly what the browser is meant to send.

const SENSITIVE_KEY_WORDS = new Set([
  "ssn", "social", "dob", "birth", "birthday", "birthdate",
  "card", "cardnumber", "ccn", "cc", "cvv", "cvc", "expiry", "expiration",
  "account", "routing", "password", "passcode", "pin", "secret", "token",
  "tin", "ein", "taxid", "email", "phone", "mobile",
  "address", "street", "zip", "postal",
  "name", "firstname", "lastname", "fullname",
  "value", "answer", "text", "typed", "input",
]);

export function isSensitiveKey(key) {
  return String(key).toLowerCase().split(/[_\W]+/).some((w) => SENSITIVE_KEY_WORDS.has(w));
}

const DATE_SEPARATED = /\b\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}\b|\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/;
const DATE_COMPACT = /(^|\D)((19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])|(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(19|20)\d{2})(\D|$)/;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

/**
 * True when a raw prop value looks like a field value we never keep:
 * nine or more digits once spaces, dashes, dots, slashes, brackets and "+" are
 * taken out (Social Security number, card, phone, account number), a date
 * (date of birth), or an email address. A plain number is checked by size:
 * nine or more whole digits.
 */
export function looksSensitiveValue(v) {
  if (typeof v === "number") return Number.isFinite(v) && Math.abs(Math.trunc(v)) >= 100_000_000;
  if (typeof v !== "string") return false;
  if (/\d{9,}/.test(v.replace(/[\s().\/+-]/g, ""))) return true;
  if (DATE_SEPARATED.test(v) || DATE_COMPACT.test(v)) return true;
  return EMAIL_LIKE.test(v);
}

// ── clean one value ──────────────────────────────────────────────────────────

function cleanSlug(v, max) {
  return String(v).trim().toLowerCase()
    .replace(/[^a-z0-9_:.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

function cleanText(v, max) {
  return String(v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/** The path of a link, never its query or anchor. A full URL keeps only its path. */
function cleanPath(v, max) {
  let s = String(v).trim();
  if (/^https?:\/\//i.test(s)) {
    try { s = new URL(s).pathname; } catch { return ""; }
  }
  s = s.split(/[?#]/)[0];
  if (!s.startsWith("/")) return "";
  return s.toLowerCase().replace(/[^a-z0-9/_.~-]+/g, "-").slice(0, max);
}

function cleanNumber(v, { min, max, int: whole }) {
  let n;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && /^\s*-?\d{1,12}(\.\d{1,6})?\s*$/.test(v)) n = Number(v);
  else return undefined;
  if (!Number.isFinite(n)) return undefined;
  n = Math.min(max, Math.max(min, n));
  return whole ? Math.round(n) : Math.round(n * 100) / 100;
}

function cleanValue(v, spec) {
  if (spec.type === "number") return cleanNumber(v, spec);
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  if (spec.type === "enum") {
    const s = String(v).trim().toLowerCase();
    return spec.values.includes(s) ? s : undefined;
  }
  const out = spec.type === "slug" ? cleanSlug(v, spec.max)
    : spec.type === "path" ? cleanPath(v, spec.max)
    : cleanText(v, spec.max);
  return out || undefined;
}

/**
 * The props one event may keep: allow-listed keys only, no sensitive key, no
 * sensitive-looking value, every value cleaned. Always a plain object.
 */
export function cleanProps(event, raw) {
  const allowed = Object.hasOwn(TRACK_EVENTS, event) ? TRACK_EVENTS[event] : null;
  const out = {};
  if (!allowed || !raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, spec] of Object.entries(allowed)) {
    if (!Object.hasOwn(raw, key) || isSensitiveKey(key)) continue;
    const v = raw[key];
    // A link keeps only its path, so only the path is checked: a query string
    // carrying a long ad id must not cost the whole prop.
    const kept = spec.type === "path" && typeof v === "string" ? v.split(/[?#]/)[0] : v;
    if (looksSensitiveValue(kept)) continue;
    const clean = cleanValue(v, spec);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

// ── names and keys ───────────────────────────────────────────────────────────

/** page_view and click keep their old row names so today's counts still work. */
export function trackEventName(event) {
  if (event === "page_view") return "funnel.page";
  if (event === "click") return "funnel.click";
  return `funnel.${event}`;
}

/**
 * page_view: once per session per page (the old kind "page" key, so the two
 * dedupe against each other). Everything else: once per session per seq, so a
 * retried send is saved once and a second real press is saved again.
 */
export function trackIdempotencyKey(event, sessionId, seq, page) {
  return event === "page_view"
    ? `funnel-page:${sessionId}:${page}`
    : `funnel-track:${sessionId}:${seq}`;
}

const escapeLike = (s) => String(s).replace(/[\\%_]/g, "\\$&");

/* The cap count. The literal `LIKE 'funnel-track:%'` line is not redundant:
   it is what lets Postgres use the partial index idx_events_funnel_track
   (db/migrations/404_funnel_track_index.sql), whose WHERE is the same text.
   Postgres cannot work out that one LIKE pattern implies another. The inner
   LIMIT stops the count at the cap, so the work per event is bounded. */
export const TRACK_CAP_SQL =
  `SELECT count(*)::int AS n FROM (
     SELECT 1 FROM events
      WHERE org_id = $1
        AND idempotency_key LIKE 'funnel-track:%'
        AND idempotency_key LIKE $2
        AND created_at > now() - interval '1 day'
      LIMIT ${MAX_TRACK_PER_SESSION}
   ) capped`;

function parseSeq(v) {
  let n;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && /^\d{1,6}$/.test(v.trim())) n = Number(v.trim());
  else return null;
  return Number.isInteger(n) && n >= 0 && n <= MAX_SEQ ? n : null;
}

const clip = (v, max) => String(v ?? "").trim().slice(0, max);

/**
 * One funnel event → { ok, actor, saved } or { ok:false, error }.
 *
 * saved false means nothing new was written: the same session already sent
 * this seq (or this page_view), or the session is over the daily cap. Both
 * still answer ok, so the browser never retries them.
 *
 * deps: db, emit, orgId, defaultOrgId, userAgent — same as recordInterest in
 * api/public/slo-interest.mjs.
 */
export async function recordTrack(body, deps = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_json" };

  const sessionId = clip(body.session_id, 80);
  if (!SESSION.test(sessionId)) return { ok: false, error: "session_invalid" };

  const event = clip(body.event, 40);
  if (!Object.hasOwn(TRACK_EVENTS, event)) return { ok: false, error: "event_invalid" };

  const seq = parseSeq(body.seq);
  if (seq === null) return { ok: false, error: "seq_invalid" };

  const where = funnelFor(body.page);
  if (!where) return { ok: false, error: "page_invalid" };

  const who = classifyVisitor({
    email: "",
    userAgent: deps.userAgent,
    webdriver: body.webdriver === true || body.webdriver === "true"
  });

  const payload = {
    page: where.page,
    funnel: where.funnel,
    step: where.step,
    session_id: sessionId,
    seq,
    event,
    props: cleanProps(event, body.props),
    attribution: pickAttribution(body),
    landing_path: clip(body.landing_path, 200) || null,
    actor: who.actor,
    actor_reason: who.reason
  };

  const db = deps.db || defaultDb;
  const orgId = deps.orgId || (await (deps.defaultOrgId || defaultOrgId)(db));

  // page_view is once per session per page, so it is bounded by the page list
  // and never counted against the cap: an over-cap session still records the
  // step it reached.
  if (event !== "page_view") {
    const used = await db.query(TRACK_CAP_SQL, [orgId, `funnel-track:${escapeLike(sessionId)}:%`]);
    if ((used.rows[0]?.n ?? 0) >= MAX_TRACK_PER_SESSION) {
      return { ok: true, actor: who.actor, saved: false };
    }
  }

  const sent = await (deps.emit || emit)(db, trackEventName(event), payload, {
    orgId,
    allowNonCanonical: true,
    skipInngest: true,
    idempotencyKey: trackIdempotencyKey(event, sessionId, seq, where.page)
  });
  return { ok: true, actor: who.actor, saved: sent?.deduped !== true };
}
