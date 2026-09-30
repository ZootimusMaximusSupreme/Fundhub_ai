import test from "node:test";
import assert from "node:assert/strict";
import { createBlueprintCoachStopTask } from "./coach-exception.mjs";

test("createBlueprintCoachStopTask skips non-blueprint buyers", async () => {
  const db = {
    async query(sql) {
      if (/FROM transactions/i.test(sql)) return { rows: [] };
      return { rows: [] };
    }
  };
  const out = await createBlueprintCoachStopTask(db, {
    orgId: "00000000-0000-4000-8000-000000000001",
    clientId: "550e8400-e29b-41d4-a716-446655440000"
  });
  assert.equal(out.reason, "not_blueprint_buyer");
});
