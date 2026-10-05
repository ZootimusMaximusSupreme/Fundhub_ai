// Outbox pieces that need no database: the allow-list, the edits, the GitHub
// client's fence. Spec: docs/specs/marketing-machine-2026-10-04.md, M0 step 2.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assertAllowedPath, normalizeRepoPath, isAllowedPath, PathRefused } from "./allow-list.mjs";
import { applyEdit, EditError } from "./edits.mjs";
import { outboxIdsInMessage, commitMessage, checkFile } from "./outbox.mjs";
import { repoConfig, getRef, readFile, createTree, updateRef } from "./github.mjs";
import { makeFakeGithub, FAKE_ENV } from "./fake-github.mjs";

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

describe("github client", () => {
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
