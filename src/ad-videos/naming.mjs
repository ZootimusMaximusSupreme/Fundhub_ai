// src/ad-videos/naming.mjs — what every file and folder in the pipeline is called.
//
// Ground truth: marketing/ads/video-pipeline-plan.md §4.
//
//   Paul's shared Drive          Our Raw folder (Paul never sees it)
//   ─────────────────────        ──────────────────────────────────
//   Fundhub Ads /                Fundhub Raw /
//     043 /                        043_t01_raw_2026-09-23.mp4
//       043_t02_final_v1.mp4       043_t02_raw_2026-09-23.mp4
//       043_brief.pdf
//
// ═══════════════════════════════════════════════════════════════════════════
// *** THE ONE RULE THIS FILE EXISTS TO HOLD ***
//
// THE FOLDER PADS. THE LINK DOES NOT.
//
// `043` in a folder name is there so folders sort in order on Paul's screen.
// `043` in a link is a DIFFERENT AD from `43`, because fundhub_ad_id()
// (db/migrations/286_client_ad_attribution.sql:81-84) returns TEXT and does no
// arithmetic. Pad a link once and that ad's results split in half, quietly,
// forever — half under "43" and half under "043", and neither number looks
// wrong on its own.
//
// So there are two functions and they are named for what they are for:
//   folderNumber(adId) → "043"   never goes in a URL
//   linkNumber(adId)   → "43"    never goes in a file name
//
// The brief's landing link reads its number from the database through
// linkNumber(), never off the folder name. utmContent() is the only shape that
// should ever reach a query string.
//
// PURE. No database, no clock, no filesystem — takeDate is passed in, never
// read from Date.now(), so a test can assert the whole name.

/* Three digits is the plan's number, and it is a MINIMUM not a cap: ad 1234
   stays "1234" rather than being truncated to fit. Truncating would collide
   two ads into one folder, which is the same accident as padding a link. */
export const FOLDER_PAD = 3;
/* Two digits for a take. Same rule: take 100 is "t100". */
export const TAKE_PAD = 2;

export const PAUL_ROOT = "Fundhub Ads";
export const RAW_ROOT = "Fundhub Raw";

/* AD_ID_RE — the same shape as ad_videos_ad_id_ck in 389 and as the digits
   fundhub_ad_id() reads out of utm_content: 1 to 9 digits, no leading zeros.
   "0" is a legal ad number; "043" is not. */
export const AD_ID_RE = /^(0|[1-9][0-9]{0,8})$/;

export class AdVideoNamingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AdVideoNamingError";
    this.code = code;
  }
}

/**
 * The ad number as it may be stored and linked: digits only, no leading zeros.
 * A padded value is REFUSED rather than trimmed — "043" arriving here means a
 * caller has already mixed up the two forms, and silently turning it into "43"
 * would hide that bug instead of stopping it.
 */
export function normalizeAdId(adId) {
  const s = String(adId == null ? "" : adId).trim();
  if (!AD_ID_RE.test(s)) {
    throw new AdVideoNamingError("bad_ad_id",
      `ad number must be 1-9 digits with no leading zeros, got "${s}" — ` +
      `a padded number belongs in a folder name, never in an id or a link`);
  }
  return s;
}

export function normalizeTakeNo(takeNo) {
  const n = Number(takeNo);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new AdVideoNamingError("bad_take_no",
      `take number must be a whole number 1 or more, got "${takeNo}"`);
  }
  return n;
}

function normalizeVersion(version) {
  const n = Number(version);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new AdVideoNamingError("bad_version",
      `finished version must be a whole number 1 or more, got "${version}"`);
  }
  return n;
}

/* An ISO date, YYYY-MM-DD, as the raw file name carries it. Passed in rather
   than taken from the clock so the name is a function of its inputs. A Date is
   accepted and read in UTC — a local reading would give two machines two
   different file names for one take. */
function normalizeTakeDate(takeDate) {
  if (takeDate instanceof Date) {
    if (Number.isNaN(takeDate.getTime())) {
      throw new AdVideoNamingError("bad_take_date", "take date is an invalid Date");
    }
    return takeDate.toISOString().slice(0, 10);
  }
  const s = String(takeDate == null ? "" : takeDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new AdVideoNamingError("bad_take_date",
      `take date must be YYYY-MM-DD or a Date, got "${s}"`);
  }
  return s;
}

// ───────────────────────────────────────────────────────────────────────────
// The two numbers. Read the header before touching either.
// ───────────────────────────────────────────────────────────────────────────

/** "43" → "043". FOLDER AND FILE NAMES ONLY. Never a URL. */
export function folderNumber(adId) {
  return normalizeAdId(adId).padStart(FOLDER_PAD, "0");
}

/** "43" → "43", and refuses "043". LINKS AND IDS ONLY. Never a file name. */
export function linkNumber(adId) {
  return normalizeAdId(adId);
}

/** 2 → "t02". */
export function takeTag(takeNo) {
  return `t${String(normalizeTakeNo(takeNo)).padStart(TAKE_PAD, "0")}`;
}

/** 1 → "v1". Not padded: there is no sorting problem, a take has few cuts. */
export function versionTag(version) {
  return `v${normalizeVersion(version)}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Paul's side — what he opens.
// ───────────────────────────────────────────────────────────────────────────

/** The folder inside Paul's shared drive: "043". */
export function paulFolderName(adId) {
  return folderNumber(adId);
}

/**
 * "043_t02_final_v1.mp4".
 *
 * ONLY ONE OF THESE EVER SITS IN 043/. A new cut replaces it and old cuts stay
 * in our own storage — that is how "one ad number, one video" stays true on
 * Paul's screen rather than only in the database.
 */
export function finalFileName(adId, takeNo, version = 1, ext = "mp4") {
  return `${folderNumber(adId)}_${takeTag(takeNo)}_final_${versionTag(version)}.${cleanExt(ext)}`;
}

/** "043_brief.pdf" — the one-page brief that rides with the video. */
export function briefFileName(adId, ext = "pdf") {
  return `${folderNumber(adId)}_brief.${cleanExt(ext)}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Our side — the Raw folder Paul never sees.
// ───────────────────────────────────────────────────────────────────────────

/**
 * "043_t01_raw_2026-09-23.mp4" — what the worker renames the phone's file to,
 * so a folder of takes says what each one is instead of IMG_4471.mov.
 */
export function rawFileName(adId, takeNo, takeDate, ext = "mp4") {
  return `${folderNumber(adId)}_${takeTag(takeNo)}_raw_${normalizeTakeDate(takeDate)}.${cleanExt(ext)}`;
}

/** "raw/2026/09/043_t02.mp4" — the key for our own copy of the raw take. */
export function storageRawKey(adId, takeNo, takeDate, ext = "mp4") {
  const date = normalizeTakeDate(takeDate);
  return `raw/${date.slice(0, 4)}/${date.slice(5, 7)}/` +
    `${folderNumber(adId)}_${takeTag(takeNo)}.${cleanExt(ext)}`;
}

/** "final/043_t02_v1.mp4" — our own copy of the finished cut. */
export function storageFinalKey(adId, takeNo, version = 1, ext = "mp4") {
  return `final/${folderNumber(adId)}_${takeTag(takeNo)}_${versionTag(version)}.${cleanExt(ext)}`;
}

// ───────────────────────────────────────────────────────────────────────────
// The link. The half of this file that must never pad.
// ───────────────────────────────────────────────────────────────────────────

/**
 * The utm_content value for this ad. Unpadded digits, optionally with a slug.
 *
 * fundhub_ad_id() reads the leading digits and IGNORES the slug entirely
 * (286:81-84), so "43-phase" and "43" resolve to the same ad and a missing
 * slug is never a defect (CLAUDE.md §3c: never make naming a blocker). The
 * slug is there to make a report readable and does nothing else.
 */
export function utmContent(adId, slug = null) {
  const n = linkNumber(adId);
  const s = String(slug == null ? "" : slug).trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return s ? `${n}-${s}` : n;
}

/**
 * The landing link for the brief, with utm_content set to the UNPADDED number.
 *
 * Built with URL so the number lands as a real query parameter and cannot be
 * mangled by string concatenation onto a base that already has a "?".
 */
export function landingLink(baseUrl, adId, { slug = null, extra = {} } = {}) {
  let url;
  try {
    url = new URL(String(baseUrl));
  } catch {
    throw new AdVideoNamingError("bad_base_url", `landing link needs a full URL, got "${baseUrl}"`);
  }
  url.searchParams.set("utm_content", utmContent(adId, slug));
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null && String(v) !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

// ───────────────────────────────────────────────────────────────────────────
// Reading a name back.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pull the ad number and take number back out of one of our own names, for any
 * of the four shapes above. Returns null for anything else — a phone's own file
 * name, a folder, junk. NEVER a guess: an unrecognised name is information
 * ("this file has not been renamed yet"), not a problem to paper over.
 *
 * The returned adId is UNPADDED, because it is going into a row and a link.
 */
export function parseVideoName(name) {
  const s = String(name == null ? "" : name).trim();
  const m = /^(\d{3,})_t(\d{2,})(?:_(raw|final))?(?:_v(\d+))?(?:_(\d{4}-\d{2}-\d{2}))?\.[A-Za-z0-9]+$/.exec(s);
  if (!m) return null;

  // Strip the folder padding to get back to the number a link may carry. A name
  // whose digits do not survive that round trip ("0043") was not ours.
  const unpadded = m[1].replace(/^0+(?=\d)/, "");
  if (!AD_ID_RE.test(unpadded)) return null;

  const takeNo = Number(m[2].replace(/^0+(?=\d)/, ""));
  if (!Number.isSafeInteger(takeNo) || takeNo < 1) return null;

  return {
    adId: unpadded,
    takeNo,
    kind: m[3] || null,
    version: m[4] ? Number(m[4]) : null,
    takeDate: m[5] || null
  };
}

function cleanExt(ext) {
  const s = String(ext == null ? "" : ext).trim().toLowerCase().replace(/^\.+/, "");
  if (!/^[a-z0-9]{1,8}$/.test(s)) {
    throw new AdVideoNamingError("bad_extension", `file extension must be 1-8 letters or digits, got "${ext}"`);
  }
  return s;
}
