/** Look-only: what the unified bank book holds right now. */
import { db, close } from "../../../src/db.mjs";

const slug = process.env.DEFAULT_ORG_SLUG || "fundhub";
const org = await db.query(`SELECT id FROM orgs WHERE slug = $1 LIMIT 1`, [slug]);
const orgId = org.rows[0].id;

const totals = await db.query(
  `SELECT count(*)::int AS banks,
          count(logo_path)::int AS with_logo,
          count(nullif(btrim(coalesce(application_url,'')),''))::int AS with_url,
          count(nullif(btrim(coalesce(bureaus_pulled,'')),''))::int AS with_bureau,
          count(nullif(btrim(coalesce(eligible_states,'')),''))::int AS with_states,
          count(priority_tier)::int AS with_ranking
     FROM lenders WHERE org_id = $1::uuid`,
  [orgId]
);

const bySource = await db.query(
  `SELECT CASE WHEN external_row_id LIKE 'CARL-%' THEN 'carl-new' ELSE 'pre-carl-book' END AS source,
          count(*)::int AS banks,
          count(logo_path)::int AS with_logo
     FROM lenders WHERE org_id = $1::uuid
    GROUP BY 1 ORDER BY 1`,
  [orgId]
);

const byTable = await db.query(
  `SELECT coalesce(lender_table::text,'(none)') AS lender_table, count(*)::int AS banks
     FROM lenders WHERE org_id = $1::uuid GROUP BY 1 ORDER BY 2 DESC`,
  [orgId]
);

console.log(JSON.stringify({
  org: slug,
  totals: totals.rows[0],
  by_source: bySource.rows,
  by_table: byTable.rows
}, null, 2));

await close();
