// N8 DRY RUN — the exact new code, on the live rows, writing nothing.
//
// For every repair file on live that ever reached repair.docs.needed, runs
// notifyRepairEmail({ name: "repair.docs.needed" }) from this branch — the same
// call onRepairEvent makes — and, for contrast, the same call from main.
//
// NOTHING IS WRITTEN AND NOTHING IS SENT:
//   - every query runs inside BEGIN READ ONLY (Postgres refuses any write);
//   - the one-shot lock claim (UPDATE clients ... custom_fields) is answered by
//     reading the lock instead: "would claim" when it is empty;
//   - `send` is a recorder, never sendTemplated.
// No SET. Never prints a secret, full email or full phone.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n8-dryrun.mjs [tag]
import pg from "pg";
import { execFileSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { notifyRepairEmail as notifyNew } from "../../../src/repair/notify.mjs";

const EVID = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N8";
const TAG = process.argv[2] || "dryrun";

/* main's notify.mjs, copied next to this branch's src so its relative imports
   resolve to the same modules. Only the file under test differs. */
const mainNotify = execFileSync("git", ["show", "main:src/repair/notify.mjs"], { encoding: "utf8" });
const mainPath = new URL("../../../src/repair/notify.main-n8-dryrun.mjs", import.meta.url);
writeFileSync(mainPath, mainNotify);
let notifyOld;
try {
  ({ notifyRepairEmail: notifyOld } = await import(mainPath.href));
} finally {
  unlinkSync(mainPath);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const out = { at: new Date().toISOString(), tag: TAG, files: [] };
try {
  await c.query("BEGIN READ ONLY");
  const files = (await c.query(
    `SELECT DISTINCT ON (e.client_id) e.client_id, e.org_id, cl.first_name || ' ' || cl.last_name AS who,
            e.created_at AS docs_needed_at, e.idempotency_key
       FROM events e JOIN clients cl ON cl.id = e.client_id
      WHERE e.name = 'repair.docs.needed'
      ORDER BY e.client_id, e.created_at`)).rows;

  for (const f of files) {
    const writesRefused = [];
    const db = {
      async query(sql, params = []) {
        if (/^\s*UPDATE clients/i.test(sql) && /custom_fields/.test(sql)) {
          const r = await c.query(`SELECT COALESCE(custom_fields->>$2, '') AS v FROM clients WHERE id = $1`, [params[0], params[2]]);
          const empty = (r.rows[0]?.v || "") === "";
          writesRefused.push(`lock ${params[2]}: ${empty ? "empty — would claim" : "already held"}`);
          return { rows: empty ? [{ id: params[0] }] : [] };
        }
        if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) {
          writesRefused.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
          return { rows: [] };
        }
        return c.query(sql, params);
      }
    };
    const recorded = [];
    const send = async (_db, args) => { recorded.push({ channel: args.channel, templateKey: args.templateKey, eventId: args.eventId }); return { sent: true, dryRun: true }; };
    const event = {
      name: "repair.docs.needed",
      orgId: f.org_id,
      clientId: f.client_id,
      payload: { source: "repair.enrolled", idempotencyKey: f.idempotency_key }
    };
    const oldRes = await notifyOld(db, { ...event, send: async () => { recorded.push({ old: true }); return { sent: true }; } });
    const newRes = await notifyNew(db, { ...event, send });
    const row = {
      who: f.who,
      client: f.client_id.slice(0, 8),
      docs_needed_at: f.docs_needed_at,
      main: { sent: oldRes.sent, reason: oldRes.reason || null },
      branch: { sent: newRes.sent, reason: newRes.reason || null, templateKey: newRes.templateKey || null },
      would_queue: recorded.filter((r) => !r.old),
      lock_and_writes: writesRefused
    };
    out.files.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
writeFileSync(`${EVID}/${TAG}.json`, JSON.stringify(out, null, 1));
