// Which repo paths the app may write (spec M0 step 2, "The allow-list").
//
// Every path is normalized first, then refused unless it sits under one of the
// folders below or is exactly one of the listed files. The GitHub token can
// reach the whole repository; this list is what stops code from using it that
// way. A path that climbs out with `..`, starts with `/`, uses backslashes or
// touches `.git` is refused before the list is even consulted.

import path from "node:path";

export const ALLOWED_PREFIXES = Object.freeze([
  "marketing/ads/scripts/machine/",
  "marketing/ads/ideas/",
  "marketing/ads/videos/",
  "marketing/offers/",
  "marketing/flywheel/",
  "ops/avatar-requests/",
  "marketing/brain/",
  "ops/page-requests/"
]);

export const ALLOWED_FILES = Object.freeze([
  "marketing/ads/RULES.md",
  "marketing/ads/VOICE.md",
  "marketing/ads/banned-live.json",
  "marketing/ads/registry.json",
  "marketing/ads/angles.json"
]);

export class PathRefused extends Error {
  constructor(message) { super(message); this.name = "PathRefused"; }
}

/** The normalized path, or null when it cannot be one. */
export function normalizeRepoPath(input) {
  /* Control characters (NUL, tab, newline, CR, DEL, ...) are refused: a newline in
     a path would land in the commit body and could forge an `Outbox:` trailer. */
  if (typeof input !== "string" || input === "" || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(input) || input.includes("\\")) return null;
  if (input.startsWith("/") || /^[A-Za-z]:/.test(input)) return null;
  const n = path.posix.normalize(input);
  if (n === "." || n === ".." || n.startsWith("../") || n.startsWith("/") || n.endsWith("/")) return null;
  if (n.split("/").some((seg) => seg === "" || seg === "." || seg === ".." || seg.toLowerCase() === ".git")) return null;
  return n;
}

/** Returns the normalized path when allowed; throws PathRefused otherwise. */
export function assertAllowedPath(input) {
  const n = normalizeRepoPath(input);
  if (!n) throw new PathRefused(`repo path refused (not a plain relative path): ${JSON.stringify(String(input).slice(0, 120))}`);
  if (ALLOWED_FILES.includes(n)) return n;
  if (ALLOWED_PREFIXES.some((p) => n.startsWith(p) && n.length > p.length)) return n;
  throw new PathRefused(`repo path refused (outside the marketing folders): ${n}`);
}

export function isAllowedPath(input) {
  try { assertAllowedPath(input); return true; } catch { return false; }
}
