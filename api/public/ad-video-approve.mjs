// GET/POST /api/public/ad-video-approve — Chris taps Approve or Reject.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS DOOR IS OPEN
//
// Owner decision 5, 2026-09-22: Chris only films and approves, and approving is
// a tap in a phone notification. A push notification has no session, no cookie
// and no login — by the time he taps, there is nothing to authenticate with.
// So the random token in the link IS the credential.
//
// That is the same class of door as api/public/vsl-watch.mjs, and everything
// below is about keeping it from mattering:
//
//   1. THE TOKEN REACHES ONE ROW. 389's policies are written on
//      approval_token, so a request that has not declared a live token matches
//      ZERO rows — not "all rows", not an error. One stolen token gets one
//      take, and no path from there to a client, a script or a payment.
//   2. THE TOKEN EXPIRES, AND SQL CHECKS IT. Every statement in
//      src/ad-videos/token.mjs carries `approval_expires_at > now()` in its own
//      WHERE clause. A check done in JavaScript after the SELECT is a check that
//      still SELECTED.
//   3. THE TOKEN IS SPENT ON USE. Approve or reject clears it in the same
//      statement, so a link in an old notification stops working.
//   4. A DOUBLE TAP IS HARMLESS. `AND status = 'awaiting_approval'` lives in
//      the UPDATE, so the second tap matches no row and changes nothing.
//   5. NEVER STAFF. This handler opens its own one-row transaction with
//      withApprovalToken(). It never calls asStaff().
//   6. RATE LIMITED BY LENGTH, not by a counter. 24 random bytes is 48 hex
//      characters; there is no counter a notification link can carry, so the
//      answer to guessing is the size of the space.
//
// ═══════════════════════════════════════════════════════════════════════════
// *** EVERY REFUSAL IS THE SAME REFUSAL ***
//
// Unknown token, expired token, already approved, already rejected, malformed
// — all of them answer 404 { ok: false, error: "not_found" }. Telling them
// apart would answer questions for anyone probing the door: whether a guess was
// the right shape, whether a token ever existed, whether it has been used.
//
// The one thing that IS different is a successful decision, because Chris needs
// to see that his tap landed.
//
// ═══════════════════════════════════════════════════════════════════════════
// GET SHOWS, POST DECIDES
//
// GET is safe to repeat and changes nothing — it is what the notification's
// link opens, so Chris sees which take he is deciding on before he decides. It
// answers the ad number, the take number, the picture size and the finished
// video's link, and nothing else (token.mjs's TAP_COLUMNS).
//
// POST is the decision. It is never a GET, so the tap cannot be fired by a
// preview fetcher, a link scanner in a messaging app, or somebody's crawler
// following the URL out of a notification.
//
// NO CROSS-SITE HEADERS, because nothing crosses a site. The link is opened by
// a tap in a notification — a top-level navigation, or the notification app's
// own HTTP call — and neither is a browser fetch from another origin, so the
// browser's cross-site rules never come into it. api/public/slo-checkout.mjs
// needs them because its caller is a widget on apply.fundhub.ai; this one has
// no such caller, and adding the headers "in case" would widen the door for a
// page that does not exist.

import { pool } from "../../src/db.mjs";
import {
  readToken, withApprovalToken, findByToken, approveByToken, rejectByToken
} from "../../src/ad-videos/token.mjs";
import { folderNumber } from "../../src/ad-videos/naming.mjs";

const METHODS = "GET, POST";

/* One answer for every refusal. See the section above. */
const notFound = (res) => res.status(404).json({ ok: false, error: "not_found" });

export default async function handler(req, res, deps = {}) {
  const connect = deps.pool ?? pool;

  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    res.setHeader("Allow", METHODS);
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  let body = {};
  if (method === "POST") {
    try {
      body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    } catch {
      return res.status(400).json({ ok: false, error: "invalid_json" });
    }
  }

  const query = req.query || {};
  // The token may ride in the query string on the GET (it is what the
  // notification's link carries) and in the body on the POST.
  const token = readToken(body.token ?? query.token);
  // Shape failure answers exactly as an unknown token does. A caller must not
  // learn that their guess was at least the right length.
  if (!token) return notFound(res);

  try {
    if (method === "GET") {
      const row = await withApprovalToken(connect, token, (tx) => findByToken(tx, token));
      if (!row) return notFound(res);
      return res.status(200).json({ ok: true, video: shape(row) });
    }

    const decision = String(body.decision ?? body.action ?? "").trim().toLowerCase();
    if (decision !== "approve" && decision !== "reject") {
      // A caller who reached this line already held a live-shaped token, so
      // naming the two allowed words tells them nothing they did not have.
      return res.status(400).json({
        ok: false, error: "bad_decision", allowed: ["approve", "reject"]
      });
    }

    const decided = await withApprovalToken(connect, token, async (tx) => {
      if (decision === "approve") {
        return approveByToken(tx, token, { approvedBy: approverName(body) });
      }
      return rejectByToken(tx, token, { reason: body.reason });
    });

    // Null here is an unknown token, an expired one, or one already spent —
    // and all three answer the same way, deliberately.
    if (!decided) return notFound(res);

    return res.status(200).json({
      ok: true,
      decision,
      ad_id: decided.ad_id,
      take_no: decided.take_no,
      status: decided.status
    });
  } catch (err) {
    // The real message goes to the server log, which only we can read; the
    // caller gets one word. Same rule, same reason, as api/public/vsl-watch.mjs.
    console.error("ad-video-approve failed:", err && err.message);
    return res.status(500).json({ ok: false, error: "error" });
  }
}

/* Who tapped. There is no session, so this is a label and not an identity —
   389's ad_videos_approved_ck only demands that an approval names somebody.
   Defaults to "chris" because he is the only person the notification goes to
   (owner decision 5); a different name may be passed once it goes to two. */
function approverName(body) {
  const who = String(body.approved_by ?? body.approvedBy ?? "").trim();
  return who ? who.slice(0, 120) : "chris";
}

function shape(row) {
  return {
    ad_id: row.ad_id,
    take_no: row.take_no,
    status: row.status,
    video_kind: row.video_kind,
    // The padded form, for the heading. The link half of the ad number stays
    // row.ad_id — see src/ad-videos/naming.mjs.
    folder_name: folderNumber(row.ad_id),
    finished_url: row.finished_url,
    width: row.width,
    height: row.height,
    duration_seconds: row.duration_seconds,
    // Owner decision 2, 2026-09-22: flag a non-ad take that is not 4K, on the
    // screen where somebody is about to approve it.
    resolution_ok: row.resolution_ok
  };
}
