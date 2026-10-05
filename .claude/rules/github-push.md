# GitHub is the remote

**Owner law (2026-10-05):** "We quit gitlabs." The repo lives on **GitHub**. GitLab is retired. Chris is deleting the GitLab project.

## Where

- **Repo:** https://github.com/ZootimusMaximusSupreme/Fundhub_ai
- **Remote name:** `origin`

## How to push

- One branch: `git push -u origin <branch>`
- Every local branch and tag (the Mac backup): `node scripts/github-push-whole-repo.mjs`

The script never forces. It names any branch GitHub rejects, and it removes any GitLab remote.

## History note

GitHub's history was rewritten on 2026-10-04 (same files, new commit ids). All GitLab branches were moved onto it on 2026-10-05 with identical files. A checkout made from GitLab is on the old history: if `main` is rejected as non-fast-forward, re-clone from GitHub.

## Visibility

The repo's visibility is Chris's call (owner-set 2026-10-05). Do not raise it.

## Never

- Add a GitLab remote or push to gitlab.com
- Force-push to GitHub
- Print or commit a token
