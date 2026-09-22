// GET /api/public/slo-status against a real Postgres.
//
// What only a database can prove: the ref + client_id check is the real
// findSloOrder query (one buyer's ref cannot open another buyer's file), the
// order window is real (a result from BEFORE this order is never this order's
// answer), the tier falls back to crs_results when clients.outcome_tier is
// empty, and pa comes off the real decision.rendered event row.
//
// Lives under src/http/ so npm test collects it (CLAUDE.md §12). Skipped
// without DATABASE_URL, like every other *.pg.test.mjs. Run it on a LOCAL
// scratch database only — it inserts and then removes its own rows.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import handler from "../../api/public/slo-status.mjs";
import { decisionKeyFor } from "../slo/status.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const EMAIL_LIKE = "slo.status.pgtest.%@example.com";

const REF_REPAIR = "slo_pgtest0000000000000000a1";
const REF_FUNDING = "slo_pgtest0000000000000000b2";
const REF_WAITING = "slo_pgtest0000000000000000c3";

const res = () => {
  const r = { code: null, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; return r; };
  return r;
};

describe("/api/public/slo-status — the /roadmap widget's poll",
  { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let org;
  let repairClient;
  let fundingClient;
  let waitingClient;

  const ask = async (ref, clientId) => {
    const r = res();
    await handler({ method: "GET", headers: {}, query: { ref, client_id: clientId } }, r);
    return r;
  };

  async function purge() {
    const ids = (await db.query(`SELECT id FROM clients WHERE email LIKE $1`, [EMAIL_LIKE]))
      .rows.map((x) => x.id);
    if (!ids.length) return;
    await db.query(`DELETE FROM events WHERE client_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM crs_results WHERE client_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM payment_links WHERE client_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM clients WHERE id = ANY($1)`, [ids]);
  }

  async function buyer(tag, ref, outcomeTier = null) {
    const id = (await db.query(
      `INSERT INTO clients (org_id, first_name, last_name, email, custom_fields, outcome_tier)
       VALUES ($1, 'Slo', $2, $3, jsonb_build_object('slo_ref', $4::text, 'slo_source', 'slo'), $5)
       RETURNING id`,
      [org, tag, `slo.status.pgtest.${tag.toLowerCase()}@example.com`, ref, outcomeTier])).rows[0].id;
    // The order, one hour ago, stamped demo: nothing charged.
    await db.query(
      `INSERT INTO payment_links (org_id, client_id, purpose, amount_cents, link_ref, checkout_url,
                                  status, is_demo, created_at)
       VALUES ($1, $2, 'diagnostic', 29700, $3, 'demo:no-charge', 'created', true, now() - interval '1 hour')`,
      [org, id, ref]);
    return id;
  }

  async function result(clientId, tier, { ago = "0 minutes", estimate = null } = {}) {
    const id = (await db.query(
      `INSERT INTO crs_results (org_id, client_id, result, outcome_tier, created_at)
       VALUES ($1, $2, '{"simulated":true,"bureausPulled":["EX","TU"],"bureauErrors":{"EQ":"x"},"bureauStatus":{"EQ":"frozen"}}'::jsonb,
               $3, now() - $4::interval)
       RETURNING id`,
      [org, clientId, tier, ago])).rows[0].id;
    await db.query(
      `INSERT INTO events (org_id, name, version, idempotency_key, client_id, payload)
       VALUES ($1, 'decision.rendered', 1, $2, $3, jsonb_build_object('outcomeTier', $4::text, 'fundingEstimate', $5::numeric))`,
      [org, decisionKeyFor(id), clientId, tier, estimate]);
    return id;
  }

  before(async () => {
    if (!HAVE_DB) return;
    org = await resolveDefaultOrg(db);
    await purge();
    repairClient = await buyer("Repair", REF_REPAIR);
    fundingClient = await buyer("Funding", REF_FUNDING, "FULL_FUNDING");
    waitingClient = await buyer("Waiting", REF_WAITING);

    // Repair buyer: tier on crs_results only (clients.outcome_tier NULL).
    await result(repairClient, "REPAIR_ONLY");
    // Funding buyer: this order's result with an engine figure.
    await result(fundingClient, "FULL_FUNDING", { estimate: 84500 });
    // Waiting buyer: an OLD result from before this order must not count.
    await result(waitingClient, "FULL_FUNDING", { ago: "2 days", estimate: 10000 });
  });

  after(async () => {
    if (!HAVE_DB) return;
    await purge();
    await close();
  });

  test("repair tier off crs_results: done, repair offer, no pa", async () => {
    const r = await ask(REF_REPAIR, repairClient);
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.state, "done");
    assert.equal(r.body.bucket, "repair");
    assert.equal(r.body.pa, null);
    assert.equal(r.body.demo, true);
    assert.deepEqual(r.body.bureaus, { TU: "file_returned", EX: "file_returned", EQ: "frozen" });
    assert.deepEqual(r.body.repair_offer.plans.map((p) => p.key), ["REPAIR_TRIAL", "REPAIR_DFY"]);
  });

  test("funding tier: pa from the decision event, booking link carries it", async () => {
    const r = await ask(REF_FUNDING, fundingClient);
    assert.equal(r.code, 200);
    assert.equal(r.body.bucket, "funding");
    assert.equal(r.body.pa, 84500);
    assert.equal(r.body.book_url, "https://apply.fundhub.ai/roadmap-book?pa=84500");
  });

  test("a result from before this order is not this order's answer", async () => {
    const r = await ask(REF_WAITING, waitingClient);
    assert.equal(r.code, 200);
    assert.equal(r.body.state, "running");
    assert.equal(r.body.started, false);
    assert.equal(r.body.pa, null);
  });

  test("wrong client: one buyer's ref never opens another buyer's file", async () => {
    const swapped = await ask(REF_REPAIR, fundingClient);
    assert.equal(swapped.code, 404);
    assert.deepEqual(swapped.body, { ok: false, error: "not_found" });
    const madeUp = await ask("slo_pgtest_not_a_real_ref", repairClient);
    assert.equal(madeUp.code, 404);
  });

  test("the body never carries the tier name or the email", async () => {
    const r = await ask(REF_REPAIR, repairClient);
    const text = JSON.stringify(r.body);
    assert.equal(/REPAIR_ONLY|FULL_FUNDING|outcome/i.test(text), false);
    assert.equal(text.includes("@example.com"), false);
  });
});
