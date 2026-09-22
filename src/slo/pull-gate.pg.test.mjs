// The /roadmap order gate against a real Postgres (2026-09-22 review, item 2).
//
// What only a database can prove: findSloOrder resolves by the order row
// (payment_links.link_ref + business_count, migration 388) and never by a
// field stamped on the client; sloClientPriorFile sees an identity on file
// and a paid purchase; and an identity THIS order wrote (recorded by
// markSloOrderIdentity) is its own — until anybody else writes it again.
//
// Skipped without DATABASE_URL, like every other *.pg.test.mjs. Run it on a
// LOCAL scratch database only — it inserts and then removes its own rows.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { findSloOrder } from "./pull.mjs";
import { markSloOrderIdentity, sloClientPriorFile } from "./buyer.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const EMAIL_LIKE = "slo.gate.pgtest.%@example.com";
const REF = "slo_gatepgtest00000000000001";
const OTHER_REF = "slo_gatepgtest00000000000002";

describe("/roadmap order gate — findSloOrder, sloClientPriorFile, markSloOrderIdentity",
  { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let org;
  let client;
  let orderId;

  async function purge() {
    const ids = (await db.query(`SELECT id FROM clients WHERE email LIKE $1`, [EMAIL_LIKE])).rows.map((x) => x.id);
    if (!ids.length) return;
    await db.query(`DELETE FROM transactions WHERE client_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM payment_links WHERE client_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM pii_identity WHERE client_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM clients WHERE id = ANY($1)`, [ids]);
  }

  before(async () => {
    if (!HAVE_DB) return;
    org = await resolveDefaultOrg(db);
    await purge();
    client = (await db.query(
      `INSERT INTO clients (org_id, first_name, last_name, email, custom_fields)
       VALUES ($1, 'Gate', 'Pgtest', 'slo.gate.pgtest.one@example.com',
               jsonb_build_object('slo_ref', $2::text))
       RETURNING id`, [org, OTHER_REF])).rows[0].id;
    orderId = (await db.query(
      `INSERT INTO payment_links (org_id, client_id, purpose, amount_cents, link_ref, checkout_url,
                                  status, is_demo, business_count)
       VALUES ($1, $2, 'diagnostic', 32700, $3, 'demo:no-charge', 'created', true, 2)
       RETURNING id`, [org, client, REF])).rows[0].id;
  });

  after(async () => {
    if (!HAVE_DB) return;
    await purge();
    await close();
  });

  test("findSloOrder: the order row answers, with its business count; a client stamp does not", async () => {
    const found = await findSloOrder(db, { clientId: client, ref: REF });
    assert.equal(found.id, client);
    assert.equal(found.order_id, orderId);
    assert.equal(found.order_ref, REF);
    assert.equal(found.order_business_count, 2);
    assert.equal(found.order_is_demo, true);
    assert.equal(await findSloOrder(db, { clientId: client, ref: OTHER_REF }), null,
      "a ref that is only stamped on the client is not an order");
  });

  test("no identity, no payment: nothing on file", async () => {
    assert.deepEqual(await sloClientPriorFile(db, { orgId: org, clientId: client, orderId }), { identity: false, paid: false });
  });

  test("an identity on file that this order did not write counts; the order's own write does not", async () => {
    await db.query(
      `INSERT INTO pii_identity (org_id, client_id, dob, addresses) VALUES ($1, $2, '1980-01-01', '[]'::jsonb)`,
      [org, client]);
    assert.equal((await sloClientPriorFile(db, { orgId: org, clientId: client, orderId })).identity, true);

    await markSloOrderIdentity(db, { orderId, clientId: client });
    assert.equal((await sloClientPriorFile(db, { orgId: org, clientId: client, orderId })).identity, false,
      "the identity this order wrote is its own");
    assert.equal((await sloClientPriorFile(db, { orgId: org, clientId: client, orderId: null })).identity, true,
      "another order does not own it");

    await db.query(`UPDATE pii_identity SET updated_at = now() + interval '1 second' WHERE client_id = $1`, [client]);
    assert.equal((await sloClientPriorFile(db, { orgId: org, clientId: client, orderId })).identity, true,
      "somebody wrote it after this order did: it is not the order's own any more");
  });

  test("money already received counts as a paid purchase; a demo order never does", async () => {
    assert.equal((await sloClientPriorFile(db, { orgId: org, clientId: client, orderId })).paid, false);
    await db.query(
      `INSERT INTO transactions (org_id, client_id, product_name, amount_paid, status, provider)
       VALUES ($1, $2, 'Consulting Services Assessment', 297, 'paid', 'commas')`, [org, client]);
    assert.equal((await sloClientPriorFile(db, { orgId: org, clientId: client, orderId })).paid, true);
  });
});
