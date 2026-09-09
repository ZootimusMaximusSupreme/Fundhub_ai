// src/vsl/watch-store.mjs — putting one VSL watch beacon into the database.
//
// Two jobs and nothing else: open a transaction that says who is writing, and
// write the two rows. The validating is src/vsl/watch-beacon.mjs's job and the
// HTTP is api/public/vsl-watch.mjs's; this module is the middle, so it can be
// exercised on its own by src/http/vsl-watch.pg.test.mjs.
//
// ═══════════════════════════════════════════════════════════════════════════
// THIS CODE NEVER BECOMES STAFF, AND THAT IS THE POINT
//
// Every other endpoint that touches an RLS-guarded table calls asStaff()
// (api/read/video-stats.mjs:25 says why). This one must not, because it is the
// one door a stranger can knock on. If it ran as staff, a bug in it would have
// the whole database in reach.
//
// So it uses the narrowest possible scope instead: withVslVisitor() sets
// fundhub.vsl_visitor for the length of one transaction, and 379's policies
// then let this code reach the rows carrying that one visitor id and nothing
// else. Not another visitor's rows. Not another table. There is no path from
// here to a client, a lead, a partner or a payment.
//
// THE ONE THING IT REACHES BEYOND THAT, AND WHAT IT COSTS. The flood ceiling has
// to know how busy the whole site has been, which is by definition wider than
// one visitor. It asks fundhub_vsl_recent_count() (379, Part 3b), which is
// SECURITY DEFINER and can therefore see the whole table — but it returns an
// INTEGER and there is no shape of call to it that returns a row, an id or a
// visitor. So the widest thing this code can learn about anybody else is a
// count. It still never becomes staff.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THE VISITOR CAN READ ITS OWN ROWS AT ALL
//
// It looks like a beacon should only ever need INSERT. It cannot work that way.
// Postgres applies SELECT policies to INSERT ... ON CONFLICT DO UPDATE and to
// every RETURNING clause, so a writer with no read policy could not upsert and
// could not learn the id of the row it just wrote. The rows it can see are the
// ones its own browser wrote. 379's header sets this out in full.
//
// ═══════════════════════════════════════════════════════════════════════════
// EVERY WRITE IS SAFE TO REPEAT
//
// A beacon fires on page-hide, and a browser may well send it twice. Nothing
// here counts, appends or increments:
//
//   * the session is upserted on (visitor_id, session_key), and 379's
//     trg_vsl_watch_sessions_forward makes the merge move forward only —
//     numbers rise, flags stick, identity is frozen;
//   * the curve is merged by union, so re-sending seconds that are already
//     stored changes nothing;
//   * sample_count is a running total the page keeps, taken with GREATEST, so
//     the same number arriving twice is the same number.
//
// Send the same beacon a hundred times and the row is what it was after the
// first one.

import { pool as defaultPool } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { WATCH_LIMITS } from "./watch-beacon.mjs";

/* The shape guard lives here as well as in the endpoint and in 379, because
   this value goes into a database setting and a setting is not a bind
   parameter. set_config() IS parameterised below — the value never reaches SQL
   as text — but the check is cheap and the failure it prevents is not. */
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/* withVslVisitor(visitorId, fn, deps) → fn's return value

   The sibling of withPartnerScope() in src/partners/rls.mjs, and deliberately
   built the same way, down to the reasons:

     * set_config(name, value, true), never `SET fundhub.vsl_visitor = ...`.
       SET takes a literal and cannot be parameterised, and interpolating a
       caller-supplied string into a SET statement is exactly the injection this
       codebase already refuses to write.

     * is_local = true, so the setting dies with the transaction. src/db.mjs is
       a POOL: a session-scoped setting would outlive the request and leak one
       visitor's scope into whichever request borrowed that connection next.
       That failure is silent and intermittent, so there is no option here that
       does it the other way.

     * fundhub.actor is left unset, which means fundhub_is_staff() is false for
       everything inside. This code is never staff. */
export async function withVslVisitor(visitorId, fn, { pool = defaultPool } = {}) {
  if (typeof fn !== "function") throw new Error("withVslVisitor: a callback is required");
  if (!ID_RE.test(String(visitorId || ""))) {
    throw new Error("withVslVisitor: refusing to open a transaction for a malformed visitor id");
  }

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('fundhub.vsl_visitor', $1, true)", [visitorId]);
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

/* checkVisitorRate(tx, spec) → { limited, reason, retryAfterMinutes }

   TWO COUNTS, both from real rows, so both hold across cold starts and across
   however many server instances are warm — the same reason
   src/hiring/apply-public.mjs counts its rows instead of keeping a number in
   memory.

   ONE — PER VISITOR. How many NEW viewings this browser has opened lately. This
   SELECT reads only this visitor's own rows, because that is all 379's read
   policy lets this transaction see, and for this question that is the right
   scope.

   TWO — SITE-WIDE, and this is the guard that actually holds. A visitor id is a
   string the caller makes up for free: send a new one each time and the count
   above resets each time. So the whole site is counted too, and a NEW viewing is
   refused when that is over the ceiling.

   ⚠️ IT MUST GO THROUGH fundhub_vsl_recent_count(). A plain
      `SELECT count(*) FROM vsl_watch_sessions` written here returns only THIS
      visitor's rows — 379's policies hide the rest of the table from this
      transaction on purpose — so it would look correct, always read 0 or 1, and
      never fire. The function is SECURITY DEFINER and can see the whole table,
      and it can only ever hand back a NUMBER: no row, no id, no visitor. This
      code still never becomes staff.

   A BEACON FOR A VIEWING THAT ALREADY EXISTS IS NEVER REFUSED, by either count,
   including in the middle of a flood. It cannot make the table grow — it is an
   update to one row — and refusing it would throw away exactly the reports that
   matter most: the later ones, from the people who watched the longest.

   `limits` is merged over the defaults rather than replacing them, so a caller
   or a test that passes only one number does not silently switch the other guard
   off. */
export async function checkVisitorRate(tx, { visitorId, sessionKey, limits } = {}) {
  const L = { ...WATCH_LIMITS, ...(limits || {}) };

  const { rows } = await tx.query(
    `SELECT
       (SELECT count(*)::int FROM vsl_watch_sessions
         WHERE visitor_id = $1
           AND started_at > now() - ($3::int * interval '1 minute')) AS recent,
       EXISTS (SELECT 1 FROM vsl_watch_sessions
                WHERE visitor_id = $1 AND session_key = $2) AS known,
       fundhub_vsl_recent_count($4::int) AS site_recent`,
    [visitorId, sessionKey, L.windowMinutes, L.siteWindowMinutes]
  );
  const { recent, known, site_recent: siteRecent } = rows[0];

  if (known) return { limited: false, reason: null, retryAfterMinutes: 0 };

  if (Number(recent) >= L.maxNewSessionsPerVisitor) {
    return { limited: true, reason: "visitor_burst", retryAfterMinutes: L.windowMinutes };
  }
  if (Number(siteRecent) >= L.maxNewSessionsSiteWide) {
    return { limited: true, reason: "site_flood", retryAfterMinutes: L.siteWindowMinutes };
  }
  return { limited: false, reason: null, retryAfterMinutes: 0 };
}

/* upsertWatchSession(tx, orgId, v) → the session row id.

   Every mutable column is handed over as EXCLUDED and the merging is left to
   379's trigger. That is deliberate: written here, the "only move forward" rule
   would be one statement's opinion, and the next statement anybody adds would
   not have it. In the trigger it is the table's rule and applies to every
   writer forever.

   RETURNING id is legal because the visitor can see its own row — see the
   header. */
export async function upsertWatchSession(tx, orgId, v) {
  const { rows } = await tx.query(
    `INSERT INTO vsl_watch_sessions
       (org_id, video_key, video_duration_seconds, visitor_id, session_key,
        max_position_seconds, watched_fraction, max_position_after_unmute_seconds,
        unmuted, finished, autoplay_blocked,
        replay_count, rewind_count, skip_count,
        utm_content, page_url, referrer, device_hint)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (visitor_id, session_key) DO UPDATE SET
       video_duration_seconds = EXCLUDED.video_duration_seconds,
       max_position_seconds   = EXCLUDED.max_position_seconds,
       watched_fraction       = EXCLUDED.watched_fraction,
       max_position_after_unmute_seconds = EXCLUDED.max_position_after_unmute_seconds,
       unmuted                = EXCLUDED.unmuted,
       finished               = EXCLUDED.finished,
       autoplay_blocked       = EXCLUDED.autoplay_blocked,
       replay_count           = EXCLUDED.replay_count,
       rewind_count           = EXCLUDED.rewind_count,
       skip_count             = EXCLUDED.skip_count,
       utm_content            = EXCLUDED.utm_content,
       page_url               = EXCLUDED.page_url,
       referrer               = EXCLUDED.referrer,
       device_hint            = EXCLUDED.device_hint
     RETURNING id`,
    [
      orgId, v.videoKey, v.durationSeconds, v.visitorId, v.sessionKey,
      v.maxPositionSeconds, v.watchedFraction, v.maxPositionAfterUnmuteSeconds,
      v.unmuted, v.finished, v.autoplayBlocked,
      v.replayCount, v.rewindCount, v.skipCount,
      v.utmContent, v.pageUrl, v.referrer, v.deviceHint
    ]
  );
  return rows[0].id;
}

/* upsertWatchPositions(tx, sessionId, v) — the curve.

   Skipped entirely when the beacon carried neither a curve nor a running total.
   A row of two NULLs says nothing that the absence of a row does not already
   say, and writing one would turn "we were never told" into "we asked and got
   nothing", which are different facts.

   The union is fundhub_vsl_merge_positions (379), not an expression written
   out here, so the rule has one home. */
export async function upsertWatchPositions(tx, sessionId, v) {
  if (!v.samples && v.sampleCount === null) return false;
  await tx.query(
    `INSERT INTO vsl_watch_positions (session_id, visitor_id, seconds_seen, sample_count)
     VALUES ($1,$2,$3::integer[],$4)
     ON CONFLICT (session_id) DO UPDATE SET
       seconds_seen = fundhub_vsl_merge_positions(
                        vsl_watch_positions.seconds_seen, EXCLUDED.seconds_seen),
       sample_count = GREATEST(vsl_watch_positions.sample_count, EXCLUDED.sample_count),
       updated_at   = now()`,
    [sessionId, v.visitorId, v.samples, v.sampleCount]
  );
  return true;
}

/* recordWatchBeacon(value, deps) → { ok } | { ok: false, limited: true }

   `value` is what parseWatchBeacon returned. Nothing here re-checks it; if this
   is ever called with something else, 379's CHECK constraints refuse the row
   and the error is thrown rather than swallowed.

   The org is resolved OUTSIDE the scoped transaction, on the ordinary pool,
   exactly as api/public/affiliate-click.mjs does. It is a lookup of the one
   default company and has nothing to do with a visitor. */
export async function recordWatchBeacon(value, deps = {}) {
  const database = deps.db || (await import("../db.mjs")).db;
  const resolveOrg = deps.resolveDefaultOrg || resolveDefaultOrg;
  const scope = deps.withVslVisitor || withVslVisitor;
  const limits = deps.limits || WATCH_LIMITS;

  const orgId = await resolveOrg(database);

  return scope(value.visitorId, async (tx) => {
    const rate = await checkVisitorRate(tx, {
      visitorId: value.visitorId, sessionKey: value.sessionKey, limits
    });
    /* The wait is handed back rather than worked out again by the endpoint,
       because the two guards have two different windows and only this function
       knows which one fired. */
    if (rate.limited) {
      return {
        ok: false, limited: true,
        reason: rate.reason,
        retryAfterMinutes: rate.retryAfterMinutes
      };
    }

    const sessionId = await upsertWatchSession(tx, orgId, value);
    const wroteCurve = await upsertWatchPositions(tx, sessionId, value);
    return { ok: true, limited: false, sessionId, wroteCurve };
  });
}

export default recordWatchBeacon;
