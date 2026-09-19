// Hole 22 round 2 reviewer — did anything else happen to Combo since the data fix? Every table with client_id. Read only, no values printed.
import pg from "pg";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const SINCE = process.argv[2] || "2026-09-18T15:38:00Z";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  console.log("now", (await c.query("select now()")).rows[0].now.toISOString(), "since", SINCE);
  const tabs = (await c.query(`
    select t.table_name,
      bool_or(col.column_name='created_at') has_c, bool_or(col.column_name='updated_at') has_u,
      array_agg(col.column_name::text) cols
    from information_schema.tables t join information_schema.columns col on col.table_schema=t.table_schema and col.table_name=t.table_name
    where t.table_schema='public' and t.table_type='BASE TABLE'
    group by t.table_name having bool_or(col.column_name='client_id')`)).rows;
  let hits = 0;
  for (const t of tabs) {
    const tc = [t.has_c && "created_at", t.has_u && "updated_at"].filter(Boolean);
    if (!tc.length) continue;
    const label = ["name", "kind", "action", "status", "template_key", "channel", "direction", "stage", "stage_key", "event", "type", "decision", "bureau"].filter((k) => t.cols.includes(k));
    const where = tc.map((x) => `${x} >= $2`).join(" or ");
    await c.query("SAVEPOINT s");
    try {
      const rows = (await c.query(`select ${t.cols.includes("id") ? "id" : "ctid::text as id"}, ${tc.join(",")}${label.length ? "," + label.join(",") : ""} from public."${t.table_name}" where client_id=$1 and (${where}) order by ${tc[0]}`, [COMBO, SINCE])).rows;
      await c.query("RELEASE SAVEPOINT s");
      for (const r of rows) {
        hits++;
        const lab = label.map((k) => `${k}=${r[k]}`).join(" ");
        console.log(`${t.table_name} id=${String(r.id).slice(0, 8)} created=${r.created_at?.toISOString?.() ?? "-"} updated=${r.updated_at?.toISOString?.() ?? "-"} ${lab}`);
      }
    } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); console.log(t.table_name, "ERR", e.message.slice(0, 80)); }
  }
  console.log("tables scanned:", tabs.length, "rows touched since:", hits);
  // events that name Combo in payload but carry no client_id
  const ev = (await c.query(`select id, name, created_at from events where created_at >= $2 and (client_id is null or client_id<>$1) and payload::text like '%' || $1 || '%' order by created_at`, [COMBO, SINCE])).rows;
  for (const r of ev) console.log(`events(payload mention) id=${r.id.slice(0, 8)} ${r.created_at.toISOString()} name=${r.name}`);
  console.log("payload-only event mentions:", ev.length);
} finally { await c.query("ROLLBACK"); await c.end(); }
