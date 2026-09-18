// N11 — read-only live check. Does EMAIL-NOBOOK-01 (and every other live
// template) carry {{unsubscribe}}, and what did the stored copy of #13's
// EMAIL-NOBOOK-01 get in its place? BEGIN READ ONLY, ROLLBACK. No SET.
// Prints no address, no secret, no full body — only the lines around the token,
// with any signed-link signature cut to its first 6 characters.
import pg from "pg";

const CLIENT = process.argv[2] || "7ccbeb76-df98-4125-8c14-0d1c9f5e3042"; // #13 Sim Thirteen-NoBook
const mask = (s) => String(s)
  .replace(/([?&]sig=)[0-9a-f]{6}[0-9a-f]*/gi, "$1<sig…>")
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>")
  .replace(/(email=)[^"&\s<]+/g, "$1<email>");

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  console.log(`now ${new Date().toISOString()}`);

  const tpls = (await c.query(
    `SELECT o.slug, t.template_key, t.channel, t.compliance_passed, t.updated_at,
            (t.body ~ '\\{\\{\\s*unsubscribe\\s*\\}\\}') AS in_body,
            (coalesce(t.subject,'') ~ '\\{\\{\\s*unsubscribe\\s*\\}\\}') AS in_subject,
            (t.body ~* '<!DOCTYPE\\s+html|<html[\\s>]|<table[\\s>]') AS html
       FROM message_templates t JOIN orgs o ON o.id = t.org_id
      WHERE t.body ~ '\\{\\{\\s*unsubscribe' OR coalesce(t.subject,'') ~ '\\{\\{\\s*unsubscribe'
      ORDER BY o.slug, t.template_key`)).rows;
  console.log(`\nlive templates holding {{unsubscribe}}: ${tpls.length}`);
  for (const t of tpls) {
    console.log(`  ${t.slug} ${t.template_key} ${t.channel} approved=${t.compliance_passed} html=${t.html} body=${t.in_body} subject=${t.in_subject}`);
  }

  const other = (await c.query(
    `SELECT DISTINCT m[1] AS tag FROM message_templates t,
            regexp_matches(t.body, '\\{\\{\\s*(unsub\\w*|opt_?out\\w*)\\s*\\}\\}', 'gi') AS m`)).rows;
  console.log(`\nany unsubscribe-ish tag names in live bodies: ${JSON.stringify(other.map((r) => r.tag))}`);

  const nb = (await c.query(
    `SELECT body FROM message_templates t JOIN orgs o ON o.id = t.org_id
      WHERE t.template_key = 'EMAIL-NOBOOK-01' ORDER BY o.slug LIMIT 1`)).rows[0];
  if (nb) {
    const lines = nb.body.split(/\r?\n/);
    const i = lines.findIndex((l) => /\{\{\s*unsubscribe/.test(l));
    console.log(`\nEMAIL-NOBOOK-01 template: ${lines.length} lines, token on line ${i + 1}`);
    console.log(lines.slice(Math.max(0, i - 3), i + 2).map((l) => `  | ${mask(l)}`).join("\n"));
  }

  const msgs = (await c.query(
    `SELECT id, created_at, status, provider, template_key, rendered_body
       FROM messages WHERE client_id = $1 AND channel = 'email'
        AND template_key IN (SELECT template_key FROM message_templates WHERE body ~ '\\{\\{\\s*unsubscribe')
      ORDER BY created_at`, [CLIENT])).rows;
  for (const m of msgs) {
    const lines = m.rendered_body.split(/\r?\n/);
    console.log(`\nstored ${m.template_key} ${m.id} ${m.created_at.toISOString()} ${m.status} via ${m.provider}: ${lines.length} lines`);
    console.log(`  contains '{{': ${m.rendered_body.includes("{{")}; contains 'unsubscribe.html': ${m.rendered_body.includes("unsubscribe.html")}; mentions 'nsubscribe': ${/nsubscribe/i.test(m.rendered_body)}`);
    const i = lines.findIndex((l) => /unsubscribe\.html|Funding Intelligence for Entrepreneurs/.test(l));
    const tail = i >= 0 ? lines.slice(Math.max(0, i - 3), i + 2) : lines.slice(-6);
    console.log(tail.map((l) => `  | ${JSON.stringify(mask(l))}`).join("\n"));
  }

  const keys = tpls.filter((t) => t.channel === "email").map((t) => t.template_key);
  if (keys.length) {
    const agg = (await c.query(
      `SELECT template_key, count(*)::int AS n,
              count(*) FILTER (WHERE rendered_body LIKE '%unsubscribe.html%')::int AS with_link,
              max(created_at) AS last
         FROM messages WHERE channel = 'email' AND template_key = ANY($1) GROUP BY template_key ORDER BY 1`, [keys])).rows;
    console.log(`\nstored email rows from those templates (all orgs):`);
    for (const a of agg) console.log(`  ${a.template_key}: ${a.n} rows, ${a.with_link} carry a link in rendered_body, last ${a.last?.toISOString()}`);
  }
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
