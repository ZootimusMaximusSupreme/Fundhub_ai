// yd-outbox-dispatch (every 5 minutes) — spec §7. Marks queued yd_outbox rows
// `sent` through the SANDBOX dispatcher (providers/outbox-sandbox.mjs). NOTHING IS
// TRANSMITTED: no email, no text, no network call. A real provider belongs in
// src/messaging/providers/ and replaces this module later (CLAUDE.md §12).
//
// WHAT IT TOUCHES: yd_outbox rows with status 'queued' (to sent or failed), the
// yd_touches row a sent touch email belongs to (sent_at), and a yd_events row per
// row it moves. Nothing else.
//
// SAFE TO RUN TWICE, OR AT THE SAME TIME. The batch is claimed with FOR UPDATE SKIP
// LOCKED, so two passes work different rows, and the update only lands on a row
// that is still queued. Bounded: one pass claims at most YD_CRON.outboxBatch rows;
// the rest is the next pass.

import { YD_CRON } from "../config.mjs";
import * as outboxSandbox from "../providers/outbox-sandbox.mjs";
import { recordEvent } from "../store/events.mjs";
import { withTransaction } from "../store/tx.mjs";

export const DEFAULT_DISPATCHER = outboxSandbox;

/**
 * One pass.
 * @returns {Promise<{ ok: boolean, count: number, claimed: number, sent: number, failed: number, errors: string[] }>}
 */
export async function outboxDispatchSweep(db, { orgId, now = new Date(), limit = YD_CRON.outboxBatch, dispatcher = DEFAULT_DISPATCHER } = {}) {
  const out = { ok: true, count: 0, claimed: 0, sent: 0, failed: 0, errors: [] };
  if (!orgId) return { ...out, ok: false, errors: ["orgId required"] };
  try {
    await withTransaction(db, async (tx) => {
      const rows = (await tx.query(
        `SELECT id, channel, to_address, template_key, status, related_kind, related_id
           FROM yd_outbox
          WHERE org_id = $1 AND status = 'queued'
          ORDER BY created_at, id
          LIMIT $2
          FOR UPDATE SKIP LOCKED`, [orgId, limit])).rows;
      out.claimed = rows.length;
      if (!rows.length) return;

      const byId = new Map(rows.map((r) => [r.id, r]));
      const { updates } = dispatcher.dispatch(rows, { now });

      for (const u of updates) {
        const row = byId.get(u.id);
        if (u.status === "sent") {
          const done = await tx.query(
            `UPDATE yd_outbox SET status = 'sent', provider = $3, provider_ref = $4, sent_at = $5
              WHERE id = $1 AND org_id = $2 AND status = 'queued' RETURNING id`,
            [u.id, orgId, u.provider, u.provider_ref, u.sent_at]);
          if (!done.rows[0]) continue;
          out.sent += 1;
          if (row.related_kind === "touch" && row.related_id) {
            await tx.query(
              `UPDATE yd_touches SET sent_at = $3, outcome = 'sent'
                WHERE id = $1 AND org_id = $2 AND sent_at IS NULL`, [row.related_id, orgId, u.sent_at]);
          }
        } else {
          // The sandbox could not "deliver" it (no usable address). There is no error
          // column, so the reason is kept in the row's own context.
          const done = await tx.query(
            `UPDATE yd_outbox
                SET status = 'failed', provider = $3,
                    context = context || jsonb_build_object('dispatch_error', $4::text)
              WHERE id = $1 AND org_id = $2 AND status = 'queued' RETURNING id`,
            [u.id, orgId, u.provider, String(u.error || "undeliverable").slice(0, 200)]);
          if (!done.rows[0]) continue;
          out.failed += 1;
        }
        await recordEvent(tx, {
          orgId, name: `outbox.${u.status}`, entityKind: "outbox", entityId: u.id,
          payload: { channel: row.channel, template_key: row.template_key, provider: u.provider,
            related_kind: row.related_kind, related_id: row.related_id,
            ...(u.status === "failed" ? { error: String(u.error || "").slice(0, 200) } : {}) },
          actorKind: "sandbox", idempotencyKey: `outbox:${u.id}:${u.status}`
        });
      }
    });
  } catch (e) {
    return { ...out, ok: false, errors: [String(e?.message || e).slice(0, 300)] };
  }
  out.count = out.sent;
  return out;
}
