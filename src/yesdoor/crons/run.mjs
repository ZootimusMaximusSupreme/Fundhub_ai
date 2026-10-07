// Shared plumbing for the four Yesdoor crons (src/workflows/yd-*.mjs register them).
//
//   runYdCron      resolve the deployment's Yesdoor org (YD_ORG_SLUG), run one
//                  sweep, never throw: a failed pass returns { ok: false, errors }.
//   failIfNotOk    what the Inngest wrapper calls on the result. A pass that could
//                  not run AT ALL (no org, the read failed) throws, so the job
//                  heartbeat records an error and the daily pulse shows the job
//                  red. A pass where some single renter or row failed does NOT
//                  throw: those are counted in the result and retried next pass.

import { resolveYdOrgId } from "../store/org.mjs";

export async function runYdCron(db, sweepFn, options = {}) {
  try {
    const orgId = options.orgId || await resolveYdOrgId(db);
    return await sweepFn(db, { ...options, orgId });
  } catch (err) {
    return { ok: false, count: 0, errors: [String((err && err.message) || err).slice(0, 300)] };
  }
}

export function failIfNotOk(name, result) {
  if (!result || result.ok === false) {
    const why = (result?.errors || []).join("; ") || "the pass could not run";
    throw new Error(`${name}: ${why}`.slice(0, 300));
  }
  return result;
}
