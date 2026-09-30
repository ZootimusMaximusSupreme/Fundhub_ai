// Capital Blueprint — after a monthly soft pull lands, refresh checklist + letters.
//
// Blueprint buyers only. Does not replace C-06 on diagnostic pulls; this is the
// Finance OS system-request path (finance-os-pull-sweeper fulfil hook).

import { isCapitalBlueprintBuyer } from "./coach-exception.mjs";
import { evaluateWaypoints } from "../waypoints/verify.mjs";
import { seedClientWaypoints } from "../waypoints/seed.mjs";
import { buildLetterPackForClient } from "../underwrite/letter-pack.mjs";
import {
  persistFundingLetterFiles,
  storeFromEnv
} from "../underwrite/funding-letter-pdf.mjs";

/**
 * runBlueprintMonthlyPullAftercare — waypoint verify, reseed paydowns, regen pack.
 * Best-effort: never throws for the whole call; reports partial failures.
 */
export async function runBlueprintMonthlyPullAftercare(db, {
  orgId,
  clientId,
  crsResultId = null,
  now = new Date(),
  buildPack = buildLetterPackForClient,
  persist = persistFundingLetterFiles,
  store = null
} = {}) {
  if (!orgId || !clientId) {
    return { ok: false, skipped: true, reason: "missing_ids" };
  }

  const blueprint = await isCapitalBlueprintBuyer(db, { orgId, clientId });
  if (!blueprint) {
    return { ok: true, skipped: true, reason: "not_blueprint_buyer" };
  }

  const out = {
    ok: true,
    skipped: false,
    crsResultId,
    waypoints: null,
    reseed: null,
    letterPack: null
  };

  try {
    out.waypoints = await evaluateWaypoints(db, { orgId, clientId, now });
  } catch (e) {
    out.waypoints = { ok: false, error: String(e?.message || e) };
  }

  try {
    out.reseed = await seedClientWaypoints(db, { orgId, clientId, now });
  } catch (e) {
    out.reseed = { ok: false, error: String(e?.message || e) };
  }

  try {
    const pack = await buildPack(db, { clientId, pack: "funding" });
    const files = pack.files || [];
    out.letterPack = {
      fileCount: files.length,
      reason: pack.reason || pack.engineSkip || null
    };
    if (files.length && db && orgId) {
      const persisted = await persist(db, store || storeFromEnv(), {
        orgId,
        clientId,
        files,
        generatedBy: "blueprint-monthly-pull",
        sourceEventId: crsResultId ? `blueprint-monthly:${crsResultId}` : `blueprint-monthly:${clientId}`
      });
      out.letterPack.documentsStored = persisted.stored?.length ?? 0;
      out.letterPack.persistSkipped = persisted.skipped ?? null;
    }
  } catch (e) {
    out.letterPack = { ok: false, error: String(e?.message || e) };
  }

  return out;
}

export default runBlueprintMonthlyPullAftercare;
