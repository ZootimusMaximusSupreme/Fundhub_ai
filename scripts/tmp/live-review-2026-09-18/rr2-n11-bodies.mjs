// rr2-n11: read-only. Dump masked stored bodies (before row on #13, after rows on the
// two review sims) to scratch files so they can be rendered and marked up.
import pg from "pg";
import { writeFileSync } from "node:fs";
const DIR = process.argv[2];
const mask = (s) => String(s).replace(/((?:\?|&|&amp;)sig=)[0-9a-f]{6}[0-9a-f]*/gi, "$1<sig…>").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN READ ONLY");
const before = (await c.query(`SELECT id, created_at, rendered_body FROM messages WHERE client_id='7ccbeb76-df98-4125-8c14-0d1c9f5e3042' AND template_key='EMAIL-NOBOOK-01' ORDER BY created_at LIMIT 1`)).rows[0];
console.log(`before row ${before.id} ${before.created_at.toISOString()} unsubscribe.html in body: ${before.rendered_body.includes("unsubscribe.html")}`);
writeFileSync(`${DIR}/rr2-n11-before-13.html`, mask(before.rendered_body));
for (const [k, id] of [["a", "119378a0-d35d-41d4-a55b-4ad227b6f365"], ["b", "e265df84-7b36-4fd9-b28a-fa6b3348ea35"]]) {
  writeFileSync(`${DIR}/rr2-n11-stored-${k}.html`, mask((await c.query(`SELECT rendered_body FROM messages WHERE id=$1`, [id])).rows[0].rendered_body));
}
await c.query("ROLLBACK"); await c.end();
