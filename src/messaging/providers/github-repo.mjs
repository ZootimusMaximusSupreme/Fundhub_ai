// GitHub repo client — the one place the marketing machine talks to GitHub.
//
// Spec: docs/specs/marketing-machine-2026-10-04.md, M0 step 2 ("Repo saves
// through an outbox") and §4 trap 7. CLAUDE.md §12: outbound transmission lives
// in src/messaging/providers/* and nowhere else. Every request here goes through
// transmit() in src/lib/outbound-fetch.mjs under the ADAPTERS fence, so with
// ADAPTERS_DRY_RUN unset or not an off value nothing leaves and every call comes
// back `blocked`.
//
// This file only SPEAKS to GitHub (read a ref, read a file, make a tree, a
// commit, move the branch). What may be written, and the retry rules, live in
// src/repo/outbox.mjs. src/repo/github.mjs re-exports these helpers.
//
// Config (names only; values live in the environment):
//   GITHUB_REPO        "owner/name"
//   GITHUB_BRANCH      branch to commit to, default "main"
//   GITHUB_REPO_TOKEN  fine-grained token for that one repository. Never logged.
//
// NEVER THROWS. Every function returns { ok, status, ..., error? }. A transport
// failure or a fence hold comes back ok:false; the caller classifies.

import { transmit, ADAPTERS, redact } from "../../lib/outbound-fetch.mjs";

export const PROVIDER = "github-repo";
/* Declared so src/lib/no-unfenced-transmit.test.mjs checks that this file goes
   through the chokepoint. */
export const TRANSMITS = true;

export const API_ROOT = "https://api.github.com";
export const DEFAULT_BRANCH = "main";
export const TIMEOUT_MS = 15_000;
export const COMMIT_AUTHOR = Object.freeze({ name: "Fundhub app", email: "app@fundhub.ai" });

/** Read the three env names into one config object. `configured` is true only when the repo name and token are usable. */
export function repoConfig(env = process.env, extra = {}) {
  const repo = String(env?.GITHUB_REPO ?? "").trim();
  const token = String(env?.GITHUB_REPO_TOKEN ?? "").trim();
  const branch = String(env?.GITHUB_BRANCH ?? "").trim() || DEFAULT_BRANCH;
  const okRepo = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
  return {
    repo, branch, token, env,
    fetchImpl: extra.fetchImpl,
    configured: Boolean(okRepo && token)
  };
}

function pathEncode(p) {
  return String(p).split("/").map(encodeURIComponent).join("/");
}

async function call(cfg, method, route, { body, raw = false, what } = {}) {
  if (!cfg || !cfg.configured) {
    return { ok: false, blocked: false, status: 0, body: null,
      error: "GitHub repo not configured (GITHUB_REPO and GITHUB_REPO_TOKEN)" };
  }
  const headers = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "fundhub-app"
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return transmit(`${API_ROOT}/repos/${cfg.repo}${route}`, init, {
    fence: ADAPTERS,
    what: what || `github ${method} ${route.split("?")[0]}`,
    env: cfg.env,
    fetchImpl: cfg.fetchImpl,
    timeoutMs: TIMEOUT_MS,
    asText: raw
  });
}

const fail = (res, extra = {}) => ({
  ok: false,
  blocked: Boolean(res.blocked),
  status: res.status,
  error: redact(
    (res.body && typeof res.body === "object" && res.body.message) || res.error || `HTTP ${res.status}`
  ),
  ...extra
});

/** The branch's head commit sha. */
export async function getRef(cfg) {
  const res = await call(cfg, "GET", `/git/ref/heads/${pathEncode(cfg.branch)}`);
  const sha = res.body?.object?.sha;
  if (!res.ok || !sha) return fail(res);
  return { ok: true, status: res.status, sha };
}

/** The tree sha of a commit. */
export async function getCommit(cfg, sha) {
  const res = await call(cfg, "GET", `/git/commits/${encodeURIComponent(sha)}`);
  const tree = res.body?.tree?.sha;
  if (!res.ok || !tree) return fail(res);
  return { ok: true, status: res.status, tree };
}

/** A file's text at a ref. A missing file is { ok: true, text: null }. */
export async function readFile(cfg, path, ref) {
  const res = await call(cfg, "GET",
    `/contents/${pathEncode(path)}?ref=${encodeURIComponent(ref || cfg.branch)}`, { raw: true });
  if (res.status === 404) return { ok: true, status: 404, text: null };
  if (!res.ok) return fail(res);
  return { ok: true, status: res.status, text: typeof res.body === "string" ? res.body : "" };
}

/** The newest commits on the branch, as { sha, message }. */
export async function recentCommits(cfg, count = 20) {
  const res = await call(cfg, "GET",
    `/commits?sha=${encodeURIComponent(cfg.branch)}&per_page=${Math.min(100, Math.max(1, count))}`);
  if (!res.ok || !Array.isArray(res.body)) return fail(res);
  return {
    ok: true, status: res.status,
    commits: res.body.map((c) => ({ sha: c.sha, message: String(c.commit?.message ?? "") }))
  };
}

/** Make a tree on top of `baseTree` with each file's content inline. files: [{ path, content }] */
export async function createTree(cfg, baseTree, files) {
  const res = await call(cfg, "POST", "/git/trees", {
    body: {
      base_tree: baseTree,
      tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content }))
    }
  });
  const sha = res.body?.sha;
  if (!res.ok || !sha) return fail(res);
  return { ok: true, status: res.status, sha };
}

export async function createCommit(cfg, { message, tree, parent, author = COMMIT_AUTHOR, date }) {
  const stamp = { name: author.name, email: author.email, date: date || new Date().toISOString() };
  const res = await call(cfg, "POST", "/git/commits", {
    body: { message, tree, parents: [parent], author: stamp, committer: stamp }
  });
  const sha = res.body?.sha;
  if (!res.ok || !sha) return fail(res);
  return { ok: true, status: res.status, sha };
}

/** Move the branch to `sha`. Never forces. A 409, or a 422 saying "not a fast forward", means someone else committed first. */
export async function updateRef(cfg, sha) {
  const res = await call(cfg, "PATCH", `/git/refs/heads/${pathEncode(cfg.branch)}`, {
    body: { sha, force: false }
  });
  if (res.ok) return { ok: true, status: res.status };
  const message = (res.body && typeof res.body === "object" && res.body.message) || res.error || "";
  const notFastForward = res.status === 409 ||
    (res.status === 422 && /fast[\s-]?forward/i.test(String(message)));
  return fail(res, { notFastForward });
}
