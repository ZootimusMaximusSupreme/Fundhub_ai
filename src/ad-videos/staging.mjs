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
// Measured on 2026-09-22 (docs/specs/video-pipeline-unknowns-settled-2026-09-22.md):
// Submagic takes the file itself. `POST /v1/projects/upload` is a real route,
// multipart, up to 2 GB. **No URL is needed by anybody**, which is why this
// file no longer makes one.
//
// Netlify Blobs was measured too and cannot serve it — an object can be 5 GB
// but the only way out is a function response capped at 20 MB, ten times too
// small. Supabase Storage on our plan caps a file at exactly 50 MiB, read live
// off the project, which is four times under a 200 MB take. Both are dead ends
// and are recorded here so nobody rebuilds them.
// ═══════════════════════════════════════════════════════════════════════════
//
// ═══════════════════════════════════════════════════════════════════════════
// NOTHING IS PUBLISHED. THERE IS NO LONGER A MODE THAT PUBLISHES.
//
// This module makes no network call and creates no link. It checks the row can
// be staged and says so; the bytes move later, once, inside the fence: Drive
// hands them to the worker with our own token, the worker hands them to
// Submagic as a multipart upload. The take is never readable by anyone who is
// not us.
//
// A `link` mode used to live here as a fallback. It called
// drive.shareAnyoneWithLink() — "anyone who has this link may read this file" —
// and then nothing ever took that permission off again. A take shared that way
// stayed shared for the life of the file, long after the edit it was shared
// for was finished, and Google grants no expiry on an `anyone` permission to
// bound it. It was deleted on 2026-09-22 along with the provider call it
// depended on, because the vendor's own upload route makes it unnecessary: the
// file goes to Submagic as bytes and is never world-readable at all.
//
// If Submagic's upload route is ever refused on our plan, the answer is a new
// deliberate decision, not a dormant switch that quietly publishes a video.
// ═══════════════════════════════════════════════════════════════════════════

/** No link is made; the bytes travel inside the fence. The only mode there is. */
export const MODE_DIRECT = "direct";

export const MODES = Object.freeze([MODE_DIRECT]);

/* The shape every answer takes. `mode` is kept on the answer so a caller reads
   a named fact rather than inferring one from a missing field. */
const answer = (extra) => ({ ok: true, retryable: false, url: null, error: null, ...extra });
const problem = (error, retryable = true) => ({ ok: false, retryable, url: null, mode: null, error });

/**
 * publicUrlFor(row, ports) → { ok, mode, url, at, storageKey, error, retryable }
 *
 * The port src/ad-videos/pipeline.mjs `stage()` calls. Never throws.
 *
 * `url` is always null and that is success, not a failure — the name is the one
 * the pipeline already calls and is left alone rather than renamed mid-flight
 * (CLAUDE.md §8, no drive-by renames).
 *
 * @param {object} row                    needs `drive_raw_file_id`.
 * @param {object} [ports]
 * @param {object} [ports.env]
 */
export async function publicUrlFor(row = {}, { env = process.env } = {}) {
  const fileId = String(row?.drive_raw_file_id || "").trim();
  if (!fileId) {
    /* Not retryable: a row with no Drive file will never grow one. The step
       above turns this into a `failed` with the reason on the row. */
    return problem("this take has no Drive file id — there is nothing to stage", false);
  }

  void env;

  /* Nothing is called and nothing is published. The bytes move in
     submagicCreate(), once, and only if the take actually gets that far. */
  return answer({
    mode: MODE_DIRECT,
    at: new Date().toISOString(),
    storageKey: `drive:${fileId}`,
    note: "the take goes straight to Submagic as an upload — no link was made and nothing was shared"
  });
}

export default { publicUrlFor, MODE_DIRECT, MODES };
