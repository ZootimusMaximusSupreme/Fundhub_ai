// yd-recheck (daily) — spec §6. Renters whose last finished screening is older than
// recheckDays (30), and renters 90 days before their lease ends, get a new
// screening under the RECHECK CONSENT stored at sign-up. The renter is never asked.
// The result recomputes their matches. A renter whose answer on an OPEN
// application drops to "no" produces a staff event (application.match_dropped).
//
// WHO IS DUE is decided by src/yesdoor/schedule.mjs (pure, tested). This file
// reads the rows, calls it, and does the writing. A renter with no recheck
// consent row is never screened.
//
// ONE RENTER, ONE TRANSACTION, ONE LOCK. Each renter is re-checked in its own
// transaction under a row lock, and "is this renter still due?" is asked again
// inside the lock. A cron that runs twice, or overlaps itself, screens nobody
// twice: the second pass waits for the lock, sees the fresh screening and skips.
// One renter failing does not stop the pass; it is counted and the next pass
// tries again.
//
// NO NEW COST FROM A SANDBOX: the provider is crs-sandbox (providers/), which
// never touches the network. Nothing here transmits.

import { YD_CRON } from "../config.mjs";
import { rentersDueForRecheck } from "../schedule.mjs";
import { recordEvent } from "../events.mjs";
import { latestCompleteScreening, runMatching } from "../store/matching.mjs";
import { DEFAULT_PROVIDERS, latestRecheckConsent, runScreening } from "../store/screenings.mjs";
import { withTransaction } from "../tx.mjs";

/** Renters the schedule must look at, in the shape schedule.mjs reads. Narrowed to
 *  one renter when `renterId` is given (the in-lock re-check). */
async function dueInput(db, { orgId, renterId = null }) {
  const r = await db.query(
    `SELECT r.id, r.stage,
            (SELECT max(s.result_at) FROM yd_screenings s
              WHERE s.renter_id = r.id AND s.org_id = r.org_id AND s.status = 'complete') AS last_screening_at,
            (SELECT to_char(max(a.lease_end), 'YYYY-MM-DD') FROM yd_applications a
              WHERE a.renter_id = r.id AND a.org_id = r.org_id
                AND a.stage IN ('moved_in', 'invoiced', 'paid', 'safe')) AS lease_end,
            EXISTS (SELECT 1 FROM yd_consents c
                     WHERE c.renter_id = r.id AND c.org_id = r.org_id AND c.kind = 'recheck') AS recheck_consent
       FROM yd_renters r
      WHERE r.org_id = $1
        AND r.stage IN ('screened', 'matched', 'booked', 'placed', 'lifetime')
        AND ($2::uuid IS NULL OR r.id = $2)
      ORDER BY r.id`, [orgId, renterId]);
  return r.rows.map((x) => ({
    id: x.id, stage: x.stage, lastScreeningAt: x.last_screening_at, leaseEnd: x.lease_end, recheckConsent: x.recheck_consent
  }));
}

const failedRules = (m) => (m?.reasons || []).filter((x) => x.result === "fail").map((x) => x.rule);

/**
 * Re-check one renter, inside its own transaction.
 * @returns {Promise<{ outcome: "rechecked"|"skipped", reason?: string, dropped?: number, screeningStatus?: string }>}
 */
export async function recheckRenter(db, { orgId, renterId, now = new Date(), providers = DEFAULT_PROVIDERS }) {
  return withTransaction(db, async (tx) => {
    const renter = (await tx.query(
      `SELECT * FROM yd_renters WHERE id = $1 AND org_id = $2 FOR UPDATE`, [renterId, orgId])).rows[0];
    if (!renter) return { outcome: "skipped", reason: "no_renter" };

    // Still due, now that this renter is locked?
    const due = rentersDueForRecheck({ renters: await dueInput(tx, { orgId, renterId }), now });
    if (!due.length) return { outcome: "skipped", reason: "not_due" };

    const consent = await latestRecheckConsent(tx, { orgId, renterId });
    if (!consent) return { outcome: "skipped", reason: "no_recheck_consent" };
    const prior = await latestCompleteScreening(tx, { orgId, renterId });
    if (!prior) return { outcome: "skipped", reason: "no_prior_screening" };

    const screened = await runScreening(tx, {
      orgId, renter, consentId: consent.id, kind: "recheck", prior, providers
    });
    if (screened.status !== "complete") {
      return { outcome: "rechecked", screeningStatus: screened.status, dropped: 0 };
    }

    await recordEvent(tx, {
      orgId, name: "renter.rechecked", entityKind: "renter", entityId: renterId,
      payload: { reason: due[0].reason, screening_id: screened.id, consent_id: consent.id },
      actorKind: "system", idempotencyKey: `recheck:${screened.id}`
    });

    const run = await runMatching(tx, { orgId, renter, now });
    if (!run.ok) return { outcome: "rechecked", screeningStatus: "complete", dropped: 0 };

    // An open application whose building now says "no" is a staff matter.
    let dropped = 0;
    for (const app of run.openApplications) {
      const before = run.previous.get(app.buildingId);
      const now_ = run.results.find((m) => m.buildingId === app.buildingId);
      if (before && before !== "no" && now_ && now_.result === "no") {
        const ev = await recordEvent(tx, {
          orgId, name: "application.match_dropped", entityKind: "application", entityId: app.id,
          payload: {
            from: before, to: "no", renter_id: renterId, building_id: app.buildingId,
            application_stage: app.stage, screening_id: screened.id, failed_rules: failedRules(now_)
          },
          actorKind: "system", idempotencyKey: `match-dropped:${app.id}:${screened.id}`
        });
        if (ev.written) dropped += 1;
      }
    }
    return { outcome: "rechecked", screeningStatus: "complete", dropped };
  });
}

/**
 * One daily pass. Bounded by `limit`; whatever it does not reach is still due tomorrow.
 * @returns {Promise<{ ok: boolean, count: number, due: number, rechecked: number, skipped: number,
 *                     dropped: number, failed: number, errors: string[] }>}
 */
export async function recheckSweep(db, { orgId, now = new Date(), limit = YD_CRON.recheckBatch, providers = DEFAULT_PROVIDERS } = {}) {
  const out = { ok: true, count: 0, due: 0, rechecked: 0, skipped: 0, dropped: 0, failed: 0, errors: [] };
  if (!orgId) return { ...out, ok: false, errors: ["orgId required"] };
  let due;
  try {
    due = rentersDueForRecheck({ renters: await dueInput(db, { orgId }), now });
  } catch (e) {
    return { ...out, ok: false, errors: [String(e?.message || e).slice(0, 300)] };
  }
  out.due = due.length;

  for (const d of due.slice(0, limit)) {
    try {
      const r = await recheckRenter(db, { orgId, renterId: d.renterId, now, providers });
      if (r.outcome === "rechecked" && r.screeningStatus === "complete") {
        out.rechecked += 1;
        out.dropped += r.dropped || 0;
      } else if (r.outcome === "rechecked") {
        // The provider could not give a usable answer. The failed screening is on
        // file; the renter is still due, so tomorrow's pass tries again.
        out.failed += 1;
      } else out.skipped += 1;
    } catch (e) {
      out.failed += 1;
      if (out.errors.length < 5) out.errors.push(`${d.renterId}: ${String(e?.message || e).slice(0, 160)}`);
    }
  }
  out.count = out.rechecked;
  return out;
}
