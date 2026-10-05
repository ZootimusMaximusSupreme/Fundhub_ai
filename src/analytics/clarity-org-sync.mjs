// Pull Clarity export API into clarity_insights_snapshots (staff RLS).

import { asStaff } from "../partners/rls.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { normalizeNumOfDays, VALID_DIMENSIONS } from "./clarity-export.mjs";
import { fetchClarityLiveInsights } from "../adapters/clarity-export.mjs";
import { clarityDbCounter } from "./clarity-counter.mjs";

export function clarityQueryKey(q) {
  const parts = [q.dimension1, q.dimension2, q.dimension3].filter(Boolean);
  return parts.length ? parts.join("+") : "aggregate";
}

export const DEFAULT_PULLS = [
  { dimension1: "URL", label: "by-url" },
  { dimension1: "Device", dimension2: "URL", label: "device-url" },
];

/**
 * @param {object} opts
 * @param {import('pg').Client | import('pg').Pool} [opts.db]
 * @param {string} [opts.token] CLARITY_DATA_EXPORT_TOKEN
 * @param {string} [opts.projectId] CLARITY_PROJECT_ID
 * @param {number} [opts.numOfDays]
 * @param {typeof fetch} [opts.fetch]
 * @param {Array<{dimension1?: string, dimension2?: string, dimension3?: string}>} [opts.queries]
 */
export async function runClarityOrgSync(opts = {}) {
  const token = String(opts.token ?? process.env.CLARITY_DATA_EXPORT_TOKEN ?? "").trim();
  const projectId = String(opts.projectId ?? process.env.CLARITY_PROJECT_ID ?? "").trim();
  const numOfDays = normalizeNumOfDays(opts.numOfDays ?? 3);
  const queries = opts.queries?.length ? opts.queries : DEFAULT_PULLS;

  if (!token) {
    return { ok: false, message: "CLARITY_DATA_EXPORT_TOKEN unset", synced: 0 };
  }
  if (!projectId) {
    return { ok: false, message: "CLARITY_PROJECT_ID unset", synced: 0 };
  }

  const db = opts.db;
  if (!db) {
    return { ok: false, message: "database required", synced: 0 };
  }

  const orgId = await resolveDefaultOrg(db);
  let synced = 0;
  const errors = [];

  // The counter lives in the database (Netlify cannot write credentials/).
  // Microsoft's 10/day cap is enforced by the adapter; this run adds its own 2/day.
  const counter = clarityDbCounter(db, { orgId });
  const env = { CLARITY_DATA_EXPORT_TOKEN: token, CLARITY_PROJECT_ID: projectId };

  for (const q of queries) {
    const bad = [q.dimension1, q.dimension2, q.dimension3].find(
      (d) => d && !VALID_DIMENSIONS.has(String(d).trim()),
    );
    if (bad) {
      errors.push({ query: q, message: `Invalid Clarity dimension: ${bad}` });
      continue;
    }

    let payload;
    try {
      payload = await fetchClarityLiveInsights({
        env,
        counter,
        retries: 0,
        numOfDays,
        dimension1: q.dimension1,
        dimension2: q.dimension2,
        dimension3: q.dimension3,
        fetch: opts.fetch,
      });
    } catch (err) {
      // A failed pull is logged and the run stops: no retry, no further calls.
      const message = String(err && err.message ? err.message : err);
      console.error(`[clarity-org-sync] pull failed, stopping: ${message}`);
      errors.push({ query: q, message });
      break;
    }

    const queryKey = clarityQueryKey(q);

    await asStaff(async (tx) => {
      await tx.query(
        `INSERT INTO clarity_insights_snapshots
           (org_id, project_id, num_of_days, query_key, dimension1, dimension2, dimension3, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (org_id, project_id, snapshot_date, query_key)
         DO UPDATE SET
           num_of_days = EXCLUDED.num_of_days,
           dimension1 = EXCLUDED.dimension1,
           dimension2 = EXCLUDED.dimension2,
           dimension3 = EXCLUDED.dimension3,
           payload = EXCLUDED.payload,
           captured_at = now()`,
        [
          orgId,
          projectId,
          numOfDays,
          queryKey,
          q.dimension1 ?? null,
          q.dimension2 ?? null,
          q.dimension3 ?? null,
          JSON.stringify(payload),
        ],
      );
    }, { db, pool: opts.pool });

    synced++;
  }

  return {
    ok: errors.length === 0,
    synced,
    errors,
    projectId,
    numOfDays,
  };
}
