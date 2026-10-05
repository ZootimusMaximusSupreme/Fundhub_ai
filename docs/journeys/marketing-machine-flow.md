# Marketing machine flow: what the code does

Generated from code, not from the spec. The intended journey is `marketing-machine-intended.md` (agents do not edit it). Each section says which step wrote it. A path that is not built yet is marked `NOT BUILT` or `UNVERIFIED`. Spec: `docs/specs/marketing-machine-2026-10-04.md`.

## M0 step 3: settings, offers, jobs

Migrations `407_marketing_machine_tables.sql` (tables) and `408_marketing_offers_seed.sql` (seeds). Routes `marketing/settings` and `marketing/offers`, role set `ROLE_SETS.MARKETING` (owner, admin).

### Settings

```mermaid
flowchart TD
    A[Owner or admin opens GET marketing/settings] --> B{Row for this org?}
    B -->|No| C[Insert the default row: weekday 1, 07:00, America/Phoenix, 3 a day, 7 days, size rule total, floor 91, enabled false]
    B -->|Yes| D[Read it]
    C --> D
    D --> E[Return the settings. winner_rule and caption_position_y are null until set]
    F[POST marketing/settings with a patch] --> G{Known keys and valid values?}
    G -->|No| H[400 with the field and a plain sentence]
    G -->|Yes| I[Update, stamp updated_by and updated_at]
    I --> E
    J[Anyone else, including csm] --> K[403]
```

- The clock reads `enabled`, `batch_weekday`, `batch_time`, `timezone` (M0 step 4, below). The buzz path reads `quiet_start`, `quiet_end` and `timezone`. The batch writer that acts on the queued job is `NOT BUILT` (M1).

### Offers

```mermaid
stateDiagram-v2
    [*] --> draft: POST new tag with a name
    draft --> ready
    ready --> testing
    testing --> live
    live --> retired
    draft --> retired
    ready --> retired
    testing --> retired
    retired --> [*]: row stays, tag is never renamed or reused
```

- Seeded by 408 for the default org as `live`: `direct_book` (book_call, lane sorting), `blueprint` (book_call, lane uwiq) and `slo` (direct_buy, lane uwiq, checkout 14700 cents).
- Any status can be set by POST. The ready check (every card part filled, every page or page request present, a Meta campaign, an avatar) is `NOT BUILT`: the spec puts it in the M1 Offers tab (7.3).
- `paused` is a separate flag. Restarting a paused offer clears it. The machine that skips paused offers is `NOT BUILT` (M1).
- The database refuses to change `tag` or `org_id` on an existing offer.
- Seeded step pages come from `marketing/landing-pages/tracking-manifest.mjs`. Blueprint has only `/watch`; its survey and booking pages are blank because they could not be confirmed.

```mermaid
flowchart TD
    A[POST marketing/offers with a tag] --> B{Tag exists in this org?}
    B -->|No| C[Create it as draft, card_path marketing/offers tag .md]
    B -->|Yes| D[Patch the fields sent]
    C --> E{card_md sent?}
    D --> E
    E -->|No| F[Return the offer]
    E -->|Yes| G[enqueueRepoWrite in the same transaction]
    G -->|Throws| H[Roll back the whole save, 500]
    G -->|Returns| F
    G --> I[Writes one repo_outbox row, mode replace, in that transaction, then wakes the worker. Answers queued true]
```

### Supporting tables (created, nothing writes them yet)

`marketing_jobs` (queued, running, done, failed), `marketing_requests` (idempotency; used by the two POSTs when a `request_id` is sent), `marketing_buzzes`, `marketing_model_usage`, `ad_offer_tags`, `agent_requests`, `marketing_shoots`.

`ad_offer_tags` is seeded from decision 9 for the default org: ads 84 to 90 to `slo`, the registry's sorting, funding600 and premium ads to `direct_book`, the uwiq ads to `blueprint`. White-label ads 72 to 76 stay untagged. The reader that takes the script's `offer_key` over this table is `NOT BUILT` (M1).

### Gaps against the intended journey

- The intended journey says Chris pauses or restarts an offer and edits its card in the Command Center. The endpoints exist; the screen is `NOT BUILT`.
- The card save commits to the repo through the outbox in the intended flow. `src/marketing/repo-writes.mjs` calls the real outbox (M0 step 4); the commit happens when the worker drains it.

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
    WAKE[Marketing save wakes the worker, M0 step 4] --> DRAIN
    CLOCK[Worker calls drainOutbox at most once a minute, M0 step 4] --> DRAIN
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
- `outboxHealth()` returns the counts and the last error for the health card. `marketingHealth()` in `src/marketing/health.mjs` returns it with the job queue and buzz counts. The health route that shows it is `NOT BUILT` (M2).
- The GitHub env names are `GITHUB_REPO`, `GITHUB_BRANCH` (default `main`) and `GITHUB_REPO_TOKEN`. They are named in `.env.example`. Setting them on Netlify happens on the Mac.

## Clock, worker, buzzes, model client (M0 step 4)

Code: `netlify/functions/marketing-clock.mjs` (scheduled `*/15 * * * *` in netlify.toml), `netlify/functions/marketing-worker-background.mjs`, `src/marketing/{clock,worker,jobs,notify,wake,time,health,model-usage,handlers}.mjs`, `src/agents/model.mjs` (`callModel`). Tables (migration 410 adds the slot index): `marketing_jobs`, `marketing_buzzes`, `marketing_model_usage`, `repo_outbox`.

```mermaid
flowchart TD
    TICK[Clock ticks every 15 minutes] --> ON{Any org with enabled true?}
    ON -->|No| IDLE[Log disabled, queue no batch, still check for waiting work]
    IDLE --> WORK
    ON -->|Yes| DUE{Local weekday is batch_weekday, and clock is within 3 hours after batch_time?}
    DUE -->|Yes| SLOT{Job for this local date and time already queued?}
    SLOT -->|No| QJOB[Queue write_batch job, one per slot, enforced by unique index marketing_jobs_slot_uq]
    SLOT -->|Yes| SKIP[Nothing]
    DUE -->|No| SKIP
    QJOB --> WORK
    SKIP --> WORK{Runnable jobs, due buzzes or waiting outbox rows?}
    WORK -->|Yes| WAKE[POST to the worker with x-fundhub-worker secret]
    WORK -->|No| END[Done]
    SAVE[A marketing save writes a repo_outbox row, then its transaction commits] --> WAKE
    WAKE --> AUTH{Secret matches MARKETING_WORKER_SECRET?}
    AUTH -->|No or not set| R404[404, nothing runs]
    AUTH -->|Yes| RUN[Worker run, up to 15 minutes]
    RUN --> HK[Once a minute: drainOutbox, send due buzzes, take back claims older than 16 minutes]
    HK --> CLAIM[Claim up to 3 jobs, FOR UPDATE SKIP LOCKED]
    CLAIM --> H{Handler for the job kind?}
    H -->|No| FAILNOW[Job fails now: no handler for job kind]
    H -->|Yes| EXEC[Run the handler, no transaction held open]
    EXEC -->|OK| DONE[Job done, result saved]
    EXEC -->|Throws| TRY{3rd attempt?}
    TRY -->|No| REQ[Back in the line after a pause]
    TRY -->|Yes| FAIL[Job failed with the reason]
    CLAIM --> M9{9 minutes in?}
    M9 -->|Yes| STOPNEW[Stop taking new work, let running jobs finish]
    STOPNEW --> MORE{Runnable jobs left?}
    MORE -->|Yes| SELF[Worker wakes itself again]
    MORE -->|No| END
```

Buzzes: `queueBuzz` writes a `marketing_buzzes` row. Inside quiet hours (`quiet_start` to `quiet_end` in the org's time zone, default 21:00 to 07:00 Arizona) `send_after` is when quiet hours end. The worker sends due rows through `notify-fanout send()`, at most one of each kind per 10 minutes, and rows sharing a `group_key` go as one buzz. A failed send leaves the row for the next pass. Nothing calls `queueBuzz` yet: the callers (scripts ready, videos ready, stuck) arrive with M1 and M3. `NOT BUILT`.

Model client: `callModel` with `provider: 'anthropic'` sends only to api.anthropic.com, never OpenAI, and returns an error (status 401, nothing sent) when `ANTHROPIC_API_KEY` is missing or has a `*` in it. `timeoutMs` aborts a slow call. `cache` sends the system prompt as one block with `cache_control` ephemeral. `tools` and `toolChoice` go to Anthropic as `tools` and `tool_choice`, and `tool_use` blocks come back as `toolCalls`. Usage goes to `marketing_model_usage` through `recordMarketingUsage` (not `recordUsage`). Nothing calls it yet: the writer arrives with M1. `NOT BUILT`.

### Gaps against the intended journey

- The job handler list is empty (`src/marketing/handlers.mjs`). A `write_batch` job queued by the clock fails with "no handler" until M1 adds the writer. The clock only queues while `enabled` is true, and `enabled` stays false until M1 is done.
- If `MARKETING_WORKER_SECRET` or the site URL is not set, nothing wakes the worker. The save still succeeds and the row waits. The Netlify variable is set on the Mac with the rest of the batch; none was set by this step.
- A save wakes the worker only after its transaction has committed: `enqueueRepoWrite` does not wake, and the handler calls `wakeAfterCommit` once the save has gone through (not on a rollback, not on a replayed request).
- While `enabled` is false the clock queues no batch but still wakes the worker for waiting repo saves and due buzzes, so a saved offer card never sits uncommitted.
- Two clock ticks cannot queue the same slot twice: migration 410 adds a unique index on (org, kind, slot) and `queueJob` inserts with ON CONFLICT DO NOTHING.
