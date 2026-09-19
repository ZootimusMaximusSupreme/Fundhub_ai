// r21 — read-only: every outbound message row created on live in a time window, all clients,
// to check "nothing else was sent" around the fixer's 14:54:58 UTC send. BEGIN READ ONLY, ROLLBACK, no SET.
// Prints template key, channel, status, client name only. Usage: node r21-org-window.mjs <fromISO> <toISO>
import pg from "pg";
const [from, to] = process.argv.slice(2);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const rows = (await c.query(
    `select m.created_at, m.template_key, m.channel, m.status, m.direction, m.provider_ref is not null as has_ref,
            split_part(coalesce(m.provider_ref,''), ':', 1) as ref_kind,
            coalesce(cl.first_name,'') || ' ' || coalesce(cl.last_name,'') as who
       from messages m left join clients cl on cl.id = m.client_id
      where m.created_at between $1 and $2 order by m.created_at`, [from, to])).rows;
  console.log(`messages created ${from} .. ${to}: ${rows.length}`);
  for (const r of rows) console.log(`  ${r.created_at.toISOString()} ${r.direction} ${r.template_key ?? "(none)"} ${r.channel} status=${r.status} ref=${r.ref_kind || "-"} who="${r.who.trim()}"`);
  await c.query("ROLLBACK");
} finally { await c.end(); }
