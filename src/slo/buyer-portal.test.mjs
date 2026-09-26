import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureSloPortalForPaidClient,
  isSloCheckoutLinkRef,
  sloPortalLoginEventId
} from "./buyer.mjs";
import { MAGIC_LINK_TEMPLATE_KEY } from "../auth/magic-link.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("isSloCheckoutLinkRef is only the /roadmap till refs", () => {
  assert.equal(isSloCheckoutLinkRef("slo_abcdef0123456789abcdef"), true);
  assert.equal(isSloCheckoutLinkRef("pl_softpull"), false);
  assert.equal(isSloCheckoutLinkRef(""), false);
  assert.equal(isSloCheckoutLinkRef(null), false);
});

function portalDb({ messages = [] } = {}) {
  const accounts = [];
  const store = { accounts, messages: [...messages] };
  const db = {
    store,
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
      if (/FROM messages/.test(sql) && /provider_ref/.test(sql)) {
        const hit = store.messages.find((m) => m.org_id === params[0] && m.provider_ref === params[1]);
        return { rows: hit ? [{ ok: 1 }] : [] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    }
  };
  return db;
}

test("ensureSloPortalForPaidClient mints an invited client account once", async () => {
  const db = portalDb();
  const noopLink = async () => ({ ok: true, sent: true });
  const first = await ensureSloPortalForPaidClient(db, { orgId: ORG, clientId: CLIENT }, {
    issuePortalLinkForClient: noopLink
  });
  const again = await ensureSloPortalForPaidClient(db, { orgId: ORG, clientId: CLIENT }, {
    issuePortalLinkForClient: noopLink
  });
  assert.equal(first, "acct-1");
  assert.equal(again, "acct-1");
  assert.equal(db.store.accounts.length, 1);
  assert.equal(db.store.accounts[0].email, "buyer@example.com");
  assert.equal(db.store.accounts[0].name, "Pat Lee");
});

test("ensureSloPortalForPaidClient queues EMAIL-PORTAL-MAGIC-LINK once, not twice", async () => {
  const db = portalDb();
  const calls = [];
  const issue = async (_db, args) => {
    calls.push(args);
    const eventId = args.eventId;
    assert.equal(eventId, sloPortalLoginEventId(CLIENT));
    const providerRef = `workflow:${MAGIC_LINK_TEMPLATE_KEY}:${eventId}`;
    db.store.messages.push({ org_id: args.orgId, provider_ref: providerRef });
    return { ok: true, sent: true, outcome: "issued" };
  };

  await ensureSloPortalForPaidClient(db, { orgId: ORG, clientId: CLIENT }, {
    issuePortalLinkForClient: issue
  });
  await ensureSloPortalForPaidClient(db, { orgId: ORG, clientId: CLIENT }, {
    issuePortalLinkForClient: issue
  });

  assert.equal(calls.length, 1, "second pay webhook must not issue a second login mail");
  assert.equal(calls[0].orgId, ORG);
  assert.equal(calls[0].clientId, CLIENT);
  assert.equal(calls[0].eventId, `slo-portal-login:${CLIENT}`);
  assert.equal(db.store.messages.length, 1);
  assert.equal(
    db.store.messages[0].provider_ref,
    `workflow:EMAIL-PORTAL-MAGIC-LINK:slo-portal-login:${CLIENT}`
  );
});

test("ensureSloPortalForPaidClient skips login mail when that pay mail already exists", async () => {
  const eventId = sloPortalLoginEventId(CLIENT);
  const db = portalDb({
    messages: [{
      org_id: ORG,
      provider_ref: `workflow:${MAGIC_LINK_TEMPLATE_KEY}:${eventId}`
    }]
  });
  let called = 0;
  await ensureSloPortalForPaidClient(db, { orgId: ORG, clientId: CLIENT }, {
    issuePortalLinkForClient: async () => {
      called += 1;
      return { ok: true, sent: true };
    }
  });
  assert.equal(called, 0);
  assert.equal(db.store.accounts.length, 1);
});
