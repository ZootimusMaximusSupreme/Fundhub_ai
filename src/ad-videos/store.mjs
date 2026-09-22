// src/ad-videos/store.mjs — reading and writing one filmed take.
//
// THE ONE MODULE THE WORKERS IMPORT. Every step of the pipeline — the Drive
// poll, the stager, the transcriber, the matcher, the Submagic caller, the
// webhook, the notifier, the deliverer — moves its row through this file and
// nowhere else. That is deliberate: the state machine is only a guard if every
// write goes past it.
//
// ═══════════════════════════════════════════════════════════════════════════
// EVERY WRITE RUNS AS STAFF, AND EVERY WRITE NAMES ITS ORG
//
// ad_videos carries FORCEd row-level security (389, Part 5). A bare db.query()
// against it is anonymous to those policies and matches ZERO rows — it does not
// error, it just silently does nothing, which is the failure mode that makes a
// test look green while proving nothing. So the reads and writes here take a
// `tx` that a caller opened with asStaff() from src/partners/rls.mjs.
//
// The one exception is the phone tap, which must NOT become staff. It lives in
// src/ad-videos/token.mjs and opens its own one-row transaction.
//
// org_id is in every WHERE clause anyway, the same call src/partners/rls.mjs's
// header makes: inside a scoped transaction the predicate is redundant, outside
// it the query is still correct, and a reviewer can see the intent without
// reading the policies.
//
// ═══════════════════════════════════════════════════════════════════════════
// EVERY STEP IS SAFE TO RUN TWICE
//
// Inngest retries, and the Drive poll runs every 2-5 minutes over a folder that
// still holds the file it saw last time. So:
//   * claimTake() upserts on (org_id, drive_raw_file_id) and returns the row
//     that already existed rather than making a second one.
//   * advance() names the state it expects to be leaving. A retry whose first
//     run actually succeeded matches no row and gets null — which the caller
//     reads as "somebody already did this", not as an error.
// Nothing here counts, appends or increments.

import { asStaff } from "../partners/rls.mjs";
import {
  STATES, TRANSITIONS, TERMINAL_STATES, WORKING_STATES, HUMAN_ONLY, STATE_MEANING,
  isState, isTerminal, isHumanOnly, canTransition, nextStates,
  transition, AdVideoStateError
} from "./states.mjs";
import { normalizeAdId, normalizeTakeNo } from "./naming.mjs";

/* Re-exported so a worker needs ONE import to move a row and to reason about
   where it may go. Builder B codes against this list. */
export {
  STATES, TRANSITIONS, TERMINAL_STATES, WORKING_STATES, HUMAN_ONLY, STATE_MEANING,
  isState, isTerminal, isHumanOnly, canTransition, nextStates,
  transition, AdVideoStateError, asStaff
};

/* The columns a worker and the queue screen read. NOT `SELECT *`: transcript is
   a wall of text nothing on a screen wants, and source_url is a link that
   should not travel further than the worker handing it to Submagic. Ask for
   them by name with the `withTranscript` flag when a step actually needs them. */
const ROW_COLUMNS =
  `id, org_id, partner_id, ad_id, take_no, script_id, script_path, recorder,
   video_kind, status, drive_raw_file_id, drive_raw_name, width, height,
   duration_seconds, resolution_ok, storage_raw_key, match_confidence,
   submagic_project_id, finished_url, storage_final_key, finished_version,
   paul_folder_id, drive_final_file_id, approval_expires_at, approved_at,
   approved_by, rejected_reason, failure_reason, created_at, updated_at`;

const FULL_COLUMNS = `${ROW_COLUMNS}, transcript, source_url`;

const cols = (withTranscript) => (withTranscript ? FULL_COLUMNS : ROW_COLUMNS);

export class AdVideoStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AdVideoStoreError";
    this.code = code;
  }
}

/* The columns a worker may set on its way through. Anything not on this list
   cannot be written by advance() at all — status, the approval fields and the
   timestamps are moved by their own named functions, so a worker cannot set
   `approved_at` by passing a patch. */
const PATCHABLE = new Set([
  "script_id", "script_path", "recorder", "video_kind",
  "drive_raw_file_id", "drive_raw_name", "width", "height", "duration_seconds",
  "storage_raw_key", "source_url", "transcript", "match_confidence",
  "submagic_project_id", "finished_url", "storage_final_key", "finished_version",
  "paul_folder_id", "drive_final_file_id", "failure_reason", "rejected_reason"
]);

function buildPatch(patch, startIndex) {
  const sets = [];
  const params = [];
  let i = startIndex;
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === undefined) continue;
    if (!PATCHABLE.has(key)) {
      throw new AdVideoStoreError("unpatchable_column",
        `"${key}" cannot be set this way — status and the approval fields move ` +
        `through their own functions, so a worker cannot write them by accident`);
    }
    sets.push(`${key} = $${i}`);
    params.push(value);
    i += 1;
  }
  return { sets, params };
}

// ───────────────────────────────────────────────────────────────────────────
// Reads
// ───────────────────────────────────────────────────────────────────────────

export async function findById(tx, { orgId, id, withTranscript = false }) {
  const r = await tx.query(
    `SELECT ${cols(withTranscript)} FROM ad_videos WHERE id = $1 AND org_id = $2`,
    [id, orgId]
  );
  return r.rows[0] || null;
}

/** The Drive poll's dedupe read: have we already got a row for this file? */
export async function findByDriveFileId(tx, { orgId, driveFileId, withTranscript = false }) {
  const r = await tx.query(
    `SELECT ${cols(withTranscript)} FROM ad_videos
      WHERE org_id = $1 AND drive_raw_file_id = $2`,
    [orgId, driveFileId]
  );
  return r.rows[0] || null;
}

/** The Submagic webhook arrives with a projectId and nothing else. */
export async function findBySubmagicProjectId(tx, { projectId, withTranscript = false }) {
  const r = await tx.query(
    `SELECT ${cols(withTranscript)} FROM ad_videos WHERE submagic_project_id = $1`,
    [projectId]
  );
  return r.rows[0] || null;
}

/** Every take of one ad number, oldest first. */
export async function listByAdId(tx, { orgId, adId, withTranscript = false }) {
  const r = await tx.query(
    `SELECT ${cols(withTranscript)} FROM ad_videos
      WHERE org_id = $1 AND ad_id = $2 ORDER BY take_no`,
    [orgId, normalizeAdId(adId)]
  );
  return r.rows;
}

/**
 * The queue read. `status` may be one state, several, or null for all.
 * Asks for limit + 1 so a caller can tell there is a next page, matching
 * src/http/read-api.mjs's page().
 */
export async function listByStatus(tx, { orgId, status = null, limit = 50, offset = 0 }) {
  const wanted = status == null
    ? null
    : (Array.isArray(status) ? status : [status]).map(String);

  if (wanted) {
    const bad = wanted.filter((s) => !isState(s));
    if (bad.length) {
      throw new AdVideoStoreError("unknown_state",
        `unknown state ${bad.join(", ")} — expected one of ${STATES.join(", ")}`);
    }
  }

  const r = await tx.query(
    `SELECT ${ROW_COLUMNS} FROM ad_videos
      WHERE org_id = $1
        AND ($2::text[] IS NULL OR status = ANY($2))
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
    [orgId, wanted, limit + 1, offset]
  );
  return r.rows;
}

/** The highest take number filmed for this ad, or 0 when none has been. */
export async function lastTakeNo(tx, { orgId, adId }) {
  const r = await tx.query(
    `SELECT COALESCE(MAX(take_no), 0)::int AS n FROM ad_videos
      WHERE org_id = $1 AND ad_id = $2`,
    [orgId, normalizeAdId(adId)]
  );
  return r.rows[0].n;
}

/**
 * Has this ad already finished? 389's partial unique index is what actually
 * refuses a second one; this is the read that lets a caller say so in words
 * instead of handing back a constraint violation.
 */
export async function finishedTake(tx, { orgId, adId }) {
  const r = await tx.query(
    `SELECT ${ROW_COLUMNS} FROM ad_videos
      WHERE org_id = $1 AND ad_id = $2 AND status IN ('approved', 'delivered')`,
    [orgId, normalizeAdId(adId)]
  );
  return r.rows[0] || null;
}

// ───────────────────────────────────────────────────────────────────────────
// Writes
// ───────────────────────────────────────────────────────────────────────────

/**
 * Start a take. `takeNo` is required and is never guessed inside a transaction
 * that could race another one — use nextTake() when you want the next free
 * number, which does the read and the write in one statement.
 */
export async function createTake(tx, {
  orgId, partnerId, adId, takeNo,
  status = "scripted", videoKind = "ad", ...rest
}) {
  if (!isState(status)) {
    throw new AdVideoStoreError("unknown_state", `"${status}" is not a state`);
  }
  const { sets, params } = buildPatch(rest, 7);
  const extraCols = sets.map((s) => s.split(" = ")[0]);
  const extraPlaceholders = sets.map((s) => s.split(" = ")[1]);

  const r = await tx.query(
    `INSERT INTO ad_videos
       (org_id, partner_id, ad_id, take_no, status, video_kind${extraCols.length ? ", " + extraCols.join(", ") : ""})
     VALUES ($1, $2, $3, $4, $5, $6${extraPlaceholders.length ? ", " + extraPlaceholders.join(", ") : ""})
     RETURNING ${FULL_COLUMNS}`,
    [orgId, partnerId, normalizeAdId(adId), normalizeTakeNo(takeNo), status, videoKind, ...params]
  );
  return r.rows[0];
}

/**
 * The next take of an ad — the diagram's rejected → filming arrow, which is a
 * NEW ROW and not this row moving backwards (389's header, states.mjs note 2).
 *
 * The take number is chosen INSIDE the INSERT, so two workers racing cannot
 * both read "2" and both try to write take 2. The loser hits
 * ad_videos_take_uq and can retry.
 */
export async function nextTake(tx, {
  orgId, partnerId, adId, status = "filming", videoKind = "ad", ...rest
}) {
  if (!isState(status)) {
    throw new AdVideoStoreError("unknown_state", `"${status}" is not a state`);
  }
  const clean = normalizeAdId(adId);
  const { sets, params } = buildPatch(rest, 6);
  const extraCols = sets.map((s) => s.split(" = ")[0]);
  const extraPlaceholders = sets.map((s) => s.split(" = ")[1]);

  const r = await tx.query(
    `INSERT INTO ad_videos
       (org_id, partner_id, ad_id, take_no, status, video_kind${extraCols.length ? ", " + extraCols.join(", ") : ""})
     SELECT $1, $2, $3,
            COALESCE((SELECT MAX(v.take_no) FROM ad_videos v
                       WHERE v.org_id = $1 AND v.ad_id = $3), 0) + 1,
            $4, $5${extraPlaceholders.length ? ", " + extraPlaceholders.join(", ") : ""}
     RETURNING ${FULL_COLUMNS}`,
    [orgId, partnerId, clean, status, videoKind, ...params]
  );
  return r.rows[0];
}

/**
 * The Drive poll's write: a row for this raw file, or the one that already
 * exists for it.
 *
 * ON CONFLICT DO NOTHING plus a follow-up SELECT, not DO UPDATE: seeing the
 * same file a second time must change NOTHING about a row that has already
 * moved on to staged or editing. Returns { row, created } so the caller knows
 * whether there is work to do.
 */
export async function claimTake(tx, {
  orgId, partnerId, adId, takeNo, driveFileId, driveName = null,
  videoKind = "ad", status = "raw_landed", ...rest
}) {
  if (!driveFileId) {
    throw new AdVideoStoreError("drive_file_required",
      "claimTake needs the Drive file id — it is what makes the claim repeatable");
  }
  const clean = normalizeAdId(adId);
  const take = normalizeTakeNo(takeNo);
  const { sets, params } = buildPatch(rest, 9);
  const extraCols = sets.map((s) => s.split(" = ")[0]);
  const extraPlaceholders = sets.map((s) => s.split(" = ")[1]);

  const ins = await tx.query(
    `INSERT INTO ad_videos
       (org_id, partner_id, ad_id, take_no, status, video_kind,
        drive_raw_file_id, drive_raw_name${extraCols.length ? ", " + extraCols.join(", ") : ""})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8${extraPlaceholders.length ? ", " + extraPlaceholders.join(", ") : ""})
     ON CONFLICT (org_id, drive_raw_file_id) WHERE drive_raw_file_id IS NOT NULL
     DO NOTHING
     RETURNING ${FULL_COLUMNS}`,
    [orgId, partnerId, clean, take, status, videoKind, driveFileId, driveName, ...params]
  );
  if (ins.rows[0]) return { row: ins.rows[0], created: true };

  const existing = await findByDriveFileId(tx, { orgId, driveFileId, withTranscript: true });
  return { row: existing, created: false };
}

/**
 * Move a take one state forward, and set whatever that step learned.
 *
 * TWO GUARDS, AND THEY CATCH DIFFERENT THINGS:
 *
 *   transition() refuses a move the machine does not allow — a step asking for
 *   something that could never be right, caught before any SQL runs, with the
 *   legal moves in the message.
 *
 *   `AND status = $from` in the WHERE clause refuses a move that WAS right when
 *   the worker read the row and is not right now — a retry whose first run
 *   succeeded, or two workers on one row. That one returns null rather than
 *   throwing, because it is the ordinary case on a queue that retries.
 *
 * A caller that gets null should read the row and stop, not retry.
 */
export async function advance(tx, { orgId, id, from, to, by = "worker", patch = {} }) {
  transition(from, to, { by });

  const { sets, params } = buildPatch(patch, 5);
  const assignments = ["status = $4", ...sets];

  const r = await tx.query(
    `UPDATE ad_videos
        SET ${assignments.join(", ")}
      WHERE id = $1 AND org_id = $2 AND status = $3
      RETURNING ${FULL_COLUMNS}`,
    [id, orgId, from, to, ...params]
  );
  return r.rows[0] || null;
}

/**
 * A step broke. `reason` is required — 389's ad_videos_failure_ck refuses a
 * failure with no words, and a pipeline that fails silently is the thing this
 * whole table was built to stop.
 *
 * Callable from any working state, so a worker's catch block never has to know
 * which state it was in to record what went wrong.
 */
export async function markFailed(tx, { orgId, id, from, reason }) {
  const words = String(reason == null ? "" : reason).trim().slice(0, 2000);
  if (!words) {
    throw new AdVideoStoreError("reason_required",
      "a failure must say why — a status of failed with no reason is the silence this table exists to prevent");
  }
  transition(from, "failed");
  const r = await tx.query(
    `UPDATE ad_videos
        SET status = 'failed', failure_reason = $4
      WHERE id = $1 AND org_id = $2 AND status = $3
      RETURNING ${FULL_COLUMNS}`,
    [id, orgId, from, words]
  );
  return r.rows[0] || null;
}

/**
 * Put the take back in the queue after a failure — the diagram's "retry the
 * broken step" arrow. Back to `staged`, because the raw file in Drive is the
 * one input that still exists after any later step died, and everything after
 * staging is derived from it.
 */
export async function retryFailed(tx, { orgId, id }) {
  transition("failed", "staged");
  const r = await tx.query(
    `UPDATE ad_videos
        SET status = 'staged', failure_reason = NULL
      WHERE id = $1 AND org_id = $2 AND status = 'failed'
      RETURNING ${FULL_COLUMNS}`,
    [id, orgId]
  );
  return r.rows[0] || null;
}

/**
 * The finished file is saved; hand the take a token and wait for Chris.
 *
 * The token is minted HERE rather than by the notifier, so the row is armed
 * before any notification goes out. A notification carrying a token the row
 * does not yet hold is a link that 404s on the one tap that matters.
 */
export async function armForApproval(tx, { orgId, id, from = "rendered", token, expiresAt, patch = {} }) {
  transition(from, "awaiting_approval");
  const { sets, params } = buildPatch(patch, 6);
  const assignments = [
    "status = 'awaiting_approval'",
    "approval_token = $4",
    "approval_expires_at = $5",
    ...sets
  ];
  const r = await tx.query(
    `UPDATE ad_videos
        SET ${assignments.join(", ")}
      WHERE id = $1 AND org_id = $2 AND status = $3
      RETURNING ${FULL_COLUMNS}`,
    [id, orgId, from, token, expiresAt, ...params]
  );
  return r.rows[0] || null;
}

/**
 * Chris said yes on a screen rather than on his phone.
 *
 * `by: "human"` is not decoration — states.mjs refuses a worker-caused move
 * into `approved`, and this function is only ever reached from a request a
 * person made. The phone tap is the other door and lives in token.mjs.
 */
export async function approve(tx, { orgId, id, approvedBy }) {
  const who = String(approvedBy == null ? "" : approvedBy).trim().slice(0, 120);
  if (!who) {
    throw new AdVideoStoreError("approver_required",
      "an approval must name who gave it — 389 refuses an approved_at with no approved_by");
  }
  transition("awaiting_approval", "approved", { by: "human" });
  const r = await tx.query(
    `UPDATE ad_videos
        SET status = 'approved', approved_at = now(), approved_by = $3,
            approval_token = NULL, approval_expires_at = NULL
      WHERE id = $1 AND org_id = $2 AND status = 'awaiting_approval'
      RETURNING ${FULL_COLUMNS}`,
    [id, orgId, who]
  );
  return r.rows[0] || null;
}

/** Chris said no on a screen. A reason is required, same as the phone tap. */
export async function reject(tx, { orgId, id, reason }) {
  const words = String(reason == null ? "" : reason).trim().slice(0, 500);
  if (!words) {
    throw new AdVideoStoreError("reason_required",
      "a rejection must say why, or the next take repeats the same mistake");
  }
  transition("awaiting_approval", "rejected", { by: "human" });
  const r = await tx.query(
    `UPDATE ad_videos
        SET status = 'rejected', rejected_reason = $3,
            approval_token = NULL, approval_expires_at = NULL
      WHERE id = $1 AND org_id = $2 AND status = 'awaiting_approval'
      RETURNING ${FULL_COLUMNS}`,
    [id, orgId, words]
  );
  return r.rows[0] || null;
}

/** The video and the brief are in Paul's folder. The end of the line. */
export async function markDelivered(tx, { orgId, id, paulFolderId, driveFinalFileId }) {
  transition("approved", "delivered");
  const r = await tx.query(
    `UPDATE ad_videos
        SET status = 'delivered', paul_folder_id = $3, drive_final_file_id = $4
      WHERE id = $1 AND org_id = $2 AND status = 'approved'
      RETURNING ${FULL_COLUMNS}`,
    [id, orgId, paulFolderId, driveFinalFileId]
  );
  return r.rows[0] || null;
}
