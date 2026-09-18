// Read-only probe for Lane 3 lender cleanup. Scratch script.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
const url = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
if (!url) { console.error('no DATABASE_URL'); process.exit(1); }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const q = async (label, sql, params = []) => {
  try { const r = await c.query(sql, params); console.log(`\n## ${label} (${r.rows.length})`); console.log(JSON.stringify(r.rows, null, 1)); }
  catch (e) { console.log(`\n## ${label}\nERROR ${e.message}`); }
};

// 1. Verify Bank placeholder rows
await q('verify_bank', `select id, org_id, name, product_name, lender_table, external_row_id, application_url, eligible_states, active, created_at
  from lenders where name ~* 'verify' order by name`);

// 2. Carl rows with consumer/personal URLs currently tagged OnlineBizCC
await q('carl_sources', `select coalesce(split_part(external_row_id,'-',1),'(null)') src, count(*) n from lenders group by 1 order by 2 desc`);

await q('onlinebizcc_personal_urls', `select id, name, product_name, lender_table, external_row_id, application_url
  from lenders
  where lender_table = 'OnlineBizCC'
    and application_url ~* '(personal|consumer|/credit-cards/|personal-loans|/cards/)'
  order by name`);

// 3. Elan Financial fragments
await q('elan', `select id, name, product_name, lender_table, external_row_id, priority_tier, eligible_states, known_friendly_states, application_url, bureaus_pulled, active, created_at
  from lenders where name ~* 'elan' order by name, product_name`);

await c.end();
