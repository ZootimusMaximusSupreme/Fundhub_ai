// Read-only verification after the Lane 3 cleanup. Scratch script.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
const url = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const q = async (label, sql, params = []) => {
  const r = await c.query(sql, params);
  console.log(`\n## ${label} (${r.rows.length})`);
  console.log(JSON.stringify(r.rows, null, 1));
};

await q('verify_bank_left', `select count(*) n from lenders where name = 'Verify Bank'`);

await q('carl_consumer_still_onlinebizcc', `select count(*) n from lenders
  where external_row_id like 'CARL-%' and lender_table='OnlineBizCC'
    and application_url ~* '(consumer-platinum|consumer-credit|consumer/web-visa|#consumer|consumer-products)'`);

await q('carl_now_personalcc', `select count(*) n from lenders
  where external_row_id like 'CARL-%' and lender_table='PersonalCC'`);

await q('elan_rows', `select name, product_name, lender_table, priority_tier, eligible_states, application_url
  from lenders where name ~* '^elan' order by name`);

await q('elan_state_count', `select array_length(string_to_array(eligible_states, ', '), 1) n_states
  from lenders where external_row_id = 'LEGACY-ONLINEBIZCC-ELAN-FINANCIAL'`);

await q('totals', `select count(*) banks,
  count(*) filter (where lender_table='OnlineBizCC') online_biz,
  count(*) filter (where lender_table='InBranchBizCC') in_branch,
  count(*) filter (where lender_table='PersonalCC') personal_cc,
  count(*) filter (where lender_table='PersonalLoans') personal_loans
  from lenders`);

// Elan must still be reachable for a client in every state it covered.
await q('elan_reachable_sample', `select s.st, count(*) n
  from (values ('NY'),('FL'),('AL'),('KY'),('NE'),('OK'),('WY'),('CA')) s(st)
  left join lenders l on l.external_row_id='LEGACY-ONLINEBIZCC-ELAN-FINANCIAL'
    and l.eligible_states like '%' || s.st || '%'
  group by 1 order by 1`);

await c.end();
