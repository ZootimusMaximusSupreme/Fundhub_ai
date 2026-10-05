// The repo outbox against a real database, with a fake GitHub (never the real
// one). Spec: docs/specs/marketing-machine-2026-10-04.md, M0 step 2.
//
// Under src/ and not api/ — CLAUDE.md §12: npm test's glob is src/** and
// scripts/** only.

import { test, before, beforeEach, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, pool, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import {
  enqueueRepoWrite, drainOutbox, outboxHealth, retryBlocked, outboxIdsInMessage,
  DRAIN_LOCK_KEY
} from "./outbox.mjs";
import { PathRefused } from "./allow-list.mjs";
import { makeFakeGithub, FAKE_ENV } from "./fake-github.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const MARK = "outbox-test";
const P = "marketing/ads/scripts/machine/outbox-test";
const REGISTRY = "marketing/ads/registry.json";
const ad = (id, title) => ({ id, title, lane: "sorting", gate: "none", entry: "sorting", primary_offer: "none", secondary_offers: "all", variants: [] });
const EMPTY_REGISTRY = JSON.stringify({ version: 1, ads: [] }, null, 2) + "\n";

describe("repo outbox", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let org;
  let n = 0;
  const op = () => `${MARK}:${Date.now()}:${++n}`;

  before(async () => { org = await resolveDefaultOrg(db); });
  beforeEach(async () => { await db.query(`DELETE FROM repo_outbox WHERE op_id LIKE $1`, [`${MARK}:%`]); });
  after(async () => {
    await db.query(`DELETE FROM repo_outbox WHERE op_id LIKE $1`, [`${MARK}:%`]);
    await close();
  });

  const enqueue = (row) => enqueueRepoWrite(db, { orgId: org, opId: op(), ...row });
  const drain = (gh, extra = {}) => drainOutbox({ pool: pool(), env: FAKE_ENV, fetchImpl: gh.fetchImpl, ...extra });
  const rowOf = async (id) => (await db.query(`SELECT * FROM repo_outbox WHERE id=$1`, [id])).rows[0];

  test("the row is written inside the caller's transaction: a rollback leaves nothing", async () => {
    const c = await pool().connect();
    const id = op();
    try {
      await c.query("BEGIN");
      await enqueueRepoWrite(c, { orgId: org, opId: id, path: `${P}-a.md`, mode: "replace", content: "x" });
      await c.query("ROLLBACK");
    } finally { c.release(); }
    assert.equal((await db.query(`SELECT 1 FROM repo_outbox WHERE op_id=$1`, [id])).rowCount, 0);
  });

  test("the same op id twice writes one row", async () => {
    const opId = op();
    const a = await enqueueRepoWrite(db, { orgId: org, opId, path: `${P}-a.md`, mode: "replace", content: "x" });
    const b = await enqueueRepoWrite(db, { orgId: org, opId, path: `${P}-a.md`, mode: "replace", content: "x" });
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
    assert.equal(a.id, b.id);
  });

  test("a path outside the allow-list is refused at enqueue and writes nothing", async () => {
    await assert.rejects(enqueue({ path: "CLAUDE.md", mode: "replace", content: "x" }), PathRefused);
    await assert.rejects(enqueue({ path: "marketing/ads/ideas/../../../src/db.mjs", mode: "replace", content: "x" }), PathRefused);
    assert.equal((await db.query(`SELECT 1 FROM repo_outbox WHERE op_id LIKE $1`, [`${MARK}:%`])).rowCount, 0);
  });

  test("the table's own checks refuse a replace with no content", async () => {
    await assert.rejects(db.query(
      `INSERT INTO repo_outbox (org_id, op_id, path, mode) VALUES ($1,$2,$3,'replace')`,
      [org, op(), `${P}-a.md`]));
  });

  test("not configured: nothing is claimed", async () => {
    const r = await enqueue({ path: `${P}-a.md`, mode: "replace", content: "x" });
    const out = await drainOutbox({ pool: pool(), env: {} });
    assert.equal(out.status, "not_configured");
    assert.equal((await rowOf(r.id)).claimed_at, null);
  });

  test("replace rows become one commit: author, [skip ci], trailer, force:false, rows marked", async () => {
    const gh = makeFakeGithub();
    const a = await enqueue({ path: `${P}-a.md`, mode: "replace", content: "alpha\n" });
    const b = await enqueue({ path: `${P}-b.md`, mode: "replace", content: "beta\n" });
    const out = await drain(gh);
    assert.equal(out.status, "committed");
    assert.equal(gh.commits.length, 2);
    const commit = gh.head();
    assert.equal(commit.files[`${P}-a.md`], "alpha\n");
    assert.equal(commit.files[`${P}-b.md`], "beta\n");
    assert.ok(commit.message.startsWith("app: "));
    assert.ok(commit.message.endsWith("[skip ci]"));
    assert.deepEqual(outboxIdsInMessage(commit.message).sort(), [a.id, b.id].sort());
    assert.equal(commit.author.name, "Fundhub app");
    assert.equal(gh.calls.filter((c) => c.method === "PATCH")[0].body.force, false);
    for (const id of [a.id, b.id]) {
      const row = await rowOf(id);
      assert.equal(row.committed_sha, commit.sha);
      assert.ok(row.committed_at);
      assert.equal(row.error, null);
    }
    // nothing left: a second drain does no work
    assert.equal((await drain(gh)).status, "empty");
    assert.equal(gh.commits.length, 2);
  });

  test("edits to a shared file apply in order on the newest copy of it", async () => {
    const gh = makeFakeGithub({ files: { [REGISTRY]: EMPTY_REGISTRY } });
    await enqueue({ path: REGISTRY, mode: "edit", edit: { kind: "json_array_upsert", path: ["ads"], key: "id", item: ad("91", "one") } });
    await enqueue({ path: REGISTRY, mode: "edit", edit: { kind: "json_array_upsert", path: ["ads"], key: "id", item: ad("92", "two") } });
    const out = await drain(gh);
    assert.equal(out.status, "committed");
    const doc = JSON.parse(gh.head().files[REGISTRY]);
    assert.deepEqual(doc.ads.map((a) => a.id), ["91", "92"]);
  });

  test("a lost race: re-reads the ref, re-applies the edit to the newer file, and commits", async () => {
    const gh = makeFakeGithub({ files: { [REGISTRY]: EMPTY_REGISTRY } });
    const row = await enqueue({ path: REGISTRY, mode: "edit", edit: { kind: "json_array_upsert", path: ["ads"], key: "id", item: ad("91", "mine") } });
    let fired = false;
    gh.hooks.beforePatch = () => {
      if (fired) return;
      fired = true;
      // someone else adds ad 50 to the registry between our read and our push
      gh.pushExternal({ [REGISTRY]: JSON.stringify({ version: 1, ads: [ad("50", "theirs")] }, null, 2) + "\n" });
    };
    const out = await drain(gh);
    assert.equal(out.status, "committed");
    const doc = JSON.parse(gh.head().files[REGISTRY]);
    assert.deepEqual(doc.ads.map((a) => a.id).sort(), ["50", "91"], "their change survived and ours was added");
    assert.ok((await rowOf(row.id)).committed_at);
    assert.equal(gh.calls.filter((c) => c.method === "PATCH").length, 2);
  });

  test("a 409 is retried the same way", async () => {
    const gh = makeFakeGithub();
    const row = await enqueue({ path: `${P}-a.md`, mode: "replace", content: "x" });
    gh.hooks.failNext.push({ method: "PATCH", route: "/git/refs", status: 409, message: "conflict" });
    const out = await drain(gh);
    assert.equal(out.status, "committed");
    assert.ok((await rowOf(row.id)).committed_at);
  });

  test("still contended after 3 tries: rows wait for the next drain, they are not stopped", async () => {
    const gh = makeFakeGithub();
    const row = await enqueue({ path: `${P}-a.md`, mode: "replace", content: "x" });
    gh.hooks.beforePatch = () => gh.pushExternal({ "x.txt": String(Math.random()) });
    const out = await drain(gh);
    assert.equal(out.status, "contended");
    assert.equal(gh.calls.filter((c) => c.method === "PATCH").length, 3);
    const r = await rowOf(row.id);
    assert.equal(r.committed_at, null);
    assert.equal(r.error, null);
    assert.equal(r.claimed_at, null);
    // the next drain, with the contention gone, lands it
    gh.hooks.beforePatch = null;
    assert.equal((await drain(gh)).status, "committed");
  });

  test("any other 422 stops, shows on the health card, and is skipped until retryBlocked", async () => {
    const gh = makeFakeGithub();
    const row = await enqueue({ path: `${P}-a.md`, mode: "replace", content: "x" });
    gh.hooks.failNext.push({ method: "PATCH", route: "/git/refs", status: 422, message: "Protected branch update failed" });
    const out = await drain(gh);
    assert.equal(out.status, "stopped");
    assert.match(out.message, /Protected branch/);
    assert.equal(gh.calls.filter((c) => c.method === "PATCH").length, 1, "no retry on a non-fast-forward 422");
    const health = await outboxHealth(db);
    assert.ok(health.blocked >= 1);
    assert.match(health.last_error.error, /Protected branch/);
    // skipped now
    assert.equal((await drain(gh)).status, "empty");
    assert.equal(await retryBlocked(db, { ids: [row.id] }), 1);
    assert.equal((await drain(gh)).status, "committed");
  });

  test("a network failure is transient: the claim is given back and the next drain succeeds", async () => {
    const gh = makeFakeGithub();
    const row = await enqueue({ path: `${P}-a.md`, mode: "replace", content: "x" });
    gh.hooks.failNext.push({ method: "GET", route: "/git/ref", status: 503, message: "unavailable" });
    assert.equal((await drain(gh)).status, "retry_later");
    const r = await rowOf(row.id);
    assert.equal(r.claimed_at, null);
    assert.equal(r.error, null);
    assert.equal(r.attempts, 1);
    assert.equal((await drain(gh)).status, "committed");
  });

  test("the fence up: nothing is sent and the rows keep their tries", async () => {
    const gh = makeFakeGithub();
    const row = await enqueue({ path: `${P}-a.md`, mode: "replace", content: "x" });
    const out = await drainOutbox({ pool: pool(), env: { ...FAKE_ENV, ADAPTERS_DRY_RUN: undefined }, fetchImpl: gh.fetchImpl });
    assert.equal(out.status, "retry_later");
    assert.equal(gh.calls.length, 0);
    const r = await rowOf(row.id);
    assert.equal(r.attempts, 0);
    assert.equal(r.error, null);
  });

  test("a crash after the push: the trailer in recent commits counts the row as done, no second commit", async () => {
    const gh = makeFakeGithub();
    const row = await enqueue({ path: `${P}-a.md`, mode: "replace", content: "x" });
    // the previous drain pushed this row's commit, then died before marking the row
    gh.pushExternal({ [`${P}-a.md`]: "x" }, `app: save ${P}-a.md\n\nOutbox: ${row.id}\n[skip ci]`);
    const before = gh.commits.length;
    const out = await drain(gh);
    assert.equal(out.status, "already_committed");
    assert.equal(gh.commits.length, before, "no new commit");
    const r = await rowOf(row.id);
    assert.ok(r.committed_at);
    assert.equal(r.committed_sha, gh.head().sha);
  });

  test("a row whose path is outside the allow-list (written around the API) is stopped, not committed", async () => {
    const gh = makeFakeGithub();
    const bad = (await db.query(
      `INSERT INTO repo_outbox (org_id, op_id, path, mode, content) VALUES ($1,$2,'CLAUDE.md','replace','pwned') RETURNING id`,
      [org, op()])).rows[0].id;
    const good = await enqueue({ path: `${P}-a.md`, mode: "replace", content: "ok" });
    const out = await drain(gh);
    assert.equal(out.status, "committed");
    assert.equal(gh.head().files["CLAUDE.md"], undefined);
    assert.match((await rowOf(bad)).error, /refused/);
    assert.ok((await rowOf(good.id)).committed_at);
  });

  test("a registry that fails parseRegistry is stopped and nothing is pushed for it", async () => {
    const gh = makeFakeGithub();
    const bad = await enqueue({ path: REGISTRY, mode: "replace", content: JSON.stringify({ nope: true }) });
    const good = await enqueue({ path: `${P}-a.md`, mode: "replace", content: "ok" });
    const out = await drain(gh);
    assert.equal(out.status, "committed");
    assert.equal(gh.head().files[REGISTRY], undefined);
    assert.match((await rowOf(bad.id)).error, /registry/);
    assert.ok((await rowOf(good.id)).committed_at);
  });

  test("broken JSON in another JSON file is stopped; an edit that cannot apply is stopped on its own", async () => {
    const gh = makeFakeGithub({ files: { "marketing/ads/angles.json": "{}" } });
    const badJson = await enqueue({ path: "marketing/ads/banned-live.json", mode: "replace", content: "{nope" });
    const badEdit = await enqueue({ path: "marketing/ads/RULES.md", mode: "edit", edit: { kind: "replace_text", find: "ABSENT", with: "x" } });
    const good = await enqueue({ path: `${P}-a.md`, mode: "replace", content: "ok" });
    const out = await drain(gh);
    assert.equal(out.status, "committed");
    assert.match((await rowOf(badJson.id)).error, /valid JSON/);
    assert.match((await rowOf(badEdit.id)).error, /not found/);
    assert.ok((await rowOf(good.id)).committed_at);
  });

  test("only one drain runs at a time", async () => {
    const gh = makeFakeGithub();
    await enqueue({ path: `${P}-a.md`, mode: "replace", content: "x" });
    const holder = await pool().connect();
    try {
      await holder.query(`SELECT pg_advisory_lock($1)`, [DRAIN_LOCK_KEY]);
      const out = await drain(gh);
      assert.equal(out.status, "busy");
      assert.equal(gh.calls.length, 0);
    } finally {
      await holder.query(`SELECT pg_advisory_unlock($1)`, [DRAIN_LOCK_KEY]);
      holder.release();
    }
    assert.equal((await drain(gh)).status, "committed");
  });
});
