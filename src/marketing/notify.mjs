// Buzzes for Chris (spec M0 step 4, §2 item 4).
//
// He gets a buzz only when he has something to do: scripts are ready, videos are
// ready, or something is stuck that only he can fix. Everything else lives in the
// Command Center.
//
// queueBuzz() writes a row to marketing_buzzes. If it is quiet hours the row waits:
// send_after is when quiet hours end. sendDueBuzzes() is called by the worker; it
// sends through notify-fanout send() and never more than one of each kind every
// 10 minutes. Nothing here transmits: send() is a provider call.

import { send as fanoutSend } from "../ad-videos/notify-fanout.mjs";
import { nextSendTime } from "./time.mjs";

export const BUZZ_MIN_GAP_MINUTES = 10;

export const BUZZ_TITLES = Object.freeze({
  scripts_ready: "Scripts are ready",
  videos_ready: "Videos are ready",
  stuck: "Something is stuck"
});

const QUIET_DEFAULTS = { quiet_start: "21:00", quiet_end: "07:00", timezone: "America/Phoenix" };

/** Add a buzz. Returns { id, send_after, deferred }. */
export async function queueBuzz(db, { orgId, kind, body, groupKey = null, now = new Date() }) {
  if (!orgId) throw new Error("queueBuzz: orgId is required");
  if (!kind || !String(kind).trim()) throw new Error("queueBuzz: kind is required");
  if (!body || !String(body).trim()) throw new Error("queueBuzz: body is required");
  const s = (await db.query(
    `SELECT quiet_start, quiet_end, timezone FROM marketing_settings WHERE org_id = $1`, [orgId]
  )).rows[0] || QUIET_DEFAULTS;
  const sendAfter = nextSendTime(now, s);
  const r = await db.query(
    `INSERT INTO marketing_buzzes (org_id, kind, body, group_key, send_after)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [orgId, String(kind), String(body), groupKey, sendAfter]
  );
  return { id: r.rows[0].id, send_after: sendAfter, deferred: sendAfter.getTime() > now.getTime() };
}

/**
 * Send what is due. For each (org, kind): skip it if one went out in the last 10
 * minutes; otherwise send the oldest and mark any others with the same group_key
 * as sent with it (one buzz, not three). A failed send leaves the row for the next pass.
 * Returns { sent, held, failed }.
 */
export async function sendDueBuzzes(db, { send = fanoutSend, env = process.env, fetchImpl } = {}) {
  const due = (await db.query(
    `SELECT id, org_id, kind, body, group_key FROM marketing_buzzes
      WHERE sent_at IS NULL AND send_after <= now() ORDER BY created_at, id`
  )).rows;
  const out = { sent: 0, held: 0, failed: 0 };
  const seen = new Set();
  for (const b of due) {
    const key = `${b.org_id}:${b.kind}`;
    if (seen.has(key)) { out.held++; continue; }
    seen.add(key);
    const recent = await db.query(
      `SELECT 1 FROM marketing_buzzes
        WHERE org_id = $1 AND kind = $2 AND sent_at > now() - ($3::int * interval '1 minute') LIMIT 1`,
      [b.org_id, b.kind, BUZZ_MIN_GAP_MINUTES]
    );
    if (recent.rows.length) { out.held++; continue; }
    let res;
    try {
      res = await send(
        { id: b.id, notification: { title: BUZZ_TITLES[b.kind] || "Fundhub marketing", body: b.body } },
        { env, fetchImpl }
      );
    } catch (err) {
      res = { ok: false, error: String((err && err.message) || err) };
    }
    if (res && res.ok) {
      await db.query(
        `UPDATE marketing_buzzes SET sent_at = now()
          WHERE sent_at IS NULL AND (id = $1 OR ($2::text IS NOT NULL AND org_id = $3 AND kind = $4 AND group_key = $2))`,
        [b.id, b.group_key, b.org_id, b.kind]
      );
      out.sent++;
    } else {
      out.failed++;
      console.error(`[marketing-buzz] ${b.kind} not sent: ${(res && res.error) || "unknown"}`);
    }
  }
  return out;
}
