// Read-only probe 3: confirm the audit's 14-row consumer rule. Scratch script.
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

// The exact rule the Carl audit used.
const RULE = `external_row_id like 'CARL-%'
  and lender_table = 'OnlineBizCC'
  and application_url ~* '(consumer-platinum|consumer-credit|consumer/web-visa|#consumer|consumer-products)'`;

await q('carl_consumer_rows', `select id, name, external_row_id, application_url, eligible_states, bureaus_pulled, business_bureau_pulled
  from lenders where ${RULE} order by name`);

await q('count', `select count(*) n from lenders where ${RULE}`);

// Would any re-tagged bank already have a PersonalCC row of the same name?
await q('name_collisions_personalcc', `select l.name, count(*) n
  from lenders l
  where l.lender_table='PersonalCC'
    and lower(l.name) in (select lower(name) from lenders where ${RULE})
  group by 1`);

await c.end();
