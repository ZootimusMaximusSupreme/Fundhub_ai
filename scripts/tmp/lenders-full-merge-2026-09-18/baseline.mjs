import { db, close } from "../../../src/db.mjs";
const slug = process.env.DEFAULT_ORG_SLUG || "fundhub";
const org = await db.query(`SELECT id FROM orgs WHERE slug=$1 LIMIT 1`, [slug]);
const orgId = org.rows[0].id;
const q = await db.query(`
  SELECT count(*)::int banks,
         count(logo_path)::int with_logo,
         count(nullif(btrim(coalesce(bureaus_pulled,'')),''))::int with_bureau,
         count(nullif(btrim(coalesce(application_url,'')),''))::int with_url,
         count(nullif(btrim(coalesce(eligible_states,'')),''))::int with_states,
         count(priority_tier)::int with_ranking,
         count(external_row_id)::int with_ext
    FROM lenders WHERE org_id=$1::uuid`, [orgId]);
const t = await db.query(`SELECT coalesce(lender_table::text,'(none)') tbl, count(*)::int n FROM lenders WHERE org_id=$1::uuid GROUP BY 1 ORDER BY 2 DESC`, [orgId]);
console.log(JSON.stringify({ totals: q.rows[0], by_table: t.rows }, null, 2));
await close();
