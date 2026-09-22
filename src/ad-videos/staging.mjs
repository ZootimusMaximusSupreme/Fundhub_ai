// Staging — how a filmed take gets from Drive to the editor.
//
// ═══════════════════════════════════════════════════════════════════════════
// THIS FILE REPLACES A GAP, AND THE GAP WAS BUILT ON A FALSE FACT.
//
// The pipeline used to stop dead at `raw_landed` with "there is no proven way
// in this repo to put a several-hundred-megabyte MP4 behind a public link".
// That was written because an earlier research note said a Google Drive link
// cannot work — Drive shows a virus-scan page over 25 MB and Submagic refuses
// share links — and therefore the take would have to be copied to Cloudflare
// R2 or Amazon S3 first: a new vendor, a new bill, a new key.
//
// Measured on 2026-09-22 (docs/specs/video-pipeline-unknowns-settled-2026-09-22.md),
// BOTH halves of that turned out to be wrong:
//
//   1. Submagic takes the file itself. `POST /v1/projects/upload` is a real
//      route, multipart, up to 2 GB. No URL is needed by anybody.
//   2. A Drive link does work. A 344.6 MB file answered real MP4 bytes to a
//      client holding no credentials at all, over
//      drive.usercontent.google.com/download?id=…&export=download&confirm=t.
//      The threshold is around 100 MB, not 25, and `confirm=t` defeats it.
//
// So there are two routes and neither needs new hosting. Netlify Blobs was
// measured too and cannot serve it — an object can be 5 GB but the only way
// out is a function response capped at 20 MB, ten times too small. Supabase
// Storage on our plan caps a file at exactly 50 MiB, read live off the
// project, which is four times under a 200 MB take. Both are dead ends and are
// recorded here so nobody rebuilds them.
// ═══════════════════════════════════════════════════════════════════════════
//
// ═══════════════════════════════════════════════════════════════════════════
// DIRECT IS THE DEFAULT, AND IT PUBLISHES NOTHING.
//
// In `direct` mode this module makes no network call and creates no link. It
// checks the row can be staged and says so; the bytes move later, once, inside
// the fence: Drive hands them to the worker with our own token, the worker
// hands them to Submagic as a multipart upload. The take is never readable by
// anyone who is not us.
//
// `link` mode is the fallback for the day Submagic's upload route turns out to
// be plan-gated. It shares ONE file — never a folder — as `anyone with the
// link, reader`, and hands back the download URL.
//
// THE SAFETY PROPERTY THE TASK ASKS FOR: the link must expire or be
// unguessable, and must never expose anything else. It is unguessable — a
// Drive file id is 33 characters of random with no listing behind it — and it
// reaches exactly one file, read-only. An unshared id answers a sign-in page,
// measured, so the permission is the whole door.
// ═══════════════════════════════════════════════════════════════════════════

import * as defaultDrive from "../messaging/providers/google-drive-write.mjs";

/** No link is made; the bytes travel inside the fence. The default. */
export const MODE_DIRECT = "direct";

/** One file is shared by link, and the link is handed to Submagic. */
export const MODE_LINK = "link";

export const MODES = Object.freeze([MODE_DIRECT, MODE_LINK]);

/** Set this to "link" only if the direct upload route is ever refused. */
export const STAGING_MODE_VAR = "AD_VIDEO_STAGING_MODE";

/* The host that serves the bytes. NOT drive.google.com/uc — that one answers
   the virus-scan interstitial for a big file even with confirm set. */
export const DRIVE_DOWNLOAD_BASE = "https://drive.usercontent.google.com/download";

/**
 * stagingMode(env) → "direct" | "link"
 *
 * Anything unrecognised reads as `direct`, which is the mode that publishes
 * nothing. A typo in a variable must not be the thing that makes a video
 * world-readable.
 */
export function stagingMode(env = process.env) {
  const raw = String(env?.[STAGING_MODE_VAR] ?? "").trim().toLowerCase();
  return raw === MODE_LINK ? MODE_LINK : MODE_DIRECT;
}

/**
 * driveDownloadUrl(fileId) → the plain-bytes link for a shared Drive file.
 *
 * `confirm=t` is NOT optional. Without it a file over roughly 100 MB answers
 * 2,457 bytes of virus-scan HTML with a 200 status — which an editor would
 * happily accept and then fail to decode.
 */
export function driveDownloadUrl(fileId) {
  const id = String(fileId || "").trim();
  if (!id) return null;
  return `${DRIVE_DOWNLOAD_BASE}?id=${encodeURIComponent(id)}&export=download&confirm=t`;
}

/* The shape every answer takes. `mode` is the field the pipeline reads first:
   in `direct` there is NO url and that is success, not a failure. */
const answer = (extra) => ({ ok: true, retryable: false, url: null, error: null, ...extra });
const problem = (error, retryable = true) => ({ ok: false, retryable, url: null, mode: null, error });

/**
 * publicUrlFor(row, ports) → { ok, mode, url, at, storageKey, error, retryable }
 *
 * The port src/ad-videos/pipeline.mjs `stage()` calls. Never throws.
 *
 * @param {object} row                    needs `drive_raw_file_id`.
 * @param {object} [ports]
 * @param {object} [ports.env]
 * @param {object} [ports.drive]          the Drive provider; injected for tests.
 * @param {string} [ports.mode]           overrides the env for one call.
 */
export async function publicUrlFor(row = {}, { env = process.env, drive = defaultDrive, mode } = {}) {
  const fileId = String(row?.drive_raw_file_id || "").trim();
  if (!fileId) {
    /* Not retryable: a row with no Drive file will never grow one. The step
       above turns this into a `failed` with the reason on the row. */
    return problem("this take has no Drive file id — there is nothing to stage", false);
  }

  const chosen = MODES.includes(String(mode)) ? String(mode) : stagingMode(env);
  const at = new Date().toISOString();

  if (chosen === MODE_DIRECT) {
    /* Nothing is called and nothing is published. The bytes move in
       submagicCreate(), once, and only if the take actually gets that far. */
    return answer({
      mode: MODE_DIRECT,
      at,
      storageKey: `drive:${fileId}`,
      note: "the take goes straight to Submagic as an upload — no link was made and nothing was shared"
    });
  }

  if (typeof drive?.shareAnyoneWithLink !== "function") {
    return problem("link staging needs a Drive provider that can share a file");
  }

  const shared = await drive.shareAnyoneWithLink(fileId, { env });
  if (!shared?.ok) {
    return problem(shared?.error || "Drive would not share the take by link", shared?.retryable !== false);
  }

  return answer({
    mode: MODE_LINK,
    url: driveDownloadUrl(fileId),
    at,
    storageKey: `drive:${fileId}`,
    note: "one file shared read-only by link; the id is the whole credential"
  });
}

export default { publicUrlFor, stagingMode, driveDownloadUrl, MODE_DIRECT, MODE_LINK, MODES };
