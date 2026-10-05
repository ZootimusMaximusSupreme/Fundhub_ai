// Postgres proof for M0 step 9 (docs/specs/marketing-machine-2026-10-04.md §6):
// a test client with 50 texts, 5 calls and 3 CSM answers. The dossier holds all
// of them in full, and fetchContext gives an agent either all of it or the
// summary plus the newest items. Skipped without DATABASE_URL; never point this
// at the live database (spec §0.7).

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildDossier, renderDossier } from "./dossier.mjs";
import { refreshDossierSummary } from "./dossier-summary.mjs";
import { fetchContext } from "../agents/context.mjs";
import { stampCallTranscript, stampRecordingUrl } from "../sales/recordings.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const STAMP = `dossier-pg-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const LONG = "the client said this ".repeat(300).trim(); // ~6,300 chars, past every old cut

function minute(i) {
  return new Date(Date.UTC(2026, 7, 1, 12, i)).toISOString();
}

describe("client dossier (M0 step 9)", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let org;
  let otherOrg;
  let staff;
  let client;

  before(async () => {
    org = (await db.query(
      `INSERT INTO orgs (slug, name) VALUES ($1, 'Dossier Pgtest') RETURNING id`, [STAMP])).rows[0].id;
    otherOrg = (await db.query(
      `INSERT INTO orgs (slug, name) VALUES ($1, 'Dossier Pgtest Other') RETURNING id`, [`${STAMP}-other`])).rows[0].id;
    staff = (await db.query(
      `INSERT INTO staff (org_id, name, role, email, status)
       VALUES ($1, 'Dossier Closer', 'closer', $2, 'active') RETURNING id`,
      [org, `${STAMP}@example.com`])).rows[0].id;
    client = (await db.query(
      `INSERT INTO clients (org_id, first_name, last_name, email, custom_fields)
       VALUES ($1, 'Dana', 'Dossier', $2, $3) RETURNING id`,
      [org, `${STAMP}-client@example.com`, { cf_svy_your_why: "hire two people" }])).rows[0].id;

    // 50 texts: 25 from the client (saved with the default sender_kind), 25 to them.
    for (let i = 0; i < 50; i++) {
      await db.query(
        `INSERT INTO messages (org_id, client_id, direction, channel, rendered_body, status, created_at)
         VALUES ($1, $2, $3, 'sms', $4, 'sent', $5)`,
        [org, client, i % 2 ? "inbound" : "outbound", `TEXT-${i} ${LONG}`, minute(i)]
      );
    }
    // 5 calls with full transcripts, 3 CSM answers.
    for (let i = 0; i < 5; i++) {
      await db.query(
        `INSERT INTO call_outcomes (org_id, client_id, staff_id, outcome, belief_failed, notes, transcript, logged_at)
         VALUES ($1, $2, $3, 'callback', 'money', $4, $5, $6)`,
        [org, client, staff, `CALL-NOTE-${i}`, `CALL-WORDS-${i} ${LONG}`, minute(100 + i)]
      );
    }
    for (let i = 0; i < 3; i++) {
      await db.query(
        `INSERT INTO customer_insights (org_id, client_id, stage, channel, answers, notes, recorded_by, occurred_at)
         VALUES ($1, $2, 'mid', 'call', $3, $4, $5, $6)`,
        [org, client, { what_almost_stopped_you: `CSM-ANSWER-${i} ${LONG}` }, `CSM-NOTE-${i}`, staff, minute(200 + i)]
      );
    }
    // Words that reached only the brain.
    const file = (await db.query(
      `INSERT INTO brain_files (org_id, drive_file_id, name, mime_type, client_id, source)
       VALUES ($1, $2, 'Onboarding - Dana Dossier (2026-08-01 09:00 GMT-7) - Recording.mp4', 'video/mp4', $3, 'drive')
       RETURNING id`, [org, `${STAMP}-drive`, client])).rows[0].id;
    for (let i = 0; i < 3; i++) {
      await db.query(
        `INSERT INTO brain_chunks (org_id, file_id, chunk_index, content) VALUES ($1, $2, $3, $4)`,
        [org, file, i, `BRAIN-PART-${i}`]
      );
    }
    // A page view tied to the client, and a row in another org that must never leak in.
    await db.query(
      `INSERT INTO events (org_id, name, client_id, payload, created_at)
       VALUES ($1, 'funnel.page', $2, $3, $4)`,
      [org, client, { page: "roadmap", funnel: "slo", props: {} }, minute(300)]
    );
    await db.query(
      `INSERT INTO messages (org_id, client_id, direction, channel, rendered_body, status)
       VALUES ($1, $2, 'inbound', 'sms', 'OTHER-ORG-LEAK', 'sent')`,
      [otherOrg, client]
    );
    // Another org's call and brain file pointing at the same client id.
    const otherStaff = (await db.query(
      `INSERT INTO staff (org_id, name, role, email, status)
       VALUES ($1, 'Other Closer', 'closer', $2, 'active') RETURNING id`,
      [otherOrg, `${STAMP}-other@example.com`])).rows[0].id;
    await db.query(
      `INSERT INTO call_outcomes (org_id, client_id, staff_id, outcome, notes, transcript)
       VALUES ($1, $2, $3, 'deposit', 'OTHER-ORG-CALL-LEAK', 'OTHER-ORG-WORDS-LEAK')`,
      [otherOrg, client, otherStaff]
    );
    const otherFile = (await db.query(
      `INSERT INTO brain_files (org_id, drive_file_id, name, mime_type, client_id, source)
       VALUES ($1, $2, 'OTHER-ORG-FILE-LEAK', 'video/mp4', $3, 'drive') RETURNING id`,
      [otherOrg, `${STAMP}-other-drive`, client])).rows[0].id;
    await db.query(
      `INSERT INTO brain_chunks (org_id, file_id, chunk_index, content) VALUES ($1, $2, 0, 'OTHER-ORG-CHUNK-LEAK')`,
      [otherOrg, otherFile]
    );
  });

  after(async () => { await close(); });

  test("the dossier holds every text, call and CSM answer, in full, newest first", async () => {
    const d = await buildDossier(db, { orgId: org, clientId: client });
    assert.equal(d.messages.length, 50);
    assert.equal(d.calls.length, 5);
    assert.equal(d.csm.length, 3);
    assert.equal(d.counts.messages_inbound, 25);
    assert.ok(d.messages.every((m) => m.body.endsWith(LONG)), "a text was cut");
    assert.ok(d.calls.every((c) => c.transcript.endsWith(LONG)), "a transcript was cut");
    assert.equal(d.calls[0].notes, "CALL-NOTE-4");
    assert.equal(d.messages[0].body.split(" ")[0], "TEXT-49");
    assert.equal(d.brain.length, 1);
    assert.equal(d.brain[0].text, "BRAIN-PART-0\n\nBRAIN-PART-1\n\nBRAIN-PART-2");
    assert.equal(d.activity.pages[0].page, "roadmap");
    assert.equal(d.profile.survey.cf_svy_your_why, "hire two people");
    assert.equal(d.ad.ad_number, null);
    for (const leak of ["OTHER-ORG-LEAK", "OTHER-ORG-CALL-LEAK", "OTHER-ORG-WORDS-LEAK",
      "OTHER-ORG-FILE-LEAK", "OTHER-ORG-CHUNK-LEAK"]) {
      assert.ok(!JSON.stringify(d).includes(leak), `another org's row leaked in: ${leak}`);
    }

    const r = renderDossier(d);
    assert.equal(r.mode, "full");
    for (let i = 0; i < 50; i++) assert.ok(r.text.includes(`TEXT-${i} ${LONG}`), `text ${i}`);
    for (let i = 0; i < 5; i++) assert.ok(r.text.includes(`said: CALL-WORDS-${i} ${LONG}`), `call ${i}`);
    for (let i = 0; i < 3; i++) assert.ok(r.text.includes(`CSM-ANSWER-${i} ${LONG}`), `csm ${i}`);
  });

  test("fetchContext gives an agent all of it when it fits", async () => {
    const ctx = await fetchContext(db, { orgId: org, clientId: client });
    assert.equal(ctx.dossier_render.mode, "full");
    assert.equal(ctx.dossier_render.items_summarized, 0);
    assert.equal(ctx.recent_messages.length, 50);
    assert.equal(ctx.recent_calls.length, 5);
    assert.equal(ctx.insights.length, 3);
    for (let i = 0; i < 50; i++) assert.ok(ctx.as_prompt_block.includes(`TEXT-${i} ${LONG}`), `text ${i}`);
    for (let i = 0; i < 5; i++) assert.ok(ctx.as_prompt_block.includes(`CALL-WORDS-${i} ${LONG}`), `call ${i}`);
    for (let i = 0; i < 3; i++) assert.ok(ctx.as_prompt_block.includes(`CSM-ANSWER-${i} ${LONG}`), `csm ${i}`);
    assert.ok(ctx.as_prompt_block.includes("BRAIN-PART-2"));
  });

  test("too big for one call: the summary of older items plus the newest items in full", async () => {
    const budgetChars = 120_000;
    const before = await fetchContext(db, { orgId: org, clientId: client, budgetChars });
    assert.equal(before.dossier_render.over_budget, true);
    assert.equal(before.dossier_render.summary_needed, true);

    let calls = 0;
    const out = await refreshDossierSummary(db, {
      orgId: org,
      clientId: client,
      env: { ANTHROPIC_API_KEY: "fake" },
      budgetChars,
      callModelImpl: async () => { calls += 1; return { mode: "live", text: `FAKE-SUMMARY-${calls}`, error: null }; }
    });
    assert.equal(out.refreshed, true);
    assert.ok(calls >= 1);

    const row = (await db.query(
      `SELECT summary, covers_until, items_covered FROM client_dossier_summaries
        WHERE org_id = $1 AND client_id = $2`, [org, client])).rows[0];
    assert.equal(row.summary, `FAKE-SUMMARY-${calls}`);
    assert.equal(row.items_covered, out.items_covered);

    const ctx = await fetchContext(db, { orgId: org, clientId: client, budgetChars });
    assert.equal(ctx.dossier_render.mode, "summary_plus_newer");
    assert.equal(ctx.dossier_render.items_summarized, out.items_covered);
    assert.equal(ctx.dossier_render.items_in_full + ctx.dossier_render.items_summarized,
      ctx.dossier_render.items_total);
    assert.ok(ctx.as_prompt_block.includes(`FAKE-SUMMARY-${calls}`));
    // The newest items are there in full: the page view, every CSM answer and the last call.
    for (let i = 0; i < 3; i++) assert.ok(ctx.as_prompt_block.includes(`CSM-ANSWER-${i} ${LONG}`), `csm ${i}`);
    assert.ok(ctx.as_prompt_block.includes(`CALL-WORDS-4 ${LONG}`));
    // The oldest text is in the summary, not repeated in full.
    assert.ok(!ctx.as_prompt_block.includes(`TEXT-0 ${LONG}`));
    // A second refresh with nothing new is a no-op.
    const again = await refreshDossierSummary(db, {
      orgId: org, clientId: client, env: {}, budgetChars,
      callModelImpl: async () => { throw new Error("must not be called"); }
    });
    assert.equal(again.refreshed, false);
    assert.equal(again.reason, "up_to_date");
  });

  test("a recording's words land on the sales call at the meeting time, never on a CSM meeting", async () => {
    const empty = async (loggedAt) => (await db.query(
      `INSERT INTO call_outcomes (org_id, client_id, staff_id, outcome, logged_at)
       VALUES ($1, $2, $3, 'callback', $4) RETURNING id`, [org, client, staff, loggedAt])).rows[0].id;
    const atMeeting = await empty("2026-09-10T22:40:00Z"); // 15:00 GMT-7 + 40 min
    const latest = await empty("2026-09-20T18:00:00Z");    // the row the old fallback picked

    const csm = await stampCallTranscript(db, {
      orgId: org, clientId: client, transcript: "CSM-WORDS",
      meetingName: "CSM Check-in - Dana Dossier (2026-09-10 15:00 GMT-7) - Recording.mp4"
    });
    assert.equal(csm.stamped, 0);

    const sales = await stampCallTranscript(db, {
      orgId: org, clientId: client, transcript: "SALES-WORDS",
      meetingName: "Funding Call - Dana Dossier (2026-09-10 15:00 GMT-7) - Recording.mp4"
    });
    assert.equal(sales.stamped, 1);
    const got = (await db.query(
      `SELECT id, transcript FROM call_outcomes WHERE org_id = $1 AND id = ANY($2::uuid[])`,
      [org, [atMeeting, latest]])).rows;
    assert.equal(got.find((r) => r.id === atMeeting).transcript, "SALES-WORDS");
    assert.equal(got.find((r) => r.id === latest).transcript, null);
  });

  test("a CSM recording's link goes on the CSM answer, and its words never follow a link onto a call", async () => {
    const csmName = "CSM Check-in - Dana Dossier (2026-09-15 10:00 GMT-7) - Recording.mp4";
    const link = `https://drive.google.com/file/d/${STAMP}-csm`;
    const insight = (await db.query(
      `INSERT INTO customer_insights (org_id, client_id, stage, channel, answers, recorded_by, occurred_at)
       VALUES ($1, $2, 'mid', 'google_meet', '{}'::jsonb, $3, '2026-09-15T17:05:00Z') RETURNING id`,
      [org, client, staff])).rows[0].id;
    const emptyCall = (await db.query(
      `INSERT INTO call_outcomes (org_id, client_id, staff_id, outcome, logged_at)
       VALUES ($1, $2, $3, 'callback', '2026-09-15T17:30:00Z') RETURNING id`,
      [org, client, staff])).rows[0].id;

    const stamp = await stampRecordingUrl(db, { orgId: org, clientId: client, url: link, meetingName: csmName });
    assert.equal(stamp.matched, "csm_insight");
    const ins = (await db.query(`SELECT recording_url FROM customer_insights WHERE org_id = $1 AND id = $2`, [org, insight])).rows[0];
    assert.equal(ins.recording_url, link);
    const call = (await db.query(`SELECT recording_url FROM call_outcomes WHERE org_id = $1 AND id = $2`, [org, emptyCall])).rows[0];
    assert.equal(call.recording_url, null, "a CSM recording's link landed on a sales call");

    // Even if a call row holds this link (stamped wrongly before this fix), the words stay off it.
    await db.query(`UPDATE call_outcomes SET recording_url = $3 WHERE org_id = $1 AND id = $2`, [org, emptyCall, link]);
    const words = await stampCallTranscript(db, {
      orgId: org, clientId: client, url: link, transcript: "CSM-CHECKIN-WORDS", meetingName: csmName
    });
    assert.equal(words.stamped, 0);
    const after = (await db.query(`SELECT transcript FROM call_outcomes WHERE org_id = $1 AND id = $2`, [org, emptyCall])).rows[0];
    assert.equal(after.transcript, null);
  });
});
