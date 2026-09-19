// r21 — second read-only look (a few minutes after look 1). BEGIN READ ONLY, ROLLBACK, no SET.
//  a. #13 messages again (count, newest), anything new since 14:54 UTC
//  b. provider_ref of each no-book row (#13 and Combo) vs the survey event it is keyed on
//  c. provider delivery callbacks (webhook_captures) that name each no-book row's provider id
// Prints no secrets, no provider ids, no full phone/email.
import pg from "pg";

const T13 = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const url = process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
const iso = (d) => (d ? new Date(d).toISOString() : "-");

await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  console.log(`transaction_read_only=${(await c.query("show transaction_read_only")).rows[0].transaction_read_only} db_now=${iso((await c.query("select now()")).rows[0].now)}`);

  const m = (await c.query(
    `select template_key, channel, status, provider, created_at, updated_at, last_attempt_at, attempts
       from messages where client_id=$1 order by created_at`, [T13])).rows;
  console.log(`\na. #13 message rows now: ${m.length}`);
  for (const r of m) console.log(`  ${iso(r.created_at)} ${r.template_key} ${r.channel} status=${r.status} provider=${r.provider} attempts=${r.attempts} updated=${iso(r.updated_at)}`);
  const nu = m.filter((r) => new Date(r.created_at) > new Date("2026-09-18T14:54:00Z"));
  console.log(`  rows after 14:54 UTC: ${nu.length} (${nu.map((r) => r.template_key).join(", ")})`);

  for (const [label, id] of [["#13", T13], ["Combo", COMBO]]) {
    const surv = (await c.query(
      `select id, created_at from events where client_id=$1 and name='survey.submitted' order by created_at`, [id])).rows;
    const nb = (await c.query(
      `select id, template_key, provider_ref, provider_message_id, status, created_at
         from messages where client_id=$1 and template_key ilike '%NOBOOK%' order by created_at`, [id])).rows;
    console.log(`\nb. ${label}: ${surv.length} survey.submitted events; first=${surv[0] ? `${iso(surv[0].created_at)} ${String(surv[0].id).slice(0, 8)}` : "-"}`);
    for (const r of nb) {
      const ref = String(r.provider_ref ?? "");
      const hit = surv.findIndex((s) => ref.includes(String(s.id)));
      const shape = ref.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, "<uuid>");
      console.log(`  ${r.template_key} ref_shape=${shape} keyed_on_survey_event_index=${hit} (${hit >= 0 ? iso(surv[hit].created_at) : "no match"})`);

      // c. provider callbacks that mention this row's provider id
      const pid = String(r.provider_message_id ?? "");
      if (!pid) { console.log("    no provider id"); continue; }
      const cb = (await c.query(
        `select provider, created_at, parsed from webhook_captures where raw_body like '%' || $1 || '%' or parsed::text like '%' || $1 || '%' order by created_at`,
        [pid])).rows;
      const statuses = cb.map((x) => {
        const p = x.parsed || {};
        const st = p.MessageStatus || p.SmsStatus || p.type || p.status || p.event || (p.data && p.data.status) || "?";
        return `${iso(x.created_at)} ${x.provider}:${st}`;
      });
      console.log(`    provider callbacks naming this provider id: ${cb.length}${statuses.length ? " -> " + statuses.join(" | ") : ""}`);
    }
  }
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
