// SLO pack delivery — the UnderwriteIQ machine after a CRS pull.
// Trigger: analysis.completed. Gate: this client paid the SLO (slo_ref).
// Then the same pack + email the closer deck already uses.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { resolveClient } from "../handlers/client-lifecycle.mjs";
import { clientHasSloPurchase } from "../slo/buyer.mjs";
import { deliverSloPack } from "../slo/deliver.mjs";

export async function handle({
  event, db, step, deliver = deliverSloPack, isSlo = clientHasSloPurchase,
  resolve = resolveClient
}) {
  const clientId = await step.run("resolve-client", () => resolve(db, event));
  if (!clientId) return { done: false, reason: "no_client" };

  const slo = await step.run("check-slo", () => isSlo(db, clientId));
  if (!slo) return { done: false, reason: "not_slo" };

  const delivery = await step.run("deliver-pack", () =>
    deliver(db, {
      orgId: event.orgId,
      clientId,
      eventId: event.id
    }));

  return { done: true, delivery };
}

export const sloPackDelivery = inngest.createFunction(
  { id: "slo-pack-delivery", name: "SLO — UnderwriteIQ pack after pull" },
  { event: "analysis.completed" },
  ({ event, step }) => handle({ event: event.data, db, step })
);
