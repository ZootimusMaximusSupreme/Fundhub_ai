import test from "node:test";
import assert from "node:assert/strict";
import { assignCsmForBlueprintPurchase, pickCsmStaffId } from "./assign-csm.mjs";
import { BLUEPRINT_PRODUCT_CODE } from "../waypoints/purchase.mjs";

const ORG = "00000000-0000-4000-8000-000000000001";
const CLIENT = "550e8400-e29b-41d4-a716-446655440000";
const CSM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const CSM_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

function mockDb(state) {
  return {
    async query(sql, params) {
      if (/FROM staff s/i.test(sql)) {
        return { rows: state.csmRows || [] };
      }
      if (/SELECT/i.test(sql) && /assigned_csm_staff_id/i.test(sql) && /FROM clients/i.test(sql)) {
        return { rows: [{ assigned_csm_staff_id: state.assigned || null }] };
      }
      if (/UPDATE clients/i.test(sql) && /assigned_csm_staff_id/i.test(sql)) {
        if (state.assigned) return { rows: [] };
        state.assigned = params[2];
        return { rows: [{ assigned_csm_staff_id: state.assigned }] };
      }
      return { rows: [] };
    }
  };
}

test("assignCsmForBlueprintPurchase skips non-blueprint products", async () => {
  const db = mockDb({});
  const out = await assignCsmForBlueprintPurchase(db, {
    orgId: ORG, clientId: CLIENT, productCode: "not-a-product"
  });
  assert.equal(out.reason, "not_blueprint_product");
});

test("assignCsmForBlueprintPurchase picks CSM with fewest clients", async () => {
  const db = mockDb({
    csmRows: [{ id: CSM_B }, { id: CSM_A }]
  });
  const id = await pickCsmStaffId(db, { orgId: ORG });
  assert.equal(id, CSM_B);
});

test("assignCsmForBlueprintPurchase writes once", async () => {
  const state = { csmRows: [{ id: CSM_A }] };
  const db = mockDb(state);
  const first = await assignCsmForBlueprintPurchase(db, {
    orgId: ORG, clientId: CLIENT, productCode: BLUEPRINT_PRODUCT_CODE
  });
  assert.equal(first.assigned, true);
  assert.equal(first.staffId, CSM_A);
  const second = await assignCsmForBlueprintPurchase(db, {
    orgId: ORG, clientId: CLIENT, productCode: BLUEPRINT_PRODUCT_CODE
  });
  assert.equal(second.reason, "already_assigned");
});
