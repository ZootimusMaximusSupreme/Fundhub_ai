#!/usr/bin/env node
/** Set lenders.logo_path where a matching PNG exists on disk. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLogoPath } from "../../src/lenders/resolve-logo.mjs";
import { normalizeName } from "../../src/lenders/tips.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const exists = (rel) =>
  fs.existsSync(path.join(ROOT, "public", String(rel).replace(/^\//, "")));

const { db, close } = await import("../../src/db.mjs");
const slug = process.env.DEFAULT_ORG_SLUG || "fundhub";
const org = await db.query(`SELECT id FROM orgs WHERE slug = $1 LIMIT 1`, [slug]);
const orgId = org.rows[0].id;

const rows = await db.query(
  `SELECT id, name, external_row_id, logo_path
     FROM lenders WHERE org_id = $1::uuid AND COALESCE(active, true) = true`,
  [orgId]
);

let updated = 0;
let already = 0;
let stillMissing = 0;

for (const row of rows.rows) {
  const resolved = resolveLogoPath({
    name: normalizeName(row.name),
    externalRowId: row.external_row_id,
    sidecar: null,
    exists
  });
  if (!resolved) {
    stillMissing++;
    continue;
  }
  if (row.logo_path === resolved) {
    already++;
    continue;
  }
  await db.query(`UPDATE lenders SET logo_path = $1 WHERE id = $2::uuid`, [resolved, row.id]);
  updated++;
}

const totals = await db.query(
  `SELECT count(*)::int banks, count(logo_path)::int with_logo FROM lenders WHERE org_id = $1::uuid`,
  [orgId]
);

console.log(
  JSON.stringify(
    { updated, already, stillMissing, totals: totals.rows[0], pngOnDisk: fs.readdirSync(path.join(ROOT, "public/assets/lenders")).filter((f) => f.endsWith(".png")).length },
    null,
    2
  )
);

await close();
