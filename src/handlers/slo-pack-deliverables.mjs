// SLO UnderwriteIQ pack — in-process on analysis.completed (same rule as crs-deliverables).

import { on } from "../events/registry.mjs";
import { resolveClient } from "./client-lifecycle.mjs";
import { clientHasSloPurchase } from "../slo/buyer.mjs";
import { deliverSloPack } from "../slo/deliver.mjs";

export async function onAnalysisCompletedSloPack(event, db) {
  if (event?.payload?.source !== "crs") return { done: false, reason: "not_crs_source" };
  const clientId = event.clientId || await resolveClient(db, event);
  if (!clientId) return { done: false, reason: "no_client" };
  if (!(await clientHasSloPurchase(db, clientId))) return { done: false, reason: "not_slo" };
  const delivery = await deliverSloPack(db, {
    orgId: event.orgId,
    clientId,
    eventId: event.id
  });
  return { done: true, delivery };
}

export function register() {
  on("analysis.completed", onAnalysisCompletedSloPack);
}
