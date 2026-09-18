import { shownStepLabel } from "../fulfillment/client-step.mjs";

/* The saved next step. Hole 12, round 3, 2026-09-18.
   A dozen jobs save their own fixed word here ("Pull CRS", "Collect
   Documents", …) while the Client Control Panel works its step out. One
   deposit fired four of those jobs, the last word won, and the saved step
   disagreed with the screen on every file that had one. So when a write sets
   this key, the words saved are the screen's step
   (src/fulfillment/client-step.mjs shownStepLabel), worked out with this same
   patch laid over the record. When the screen's step cannot be worked out,
   the caller's words are kept — a blank is never saved. */
export const NEXT_ACTION_KEY = "employee_next_action";

// mergeCustomFields — same shape as the private helper in
// src/handlers/client-lifecycle.mjs, duplicated here rather than exported from that
// module (not touching existing handler files). Merge a partial object into
// clients.custom_fields (jsonb). No-op on empty.
export async function mergeCustomFields(db, clientId, patch) {
  if (!clientId || !patch || Object.keys(patch).length === 0) return;
  let write = patch;
  if (Object.prototype.hasOwnProperty.call(patch, NEXT_ACTION_KEY)) {
    const shown = await shownStepLabel(db, clientId, { customFieldsPatch: patch });
    if (shown) write = { ...patch, [NEXT_ACTION_KEY]: shown };
  }
  await db.query(
    `UPDATE clients SET custom_fields = custom_fields || $2::jsonb WHERE id = $1`,
    [clientId, JSON.stringify(write)]
  );
}

// One-shot lock. Two form pings at the same time both used to pass a read
// check, then both send. This write only lands if the field is still empty.
// Returns true when this caller won the lock.
export async function claimCustomFieldLock(db, clientId, field) {
  if (!clientId || !field) return false;
  const stamp = new Date().toISOString();
  const r = await db.query(
    `UPDATE clients
        SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || $2::jsonb
      WHERE id = $1
        AND COALESCE(custom_fields->>$3, '') = ''
      RETURNING id`,
    [clientId, JSON.stringify({ [field]: stamp }), field]
  );
  return r.rows.length > 0;
}
