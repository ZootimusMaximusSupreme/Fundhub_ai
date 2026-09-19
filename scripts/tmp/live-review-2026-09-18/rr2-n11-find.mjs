// rr2-n11: read-only. Find the review sim client(s) by plus-tag, list their messages
// and the line that replaced {{unsubscribe}} in each stored email. BEGIN READ ONLY, no SET.
import pg from "pg";
const TAG = process.argv[2] || "sim-rr2n11";
const mask = (s) => String(s).replace(/((?:\?|&|&amp;)sig=)[0-9a-f]{6}[0-9a-f]*/gi, "$1<sig…>").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const cl = (await c.query(`SELECT id, first_name, last_name, created_at FROM clients WHERE email LIKE '%+' || $1 || '%' ORDER BY created_at`, [TAG])).rows;
  for (const k of cl) {
    console.log(`client ${k.id} ${k.first_name} ${k.last_name} created ${k.created_at.toISOString()}`);
    const ms = (await c.query(`SELECT id, created_at, channel, template_key, status, provider, last_error, rendered_body FROM messages WHERE client_id = $1 ORDER BY created_at`, [k.id])).rows;
    for (const mm of ms) {
      const b = mm.rendered_body || "";
      console.log(`  msg ${mm.id} ${mm.created_at.toISOString()} ${mm.channel} ${mm.template_key} ${mm.status} via ${mm.provider} ${mm.last_error ? "err: " + mm.last_error : ""}`);
      console.log(`    has '{{': ${b.includes("{{")}  'unsubscribe.html' count: ${(b.match(/unsubscribe\.html/g)||[]).length}`);
      const lines = b.split(/\r?\n/); const i = lines.findIndex(l => /Funding Intelligence for Entrepreneurs/.test(l));
      if (i >= 0) for (const l of lines.slice(i, i + 2)) console.log(`    | ${mask(l).trim().slice(0, 500)}`);
    }
    const ev = (await c.query(`SELECT name, created_at FROM events WHERE client_id = $1 ORDER BY created_at`, [k.id])).rows;
    console.log(`  events: ${ev.map(e => e.name + "@" + e.created_at.toISOString().slice(11,19)).join(", ")}`);
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
