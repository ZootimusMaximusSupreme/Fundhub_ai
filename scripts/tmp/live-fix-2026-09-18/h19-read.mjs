// Hole 19 — what #12 bought, what it was granted, and whether anything on its
// file should have built a checklist. BEGIN READ ONLY, then ROLLBACK. Writes
// nothing. Prints no secrets.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h19-read.mjs
import { pool } from "../../../src/db.mjs";

const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const c = await pool().connect();
const out = {};
try {
  await c.query("BEGIN READ ONLY");
  const org = (await c.query(`SELECT org_id FROM clients WHERE id = $1`, [TWELVE])).rows[0].org_id;

  for (const [name, id] of [["twelve", TWELVE], ["eleven", ELEVEN]]) {
    const o = {};
    o.transactions = (await c.query(
      `SELECT t.product_name, t.status, p.code AS product_code, t.created_at
         FROM transactions t
         LEFT JOIN products p ON p.id = resolve_product_id(t.org_id, t.product_name)
        WHERE t.client_id = $1 ORDER BY t.created_at`, [id])).rows;
    o.entitlements = (await c.query(
      `SELECT entitlement_code, grant_reason, granted_at, revoked_at,
              (source_transaction_id IS NOT NULL) AS from_purchase
         FROM entitlements WHERE client_id = $1 ORDER BY granted_at`, [id])).rows;
    o.waypoints = (await c.query(
      `SELECT key, title, state FROM client_waypoints WHERE client_id = $1 ORDER BY position`, [id])).rows;
    out[name] = o;
  }

  out.product_entitlements_for_academy_and_blueprint = (await c.query(
    `SELECT product_code, entitlement_code, duration_days
       FROM product_entitlements
      WHERE org_id = $1 AND product_code IN ('funding-mastery', 'consulting-package')
      ORDER BY product_code, entitlement_code`, [org])).rows;

  out.waypoint_definitions = (await c.query(
    `SELECT * FROM waypoint_definitions ORDER BY position`)).rows
    .map((r) => ({ key: r.key, expands: r.expands, title: r.title, active: r.active, retired_at: r.retired_at }));

  out.clients_with_any_waypoints = (await c.query(
    `SELECT count(DISTINCT client_id)::int AS n FROM client_waypoints WHERE org_id = $1`, [org])).rows[0];

  await c.query("ROLLBACK");
  console.log(JSON.stringify(out, null, 2));
} finally {
  c.release();
  await pool().end();
}
