// An authorized rep's file list and file switch are bound to the session's
// company. No database: a recording stand-in proves the org reaches the SQL.
// The real-Postgres walk of the same functions is authorized-rep.pg.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { listRepFiles, setActiveFile } from "./authorized-rep.mjs";

const ORG = "00000000-0000-4000-8000-0000000000aa";
const ACCOUNT = "00000000-0000-4000-8000-0000000000bb";
const CLIENT = "00000000-0000-4000-8000-0000000000cc";

function recorder(rows = []) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows }; } };
}

test("the file list compares the link and the client to the session's company", async () => {
  const db = recorder();
  await listRepFiles(db, ACCOUNT, { orgId: ORG });
  assert.match(db.calls[0].sql, /r\.org_id = \$2::uuid AND c\.org_id = \$2::uuid/);
  assert.deepEqual(db.calls[0].params, [ACCOUNT, ORG]);
});

test("switching files compares the link to the session's company, and a miss changes nothing", async () => {
  const db = recorder([]);
  const out = await setActiveFile(db, { accountId: ACCOUNT, clientId: CLIENT, orgId: ORG });
  assert.match(db.calls[0].sql, /org_id = \$3::uuid/);
  assert.deepEqual(db.calls[0].params, [ACCOUNT, CLIENT, ORG]);
  assert.equal(out.ok, false);
  assert.equal(db.calls.length, 1, "no session is updated when the link is not in this company");
});
