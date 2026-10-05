#!/usr/bin/env node
/**
 * Push the full local repo (every branch + every tag) to GitHub.
 *
 * GitHub is the remote (owner-set 2026-10-05, "we quit gitlabs").
 * Remote `origin` = https://github.com/ZootimusMaximusSupreme/Fundhub_ai
 *
 * Never forces. A branch GitHub rejects is named and skipped, not overwritten.
 * Auth is whatever git already uses for github.com (credential helper, gh, or the
 * cloud proxy). No token is read or printed here.
 */
import { spawnSync } from "node:child_process";

const ORIGIN = "https://github.com/ZootimusMaximusSupreme/Fundhub_ai";

function git(args, opts = {}) {
  return spawnSync("git", args, { encoding: "utf8", ...opts });
}

function out(args) {
  const res = git(args);
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(res.stderr || res.stdout || "").trim().slice(0, 300)}`);
  }
  return (res.stdout || "").trim();
}

try {
  const remotes = out(["remote", "-v"]).split("\n").filter(Boolean);
  const urls = new Map();
  for (const line of remotes) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\((?:fetch|push)\)$/);
    if (m) urls.set(m[1], m[2]);
  }

  if (!urls.has("origin")) {
    out(["remote", "add", "origin", ORIGIN]);
    console.log("added remote origin");
  } else if (!/github\.com[:/]ZootimusMaximusSupreme\/Fundhub_ai/i.test(urls.get("origin"))) {
    throw new Error(`origin points at ${urls.get("origin")} — expected ${ORIGIN}. Fix origin, then re-run.`);
  }

  for (const [name, url] of urls) {
    if (/gitlab\.com/i.test(url)) {
      out(["remote", "remove", name]);
      console.log(`removed GitLab remote ${name}`);
    }
  }

  const branches = out(["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);

  const rejected = [];
  for (const branch of branches) {
    const res = git(["push", "-u", "origin", branch], { stdio: ["ignore", "inherit", "pipe"] });
    if (res.status !== 0) rejected.push(`${branch}: ${(res.stderr || "").trim().split("\n").pop()}`);
  }

  const tags = git(["push", "origin", "--tags"], { stdio: ["ignore", "inherit", "pipe"] });
  if (tags.status !== 0) rejected.push(`tags: ${(tags.stderr || "").trim().split("\n").pop()}`);

  console.log(`done — ${branches.length - rejected.filter((r) => !r.startsWith("tags:")).length} of ${branches.length} branch(es) on GitHub`);
  if (rejected.length) {
    console.error("not pushed:");
    for (const r of rejected) console.error(`  ${r}`);
    console.error(
      "A non-fast-forward on main means this checkout is on the old GitLab history. " +
        "GitHub's history was rewritten 2026-10-04 (same files, new commit ids). " +
        "Re-clone from GitHub. Never force-push."
    );
    process.exit(1);
  }
} catch (err) {
  console.error(String(err.message || err));
  process.exit(1);
}
