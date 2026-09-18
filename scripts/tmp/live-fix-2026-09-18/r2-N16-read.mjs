// READ ONLY. Hole N16: #13's threads, the shape of email bodies, and the
// timestamps the Messaging side panel reads. BEGIN READ ONLY ... COMMIT only.
// No SET, no writes. Bodies are written to the scratchpad, never printed.
import { writeFileSync, mkdirSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";
const THIRTEEN = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const OUT = process.argv[2] || "/tmp/n16";
mkdirSync(OUT, { recursive: true });
const out = {};
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  out.convs = (await c.query(`SELECT id, channel, last_pulse_at, created_at FROM conversations WHERE client_id=$1 ORDER BY created_at`, [THIRTEEN])).rows;
  out.msgs = (await c.query(`SELECT id, conversation_id, direction, channel, status, created_at, subject, length(rendered_body) len,
      (rendered_body ~* '<\\s*(!doctype|html|body|p|div|br|table)\\y') is_html
      FROM messages WHERE client_id=$1 ORDER BY created_at`, [THIRTEEN])).rows;
  const bodies = (await c.query(`SELECT id, rendered_body FROM messages WHERE client_id=$1 AND channel='email' ORDER BY created_at`, [THIRTEEN])).rows;
  for (const b of bodies) writeFileSync(`${OUT}/${b.id}.html`, b.rendered_body || "");
  out.org_email_shape = (await c.query(`SELECT direction, count(*) n,
      count(*) FILTER (WHERE rendered_body ~* '<\\s*(!doctype|html|body|p|div|br|table)\\y') html,
      count(*) FILTER (WHERE rendered_body ~* '<script') has_script,
      count(*) FILTER (WHERE rendered_body ~* '<style') has_style
      FROM messages WHERE channel='email' GROUP BY direction`)).rows;
  out.sms_with_lt = (await c.query(`SELECT count(*) n FROM messages WHERE channel<>'email' AND rendered_body LIKE '%<%'`)).rows;
  out.null_pulse = (await c.query(`SELECT count(*) FILTER (WHERE last_pulse_at IS NULL) null_pulse, count(*) total FROM conversations`)).rows;
  await c.query("COMMIT");
} catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
finally { c.release(); await close(); }
writeFileSync(`${OUT}/read.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
