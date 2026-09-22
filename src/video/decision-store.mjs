// Every database statement the phone-approval door makes.
//
// The sibling of src/vsl/watch-store.mjs, and built the same way for the same
// reason: this code runs for a request that carries no session, so it must
// never be able to reach anything but the one row its token names.
//
// ═══════════════════════════════════════════════════════════════════════════
// HOW IT IS KEPT TO ONE ROW
//
// withDecisionScope() opens a transaction and sets fundhub.ad_video_decision to
// the token's SELECTOR for the length of it. 390's policies then let this code
// see and move that one token and the one take it points at. fundhub.actor is
// never set, so fundhub_is_staff() is false for everything inside: this door
// never becomes staff.
//
//   * set_config(name, value, true), never `SET fundhub.ad_video_decision = …`.
//     SET takes a literal and cannot be parameterised, and interpolating a
//     caller-supplied string into it is the injection this codebase refuses to
//     write. The selector is shape-checked before the transaction opens as
//     well, so a malformed one never reaches a bind either.
//
//   * is_local = true, so the setting dies with the transaction. src/db.mjs is
//     a POOL and a session-scoped setting would outlive the request, leaking
//     one tap's scope into whichever request borrowed the connection next.
//     Recorded the hard way already: a bare SET on the production pooler stuck
//     the live pool read-only.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE SPEND IS ONE STATEMENT, AND THAT IS THE WHOLE REPLAY GUARD
//
// spendDecision() is a single UPDATE … WITH … UPDATE. It is not a read followed
// by a write, and the difference is the entire feature:
//
//   A read-then-write lets two taps a millisecond apart both read used_at IS
//   NULL, both decide they are first, and both write. The second overturns the
//   first, silently, and Chris's "reject" becomes an "approve" nobody chose.
//
//   A conditional UPDATE cannot do that. Postgres re-evaluates an UPDATE's
//   WHERE against the current row version under the row lock, so the second tap
//   re-reads used_at as non-NULL and matches nothing. It returns zero rows, the
//   door answers "already decided", and the first decision stands.
//
// The verifier comparison happens in JavaScript, between the two statements,
// because a constant-time compare is not something SQL offers. That is not a
// gap: the SELECT looks up by SELECTOR only, which is public, and the UPDATE is
// guarded by the token's own id. Nothing in between authorises anything.

import { pool as defaultPool } from "../db.mjs";
import { SELECTOR_RE, expiresAt, mintDecisionToken } from "./decision-token.mjs";

/**
 * withDecisionScope(selector, fn, { pool }) → fn's return value
 *
 * Throws on a malformed selector rather than opening a transaction for it. See
 * the header.
 */
export async function withDecisionScope(selector, fn, { pool = defaultPool } = {}) {
  if (typeof fn !== "function") throw new Error("withDecisionScope: a callback is required");
  if (!SELECTOR_RE.test(String(selector || ""))) {
    throw new Error("withDecisionScope: refusing to open a transaction for a malformed selector");
  }

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('fundhub.ad_video_decision', $1, true)", [selector]);
    const out = await fn({ query: (sql, params) => client.query(sql, params) });
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* the original error is the one worth throwing */ }
    throw err;
  } finally {
    client.release();
  }
}

/* WHAT THE CONFIRMATION PAGE IS ALLOWED TO KNOW.

   Named here as one list rather than `SELECT *` so that a column added to
   ad_videos later — a transcript, a match confidence, a failure reason — does
   not silently start being served to an open door. Everything here is something
   Chris needs to see to decide: which ad, which take, how long it runs, and the
   finished file itself. */
const VIDEO_FIELDS = `
  v.id, v.org_id, v.ad_id, v.take_no, v.status, v.video_kind,
  v.finished_version, v.duration_seconds, v.width, v.height,
  v.submagic_download_url
`;

/**
 * loadDecisionTarget(tx, selector) → row | null
 *
 * The token and the take it names, in one read. Null when the selector matches
 * nothing — which, given 390's policies, is also what a selector belonging to
 * somebody else's token looks like from in here.
 *
 * Returns the token's verifier hash for the caller to compare. Reaching this
 * row proves only that a selector was guessed; it authorises nothing.
 */
export async function loadDecisionTarget(tx, selector) {
  const { rows } = await tx.query(
    `SELECT t.id            AS token_id,
            t.org_id        AS token_org_id,
            t.ad_video_id,
            t.verifier_sha256,
            t.expires_at,
            t.used_at,
            t.decision      AS previous_decision,
            ${VIDEO_FIELDS}
       FROM ad_video_decision_tokens t
       JOIN ad_videos v
         ON v.id = t.ad_video_id
        AND v.org_id = t.org_id
      WHERE t.selector = $1`,
    [selector]
  );
  return rows[0] || null;
}

/**
 * spendDecision(tx, spec) → { spent, video } — one statement, see the header.
 *
 * spec: { tokenId, decision, nextStatus, decidedBy, reason }
 *
 * `spent` is false when the key was already used, had expired, or the take had
 * moved on. The caller cannot tell those apart from the return value and does
 * not need to: all three are the same refusal to whoever tapped.
 */
export async function spendDecision(tx, {
  tokenId,
  decision,
  nextStatus,
  decidedBy = "chris",
  reason = null
} = {}) {
  const { rows } = await tx.query(
    `WITH spent AS (
       UPDATE ad_video_decision_tokens t
          SET used_at  = now(),
              decision = $2
        WHERE t.id = $1
          AND t.used_at IS NULL
          AND t.expires_at > now()
          AND EXISTS (
                SELECT 1 FROM ad_videos v
                 WHERE v.id = t.ad_video_id
                   AND v.org_id = t.org_id
                   AND v.status = 'awaiting_approval')
       RETURNING t.id, t.org_id, t.ad_video_id
     ),
     moved AS (
       UPDATE ad_videos v
          SET status          = $3,
              approved_at     = CASE WHEN $3 = 'approved' THEN now() ELSE v.approved_at END,
              approved_by     = CASE WHEN $3 = 'approved' THEN $4   ELSE v.approved_by END,
              rejected_reason = CASE WHEN $3 = 'rejected' THEN $5   ELSE v.rejected_reason END,
              updated_at      = now()
         FROM spent s
        WHERE v.id = s.ad_video_id
          AND v.org_id = s.org_id
          AND v.status = 'awaiting_approval'
       RETURNING v.id, v.ad_id, v.take_no, v.status, v.finished_version
     )
     -- Scalar subqueries, not a join, so this returns exactly one row even when
     -- "moved" is empty -- which is the case the caller most needs to tell
     -- apart from a success. A data-modifying CTE runs once however many times
     -- it is referenced, so neither UPDATE happens twice here.
     SELECT (SELECT count(*) FROM spent)::int      AS spent_count,
            (SELECT id               FROM moved)   AS id,
            (SELECT ad_id            FROM moved)   AS ad_id,
            (SELECT take_no          FROM moved)   AS take_no,
            (SELECT status           FROM moved)   AS status,
            (SELECT finished_version FROM moved)   AS finished_version`,
    [tokenId, decision, nextStatus, decidedBy, reason]
  );

  const row = rows[0] || null;
  /* Both halves have to have happened. spent_count of 1 with no video row means
     the take moved between this statement's snapshot and its write — a worker
     failing it at the same moment. Rare, and reported as a refusal rather than
     as a success, because the take is not in the state the caller was told. */
  const spent = Boolean(row && row.spent_count === 1 && row.id);
  return {
    spent,
    video: spent
      ? {
          id: row.id,
          adId: row.ad_id,
          takeNo: row.take_no,
          status: row.status,
          finishedVersion: row.finished_version
        }
      : null
  };
}

/**
 * mintTokenFor(db, spec) → { token, expiresAt }
 *
 * STAFF ONLY. 390's insert policy requires fundhub_is_staff(), so this runs
 * from the sweeper that buzzes the phone, never from the open door.
 *
 * Every earlier unspent key for the same take is expired in the same statement.
 * Without that, a take that is notified twice has two live keys, and the older
 * notification stays tappable forever — which is the standing key this whole
 * design exists to avoid.
 */
export async function mintTokenFor(db, {
  orgId,
  adVideoId,
  ttlMinutes,
  now = new Date()
} = {}) {
  const { token, selector, verifierHash } = mintDecisionToken();
  const expires = expiresAt(now, ttlMinutes);

  await db.query(
    `UPDATE ad_video_decision_tokens
        SET expires_at = now()
      WHERE ad_video_id = $1
        AND used_at IS NULL
        AND expires_at > now()`,
    [adVideoId]
  );

  await db.query(
    `INSERT INTO ad_video_decision_tokens
       (org_id, ad_video_id, selector, verifier_sha256, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [orgId, adVideoId, selector, verifierHash, expires]
  );

  return { token, expiresAt: expires };
}

export default {
  withDecisionScope,
  loadDecisionTarget,
  spendDecision,
  mintTokenFor
};
