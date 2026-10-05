// Reads from the repo (spec M0 step 2, "Reads").
//
//   * Through the Contents API with an ETag. The last body and ETag per
//     (repo, ref, path) are kept in memory; the next read sends If-None-Match and
//     a 304 returns the cached copy.
//   * A batch pins the rules at ONE commit SHA: pinRepoFiles() reads the branch
//     head once, then reads every file at that SHA, so a batch never mixes two
//     versions of the rules.
//   * If GitHub cannot be reached (no config, fence closed, network, 5xx, rate
//     limit), the copy bundled with the function is used instead. Those paths
//     are in the global `included_files` in netlify.toml.
//
// Reads are allow-listed like writes: the app only ever reads marketing paths.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertAllowedPath } from "./allow-list.mjs";
import { getRef, readFile } from "./github.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const cache = new Map(); // `${repo}@${ref}:${path}` -> { etag, text }
export const _clearReadCache = () => cache.clear();

/** One file at a ref, with the ETag cache. { ok, text, cached } or { ok:false, ... }. */
export async function readRepoFile(cfg, filePath, ref) {
  const clean = assertAllowedPath(filePath);
  const key = `${cfg.repo}@${ref || cfg.branch}:${clean}`;
  const hit = cache.get(key);
  const res = await readFile(cfg, clean, ref, { etag: hit?.etag });
  if (res.ok && res.notModified && hit) return { ok: true, text: hit.text, cached: true };
  if (res.ok && res.notModified) return { ok: false, status: 304, error: "304 with nothing cached" };
  if (!res.ok) return res;
  if (res.etag && res.text !== null) cache.set(key, { etag: res.etag, text: res.text });
  return { ok: true, text: res.text, cached: false };
}

/** The copy shipped with the function. null when the file is not bundled. */
export function readBundled(filePath, root = ROOT) {
  const clean = assertAllowedPath(filePath);
  try { return fs.readFileSync(path.join(root, clean), "utf8"); } catch { return null; }
}

/**
 * Read several files pinned at one commit SHA.
 * @returns { source: 'github'|'bundled', sha: string|null, files: Map<path, string|null>, reason? }
 */
export async function pinRepoFiles(cfg, paths, { root } = {}) {
  const clean = paths.map((p) => assertAllowedPath(p));
  const head = await getRef(cfg);
  if (head.ok) {
    const files = new Map();
    let failure = null;
    for (const p of clean) {
      const r = await readRepoFile(cfg, p, head.sha);
      if (!r.ok) { failure = r; break; }
      files.set(p, r.text);
    }
    if (!failure) return { source: "github", sha: head.sha, files };
    return bundled(clean, root, failure.error);
  }
  return bundled(clean, root, head.error);
}

function bundled(clean, root, reason) {
  return {
    source: "bundled",
    sha: null,
    reason: reason || "GitHub could not be reached",
    files: new Map(clean.map((p) => [p, readBundled(p, root)]))
  };
}
