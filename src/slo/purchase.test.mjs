import { test } from "node:test";
import assert from "node:assert/strict";
import { _resetOrgCache } from "../events/bus.mjs";
import { extractSloPaidPurchase, handleSloPaidWebhook, recordSloPurchase, completeSloNurtureTasks, SLO_NURTURE_TITLE, SLO_POST_PURCHASE_ENABLED, isSloPostPurchaseEnabled } from "./purchase.mjs";

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENV_ON = { [SLO_POST_PURCHASE_ENABLED]: "true" };

function paidBody(over = {}) {
  return {
    event_id: "evt-slo-1",
    event_type: "order.completed",
    funnel_id: "funnel-slo-1",
    data: {
      id: 9001,
      amount_cents: 19700,
      contact: {
        email: "guess@example.com",
        custom_attributes: { fundhub_client_id: CLIENT }
      },
      line_items: [{ product_id: "cf-prod-slo-1" }]
    },
    ...over
  };
}

test("isSloPostPurchaseEnabled is off when unset, empty, or not true/1/yes", () => {
  assert.equal(isSloPostPurchaseEnabled({}), false);
  assert.equal(isSloPostPurchaseEnabled({ [SLO_POST_PURCHASE_ENABLED]: "" }), false);
  assert.equal(isSloPostPurchaseEnabled({ [SLO_POST_PURCHASE_ENABLED]: "false" }), false);
  assert.equal(isSloPostPurchaseEnabled({ [SLO_POST_PURCHASE_ENABLED]: "0" }), false);
  assert.equal(isSloPostPurchaseEnabled({ [SLO_POST_PURCHASE_ENABLED]: "no" }), false);
  assert.equal(isSloPostPurchaseEnabled({ [SLO_POST_PURCHASE_ENABLED]: true }), false);
});

test("isSloPostPurchaseEnabled is on for true, 1, and yes", () => {
  assert.equal(isSloPostPurchaseEnabled({ [SLO_POST_PURCHASE_ENABLED]: "true" }), true);
  assert.equal(isSloPostPurchaseEnabled({ [SLO_POST_PURCHASE_ENABLED]: "1" }), true);
  assert.equal(isSloPostPurchaseEnabled({ [SLO_POST_PURCHASE_ENABLED]: "yes" }), true);
  assert.equal(isSloPostPurchaseEnabled({ [SLO_POST_PURCHASE_ENABLED]: " TRUE " }), true);
});

test("extractSloPaidPurchase reads funnel + product + named client + cents", () => {
  const got = extractSloPaidPurchase(paidBody());
  assert.equal(got.ok, true);
  assert.equal(got.clientId, CLIENT);
  assert.equal(got.funnelId, "funnel-slo-1");
  assert.equal(got.items.length, 1);
  assert.equal(got.items[0].cfProductId, "cf-prod-slo-1");
  assert.equal(got.items[0].amountDollars, 197);
});

test("extractSloPaidPurchase does not guess the client from email", () => {
  const got = extractSloPaidPurchase(paidBody({
    data: {
      id: 9001,
      amount_cents: 19700,
      contact: { email: "guess@example.com" },
      line_items: [{ product_id: "cf-prod-slo-1" }]
    }
  }));
  assert.equal(got.ok, false);
  assert.equal(got.reason, "no_client_id");
});

test("extractSloPaidPurchase does not pick an offer from price", () => {
  const got = extractSloPaidPurchase({
    event_type: "order.completed",
    funnel_id: "funnel-slo-1",
    data: {
      id: 9001,
      amount_cents: 19700,
      contact: { custom_attributes: { fundhub_client_id: CLIENT } }
    }
  });
  assert.equal(got.ok, false);
  assert.equal(got.reason, "no_cf_product_id");
});

test("extractSloPaidPurchase refuses a classic integer dollar with no cents field", () => {
  const got = extractSloPaidPurchase({
    type: "new_purchase",
    funnel_id: "funnel-slo-1",
    data: {
      id: "ord-1",
      amount: 197,
      contact: { custom_attributes: { fundhub_client_id: CLIENT } },
      product_id: "cf-prod-slo-1"
    }
  });
  assert.equal(got.ok, false);
  assert.equal(got.reason, "no_paid_amount");
});

function paidWebhookDb({ existingSale = null, bookings = [], closerTasks = [] } = {}) {
  const store = {
    sales: existingSale ? [existingSale] : [],
    txs: [],
    fields: null,
    tasks: [],
    bookings,
    closerTasks
  };
  const db = {
    store,
    query(sql, params) {
      if (/FROM orgs/.test(sql)) return { rows: [{ id: ORG }] };
      if (/FROM slo_connections/.test(sql)) {
        return {
          rows: [{
            id: "conn-1",
            product_id: PRODUCT,
            product_name: "Funding Bundle",
            cf_funnel_id: "funnel-slo-1",
            cf_product_id: "cf-prod-slo-1",
            active: true
          }]
        };
      }
      if (/FROM clients/.test(sql)) {
        if (/SELECT email/.test(sql)) {
          return { rows: [{ email: "buyer@example.com", first_name: "Pat", last_name: "Lee" }] };
        }
        return { rows: [{ id: CLIENT }] };
      }
      if (/FROM accounts/.test(sql) && /kind = 'client'/.test(sql)) {
        return { rows: store.accounts || [] };
      }
      if (/INSERT INTO accounts/.test(sql)) {
        const row = { id: "acct-slo-1", org_id: params[0], email: params[1], name: params[2], client_id: params[3] };
        store.accounts = store.accounts || [];
        store.accounts.push(row);
        return { rows: [row] };
      }
      if (/custom_fields = custom_fields \|\|/.test(sql)) {
        store.fields = JSON.parse(params[1]);
        return { rows: [] };
      }
      if (/SELECT 1 FROM bookings/.test(sql)) {
        const statuses = params[2] || [];
        const hit = store.bookings.find((b) =>
          b.org_id === params[0]
          && b.client_id === params[1]
          && statuses.includes(b.status)
        );
        return { rows: hit ? [{ "?column?": 1 }] : [] };
      }
      if (/SELECT 1 FROM tasks/.test(sql) && /assignee_role/.test(sql)) {
        const hit = store.closerTasks.find((t) =>
          t.org_id === params[0]
          && t.client_id === params[1]
          && t.assignee_role === params[2]
          && !t.done
          && String(t.title || "").startsWith(String(params[3] || "").replace(/%$/, ""))
        );
        return { rows: hit ? [{ "?column?": 1 }] : [] };
      }
      if (/SELECT id FROM tasks/.test(sql)) {
        const hit = store.tasks.find((t) =>
          t.client_id === params[0]
          && t.source_workflow === params[1]
          && t.title === params[2]
        );
        return { rows: hit ? [{ id: hit.id }] : [] };
      }
      if (/INSERT INTO tasks/.test(sql)) {
        const row = {
          id: "task-csm-" + (store.tasks.length + 1),
          org_id: params[0],
          client_id: params[1],
          title: params[2],
          body: params[3],
          due_at: params[4],
          source_workflow: params[5],
          assignee_role: params[6],
          done: false
        };
        store.tasks.push(row);
        return { rows: [{ id: row.id }] };
      }
      if (/UPDATE tasks SET done = true/.test(sql)) {
        const hits = store.tasks.filter((t) =>
          t.client_id === params[0]
          && (params[1] == null || t.org_id === params[1])
          && t.assignee_role === params[2]
          && t.source_workflow === params[3]
          && t.title === params[4]
          && !t.done
        );
        for (const t of hits) t.done = true;
        return { rows: hits.map((t) => ({ id: t.id })) };
      }
      if (/FROM sales WHERE org_id/.test(sql) && /external_ref/.test(sql) && /SELECT \*/.test(sql)) {
        return { rows: store.sales.filter((s) => s.external_ref === params[1]) };
      }
      if (/INSERT INTO transactions/.test(sql)) {
        const row = { id: "tx-1", org_id: params[0], client_id: params[1], amount_paid: params[3], provider_ref: params[4] };
        store.txs.push(row);
        return { rows: [row] };
      }
      if (/INSERT INTO sales/.test(sql)) {
        const row = {
          id: "sale-1",
          org_id: params[0],
          client_id: params[1],
          product_id: params[2],
          agreed_price: params[3],
          external_ref: params[4]
        };
        store.sales.push(row);
        return { rows: [row] };
      }
      if (/INSERT INTO sale_payments/.test(sql)) return { rows: [{ id: "pay-1" }] };
      return { rows: [] };
    }
  };
  return db;
}

test("handleSloPaidWebhook opens a portal login even when post-purchase chase is off", async () => {
  _resetOrgCache();
  const db = paidWebhookDb();
  const res = await handleSloPaidWebhook(db, paidBody(), { env: {} });
  assert.equal(res.reason, "recorded");
  assert.equal(db.store.tasks.length, 0, "CSM chase stays behind the flag");
  assert.equal((db.store.accounts || []).length, 1);
  assert.equal(db.store.accounts[0].email, "buyer@example.com");
  assert.equal(db.store.accounts[0].client_id, CLIENT);
});

test("handleSloPaidWebhook writes one sale from the map and named client", async () => {
  _resetOrgCache();
  const db = paidWebhookDb();
  const res = await handleSloPaidWebhook(db, paidBody(), { env: ENV_ON });
  assert.equal(res.reason, "recorded");
  assert.equal(res.written.length, 1);
  assert.equal(db.store.sales.length, 1);
  assert.equal(db.store.sales[0].client_id, CLIENT);
  assert.equal(db.store.sales[0].product_id, PRODUCT);
  assert.equal(Number(db.store.sales[0].agreed_price), 197);
});

test("handleSloPaidWebhook stamps the same slo_ref / slo_source as the till", async () => {
  _resetOrgCache();
  const db = paidWebhookDb();
  const res = await handleSloPaidWebhook(db, paidBody(), { env: ENV_ON });
  assert.equal(res.reason, "recorded");
  assert.equal(db.store.fields.slo_ref, "clickfunnels:order:evt-slo-1:cf-prod-slo-1");
  assert.equal(db.store.fields.slo_source, "slo");
  assert.equal(Object.keys(db.store.fields).sort().join(","), "slo_ref,slo_source");
});

test("handleSloPaidWebhook opens CSM cultivate-and-close, not a halfway or closer task", async () => {
  _resetOrgCache();
  const db = paidWebhookDb();
  await handleSloPaidWebhook(db, paidBody(), { env: ENV_ON });
  assert.equal(db.store.tasks.length, 1);
  assert.equal(db.store.tasks[0].assignee_role, "csm");
  assert.equal(db.store.tasks[0].title, SLO_NURTURE_TITLE);
  assert.equal(db.store.tasks[0].source_workflow, "customer-insights-mid");
  const dueMs = new Date(db.store.tasks[0].due_at).getTime();
  assert.ok(Math.abs(dueMs - Date.now()) < 60_000, "due immediately, not a 90-day halfway");
  assert.match(db.store.tasks[0].body, /Walk the dashboards/);
  assert.match(db.store.tasks[0].body, /close or upsell/i);
  assert.match(db.store.tasks[0].body, /not a Google Meet/);
  assert.doesNotMatch(db.store.tasks[0].body, /Book a Google Meet/);
  assert.doesNotMatch(db.store.tasks[0].body, /book a closer/i);
  assert.doesNotMatch(db.store.tasks[0].title, /book a closer/i);
  assert.notEqual(db.store.tasks[0].assignee_role, "closer");
});

test("handleSloPaidWebhook skips the CSM task if they already inbound-booked", async () => {
  _resetOrgCache();
  const db = paidWebhookDb({
    bookings: [{ org_id: ORG, client_id: CLIENT, status: "booked" }]
  });
  await handleSloPaidWebhook(db, paidBody(), { env: ENV_ON });
  assert.equal(db.store.fields.slo_ref, "clickfunnels:order:evt-slo-1:cf-prod-slo-1");
  assert.equal(db.store.tasks.length, 0);
});

test("handleSloPaidWebhook skips the CSM task if an open closer task already exists", async () => {
  _resetOrgCache();
  const db = paidWebhookDb({
    closerTasks: [{
      org_id: ORG,
      client_id: CLIENT,
      assignee_role: "closer",
      done: false,
      title: "Strategy session booked"
    }]
  });
  await handleSloPaidWebhook(db, paidBody(), { env: ENV_ON });
  assert.equal(db.store.tasks.length, 0);
});

test("completeSloNurtureTasks closes only the open SLO nurture, not a halfway or closer row", async () => {
  const store = {
    tasks: [
      {
        id: "nurture-1",
        org_id: ORG,
        client_id: CLIENT,
        assignee_role: "csm",
        source_workflow: "customer-insights-mid",
        title: SLO_NURTURE_TITLE,
        done: false
      },
      {
        id: "mid-1",
        org_id: ORG,
        client_id: CLIENT,
        assignee_role: "csm",
        source_workflow: "customer-insights-mid",
        title: "Accountability call — halfway check-in",
        done: false
      },
      {
        id: "closer-1",
        org_id: ORG,
        client_id: CLIENT,
        assignee_role: "closer",
        source_workflow: "clickfunnels",
        title: "Strategy session booked",
        done: false
      }
    ]
  };
  const db = {
    query(sql, params) {
      if (!/UPDATE tasks SET done = true/.test(sql)) return { rows: [] };
      const hits = store.tasks.filter((t) =>
        t.client_id === params[0]
        && (params[1] == null || t.org_id === params[1])
        && t.assignee_role === params[2]
        && t.source_workflow === params[3]
        && t.title === params[4]
        && !t.done
      );
      for (const t of hits) t.done = true;
      return { rows: hits.map((t) => ({ id: t.id })) };
    }
  };
  const got = await completeSloNurtureTasks(db, { orgId: ORG, clientId: CLIENT, env: ENV_ON });
  assert.equal(got.closed, 1);
  assert.equal(store.tasks[0].done, true);
  assert.equal(store.tasks[1].done, false);
  assert.equal(store.tasks[2].done, false);
});

test("completeSloNurtureTasks off does not close the SLO nurture", async () => {
  const store = {
    tasks: [{
      id: "nurture-1",
      org_id: ORG,
      client_id: CLIENT,
      assignee_role: "csm",
      source_workflow: "customer-insights-mid",
      title: SLO_NURTURE_TITLE,
      done: false
    }]
  };
  const db = {
    query() {
      throw new Error("completeSloNurtureTasks must not write when the flag is off");
    }
  };
  const got = await completeSloNurtureTasks(db, { orgId: ORG, clientId: CLIENT, env: {} });
  assert.equal(got.closed, 0);
  assert.equal(store.tasks[0].done, false);
});

test("handleSloPaidWebhook off records the sale but does not stamp or open a CSM task", async () => {
  _resetOrgCache();
  const db = paidWebhookDb();
  const res = await handleSloPaidWebhook(db, paidBody(), { env: {} });
  assert.equal(res.reason, "recorded");
  assert.equal(res.written.length, 1);
  assert.equal(db.store.sales.length, 1);
  assert.equal(db.store.fields, null);
  assert.equal(db.store.tasks.length, 0);
});

test("handleSloPaidWebhook replay stamps again and does not make a second CSM task", async () => {
  _resetOrgCache();
  const existing = {
    id: "sale-1",
    client_id: CLIENT,
    product_id: PRODUCT,
    external_ref: "clickfunnels:order:evt-slo-1:cf-prod-slo-1"
  };
  const db = paidWebhookDb({ existingSale: existing });
  const first = await handleSloPaidWebhook(db, paidBody(), { env: ENV_ON });
  const second = await handleSloPaidWebhook(db, paidBody(), { env: ENV_ON });
  assert.equal(first.reason, "recorded");
  assert.equal(second.reason, "recorded");
  assert.equal(db.store.sales.length, 1);
  assert.equal(db.store.fields.slo_ref, existing.external_ref);
  assert.equal(db.store.tasks.length, 1);
});

test("handleSloPaidWebhook does not write when the map is off or missing", async () => {
  const db = {
    query(sql) {
      if (/FROM orgs/.test(sql)) return { rows: [{ id: ORG }] };
      if (/FROM slo_connections/.test(sql)) return { rows: [] };
      return { rows: [] };
    }
  };
  const res = await handleSloPaidWebhook(db, paidBody());
  assert.equal(res.reason, "unmapped");
  assert.equal(res.written.length, 0);
});

test("recordSloPurchase replay of the same order is one sale", async () => {
  const existing = {
    id: "sale-1",
    client_id: CLIENT,
    product_id: PRODUCT,
    external_ref: "clickfunnels:order:9001:cf-prod-slo-1"
  };
  const db = {
    query(sql) {
      if (/FROM clients/.test(sql)) return { rows: [{ id: CLIENT }] };
      if (/FROM sales/.test(sql)) return { rows: [existing] };
      throw new Error("unexpected write on replay: " + sql);
    }
  };
  const rec = await recordSloPurchase(db, {
    orgId: ORG,
    clientId: CLIENT,
    productId: PRODUCT,
    productName: "Funding Bundle",
    amountDollars: 197,
    providerRef: existing.external_ref
  });
  assert.equal(rec.ok, true);
  assert.equal(rec.created, false);
  assert.equal(rec.sale.id, "sale-1");
});
