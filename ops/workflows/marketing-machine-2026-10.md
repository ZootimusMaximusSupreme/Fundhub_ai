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
| A | M0.1 **blocked** — Chris said yes; Auto mode still blocks saving rule files (needs mode switched to Accept edits). M0.2 running. M0.3 → PR #21 in review | M0.4 after M0.3 merges |
| B | **running** — 9.1 state machine; merges after the CI fix | 9.2 aligner |
| C | **running** — M0 step 6 (CI fix) | M6a, Appendix C lists, M6b |
| D | 11.4 done → PR #19 reviewed, no blockers; merges after the CI fix | waiting — 11.1 needs M0 step 5 merged; 7.10 brain parts need M0 step 3 |
| E | waiting — needs `docs/specs/marketing-machine-api.md` (first M1 PR, lane A) | 8.1 teleprompter |

Running agents: 5 of 5 (A: M0.2, M0.3; B: 9.1; C: M0.6, Appendix C).

2026-10-05: Chris said "Do the whole thing." Lanes A and B started before the CI fix merged so they aren't idle; nothing merges before the CI fix (spec 0.6).

## Tasks

Status: `pending` / `claimed` / `done` / `blocked`.

### M0 Groundwork
| Step | What | Lane | Agent | Status | PR |
|---|---|---|---|---|---|
| M0.1 | Rule changes (§3c, chris-word-wins, animations-last, §1 tier line, superseded lines, §3b rows) | A | mm-architect | blocked | |
| M0.2 | Repo saves through an outbox (migration 406) | A | mm-builder | done (in review) | #25 | |
| M0.3 | Settings, offers, jobs (migrations 407–408) | A | mm-builder | done (in review) | #21 | |
| M0.4 | Clock, worker, buzz, model client | A | mm-builder | pending | |
| M0.5 | Meta v26.0, sync, ad-number resolver, tag views | A | mm-architect | pending | |
| M0.6 | CI that actually checks work | C | mm-architect | blocked (migration 114 call) | #23 | |
| M0.7 | Journey docs (`marketing-machine-flow.md`) | A | mm-chore | pending | |
| M0.8 | Ship stays in step with GitHub | A | mm-builder | fixing review blocker (rename detection) | #24 | |
| M0.9 | Full client dossier (migration 409) | A | mm-architect | claimed | |

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
| App C | Bot policy lists | mm-chore | done (review: no blockers; 3 small fixes in progress) | #20 | |
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

### M0.3 — PR #21 (lane A, mm-builder)
- `db/migrations/407_marketing_machine_tables.sql`: marketing_settings, marketing_offers, marketing_jobs, marketing_requests, marketing_buzzes, marketing_model_usage, ad_offer_tags, agent_requests, marketing_shoots (402/403 pattern; tag/org immutable trigger).
- `db/migrations/408_marketing_offers_seed.sql`: direct_book, blueprint, slo live; decision-9 tags (slo 84–90; direct_book 13 ads; blueprint 26–31; white-label 72–76 untagged).
- `api/marketing/settings.mjs`, `api/marketing/offers.mjs` (ROUTES, PULSE_REGISTRY, `ROLE_SETS.MARKETING`); `src/marketing/{settings,offers,requests,repo-writes,pg-fixture}.mjs`.
- Tests: 16 unit + 22 pg, all pass on a scratch database. New `docs/journeys/marketing-machine-flow.md`.

### Appendix C — PR #20 (lane C, mm-chore)
- `src/config/bot-policy.mjs` + `bot-policy.test.mjs`. Parity with Appendix C checked by the reviewer (34 AI crawlers, 2 opt-outs, 12 scrapers, 11 previews/ad review, 4 search engines).

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

- **CI (M0.6, PR #23) blocked on migrations 114/168/255.** The 2026-10-04 text cleanup copied `114_ghl_agent_seed`, `168_retire_ghl_agents`, `255_ghl_doc_docs_received` to new names (`114_crm_agent_seed`, `168_retire_legacy_crm_agents`, `255_doc_agent_docs_received`) and cut SQL out of the copies; migration 372 renamed the live records to the new names. Both old and new files are on disk. A fresh database fails at `114_crm_agent_seed.sql`, and `372` then hits a duplicate key. Fixing it means editing applied migration files (normally forbidden) — Chris's call. Open risk: the live database may now treat the old `ghl` files as not yet applied and re-run them on the next ship. Unconfirmed: a read-only check of live `schema_migrations` was refused by the session's permission check. PR #23 otherwise cuts no-db failures 25 → 6.
- **Four tests disagree with owner decisions** (left unchanged by lane C): `crm-html.test.mjs` (Play name box, removed 2026-09-06), `output-baseline.test.mjs` (PDF pack, stopped 2026-09-05), `slo-sales-widget-html.test.mjs` item 8 (old FAQ wording), `climate-match.test.mjs` (`public/climate/` replaced).
- **PR #23 risk:** ClickFunnels contact sync now goes through the fence, so it holds unless `ADAPTERS_DRY_RUN` is off on production (boards say it is 0; unconfirmed).
- **M0.2 env:** `GITHUB_REPO`, `GITHUB_REPO_TOKEN`, `GITHUB_BRANCH` to set on Netlify from the Mac; the drain also needs `ADAPTERS_DRY_RUN` off.

- **M0.1 (update 2026-10-05):** Chris said yes in chat. The session's Auto-mode check still blocked the commit and the `.claude/rules/chris-word-wins.md` file ("Self-Modification"). Edits sit uncommitted in the M0.1 worktree, plus `.cursor/rules/chris-word-wins.mdc` and the CLAUDE.md "Chris's word wins" line. Waiting on Chris to switch the mode to Accept edits.
- **M0.3 agent once started a bare `npm test` with the live `DATABASE_URL`;** it says it killed it within seconds, in the unit phase, with no database connection.
- **M0.3 hookup pending:** `enqueueRepoWrite` in `src/marketing/repo-writes.mjs` is a stub until M0.2 (outbox) merges. Swap the body only.
- **No SLO product key** in `src/config/offers.mjs`; SLO checkout step uses `diagnostic` (14700 cents).

- **M0.1 blocked (2026-10-05).** The permission system refused the agent's commit: every M0.1 change edits CLAUDE.md, `.claude/rules/` or `.cursor/rules/`, and it would not accept the orchestrator's task as approval. It also refused the new "Chris's word wins" law (1b). Edits 1a, 1c–1f are done but uncommitted in the agent's worktree. Needs Chris's own yes.
- **Live database in the cloud env.** This cloud session has `DATABASE_URL` set to the live Supabase pooler. Every agent was told to blank it for tests. No agent reports running a test against it.
- **Reviewer nit on #19 (for lane C):** `src/adapters/clarity-export.mjs` makes an unfenced fetch (not via `transmit()`, not on `ALLOWED_RAW_FETCH`). Pre-existing; already on main's red `no-unfenced-transmit` list.

- Waiting on Chris (§16), not blocking current work: Apple developer account, Bluetooth remote name, Submagic key test, R2 token / GitHub app token / Render approvals, Remotion license, `slo-vsl3-repair.mp4`, offer-card approvals, Meet recording, course folders, request-runner approval.
- Netlify env vars and `npm run ship` run from the Mac only.
