import test from "node:test";
import assert from "node:assert/strict";
import { onlyMachineFoldersChanged, isMachinePath, MACHINE_FOLDERS } from "./ship-changes.mjs";

test("no changes counts as nothing to ship", () => {
  assert.equal(onlyMachineFoldersChanged([]), true);
  assert.equal(onlyMachineFoldersChanged(undefined), true);
  assert.equal(onlyMachineFoldersChanged(["", "  "]), true);
});

test("every machine folder alone is no change", () => {
  for (const d of MACHINE_FOLDERS) {
    assert.equal(onlyMachineFoldersChanged([`${d}file.md`, `${d}deep/er/x.json`]), true, d);
  }
});

test("a mix of machine folders and the ship log is no change", () => {
  assert.equal(
    onlyMachineFoldersChanged(["marketing/brain/a.md", "ops/page-requests/1.json", "ops/ship-log.md"]),
    true
  );
});

test("one path outside the machine folders ships", () => {
  assert.equal(onlyMachineFoldersChanged(["marketing/brain/a.md", "src/app.mjs"]), false);
});

test("rule, voice and registry changes still ship", () => {
  for (const p of [
    "marketing/ads/RULES.md",
    "marketing/ads/registry.json",
    "marketing/ads/voice/voice.md",
    "marketing/ads/scripts/ad-01.md",
    "CLAUDE.md"
  ]) {
    assert.equal(onlyMachineFoldersChanged([p]), false, p);
  }
});

test("folder-name look-alikes and traversal do not count", () => {
  assert.equal(isMachinePath("marketing/ads/scripts/machine-old/x.md"), false);
  assert.equal(isMachinePath("marketing/ads/ideas.md"), false);
  assert.equal(isMachinePath("marketing/brainstorm/x.md"), false);
  assert.equal(isMachinePath("marketing/brain/../../src/x.mjs"), false);
  assert.equal(isMachinePath("ops/ship-log.md.bak"), false);
});

test("leading ./ and backslashes are tolerated", () => {
  assert.equal(isMachinePath("./marketing/ads/ideas/a.md"), true);
  assert.equal(isMachinePath("marketing\\ads\\videos\\a.json"), true);
});
