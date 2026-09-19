// r21 — read-only: what the Twilio / Resend delivery callbacks for #13's and Combo's
// no-book rows actually said. BEGIN READ ONLY, ROLLBACK, no SET. Prints status words only.
import pg from "pg";
const ids = { "#13": "7ccbeb76-df98-4125-8c14-0d1c9f5e3042", Combo: "567c12ce-64de-4043-aa98-d842434bd267" };
const url = process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  for (const [label, id] of Object.entries(ids)) {
    const nb = (await c.query(`select template_key, provider_message_id from messages where client_id=$1 and template_key ilike '%NOBOOK%'`, [id])).rows;
    for (const r of nb) {
      const cb = (await c.query(`select provider, created_at, raw_body, parsed from webhook_captures where raw_body like '%'||$1||'%' order by created_at`, [r.provider_message_id])).rows;
      for (const x of cb) {
        const raw = String(x.raw_body);
        const tw = raw.match(/(?:^|&)MessageStatus=([^&]*)/);
        const ec = raw.match(/(?:^|&)ErrorCode=([^&]*)/);
        const rs = raw.match(/"type"\s*:\s*"([^"]+)"/);
        const pk = x.parsed ? Object.keys(x.parsed).slice(0, 8).join(",") : "-";
        console.log(`${label} ${r.template_key} ${x.created_at.toISOString()} ${x.provider} status=${tw ? tw[1] : rs ? rs[1] : "?"}${ec ? ` err=${ec[1]}` : ""} parsedKeys=${pk}`);
      }
    }
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
