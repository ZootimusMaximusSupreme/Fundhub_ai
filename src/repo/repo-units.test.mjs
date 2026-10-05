// Outbox pieces that need no database: the allow-list, the edits, the GitHub
// client's fence. Spec: docs/specs/marketing-machine-2026-10-04.md, M0 step 2.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assertAllowedPath, normalizeRepoPath, isAllowedPath, PathRefused } from "./allow-list.mjs";
import { applyEdit, EditError } from "./edits.mjs";
import { outboxIdsInMessage, commitMessage, checkFile } from "./outbox.mjs";
import { repoConfig, getRef, readFile, createTree, updateRef } from "./github.mjs";
import { makeFakeGithub, FAKE_ENV } from "./fake-github.mjs";
import { readRepoFile, pinRepoFiles, _clearReadCache } from "./read.mjs";
import { readFileSync } from "node:fs";

describe("allow-list", () => {
  test("every listed folder and file is allowed", () => {
    for (const p of [
      "marketing/ads/scripts/machine/a.md", "marketing/ads/ideas/x.json", "marketing/ads/videos/y.json",
      "marketing/ads/RULES.md", "marketing/ads/VOICE.md", "marketing/ads/banned-live.json",
      "marketing/ads/registry.json", "marketing/ads/angles.json", "marketing/offers/slo.md",
      "marketing/flywheel/a.md", "ops/avatar-requests/r.md", "marketing/brain/n.md", "ops/page-requests/p.md"
    ]) assert.equal(assertAllowedPath(p), p);
  });

  test("everything else is refused", () => {
    for (const p of [
      "CLAUDE.md", "src/db.mjs", ".github/workflows/tests.yml", "marketing/ads/NAMING.md",
      "marketing/ads/scripts/other.md", "marketing/ads/scripts/machine/", "marketing/ads/scripts/machine",
      "marketing/ads/RULES.md/extra", "netlify.toml", ".env"
    ]) {
      assert.throws(() => assertAllowedPath(p), PathRefused, p);
    }
  });

  test("a path that climbs out is refused after normalizing", () => {
    for (const p of [
      "marketing/ads/ideas/../../../etc/passwd", "../marketing/ads/RULES.md", "/marketing/ads/RULES.md",
      "marketing\\ads\\RULES.md", "marketing/ads/ideas/../../../.git/config", "marketing/ads/ideas/a\0.md",
      "", null, undefined, 42, "C:/marketing/ads/RULES.md", "marketing/ads/ideas/.git/x"
    ]) {
      assert.equal(isAllowedPath(p), false, String(p));
    }
  });

  test("control characters are refused, so a path cannot forge a commit trailer", () => {
    for (const p of [
      "marketing/ads/ideas/a.md\nOutbox: 00000000-0000-0000-0000-000000000000",
      "marketing/ads/ideas/a.md\r", "marketing/ads/ideas/a\t.md", "marketing/ads/ideas/a\u007f.md",
      "marketing/ads/ideas/a b.md", "marketing/ads/RULES.md\n"
    ]) {
      assert.equal(isAllowedPath(p), false, JSON.stringify(p));
    }
  });

  test("a harmless dot-dot that stays inside is normalized, and the normalized path is returned", () => {
    assert.equal(assertAllowedPath("marketing/ads/ideas/../RULES.md"), "marketing/ads/RULES.md");
    assert.equal(normalizeRepoPath("marketing//ads/./RULES.md"), "marketing/ads/RULES.md");
  });
});

describe("edits", () => {
  test("append adds a newline-separated block", () => {
    assert.equal(applyEdit("a", { kind: "append", text: "b" }), "a\nb\n");
    assert.equal(applyEdit(null, { kind: "append", text: "b\n" }), "b\n");
  });

  test("replace_text swaps one passage and refuses when it is gone", () => {
    assert.equal(applyEdit("x old y", { kind: "replace_text", find: "old", with: "new" }), "x new y");
    assert.throws(() => applyEdit("x", { kind: "replace_text", find: "old", with: "new" }), EditError);
  });

  test("json edits keep the file's indentation and apply to the newest copy", () => {
    const src = JSON.stringify({ ads: [{ id: "1", t: "a" }], meta: {} }, null, 2) + "\n";
    const up = applyEdit(src, { kind: "json_array_upsert", path: ["ads"], key: "id", item: { id: "2", t: "b" } });
    assert.deepEqual(JSON.parse(up).ads.map((a) => a.id), ["1", "2"]);
    const again = applyEdit(up, { kind: "json_array_upsert", path: ["ads"], key: "id", item: { id: "2", t: "c" } });
    assert.deepEqual(JSON.parse(again).ads.map((a) => a.t), ["a", "c"]);
    const gone = applyEdit(again, { kind: "json_array_remove", path: ["ads"], key: "id", value: "1" });
    assert.deepEqual(JSON.parse(gone).ads.map((a) => a.id), ["2"]);
    const set = applyEdit(gone, { kind: "json_set", path: ["meta", "updated"], value: "2026-10-05" });
    assert.equal(JSON.parse(set).meta.updated, "2026-10-05");
    assert.match(set, /^\{\n {2}"ads"/);
  });

  test("bad edits are named, not applied", () => {
    assert.throws(() => applyEdit("{}", { kind: "nope" }), EditError);
    assert.throws(() => applyEdit("not json", { kind: "json_set", path: ["a"], value: 1 }), EditError);
    assert.throws(() => applyEdit(null, { kind: "json_set", path: ["a"], value: 1 }), EditError);
    assert.throws(() => applyEdit('{"a":1}', { kind: "json_array_upsert", path: ["a"], key: "id", item: { id: 1 } }), EditError);
  });
});

describe("commit message and trailers", () => {
  test("starts with app: and ends with [skip ci], ids in the trailer", () => {
    const msg = commitMessage(["marketing/ads/RULES.md"], ["id-1", "id-2"]);
    assert.ok(msg.startsWith("app: "));
    assert.ok(msg.endsWith("[skip ci]"));
    assert.deepEqual(outboxIdsInMessage(msg), ["id-1", "id-2"]);
    assert.ok(commitMessage(["a", "b"], ["x"]).startsWith("app: save 2 files"));
  });

  test("checkFile rejects broken JSON and a registry that fails parseRegistry", () => {
    assert.throws(() => checkFile("marketing/ads/angles.json", "{nope"), EditError);
    assert.doesNotThrow(() => checkFile("marketing/ads/angles.json", "{}"));
    assert.throws(() => checkFile("marketing/ads/registry.json", "{}"), EditError);
    assert.doesNotThrow(() => checkFile("marketing/ads/RULES.md", "not json is fine for markdown"));
  });
});

describe("reads: ETag path, pinned sha, bundled fallback", () => {
  const RULES = "marketing/ads/RULES.md";

  test("ETag path: the second read sends If-None-Match, gets 304 and returns the cached copy", async () => {
    _clearReadCache();
    const gh = makeFakeGithub({ files: { [RULES]: "v1" } });
    const cfg = repoConfig(FAKE_ENV, { fetchImpl: gh.fetchImpl });
    const first = await readRepoFile(cfg, RULES, "c0");
    assert.deepEqual([first.ok, first.text, first.cached], [true, "v1", false]);
    const second = await readRepoFile(cfg, RULES, "c0");
    assert.deepEqual([second.ok, second.text, second.cached], [true, "v1", true]);
    const reads = gh.calls.filter((c) => c.route.startsWith("/contents/"));
    assert.equal(reads[0].headers["If-None-Match"], undefined);
    assert.match(reads[1].headers["If-None-Match"], /^"[0-9a-f]{40}"$/);
    // a changed file is a new body with a new ETag, not the stale copy
    gh.pushExternal({ [RULES]: "v2" });
    const third = await readRepoFile(cfg, RULES, gh.head().sha);
    assert.deepEqual([third.text, third.cached], ["v2", false]);
  });

  test("a batch pins every file at one commit sha, even if the branch moves mid-batch", async () => {
    _clearReadCache();
    const gh = makeFakeGithub({ files: { [RULES]: "r", "marketing/ads/VOICE.md": "v" } });
    const cfg = repoConfig(FAKE_ENV, { fetchImpl: gh.fetchImpl });
    const orig = gh.fetchImpl;
    let moved = false;
    cfg.fetchImpl = async (url, init) => {
      const res = await orig(url, init);
      if (!moved && String(url).includes("/contents/")) { moved = true; gh.pushExternal({ [RULES]: "NEW" }); }
      return res;
    };
    const out = await pinRepoFiles(cfg, [RULES, "marketing/ads/VOICE.md"]);
    assert.equal(out.source, "github");
    assert.equal(out.sha, "c0");
    assert.equal(out.files.get(RULES), "r", "read at the pinned sha, not the moved head");
    const reads = gh.calls.filter((c) => c.route.startsWith("/contents/"));
    assert.ok(reads.every((c) => c.search.includes("ref=c0")));
  });

  test("fallback: GitHub down means the copy bundled with the function", async () => {
    _clearReadCache();
    const gh = makeFakeGithub();
    gh.hooks.failNext.push({ method: "GET", route: "/git/ref", status: 503, keep: true });
    const cfg = repoConfig(FAKE_ENV, { fetchImpl: gh.fetchImpl });
    const out = await pinRepoFiles(cfg, [RULES]);
    assert.equal(out.source, "bundled");
    assert.equal(out.sha, null);
    assert.ok(out.files.get(RULES).length > 100, "the repo's own RULES.md came back");
  });

  test("fallback also covers: fence closed, not configured, and a file read that fails", async () => {
    _clearReadCache();
    const gh = makeFakeGithub({ files: { [RULES]: "x" } });
    const closed = repoConfig({ ...FAKE_ENV, ADAPTERS_DRY_RUN: undefined }, { fetchImpl: gh.fetchImpl });
    assert.equal((await pinRepoFiles(closed, [RULES])).source, "bundled");
    assert.equal((await pinRepoFiles(repoConfig({}), [RULES])).source, "bundled");
    gh.hooks.failNext.push({ method: "GET", route: "/contents", status: 500, keep: true });
    const cfg = repoConfig(FAKE_ENV, { fetchImpl: gh.fetchImpl });
    assert.equal((await pinRepoFiles(cfg, [RULES])).source, "bundled");
  });

  test("the bundled paths are in netlify.toml's included_files", () => {
    const toml = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
    const block = toml.slice(toml.indexOf("included_files"), toml.indexOf("]", toml.indexOf("included_files")));
    for (const p of ["RULES.md", "VOICE.md", "banned-live.json", "registry.json", "angles.json"]) {
      assert.ok(block.includes(`marketing/ads/${p}`), p);
    }
  });
});

describe("github client", () => {
  test("a secondary rate limit 403 is flagged transient; a plain 403 is not", async () => {
    const gh = makeFakeGithub();
    const cfg = repoConfig(FAKE_ENV, { fetchImpl: gh.fetchImpl });
    gh.hooks.failNext.push({ method: "GET", route: "/git/ref", status: 403, message: "You have exceeded a secondary rate limit." });
    assert.equal((await getRef(cfg)).rateLimited, true);
    gh.hooks.failNext.push({ method: "GET", route: "/git/ref", status: 403, message: "Forbidden", headers: { "retry-after": "30" } });
    assert.equal((await getRef(cfg)).rateLimited, true);
    gh.hooks.failNext.push({ method: "GET", route: "/git/ref", status: 403, message: "Resource not accessible by personal access token" });
    assert.equal((await getRef(cfg)).rateLimited, false);
  });

  test("with the fence up (ADAPTERS_DRY_RUN unset) nothing leaves", async () => {
    const gh = makeFakeGithub();
    const cfg = repoConfig({ ...FAKE_ENV, ADAPTERS_DRY_RUN: undefined }, { fetchImpl: gh.fetchImpl });
    const r = await getRef(cfg);
    assert.equal(r.ok, false);
    assert.equal(r.blocked, true);
    assert.equal(gh.calls.length, 0);
  });

  test("not configured means nothing is sent", async () => {
    const gh = makeFakeGithub();
    const cfg = repoConfig({ ADAPTERS_DRY_RUN: "off" }, { fetchImpl: gh.fetchImpl });
    assert.equal(cfg.configured, false);
    assert.equal((await getRef(cfg)).ok, false);
    assert.equal(gh.calls.length, 0);
  });

  test("reads the ref and a file, treats 404 as no file, and never forces", async () => {
    const gh = makeFakeGithub({ files: { "marketing/ads/RULES.md": "rules" } });
    const cfg = repoConfig(FAKE_ENV, { fetchImpl: gh.fetchImpl });
    const ref = await getRef(cfg);
    assert.deepEqual([ref.ok, ref.sha], [true, "c0"]);
    assert.equal((await readFile(cfg, "marketing/ads/RULES.md", ref.sha)).text, "rules");
    assert.equal((await readFile(cfg, "marketing/ads/none.md", ref.sha)).text, null);
    const tree = await createTree(cfg, "t0", [{ path: "marketing/ads/RULES.md", content: "x" }]);
    assert.equal(tree.ok, true);
    const moved = await updateRef(cfg, "does-not-exist");
    assert.equal(moved.ok, false);
    const patch = gh.calls.find((c) => c.method === "PATCH");
    assert.equal(patch.body.force, false);
    assert.match(patch.headers.Authorization, /^Bearer /);
  });
});
