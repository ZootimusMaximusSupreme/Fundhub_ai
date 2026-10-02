import { test } from "node:test";
import assert from "node:assert/strict";
import { onAnalysisCompletedSloPack, register } from "./slo-pack-deliverables.mjs";
import { clearHandlers, getHandlers } from "../events/registry.mjs";

test("registers on analysis.completed", () => {
  clearHandlers();
  register();
  assert.ok(getHandlers("analysis.completed").some((f) => f.name === "onAnalysisCompletedSloPack"));
  clearHandlers();
});

test("skips non-SLO buyers", async () => {
  const db = {
    async query(sql) {
      if (/slo_ref/.test(sql)) return { rows: [{ slo_ref: null }] };
      return { rows: [] };
    }
  };
  const out = await onAnalysisCompletedSloPack({
    id: "e1",
    orgId: "o1",
    clientId: "c1",
    payload: { source: "crs" }
  }, db);
  assert.equal(out.reason, "not_slo");
});
