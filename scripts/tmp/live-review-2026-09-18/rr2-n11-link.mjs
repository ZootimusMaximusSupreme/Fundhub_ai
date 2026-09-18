// rr2-n11: take the unsubscribe link out of a stored message (read-only) and ask the live
// public endpoint (GET only — GET never unsubscribes) if it is signed with the live secret.
// Then flip one sig character, and swap the client id, and expect refusals.
import pg from "pg";
const MSG = process.argv[2];
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN READ ONLY");
const r = (await c.query(`SELECT client_id, rendered_body FROM messages WHERE id = $1`, [MSG])).rows[0];
await c.query("ROLLBACK"); await c.end();
const hrefs = [...r.rendered_body.matchAll(/href="(https:\/\/fundhub\.ai\/unsubscribe\.html\?[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
console.log(`links in stored body: ${hrefs.length}`);
for (const h of hrefs) {
  const u = new URL(h);
  console.log(`  client param matches row client: ${u.searchParams.get("client") === r.client_id}; channel=${u.searchParams.get("channel")}; exp=${new Date(Number(u.searchParams.get("exp")) * 1000).toISOString()}`);
  const g = await fetch(`https://fundhub.ai/api/public/unsubscribe?${u.searchParams}`); console.log(`  GET signed link -> ${g.status} ${await g.text()}`);
  const sig = u.searchParams.get("sig");
  const bad = new URLSearchParams(u.searchParams); bad.set("sig", (sig[0] === "a" ? "b" : "a") + sig.slice(1));
  const g2 = await fetch(`https://fundhub.ai/api/public/unsubscribe?${bad}`); console.log(`  GET one-char-changed sig -> ${g2.status} ${await g2.text()}`);
  const other = new URLSearchParams(u.searchParams); other.set("client", "7ccbeb76-df98-4125-8c14-0d1c9f5e3042");
  const g3 = await fetch(`https://fundhub.ai/api/public/unsubscribe?${other}`); console.log(`  GET same sig, other client -> ${g3.status} ${await g3.text()}`);
}
