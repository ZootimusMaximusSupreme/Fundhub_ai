// Capital Blueprint — physical welcome kit ops task on Blueprint pay.

import { createTask } from "../lib/create-task.mjs";
import { buildBlackReportClient } from "../underwrite/black-report-client.mjs";
import { formatPrequalUsd, prequalFromCustomFields } from "../http/portal-prequal.mjs";
import { productCreatesChecklist } from "../waypoints/purchase.mjs";

export const WELCOME_KIT_SOURCE = "blueprint-welcome-kit";

/** Same kit checklist ops ships — task body only, not a new product surface. */
export const WELCOME_KIT_CHECKLIST = Object.freeze([
  "Fundhub hat",
  "Stickers",
  "Mailed package: file analysis, plan, bank list",
  "Metal card with QR to the app",
  "Round-one mailing kit: envelopes, certified mail forms, pen",
  "Laminated one-pager: qualify today + after the plan (from funding snapshot numbers)",
  "Signed note from Chris"
]);

/**
 * Numbers for the laminated one-pager — from latest CRS via funding snapshot
 * client dict, else custom_fields prequal fields.
 */
export async function fundingSnapshotNumbersForClient(db, { orgId, clientId }) {
  const clientRes = await db.query(
    `SELECT first_name, last_name, custom_fields FROM clients
      WHERE id = $1 AND org_id = $2`,
    [clientId, orgId]
  );
  const row = clientRes.rows[0];
  if (!row) return null;

  const cf = row.custom_fields || {};
  const crsRes = await db.query(
    `SELECT result FROM crs_results
      WHERE client_id = $1 AND org_id = $2
      ORDER BY created_at DESC LIMIT 1`,
    [clientId, orgId]
  );
  const crsResult = crsRes.rows[0]?.result;
  if (crsResult && typeof crsResult === "object") {
    const personal = {
      name: `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Client"
    };
    const client = buildBlackReportClient({ crsResult, personal });
    return {
      preapprovalNow: client.preapproval_now,
      preapprovalAfter: client.preapproval_after,
      prequalDisplay: formatPrequalUsd(prequalFromCustomFields(cf)),
      source: "crs_funding_snapshot"
    };
  }

  const prequal = prequalFromCustomFields(cf);
  return {
    preapprovalNow: prequal,
    preapprovalAfter: null,
    prequalDisplay: formatPrequalUsd(prequal),
    source: "custom_fields"
  };
}

/**
 * On consulting-package pay: ops task with kit checklist + snapshot reference.
 * BEST-EFFORT; never throws (money-chain hook).
 */
export async function createWelcomeKitTaskForPurchase(db, {
  orgId,
  clientId,
  productCode
} = {}) {
  if (!productCreatesChecklist(productCode)) {
    return { created: false, reason: "not_blueprint_product" };
  }
  if (!orgId || !clientId) return { created: false, reason: "missing_ids" };

  const numbers = await fundingSnapshotNumbersForClient(db, { orgId, clientId })
    .catch(() => null);

  const eventId = `blueprint-welcome-kit:${clientId}`;
  return createTask(db, {
    orgId,
    clientId,
    title: "Ship Capital Blueprint welcome kit",
    sourceWorkflow: WELCOME_KIT_SOURCE,
    assigneeRole: "funding_advisor",
    eventId,
    body: {
      kitChecklist: [...WELCOME_KIT_CHECKLIST],
      fundingSnapshot: numbers
    }
  }).catch((err) => ({ created: false, reason: String(err?.message || err) }));
}
