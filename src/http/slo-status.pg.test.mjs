// GET /api/public/slo-status against a real Postgres.
//
// What only a database can prove: the ref + client_id check is the real
// findSloOrder query (one buyer's ref cannot open another buyer's file), only
// pulls THIS order started are read (a demo ledger key slo-demo:<ref>:<n>, or
// C-00's key for a diagnostic.paid event whose payload names this ref) — a
// pull on the same client that this order did not start is never its answer,
// before or after the order — the tier falls back to crs_results when
// clients.outcome_tier is empty, and pa comes off the real decision.rendered
// event row.
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
const REF_RETRY = "slo_pgtest0000000000000000d4";

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
  let retryClient;
  const accounts = new Map();

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
    await db.query(`DELETE FROM soft_pull_requests WHERE client_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM crs_results WHERE client_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM payment_links WHERE client_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM accounts WHERE client_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM clients WHERE id = ANY($1)`, [ids]);
  }

  async function buyer(tag, ref, outcomeTier = null) {
    const id = (await db.query(
      `INSERT INTO clients (org_id, first_name, last_name, email, outcome_tier)
       VALUES ($1, 'Slo', $2, $3, $4)
       RETURNING id`,
      [org, tag, `slo.status.pgtest.${tag.toLowerCase()}@example.com`, outcomeTier])).rows[0].id;
    accounts.set(id, (await db.query(
      `INSERT INTO accounts (org_id, kind, email, name, status, client_id)
       VALUES ($1, 'client', $2, 'Slo Pgtest', 'invited', $3)
       RETURNING id`,
      [org, `slo.status.pgtest.${tag.toLowerCase()}@example.com`, id])).rows[0].id);
    // The order, one hour ago, stamped demo: nothing charged. The ref lives on
    // the order row only; nothing is stamped on the client.
    await db.query(
      `INSERT INTO payment_links (org_id, client_id, purpose, amount_cents, link_ref, checkout_url,
                                  status, is_demo, created_at, business_count)
       VALUES ($1, $2, 'diagnostic', 29700, $3, 'demo:no-charge', 'created', true, now() - interval '1 hour', 1)`,
      [org, id, ref]);
    return id;
  }

  /* A soft pull request with the ledger key that says who started it. */
  async function request(clientId, key, { status = "fulfilled", crsResultId = null, ago = "0 minutes", reason = null } = {}) {
    await db.query(
      `INSERT INTO soft_pull_requests
         (org_id, client_id, requested_by_kind, requested_by_account_id, reason, status,
          crs_result_id, idempotency_key, state_reason, requested_at, resolved_at)
       VALUES ($1, $2, 'client', $3, 'slo status pg test', $4, $5, $6, $7,
               now() - $8::interval, CASE WHEN $4 IN ('queued', 'processing') THEN NULL ELSE now() END)`,
      [org, clientId, accounts.get(clientId), status, crsResultId, key, reason, ago]);
  }

  async function result(clientId, tier, { ago = "0 minutes", estimate = null, key } = {}) {
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
    await request(clientId, key, { crsResultId: id, ago });
    return id;
  }

  /* A diagnostic.paid event naming a ref, the way slo-pull and the Commas
     webhook write it; C-00's ledger key is diagnostic-paid:<event id>. */
  async function paidEvent(clientId, ref) {
    const id = (await db.query(
      `INSERT INTO events (org_id, name, version, idempotency_key, client_id, payload)
       VALUES ($1, 'diagnostic.paid', 1, $2, $3, jsonb_build_object('source', 'slo', 'ref', $4::text))
       RETURNING id`,
      [org, `slo-pull:${ref}:1:pgtest`, clientId, ref])).rows[0].id;
    return `diagnostic-paid:${id}`;
  }

  before(async () => {
    if (!HAVE_DB) return;
    org = await resolveDefaultOrg(db);
    await purge();
    repairClient = await buyer("Repair", REF_REPAIR);
    fundingClient = await buyer("Funding", REF_FUNDING, "FULL_FUNDING");
    waitingClient = await buyer("Waiting", REF_WAITING);
    retryClient = await buyer("Retry", REF_RETRY);

    // Repair buyer: a DEMO pull this order started; tier on crs_results only.
    await result(repairClient, "REPAIR_ONLY", { key: `diagnostic-paid:slo-demo:${REF_REPAIR}:1` });
    // Funding buyer: a LIVE pull, started by a diagnostic.paid event naming this ref.
    await result(fundingClient, "FULL_FUNDING", { estimate: 84500, key: await paidEvent(fundingClient, REF_FUNDING) });
    // Waiting buyer: pulls this order did NOT start — one from before the
    // order and one AFTER it (staff, another order). Neither may show.
    await result(waitingClient, "FULL_FUNDING", { ago: "2 days", estimate: 10000, key: "diagnostic-paid:someone-else-1" });
    await result(waitingClient, "FULL_FUNDING", { estimate: 20000, key: "diagnostic-paid:someone-else-2" });
    // Retry buyer: attempt 1 failed, attempt 2 still running.
    await request(retryClient, `diagnostic-paid:slo-demo:${REF_RETRY}:1`, { status: "failed", ago: "5 minutes", reason: "no bureau returned a report — TU: x" });
    await request(retryClient, `diagnostic-paid:slo-demo:${REF_RETRY}:2`, { status: "queued" });
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

  test("pulls this order did not start — before OR after it — are never this order's answer", async () => {
    const r = await ask(REF_WAITING, waitingClient);
    assert.equal(r.code, 200);
    assert.equal(r.body.state, "running");
    assert.equal(r.body.started, false);
    assert.equal(r.body.pa, null);
    assert.equal(r.body.bucket, null);
  });

  test("after a retry the newest attempt is the answer: running, not the old failure", async () => {
    const r = await ask(REF_RETRY, retryClient);
    assert.equal(r.code, 200);
    assert.equal(r.body.state, "running");
    assert.equal(r.body.started, true);
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
