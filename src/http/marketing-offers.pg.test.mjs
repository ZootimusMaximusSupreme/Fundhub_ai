// Endpoint tests for GET / POST /api/marketing/offers, against real Postgres.
// Lives under src/http/ because npm test's glob is src/** and scripts/** only.
// Skips with DATABASE_URL unset; a skipped .pg.test.mjs is not green (CLAUDE.md §12).
// Writes only in a throwaway org. The seed test reads the default org, read-only.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import handler from "../../api/marketing/offers.mjs";
import { ROUTES } from "../../netlify/functions/api.mjs";
import { mkReq, mkRes, makeMarketingOrg, wipeMarketingOrg } from "../marketing/pg-fixture.mjs";

const HAS_DB = !!process.env.DATABASE_URL;
const SLUG = "mm-offers-pg-test";

describe("/api/marketing/offers", { skip: !HAS_DB ? "no DATABASE_URL" : false }, () => {
  let org;
  const repoWrites = [];
  let wakes = 0;
  const deps = {
    db,
    wakeWorker: async () => { wakes++; },
    // Most tests swap the real outbox call for a recorder. One test below uses the
    // real one against repo_outbox.
    enqueueRepoWrite: async (_tx, args) => { repoWrites.push(args); return { queued: true, path: args.path }; }
  };

  async function call(token, opts, d = deps) {
    const res = mkRes();
    await handler(mkReq(token, opts), res, d);
    return res;
  }

  before(async () => { org = await makeMarketingOrg(SLUG); });
  after(async () => { if (org) await wipeMarketingOrg(org.orgId); await close(); });

  test("the route is in ROUTES", () => {
    assert.equal(ROUTES["marketing/offers"], handler);
  });

  test("migration 408 seeded the three live offers and the old-ad tags on the default org", async () => {
    const offers = (await db.query(
      `SELECT m.tag, m.name, m.status, m.structure, m.lane::text AS lane, m.card_path, m.format_mix, m.steps
         FROM marketing_offers m JOIN orgs o ON o.id = m.org_id AND o.is_default ORDER BY m.tag`
    )).rows;
    assert.deepEqual(offers.map((o) => o.tag), ["blueprint", "direct_book", "slo"]);
    for (const o of offers) {
      assert.equal(o.status, "live");
      assert.equal(o.card_path, `marketing/offers/${o.tag}.md`);
    }
    const by = Object.fromEntries(offers.map((o) => [o.tag, o]));
    assert.equal(by.direct_book.structure, "book_call");
    assert.equal(by.direct_book.lane, "sorting");
    assert.deepEqual(by.direct_book.format_mix, { standard: 2, sorting: 1 });
    assert.equal(by.blueprint.lane, "uwiq");
    assert.equal(by.blueprint.steps[1].url, "https://apply.fundhub.ai/watch");
    assert.equal(by.blueprint.steps[2].url, null, "a page that can't be confirmed stays blank");
    assert.equal(by.slo.structure, "direct_buy");
    assert.equal(by.slo.steps.find((s) => s.type === "sales_page").url, "https://apply.fundhub.ai/roadmap");
    assert.equal(by.slo.steps.find((s) => s.type === "checkout").price, 14700);

    const tags = (await db.query(
      `SELECT t.offer_tag, count(*)::int AS n, min(t.ad_number) AS lo, max(t.ad_number) AS hi
         FROM ad_offer_tags t JOIN orgs o ON o.id = t.org_id AND o.is_default
        WHERE t.source = 'decision_9' GROUP BY 1 ORDER BY 1`
    )).rows;
    const n = Object.fromEntries(tags.map((t) => [t.offer_tag, t]));
    assert.equal(n.slo.n, 7);
    assert.equal(n.slo.lo, 84);
    assert.equal(n.slo.hi, 90);
    assert.equal(n.direct_book.n, 13);
    assert.equal(n.blueprint.n, 6);
    const wl = await db.query(
      `SELECT 1 FROM ad_offer_tags t JOIN orgs o ON o.id = t.org_id AND o.is_default
        WHERE t.ad_number BETWEEN 72 AND 76`
    );
    assert.equal(wl.rows.length, 0, "white-label ads stay untagged");
  });

  test("no login is 401; a csm is 403; a bad method is 405", async () => {
    assert.equal((await call(null)).code, 401);
    assert.equal((await call(org.tokens.csm)).code, 403);
    assert.equal((await call(org.tokens.csm, { method: "POST", body: { tag: "pgt_x", name: "X" } })).code, 403);
    assert.equal((await call(org.tokens.owner, { method: "PUT" })).code, 405);
  });

  test("a new org starts with no offers", async () => {
    const r = await call(org.tokens.owner);
    assert.equal(r.code, 200);
    assert.deepEqual(r.body.offers, []);
  });

  test("POST creates an offer with defaults, and GET reads it back", async () => {
    const r = await call(org.tokens.owner, {
      method: "POST",
      body: {
        tag: "pgt_offer", name: "Test Offer", structure: "direct_buy", lane: "wl",
        steps: [{ type: "sales_page", url: "https://example.test/p" }, { type: "checkout", product_key: "diagnostic", price: 14700 }],
        format_mix: { standard: 2 }
      }
    });
    assert.equal(r.code, 201, JSON.stringify(r.body));
    const o = r.body.offer;
    assert.equal(r.body.created, true);
    assert.equal(o.tag, "pgt_offer");
    assert.equal(o.status, "draft");
    assert.equal(o.paused, false);
    assert.equal(o.card_path, "marketing/offers/pgt_offer.md");
    assert.equal(o.cta_type, "LEARN_MORE");
    assert.equal(o.weight, 1);
    assert.equal(o.min_per_batch, 3);
    assert.equal(o.lane, "wl");
    assert.deepEqual(o.steps[1], { type: "checkout", url: null, product_key: "diagnostic", price: 14700 });
    assert.equal(r.body.repo_write, null, "no card_md, no repo write");

    const one = await call(org.tokens.admin, { query: { tag: "pgt_offer" } });
    assert.equal(one.code, 200);
    assert.equal(one.body.offer.name, "Test Offer");
    const list = await call(org.tokens.admin);
    assert.equal(list.body.count, 1);
    assert.equal((await call(org.tokens.admin, { query: { tag: "pgt_nope" } })).code, 404);
    assert.equal((await call(org.tokens.admin, { query: { tag: "Bad Tag" } })).code, 400);
  });

  test("POST on an existing tag patches it (pause, status, weight)", async () => {
    const r = await call(org.tokens.owner, {
      method: "POST", body: { tag: "pgt_offer", status: "testing", paused: true, weight: 2.5, test_key: "price_test" }
    });
    assert.equal(r.code, 200);
    assert.equal(r.body.created, false);
    assert.equal(r.body.offer.status, "testing");
    assert.equal(r.body.offer.paused, true);
    assert.equal(r.body.offer.weight, 2.5);
    assert.equal(r.body.offer.name, "Test Offer", "untouched");
    // Restarting a paused offer just clears paused.
    const again = await call(org.tokens.owner, { method: "POST", body: { tag: "pgt_offer", paused: false } });
    assert.equal(again.body.offer.paused, false);
    assert.equal(again.body.offer.status, "testing");
  });

  test("a retired offer stays in the table and its tag is never reused", async () => {
    await call(org.tokens.owner, { method: "POST", body: { tag: "pgt_offer", status: "retired" } });
    const list = await call(org.tokens.owner);
    assert.equal(list.body.offers.find((o) => o.tag === "pgt_offer").status, "retired");
    // Posting the same tag patches it; it can't be created twice.
    const dup = await call(org.tokens.owner, { method: "POST", body: { tag: "pgt_offer", name: "Reborn" } });
    assert.equal(dup.body.created, false);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM marketing_offers WHERE org_id = $1 AND tag = 'pgt_offer'`, [org.orgId])).rows[0].n, 1);
  });

  test("the database refuses to rename a tag", async () => {
    await assert.rejects(
      db.query(`UPDATE marketing_offers SET tag = 'pgt_renamed' WHERE org_id = $1 AND tag = 'pgt_offer'`, [org.orgId]),
      /tag is permanent/
    );
  });

  test("bad bodies are 400 with a message, and nothing is written", async () => {
    const before = (await db.query(`SELECT count(*)::int AS n FROM marketing_offers WHERE org_id = $1`, [org.orgId])).rows[0].n;
    for (const body of [
      { tag: "Bad", name: "X" }, { tag: "pgt_b" }, { tag: "pgt_b", name: "X", lane: "unknown" },
      { tag: "pgt_b", name: "X", steps: [{ type: "nope" }] }, { tag: "pgt_b", name: "X", id: "1" },
      { tag: "pgt_b", name: "X", status: "paused" }
    ]) {
      const r = await call(org.tokens.owner, { method: "POST", body });
      assert.equal(r.code, 400, JSON.stringify(body));
      assert.ok(r.body.error && r.body.message);
    }
    const after = (await db.query(`SELECT count(*)::int AS n FROM marketing_offers WHERE org_id = $1`, [org.orgId])).rows[0].n;
    assert.equal(after, before);
  });

  test("saving an offer card goes through the one enqueueRepoWrite call site", async () => {
    repoWrites.length = 0;
    const r = await call(org.tokens.owner, {
      method: "POST", body: { tag: "pgt_offer", card_md: "# Test Offer\n\nWhat it sells.\n" }
    });
    assert.equal(r.code, 200);
    assert.equal(repoWrites.length, 1);
    assert.equal(repoWrites[0].path, "marketing/offers/pgt_offer.md");
    assert.equal(repoWrites[0].content, "# Test Offer\n\nWhat it sells.\n");
    assert.equal(repoWrites[0].orgId, org.orgId);
    assert.equal(repoWrites[0].staffId, org.ids.owner);
    assert.deepEqual(r.body.repo_write, { queued: true, path: "marketing/offers/pgt_offer.md" });
  });

  test("with the real outbox a card save queues a repo_outbox row in the same transaction", async () => {
    wakes = 0;
    const r = await call(org.tokens.owner, {
      method: "POST", body: { tag: "pgt_offer", card_md: "# card\n" }
    }, { db, wakeWorker: deps.wakeWorker });
    assert.equal(r.code, 200);
    assert.equal(wakes, 1, "the worker is woken once, after the commit");
    assert.equal(r.body.repo_write.queued, true);
    assert.equal(r.body.repo_write.path, "marketing/offers/pgt_offer.md");
    const row = (await db.query(
      `SELECT path, mode, content, committed_at FROM repo_outbox WHERE id = $1`, [r.body.repo_write.id]
    )).rows[0];
    assert.equal(row.path, "marketing/offers/pgt_offer.md");
    assert.equal(row.mode, "replace");
    assert.equal(row.content, "# card\n");
    assert.equal(row.committed_at, null);
  });

  test("a failing repo write rolls the whole save back", async () => {
    wakes = 0;
    const boom = { db, wakeWorker: deps.wakeWorker, enqueueRepoWrite: async () => { throw new Error("outbox down"); } };
    const r = await call(org.tokens.owner, {
      method: "POST", body: { tag: "pgt_boom", name: "Boom", card_md: "# x\n" }
    }, boom);
    assert.equal(r.code, 500);
    assert.equal(wakes, 0, "no wake when the save rolled back");
    assert.equal((await db.query(`SELECT 1 FROM marketing_offers WHERE org_id = $1 AND tag = 'pgt_boom'`, [org.orgId])).rows.length, 0);
  });

  test("a repeated request_id replays the first answer", async () => {
    const body = { tag: "pgt_idem", name: "Idem", request_id: "offer-req-1" };
    const first = await call(org.tokens.owner, { method: "POST", body });
    assert.equal(first.code, 201);
    const again = await call(org.tokens.owner, { method: "POST", body });
    assert.equal(again.code, 201);
    assert.equal(again.body.replayed, true);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM marketing_offers WHERE org_id = $1 AND tag = 'pgt_idem'`, [org.orgId])).rows[0].n, 1);
  });

  test("ad_offer_tags only accepts a tag that is an offer in the same org", async () => {
    await assert.rejects(
      db.query(`INSERT INTO ad_offer_tags (org_id, ad_number, offer_tag, source) VALUES ($1, 5000, 'no_such', 'manual')`, [org.orgId]),
      /ad_offer_tags_offer_fk/
    );
    await db.query(`INSERT INTO ad_offer_tags (org_id, ad_number, offer_tag, source) VALUES ($1, 5000, 'pgt_offer', 'manual')`, [org.orgId]);
    await assert.rejects(
      db.query(`INSERT INTO ad_offer_tags (org_id, ad_number, offer_tag, source) VALUES ($1, 5000, 'pgt_idem', 'manual')`, [org.orgId]),
      /ad_offer_tags_pkey|duplicate key/
    );
  });
});
