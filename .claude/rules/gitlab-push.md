# GitLab backup push

Fundhub’s full git mirror lives on **GitLab**. **GitHub is banned.** Do not add a GitHub remote. Do not push, fetch, or open a pull request on github.com.

## Group and project

- **Group:** `fundhub-llc-group`
- **Project:** `fundhub-llc-project` (path `fundhub-llc-group/fundhub-llc-project`)
- **Web:** https://gitlab.com/fundhub-llc-group/fundhub-llc-project

## How to push

From repo root:

```bash
node scripts/gitlab-push-whole-repo.mjs
```

The script adds or updates remote **`gitlab`**, pushes **`main`** (`--force-with-lease`), all other local branches, and all tags.

## Credentials (names only — values in gitignored `.env`)

| Variable | Purpose |
|---|---|
| `GITLAB_DEPLOY_USERNAME` | **Read-only deploy token** username — clone/fetch/ls-remote only; **do not use for backup push** |
| `GITLAB_TOKEN` | **Push:** personal, project, or group **access token** with `write_repository`. **Read-only deploy token** goes here only if you are not pushing. |
| `GITLAB_PROJECT` | Optional; default `fundhub-llc-group/fundhub-llc-project` |

### Push (full repo backup)

GitLab **deploy tokens** support `read_repository`, registry, and package scopes only. **`write_repository` exists on access tokens, not deploy tokens.** A deploy token can pass `git ls-remote` and still get 403 “You are not allowed to upload code” on push — that is expected.

1. Create a token with **`write_repository`**:
   - **Personal:** https://gitlab.com/-/user_settings/personal_access_tokens
   - **Project:** https://gitlab.com/fundhub-llc-group/fundhub-llc-project/-/settings/access_tokens (Maintainer+)
   - **Group:** https://gitlab.com/groups/fundhub-llc-group/-/settings/access_tokens (Owner)
2. Put the token in `GITLAB_TOKEN`.
3. **Remove or leave empty `GITLAB_DEPLOY_USERNAME`** from `.env` so the script uses `oauth2:TOKEN@` HTTPS auth.
4. Re-run `node scripts/gitlab-push-whole-repo.mjs`.

### Read-only deploy token (optional)

For CI clone/pull only: group or project **Settings → Repository → Deploy tokens** with **`read_repository`**. Set `GITLAB_DEPLOY_USERNAME` + `GITLAB_TOKEN`. Do not expect push to work.

**`read_registry` / `write_registry` / package scopes do not grant Git push** — those are container registry and package registry only.

### SSH alternative

Read-write **deploy key** on the project (SSH, not HTTP) can push if branch protection allows it. The backup script uses HTTPS + access tokens by default.

Never commit `.env`. Never put token values in tracked files, boards, or chat logs unless Chris explicitly asks in dictator mode.

## Claude Code Cloud (claude.ai/code)

GitLab credentials for **cloud sessions** live in a **cloud environment**, not in account Settings, Connectors, or Anthropic API keys.

### Wrong places (do not use for `GITLAB_TOKEN`)

| Place | Why it is wrong |
|---|---|
| **Settings → Claude Code** (fonts, PR prefix, authorization tokens) | Terminal / desktop Claude Code prefs — not cloud VM env |
| **Connectors → Add custom connector** (MCP server URL) | MCP endpoints are not GitLab; no `GITLAB_TOKEN` there |
| **Anthropic API keys** (`sk-ant-…`) | Keys that **call Claude** — not GitLab `glpat-…` tokens |

Do not create a new `sk-ant` key for GitLab backup.

### Correct place (only)

1. Open **[https://claude.ai/code](https://claude.ai/code)** (Welcome / sessions page — not `claude.ai/settings`).
2. At the **bottom of the prompt box**, click **`Default`** (cloud icon, left of “Select repository…”).
3. **Add cloud environment** or hover **fundhub-gitlab** (or **Default**) → settings (gear) → **Edit cloud environment**.
4. **Environment variables** (`.env` format, one per line):

   ```text
   GITLAB_TOKEN=<glpat- from gitignored .env — write_repository>
   GITLAB_PROJECT=fundhub-llc-group/fundhub-llc-project
   ```

   On Pro/Max, prefer an **API credential** for `gitlab.com` instead of a plain env var if you want the key hidden from the VM (Bearer token on `gitlab.com` / `*.gitlab.com`).

5. **Network access:** **Trusted** is enough — Anthropic’s default allowlist already includes `gitlab.com`, `www.gitlab.com`, and `registry.gitlab.com` ([cloud environments doc](https://code.claude.com/docs/en/cloud-environments#default-allowed-domains)). Use **Custom** and add `gitlab.com` only if you switched away from Trusted defaults.

6. Save. Pick **fundhub-gitlab** in the selector before starting a session that needs GitLab.

There is **no** separate settings URL for this dialog — only the **Default / environment** control on `claude.ai/code`.

### What Cloud can and cannot do with GitLab

| Capability | GitLab |
|---|---|
| `git ls-remote` / fetch from GitLab in a cloud VM | **Yes**, if `GITLAB_TOKEN` (or API credential) + network reach `gitlab.com` |
| Attach GitLab as the session repo (clone like GitHub) | **No** — [platform restriction](https://code.claude.com/docs/en/claude-code-on-the-web#platform-restrictions): cloning and MR/PR flows are **GitHub-first** |
| Upload local repo as bundle (`CCR_FORCE_BUNDLE=1` / no GitHub remote) | **Yes** for GitLab checkouts |
| Push session results **back to GitLab** | **No** — same doc: bundled non-GitHub repos **cannot push results back** to that remote |
| Full-repo backup push | Use **`node scripts/gitlab-push-whole-repo.mjs`** on the Mac — not Claude Code Cloud |

## Revoke old tokens

After a working push, revoke unused deploy tokens that were only for backup attempts (e.g. **`gitlab+deploy-token-16071329`**, **`gitlab+deploy-token-16071397`**) in group or project **Deploy tokens** UI.

## Do not

- Push, fetch, or clone via github.com. GitHub is banned. The push script removes any remote whose URL contains `github.com`
- Tell Chris to enable **write_repository** on a **deploy token** — that scope is not offered
- Print or commit `GITLAB_TOKEN`
