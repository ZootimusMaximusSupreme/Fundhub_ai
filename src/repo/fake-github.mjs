// An in-memory stand-in for the slice of the GitHub REST API the outbox uses.
// For tests only. It is handed to the client as `fetchImpl`, so no test ever
// reaches the real GitHub.
//
// It enforces the one rule the outbox leans on: PATCH /git/refs/heads/<branch>
// with force:false answers 422 "Update is not a fast forward" unless the new
// commit's parent is the current head.

import { createHash } from "node:crypto";

const OWNER_REPO = "acme/site";

export function makeFakeGithub({ files = {}, branch = "main" } = {}) {
  let n = 0;
  const commits = [];            // newest last: { sha, message, parent, tree, files(snapshot) }
  const trees = new Map();       // tree sha -> { base, files }
  const pending = new Map();     // commit sha -> { message, tree, parent, author }
  const calls = [];
  const hooks = { beforePatch: null, failNext: [] };

  const snapshot = (f) => ({ ...f });
  const root = { sha: "c0", message: "initial", parent: null, tree: "t0", files: snapshot(files) };
  commits.push(root);
  const head = () => commits[commits.length - 1];

  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const text = (status, body) => new Response(body, { status, headers: { "content-type": "text/plain" } });

  /** Land a commit made by "someone else" (a person pushing to main). */
  function pushExternal(changes, message = "someone else pushed") {
    const sha = `c${++n}x`;
    commits.push({ sha, message, parent: head().sha, tree: `t${sha}`, files: { ...head().files, ...changes } });
    return sha;
  }

  async function handle(url, init = {}) {
    const method = init.method || "GET";
    const u = new URL(url);
    const prefix = `/repos/${OWNER_REPO}`;
    if (!u.pathname.startsWith(prefix)) return json(404, { message: "Not Found" });
    const route = decodeURIComponent(u.pathname.slice(prefix.length));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, route, body, headers: init.headers, search: u.search });

    const forced = hooks.failNext.findIndex((f) => f.method === method && route.startsWith(f.route));
    if (forced >= 0) {
      const f = hooks.failNext[forced];
      if (!f.keep) hooks.failNext.splice(forced, 1);
      return new Response(JSON.stringify({ message: f.message || "forced failure" }), {
        status: f.status, headers: { "content-type": "application/json", ...(f.headers || {}) }
      });
    }

    if (method === "GET" && route === `/git/ref/heads/${branch}`) {
      return json(200, { object: { sha: head().sha } });
    }
    let m;
    if (method === "GET" && (m = /^\/git\/commits\/(.+)$/.exec(route))) {
      const c = commits.find((x) => x.sha === m[1]);
      return c ? json(200, { sha: c.sha, tree: { sha: c.tree } }) : json(404, { message: "Not Found" });
    }
    if (method === "GET" && route === "/commits") {
      const per = Number(u.searchParams.get("per_page") || 30);
      return json(200, [...commits].reverse().slice(0, per).map((c) => ({ sha: c.sha, commit: { message: c.message } })));
    }
    if (method === "GET" && (m = /^\/contents\/(.+)$/.exec(route))) {
      const ref = u.searchParams.get("ref");
      const c = commits.find((x) => x.sha === ref) || head();
      if (!Object.prototype.hasOwnProperty.call(c.files, m[1])) return json(404, { message: "Not Found" });
      const etag = `"${createHash("sha1").update(c.files[m[1]]).digest("hex")}"`;
      const sent = init.headers?.["If-None-Match"];
      if (sent && sent === etag) return new Response(null, { status: 304, headers: { etag } });
      return new Response(c.files[m[1]], { status: 200, headers: { "content-type": "text/plain", etag } });
    }
    if (method === "POST" && route === "/git/trees") {
      const sha = `tree${++n}`;
      trees.set(sha, { base: body.base_tree, files: Object.fromEntries(body.tree.map((t) => [t.path, t.content])) });
      return json(201, { sha });
    }
    if (method === "POST" && route === "/git/commits") {
      const sha = `c${++n}`;
      pending.set(sha, body);
      return json(201, { sha });
    }
    if (method === "PATCH" && route === `/git/refs/heads/${branch}`) {
      if (hooks.beforePatch) hooks.beforePatch();
      const c = pending.get(body.sha);
      if (!c) return json(422, { message: "Object does not exist" });
      if (body.force !== false) return json(500, { message: "the outbox must never force" });
      if (c.parents[0] !== head().sha) return json(422, { message: "Update is not a fast forward" });
      commits.push({
        sha: body.sha, message: c.message, parent: c.parents[0], tree: c.tree,
        author: c.author, committer: c.committer,
        files: { ...head().files, ...trees.get(c.tree).files }
      });
      return json(200, { ref: `refs/heads/${branch}`, object: { sha: body.sha } });
    }
    return json(404, { message: `fake github: no route for ${method} ${route}` });
  }

  return { fetchImpl: handle, calls, commits, head, hooks, pushExternal, pending };
}

/** Env that opens the ADAPTERS fence and points the client at the fake. */
export const FAKE_ENV = Object.freeze({
  ADAPTERS_DRY_RUN: "off",
  GITHUB_REPO: OWNER_REPO,
  GITHUB_REPO_TOKEN: "test-token-not-real",
  GITHUB_BRANCH: "main"
});
