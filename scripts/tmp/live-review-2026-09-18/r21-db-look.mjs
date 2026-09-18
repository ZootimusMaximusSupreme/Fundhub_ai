// r21 — reviewer's own read-only look at the LIVE database for hole 21 (no-book chase).
// BEGIN READ ONLY, then ROLLBACK. No bare SET. Sends nothing, writes nothing.
// Prints no secrets, no full phone numbers (last 4 only), no full email addresses (masked).
//  1. every message ever for #13 Thirteen-NoBook
//  2. Combo's no-book rows vs its survey-done time (control)
//  3. cause check: #13 survey time, Sim Eight's booking time + phone last 4,
//     old vs new "has booked?" answer as of #13's survey time
//  5. EMAIL-NOBOOK-01 stored body: literal {{unsubscribe}} or an empty spot?
import pg from "pg";

const T13 = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";

const url = process.env.DATABASE_URL;
if (!url) { console.log("DATABASE_URL not set"); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });

const last4 = (s) => { const d = String(s ?? "").replace(/\D/g, ""); return d ? `…${d.slice(-4)}` : "-"; };
const maskEmail = (s) => {
  if (!s) return "-";
  const [u, d] = String(s).split("@");
  return d ? `${u.slice(0, 6)}***@${d}` : "***";
};
const addr = (s) => (String(s ?? "").includes("@") ? maskEmail(s) : last4(s));
const scrub = (s) => String(s ?? "")
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m))
  .replace(/\+?\d[\d\s().-]{8,}\d/g, (m) => last4(m));
const iso = (d) => (d ? new Date(d).toISOString() : "-");

await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const ro = (await c.query("show transaction_read_only")).rows[0].transaction_read_only;
  console.log(`transaction_read_only=${ro}  db_now=${iso((await c.query("select now()")).rows[0].now)}`);

  const mcols = (await c.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name='messages' order by ordinal_position`
  )).rows.map((r) => r.column_name);
  console.log(`messages columns: ${mcols.join(", ")}`);
  const has = (col) => mcols.includes(col);

  const clientRow = async (id) => (await c.query(`select to_jsonb(cl) as j from clients cl where id=$1`, [id])).rows[0]?.j;
  const name = (j) => j ? [j.first_name, j.last_name].filter(Boolean).join(" ") || j.name || j.full_name || "?" : "?";

  const listMessages = async (id, label, filterSql = "") => {
    const rows = (await c.query(
      `select id, template_key, channel, ${has("direction") ? "direction" : "null as direction"}, status, provider,
              (provider_message_id is not null and provider_message_id <> '') as has_pid,
              created_at, ${has("sent_at") ? "sent_at" : "null as sent_at"}, ${has("scheduled_at") ? "scheduled_at" : "null as scheduled_at"},
              ${has("last_attempt_at") ? "last_attempt_at" : "null as last_attempt_at"},
              ${has("to_address") ? "to_address" : "null as to_address"}, ${has("event_id") ? "event_id" : "null as event_id"},
              ${has("last_error") ? "left(last_error, 160)" : "null"} as last_error,
              ${has("is_demo") ? "is_demo" : "null as is_demo"}
         from messages where client_id=$1 ${filterSql} order by created_at`, [id]
    )).rows;
    console.log(`\n${label}: ${rows.length} message rows`);
    for (const r of rows) {
      console.log(`  ${iso(r.created_at)} ${r.template_key ?? "(no template)"} ch=${r.channel} dir=${r.direction ?? "-"} status=${r.status} provider=${r.provider ?? "-"} pid=${r.has_pid ? "yes" : "no"} sent_at=${iso(r.sent_at)} last_attempt=${iso(r.last_attempt_at)} to=${addr(r.to_address)} event_id=${r.event_id ? String(r.event_id).slice(-40) : "-"} demo=${r.is_demo}${r.last_error ? ` err=${scrub(r.last_error)}` : ""}`);
    }
    return rows;
  };

  // ---------- 1. #13 ----------
  const t13 = await clientRow(T13);
  console.log(`\n#13 client: name="${name(t13)}" org=${String(t13?.org_id).slice(0, 8)} phone=${last4(t13?.phone)} email=${maskEmail(t13?.email)} stage=${t13?.stage ?? t13?.status ?? "-"} created=${t13?.created_at}`);
  const m13 = await listMessages(T13, "1. #13 ALL messages ever");
  const after = m13.filter((r) => new Date(r.created_at) >= new Date("2026-09-18T14:54:00Z"));
  console.log(`   rows created at/after 2026-09-18 14:54 UTC: ${after.length} -> ${after.map((r) => r.template_key).join(", ")}`);

  // message_events / provider callbacks for #13's no-book rows, if a table exists
  const evTables = (await c.query(
    `select table_name from information_schema.tables where table_schema='public' and table_name ~ '(message_event|message_status|delivery|webhook)' order by 1`
  )).rows.map((r) => r.table_name);
  console.log(`   status/delivery tables present: ${evTables.join(", ") || "none"}`);

  // ---------- events for #13 ----------
  const ecols = (await c.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name='events' order by ordinal_position`
  )).rows.map((r) => r.column_name);
  console.log(`\nevents columns: ${ecols.join(", ")}`);
  const ev13 = (await c.query(
    `select id, name, created_at, client_id from events where client_id=$1 order by created_at`, [T13]
  )).rows;
  console.log(`#13 events (client_id stamped): ${ev13.length}`);
  for (const e of ev13) console.log(`  ${iso(e.created_at)} ${e.name} id=${String(e.id).slice(0, 8)}`);

  // ---------- 2. Combo control ----------
  const combo = await clientRow(COMBO);
  console.log(`\nCombo client: name="${name(combo)}" phone=${last4(combo?.phone)} email=${maskEmail(combo?.email)}`);
  const evC = (await c.query(
    `select name, created_at from events where client_id=$1 and name in ('survey.submitted','booking.created') order by created_at`, [COMBO]
  )).rows;
  for (const e of evC) console.log(`  Combo event ${iso(e.created_at)} ${e.name}`);
  await listMessages(COMBO, "2. Combo NOBOOK rows", "and template_key ilike '%NOBOOK%'");

  // ---------- 3. cause check ----------
  const surv13 = (await c.query(
    `select min(created_at) as t from events where client_id=$1 and name='survey.submitted'`, [T13]
  )).rows[0].t;
  console.log(`\n3. #13 first survey.submitted: ${iso(surv13)}`);
  const phone13 = String(t13?.phone ?? "").replace(/\D/g, "").slice(-10);
  const books = (await c.query(
    `select e.id, e.created_at, e.client_id, e.payload->>'phone' as p, e.payload->>'email' as em,
            to_jsonb(cl) as cj
       from events e left join clients cl on cl.id = e.client_id
      where e.name='booking.created' and e.org_id=$1
        and right(regexp_replace(coalesce(e.payload->>'phone',''), '\\D','','g'),10) = $2
      order by e.created_at`, [t13?.org_id, phone13]
  )).rows;
  console.log(`   booking.created events in #13's org on #13's phone (${last4(phone13)}): ${books.length}`);
  for (const b of books) {
    console.log(`    ${iso(b.created_at)} client=${b.client_id ? String(b.client_id).slice(0, 8) : "NULL"} "${name(b.cj)}" phone=${last4(b.p)} email=${maskEmail(b.em)}${new Date(b.created_at) <= new Date(surv13) ? "  <-- before #13's survey" : ""}`);
  }
  const b13own = (await c.query(`select count(*)::int n from events where name='booking.created' and client_id=$1`, [T13])).rows[0].n;
  console.log(`   booking.created stamped to #13 itself: ${b13own}`);

  // old check (pre bf24b6c8) vs new check, both limited to events that existed at #13's survey time
  const oldQ = `WITH me AS (SELECT org_id, email, phone FROM clients WHERE id = $1)
     SELECT e.id, e.client_id, e.created_at FROM events e, me
      WHERE e.name='booking.created' AND e.org_id=me.org_id AND e.created_at <= $2
        AND ( e.client_id = $1
          OR (me.email IS NOT NULL AND lower(COALESCE(e.payload->>'email','')) = lower(me.email))
          OR (length(regexp_replace(COALESCE(me.phone,''), '\\D','','g')) >= 10
              AND right(regexp_replace(COALESCE(e.payload->>'phone',''), '\\D','','g'),10)
                = right(regexp_replace(me.phone, '\\D','','g'),10)) )
      ORDER BY e.created_at`;
  const newQ = `WITH me AS (SELECT org_id, email, phone FROM clients WHERE id = $1)
     SELECT e.id FROM events e, me
      WHERE e.name='booking.created' AND e.org_id=me.org_id AND e.created_at <= $2
        AND ( e.client_id = $1
          OR (e.client_id IS NULL AND me.email IS NOT NULL AND lower(COALESCE(e.payload->>'email','')) = lower(me.email))
          OR (e.client_id IS NULL AND length(regexp_replace(COALESCE(me.phone,''), '\\D','','g')) >= 10
              AND right(regexp_replace(COALESCE(e.payload->>'phone',''), '\\D','','g'),10)
                = right(regexp_replace(me.phone, '\\D','','g'),10)) )`;
  // the chase's first check runs right after the survey event; give it a 5-minute window
  const at = new Date(new Date(surv13).getTime() + 5 * 60 * 1000);
  const oldHits = (await c.query(oldQ, [T13, at])).rows;
  const newHits = (await c.query(newQ, [T13, at])).rows;
  console.log(`   OLD check as of survey+5m: booked=${oldHits.length > 0} (${oldHits.length} matching bookings: ${oldHits.map((h) => `${iso(h.created_at)} client=${h.client_id ? String(h.client_id).slice(0, 8) : "NULL"}`).join("; ")})`);
  console.log(`   NEW check as of survey+5m: booked=${newHits.length > 0}`);
  const newNow = (await c.query(newQ, [T13, new Date()])).rows;
  console.log(`   NEW check as of now: booked=${newNow.length > 0}`);

  // any DB trace of the 09-17 chase run for #13 (agent_runs / audit tables)
  const trace = [];
  for (const t of ["agent_runs", "audit_log", "workflow_runs", "journey_runs"]) {
    const ex = (await c.query(`select to_regclass('public.${t}') as r`)).rows[0].r;
    if (!ex) continue;
    const cols = (await c.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [t])).rows.map((r) => r.column_name);
    if (!cols.includes("client_id")) { trace.push(`${t}: no client_id column`); continue; }
    const rows = (await c.query(`select to_jsonb(x) as j from ${t} x where client_id=$1 order by 1 limit 50`, [T13])).rows;
    trace.push(`${t}: ${rows.length} rows for #13`);
    for (const r of rows) {
      const j = r.j;
      console.log(`   trace ${t}: ${iso(j.created_at)} ${scrub(JSON.stringify({ a: j.agent_code ?? j.action ?? j.name, t: j.trigger_event, o: j.outcome, d: String(j.detail ?? "").slice(0, 160) }))}`);
    }
  }
  console.log(`   DB trace tables: ${trace.join(" | ") || "none found"}`);

  // ---------- 5. unsubscribe placeholder in stored email body ----------
  const em = (await c.query(
    `select id, created_at, rendered_body from messages where client_id=$1 and template_key='EMAIL-NOBOOK-01' order by created_at`, [T13]
  )).rows;
  const tpl = (await c.query(
    `select body from message_templates where template_key='EMAIL-NOBOOK-01' and org_id=$1`, [t13?.org_id]
  )).rows[0];
  console.log(`\n5. EMAIL-NOBOOK-01 template has literal {{unsubscribe}}: ${tpl ? tpl.body.includes("{{unsubscribe}}") : "no template row"}`);
  for (const r of em) {
    const b = String(r.rendered_body ?? "");
    const i = b.indexOf("Funding Intelligence");
    console.log(`   stored body ${iso(r.created_at)}: len=${b.length} literal_{{unsubscribe}}=${b.includes("{{unsubscribe}}")} any_{{token}}=${/\{\{[^}]*\}\}/.test(b)} has_unsubscribe_word=${/unsubscribe/i.test(b)} has_href_empty=${/href=""/.test(b)}`);
    console.log(`   around the footer line: ${JSON.stringify(scrub(b.slice(Math.max(0, i - 20), i + 140)))}`);
    const booking = b.match(/Grab a time:[^<]*/);
    console.log(`   booking line: ${JSON.stringify(scrub(booking ? booking[0] : "(none)"))}`);
  }

  await c.query("ROLLBACK");
} finally {
  await c.end();
}
