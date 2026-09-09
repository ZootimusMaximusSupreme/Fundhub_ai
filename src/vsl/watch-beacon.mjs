// src/vsl/watch-beacon.mjs — what a VSL watch beacon is allowed to say.
//
// PURE. No database, no network, no clock, no imports at all. That is on
// purpose: api/public/vsl-watch.mjs is the one door in this batch that a
// stranger can knock on, and the rules about what it accepts have to be
// testable without a Postgres. src/vsl/watch-beacon.test.mjs runs here, today,
// with DATABASE_URL unset. src/http/vsl-watch.pg.test.mjs cannot.
//
// ═══════════════════════════════════════════════════════════════════════════
// REFUSE JUNK, DO NOT STORE IT.
//
// Every field below is either the shape it must be or the whole beacon is
// thrown away. There is no coercion, no "close enough", and no field that gets
// quietly blanked and written anyway — a row that half arrived is worse than no
// row, because it counts as a viewing on every screen that reads this table.
//
// The one exception is ABSENCE, which is not junk. A missing field becomes
// NULL, and NULL means "we do not know" for the whole life of that row
// (CLAUDE.md §12, and 379's header at length). Absent is legal. Wrong is not.
//
// ═══════════════════════════════════════════════════════════════════════════
// NOTHING THE CLIENT SAYS ABOUT IDENTITY IS TRUSTED.
//
// visitorId and sessionKey are opaque strings the browser made up. This module
// checks their SHAPE and nothing else. It does not look them up, does not join
// them to a person, and never treats one as proof of anything. The database
// says the same thing in 379: there is no foreign key from a watch row to a
// client, a user or an account, and there is no column for an IP address or a
// user agent — not even hashed.
//
// The times are not trusted either, which is why this module returns no
// timestamp at all. started_at and last_beacon_at are stamped by the database
// from the server clock (379, Part 3 and Part 5). A phone with the wrong date
// would otherwise file a viewing under 2019 and bend every date range on every
// screen.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE WIRE SHAPE IS SHORT ON PURPOSE.
//
// The page sends this with navigator.sendBeacon on page-hide, and a browser can
// refuse a beacon that is too big. Short keys keep a full report — position,
// flags, counts, and a whole curve — inside a couple of kilobytes.
//
//   {
//     "v":     "funnel/vsl.mp4",              which video (required)
//     "vid":   "5f3c...",                     visitor id  (required)
//     "sid":   "9a71...",                     one viewing (required)
//     "dur":   207.215,                       how long the video is
//     "pos":   91.4,                          furthest second of the WHOLE
//                                             viewing, both runs together
//     "pos_unmuted": 12.0,                    furthest second AFTER they tapped
//                                             for sound — see below, this is a
//                                             separate run of the same video
//     "unmuted":  true,                       they tapped for sound
//     "finished": false,                      they reached the end
//     "blocked":  false,                      autoplay was refused
//     "replays": 0, "rewinds": 2, "skips": 1,
//     "utm_content": "42-phase",              the ad number lives in here
//     "page":  "https://apply.fundhub.ai/watch",
//     "ref":   "https://www.facebook.com/",
//     "device":"mobile",
//     "samples": [0,5,10,15],                 whole seconds actually seen
//     "n":     42                             samples taken so far, a running
//                                             total — see `n` below
//   }
//
// Only v, vid and sid are required. Everything else may be absent, and absent
// stays unknown forever.
//
// ═══════════════════════════════════════════════════════════════════════════
// ONE VIEWING IS TWO RUNS OF THE VIDEO, WHICH IS WHY THERE ARE TWO POSITIONS.
//
// The player auto-plays MUTED and tapping "Tap for sound" sets currentTime=0
// (docs/workflows/cf-vsl-watch-html-step1.html:133). So a person who taps has
// watched the video twice: once silently, then again from the start.
//
// `pos` covers both runs together. `pos_unmuted` is the second run alone. Both
// are needed and neither can be worked out from the other. Report only `pos`
// and somebody who ran it silently to 3:00, tapped, and left is stored as
// "chose to watch, got to 3:00" — when they watched none of it after choosing.
//
// THE PAGE SCRIPT MUST KEEP THE TWO NUMBERS APART. Reset the "after unmute"
// high-water mark to nothing at page load and start filling it only once the
// tap has happened; never seed it from `pos`.

// ── The caps. Every one of these is a refusal, not a truncation. ────────────

/* A beacon is a few hundred bytes with a full curve on it. 8 KB is roomy for
   the real thing and small enough that an open endpoint cannot be used as a
   place to put data. Counted in BYTES, not characters, because a multi-byte
   character costs multi-byte storage. */
export const MAX_BODY_BYTES = 8192;

/* 240 position samples per call. The VSL is 207 seconds, so one sample a second
   for the whole video fits in a single beacon with room over, and no caller
   ever needs more in one breath.

   ⚠️ THE PAGE SCRIPT MUST COLLAPSE ITS SAMPLES TO WHOLE SECONDS BEFORE IT SENDS.
      Over the cap is REFUSED, not trimmed, and the refusal throws the whole
      beacon away. A browser fires timeupdate roughly four times a second, so a
      script that forwards every tick raw hits 240 in about a minute, gets a 400,
      and loses everything that watch had to report. The long watches are the
      ones worth the most, so this would fail hardest exactly where it matters.
      Floor each position to a whole second and send each second once. */
export const MAX_SAMPLES = 240;

/* Long enough that a session key cannot be guessed by hand — it is the thing
   that decides which row a beacon reaches — and short enough that neither field
   can be used as storage. The same range is a CHECK constraint in 379, so this
   is the door and that is the wall behind it. */
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/* A path under public/ with no leading slash: 'funnel/vsl.mp4'. Lowercase, no
   spaces, and '..' rejected outright so this can never be read as a way to
   name a file somewhere else. Mirrors vsl_watch_sessions_shape_ck in 379. */
const VIDEO_KEY_RE = /^[a-z0-9][a-z0-9._/-]{0,119}$/;

const DEVICES = new Set(["mobile", "tablet", "desktop"]);

const MAX_SECONDS = 86400;     // a day. Nothing legitimate is near this.
const MAX_COUNT = 10000;       // replays / rewinds / skips
const MAX_UTM = 200;
const MAX_URL = 500;

/* Rate limit. TWO COUNTS, and the second one is the one that actually holds.
   Both are applied by checkVisitorRate() in src/vsl/watch-store.mjs.

   ── ONE — PER VISITOR ID. 40 NEW VIEWINGS AN HOUR FROM ONE BROWSER.
   A real person watching a three-minute video, leaving and coming back all
   evening does not reach it. Beacons for a viewing that already exists are not
   counted — they are an update to one row, they cannot make the table grow, and
   counting them would cut off the very reports that matter most: the ones from
   somebody who watched the whole thing.

   THIS ONE IS NOT A WALL AND IS NOT PRETENDED TO BE. A visitor id is a string
   the caller makes up for free, so a script that sends a new one every time gets
   a fresh allowance every time. It stops a runaway page script and a lazy flood
   and nothing more.

   ── TWO — SITE-WIDE. 2,000 NEW VIEWINGS IN 10 MINUTES, FROM ANYBODY.
   This is the guard that survives a flood spread across thousands of made-up
   visitor ids and across however many server instances are warm, because it is
   counted from real rows rather than from anything held in memory. It is the
   same guard, for the same reason, as the org-wide flood count in
   src/hiring/apply-public.mjs:346-356, whose comment calls it the important one.

   It has to go through fundhub_vsl_recent_count() (379, Part 3b) rather than an
   ordinary count: inside the beacon's own transaction the row-level security
   policies show only the one declared visitor's rows, so a plain count would
   quietly return the wrong number and never fire.

   WHY 2,000 IN 10 MINUTES. Nothing counts traffic to apply.fundhub.ai/watch
   today, so real volume is UNKNOWN — this number is not measured and is not
   pretending to be. It is set FAR above any plausible reading of that page:
   2,000 in ten minutes is 12,000 an hour, and a funnel page doing that is a
   different business. It is a ceiling to stop a machine, not a throttle on
   people. The cost of it firing wrongly is a real viewer's first beacon being
   refused, so it is deliberately loose. RAISE IT, do not lower it, if the page
   ever gets real traffic — and only after somebody has actually counted.

   Viewings that ALREADY EXIST are never refused by either count, including
   during a flood. They cannot make the table grow.

   The hard caps above — 8 KB a call, 240 samples a call — bound the damage of
   any single call whoever is making it. */
export const WATCH_LIMITS = Object.freeze({
  maxNewSessionsPerVisitor: 40,
  windowMinutes: 60,
  maxNewSessionsSiteWide: 2000,
  siteWindowMinutes: 10
});

// ── Helpers ────────────────────────────────────────────────────────────────

/* A finite number, or the marker that it was absent, or a refusal. null and
   undefined are ABSENT — unknown, and legal. A string, a NaN, an Infinity or a
   boolean is a refusal: something is wrong at the other end and guessing what
   it meant is how a wrong number gets stored as a right one. */
function num(v, { min, max }) {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false };
  if (v < min || v > max) return { ok: false };
  return { ok: true, value: v };
}

function whole(v, { min, max }) {
  const n = num(v, { min, max });
  if (!n.ok) return n;
  if (n.value === null) return n;
  if (!Number.isInteger(n.value)) return { ok: false };
  return n;
}

/* Strictly true or false. A missing flag is unknown. A "true", a 1 or a 0 is a
   refusal — those are three different bugs at the other end and every one of
   them ends with a screen saying something that is not so. */
function flag(v) {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "boolean") return { ok: false };
  return { ok: true, value: v };
}

function str(v, max) {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false };
  const s = v.trim();
  if (!s) return { ok: true, value: null };       // an empty string is absence
  if (s.length > max) return { ok: false };
  return { ok: true, value: s };
}

/* A web address, or nothing. Anything that is not http/https is refused rather
   than stored: a javascript: or a data: string in a column a screen might one
   day print is a hazard nobody would go looking for. */
function url(v) {
  const s = str(v, MAX_URL);
  if (!s.ok) return s;
  if (s.value === null) return s;
  if (!/^https?:\/\//i.test(s.value)) return { ok: false };
  return s;
}

/* byteLength — how big this body really is.
   TextEncoder is built into Node and into every browser; no dependency. */
export function byteLength(raw) {
  if (raw == null) return 0;
  if (typeof raw !== "string") return 0;
  return new TextEncoder().encode(raw).length;
}

/* overBodyCap — the size gate, kept here so the endpoint and the tests agree on
   one number. */
export function overBodyCap(raw, cap = MAX_BODY_BYTES) {
  return byteLength(raw) > cap;
}

// ── The validator ──────────────────────────────────────────────────────────

/* parseWatchBeacon(body) → { ok: true, value } | { ok: false, error }

   `error` is for tests and for a log line. It is NOT what the endpoint sends
   back: api/public/vsl-watch.mjs collapses every refusal to one word, so a
   caller probing the door learns nothing about which field it got wrong. */
export function parseWatchBeacon(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_json" };
  }

  // ── the three that are required ──
  const videoKey = typeof body.v === "string" ? body.v.trim().toLowerCase() : "";
  if (!VIDEO_KEY_RE.test(videoKey) || videoKey.includes("..")) {
    return { ok: false, error: "bad_video" };
  }

  const visitorId = typeof body.vid === "string" ? body.vid.trim() : "";
  if (!ID_RE.test(visitorId)) return { ok: false, error: "bad_visitor" };

  const sessionKey = typeof body.sid === "string" ? body.sid.trim() : "";
  if (!ID_RE.test(sessionKey)) return { ok: false, error: "bad_session" };

  // ── how long, how far ──
  const dur = num(body.dur, { min: 0, max: MAX_SECONDS });
  if (!dur.ok || dur.value === 0) return { ok: false, error: "bad_duration" };

  const pos = num(body.pos, { min: 0, max: MAX_SECONDS });
  if (!pos.ok) return { ok: false, error: "bad_position" };

  /* `pos_unmuted` — THE FURTHEST SECOND OF THE SECOND RUN, and the reason this
     endpoint reports two positions instead of one.

     Tapping "Tap for sound" sets currentTime=0 (docs/workflows/
     cf-vsl-watch-html-step1.html:133), so one viewing is two runs of the same
     video: the silent one, then the chosen one. `pos` is the furthest second of
     the whole viewing, both runs together. `pos_unmuted` is the furthest second
     of the run after the tap, on its own.

     Without it, somebody who lets the video play silently to 3:00, taps for
     sound and then leaves is filed as "chose to watch, reached 3:00" — the exact
     opposite of what happened, and unspottable afterwards because the two runs
     were added together before they were stored.

     Same rules as `pos`: a finite number in range, or absent. Absent stays NULL
     forever, and NULL is the correct answer for everybody who never tapped —
     it is never 0 for them. */
  const posUnmuted = num(body.pos_unmuted, { min: 0, max: MAX_SECONDS });
  if (!posUnmuted.ok) return { ok: false, error: "bad_position_unmuted" };

  /* THE FRACTION IS COMPUTED HERE AND NEVER ACCEPTED FROM THE PAGE. A caller
     could otherwise report "got 4 seconds in, 100% watched" and no constraint
     in the database would catch it, because both halves are legal on their own.

     It stays NULL unless BOTH numbers are known. A fraction over 1 is clamped
     rather than refused: a browser can report currentTime a hair past duration
     at the very end, which is a rounding artefact and not a lie. */
  let fraction = null;
  if (pos.value !== null && dur.value !== null && dur.value > 0) {
    fraction = Math.min(1, Math.max(0, pos.value / dur.value));
    fraction = Math.round(fraction * 100000) / 100000;   // numeric(6,5) in 379
  }

  // ── what they did ──
  const unmuted = flag(body.unmuted);
  if (!unmuted.ok) return { ok: false, error: "bad_unmuted" };
  const finished = flag(body.finished);
  if (!finished.ok) return { ok: false, error: "bad_finished" };
  const blocked = flag(body.blocked);
  if (!blocked.ok) return { ok: false, error: "bad_blocked" };

  const replays = whole(body.replays, { min: 0, max: MAX_COUNT });
  if (!replays.ok) return { ok: false, error: "bad_replays" };
  const rewinds = whole(body.rewinds, { min: 0, max: MAX_COUNT });
  if (!rewinds.ok) return { ok: false, error: "bad_rewinds" };
  const skips = whole(body.skips, { min: 0, max: MAX_COUNT });
  if (!skips.ok) return { ok: false, error: "bad_skips" };

  // ── the link, the page, the device ──
  //
  // utm_content is stored raw and the ad number is worked out by the database
  // (379's ad_number column, using fundhub_ad_id from 286). Nothing here tries
  // to pull the digits out of it: a second copy of that rule in JavaScript is
  // how two answers to one question appear.
  const utm = str(body.utm_content, MAX_UTM);
  if (!utm.ok) return { ok: false, error: "bad_utm" };

  const page = url(body.page);
  if (!page.ok) return { ok: false, error: "bad_page" };
  const ref = url(body.ref);
  if (!ref.ok) return { ok: false, error: "bad_referrer" };

  let device = null;
  if (body.device !== undefined && body.device !== null && body.device !== "") {
    if (typeof body.device !== "string") return { ok: false, error: "bad_device" };
    device = body.device.trim().toLowerCase();
    if (!DEVICES.has(device)) return { ok: false, error: "bad_device" };
  }

  // ── the curve ──
  //
  // Sorted and de-duplicated here so the database never has to, and so two
  // beacons carrying the same seconds in a different order cannot look like
  // different data.
  let samples = null;
  if (body.samples !== undefined && body.samples !== null) {
    if (!Array.isArray(body.samples)) return { ok: false, error: "bad_samples" };
    if (body.samples.length > MAX_SAMPLES) return { ok: false, error: "too_many_samples" };
    const seen = new Set();
    for (const raw of body.samples) {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return { ok: false, error: "bad_sample" };
      }
      if (raw < 0 || raw > MAX_SECONDS) return { ok: false, error: "bad_sample" };
      seen.add(Math.floor(raw));      // whole seconds; 12.7 and 12.9 are second 12
    }
    samples = seen.size ? [...seen].sort((a, b) => a - b) : null;
  }

  /* `n` — HOW MANY SAMPLES THIS VIEWING HAS TAKEN IN TOTAL, not how many are in
     this beacon. A running counter, so a beacon that arrives twice reports the
     same number twice and the database's GREATEST leaves it alone. A per-beacon
     count would have to be added up, and a duplicate would then double it.

     It is kept apart from the length of `samples` on purpose: repeated samples
     at the same second collapse in the array and do not collapse in this
     number, which is how a stuck player is told from a fast-forwarding one. */
  const total = whole(body.n, { min: 0, max: 100000 });
  if (!total.ok) return { ok: false, error: "bad_sample_count" };

  return {
    ok: true,
    value: {
      videoKey,
      visitorId,
      sessionKey,
      durationSeconds: dur.value,
      maxPositionSeconds: pos.value,
      maxPositionAfterUnmuteSeconds: posUnmuted.value,
      watchedFraction: fraction,
      unmuted: unmuted.value,
      finished: finished.value,
      autoplayBlocked: blocked.value,
      replayCount: replays.value,
      rewindCount: rewinds.value,
      skipCount: skips.value,
      utmContent: utm.value,
      pageUrl: page.value,
      referrer: ref.value,
      deviceHint: device,
      samples,
      sampleCount: total.value
    }
  };
}

export default parseWatchBeacon;
