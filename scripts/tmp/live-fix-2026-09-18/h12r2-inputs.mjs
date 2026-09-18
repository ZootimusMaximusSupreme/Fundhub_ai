// HOLE 12 round 2 — LOOK ONLY. When did the things the control panel's step is
// worked out from change on #8 / #11 / #12 / Combo, and did a next-action writer
// run after each one? BEGIN READ ONLY, ROLLBACK, no SET, no secrets printed.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h12r2-inputs.mjs
import pg from "pg";
import { writeFileSync } from "node:fs";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-12/round2";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  twelve: "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
  combo: "567c12ce-64de-4043-aa98-d842434bd267",
};
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p = []) => {
  await c.query("SAVEPOINT s");
  try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 200) }]; }
};
const t = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) : null);
const out = {};
try {
  await c.query("BEGIN READ ONLY");
  for (const [k, id] of Object.entries(IDS)) {
    const f = {};
    f.cases = (await q(`select case_status::text st, requested_at, updated_at from inquiry_removal_cases where client_id=$1 order by requested_at`, [id]))
      .map((r) => r.error ? r : `${r.st} requested ${t(r.requested_at)} updated ${t(r.updated_at)}`);
    f.card = (await q(`select p.key pipeline, ps.key stage, ca.updated_at from cards ca join pipelines p on p.id=ca.pipeline_id join pipeline_stages ps on ps.id=ca.stage_id where ca.client_id=$1 order by ca.updated_at desc`, [id]))
      .map((r) => r.error ? r : `${r.pipeline}/${r.stage} @ ${t(r.updated_at)}`);
    f.crs = (await q(`select created_at, is_demo from crs_results where client_id=$1 order by created_at`, [id]))
      .map((r) => r.error ? r : `${t(r.created_at)} demo=${r.is_demo}`);
    f.writer_events = (await q(
      `select name, created_at from events where client_id=$1
          and name in ('deposit.paid','round.started','round.submitted','round.approved','inquiry.removed','analysis.completed','mail.response','docs.received')
        order by created_at`, [id])).map((r) => r.error ? r : `${r.name} @ ${t(r.created_at)}`);
    f.writer_tasks = (await q(
      `select source_workflow, title, created_at from tasks where client_id=$1
          and source_workflow in ('s-06-post-call-funding-purchased','f-01-funding-intake','c-05-pre-funding-review','c-02-inquiry-created','c-03-inquiry-removed-resume-or-hold','f-06-funding-conditions-missing-docs','f-11-bank-email-event-router','s-doc-collection')
        order by created_at`, [id])).map((r) => r.error ? r : `${r.source_workflow} | ${r.title} @ ${t(r.created_at)}`);
    out[k] = f;
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
writeFileSync(`${OUT}/h12r2-inputs.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
