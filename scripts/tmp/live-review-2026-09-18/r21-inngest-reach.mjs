// r21 — read-only: did Inngest-run workflows fire for #13's own events on 09-17?
// S00 welcome is an Inngest function on entry.captured; its rows carry the event id in provider_ref.
// Also: payload source keys on #13's survey events vs Combo's. BEGIN READ ONLY, ROLLBACK, no SET.
import pg from "pg";
const T13 = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042", COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const rows = (await c.query(`select m.template_key, m.provider_ref, e.name as ev_name, e.created_at as ev_at
      from messages m left join events e on m.provider_ref like '%' || e.id::text || '%' and e.client_id = m.client_id
     where m.client_id=$1 order by m.created_at`, [T13])).rows;
  for (const r of rows) console.log(`#13 ${r.template_key} keyed on event: ${r.ev_name ?? "?"} ${r.ev_at ? r.ev_at.toISOString() : ""}`);
  for (const [l, id] of [["#13", T13], ["Combo", COMBO]]) {
    const ev = (await c.query(`select created_at, payload from events where client_id=$1 and name='survey.submitted' order by created_at limit 2`, [id])).rows;
    for (const e of ev) {
      const p = e.payload || {};
      console.log(`${l} survey ${e.created_at.toISOString()} payload keys: ${Object.keys(p).slice(0, 14).join(",")} source=${p.source ?? p.origin ?? p.adapter ?? "-"}`);
    }
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
