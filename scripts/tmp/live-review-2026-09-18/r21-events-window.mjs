import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("BEGIN READ ONLY");
const r = (await c.query(`select e.created_at, e.name, coalesce(cl.first_name,'')||' '||coalesce(cl.last_name,'') who from events e left join clients cl on cl.id=e.client_id where e.created_at between '2026-09-18T15:05:00Z' and '2026-09-18T15:20:00Z' order by e.created_at`)).rows;
for (const x of r) console.log(x.created_at.toISOString(), x.name, x.who.trim());
await c.query("ROLLBACK"); await c.end();
