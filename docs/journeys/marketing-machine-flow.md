# marketing-machine: actual

What the code does today, drawn from the code. The intended journey is `marketing-machine-intended.md` (Chris's, not edited here). Spec: `docs/specs/marketing-machine-2026-10-04.md`.

Parts are added as each build step lands. A step that is not built yet is marked `UNVERIFIED` or `NOT BUILT`.

## Repo saves through an outbox (M0 step 2)

Code: `src/repo/outbox.mjs`, `src/repo/allow-list.mjs`, `src/repo/edits.mjs`, `src/repo/github.mjs`, the client `src/messaging/providers/github-repo.mjs`, table `repo_outbox` (migration 406).

```mermaid
flowchart TD
    SAVE[A save: script, edit, rule change] --> TX[One database transaction]
    TX --> DB[Write the database change]
    TX --> ROW[enqueueRepoWrite: one repo_outbox row, same transaction]
    ROW --> ALLOW{Path on the allow-list after normalizing?}
    ALLOW -->|No| REFUSE[Refused. Nothing written, the save fails]
    ALLOW -->|Yes| WAIT[Row waits: replace = whole file, edit = the change itself]
    WAKE[Wake the worker: NOT BUILT, waits on M0 step 4] -.-> DRAIN
    CLOCK[Worker calls drainOutbox at most once a minute: NOT BUILT, waits on M0 step 4] -.-> DRAIN
    WAIT --> DRAIN[drainOutbox]
    DRAIN --> LOCK{pg_try_advisory_lock free?}
    LOCK -->|No| BUSY[Skip: another drain is running]
    LOCK -->|Yes| CLAIM[Claim waiting rows, oldest first]
    CLAIM --> CHECK{Row valid? path allowed, edit well formed}
    CHECK -->|No| STOPROW[Row gets an error, the rest go on]
    CHECK -->|Yes| REF[GET the branch ref]
    REF --> TRAIL{Row id already in an Outbox trailer of the last 20 commits?}
    TRAIL -->|Yes| DONE1[Mark committed with that commit, no new commit]
    TRAIL -->|No| BUILD[Read newest copy of shared files, apply edits in order]
    BUILD --> JSON{JSON parses, and registry.json passes parseRegistry?}
    JSON -->|No| STOPFILE[That file's rows get an error, other files go on]
    JSON -->|Yes| COMMIT[POST tree with base_tree, POST commit: app: ... Outbox: ids, skip ci]
    COMMIT --> PATCH[PATCH the ref with force false]
    PATCH -->|OK| DONE2[Mark rows committed_sha and committed_at]
    PATCH -->|409 or 422 not a fast forward| RETRY{Tried 3 times?}
    RETRY -->|No| REF
    RETRY -->|Yes| LATER[Release the rows, next drain tries again]
    PATCH -->|Any other 422 or 4xx| STOP[Rows get an error, shown on the health card, skipped until retryBlocked]
    REF -->|Network, 429, 5xx, or fence closed| LATER
```

Notes:
- The outbox never forces a push and holds no transaction open across a GitHub call.
- A row that has failed transiently 10 times gets an error instead of retrying forever.
- `outboxHealth()` returns the counts and the last error for the health card. The card itself is part of M0 step 4 and later. `UNVERIFIED` until then.
- The GitHub env names are `GITHUB_REPO`, `GITHUB_BRANCH` (default `main`) and `GITHUB_REPO_TOKEN`. They are named in `.env.example`. Setting them on Netlify happens on the Mac.
