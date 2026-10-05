// The EEO bias-audit read returns ONE company's cells, the caller's.
// No database: a recording stand-in proves the session org reaches the SQL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchEeoAggregate } from "./eeo-selfid.mjs";
import { fetchRows } from "../../api/read/eeo-aggregate.mjs";

const ORG = "00000000-0000-4000-8000-0000000000aa";

function recorder() {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
}

test("the aggregate binds the company, and the role filter stacks on it", async () => {
  const db = recorder();
  await fetchEeoAggregate(db, { orgId: ORG, roleKey: "closer" });
  assert.match(db.calls[0].sql, /WHERE org_id = \$1::uuid AND role_key = \$2/);
  assert.deepEqual(db.calls[0].params, [ORG, "closer"]);
});

test("no company means no read at all, not every company's rows", async () => {
  const db = recorder();
  await assert.rejects(() => fetchEeoAggregate(db, {}), /orgId is required/);
  assert.equal(db.calls.length, 0);
});

test("the endpoint takes the company from the session, never the query string", async () => {
  const db = recorder();
  await fetchRows(db, {
    limit: 50, offset: 0,
    query: { role: "closer", org_id: "00000000-0000-4000-8000-0000000000ff" },
    staff: { org_id: ORG }
  });
  assert.equal(db.calls[0].params[0], ORG);
});
