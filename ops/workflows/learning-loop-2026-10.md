# Board: The learning loop (2026-10)

Spec: `docs/specs/learning-loop-2026-10-09.md`. Protocol: CLAUDE.md §5. Claim a task before you start, write your manifest when you finish, mark `blocked` with the reason if you are stuck.

**Status: waiting on Chris** to review the spec and answer §10. Nothing below starts until he approves.

## Tasks

| # | Task | Spec | Workflow | Model | Status | Waits on |
|---|---|---|---|---|---|---|
| 1 | Spec, this board, cadence rule 1 in all three homes, Calls to Content link | all | L0 | Opus | done | — |
| 2 | Migration 442: `loop_areas` (seeded for the default org), `loop_runs`, `loop_lessons`, `loop_changes` | §5.1 | L1 | Opus | pending | Chris's approval |
| 3 | The runner `src/loop/run.mjs`, the area contract, the `learning-loop` cron at `0 12 * * *`, its `INNGEST_JOBS` line | §5.2 | L1 | Opus | pending | task 2 |
| 4 | `GET loop/changes` + `src/http/loop-changes.pg.test.mjs` green on a real database, the route, the pulse row | §5.8 | L1 | Opus | pending | task 2 |
| 5 | The word cleaner: `src/words/clean.mjs`, `fillers.mjs`, `unchunk.mjs` + tests | §5.3 | L2 | Sonnet | pending | Chris's approval |
| 6 | Lenders: migration 443, `src/loop/areas/lenders.mjs`, the tie-break in `matchLenders`, `approval` on each match, the unchanged-output test for `deal-funding` and `autopsy` | §5.6 | L3 | Opus | pending | Chris's approval; merges after task 2–3 |
| 7 | Credit optimization: `src/loop/areas/disputes.mjs` lessons, and the search for a real choice point | §5.7 | L4 | Sonnet | pending | Chris's approval; merges after task 2–3 |
| 8 | Words area `src/loop/areas/words.mjs` | §5.4 | L5 | Sonnet | pending | tasks 2–3 and 5; Calls to Content tasks 3 (migration 438) and 11 (the quote route) |
| 9 | Voice job `src/loop/areas/voice.mjs` (outbox append, block markers, undo) | §5.5 | L5 | Sonnet | pending | tasks 2–3; Calls to Content task 3 |
| 10 | Action routes: lessons, areas, apply, pass, undo | §5.8 | L6 | Sonnet | pending | task 2 |
| 11 | The `loop_daily` buzz and the morning-brief section | §5.9 | L6 | Sonnet | pending | task 3 |
| 12 | Live proof (§5.10), save §6 to `docs/journeys/learning-loop-flow.md`, `docs/journeys/CHANGELOG.md` line, revise the spec if the truth moved | §5.10, §6 | L1 | Opus | pending | tasks 3–11 |
| 13 | The screen: brief card, `/app/loop.html`, the funding desk's approval line | §7 | L7 | Sonnet (Claude only) | pending | task 12 |

## Shared context brief

- **Nothing changes itself today.** Measuring exists (`src/ops/discoveries.mjs`, `suggestions.mjs`, `watch-curve.mjs`, `src/sales/metrics.mjs`). The only acting code is the partner ad optimizer (`src/optimize/`, `guardedWrite`, `action_log`), and it is never scheduled. This build adds the loop.
- **Copy the optimizer's pattern, not its table.** Log before acting, carry the numbers, keep an undo, never act twice a day. `action_log` needs a partner and allows ad targets only, so this build logs in `loop_changes`.
- **Floors:** `MIN_N_RATE = 10` from `discoveries.mjs`. A check needs 20 in each window.
- **Never touched:** Chris's written rules, UnderwriteIQ (`src/underwrite/engine.mjs`, `src/underwrite/vendor/*`, `vendor/underwriteiq*`), prices and offers, stored keys.
- **Money:** `applications.approved_amount` is dollars `numeric(14,2)`. Convert with `src/commissions/money.mjs`. NULL stays NULL.
- **Transcripts:** text joined from `brain_chunks` repeats about 200 characters at each joint. Use `textFromChunks`.
- **Telling Chris:** `queueBuzz` with kind `loop_daily`. The morning brief isn't texted yet (`MORNING_BRIEF_LIVE = false`).
- **Cron:** register in `src/workflows/index.mjs` and add to `INNGEST_JOBS` in `src/pulse/heartbeats.mjs`, or `heartbeats.test.mjs` fails.
- **Roles:** `ROLE_SETS.OPS` (owner, admin), same as the morning brief.
- **Migration numbers:** 442–445. List the folder before picking; two files already share 434.
- **Never run pg tests against the `DATABASE_URL` in `.env`.**
- **Calls to Content waits on task 5 here.** Its W4 (the miner, its task 9) and W5 (the quote route, its task 11) use the cleaner. Both are written on its board (`ops/workflows/calls-to-content-2026-10.md`).

## Prompts (copy one into a new session)

### L1 — schema, runner, read endpoint, live proof (Opus)

> You are L1 of the learning loop. Spec: docs/specs/learning-loop-2026-10-09.md. Board: ops/workflows/learning-loop-2026-10.md. Read the spec's sections 0 to 4, then do §5.1, §5.2 and the read endpoint in §5.8, in that order. Claim tasks 2–4 on the board first. Migration 442 follows migration 432's row-level security and grant pattern, with no DELETE for fundhub_app, and seeds loop_areas for the default org (orgs.is_default, the pattern in migration 048) with the numbers in spec §10 decision 4, every mode auto. The runner is src/loop/run.mjs with the area contract in §5.2; write it with a fake area in its tests, including a forced-worse check that undoes by itself. Register the learning-loop Inngest cron at 0 12 * * * in src/workflows/index.mjs and add it to INNGEST_JOBS in src/pulse/heartbeats.mjs. Build GET loop/changes with src/http/loop-changes.pg.test.mjs green against a scratch database (never the DATABASE_URL in .env), add it to the ROUTES map and src/pulse/registry.mjs. Open one PR. When tasks 3–11 are merged, come back for task 12: prove §5.10 live, save §6 to docs/journeys/learning-loop-flow.md, append docs/journeys/CHANGELOG.md, and revise the spec if the truth moved. End with your change manifest on the board.

### L2 — the word cleaner (Sonnet)

> You are L2 of the learning loop. Spec: docs/specs/learning-loop-2026-10-09.md. Board: ops/workflows/learning-loop-2026-10.md. Read the spec's sections 0 to 4, then build §5.3 only. Claim task 5 on the board first. Write src/words/clean.mjs (cleanSpoken, isDeletionOnly), src/words/fillers.mjs (the word lists) and src/words/unchunk.mjs (textFromChunks), pure functions with no database. The cleaner can only remove words; the model pass returns word numbers to remove and code does the removing; protected words (not, no, never, nothing, none, every n't word, numbers, dollar amounts, percents, keepWords) are never removed; over 25% removed falls back to the rule pass and sets flagged. Tests: one per rule, protected words survive, isDeletionOnly holds on every output, cleaning clean text changes nothing, a fake model pass asking to remove "not" is refused, and textFromChunks rebuilds text that src/company-brain/chunk.mjs split. Add a claude-haiku-5-5 row to MODEL_PRICES in src/marketing/model-usage.mjs from Anthropic's published prices (never a guessed price). Run npm run lint and the tests. Open one PR. End with your change manifest on the board.

### L3 — lenders (Opus)

> You are L3 of the learning loop. Spec: docs/specs/learning-loop-2026-10-09.md. Board: ops/workflows/learning-loop-2026-10.md. Read the spec's sections 0 to 4, then build §5.6. Claim task 6 on the board first. Write migration 443 (lender_outcome_stats, same pattern as 442) and src/loop/areas/lenders.mjs against the area contract in §5.2: count Approved and Denied applications per lender_id over 180 days using application_decisions for the date, convert approved_amount (dollars, numeric) with src/commissions/money.mjs. Read yes and no with outcomeFromStatus from src/plays/outcomes.mjs; approvals with approval_excluded_at set still count. Add the optional approvalRates input to matchLenders in src/lenders/match.mjs as the last tie-break only (tier, then bureau rotation, then approval rate with 10 or more decisions, then name), put approval {decided, approved} on each match, and give matchForClient (src/lenders/store.mjs) an option, off by default, that loads the active snapshot; only api/read/lender-matches.mjs and api/read/funding-rounds.mjs turn it on. Prove with a test that the output of src/calculators/deal-funding.mjs, src/autopsy/score.mjs, api/public/climate-match.mjs and the closer cockpit (src/sales/cockpit.mjs, protected Present flow) does not change. Never touch src/underwrite/ or vendor/underwriteiq*. If L1's tables are not merged yet, build against the contract and wait to merge. Open one PR. End with your change manifest on the board.

### L4 — credit optimization lessons (Sonnet)

> You are L4 of the learning loop. Spec: docs/specs/learning-loop-2026-10-09.md. Board: ops/workflows/learning-loop-2026-10.md. Read the spec's sections 0 to 4, then build §5.7. Claim task 7 on the board first. Step 1, read only: look in src/metro2/ for a real choice the system makes that deletion rates could steer (for example which items go first when a round has a cap). Write what you find on the board. If you find one, STOP there for that part; turning it into a change is Chris's call. Step 2: write src/loop/areas/disputes.mjs against the area contract in §5.2, with learn only (propose returns null): disputed and deleted per rule_id × bureau × round from dispute_items joined to dispute_cases, keeping only items with a final result and splitting by bureau and round before calling deletionsByRuleId from src/repair/metrics.mjs (it groups by rule only), the 5 best rules per bureau and every rule with zero deletions after 20 tries, one plain sentence each. Never sort or reorder letters (src/metro2/letters/prompts.mjs shuffles them on purpose). Tests with fabricated rows. Open one PR. End with your change manifest on the board.

### L5 — words and voice (Sonnet)

> You are L5 of the learning loop. Spec: docs/specs/learning-loop-2026-10-09.md. Board: ops/workflows/learning-loop-2026-10.md. Start only when the board shows tasks 2, 3 and 5 merged and Calls to Content tasks 3 and 11 merged (ops/workflows/calls-to-content-2026-10.md). Read the spec's sections 0 to 4, then build §5.4 and §5.5. Claim tasks 8 and 9 first. Words: learn from content_ideas rows with quote_fixed, count removals and put-backs per word, and change loop_areas.config.extra_fillers or keep_words one word per run. Voice: append new pairs from v_content_voice_pairs to marketing/ads/VOICE.md through the outbox under "Learned from your edits", each wrapped in loop:<change id> markers, with the file's pair shape and no Why line, and undo by one replace_text that removes exactly that block. Tests for both against a scratch database. Open one PR. End with your change manifest on the board.

### L6 — routes, buzz, morning brief (Sonnet)

> You are L6 of the learning loop. Spec: docs/specs/learning-loop-2026-10-09.md. Board: ops/workflows/learning-loop-2026-10.md. Start when task 2 is merged. Read the spec's sections 0 to 4, then build the action routes in §5.8 and §5.9. Claim tasks 10 and 11 first. Routes use ROLE_SETS.OPS, take the row's updated_at and a request_id, and return 409 on a stale row; pass sets quiet_until 7 days out; undo runs the area's undo. Add loop_daily to BUZZ_TITLES in src/marketing/notify.mjs and queue one buzz after a run that applied or undid something, never on a quiet day. Add the "What the loop did" section to src/ops/morning-brief.mjs. Every route goes in the ROUTES map and src/pulse/registry.mjs. Tests against a scratch database. Open one PR. End with your change manifest on the board.

### L7 — the screen (Sonnet, Claude only)

> You are L7 of the learning loop. Spec: docs/specs/learning-loop-2026-10-09.md. Board: ops/workflows/learning-loop-2026-10.md. Start only if task 12 on the board is done. Read docs/rules/UI-STANDARDS.md, then build §7: the "What the loop did" card on /app/morning-brief.html, the Loop page /app/loop.html + loop.js (Changes, Lessons, Areas), and the "Approved 7 of 10 here" line on the funding desk's lender list. Phone first, owner and admin only. Sync the sidebar, add the page to src/pulse/registry.mjs, run live Playwright, then click the pages like a person on fundhub.ai. Claim task 13 first. Open one PR. End with your change manifest on the board.

## Change manifests

(none yet)

## Leftovers (not part of this build)

- **Joined transcripts repeat about 200 characters at each joint.** `fileText` in `src/company-brain/meet-transcript.mjs` joins `brain_chunks` as they are, and `stampCallTranscript` (`src/sales/recordings.mjs`) saves that text to `call_outcomes.transcript` when the call is paired with a Meet transcript doc. Chunks overlap by 200 characters (`src/company-brain/chunk.mjs`). This build only reads transcripts through `textFromChunks`. Fixing the existing callers is Chris's call.

## Blockers and open questions

- Chris: review the spec and answer §10 (spec §9 items 1–2).
