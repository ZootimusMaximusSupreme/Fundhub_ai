// Hole 7 — pre-ship proof. Runs THIS BRANCH's real handlers
// (api/dashboard/client.mjs and api/dashboard/clients.mjs?fulfillment=1) on the
// LIVE #9 Nine-Repair data, inside one BEGIN READ ONLY transaction.
//  - The session lookup (a WITH ... UPDATE sessions) is never sent: it is
//    answered with a stub owner row for #9's own org, the same way
//    src/http/dashboard-next-action.test.mjs does it.
//  - Any statement that is not a plain read is refused before it is sent, and
//    the transaction is READ ONLY anyway. Nothing is written.
// Never prints a secret.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h7-local-handler.mjs
import pg from "pg";
import { db } from "../../../src/db.mjs";
import clientHandler from "../../../api/dashboard/client.mjs";
import clientsHandler from "../../../api/dashboard/clients.mjs";

const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 15000 });
await client.connect();
await client.query("BEGIN READ ONLY");

const org = (await client.query("SELECT org_id FROM clients WHERE id = $1", [NINE])).rows[0].org_id;
const refused = [];
db.query = async (sql, params) => {
  const text = String(sql);
  if (/FROM live JOIN staff/.test(text)) {
    return { rows: [{
      session_id: "local-proof", expires_at: new Date(Date.now() + 3600_000),
      staff_id: "local-proof", org_id: org, role: "owner", email: "local-proof@example.invalid",
      name: "Local proof", status: "active", active_flag: null
    }] };
  }
  if (/\b(UPDATE|INSERT|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP)\b/i.test(text.replace(/--.*$/gm, ""))
      || !/^\s*(SELECT|WITH)\b/i.test(text)) {
    refused.push(text.trim().split("\n")[0].slice(0, 80));
    return { rows: [] };
  }
  return client.query(text, params);
};

const mkRes = () => {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = () => r;
  return r;
};
const req = (query) => ({ method: "GET", headers: { authorization: "Bearer local-proof" }, query });

const one = mkRes();
await clientHandler(req({ id: NINE }), one);
const many = mkRes();
await clientsHandler(req({ limit: "200", fulfillment: "1" }), many);
const row = (many.body?.clients || []).find((c) => c.id === NINE);

console.log(JSON.stringify({
  controlPanel: {
    status: one.code,
    next_action: one.body?.next_action,
    degraded: one.body?.next_action_degraded,
    firstBlockers: (one.body?.active_blockers || []).slice(0, 3).map((b) => b.label),
  },
  fulfillmentList: {
    status: many.code,
    found: Boolean(row),
    next_action: row?.next_action,
    degraded: row?.next_action_degraded,
  },
  refusedStatements: refused,
}, null, 2));

await client.query("ROLLBACK");
await client.end();
await db.end?.();
