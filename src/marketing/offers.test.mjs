import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateOfferBody, cardPathFor, TAG_RE, STEP_TYPES } from "./offers.mjs";
import { enqueueRepoWrite, wakeAfterCommit } from "./repo-writes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("tags: lowercase letter first, then lowercase, digits or underscore, 2 to 24 characters", () => {
  for (const ok of ["slo", "direct_book", "a1", "x".repeat(24)]) assert.ok(TAG_RE.test(ok), ok);
  for (const bad of ["S", "s", "1slo", "Slo", "x".repeat(25), "a-b", "a b", ""]) assert.ok(!TAG_RE.test(bad), bad);
});

test("a tag fits the ad_scripts.offer_key check from migration 377", () => {
  assert.ok(/^[a-z][a-z0-9_]{1,48}$/.test("direct_book"));
  assert.equal(cardPathFor("slo"), "marketing/offers/slo.md");
});

test("creating needs a name; updating needs something to change", () => {
  assert.equal(validateOfferBody({ tag: "newone" }, { creating: true }).error, "name_required");
  assert.equal(validateOfferBody({ tag: "slo" }, { creating: false }).error, "nothing_to_change");
  assert.equal(validateOfferBody({ name: "X" }, { creating: true }).error, "tag_invalid");
});

test("the tag can't be sent through the edit fields and unknown fields are refused", () => {
  assert.equal(validateOfferBody({ tag: "slo", id: "x" }, { creating: false }).error, "field_unknown");
  assert.equal(validateOfferBody({ tag: "slo", org_id: "x" }, { creating: false }).error, "field_unknown");
});

test("steps are checked and filled out to {type,url,product_key,price}", () => {
  const ok = validateOfferBody(
    { tag: "slo", steps: [{ type: "checkout", url: "https://x.test/p", price: 14700 }, { type: "call" }] },
    { creating: false }
  );
  assert.deepEqual(ok.fields.steps, [
    { type: "checkout", url: "https://x.test/p", product_key: null, price: 14700 },
    { type: "call", url: null, product_key: null, price: null }
  ]);
  for (const bad of [
    [{ type: "nope" }], [{ type: "checkout", price: 1.5 }], [{ type: "checkout", price: -1 }], "x", [{ url: "x" }]
  ]) {
    assert.equal(validateOfferBody({ tag: "slo", steps: bad }, { creating: false }).error, "field_invalid");
  }
  assert.ok(STEP_TYPES.includes("vsl_page") && STEP_TYPES.includes("e_product"));
});

test("lane must be one of the five UTM lanes; 'unknown' is not allowed", () => {
  assert.equal(validateOfferBody({ tag: "slo", lane: "unknown" }, { creating: false }).error, "field_invalid");
  assert.equal(validateOfferBody({ tag: "slo", lane: "wl" }, { creating: false }).fields.lane, "wl");
});

test("status, weight, mix and cta are checked", () => {
  const bad = [
    { status: "paused" }, { weight: -1 }, { min_per_batch: 1.5 }, { cta_type: "learn more" },
    { format_mix: { standard: -1 } }, { paused: "no" }
  ];
  for (const b of bad) assert.equal(validateOfferBody({ tag: "slo", ...b }, { creating: false }).error, "field_invalid", JSON.stringify(b));
});

test("card_md alone is a valid update (a card save)", () => {
  const r = validateOfferBody({ tag: "slo", card_md: "# SLO\n" }, { creating: false });
  assert.equal(r.card_md, "# SLO\n");
  assert.equal(validateOfferBody({ tag: "slo", card_md: "  " }, { creating: false }).error, "card_md_invalid");
});

test("the repo write goes through the real outbox and does NOT wake the worker (the caller does, after commit)", async () => {
  const calls = [];
  const tx = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: "row-1" }] }; } };
  const r = await enqueueRepoWrite(tx, { orgId: "org-1", staffId: "s1", path: "marketing/offers/slo.md", content: "x", message: "m" });
  assert.deepEqual(r, { queued: true, id: "row-1", duplicate: false, path: "marketing/offers/slo.md" });
  assert.match(calls[0].sql, /INSERT INTO repo_outbox/);
  assert.equal(calls[0].params[0], "org-1");
  assert.match(calls[0].params[1], /^save:/);
  assert.equal(calls[0].params[2], "marketing/offers/slo.md");
  assert.equal(calls[0].params[3], "replace");
  assert.equal(calls[0].params[4], "x");
});

test("wakeAfterCommit calls the wake once and never throws", async () => {
  let n = 0;
  await wakeAfterCommit(async () => { n++; return { ok: true }; });
  assert.equal(n, 1);
  await wakeAfterCommit(async () => { throw new Error("down"); });
  await wakeAfterCommit(async () => ({ ok: false, error: "no secret" }));
});

test("two saves of the same file get different op ids, so both land", async () => {
  const ids = [];
  const tx = { query: async (_s, params) => { ids.push(params[1]); return { rows: [{ id: "r" }] }; } };
  await enqueueRepoWrite(tx, { orgId: "o", path: "marketing/offers/slo.md", content: "a" });
  await enqueueRepoWrite(tx, { orgId: "o", path: "marketing/offers/slo.md", content: "b" });
  assert.notEqual(ids[0], ids[1]);
});

test("a path outside the marketing folders is refused before anything is written", async () => {
  const tx = { query: async () => { throw new Error("must not be called"); } };
  await assert.rejects(
    enqueueRepoWrite(tx, { orgId: "o", path: "src/db.mjs", content: "x" }),
    /not allowed|refus/i
  );
});

test("migration 408's old-ad tags match marketing/ads/registry.json and decision 9", () => {
  const sql = fs.readFileSync(path.join(ROOT, "db/migrations/408_marketing_offers_seed.sql"), "utf8");
  const seeded = new Map(
    [...sql.matchAll(/\((\d+), '(slo|direct_book|blueprint)'\)/g)].map((m) => [Number(m[1]), m[2]])
  );
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "marketing/ads/registry.json"), "utf8"));
  const want = new Map();
  for (const ad of registry.ads) {
    const n = Number(ad.id);
    if (["sorting", "funding600", "premium"].includes(ad.lane)) want.set(n, "direct_book");
    else if (ad.lane === "uwiq") want.set(n, "blueprint");
    // wl stays untagged
  }
  for (let n = 84; n <= 90; n++) want.set(n, "slo");
  assert.deepEqual([...seeded].sort((a, b) => a[0] - b[0]), [...want].sort((a, b) => a[0] - b[0]));
  for (const ad of registry.ads.filter((a) => a.lane === "wl")) assert.ok(!seeded.has(Number(ad.id)), `wl ad ${ad.id} stays untagged`);
});
