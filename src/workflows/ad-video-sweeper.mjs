// The ad video sweeper — the clock the whole pipeline runs on.
//
// Two jobs, in this order, every five minutes:
//
//   1. LOOK IN THE RAW DRIVE FOLDER. A take that appeared since the last pass
//      becomes a row. This is the only trigger: Drive push channels expire in
//      seven days and do not renew themselves, so the API research calls
//      polling the simple, reliable answer and this agrees.
//
//   2. MOVE EVERY ROW ONE STEP. src/ad-videos/pipeline.mjs decides what that
//      step is; this file only supplies the ports and writes the result down.
//
// ═══════════════════════════════════════════════════════════════════════════
// EVERY PASS IS BOUNDED, AND A PASS NEVER THROWS.
//
// Same shape and the same reasoning as src/workflows/message-dispatch-sweeper.mjs:
// one bounded batch, then stop. A backlog that cannot be cleared in one pass is
// cleared in the next one, and nothing is lost by stopping early because a row
// that did not move is still in its state and still due. A pass that failed must
// not take the scheduled function down with it — the next pass is the recovery.
//
// It matters more here than for messages, because the steps cost money. Export
// is capped at 50 an hour and every update costs another, so an unbounded pass
// that retried could spend an hour's budget in a minute.
// ═══════════════════════════════════════════════════════════════════════════
//
// ═══════════════════════════════════════════════════════════════════════════
// IT IS REGISTERED, AND REGISTERING IT SENDS NOTHING.
//
// Three separate things still have to be true before a single byte leaves:
//   * ADAPTERS_DRY_RUN must be an explicit off value, or Submagic and Drive are
//     both held (src/lib/dry-run.mjs defaults to BLOCKED).
//   * MESSAGING_DRY_RUN must be an explicit off value, or the phone stays quiet.
//   * SUBMAGIC_API_KEY, the Drive credentials and DRIVE_RAW_FOLDER_ID must be
//     set, or every step reports "not configured" and the rows sit still.
//
// With none of those set this function walks an empty folder and does nothing,
// which is the correct behaviour for a deploy nobody has switched on.
// ═══════════════════════════════════════════════════════════════════════════

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { advance } from "../ad-videos/pipeline.mjs";
import * as submagic from "../messaging/providers/submagic.mjs";
import * as drive from "../messaging/providers/google-drive-write.mjs";
import * as ntfy from "../messaging/providers/ntfy.mjs";

/** Every five minutes. The research puts the useful window at two to five;
    five is the slower end because each pass can cost a paid API minute. */
export const SWEEP_CRON = "*/5 * * * *";

export const SOURCE_WORKFLOW = "ad-video-sweeper";

/** How many rows one pass will move. Small on purpose: see the header. */
export const DEFAULT_BATCH = 10;

/** How many new Drive files one pass will pick up. */
export const DEFAULT_DETECT_LIMIT = 20;

/* ─────────────────────────────────────────────────────────────────────────
   THE ONE THING THIS FILE DOES NOT OWN.

   The `ad_videos` table, its reader and the naming rules are Builder A's
   (src/ad-videos/store.mjs, src/ad-videos/naming.mjs). They are loaded here at
   RUN TIME rather than imported at the top, for one reason: an import of a file
   that does not exist yet fails the whole module, which would take every other
   registered workflow down with it. A missing store must be a quiet, reported
   "not built yet", not a dead deploy.

   Delete the try/catch and make these plain imports the day both files land.
   ───────────────────────────────────────────────────────────────────────── */
async function loadStore(options) {
  if (options.store && options.naming) return { ok: true, store: options.store, naming: options.naming };
  try {
    const [store, naming] = await Promise.all([
      options.store ? Promise.resolve(options.store) : import("../ad-videos/store.mjs"),
      options.naming ? Promise.resolve(options.naming) : import("../ad-videos/naming.mjs")
    ]);
    return { ok: true, store, naming };
  } catch (err) {
    return { ok: false, error: `the ad_videos store is not built yet: ${String(err?.message || err)}` };
  }
}

/* portsFor — everything a pipeline step is allowed to reach.

   Passed in rather than imported by the pipeline, so every step is testable
   with a stub and nothing in src/ad-videos/ can open a socket of its own. */
export function portsFor({ env = process.env, naming, staging, saveFinished, candidateScripts = [], brollLibrary = [] } = {}) {
  return {
    env,
    naming,
    staging,
    saveFinished,
    candidateScripts,
    brollLibrary,
    submagic,
    drive,
    notify: ntfy,
    webhookUrl: env.SUBMAGIC_WEBHOOK_URL || null,
    paulFolderId: env.DRIVE_PAUL_FOLDER_ID || null,
    landingBase: env.PUBLIC_SITE_URL || "https://fundhub.ai",
    approveUrl: null,
    rejectUrl: null
  };
}

/* detect — new takes in the Raw folder become rows.

   Two filters happen inside drive.listNewVideos and are worth repeating here
   because they are the difference between a working trigger and a broken one:
   a file still uploading has a real id and ZERO bytes, and a stray note in the
   folder is not a take. Both are skipped. */
export async function detect(database, { store, env = process.env, limit = DEFAULT_DETECT_LIMIT } = {}) {
  const folderId = env.DRIVE_RAW_FOLDER_ID;
  if (!folderId) return { ok: true, detected: 0, note: "DRIVE_RAW_FOLDER_ID is not set — nothing is being watched" };
  if (typeof store?.lastRawSeenAt !== "function" || typeof store?.recordRawTake !== "function") {
    return { ok: false, detected: 0, error: "the store does not offer lastRawSeenAt/recordRawTake" };
  }

  const since = await store.lastRawSeenAt(database);
  const listed = await drive.listNewVideos({ folderId, since, pageSize: limit, env });
  if (!listed.ok) return { ok: false, detected: 0, error: listed.error };

  let detected = 0;
  for (const file of listed.files) {
    const meta = await drive.getFileMeta(file.id, { env });
    const written = await store.recordRawTake(database, {
      driveFileId: file.id,
      name: file.name,
      createdTime: file.createdTime,
      sizeBytes: Number(file.size) || null,
      width: meta.ok ? meta.width : null,
      height: meta.ok ? meta.height : null,
      durationSeconds: meta.ok ? meta.durationSeconds : null
    });
    if (written?.created) detected += 1;
  }
  return { ok: true, detected, skipped: listed.skipped || 0 };
}

/* walk — move each row one step, and write down what happened. */
export async function walk(database, { store, ports, limit = DEFAULT_BATCH } = {}) {
  if (typeof store?.listPending !== "function" || typeof store?.patch !== "function") {
    return { ok: false, advanced: 0, error: "the store does not offer listPending/patch" };
  }
  const rows = (await store.listPending(database, { limit })) || [];
  const per = [];
  let advanced = 0;

  for (const row of rows) {
    const out = await advance(row, {
      ...ports,
      candidateScripts: ports.candidateScripts,
      brollLibrary: ports.brollLibrary
    });
    if (out.patch && Object.keys(out.patch).length) {
      await store.patch(database, row.id, out.patch);
      advanced += 1;
    }
    per.push({
      id: row.id,
      from: row.status,
      step: out.step,
      to: out.patch?.status || row.status,
      ok: out.ok,
      note: out.note || out.error || null
    });
  }
  return { ok: true, advanced, per };
}

/* sweep — one pass.

   `db` and the limits are arguments, so the tests drive this with no Inngest
   and no scheduler. Never throws; the error is returned so a caller can log it. */
export async function sweep(database, options = {}) {
  const env = options.env || process.env;
  try {
    const loaded = await loadStore(options);
    if (!loaded.ok) return { ok: false, detected: 0, advanced: 0, per: [], error: loaded.error };

    const { store, naming } = loaded;
    const ports = options.ports || portsFor({
      env,
      naming,
      staging: options.staging,
      saveFinished: options.saveFinished,
      candidateScripts: typeof store.candidateScripts === "function"
        ? await store.candidateScripts(database)
        : [],
      brollLibrary: options.brollLibrary || []
    });

    const found = await detect(database, { store, env, limit: options.detectLimit });
    const moved = await walk(database, { store, ports, limit: options.limit });

    return {
      ok: found.ok && moved.ok,
      detected: found.detected || 0,
      advanced: moved.advanced || 0,
      per: moved.per || [],
      error: found.error || moved.error || null,
      note: found.note || null
    };
  } catch (err) {
    return {
      ok: false, detected: 0, advanced: 0, per: [],
      error: String((err && err.message) || err).slice(0, 300)
    };
  }
}

/* handle — the shape src/journeys/runner/registry.mjs expects of a registered
   workflow. It has no event trigger (it is a cron), so no journey reaches it
   and it always appears in the runner's neverFired list. That is correct for a
   scheduled job, not a coverage hole. */
export async function handle({ db: handleDb, step, env = process.env } = {}) {
  const run = () => sweep(handleDb || db, { env });
  return step && typeof step.run === "function" ? step.run("sweep-ad-videos", run) : run();
}

export const adVideoSweeper = inngest.createFunction(
  { id: "ad-video-sweeper", name: "Ad video sweeper (Drive takes → Submagic → approval)" },
  { cron: SWEEP_CRON },
  () => sweep(db)
);

export default sweep;
