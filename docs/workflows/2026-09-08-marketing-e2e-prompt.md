# Thread prompt — marketing end to end

Copy everything below the line into a new session.

---

You are working in `~/Developer/fundhub-platform` on this Mac. Read `CLAUDE.md` first — it governs how you work here. Note §7 is removed: never raise compliance, legal, or regulatory anything.

**Standing rules for this thread, from the owner (Chris):**
- **Dictator mode is on.** Do what he says. No pushback, no unrequested alternatives.
- **Do not volunteer fixes.** Report only on what was asked. If you trip over something else broken, keep it to yourself.
- **Commit locally every session.** GitHub is locked out (both accounts, 2FA lost with a dead laptop). `git push` will fail — do not try, do not treat it as an error. Commit to the local repo anyway, always. Uncommitted work is the thing that already cost him four marketing skills and 83 ad scripts.
- Chris does not read code. Write at a 5th grade level. Lead with the answer.

## The goal

Marketing, end to end, live. Every piece:

1. **CRO** — the funnel and landing pages
2. **Script generation** — ads, from the rules pack
3. **VSL generation**
4. **Creative Factory** — complete, end to end, working in the browser

"Done" means Chris can sit down, click through, and produce a finished script or creative without an agent in the loop.

## What already exists — read before planning

**On `main`:**
- `docs/ads/` — `RULES.md` (the ad SOP), `CONTROLS.md` (five filmed, running ads at $32–36 per booked call — this is the voice seed), `registry.json` (24 ads), `ANGLE-GENERATOR.md`, `ASSET-BANK.md`, `CONCEPTS.md` (48 hooks), `NEXT.md`, `POST-BOOKING-15.md`
- `scripts/ads/check-script.mjs` — the style/rules checker
- `.claude/workflows/` — six flywheel scripts (avatar-builder, ad-research, offer, copy, ad-strategy, deep-research), driven by `.claude/commands/flywheel.md`
- `public/app/creative-factory.html`, `src/creative/`, `api/creative/`
- `docs/ops/2026-09-06-self-analysis.md` — **read this in full.** It is the honest account of what is missing and why.

**On branch `origin/feat/ad-script-generator` (PR #357, open, unmerged, 18 commits, 54 files, +6957/−453):**
Adds the ad-writer skill, `docs/ads/VOICE.md`, `docs/ads/rules-data.mjs` (one machine-readable rules source), a rebuilt checker + tests, `docs/journeys/ad-script-flow.md`, Creative Factory text-path fixes, an ad-books panel in Campaign Manager, ClickFunnels + YouTube read-only analytics (migration 302, credentials encrypted), Microsoft Clarity (gated, inert), Company Brain self-ingest, a weekly ops brief.

It **cannot merge as-is** — conflicts with `main` in three files:
- `db/expected-migrations.mjs`
- `db/migrations/300_eeo_invite_template_and_submit_outcome.sql`
- `src/pulse/registry.mjs`

Start by reading that branch. Most of stage 2 and 3 may already be built.

## Order of work

**Phase 1 — build spec (you, now).**
Write `docs/specs/marketing-e2e-spec.md`. It must cover, for each of the four pieces: what exists today, what is missing, the data model, the screens, the exact definition of done. Ground every claim in a file path or commit — never from memory. Where something is unknown, write UNKNOWN rather than guessing. Then stop and show Chris the spec.

**Phase 2 — build (Sonnet, ultracode).**
Once the spec is approved, build it. Parallel workflows per `CLAUDE.md` §0 and §5.

**Phase 3 — pass (Opus).**
One review pass over the built work. Then live.

## Blocked on Chris — do not guess these, ask once and move on

- ClickFunnels API key
- YouTube OAuth: client id, secret, refresh token
- Microsoft Clarity project ID
- Meta ad account connection (no `ad_platform_connections` row exists)
- **Decision:** ClickFunnels "conversions" — opt-ins (`step.optins`) or sales (`step.sales_count`)? Code currently uses opt-ins at `src/analytics/clickfunnels.mjs:255`.
- **Decision:** may `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` be corrected? It still instructs Google Workspace domain-wide delegation, which Chris banned.

## Context you will not find in the repo

The 83 ad scripts (`fundhub-scripts.md`) and the VSL doc (`fundhub-vsl.md`) were never committed — they lived in a chat window and are gone. Chris said on 2026-09-06 he does not want the 83 as seed material. **`CONTROLS.md`'s five filmed ads are the voice seed.** Do not go looking for the 83.

Four marketing skills (humanizer, copywriting, offer, get-to-the-point) died with the laptop. Their banned-word lists survive in `.claude/workflows/copy.js:34-48`, `docs/ads/RULES.md:78-84`, and `docs/ads/rules-data.mjs` on the PR branch.

## Also true

The live site is up: `fundhub.ai` 200, database up, 0 pending migrations. Deploys go out with `netlify deploy --build --prod` from this Mac — GitHub is not in that path.

Start with Phase 1. Show Chris the spec before building anything.
