import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureSloPortalForPaidClient,
  isSloCheckoutLinkRef
} from "./buyer.mjs";

test("isSloCheckoutLinkRef is only the /roadmap till refs", () => {
  assert.equal(isSloCheckoutLinkRef("slo_abcdef0123456789abcdef"), true);
  assert.equal(isSloCheckoutLinkRef("pl_softpull"), false);
  assert.equal(isSloCheckoutLinkRef(""), false);
  assert.equal(isSloCheckoutLinkRef(null), false);
});

test("ensureSloPortalForPaidClient mints an invited client account once", async () => {
  const ORG = "11111111-1111-4111-8111-111111111111";
  const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const accounts = [];
  const db = {
    async query(sql, params) {
      if (/SELECT email, first_name, last_name/.test(sql)) {
        return { rows: [{ email: "buyer@example.com", first_name: "Pat", last_name: "Lee" }] };
      }
      if (/FROM accounts/.test(sql)) return { rows: accounts };
      if (/INSERT INTO accounts/.test(sql)) {
        const row = { id: "acct-1", org_id: params[0], email: params[1], name: params[2], client_id: params[3] };
        accounts.push(row);
        return { rows: [row] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    }
  };
  const first = await ensureSloPortalForPaidClient(db, { orgId: ORG, clientId: CLIENT });
  const again = await ensureSloPortalForPaidClient(db, { orgId: ORG, clientId: CLIENT });
  assert.equal(first, "acct-1");
  assert.equal(again, "acct-1");
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].email, "buyer@example.com");
  assert.equal(accounts[0].name, "Pat Lee");
});
