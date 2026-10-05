// scripts/ship-changes.mjs — the "only machine folders changed" decision for scripts/ship.mjs.
// Pure: no git, no disk. ship.mjs hands it the changed paths and acts on the answer.
//
// The marketing machine saves scripts, ideas, videos, brain notes and page requests back to
// the repo all day. Those commits change nothing on the live site, so they must not cost a
// Netlify deploy. Rule, voice and registry files live elsewhere and still ship.

export const MACHINE_FOLDERS = [
  "marketing/ads/scripts/machine/",
  "marketing/ads/ideas/",
  "marketing/ads/videos/",
  "marketing/brain/",
  "ops/page-requests/"
];

// The ship log is written by ship itself, so it never counts as a change either.
export const IGNORED_FILES = ["ops/ship-log.md"];

function clean(p) {
  return String(p ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isMachinePath(p) {
  const f = clean(p);
  if (!f || f.split("/").includes("..")) return false;
  return IGNORED_FILES.includes(f) || MACHINE_FOLDERS.some((d) => f.startsWith(d));
}

// The git call that lists what changed since the last ship. --no-renames matters: with
// rename detection a move from src/foo.mjs to marketing/brain/foo.mjs lists only the new
// path, which would hide the deleted code path and wrongly read as "nothing to ship".
export function changedPathsArgs(prev, head = "HEAD") {
  return ["diff", "--name-only", "--no-renames", prev, head];
}

// Parses `git diff --name-only` output into a path list.
export function parseChangedPaths(out) {
  return String(out ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}

// True when every changed path is inside a machine folder (or is the ship log), which
// includes the case of no changed paths at all. One path outside them means ship.
export function onlyMachineFoldersChanged(paths) {
  return (paths || []).map(clean).filter(Boolean).every(isMachinePath);
}
