// src/ad-videos/token.mjs — the credential in the phone notification, and the
// one transaction shape that may use it.
//
// Owner decision 5, 2026-09-22: Chris only films and approves, and approval is
// a TAP IN A PHONE NOTIFICATION. A notification has no session, no cookie and
// no login. So the random string in the link IS the credential, and everything
// here is about keeping that from mattering more than it has to.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT ONE STOLEN TOKEN GETS SOMEBODY
//
// One take. They can see that take's row and say yes or no to it. They cannot
// list the queue, reach another ad, read a script, or touch anything else in
// the database — not because this file is careful, but because
// db/migrations/389_ad_videos.sql's policies are written on approval_token and
// a transaction that has not declared one matches ZERO rows.
//
// That is the same posture as api/public/vsl-watch.mjs, and the same mechanism:
// a transaction-local setting, never session-level, because src/db.mjs is a
// POOL and a session-level setting would leak one request's scope into whichever
// request borrowed that connection next.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE TOKEN EXPIRES, AND THE EXPIRY IS CHECKED IN SQL
//
// Not in JavaScript after the row is read. A token whose expiry is checked
// after the SELECT is a token that still SELECTED — and on this table the
// SELECT is most of what there is to steal. Every statement below carries
// `approval_expires_at > now()` in its own WHERE clause.

import crypto from "node:crypto";

/* 24 bytes → 48 hex characters. The 389 CHECK accepts 32-64. Wider than
   newSloRef()'s 12 bytes (api/public/slo-checkout.mjs:106) on purpose: an SLO
   ref identifies an order the payer already knows about, while this one is the
   ONLY thing standing between a stranger and approving a video Chris has not
   watched. There is no rate limit on guessing that a notification link can
   carry, so the answer is length. */
export const TOKEN_BYTES = 24;

/* Long enough that a notification sitting overnight still works, short enough
   that a link in an old message stops. Approval is meant to happen the same
   day — the plan has the worker buzzing Chris the moment the file is saved. */
export const TOKEN_TTL_HOURS = 72;

export const TOKEN_RE = /^[0-9a-f]{32,64}$/;

export class AdVideoTokenError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AdVideoTokenError";
    this.code = code;
  }
}

/** A fresh token and the moment it stops working. */
export function mintApprovalToken({ now = new Date(), ttlHours = TOKEN_TTL_HOURS } = {}) {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
  return { token, expiresAt };
}

/**
 * The token as it arrived from a URL, or null.
 *
 * Shape-checked before it ever reaches SQL, and returned as null rather than
 * thrown, because the caller's answer to a bad token and to an unknown token
 * must be the SAME answer — see the note in api/public/ad-video-approve.mjs.
 * Telling the two apart is how somebody learns which guesses are close.
 */
export function readToken(raw) {
  const s = String(raw == null ? "" : raw).trim().toLowerCase();
  return TOKEN_RE.test(s) ? s : null;
}

/* Timing-safe compare, for anywhere a token is checked in JavaScript rather
   than in a WHERE clause. Nothing in this module needs it today — the database
   does every comparison — but it exists so that the first caller who does need
   one does not reach for === and hand out a timing oracle. */
export function tokensMatch(a, b) {
  const x = readToken(a);
  const y = readToken(b);
  if (!x || !y || x.length !== y.length) return false;
  return crypto.timingSafeEqual(Buffer.from(x, "hex"), Buffer.from(y, "hex"));
}

/**
 * withApprovalToken(pool, token, fn) → fn's return value
 *
 * One transaction that has declared exactly which take it is allowed to touch.
 * The shape is src/partners/rls.mjs's withPartnerScope, narrowed to this one
 * setting — read that file's header for why the whole repo does scoping this
 * way rather than by hand-written WHERE clauses.
 *
 * `pool` is a function returning a pg pool, matching src/db.mjs's lazy pool().
 * It is passed in rather than imported so a test can drive this with its own.
 */
export async function withApprovalToken(pool, token, fn) {
  const clean = readToken(token);
  if (!clean) {
    throw new AdVideoTokenError("bad_token", "approval token is not the right shape");
  }
  if (typeof fn !== "function") {
    throw new AdVideoTokenError("bad_callback", "withApprovalToken: a callback is required");
  }

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    // is_local = true. Transaction-scoped, never session-scoped. See the header.
    await client.query("SELECT set_config('fundhub.ad_video_token', $1, true)", [clean]);
    const tx = { query: (sql, params) => client.query(sql, params), token: clean };
    const out = await fn(tx);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* the original error is the one worth throwing */ }
    throw err;
  } finally {
    client.release();
  }
}

/* The columns the phone tap is allowed to see. NOT `SELECT *`: the row carries
   a transcript, a storage key and the token itself, and none of those belong in
   an answer to an unauthenticated caller. Spelled out here, once, so the
   handler cannot widen it by accident. */
const TAP_COLUMNS =
  `id, ad_id, take_no, status, video_kind, finished_url,
   width, height, duration_seconds, resolution_ok`;

/**
 * The take this token names, if the token is live and the take is still waiting.
 * Anything else — unknown token, expired token, already decided — is null.
 */
export async function findByToken(tx, token) {
  const clean = readToken(token);
  if (!clean) return null;
  const r = await tx.query(
    `SELECT ${TAP_COLUMNS}
       FROM ad_videos
      WHERE approval_token = $1
        AND approval_expires_at > now()`,
    [clean]
  );
  return r.rows[0] || null;
}

/**
 * Chris tapped Approve.
 *
 * ONE STATEMENT, and the state test is IN it. `status = 'awaiting_approval'`
 * in the WHERE clause is what makes a double tap harmless: the second one
 * matches no row and changes nothing, rather than re-approving or throwing.
 * A read-then-write would have a gap between the two where both taps see
 * 'awaiting_approval'.
 *
 * The token is cleared in the same statement. A link that has been used is a
 * link that stops working, which is the only protection there is against it
 * sitting in a notification history forever.
 */
export async function approveByToken(tx, token, { approvedBy = "chris" } = {}) {
  const clean = readToken(token);
  if (!clean) return null;
  const r = await tx.query(
    `UPDATE ad_videos
        SET status              = 'approved',
            approved_at         = now(),
            approved_by         = $2,
            approval_token      = NULL,
            approval_expires_at = NULL
      WHERE approval_token      = $1
        AND approval_expires_at > now()
        AND status              = 'awaiting_approval'
      RETURNING id, ad_id, take_no, status`,
    [clean, String(approvedBy || "chris").slice(0, 120)]
  );
  return r.rows[0] || null;
}

/**
 * Chris tapped Reject.
 *
 * A reason is REQUIRED — 389's ad_videos_rejected_ck refuses a rejection with
 * no words, and the reason is the whole value of a rejection: "stumbled at
 * 0:12" is what stops take 3 repeating take 2's mistake. A tap with no typed
 * reason sends the default below rather than failing, because a rejection that
 * does not save is worse than a vague one.
 */
export async function rejectByToken(tx, token, { reason = null } = {}) {
  const clean = readToken(token);
  if (!clean) return null;
  const words = String(reason == null ? "" : reason).trim().slice(0, 500)
    || "rejected from the phone notification, no reason typed";
  const r = await tx.query(
    `UPDATE ad_videos
        SET status              = 'rejected',
            rejected_reason     = $2,
            approval_token      = NULL,
            approval_expires_at = NULL
      WHERE approval_token      = $1
        AND approval_expires_at > now()
        AND status              = 'awaiting_approval'
      RETURNING id, ad_id, take_no, status`,
    [clean, words]
  );
  return r.rows[0] || null;
}
