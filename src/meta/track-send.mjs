// A saved funnel track row → its Meta server events (Conversions API).
//
// Contract: the "Phase 4 contract" section of docs/tracking/meta-events.md.
// Called by recordTrack (src/funnel/track.mjs) right after the row is saved.
//
// Same shape as the step-1 ClickFunnels write in api/public/slo-interest.mjs
// (startCfWrite): the answer to the browser never waits on Meta. The job is
// handed to deps.onMetaSend; the door answers first, then waits up to
// META_WAIT_MS so the function host does not freeze the send. The outcome is
// recorded on the same events row as payload.meta with one small UPDATE.
//
// Who goes to Meta: real people only. A row whose actor is not "person"
// (automated or bot browser) never starts a job, and a session whose step-1
// contact row was marked an agent (company or test email) is skipped too.
//
// Nothing starts unless META_CAPI_ENABLED is "1" and the row maps to a Meta
// event and carries the browser's meta_event_id (src/meta/map.mjs). So with the
// switch off this adds no query. The once-rules (InitiateCheckout once per
// session, Purchase once per order, ReachedBuyBox once per page load) are the
// browser's: it sends meta_event_id only when they pass.

import { sendMetaEvents, metaCapiEnabled } from "../messaging/providers/meta-capi.mjs";
import { metaEventsFor, pageUrl } from "./map.mjs";
import { buildUserData, sessionContact } from "./user-data.mjs";

/* One key, so a ClickFunnels or other result written at the same moment is kept. */
export const RECORD_META_SQL = `UPDATE events SET payload = payload || $1::jsonb WHERE id = $2`;

async function record(db, rowId, note) {
  if (!rowId) return;
  try {
    await db.query(RECORD_META_SQL, [{ meta: note }, rowId]);
  } catch (err) {
    console.error("meta: result not recorded —", err?.message || err);
  }
}

const joined = (list, key) => list.map((e) => e[key]).join(",");

/**
 * Start the Meta send for one saved track row, without holding up the answer.
 * Returns the job (a promise that never rejects), or null when nothing goes to
 * Meta. The job resolves to the sender's result (or a skip).
 *
 * @param {object} a
 * @param {object} a.db        events table
 * @param {string} a.orgId
 * @param {string|null} a.rowId the saved events row
 * @param {object} a.payload   the saved row's payload (session_id, seq, event, page,
 *                             props, meta_event_id?, fbc?, fbp?, url?)
 * @param {string} a.actor     "person" | "agent"
 * @param {object} a.deps      env, clientIp, userAgent, now, fetchImpl,
 *                             sendMeta (stand-in sender), onMetaSend
 */
export function startMetaSend({ db, orgId, rowId, payload, actor, deps = {} }) {
  const env = deps.env || process.env;
  if (actor !== "person") return null;
  if (!metaCapiEnabled(env)) return null;
  const candidates = metaEventsFor(payload);
  if (!candidates.length) return null;

  const job = (async () => {
    const at = deps.now instanceof Date ? deps.now : new Date();
    const list = candidates;
    try {
      const contact = await sessionContact(db, orgId, payload.session_id);
      if (contact?.actor === "agent") {
        const out = { ok: true, sent: 0, skipped: "agent_session" };
        await record(db, rowId, {
          sent: 0, skipped: out.skipped, event_name: joined(list, "event_name"),
          event_id: joined(list, "event_id"), at: at.toISOString()
        });
        return out;
      }

      const userData = buildUserData({
        email: contact?.email,
        phone: contact?.phone,
        ip: deps.clientIp,
        userAgent: deps.userAgent,
        fbc: payload.fbc,
        fbp: payload.fbp,
        sessionId: payload.session_id
      });
      const sourceUrl = payload.url || pageUrl(payload.page);
      const eventTime = Math.floor(at.getTime() / 1000);
      const events = list.map((e) => {
        const ev = {
          event_name: e.event_name,
          event_time: eventTime,
          event_id: e.event_id,
          event_source_url: sourceUrl,
          action_source: "website",
          user_data: userData
        };
        if (e.custom_data) ev.custom_data = e.custom_data;
        return ev;
      });

      let out;
      try {
        out = await (deps.sendMeta || sendMetaEvents)(events, { env, db, fetchImpl: deps.fetchImpl });
      } catch (err) {
        out = { ok: false, sent: 0, error: String(err?.message || err).slice(0, 300) };
      }
      const note = {
        sent: Number(out?.sent) || 0,
        event_name: joined(list, "event_name"),
        event_id: joined(list, "event_id"),
        at: at.toISOString()
      };
      if (out?.skipped) note.skipped = out.skipped;
      if (out?.error) note.error = String(out.error).slice(0, 300);
      await record(db, rowId, note);
      return out;
    } catch (err) {
      console.error("meta: send job failed —", err?.message || err);
      return { ok: false, sent: 0, error: "meta_job_threw" };
    }
  })();
  if (typeof deps.onMetaSend === "function") deps.onMetaSend(job);
  return job;
}
