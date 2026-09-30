// Capital Blueprint — CSM tasks when the client stops the coach (SMS STOP / stop).
//
// STOP still opts the client out (comms.mjs). This adds a human task so a CSM
// can follow up. Does not restart texts without consent.

import { createTask } from "../lib/create-task.mjs";
import { PAID_TRANSACTION_STATUS } from "../entitlements/entitlements.mjs";
import { BLUEPRINT_PRODUCT_CODE } from "../waypoints/purchase.mjs";

const PAID = [...PAID_TRANSACTION_STATUS];

/** True when this client has a paid Capital Blueprint (consulting-package). */
export async function isCapitalBlueprintBuyer(db, { orgId, clientId }) {
  if (!orgId || !clientId) return false;
  const r = await db.query(
    `SELECT 1
       FROM transactions t
       JOIN products p ON p.id = t.product_id AND p.org_id = t.org_id
      WHERE t.org_id = $1::uuid AND t.client_id = $2::uuid
        AND lower(p.code) = lower($3)
        AND t.status = ANY($4::text[])
      LIMIT 1`,
    [orgId, clientId, BLUEPRINT_PRODUCT_CODE, PAID]
  );
  return !!r.rows[0];
}

/**
 * CSM task when a Blueprint buyer sends a stop keyword on SMS.
 * Idempotent per inbound message id when providerRef is present.
 */
export async function createBlueprintCoachStopTask(db, {
  orgId,
  clientId,
  providerRef = null,
  channel = "sms"
} = {}) {
  if (!orgId || !clientId) return { created: false, reason: "missing_ids" };
  const blueprint = await isCapitalBlueprintBuyer(db, { orgId, clientId });
  if (!blueprint) return { created: false, reason: "not_blueprint_buyer" };
  const eventId = providerRef
    ? `blueprint-coach-stop:${providerRef}`
    : `blueprint-coach-stop:${clientId}:${Date.now()}`;
  return createTask(db, {
    orgId,
    clientId,
    title: "Blueprint client stopped coach texts — call or email",
    sourceWorkflow: "blueprint-coach",
    assigneeRole: "csm",
    eventId,
    body: eventId
  });
}
