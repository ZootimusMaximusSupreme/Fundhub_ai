# Board: Calls to Content (2026-10)

Spec: `docs/specs/calls-to-content-2026-10-09.md`. Protocol: CLAUDE.md §5. Claim a task before you start, write your manifest when you finish, mark `blocked` with the reason if you are stuck.

**Status: waiting on Chris** to review the spec and answer §10. Nothing below starts until he approves.

## Tasks

| # | Task | Spec | Workflow | Model | Status | Waits on |
|---|---|---|---|---|---|---|
| 1 | Write the spec and this board | all | W1 | Opus | done | — |
| 2 | Prove the source: count Meet transcripts in `brain_files`, record the speaker label format, check team calls reach the brain, save 2 scrubbed fixtures | §5.1 | W2 | Opus | pending | Chris's approval |
| 3 | Migration 438: settings columns, `content_calls`, `content_ideas`, `content_drafts`, `v_content_voice_pairs` | §5.2 | W2 | Opus | pending | task 2 |
| 4 | `GET content/inbox` + `src/http/content-inbox.pg.test.mjs` green on a real database | §5.6 | W2 | Opus | pending | task 3 |
| 5 | `marketing/posts/RULES.md` (Part A formats, empty Part B) | §5.5 | W3 | Sonnet | pending | Chris's approval |
| 6 | `src/content/check.mjs` `checkPostText` + tests | §5.5 | W3 | Sonnet | pending | Chris's approval |
| 7 | Add `marketing/posts/` to the outbox allow-list + test | §5.8 | W3 | Sonnet | pending | Chris's approval |
| 8 | Name scrubber `src/content/scrub-names.mjs` + tests | §5.4 | W4 | Opus | pending | tasks 2–4 merged |
| 9 | The miner, `content_scan` and `content_mine_call` jobs, clock hook | §5.3, §5.4 | W4 | Opus | pending | tasks 2–8 |
| 10 | The writer, check loop, `content_write_idea` and `content_rewrite_draft` jobs, `content_ready` buzz, cost cap | §5.3, §5.5 | W4 | Opus | pending | tasks 6, 9 |
| 11 | Action routes, repo files, pulse rows | §5.6, §5.7 | W5 | Sonnet | pending | tasks 3–4 merged |
| 12 | Live proof: one real call → drafts → approve → file in `marketing/posts/` | §5.9 | W4 | Opus | pending | tasks 9–11 |
| 13 | Revise the spec if the truth moved; save §6 to `docs/journeys/calls-to-content-flow.md` | §6 | W4 | Opus | pending | task 12 |
| 14 | The Content page | §7 | W6 | Sonnet (Claude only) | pending | task 13 |

## Shared context brief

- **The ingest already runs.** Company Brain indexes Drive into `brain_files` / `brain_chunks` (migration 130). `src/company-brain/meet-transcript.mjs` attaches words to Meet recordings every 10 minutes: a sibling transcript doc first, Whisper for files under 24 MB. This build reads those rows. It does not change the brain or the sweeper.
- **The miner needs speaker names.** Whisper text has none, and a Gemini notes doc is a summary. Only a verbatim transcript doc with speaker names is used (spec trap 1–2, §10 decision 3).
- **The infra is the marketing machine's M0:** `marketing_jobs` + worker + clock, `repo_outbox` + allow-list, `marketing_buzzes`, `marketing_model_usage`. Register new job kinds in `src/marketing/handlers.mjs` (`JOB_HANDLERS`).
- **Force Claude** with `callModel({ provider: 'anthropic', ... })` (added in M0 step 4). Log every call with `recordMarketingUsage` (`src/marketing/model-usage.mjs`), passing the `job_id`.
- **Migration numbers:** 438–441.
- **Never run pg tests against the `DATABASE_URL` in `.env`.**

## Prompts (copy one into a new session)

### W2 — source proof, schema, read endpoint (Opus)

> You are W2 of Calls to Content. Spec: docs/specs/calls-to-content-2026-10-09.md. Board: ops/workflows/calls-to-content-2026-10.md. Read the spec's sections 0, 2, 3 and 4, then do §5.1, §5.2 and the read endpoint in §5.6, in that order. Claim tasks 2–4 on the board first. §5.1 is read-only against the live database: write the answers on the board, save the two scrubbed fixtures, and STOP AND ASK if it finds zero transcript docs or if team calls are missing. Then write migration 438 (same row-level security pattern as migration 407), then `GET content/inbox` with `src/http/content-inbox.pg.test.mjs` green against a scratch database (never the DATABASE_URL in .env). Add the route to the ROUTES map and to src/pulse/registry.mjs. Open one PR. End with your change manifest on the board.

### W3 — post rules, checker, allow-list (Sonnet)

> You are W3 of Calls to Content. Spec: docs/specs/calls-to-content-2026-10-09.md. Board: ops/workflows/calls-to-content-2026-10.md. Read the spec's sections 0, 2, 3 and 4, then do §5.5 (the post rules file and the post checker only, not the writer) and §5.8. Claim tasks 5–7 on the board first. Write marketing/posts/RULES.md with Part A as written in the spec and an empty Part B. Write src/content/check.mjs `checkPostText` reusing the lists in marketing/ads/rules-data.mjs, with a test per pattern and per channel range. Add `marketing/posts/` to ALLOWED_PREFIXES in src/repo/allow-list.mjs with a test. Run npm run lint and the tests. Open one PR. End with your change manifest on the board.

### W4 — miner, writer, jobs, live proof (Opus)

> You are W4 of Calls to Content. Spec: docs/specs/calls-to-content-2026-10-09.md. Board: ops/workflows/calls-to-content-2026-10.md. Read the board first: W2 and W3 must be merged, and W2's §5.1 answers and fixtures tell you the speaker label format. Read the spec's sections 0, 2, 3 and 4, then do §5.3, §5.4 and the writer and check loop in §5.5. Claim tasks 8–10, 12 and 13 on the board first. Build the speaker parser from W2's fixtures, never from memory. Register the four job kinds in src/marketing/handlers.mjs, add the clock hook and the content_ready buzz, force Claude in callModel, log every call in marketing_model_usage, and add the jobs to src/pulse/registry.mjs. Prove it live on one real call (§5.9). Save §6 to docs/journeys/calls-to-content-flow.md and append CHANGELOG.md. If the truth moved, revise the spec. Open one PR per task group. End with your change manifest on the board.

### W5 — action routes and repo files (Sonnet)

> You are W5 of Calls to Content. Spec: docs/specs/calls-to-content-2026-10-09.md. Board: ops/workflows/calls-to-content-2026-10.md. Read the board first: W2 must be merged. Read the spec's sections 0, 2, 3 and 4, then do the action routes in §5.6 and §5.7. Claim task 11 on the board first. Every write takes version and request_id and returns 409 on a stale version. Approve and posted write marketing/posts/<channel>/<date>-<slug>.md through enqueueRepoWrite; make_rule appends to Part B of marketing/posts/RULES.md through the outbox. Add every route to the ROUTES map and src/pulse/registry.mjs. Tests for each route against a scratch database. Open one PR. End with your change manifest on the board.

### W6 — the Content page (Sonnet, Claude only)

> You are W6 of Calls to Content. Spec: docs/specs/calls-to-content-2026-10-09.md. Board: ops/workflows/calls-to-content-2026-10.md. Start only if task 13 on the board is done. Read docs/rules/UI-STANDARDS.md, then build §7: public/app/content.html + content.js, phone first, in the Marketing group of the sidebar, owner and admin only. Sync the sidebar, add the page to src/pulse/registry.mjs, run live Playwright, then click the page like a person on fundhub.ai. Claim task 14 first. Open one PR. End with your change manifest on the board.

## Change manifests

(none yet)

## Blockers and open questions

- Chris: review the spec and answer §10 (spec §9 items 1–2).
