// r21 — read-only: the one inbound SMS row at 14:55:12 UTC (no client on it). From/to last 4 and a short scrubbed body.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("BEGIN READ ONLY");
const r = (await c.query(`select to_jsonb(m) j from messages m where direction='inbound' and created_at between '2026-09-18T14:55:00Z' and '2026-09-18T14:55:30Z'`)).rows;
const l4 = (s) => { const d = String(s ?? "").replace(/\D/g, ""); return d ? "…" + d.slice(-4) : "-"; };
for (const { j } of r) {
  const body = String(j.rendered_body ?? "").replace(/\+?\d[\d\s().-]{8,}\d/g, (m) => l4(m)).slice(0, 120);
  const keys = Object.keys(j).filter((k) => /from|to_|address|conversation|client/.test(k));
  console.log(`created=${j.created_at} status=${j.status} provider=${j.provider} client=${j.client_id ? "yes" : "no"} conversation=${j.conversation_id ? "yes" : "no"} to=${l4(j.to_address)} body="${body}" addrKeys=${keys.join(",")}`);
}
const cap = (await c.query(`select provider, created_at, raw_body from webhook_captures where created_at between '2026-09-18T14:55:05Z' and '2026-09-18T14:55:20Z' order by created_at`)).rows;
for (const x of cap) {
  const raw = String(x.raw_body);
  const g = (k) => { const m = raw.match(new RegExp(`(?:^|&)${k}=([^&]*)`)); return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null; };
  console.log(`capture ${x.created_at.toISOString()} ${x.provider} From=${l4(g("From"))} To=${l4(g("To"))} status=${g("MessageStatus") ?? g("SmsStatus") ?? "-"} bodyLen=${(g("Body") ?? "").length}`);
}
await c.query("ROLLBACK"); await c.end();
