// HOLE 21 FIX (data-only) — queue the ONE no-book chase message #13 is owed.
//
// Why: #13's only chase run started 2026-09-17 06:20 UTC. Its first step asked
// "has this person booked?" with the OLD check, which counted Sim Eight-Funding's
// booking (same agent phone, booked 06:18) as #13's, so the run ended at
// "already booked" and never sent. The check was fixed and went live at 23:14 UTC
// that day (ship 8a35bd30), but nothing restarts a run that already ended.
//
// What this does — exactly chase step 1 ("send-nobook-1") and nothing else:
//   1. asks the FIXED hasBooked() (the live code) — stops if #13 has booked;
//   2. calls the real sendTemplated() for SMS-NOBOOK-01 and EMAIL-NOBOOK-01,
//      with the same eventId the chase uses (`<survey event id>:1` / `:1e`), so
//      the rows are the ones the chase would have written and can never double;
//   3. the live dispatcher (cron, every 5 minutes) gates and sends them.
// It does NOT schedule chase steps 2 or 3.
//
// Default is a DRY RUN: BEGIN, queue, run the real send gate on the rows, ROLLBACK.
// Pass --commit to write for real. Refuses unless the SMS destination is the
// agent phone ending 4248. Never prints a secret; phone last 4 only.
//
// Run with INNGEST_EVENT_KEY emptied for THIS process only (the local .env holds
// a masked value): message.queued has no listener anywhere, so nothing is lost.
import pg from "pg";
import { hasBooked, SMS_NOBOOK_01, EMAIL_NOBOOK_01 } from "../../../src/workflows/s-nobook-chase.mjs";
import { sendTemplated } from "../../../src/workflows/messaging.mjs";
import { gate } from "../../../src/messaging/gate.mjs";

const CLIENT = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042"; // #13 Sim Thirteen-NoBook
const AGENT_PHONE_LAST10 = "6616054248";
const COMMIT = process.argv.includes("--commit");

if (process.env.INNGEST_EVENT_KEY) {
  console.error("refusing: run with INNGEST_EVENT_KEY= (empty) for this process");
  process.exit(2);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN");
  const me = (await c.query(
    `SELECT id, org_id, first_name, last_name, phone FROM clients WHERE id = $1`, [CLIENT])).rows[0];
  if (!me) throw new Error("client not found");
  const last10 = String(me.phone || "").replace(/\D/g, "").slice(-10);
  if (last10 !== AGENT_PHONE_LAST10) throw new Error(`refusing: phone is not the agent phone (…${last10.slice(-4)})`);

  // The run the chase actually started from: the FIRST survey.submitted (later
  // repeat posts inside 6 hours are kept off the job cloud by the funnel adapter).
  const survey = (await c.query(
    `SELECT id, created_at FROM events WHERE client_id = $1 AND name = 'survey.submitted'
      ORDER BY created_at ASC LIMIT 1`, [CLIENT])).rows[0];
  if (!survey) throw new Error("no survey.submitted for #13");
  console.log(`#13 ${me.first_name} ${me.last_name}; chase event ${survey.id} at ${survey.created_at.toISOString()}`);

  const booked = await hasBooked(c, CLIENT);
  console.log(`hasBooked (fixed, live code): ${booked}`);
  if (booked) { await c.query("ROLLBACK"); console.log("booked — nothing owed. stop."); process.exit(0); }

  const already = (await c.query(
    `SELECT template_key, status FROM messages WHERE client_id = $1 AND template_key LIKE '%NOBOOK%'`, [CLIENT])).rows;
  console.log(`NOBOOK rows before: ${JSON.stringify(already)}`);

  const sms = await sendTemplated(c, {
    orgId: me.org_id, clientId: CLIENT, channel: "sms", templateKey: SMS_NOBOOK_01, eventId: `${survey.id}:1`
  });
  const email = await sendTemplated(c, {
    orgId: me.org_id, clientId: CLIENT, channel: "email", templateKey: EMAIL_NOBOOK_01, eventId: `${survey.id}:1e`
  });
  console.log(`sendTemplated sms: ${JSON.stringify(sms)}`);
  console.log(`sendTemplated email: ${JSON.stringify(email)}`);

  const rows = (await c.query(
    `SELECT id, org_id, client_id, channel, template_key, status, provider_ref, rendered_body, to_address,
            conversation_id IS NOT NULL AS threaded
       FROM messages WHERE client_id = $1 AND template_key LIKE '%NOBOOK%' ORDER BY channel`, [CLIENT])).rows;
  for (const m of rows) {
    // The same gate the dispatcher runs. "now" is set to noon Phoenix only so a
    // quiet-hours hold (a deferral, not a block) does not hide any real reason.
    const noon = new Date(); noon.setUTCHours(19, 0, 0, 0);
    const verdict = await gate(c, {
      orgId: m.org_id, clientId: m.client_id, channel: m.channel, body: m.rendered_body,
      messageId: m.id, templateKey: m.template_key, toAddress: m.to_address
    }, { now: () => noon });
    const to = m.channel === "sms" ? `…${String(m.to_address).slice(-4)}` : `@${String(m.to_address).split("@")[1]}`;
    console.log(`${m.template_key} ${m.status} to ${to} threaded=${m.threaded} ref=${m.provider_ref}`);
    console.log(`   gate: ${verdict.state} ${JSON.stringify((verdict.reasons || []).map((r) => r.code))}`);
    if (m.channel === "sms") console.log(`   body: ${m.rendered_body}`);
  }

  if (COMMIT) { await c.query("COMMIT"); console.log("COMMITTED — the live dispatcher sends within 5 minutes."); }
  else { await c.query("ROLLBACK"); console.log("DRY RUN — rolled back, nothing written."); }
} catch (err) {
  await c.query("ROLLBACK").catch(() => {});
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
} finally {
  await c.end();
}
