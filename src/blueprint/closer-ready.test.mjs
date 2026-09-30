import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateBlueprintCloserReady,
  areBlueprintPrepStepsClosed,
  CSM_PREP_SOURCE,
  CLOSER_READY_SOURCE
} from "./closer-ready.mjs";

const ORG = "00000000-0000-4000-8000-000000000001";
const CLIENT = "550e8400-e29b-41d4-a716-446655440000";

const FUNDABLE_CRS = {
  result: { scores: { ex: 720, eq: 705, tu: 710 } },
  created_at: "2026-01-02T00:00:00Z"
};
const FUNDABLE_TRADELINE = {
  id: "11111111-1111-4111-8111-111111111111",
  org_id: ORG,
  client_id: CLIENT,
  lender: "Chase",
  kind: "revolving",
  credit_limit_cents: 1_000_000,
  balance_cents: 250_000,
  apr: "0.1899",
  closed_at: null
};

function mockDb(state) {
  return {
    async query(sql, params) {
      if (/FROM transactions/i.test(sql) && /products/i.test(sql)) {
        return { rows: state.blueprintBuyer ? [{ x: 1 }] : [] };
      }
      if (/client_waypoints/i.test(sql) && /open_count/i.test(sql)) {
        return { rows: [{ total: state.waypointTotal ?? 0, open_count: state.waypointOpen ?? 0 }] };
      }
      if (/FROM crs_results/i.test(sql) && /ORDER BY created_at DESC/i.test(sql)) {
        return { rows: state.crs ? [state.crs] : [] };
      }
      if (/FROM tradelines/i.test(sql)) return { rows: state.tradelines || [] };
      if (/FROM card_liabilities/i.test(sql)) return { rows: [] };
      if (/FROM businesses/i.test(sql)) return { rows: [] };
      if (/FROM clients/i.test(sql) && /custom_fields/i.test(sql)) {
        return { rows: [{ custom_fields: state.customFields || {} }] };
      }
      if (/assigned_csm_staff_id/i.test(sql)) {
        return { rows: [{ assigned_csm_staff_id: state.csmStaffId || null }] };
      }
      if (/FROM tasks/i.test(sql) && /source_workflow/i.test(sql)) {
        const key = `${params[1]}:${params[2]}`;
        const row = state.tasks?.[key];
        return { rows: row ? [row] : [] };
      }
      if (/INSERT INTO tasks/i.test(sql)) {
        const source = params[5];
        const body = params[3];
        const key = `${source}:${body}`;
        state.tasks = state.tasks || {};
        if (!state.tasks[key]) {
          state.tasks[key] = { id: "task-" + Object.keys(state.tasks).length, done: false };
        }
        return { rows: [{ id: state.tasks[key].id }] };
      }
      return { rows: [] };
    }
  };
}

test("areBlueprintPrepStepsClosed requires at least one prep row and zero open", async () => {
  const db = mockDb({ waypointTotal: 2, waypointOpen: 0 });
  assert.equal(await areBlueprintPrepStepsClosed(db, { orgId: ORG, clientId: CLIENT }), true);
  const empty = mockDb({ waypointTotal: 0, waypointOpen: 0 });
  assert.equal(await areBlueprintPrepStepsClosed(empty, { orgId: ORG, clientId: CLIENT }), false);
});

test("evaluateBlueprintCloserReady opens CSM prep when fundable and prep closed", async () => {
  const state = {
    blueprintBuyer: true,
    waypointTotal: 3,
    waypointOpen: 0,
    crs: FUNDABLE_CRS,
    customFields: { crs_negative_items_count: 0 },
    tradelines: [FUNDABLE_TRADELINE],
    tasks: {}
  };
  const db = mockDb(state);
  const res = await evaluateBlueprintCloserReady(db, { orgId: ORG, clientId: CLIENT });
  assert.equal(res.branch, "csm_prep_open", JSON.stringify(res));
  assert.ok(state.tasks[`${CSM_PREP_SOURCE}:blueprint-csm-prep-call`]);
});

test("evaluateBlueprintCloserReady alerts closer after prep call is done", async () => {
  const state = {
    blueprintBuyer: true,
    waypointTotal: 1,
    waypointOpen: 0,
    crs: FUNDABLE_CRS,
    customFields: { crs_negative_items_count: 0 },
    tradelines: [FUNDABLE_TRADELINE],
    tasks: {
      [`${CSM_PREP_SOURCE}:blueprint-csm-prep-call`]: { id: "prep-1", done: true }
    }
  };
  const db = mockDb(state);
  const res = await evaluateBlueprintCloserReady(db, { orgId: ORG, clientId: CLIENT });
  assert.equal(res.branch, "closer_alert");
  assert.ok(state.tasks[`${CLOSER_READY_SOURCE}:blueprint-closer-funding-ready`]);
});

test("evaluateBlueprintCloserReady skips non-blueprint buyers", async () => {
  const db = mockDb({ blueprintBuyer: false });
  const res = await evaluateBlueprintCloserReady(db, { orgId: ORG, clientId: CLIENT });
  assert.equal(res.branch, "skip");
});
