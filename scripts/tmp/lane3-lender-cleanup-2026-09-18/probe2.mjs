// Read-only probe 2: tight personal-URL match + Elan fragments. Scratch script.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
const url = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const q = async (label, sql, params = []) => {
  try { const r = await c.query(sql, params); console.log(`\n## ${label} (${r.rows.length})`); console.log(JSON.stringify(r.rows, null, 1)); }
  catch (e) { console.log(`\n## ${label}\nERROR ${e.message}`); }
};

// Tight: URL path segment that is clearly consumer/personal, and NOT business/commercial/small-business
const TIGHT = `application_url ~* '(/consumer/|/consumer-|/personal/|/personal-|selectionpersonal|/personal$|consumer-products)'
   and application_url !~* '(business|commercial)'`;

await q('tight_personal_urls_all_tables', `select id, name, lender_table, external_row_id, application_url
  from lenders where ${TIGHT} order by lender_table, name`);

await q('tight_personal_onlinebizcc', `select count(*) n from lenders where lender_table='OnlineBizCC' and ${TIGHT}`);

await q('elan', `select id, name, product_name, lender_table, external_row_id, priority_tier,
  eligible_states, known_friendly_states, application_url, bureaus_pulled, business_bureau_pulled, active, created_at
  from lenders where name ~* 'elan' order by name, product_name`);

await q('elan_apps', `select count(*) n from applications a join lenders l on l.id=a.lender_id where l.name ~* 'elan'`);
await q('elan_obs', `select count(*) n from lender_bureau_observations o join lenders l on l.id=o.lender_row_id where l.name ~* 'elan'`);

await q('verify_bank_refs', `select
  (select count(*) from applications where lender_id in (select id from lenders where name ~* 'verify')) apps,
  (select count(*) from lender_bureau_observations where lender_row_id in (select id from lenders where name ~* 'verify')) obs`);

await c.end();
