#!/usr/bin/env node
/**
 * Push the full local repo (all branches + tags) to GitLab.
 *
 * Env (gitignored .env):
 *   GITLAB_TOKEN — personal/project access token OR group/project deploy token
 *   GITLAB_DEPLOY_USERNAME — when set, use deploy-token HTTPS auth (not oauth2)
 *   GITLAB_PROJECT — optional, default fundhub-llc-group/fundhub-llc-project
 *
 * Never prints the token.
 */
import { loadEnv } from "./load-env.mjs";
import { spawnSync } from "node:child_process";

loadEnv();

const deployUser = String(process.env.GITLAB_DEPLOY_USERNAME ?? "").trim();
const token = String(process.env.GITLAB_TOKEN ?? "").trim();
let project = String(
  process.env.GITLAB_PROJECT ?? "fundhub-llc-group/fundhub-llc-project"
).trim();

if (!token) {
  console.error("GITLAB_TOKEN missing — add a GitLab token or deploy token to .env");
  console.error("Personal: https://gitlab.com/-/user_settings/personal_access_tokens");
  console.error("Deploy: group/project Settings → Repository → Deploy tokens");
  process.exit(1);
}

/** Deploy-token HTTPS auth only when username is set and token is not an access token (glpat-/glptt-/glgrt-). */
const isAccessToken = /^(glpat-|glptt-|glgrt-)/.test(token);
const isDeployToken = Boolean(deployUser) && !isAccessToken;

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").trim();
    throw new Error(`${cmd} failed (${res.status}): ${err.slice(0, 500)}`);
  }
  return (res.stdout || "").trim();
}

function gitlabFetch(path, { method = "GET" } = {}) {
  const url = `https://gitlab.com/api/v4${path}`;
  const args = ["-sS", "-w", "\n%{http_code}"];
  if (method !== "GET") args.push("-X", method);
  if (isDeployToken) args.push("-u", `${deployUser}:${token}`);
  else args.push("-H", `PRIVATE-TOKEN: ${token}`);
  args.push(url);
  const res = spawnSync("/usr/bin/curl", args, { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`GitLab API request failed: ${(res.stderr || "").slice(0, 300)}`);
  }
  const raw = (res.stdout || "").trim();
  const lastNl = raw.lastIndexOf("\n");
  const body = lastNl >= 0 ? raw.slice(0, lastNl) : raw;
  const code = lastNl >= 0 ? raw.slice(lastNl + 1).trim() : "000";
  return { body, code: Number(code) };
}

function tryProject(pathWithNamespace) {
  const enc = encodeURIComponent(pathWithNamespace);
  const { body, code } = gitlabFetch(`/projects/${enc}`);
  if (code !== 200) return null;
  try {
    const parsed = JSON.parse(body);
    if (parsed?.path_with_namespace) return parsed.path_with_namespace;
  } catch {
    return null;
  }
  return null;
}

function deployTokenCanAccess(projectPath) {
  const url = remoteUrlFor(projectPath);
  const res = spawnSync("git", ["ls-remote", url, "HEAD"], { encoding: "utf8" });
  return res.status === 0;
}

function resolveProject() {
  const candidates = [
    project,
    "fundhub-llc-group/fundhub-llc-project",
    "fundhub-llc-group/fundhub-platform",
    "fundhub-llc-group/fundhub"
  ].filter((p, i, a) => p && a.indexOf(p) === i);

  if (isDeployToken) {
    for (const candidate of candidates) {
      if (deployTokenCanAccess(candidate)) return candidate;
    }
    throw new Error(
      "Deploy token could not access any candidate project under fundhub-llc-group — check GITLAB_PROJECT and read_repository scope"
    );
  }

  for (const candidate of candidates) {
    const resolved = tryProject(candidate);
    if (resolved) return resolved;
  }

  for (const candidate of candidates) {
    if (deployTokenCanAccess(candidate)) return candidate;
  }

  const { body, code } = gitlabFetch("/user");
  if (code !== 200) {
    let msg = "GitLab token rejected";
    try {
      const parsed = JSON.parse(body);
      if (parsed.message) msg = parsed.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const who = JSON.parse(body);
  if (!who.username) throw new Error("GitLab token rejected");
  throw new Error(
    `Authenticated as ${who.username} but project ${project} was not found — set GITLAB_PROJECT`
  );
}

function remoteUrlFor(projectPath) {
  if (isDeployToken) {
    return `https://${encodeURIComponent(deployUser)}:${encodeURIComponent(token)}@gitlab.com/${projectPath}.git`;
  }
  return `https://oauth2:${encodeURIComponent(token)}@gitlab.com/${projectPath}.git`;
}

try {
  project = resolveProject();
  const remoteUrl = remoteUrlFor(project);

  let pushAs;
  if (isDeployToken) {
    pushAs = `deploy token ${deployUser}`;
  } else {
    const { body, code } = gitlabFetch("/user");
    if (code === 200) {
      const who = JSON.parse(body);
      if (!who.username) throw new Error("GitLab token rejected");
      pushAs = who.username;
    } else {
      pushAs = "personal access token (repository scopes)";
    }
  }

  const publicRemote = `https://gitlab.com/${project}.git`;
  const existing = run("git", ["remote"]);
  if (!existing.split("\n").includes("gitlab")) {
    run("git", ["remote", "add", "gitlab", publicRemote]);
    console.log("added remote gitlab");
  } else {
    run("git", ["remote", "set-url", "gitlab", publicRemote]);
    console.log("updated remote gitlab");
  }

  console.log(`pushing as ${pushAs} to ${project} ...`);

  const dryRun = spawnSync("git", ["push", "--dry-run", remoteUrl, "main"], {
    encoding: "utf8",
  });
  const dryText = `${dryRun.stderr || ""}${dryRun.stdout || ""}`;
  if (dryRun.status !== 0 && /not allowed to upload code|403|401/i.test(dryText)) {
    if (isDeployToken && /not allowed to upload code/i.test(dryText)) {
      throw new Error(
        "GitLab rejected push — deploy tokens are read-only for Git (read_repository only). " +
          "They cannot push branches; there is no write_repository checkbox on deploy tokens. " +
          "Use a personal access token or project/group access token with write_repository: " +
          "https://gitlab.com/-/user_settings/personal_access_tokens — put the token in GITLAB_TOKEN, remove GITLAB_DEPLOY_USERNAME from .env, re-run. " +
          `Project access token (alternative): https://gitlab.com/${project}/-/settings/access_tokens`
      );
    }
    throw new Error(
      "GitLab rejected push — token needs write_repository (personal, project, or group access token). " +
        "https://gitlab.com/-/user_settings/personal_access_tokens — update GITLAB_TOKEN in .env, then re-run."
    );
  }

  const branches = run("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);
  const branchCount = branches.length;

  /** Never `git push -u <auth-url>` — Git stores that URL in branch.*.remote. */
  run("git", ["push", remoteUrl, "main", "--force-with-lease"], { stdio: "inherit" });
  run("git", ["push", remoteUrl, "--tags"], { stdio: "inherit" });

  for (const branch of branches) {
    if (branch === "main") continue;
    run("git", ["push", remoteUrl, branch], { stdio: "inherit" });
  }

  for (const branch of branches) {
    const tip = run("git", ["rev-parse", branch]);
    run("git", ["update-ref", `refs/remotes/gitlab/${branch}`, tip]);
    run("git", ["branch", "--set-upstream-to", `gitlab/${branch}`, branch]);
  }

  const localMain = run("git", ["rev-parse", "main"]);
  const mainCheck = gitlabFetch(
    `/projects/${encodeURIComponent(project)}/repository/branches/main`
  );
  if (mainCheck.code !== 200) {
    throw new Error(`GitLab main check failed (HTTP ${mainCheck.code})`);
  }
  const remoteMain = JSON.parse(mainCheck.body)?.commit?.id;
  if (remoteMain !== localMain) {
    throw new Error("GitLab main does not match this machine after push");
  }
  console.log(`main matches GitLab ${localMain}`);

  const remoteLines = run("git", ["remote", "-v"]).split("\n");
  const githubRemotes = new Set();
  for (const line of remoteLines) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((?:fetch|push)\)$/);
    if (match && /github\.com/i.test(match[2])) githubRemotes.add(match[1]);
  }
  for (const name of githubRemotes) {
    run("git", ["remote", "remove", name]);
    console.log(`removed GitHub remote ${name}`);
  }

  console.log(`done — ${branchCount} branch(es) and tags on GitLab (${project})`);
} catch (err) {
  console.error(String(err.message || err));
  process.exit(1);
}
