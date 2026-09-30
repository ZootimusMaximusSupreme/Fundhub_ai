// Capital Blueprint — hourly pass for fundable files ready for closer alert.
//
// Callable gate lives in src/blueprint/closer-ready.mjs; this sweeper finds
// Blueprint buyers and runs it. Never throws — one bad row must not stop the rest.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { evaluateBlueprintCloserReady } from "../blueprint/closer-ready.mjs";
import { PAID_TRANSACTION_STATUS } from "../entitlements/entitlements.mjs";
import { BLUEPRINT_PRODUCT_CODE } from "../waypoints/purchase.mjs";

export const SWEEP_CRON = "0 * * * *";
export const SOURCE_WORKFLOW = "blueprint-closer-ready-sweeper";

export async function sweep(conn = db, { orgId = null, now = new Date() } = {}) {
  void now;
  const params = [BLUEPRINT_PRODUCT_CODE, PAID_TRANSACTION_STATUS];
  let orgFilter = "";
  if (orgId) {
    orgFilter = " AND c.org_id = $3::uuid";
    params.push(orgId);
  }
  const { rows } = await conn.query(
    `SELECT DISTINCT c.org_id, c.id AS client_id
       FROM clients c
       JOIN transactions t ON t.client_id = c.id AND t.org_id = c.org_id
       JOIN products p ON p.id = resolve_product_id(t.org_id, t.product_name)
      WHERE lower(p.code) = lower($1)
        AND lower(btrim(COALESCE(t.status, ''))) = $2
        ${orgFilter}`,
    params
  );

  const out = { scanned: rows.length, results: [] };
  for (const row of rows) {
    try {
      const res = await evaluateBlueprintCloserReady(conn, {
        orgId: row.org_id,
        clientId: row.client_id
      });
      out.results.push({ clientId: row.client_id, ...res });
    } catch (err) {
      out.results.push({
        clientId: row.client_id,
        ok: false,
        error: String(err?.message || err)
      });
    }
  }
  return out;
}

export async function handle({ db: handleDb, step } = {}) {
  const run = () => sweep(handleDb || db);
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const blueprintCloserReadySweeper = inngest.createFunction(
  { id: "blueprint-closer-ready-sweeper", name: "Blueprint closer-ready sweeper" },
  { cron: SWEEP_CRON },
  () => sweep(db)
);
