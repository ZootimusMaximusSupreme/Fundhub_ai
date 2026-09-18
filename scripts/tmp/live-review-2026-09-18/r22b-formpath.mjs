// Hole 22 round 2 reviewer — for 2 pull permissions, what else happened in the same few seconds (form fingerprints). Read only, no values printed.
import pg from "pg";
const PICKS = process.argv.slice(2).length ? process.argv.slice(2) : ["e42c11e8", "be3dcfd7"];
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  for (const pre of PICKS) {
    const cl = (await c.query(`select id, created_at, first_name ilike 'sim%' is_sim from clients where id::text like $1 || '%'`, [pre])).rows[0];
    const p = (await c.query(`select created_at, updated_at from pii_identity where client_id=$1`, [cl.id])).rows[0];
    const cons = (await c.query(`select granted_at from client_consents where client_id=$1 and kind='soft_pull_consent' order by granted_at`, [cl.id])).rows;
    console.log(`\n== ${pre} sim=${cl.is_sim} client created ${cl.created_at.toISOString()} | identity created ${p.created_at.toISOString()} updated ${p.updated_at.toISOString()} | permissions ${cons.map((x) => x.granted_at.toISOString()).join(", ")}`);
    for (const g of cons) {
      const lo = new Date(g.granted_at.getTime() - 15000), hi = new Date(g.granted_at.getTime() + 15000);
      const ev = (await c.query(`select name, created_at from events where client_id=$1 and created_at between $2 and $3 order by created_at`, [cl.id, lo, hi])).rows;
      const ms = (await c.query(`select channel, template_key, status, created_at from messages where client_id=$1 and created_at between $2 and $3 order by created_at`, [cl.id, lo, hi])).rows;
      const ac = (await c.query(`select kind, status, created_at, activated_at from accounts where client_id=$1 order by created_at`, [cl.id])).rows;
      const bz = (await c.query(`select created_at from businesses where client_id=$1 and created_at between $2 and $3`, [cl.id, lo, hi])).rows;
      const pl = await c.query(`select table_name from information_schema.columns where table_schema='public' and table_name='payment_links' and column_name='client_id'`);
      const pay = pl.rows.length ? (await c.query(`select created_at from payment_links where client_id=$1 and created_at between $2 and $3`, [cl.id, lo, hi])).rows : [];
      console.log(`  permission ${g.granted_at.toISOString()}: events ±15s: ${ev.map((e) => `${e.name}@${e.created_at.toISOString().slice(11, 23)}`).join(", ") || "none"}`);
      console.log(`    messages ±15s: ${ms.map((m) => `${m.channel}/${m.template_key}/${m.status}@${m.created_at.toISOString().slice(11, 23)}`).join(", ") || "none"}`);
      console.log(`    accounts: ${ac.map((a) => `${a.kind}/${a.status} created ${a.created_at.toISOString()}`).join(", ") || "none"} | businesses written ±15s: ${bz.length} | checkout links ±15s: ${pay.length}`);
    }
  }
} finally { await c.query("ROLLBACK"); await c.end(); }
