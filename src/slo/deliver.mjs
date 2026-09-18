// SLO pack = the UnderwriteIQ deliverables the closer deck already builds.
// Same pack, same saver, same seeded funding-delivery email. No new template.

import { sendTemplated } from "../workflows/messaging.mjs";
import { addTags } from "../workflows/tags.mjs";
import { mergeCustomFields } from "../workflows/custom-fields.mjs";
import { FUNDING_EMAIL_TEMPLATE_KEY } from "../workflows/u-02-analyzer-complete-delivery.mjs";
import { buildLetterPackForClient } from "../underwrite/letter-pack.mjs";
import { persistFundingLetterFiles } from "../underwrite/funding-letter-pdf.mjs";
import { storeFromEnv } from "../documents/store.mjs";

export const SLO_PACK_EMAIL = FUNDING_EMAIL_TEMPLATE_KEY;

export async function deliverSloPack(db, {
  orgId, clientId, eventId, store = null, send = sendTemplated,
  buildPack = buildLetterPackForClient,
  persist = persistFundingLetterFiles,
  tag = addTags,
  stamp = mergeCustomFields
} = {}) {
  if (!orgId || !clientId) {
    return { delivered: false, reason: "incomplete" };
  }

  const pack = await buildPack(db, { clientId, pack: "funding" });
  const files = pack.files || [];
  if (!files.length) {
    await stamp(db, clientId, { slo_pack_status: "Delivery Failed — Retry" });
    return {
      delivered: false,
      reason: pack.reason || pack.engineSkip || "empty_pack",
      engineSkip: pack.engineSkip || null
    };
  }

  let persisted = { stored: [], skipped: "not_attempted" };
  try {
    persisted = await persist(db, store || storeFromEnv(), {
      orgId,
      clientId,
      files,
      generatedBy: "slo-pack",
      sourceEventId: eventId || `slo-pack:${clientId}`
    });
  } catch (err) {
    persisted = { stored: [], skipped: String(err && err.message || err).slice(0, 240) };
  }

  const delivered = persisted.stored.length > 0;
  let email = null;
  if (delivered) {
    email = await send(db, {
      orgId,
      clientId,
      channel: "email",
      templateKey: SLO_PACK_EMAIL,
      eventId: eventId || `slo-pack:${clientId}`
    });
    await tag(db, clientId, ["client:deliverables"]);
  }

  await stamp(db, clientId, {
    slo_pack_status: delivered ? "Delivered" : "Delivery Failed — Retry"
  });

  return {
    delivered,
    letterCount: files.length,
    documentsStored: persisted.stored.length,
    persistSkipped: persisted.skipped,
    reason: delivered ? null : (persisted.skipped || "nothing_stored"),
    email
  };
}
