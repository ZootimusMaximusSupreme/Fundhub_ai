import test from "node:test";
import assert from "node:assert/strict";
import { onlyMachineFoldersChanged, changedPathsArgs, parseChangedPaths } from "./ship-changes.mjs";

test("the changed-paths git call turns rename detection off", () => {
  const args = changedPathsArgs("abc123");
  assert.ok(args.includes("--no-renames"));
  assert.deepEqual(args, ["diff", "--name-only", "--no-renames", "abc123", "HEAD"]);
});

test("a rename out of real code still counts as a change", () => {
  // With --no-renames git lists both the old and the new path.
  const listed = parseChangedPaths("marketing/brain/foo.mjs\nsrc/foo.mjs\n");
  assert.equal(onlyMachineFoldersChanged(listed), false);
  // What default rename detection listed: the machine path alone. That was the bug.
  assert.equal(onlyMachineFoldersChanged(parseChangedPaths("marketing/brain/foo.mjs\n")), true);
});
