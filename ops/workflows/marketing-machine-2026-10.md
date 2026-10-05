# Marketing machine — work board (2026-10)

Spec: `docs/specs/marketing-machine-2026-10-04.md`. Intended journey: `docs/journeys/marketing-machine-intended.md`.
Protocol: CLAUDE.md §5. **Only the orchestrator (main session) writes this board.** Subagents report their claim,
change manifest and blockers in their final message; the orchestrator copies them here.

## Kickoff — 2026-10-05

- Chris approved the spec, its split and the intended journey. **§17: all defaults** (owner-set 2026-10-05).
- Model: Opus — orchestrator is Opus. Match.
- W2 (rule conflicts) is done (commit `d42e0c4`). W7's QualifiedLead part merged (PR #11); ShowedCall is still to come. So lanes D and E may start.
- Kickoff ran in a **cloud session, not the Mac.** Code, PRs and reviews run here. Two things wait for the Mac: setting Netlify env vars and `npm run ship` (spec 0.8). There is no local `.env` here, which is fine: no step tests against the live database.
- Cloud has no `gh` CLI. Agents read CI logs and open PRs through the GitHub MCP tools; mm-reviewer reads diffs with `git diff origin/main...<branch>`.

## Lane status

| Lane | Now | Next |
|---|---|---|
| A | **running** — M0 step 1 (rule changes); merges after the CI fix | M0 step 2 |
| B | **running** — 9.1 state machine; merges after the CI fix | 9.2 aligner |
| C | **running** — M0 step 6 (CI fix) | M6a, Appendix C lists, M6b |
| D | 11.4 done → PR #19 in review | waiting — 11.1 needs M0 step 5 merged; 7.10 brain parts need M0 step 3 |
| E | waiting — needs `docs/specs/marketing-machine-api.md` (first M1 PR, lane A) | 8.1 teleprompter |

Running agents: 4 of 5 (A, B, C, reviewer on #19).

2026-10-05: Chris said "Do the whole thing." Lanes A and B started before the CI fix merged so they aren't idle; nothing merges before the CI fix (spec 0.6).

## Tasks

Status: `pending` / `claimed` / `done` / `blocked`.

### M0 Groundwork
| Step | What | Lane | Agent | Status | PR |
|---|---|---|---|---|---|
| M0.1 | Rule changes (§3c, chris-word-wins, animations-last, §1 tier line, superseded lines, §3b rows) | A | mm-architect | claimed | |
| M0.2 | Repo saves through an outbox | A | mm-builder | pending | |
| M0.3 | Settings, offers, jobs (migration) | A | mm-builder | pending | |
| M0.4 | Clock, worker, buzz, model client | A | mm-builder | pending | |
| M0.5 | Meta v26.0, sync, ad-number resolver, tag views | A | mm-architect | pending | |
| M0.6 | CI that actually checks work | C | mm-architect | claimed | |
| M0.7 | Journey docs (`marketing-machine-flow.md`) | A | mm-chore | pending | |
| M0.8 | Ship stays in step with GitHub | A | mm-builder | pending | |
| M0.9 | Full client dossier | A | mm-architect | pending | |

### M1 Script machine (lane A)
| Step | What | Agent | Status | PR |
|---|---|---|---|---|
| 7.1 | Rules, rebuilt (text edits: chore; contradiction sweep: builder) | mm-chore / mm-builder | pending | |
| 7.2 | Voice | mm-builder | pending | |
| 7.3 | Offer cards, recipes, angles, animation catalog | mm-builder (RECIPES.md: mm-chore) | pending | |
| 7.4 | Data (migrations) | mm-architect | pending | |
| 7.5 | Planner | mm-architect | pending | |
| 7.6 | Writer prompt and check loop | mm-architect | pending | |
| 7.7 | Release | mm-builder | pending | |
| 7.8 | Script actions | mm-builder | pending | |
| 7.9 | Repo files | mm-builder | pending | |
| 7.10 | What the writer learns from (avatar, real words, writer parts) | mm-builder | pending | |
| API | `docs/specs/marketing-machine-api.md` (first M1 PR) | mm-builder | pending | |

### M2 Teleprompter, Shoot Day, Command Center
| Step | What | Lane | Agent | Status | PR |
|---|---|---|---|---|---|
| 8.1 | Teleprompter screen | E | mm-builder | pending | |
| 8.2 | Shoot Day (routes in A, screen in E) | A / E | mm-builder | pending | |
| 8.3 | Command Center shell and tabs | E | mm-builder | pending | |
| 8.4 | Cross-origin access hook | A | mm-builder | pending | |
| 8.5 | iPhone and iPad app (needs the Apple account, §16 item 1) | E | mm-builder | pending | |

### M3 Video pipeline (lane B; screens in E)
| Step | What | Agent | Status | PR |
|---|---|---|---|---|
| 9.1 | Flow and state machine | mm-architect | claimed | |
| 9.2 | Aligner | mm-architect | pending | |
| 9.3 | Encodes | mm-architect | pending | |
| 9.4 | Animations, always last | mm-builder | pending | |
| 9.5 | Video worker (`video-worker/`) | mm-builder | pending | |
| 9.6 | Approval and light editing (routes B, screen E) | mm-builder | pending | |
| 9.7 | Delivery | mm-builder | pending | |

### M4 Load ads into Meta (lane B; Launch screen in E)
| Step | What | Agent | Status | PR |
|---|---|---|---|---|
| 10.1–10.5 | Meta loader, UTMs, our database, guards and launch | mm-architect | pending | |
| 10.5 screen | Launch screen | mm-builder (E) | pending | |

### M5 Numbers (lane D; screens in E)
| Step | What | Agent | Status | PR |
|---|---|---|---|---|
| 11.1 | Definitions + metric SQL (needs M0.5) | mm-architect | pending | |
| 11.2 | Endpoints | mm-builder | pending | |
| 11.3 | Screens | mm-builder (E) | pending | |
| 11.4 | Fixes: Clarity adapter + sweeper, watch-curve clicks | mm-builder | done (in review) | #19 | |

### M6 Website (lane C)
| Step | What | Agent | Status | PR |
|---|---|---|---|---|
| 12.1 | M6a videos off Netlify (R2) — needs `CLOUDFLARE_R2_API_TOKEN` (§16 item 4) | mm-builder | pending | |
| App C | Bot policy lists | mm-chore | pending | |
| 12.2 | M6b bot block | mm-builder | pending | |

### M7 / M8 (lane D; screens in E)
| Step | What | Agent | Status | PR |
|---|---|---|---|---|
| 7.10 brain | Collection label, course import, reference search | mm-builder | pending | |
| 13 | M7 brain map back end | mm-builder | pending | |
| 13 screen | Map tab | mm-builder (E) | pending | |
| 14 | M8 page suggestions + request runner | mm-builder | pending | |
| 14 screen | Offers tab suggestions | mm-builder (E) | pending | |

## Change manifests

(Filled in by the orchestrator from each agent's final message.)

### 11.4 — PR #19 (lane D, mm-builder)
- New `db/migrations/424_clarity_export_counter.sql`: table `clarity_export_calls` (org_id, project_id, day_utc; calls, machine_calls), 402/403 pattern. Manifest regenerated.
- New `src/analytics/clarity-counter.mjs`: one atomic upsert; Microsoft cap 10/day and sweeper cap 2/day.
- `src/adapters/clarity-export.mjs`: optional `counter`, `fetch`, `retries` (anything but 0 throws). File counter stays default for agent pulls.
- `src/analytics/clarity-org-sync.mjs`: adapter + database counter, retries 0, logs and stops on failure.
- `src/workflows/clarity-insights-sweeper.mjs` retries 0; registered in `src/workflows/index.mjs`; added to `EXPECTED_WORKFLOW_IDS`.
- `src/ops/watch-curve.mjs`: `DYING_ADS_SQL` selects `m.clicks`.
- Tests: `clarity-org-sync.test.mjs` (5), 3 new in `watch-curve.test.mjs`. Lint and typecheck clean. No-db suite: 31 failures vs main's 33 (the 2 fixed are the workflow-count tests); no new failures.
- Sweeper cron 07:30 UTC daily; needs `CLARITY_DATA_EXPORT_TOKEN` and `CLARITY_PROJECT_ID` on Netlify (Mac check at ship).
- Found on main (handed to lane C): fresh `db/migrate.mjs` fails at `114_crm_agent_seed.sql` ("VALUES lists must all be the same length").

## Blockers and open questions

- Waiting on Chris (§16), not blocking current work: Apple developer account, Bluetooth remote name, Submagic key test, R2 token / GitHub app token / Render approvals, Remotion license, `slo-vsl3-repair.mp4`, offer-card approvals, Meet recording, course folders, request-runner approval.
- Netlify env vars and `npm run ship` run from the Mac only.
