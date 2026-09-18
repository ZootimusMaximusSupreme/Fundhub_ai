// rr2-n11: read-only. Every email row created after the 1ad2c5f8 ship (19:47:05 UTC)
// from a template that holds {{unsubscribe}}, and every other email row since then.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN READ ONLY");
const keys = (await c.query(`SELECT DISTINCT template_key FROM message_templates WHERE body ~ '\\{\\{\\s*unsubscribe'`)).rows.map(r => r.template_key);
const rows = (await c.query(`SELECT m.id, m.created_at, m.template_key, m.status, m.client_id, m.rendered_body, cl.first_name, cl.last_name FROM messages m LEFT JOIN clients cl ON cl.id=m.client_id WHERE m.created_at > '2026-09-18T19:47:05Z' AND m.channel='email' ORDER BY m.created_at`)).rows;
for (const r of rows) {
  const b = r.rendered_body || ""; const tagged = keys.includes(r.template_key);
  const links = [...b.matchAll(/unsubscribe\.html\?[^"]*?client=([0-9a-f-]{36})/g)].map(m => m[1]);
  console.log(`${r.created_at.toISOString()} ${r.template_key} ${r.status} ${r.first_name} ${String(r.last_name||"").slice(0,12)} | template has tag: ${tagged} | links: ${links.length} (own client: ${links.every(l => l === r.client_id)}) | '{{': ${b.includes("{{")}`);
}
await c.query("ROLLBACK"); await c.end();
