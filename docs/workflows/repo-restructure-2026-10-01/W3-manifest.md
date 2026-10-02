# W3 manifest — scripts, marketing, root files, dot-folders

Inventory only. Nothing was moved, edited, deleted or committed. Rows live in `W3.tsv` next to this file.
Folder rows are written without a trailing slash (W2 writes `api/`); match on path when merging. Where this file needs another slice's destination it uses W2.tsv as written at 18:04 (src/ db/ api/ netlify/ public/ e2e/ vendor/ dist/ assets/ wireframes/ → apps/platform/, extension/ and render-service/ → apps/). docs/ is assumed to stay put pending W4.
Built 2026-10-01 from `git ls-files` + `git ls-files --others --exclude-standard`, file headers, import parsing and a grep of every rule and skill.

## Counts

- **Rows written: 1596** — 1477 files (1135 tracked, 342 untracked), 109 folders, 10 gitignored placeholders (one row each, not listed inside).
- **Move: 1376 rows** (files and folders whose new_path differs).
- **Stay in place: 219 rows** (dot-folders, the stay-at-root list, gitignored placeholders).
- **Split folders: 1** — their files go to different places, so the folder row keeps its own path and says where each part goes: `scripts`.
- **To archive: 868 rows**, of which 90 are `confidence=unclear` (all unclear rows go to archive).
- `imports-src` rows: 380 (311 of them are scratch files under scripts/tmp that go to archive anyway).
- `named-in-rule` rows: 92.

Files by destination:

| Destination | Files |
|---|---|
| `archive/scripts/tmp* (dated one-offs)` | 825 |
| `marketing/landing-pages/` | 292 |
| `(stays in place)` | 173 |
| `apps/platform/scripts/` | 121 |
| `ops/scripts/` | 26 |
| `archive/ (other)` | 10 |
| `marketing/ads/slo/scripts/` | 6 |
| `marketing/ads/scripts/` | 5 |
| `marketing/testimonials/scripts/` | 5 |
| `marketing/testimonials/frames/` | 3 |
| `marketing/testimonials/transcripts/` | 3 |
| `apps/platform/fundhub-docs/` | 3 |
| `marketing/flywheel/scripts/` | 2 |
| `marketing/testimonials/` | 1 |
| `apps/platform/` | 1 |
| `docs/rules/` | 1 |

## New subfolders this inventory proposes

- `apps/platform/scripts/` — every script that imports `src/ db/ api/ netlify/`, everything tied to one by a relative import, and app tooling that walks app folders at runtime (lint, test runner, ship, artifact builders, journeys and diagrams generators, sidebar sync, smoke tests, `black-reports/`, `sim/`, `lenders-*`, the marketing data warehouse in `scripts/marketing/`).
- `apps/platform/fundhub-docs/` — `src/messaging/seed/collect.mjs` reads `<REPO>/fundhub-docs/sources`, so it moves with the app.
- `apps/platform/DEPLOY.md` — `src/http/monitoring.test.mjs` reads `path.join(ROOT, "DEPLOY.md")`.
- `ops/scripts/` — scripts that touch no app code: Notion scrape set, Cloudflare DNS, Airtable extract, sim doc-pack builders (python), owner-login runbook + SQL, one sim cleanup.
- `marketing/landing-pages/` — all of `clickfunnels-fragments/` with its inner structure (it is its own npm package with its own Playwright config).
- `marketing/landing-pages/scripts/` — `cf-push-custom-html.mjs` and the three proof-crop scripts.
- `marketing/ads/scripts/` and `marketing/ads/slo/scripts/` — ad checker, B-roll, Drive and ad-video tools (SLO-named or SLO-headed files go to `slo/`).
- `marketing/testimonials/` — `content/testimonials/**` (data) plus `scripts/` from `scripts/testimonials/**`.
- `marketing/flywheel/scripts/` — `scripts/flywheel/status.mjs` + test.
- `docs/rules/fundhub-brand.css` — the root brand-token file the UI rules call law (the served copy is `public/app/fundhub-brand.css`, a different file).

## Calls the coordinator may want to flip

1. **scripts/tmp/** and scripts/tmp-* → archive**, including the 311 that import src. The brief's imports-src rule would send them to `apps/platform/scripts/`; they are dated one-off walk/prove scripts and nothing outside scripts/tmp points at them in code (checked). Archived copies will not run, which is fine for archive.
2. **Marketing scripts that import src stay marketing** (per the prompt). 29 relative imports then need rewriting — listed below.
3. **scripts/marketing/** (federal business-data warehouse) is kept with the app: it has DB migrations, a `.pg.test.mjs`, and imports `src/db.mjs`. It is not ads, VSL, posts or ClickFunnels.
4. **clarity-insights-pull.mjs, marketing-data-bootstrap.mjs, marketing-data-health.mjs** kept with the app (they write app tables).
5. **scripts/load-env.mjs** goes to `apps/platform/scripts/`; four ops Notion scripts and `apply-fundhub-cloudflare-dns.mjs` import it, and it reads `<ROOT>/.env` (see runtime list).
6. **scripts/ad-video-move-takes-to-raw.mjs → archive**: its own header says DEPRECATED 2026-09-24 and `slo-one-filmed-folder` calls it dead. Two rule files name it.
7. **clickfunnels-fragments/assets/VSL.mov** stays inside landing-pages to keep the fragments package whole; it could instead go to `marketing/vsl/`.
8. **Root notes → archive**: APPLY-NOTES, AUDIT-FINDINGS, HANDOFF, PRODUCT-BACKLOG, RECOVERY-2026-08-01, VERIFICATION, WORKFLOW-AUTONOMY, workflow-migration-table. Code only mentions them in comments (checked; comments stripped before matching).
9. **Overlap with W4:** W4's prompt also lists every untracked file outside `docs/`. All 342 untracked files in this slice are in W3.tsv too (334 under scripts/tmp, the rest are 6 new rule files and 2 SLO briefs). Dedupe on merge.

## Every `named-in-rule` path

Rule sources grepped: `CLAUDE.md`, `.claude/rules/`, `.cursor/rules/`, `.cursor/skills/**`, `.claude/skills/*/SKILL.md`, `.agents/skills/**`, `.claude/commands/`. A path counts only when written out in full.

| Path | Proposed new path | Named by |
|---|---|---|
| `.claude/rules` | `.claude/rules` | CLAUDE.md |
| `.claude/rules/ad-naming.md` | `.claude/rules/ad-naming.md` | CLAUDE.md |
| `.claude/rules/ad-video-best-of-clips.md` | `.claude/rules/ad-video-best-of-clips.md` | CLAUDE.md |
| `.claude/rules/ad-watch-curve.md` | `.claude/rules/ad-watch-curve.md` | CLAUDE.md |
| `.claude/rules/chris-never-clickfunnels.md` | `.claude/rules/chris-never-clickfunnels.md` | CLAUDE.md |
| `.claude/rules/chris-never-submagic.md` | `.claude/rules/chris-never-submagic.md` | CLAUDE.md |
| `.claude/rules/clarity-export-rate-limit.md` | `.claude/rules/clarity-export-rate-limit.md` | CLAUDE.md |
| `.claude/rules/finish-the-answer.md` | `.claude/rules/finish-the-answer.md` | CLAUDE.md |
| `.claude/rules/fresh-thread-when-long.md` | `.claude/rules/fresh-thread-when-long.md` | CLAUDE.md |
| `.claude/rules/fundhub-company-name.md` | `.claude/rules/fundhub-company-name.md` | CLAUDE.md |
| `.claude/rules/grok-no-displays.md` | `.claude/rules/grok-no-displays.md` | CLAUDE.md |
| `.claude/rules/page-edits-marked-draft.md` | `.claude/rules/page-edits-marked-draft.md` | CLAUDE.md |
| `.claude/rules/proof-cards-from-source.md` | `.claude/rules/proof-cards-from-source.md` | CLAUDE.md |
| `.claude/rules/rules-for-claude-and-cursor.md` | `.claude/rules/rules-for-claude-and-cursor.md` | CLAUDE.md |
| `.claude/rules/secrets-env-law.md` | `.claude/rules/secrets-env-law.md` | CLAUDE.md |
| `.claude/rules/slo-one-filmed-folder.md` | `.claude/rules/slo-one-filmed-folder.md` | CLAUDE.md |
| `.claude/rules/ux-guidance-urls-first.md` | `.claude/rules/ux-guidance-urls-first.md` | .claude/rules/rules-for-claude-and-cursor.md, .cursor/rules/rules-for-claude-and-cursor.mdc, CLAUDE.md |
| `.claude/rules/video-4k-unless-ad.md` | `.claude/rules/video-4k-unless-ad.md` | .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md, CLAUDE.md |
| `.claude/settings.json` | `.claude/settings.json` | CLAUDE.md |
| `.claude/settings.local.json` | `.claude/settings.local.json` | CLAUDE.md |
| `.claude/workflows/copy.js` | `.claude/workflows/copy.js` | CLAUDE.md |
| `.cursor/rules` | `.cursor/rules` | .cursor/skills/fundhub-repo-hygiene/SKILL.md, CLAUDE.md |
| `.cursor/rules/ad-naming.mdc` | `.cursor/rules/ad-naming.mdc` | CLAUDE.md |
| `.cursor/rules/ad-video-best-of-clips.mdc` | `.cursor/rules/ad-video-best-of-clips.mdc` | CLAUDE.md |
| `.cursor/rules/ad-watch-curve.mdc` | `.cursor/rules/ad-watch-curve.mdc` | CLAUDE.md |
| `.cursor/rules/agentic-audit-guardrails.mdc` | `.cursor/rules/agentic-audit-guardrails.mdc` | .cursor/skills/fundhub-repo-hygiene/SKILL.md |
| `.cursor/rules/audit-vs-fix-router.mdc` | `.cursor/rules/audit-vs-fix-router.mdc` | .cursor/skills/fundhub-repo-hygiene/SKILL.md |
| `.cursor/rules/chris-never-clickfunnels.mdc` | `.cursor/rules/chris-never-clickfunnels.mdc` | CLAUDE.md |
| `.cursor/rules/chris-never-submagic.mdc` | `.cursor/rules/chris-never-submagic.mdc` | CLAUDE.md |
| `.cursor/rules/clarity-export-rate-limit.mdc` | `.cursor/rules/clarity-export-rate-limit.mdc` | CLAUDE.md |
| `.cursor/rules/clickfunnels-developers-docs.mdc` | `.cursor/rules/clickfunnels-developers-docs.mdc` | .claude/skills/clickfunnels-developers-docs/SKILL.md |
| `.cursor/rules/finish-the-answer.mdc` | `.cursor/rules/finish-the-answer.mdc` | CLAUDE.md |
| `.cursor/rules/fresh-thread-when-long.mdc` | `.cursor/rules/fresh-thread-when-long.mdc` | CLAUDE.md |
| `.cursor/rules/full-end-to-end-audit.mdc` | `.cursor/rules/full-end-to-end-audit.mdc` | .cursor/rules/agentic-audit-guardrails.mdc, .cursor/rules/audit-vs-fix-router.mdc, .cursor/skills/fundhub-auditor/SKILL.md, .cursor/skills/fundhub-system-map/SKILL.md, CLAUDE.md |
| `.cursor/rules/fundhub-company-name.mdc` | `.cursor/rules/fundhub-company-name.mdc` | CLAUDE.md |
| `.cursor/rules/grok-no-displays.mdc` | `.cursor/rules/grok-no-displays.mdc` | CLAUDE.md |
| `.cursor/rules/live-playwright-100-before-manual.mdc` | `.cursor/rules/live-playwright-100-before-manual.mdc` | .cursor/skills/fundhub-fixer/SKILL.md |
| `.cursor/rules/no-extra-holes.mdc` | `.cursor/rules/no-extra-holes.mdc` | CLAUDE.md |
| `.cursor/rules/one-issue-per-thread.mdc` | `.cursor/rules/one-issue-per-thread.mdc` | .cursor/rules/audit-vs-fix-router.mdc |
| `.cursor/rules/owner-scope-minimal-diff.mdc` | `.cursor/rules/owner-scope-minimal-diff.mdc` | .cursor/skills/fundhub-builder/SKILL.md, .cursor/skills/fundhub-fixer/SKILL.md |
| `.cursor/rules/page-edits-marked-draft.mdc` | `.cursor/rules/page-edits-marked-draft.mdc` | CLAUDE.md |
| `.cursor/rules/proof-cards-from-source.mdc` | `.cursor/rules/proof-cards-from-source.mdc` | CLAUDE.md |
| `.cursor/rules/rules-for-claude-and-cursor.mdc` | `.cursor/rules/rules-for-claude-and-cursor.mdc` | CLAUDE.md |
| `.cursor/rules/secrets-env-law.mdc` | `.cursor/rules/secrets-env-law.mdc` | CLAUDE.md |
| `.cursor/rules/slo-one-filmed-folder.mdc` | `.cursor/rules/slo-one-filmed-folder.mdc` | CLAUDE.md |
| `.cursor/rules/test-means-human-click.mdc` | `.cursor/rules/test-means-human-click.mdc` | .cursor/skills/fundhub-fixer/SKILL.md |
| `.cursor/rules/three-step-repair.mdc` | `.cursor/rules/three-step-repair.mdc` | .cursor/rules/audit-vs-fix-router.mdc |
| `.cursor/rules/ux-guidance-urls-first.mdc` | `.cursor/rules/ux-guidance-urls-first.mdc` | .claude/rules/rules-for-claude-and-cursor.md, .cursor/rules/rules-for-claude-and-cursor.mdc, CLAUDE.md |
| `.cursor/rules/video-4k-unless-ad.mdc` | `.cursor/rules/video-4k-unless-ad.mdc` | CLAUDE.md |
| `.cursor/skills` | `.cursor/skills` | .cursor/skills/fundhub-repo-hygiene/SKILL.md |
| `.cursor/skills/fundhub-agent-tester/SKILL.md` | `.cursor/skills/fundhub-agent-tester/SKILL.md` | .cursor/rules/audit-vs-fix-router.mdc, .cursor/skills/fundhub-system-map/SKILL.md |
| `.cursor/skills/fundhub-auditor` | `.cursor/skills/fundhub-auditor` | .cursor/skills/fundhub-repo-hygiene/SKILL.md |
| `.cursor/skills/fundhub-auditor/SKILL.md` | `.cursor/skills/fundhub-auditor/SKILL.md` | .cursor/rules/audit-vs-fix-router.mdc |
| `.cursor/skills/fundhub-builder` | `.cursor/skills/fundhub-builder` | .cursor/skills/fundhub-repo-hygiene/SKILL.md |
| `.cursor/skills/fundhub-builder/SKILL.md` | `.cursor/skills/fundhub-builder/SKILL.md` | .cursor/rules/audit-vs-fix-router.mdc |
| `.cursor/skills/fundhub-clickfunnels-html-push/SKILL.md` | `.cursor/skills/fundhub-clickfunnels-html-push/SKILL.md` | .claude/rules/chris-never-clickfunnels.md, .claude/skills/fundhub-clickfunnels-html-push/SKILL.md, .cursor/rules/chris-never-clickfunnels.mdc, .cursor/rules/clickfunnels-html-api-push.mdc |
| `.cursor/skills/fundhub-fixer` | `.cursor/skills/fundhub-fixer` | .cursor/skills/fundhub-repo-hygiene/SKILL.md |
| `.cursor/skills/fundhub-fixer/SKILL.md` | `.cursor/skills/fundhub-fixer/SKILL.md` | .cursor/rules/audit-vs-fix-router.mdc |
| `.cursor/skills/fundhub-orchestrator` | `.cursor/skills/fundhub-orchestrator` | .cursor/skills/fundhub-repo-hygiene/SKILL.md |
| `.cursor/skills/fundhub-orchestrator/SKILL.md` | `.cursor/skills/fundhub-orchestrator/SKILL.md` | .cursor/rules/audit-vs-fix-router.mdc |
| `.cursor/skills/fundhub-perf-auditor` | `.cursor/skills/fundhub-perf-auditor` | .cursor/skills/fundhub-repo-hygiene/SKILL.md |
| `.cursor/skills/fundhub-perf-auditor/SKILL.md` | `.cursor/skills/fundhub-perf-auditor/SKILL.md` | .cursor/rules/audit-vs-fix-router.mdc |
| `.cursor/skills/fundhub-repo-hygiene` | `.cursor/skills/fundhub-repo-hygiene` | .cursor/skills/fundhub-version-control/SKILL.md |
| `.cursor/skills/fundhub-repo-hygiene/SKILL.md` | `.cursor/skills/fundhub-repo-hygiene/SKILL.md` | .cursor/rules/repo-hygiene-vc-router.mdc |
| `.cursor/skills/fundhub-ui-auditor` | `.cursor/skills/fundhub-ui-auditor` | .cursor/skills/fundhub-repo-hygiene/SKILL.md |
| `.cursor/skills/fundhub-ui-auditor/SKILL.md` | `.cursor/skills/fundhub-ui-auditor/SKILL.md` | .cursor/rules/audit-vs-fix-router.mdc, .cursor/rules/ui-standards.mdc |
| `.cursor/skills/fundhub-version-control` | `.cursor/skills/fundhub-version-control` | .cursor/skills/fundhub-repo-hygiene/SKILL.md |
| `.cursor/skills/fundhub-version-control/SKILL.md` | `.cursor/skills/fundhub-version-control/SKILL.md` | .cursor/rules/repo-hygiene-vc-router.mdc |
| `.env.example` | `.env.example` | .claude/rules/secrets-env-law.md, .cursor/rules/secrets-env-law.mdc, .cursor/skills/fundhub-version-control/SKILL.md, CLAUDE.md |
| `.github/workflows/tests.yml` | `.github/workflows/tests.yml` | CLAUDE.md |
| `.gitignore` | `.gitignore` | .cursor/skills/fundhub-repo-hygiene/SKILL.md |
| `.mcp.json` | `.mcp.json` | .agents/skills/supabase/SKILL.md |
| `CLAUDE.md` | `CLAUDE.md` | .claude/rules/rules-for-claude-and-cursor.md, .cursor/rules/agentic-audit-guardrails.mdc, .cursor/rules/audit-vs-fix-router.mdc, .cursor/rules/full-end-to-end-audit.mdc, .cursor/rules/one-step-adhd.mdc, .cursor/rules/owner-scope-minimal-diff.mdc, .cursor/rules/rules-for-claude-and-cursor.mdc, .cursor/rules/verify-scratch-only.mdc, .cursor/skills/fundhub-ad-writer/SKILL.md, .cursor/skills/fundhub-auditor/SKILL.md, .cursor/skills/fundhub-fixer/SKILL.md, .cursor/skills/fundhub-repo-hygiene/SKILL.md, .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md, .cursor/skills/fundhub-version-control/SKILL.md, .cursor/rules/build-spec-then-backend-then-frontend.mdc |
| `clickfunnels-fragments` | `marketing/landing-pages` | .claude/rules/chris-never-clickfunnels.md, .cursor/rules/chris-never-clickfunnels.mdc, .cursor/rules/clickfunnels-developers-docs.mdc, .cursor/rules/clickfunnels-html-api-push.mdc, .cursor/skills/fundhub-clickfunnels-html-push/SKILL.md |
| `clickfunnels-fragments/slo/fundhub-proof-cards.html` | `marketing/landing-pages/slo/fundhub-proof-cards.html` | .claude/rules/proof-cards-from-source.md, .cursor/rules/proof-cards-from-source.mdc |
| `clickfunnels-fragments/slo/preview/reorg-draft-build.mjs` | `marketing/landing-pages/slo/preview/reorg-draft-build.mjs` | .claude/rules/page-edits-marked-draft.md, .cursor/rules/page-edits-marked-draft.mdc |
| `clickfunnels-fragments/tracking-manifest.mjs` | `marketing/landing-pages/tracking-manifest.mjs` | .cursor/skills/fundhub-clickfunnels-html-push/SKILL.md |
| `content/testimonials/testimonials.json` | `marketing/testimonials/testimonials.json` | .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md |
| `fundhub-brand.css` | `docs/rules/fundhub-brand.css` | .cursor/rules/ui-standards.mdc, .cursor/skills/fundhub-builder/SKILL.md, .cursor/skills/fundhub-ui-auditor/SKILL.md |
| `netlify.toml` | `netlify.toml` | CLAUDE.md |
| `scripts` | `scripts` | CLAUDE.md |
| `scripts/ad-video-move-takes-to-raw.mjs` | `archive/scripts/ad-video-move-takes-to-raw.mjs` | .claude/rules/slo-one-filmed-folder.md, .cursor/rules/slo-one-filmed-folder.mdc |
| `scripts/ads/check-script.mjs` | `marketing/ads/scripts/check-script.mjs` | .cursor/skills/fundhub-ad-writer/SKILL.md |
| `scripts/cf-push-custom-html.mjs` | `marketing/landing-pages/scripts/cf-push-custom-html.mjs` | .claude/rules/chris-never-clickfunnels.md, .claude/skills/fundhub-clickfunnels-html-push/SKILL.md, .cursor/rules/chris-never-clickfunnels.mdc, .cursor/rules/clickfunnels-html-api-push.mdc, .cursor/skills/fundhub-clickfunnels-html-push/SKILL.md, .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md |
| `scripts/flywheel/status.mjs` | `marketing/flywheel/scripts/status.mjs` | .claude/commands/flywheel.md |
| `scripts/gate-relay/index.mjs` | `apps/platform/scripts/gate-relay/index.mjs` | .cursor/skills/fundhub-builder/SKILL.md, .cursor/skills/fundhub-orchestrator/SKILL.md |
| `scripts/lenders-import-alec.mjs` | `apps/platform/scripts/lenders-import-alec.mjs` | CLAUDE.md |
| `scripts/ship.mjs` | `apps/platform/scripts/ship.mjs` | CLAUDE.md |
| `scripts/testimonials/build-slots.mjs` | `marketing/testimonials/scripts/build-slots.mjs` | .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md |
| `scripts/testimonials/proof-slots.mjs` | `marketing/testimonials/scripts/proof-slots.mjs` | .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md |
| `scripts/testimonials/render-thumbnails.mjs` | `marketing/testimonials/scripts/render-thumbnails.mjs` | .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md |
| `TODO.md` | `TODO.md` | CLAUDE.md |

Rules that name a whole pattern rather than a path (W5 should still read them): `CLAUDE.md` names `scripts/**` (npm test glob, §12) and `.claude/skills/<name>` / `.cursor/skills/<name>/` / `.cursor/rules/<name>.mdc` / `.claude/rules/<name>.md`; `.cursor/rules/chris-never-clickfunnels.mdc` and `clickfunnels-html-api-push.mdc` name `clickfunnels-fragments/**`; `.cursor/skills/fundhub-repo-hygiene/SKILL.md` names `.cursor/skills/fundhub-*`.

Of these, the ones that **move** (rule text must change in W5):

- `clickfunnels-fragments` → `marketing/landing-pages` (named by .claude/rules/chris-never-clickfunnels.md, .cursor/rules/chris-never-clickfunnels.mdc, .cursor/rules/clickfunnels-developers-docs.mdc, .cursor/rules/clickfunnels-html-api-push.mdc, .cursor/skills/fundhub-clickfunnels-html-push/SKILL.md)
- `clickfunnels-fragments/slo/fundhub-proof-cards.html` → `marketing/landing-pages/slo/fundhub-proof-cards.html` (named by .claude/rules/proof-cards-from-source.md, .cursor/rules/proof-cards-from-source.mdc)
- `clickfunnels-fragments/slo/preview/reorg-draft-build.mjs` → `marketing/landing-pages/slo/preview/reorg-draft-build.mjs` (named by .claude/rules/page-edits-marked-draft.md, .cursor/rules/page-edits-marked-draft.mdc)
- `clickfunnels-fragments/tracking-manifest.mjs` → `marketing/landing-pages/tracking-manifest.mjs` (named by .cursor/skills/fundhub-clickfunnels-html-push/SKILL.md)
- `content/testimonials/testimonials.json` → `marketing/testimonials/testimonials.json` (named by .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md)
- `fundhub-brand.css` → `docs/rules/fundhub-brand.css` (named by .cursor/rules/ui-standards.mdc, .cursor/skills/fundhub-builder/SKILL.md, .cursor/skills/fundhub-ui-auditor/SKILL.md)
- `scripts` → `scripts` (named by CLAUDE.md)
- `scripts/ad-video-move-takes-to-raw.mjs` → `archive/scripts/ad-video-move-takes-to-raw.mjs` (named by .claude/rules/slo-one-filmed-folder.md, .cursor/rules/slo-one-filmed-folder.mdc)
- `scripts/ads/check-script.mjs` → `marketing/ads/scripts/check-script.mjs` (named by .cursor/skills/fundhub-ad-writer/SKILL.md)
- `scripts/cf-push-custom-html.mjs` → `marketing/landing-pages/scripts/cf-push-custom-html.mjs` (named by .claude/rules/chris-never-clickfunnels.md, .claude/skills/fundhub-clickfunnels-html-push/SKILL.md, .cursor/rules/chris-never-clickfunnels.mdc, .cursor/rules/clickfunnels-html-api-push.mdc, .cursor/skills/fundhub-clickfunnels-html-push/SKILL.md, .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md)
- `scripts/flywheel/status.mjs` → `marketing/flywheel/scripts/status.mjs` (named by .claude/commands/flywheel.md)
- `scripts/gate-relay/index.mjs` → `apps/platform/scripts/gate-relay/index.mjs` (named by .cursor/skills/fundhub-builder/SKILL.md, .cursor/skills/fundhub-orchestrator/SKILL.md)
- `scripts/lenders-import-alec.mjs` → `apps/platform/scripts/lenders-import-alec.mjs` (named by CLAUDE.md)
- `scripts/ship.mjs` → `apps/platform/scripts/ship.mjs` (named by CLAUDE.md)
- `scripts/testimonials/build-slots.mjs` → `marketing/testimonials/scripts/build-slots.mjs` (named by .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md)
- `scripts/testimonials/proof-slots.mjs` → `marketing/testimonials/scripts/proof-slots.mjs` (named by .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md)
- `scripts/testimonials/render-thumbnails.mjs` → `marketing/testimonials/scripts/render-thumbnails.mjs` (named by .cursor/skills/fundhub-testimonial-thumbnails/SKILL.md)

## package.json scripts that name a path in this slice

All of `package.json` stays at root, so every one of these command lines needs its path rewritten in W5.

| npm script | Runs | Proposed new path |
|---|---|---|
| `lint` | `node scripts/lint.mjs` | `apps/platform/scripts/lint.mjs` |
| `ship` | `node scripts/ship.mjs` | `apps/platform/scripts/ship.mjs` |
| `migrations:manifest` | `node scripts/db/expected-migrations.mjs` | `apps/platform/scripts/db/expected-migrations.mjs` |
| `artifact` | `node scripts/build-artifact.mjs` | `apps/platform/scripts/build-artifact.mjs` |
| `diagrams` | `node scripts/diagrams/generate.mjs` | `apps/platform/scripts/diagrams/generate.mjs` |
| `diagrams:check` | `node scripts/diagrams/generate.mjs --check` | `apps/platform/scripts/diagrams/generate.mjs` |
| `ads:check` | `node scripts/ads/check-script.mjs` | `marketing/ads/scripts/check-script.mjs` |
| `journeys` | `node scripts/journeys/generate.mjs` | `apps/platform/scripts/journeys/generate.mjs` |
| `journeys:check` | `node scripts/journeys/generate.mjs --check` | `apps/platform/scripts/journeys/generate.mjs` |
| `test` | `node scripts/run-suite.mjs` | `apps/platform/scripts/run-suite.mjs` |
| `verify:e2e` | `node scripts/run-e2e-verification.mjs` | `apps/platform/scripts/run-e2e-verification.mjs` |
| `sim:report` | `node scripts/purge-sim-data.mjs report` | `apps/platform/scripts/purge-sim-data.mjs` |
| `sim:hide` | `node scripts/purge-sim-data.mjs flag` | `apps/platform/scripts/purge-sim-data.mjs` |
| `sim:purge` | `node scripts/purge-sim-data.mjs delete` | `apps/platform/scripts/purge-sim-data.mjs` |
| `gate-relay` | `node scripts/gate-relay/index.mjs` | `apps/platform/scripts/gate-relay/index.mjs` |
| `notion:login` | `NOTION_HEADFUL=1 node scripts/notion-legacy-pull.mjs --login` | `ops/scripts/notion-legacy-pull.mjs` |
| `notion:pull` | `node scripts/notion-legacy-pull.mjs --pull` | `ops/scripts/notion-legacy-pull.mjs` |
| `notion:transcribe` | `node scripts/notion-legacy-transcribe.mjs` | `ops/scripts/notion-legacy-transcribe.mjs` |
| `notion:organize` | `node scripts/notion-legacy-organize.mjs` | `ops/scripts/notion-legacy-organize.mjs` |
| `notion:vimeo` | `node scripts/notion-vimeo-watch.mjs` | `ops/scripts/notion-vimeo-watch.mjs` |
| `notion:retry` | `node scripts/notion-retry-failed.mjs` | `ops/scripts/notion-retry-failed.mjs` |
| `notion:captions` | `node scripts/notion-vimeo-captions.mjs` | `ops/scripts/notion-vimeo-captions.mjs` |
| `notion:sweep` | `node scripts/notion-final-sweep.mjs` | `ops/scripts/notion-final-sweep.mjs` |
| `notion:finish` | `node scripts/notion-finish-pass.mjs` | `ops/scripts/notion-finish-pass.mjs` |
| `notion:files` | `node scripts/notion-pull-files.mjs` | `ops/scripts/notion-pull-files.mjs` |
| `notion:resume` | `node scripts/notion-resume-pull.mjs` | `ops/scripts/notion-resume-pull.mjs` |
| `notion:verify` | `node scripts/notion-legacy-verify.mjs` | `ops/scripts/notion-legacy-verify.mjs` |
| `notion:all` | `node scripts/notion-legacy-all.mjs` | `ops/scripts/notion-legacy-all.mjs` |
| `lenders:audit` | `node scripts/lenders-audit/run.mjs` | `apps/platform/scripts/lenders-audit/run.mjs` |
| `lenders:audit:apply` | `node scripts/lenders-audit/apply-manifest.mjs` | `apps/platform/scripts/lenders-audit/apply-manifest.mjs` |
| `flywheel:status` | `node scripts/flywheel/status.mjs` | `marketing/flywheel/scripts/status.mjs` |
| `marketing:data:health` | `node scripts/marketing-data-health.mjs` | `apps/platform/scripts/marketing-data-health.mjs` |
| `marketing:data:bootstrap` | `node scripts/marketing-data-bootstrap.mjs` | `apps/platform/scripts/marketing-data-bootstrap.mjs` |

Root-file scripts (stay put, listed for completeness): `test:e2e` → `playwright.config.mjs`, `test:e2e:live` → `playwright.live.config.mjs`. Not in this slice: `migrate` → `db/migrate.mjs`, `guard:db` / `guard:rls` → `src/security/*.test.mjs`.

## .github/workflows/tests.yml steps that reach this slice

| Job | Step | Command | Path in this slice |
|---|---|---|---|
| unit | Lint | `npm run lint` | `scripts/lint.mjs` → `apps/platform/scripts/lint.mjs` |
| unit | Run the suite | `npm test` | `scripts/run-suite.mjs` → `apps/platform/scripts/run-suite.mjs` |
| unit, browser, postgres | Install dependencies | `npm ci` | `package-lock.json` (stays) |
| browser | Screens | `npm run test:e2e` | `playwright.config.mjs` (stays) |
| browser | upload-artifact (on failure) | `path: test-results/` | `test-results/` (gitignored, stays) |
| postgres | Migration manifest is not stale | `npm run migrations:manifest` | `scripts/db/expected-migrations.mjs` → `apps/platform/scripts/db/expected-migrations.mjs` (it also diffs `db/expected-migrations.mjs`) |
| postgres | Run the suite against Postgres | `npm test` | `scripts/run-suite.mjs` |
| postgres | The app role holds no superuser-level privilege | `npm run guard:db` | none (src/) |

The file header also names `scripts/lint.mjs` in a comment.

## Other config lines that point at this slice

- `netlify.toml` `[functions] included_files` → `"scripts/black-reports/**"`. Netlify bundles that folder into every function. Moves to `apps/platform/scripts/black-reports/**`.
- `tsconfig.json` `include` → `"scripts/**/*.mjs"` (with src, api, db). The tsc gate stops checking scripts unless updated.
- `scripts/run-suite.mjs` (`npm test`) walks `ROOT/src` and `ROOT/scripts` for tests. Tests that leave `apps/platform/scripts/` stop running unless the walker learns the new folders: `marketing/ads/scripts/check-script.test.mjs` and `marketing/flywheel/scripts/status.test.mjs`. (CLAUDE.md §12 trap: a test outside the glob silently never runs.)
- `scripts/lint.mjs` ROOTS = `src, scripts, api, netlify, db, public, extension` under `ROOT = ..`. After the move ROOT is `apps/platform`, so `extension` (→ `apps/extension`) and any script moved to marketing/ or ops/ drop out of lint.
- `.claude/settings.json` allow list: `Bash(node scripts/ship.mjs)` and `Bash(node scripts/ship.mjs:*)`. CLAUDE.md §11 law: these allow rules must never be removed — W5 must add the new path, not delete the old.
- `CLAUDE.md` names `scripts/ship.mjs` (§11, ship law) and `scripts/lenders-import-alec.mjs` (§2).
- `src/underwrite/black-report-pdf.mjs` → `join(HERE, "../../scripts/black-reports/fundhub_gen.py")`. Holds only if `src/` and `scripts/black-reports/` both land under `apps/platform/` (as proposed).
- `render-service/wsgi.py` → `HERE.parent / "scripts" / "black-reports" / "fundhub_gen.py"` (checkout fallback). Breaks if render-service moves to `apps/render-service/` and black-reports to `apps/platform/scripts/`. (W2 owns that file.)
- `src/messaging/seed/collect.mjs` → `path.resolve(REPO, "fundhub-docs/sources")`. Holds if fundhub-docs moves to `apps/platform/` with src.
- `clickfunnels-fragments/package.json` + `playwright.config.mjs` — own npm package; all paths inside are relative, so it moves as one block.
- `.cursor/hooks.json` → `.cursor/hooks/warn-secret-stage.cjs` (both stay).

## Root files read by src tests through ROOT (break when src moves and the file stays at root)

These tests compute `ROOT` as `src/..`. After `src/` moves to `apps/platform/src/`, ROOT becomes `apps/platform/`, but these files stay at the repo root by the Brief's stay list:

- `CLAUDE.md` ← `src/ui/screen-standard.test.mjs` (`path.join(ROOT, "CLAUDE.md")`)
- `netlify.toml` ← `src/security/migrations-production-only.test.mjs`, `src/http/scheduled-functions-return.test.mjs` (`path.join(ROOT, "netlify.toml")`); `src/creative/runner-cron.test.mjs`, `src/http/optimize-html.test.mjs`, `src/messaging/staff-sweeper.pg.test.mjs`, `src/social/publish-sweeper.test.mjs` (`"../../netlify.toml"`)
- `playwright.config.mjs`, `playwright.live.config.mjs` ← `src/http/launch-proof-fixtures.test.mjs` (`new URL(path, ROOT)`, also reads `scripts/launch-proof-fixtures.mjs`)
- `DEPLOY.md` ← `src/http/monitoring.test.mjs` — handled by moving DEPLOY.md to `apps/platform/`.

## .claude/skills symlinks

All stay. Targets are relative and both ends stay at root, so the links keep working.

| Link | Target | Resolves |
|---|---|---|
| `.claude/skills/fundhub-agent-tester` | `../../.cursor/skills/fundhub-agent-tester` | yes |
| `.claude/skills/fundhub-auditor` | `../../.cursor/skills/fundhub-auditor` | yes |
| `.claude/skills/fundhub-builder` | `../../.cursor/skills/fundhub-builder` | yes |
| `.claude/skills/fundhub-fixer` | `../../.cursor/skills/fundhub-fixer` | yes |
| `.claude/skills/fundhub-orchestrator` | `../../.cursor/skills/fundhub-orchestrator` | yes |
| `.claude/skills/fundhub-perf-auditor` | `../../.cursor/skills/fundhub-perf-auditor` | yes |
| `.claude/skills/fundhub-repo-hygiene` | `../../.cursor/skills/fundhub-repo-hygiene` | yes |
| `.claude/skills/fundhub-system-map` | `../../.cursor/skills/fundhub-system-map` | yes |
| `.claude/skills/fundhub-testimonial-thumbnails` | `../../.cursor/skills/fundhub-testimonial-thumbnails` | yes |
| `.claude/skills/fundhub-ui-auditor` | `../../.cursor/skills/fundhub-ui-auditor` | yes |
| `.claude/skills/fundhub-version-control` | `../../.cursor/skills/fundhub-version-control` | yes |
| `.claude/skills/supabase` | `../../.agents/skills/supabase` | yes |
| `.claude/skills/supabase-postgres-best-practices` | `../../.agents/skills/supabase-postgres-best-practices` | yes |

Real folders (not links): `.claude/skills/clickfunnels-developers-docs/`, `.claude/skills/fundhub-clickfunnels-html-push/`. `.cursor/skills/fundhub-ad-writer/` has no `.claude/skills` link.

## Scripts that build paths at runtime (path.join / resolve / new URL with import.meta.url, __dirname or process.cwd)

`k` = how many `..` the script climbs from its own folder to its root. Verdict compares where it would look after the proposed move with where the target actually lands. Archive-bound files are left out.

**Would break if moved as proposed:**

| File | Proposed path | k | Breaks |
|---|---|---|---|
| `clickfunnels-fragments/preview/thank-you-draft-build.mjs` | `marketing/landing-pages/preview/thank-you-draft-build.mjs` | 2 | clickfunnels-fragments: breaks (would look in marketing/clickfunnels-fragments, lands in marketing/landing-pages); public: breaks (would look in marketing/public, lands in apps/platform/public) |
| `clickfunnels-fragments/slo/client-wins/upload-deck-images.mjs` | `marketing/landing-pages/slo/client-wins/upload-deck-images.mjs` | 3 | .env: breaks (would look in marketing/.env, lands in .env) |
| `scripts/ad-scripts-load-locked.mjs` | `marketing/ads/slo/scripts/ad-scripts-load-locked.mjs` | 1 | src: breaks (would look in marketing/ads/slo/src, lands in apps/platform/src); docs: breaks (would look in marketing/ads/slo/docs, lands in docs) |
| `scripts/ads/check-script.test.mjs` | `marketing/ads/scripts/check-script.test.mjs` | 2 | docs: breaks (would look in marketing/docs, lands in docs); .claude: breaks (would look in marketing/.claude, lands in .claude) |
| `scripts/broll-record.mjs` | `marketing/ads/slo/scripts/broll-record.mjs` | 1 | docs: breaks (would look in marketing/ads/slo/docs, lands in docs); clickfunnels-fragments: breaks (would look in marketing/ads/slo/clickfunnels-fragments, lands in marketing/landing-pages); public: breaks (would look in marketing/ads/slo/public, lands in apps/platform/public); src: breaks (would look in marketing/ads/slo/src, lands in apps/platform/src) |
| `scripts/build-crm-artifact.mjs` | `apps/platform/scripts/build-crm-artifact.mjs` | 1 | docs: breaks (would look in apps/platform/docs, lands in docs) |
| `scripts/cf-push-custom-html.mjs` | `marketing/landing-pages/scripts/cf-push-custom-html.mjs` | 1 | .env: breaks (would look in marketing/landing-pages/.env, lands in .env); docs: breaks (would look in marketing/landing-pages/docs, lands in docs); src: breaks (would look in marketing/landing-pages/src, lands in apps/platform/src); clickfunnels-fragments: breaks (would look in marketing/landing-pages/clickfunnels-fragments, lands in marketing/landing-pages) |
| `scripts/extract-airtable.mjs` | `ops/scripts/extract-airtable.mjs` | 1 | fundhub-docs: breaks (would look in ops/fundhub-docs, lands in apps/platform/fundhub-docs) |
| `scripts/flywheel/status.mjs` | `marketing/flywheel/scripts/status.mjs` | 2 | docs: breaks (would look in marketing/docs, lands in docs) |
| `scripts/gmail-probe.mjs` | `apps/platform/scripts/gmail-probe.mjs` | 1 | .env: breaks (would look in apps/platform/.env, lands in .env) |
| `scripts/lenders-add-personal-loans.mjs` | `apps/platform/scripts/lenders-add-personal-loans.mjs` | 1 | credentials: breaks (would look in apps/platform/credentials, lands in credentials) |
| `scripts/lenders-audit/apply-manifest.mjs` | `apps/platform/scripts/lenders-audit/apply-manifest.mjs` | 2 | credentials: breaks (would look in apps/platform/credentials, lands in credentials) |
| `scripts/lenders-audit/run.mjs` | `apps/platform/scripts/lenders-audit/run.mjs` | 2 | credentials: breaks (would look in apps/platform/credentials, lands in credentials) |
| `scripts/lenders-import-alec.mjs` | `apps/platform/scripts/lenders-import-alec.mjs` | 1 | credentials: breaks (would look in apps/platform/credentials, lands in credentials) |
| `scripts/lenders-import-carl-barton.mjs` | `apps/platform/scripts/lenders-import-carl-barton.mjs` | 1 | credentials: breaks (would look in apps/platform/credentials, lands in credentials) |
| `scripts/lenders-merge-crm-into-csv.mjs` | `apps/platform/scripts/lenders-merge-crm-into-csv.mjs` | 1 | credentials: breaks (would look in apps/platform/credentials, lands in credentials) |
| `scripts/lenders-personal-apply-urls.mjs` | `apps/platform/scripts/lenders-personal-apply-urls.mjs` | 1 | credentials: breaks (would look in apps/platform/credentials, lands in credentials) |
| `scripts/lenders-sync-csv-after-cleanup.mjs` | `apps/platform/scripts/lenders-sync-csv-after-cleanup.mjs` | 1 | docs: breaks (would look in apps/platform/docs, lands in docs); credentials: breaks (would look in apps/platform/credentials, lands in credentials) |
| `scripts/load-env.mjs` | `apps/platform/scripts/load-env.mjs` | 1 | .env: breaks (would look in apps/platform/.env, lands in .env) |
| `scripts/notion-legacy-all.mjs` | `ops/scripts/notion-legacy-all.mjs` | 1 | credentials: breaks (would look in ops/credentials, lands in credentials) |
| `scripts/notion-scrape/lib.mjs` | `ops/scripts/notion-scrape/lib.mjs` | 2 | credentials: breaks (would look in ops/credentials, lands in credentials) |
| `scripts/prove-soft-pull-live.mjs` | `apps/platform/scripts/prove-soft-pull-live.mjs` | 1 | .env: breaks (would look in apps/platform/.env, lands in .env) |
| `scripts/repull-prove-crs.mjs` | `apps/platform/scripts/repull-prove-crs.mjs` | 1 | .env: breaks (would look in apps/platform/.env, lands in .env) |
| `scripts/run-e2e-verification.mjs` | `apps/platform/scripts/run-e2e-verification.mjs` | 1 | docs: breaks (would look in apps/platform/docs, lands in docs) |
| `scripts/ship.mjs` | `apps/platform/scripts/ship.mjs` | 1 | docs: breaks (would look in apps/platform/docs, lands in docs); .claude: breaks (would look in apps/platform/.claude, lands in .claude) |
| `scripts/sim/make-documents.mjs` | `apps/platform/scripts/sim/make-documents.mjs` | 2 | docs: breaks (would look in apps/platform/docs, lands in docs); credentials: breaks (would look in apps/platform/credentials, lands in credentials) |
| `scripts/sim/put-identity-on-file.mjs` | `apps/platform/scripts/sim/put-identity-on-file.mjs` | 2 | credentials: breaks (would look in apps/platform/credentials, lands in credentials) |
| `scripts/testimonials/build-slots.mjs` | `marketing/testimonials/scripts/build-slots.mjs` | 2 | content: breaks (would look in marketing/content, lands in content); clickfunnels-fragments: breaks (would look in marketing/clickfunnels-fragments, lands in marketing/landing-pages) |
| `scripts/testimonials/proof-slots.mjs` | `marketing/testimonials/scripts/proof-slots.mjs` | 2 | clickfunnels-fragments: breaks (would look in marketing/clickfunnels-fragments, lands in marketing/landing-pages); docs: breaks (would look in marketing/docs, lands in docs); public: breaks (would look in marketing/public, lands in apps/platform/public) |
| `scripts/testimonials/render-thumbnails.mjs` | `marketing/testimonials/scripts/render-thumbnails.mjs` | 2 | content: breaks (would look in marketing/content, lands in content); public: breaks (would look in marketing/public, lands in apps/platform/public) |

**Root depth not parsed or folder split — W5 must read these by hand:**

| File | Proposed path | Anchor | Reaches |
|---|---|---|---|
| `clickfunnels-fragments/harness/_shell.js` | `marketing/landing-pages/harness/_shell.js` | __dirname+import.meta.url | (own folder or none parsed) — anchor found, root depth not parsed: check |
| `clickfunnels-fragments/harness/static-server.mjs` | `marketing/landing-pages/harness/static-server.mjs` | import.meta.url | (own folder or none parsed) — anchor found, root depth not parsed: check |
| `clickfunnels-fragments/slo/client-wins/build-deck.mjs` | `marketing/landing-pages/slo/client-wins/build-deck.mjs` | import.meta.url | clickfunnels-fragments — anchor found, root depth not parsed: check |
| `clickfunnels-fragments/slo/preview/build.mjs` | `marketing/landing-pages/slo/preview/build.mjs` | import.meta.url | clickfunnels-fragments — anchor found, root depth not parsed: check |
| `clickfunnels-fragments/slo/preview/reorg-draft-build.mjs` | `marketing/landing-pages/slo/preview/reorg-draft-build.mjs` | import.meta.url | clickfunnels-fragments — anchor found, root depth not parsed: check |
| `clickfunnels-fragments/slo/preview/roadmap-headline-draft-build.mjs` | `marketing/landing-pages/slo/preview/roadmap-headline-draft-build.mjs` | import.meta.url | clickfunnels-fragments — anchor found, root depth not parsed: check |
| `clickfunnels-fragments/slo/preview/watch-copy-diff-build.mjs` | `marketing/landing-pages/slo/preview/watch-copy-diff-build.mjs` | import.meta.url | (own folder or none parsed) — anchor found, root depth not parsed: check |
| `clickfunnels-fragments/tests/layout.spec.mjs` | `marketing/landing-pages/tests/layout.spec.mjs` | __dirname+import.meta.url | (own folder or none parsed) — anchor found, root depth not parsed: check |
| `playwright.live.config.mjs` | `playwright.live.config.mjs` | import.meta.url | docs — anchor found, root depth not parsed: check |
| `scripts/ads/check-script.mjs` | `marketing/ads/scripts/check-script.mjs` | import.meta.url | docs — anchor found, root depth not parsed: check |
| `scripts/black-reports/regen-w10-pack.mjs` | `apps/platform/scripts/black-reports/regen-w10-pack.mjs` | import.meta.url | docs src scripts — scripts: split folder, check |
| `scripts/build-artifact.mjs` | `apps/platform/scripts/build-artifact.mjs` | import.meta.url k=1 | public scripts dist — scripts: split folder, check |
| `scripts/daily-pulse.mjs` | `apps/platform/scripts/daily-pulse.mjs` | import.meta.url | src — anchor found, root depth not parsed: check |
| `scripts/db/expected-migrations.mjs` | `apps/platform/scripts/db/expected-migrations.mjs` | import.meta.url+process.cwd() | db — cwd-relative: works only if run from repo root and targets stay put |
| `scripts/db/find-test-data.mjs` | `apps/platform/scripts/db/find-test-data.mjs` | import.meta.url | src — anchor found, root depth not parsed: check |
| `scripts/diagrams/generate.mjs` | `apps/platform/scripts/diagrams/generate.mjs` | import.meta.url | docs — anchor found, root depth not parsed: check |
| `scripts/gate-relay/index.mjs` | `apps/platform/scripts/gate-relay/index.mjs` | import.meta.url k=2 | scripts — scripts: split folder, check |
| `scripts/gen-custom-field-migration.mjs` | `apps/platform/scripts/gen-custom-field-migration.mjs` | import.meta.url | db — anchor found, root depth not parsed: check |
| `scripts/inngest-register.mjs` | `apps/platform/scripts/inngest-register.mjs` | import.meta.url | (own folder or none parsed) — anchor found, root depth not parsed: check |
| `scripts/inngest-register.test.mjs` | `apps/platform/scripts/inngest-register.test.mjs` | import.meta.url | (own folder or none parsed) — anchor found, root depth not parsed: check |
| `scripts/joshify-templates.mjs` | `apps/platform/scripts/joshify-templates.mjs` | process.cwd() | fundhub-docs src docs db — cwd-relative: works only if run from repo root and targets stay put |
| `scripts/journeys/generate.mjs` | `apps/platform/scripts/journeys/generate.mjs` | import.meta.url | docs — anchor found, root depth not parsed: check |
| `scripts/launch-proof-fixtures.mjs` | `apps/platform/scripts/launch-proof-fixtures.mjs` | import.meta.url | src — anchor found, root depth not parsed: check |
| `scripts/lenders-extract-bureaus.mjs` | `apps/platform/scripts/lenders-extract-bureaus.mjs` | import.meta.url | docs credentials scripts — scripts: split folder, check |
| `scripts/lenders-extract-personal.mjs` | `apps/platform/scripts/lenders-extract-personal.mjs` | import.meta.url | credentials src — anchor found, root depth not parsed: check |
| `scripts/marketing/make-sample.mjs` | `apps/platform/scripts/marketing/make-sample.mjs` | import.meta.url | (own folder or none parsed) — anchor found, root depth not parsed: check |
| `scripts/marketing/migrate.mjs` | `apps/platform/scripts/marketing/migrate.mjs` | import.meta.url | db src — anchor found, root depth not parsed: check |
| `scripts/notion-finish-pass.mjs` | `ops/scripts/notion-finish-pass.mjs` | import.meta.url k=1 | scripts — scripts: split folder, check |
| `scripts/retention-purge.mjs` | `apps/platform/scripts/retention-purge.mjs` | import.meta.url | src — anchor found, root depth not parsed: check |
| `scripts/run-suite.mjs` | `apps/platform/scripts/run-suite.mjs` | import.meta.url k=1 | src scripts — scripts: split folder, check |
| `scripts/sim/push-credit.mjs` | `apps/platform/scripts/sim/push-credit.mjs` | import.meta.url | src — anchor found, root depth not parsed: check |
| `scripts/sim/push-credit.test.mjs` | `apps/platform/scripts/sim/push-credit.test.mjs` | import.meta.url | src — anchor found, root depth not parsed: check |
| `scripts/sim/push-payment.mjs` | `apps/platform/scripts/sim/push-payment.mjs` | import.meta.url | src — anchor found, root depth not parsed: check |
| `scripts/sim/seed-fulfillment-client.mjs` | `apps/platform/scripts/sim/seed-fulfillment-client.mjs` | import.meta.url | src credentials — anchor found, root depth not parsed: check |
| `scripts/sim/set-client-password.mjs` | `apps/platform/scripts/sim/set-client-password.mjs` | import.meta.url | src — anchor found, root depth not parsed: check |
| `scripts/smoke-banking-surface.mjs` | `apps/platform/scripts/smoke-banking-surface.mjs` | import.meta.url k=1 | scripts — scripts: split folder, check |
| `scripts/smoke-finance-os.mjs` | `apps/platform/scripts/smoke-finance-os.mjs` | import.meta.url k=1 | scripts — scripts: split folder, check |

Known by reading: `scripts/load-env.mjs` loads `<ROOT>/.env` with ROOT = `scripts/..`; in `apps/platform/scripts/` it would look for `apps/platform/.env` and find nothing (every script that calls `loadEnv()` loses its env). `scripts/lint.mjs` and `scripts/run-suite.mjs` use ROOT = `scripts/..` and are fine for src/ but miss anything moved out of `apps/platform/`.

**OK under the proposed move:** `clickfunnels-fragments/harness/build.mjs`, `scripts/add-nav-entries.mjs`, `scripts/dev-server.mjs`, `scripts/diagrams/extract.mjs`, `scripts/journeys/extract.mjs`, `scripts/lenders-logos/fetch-logos.mjs`, `scripts/lint.mjs`, `scripts/sync-sidebar.mjs`.

## Relative imports that need rewriting (29)

| From | Imports | Old spec | New spec |
|---|---|---|---|
| `scripts/ad-scripts-load-locked.mjs` | `src/partners/rls.mjs` | `../src/partners/rls.mjs` | `../../../../apps/platform/src/partners/rls.mjs` |
| `scripts/ad-scripts-load-locked.mjs` | `src/db.mjs` | `../src/db.mjs` | `../../../../apps/platform/src/db.mjs` |
| `scripts/ad-video-keep-one-in-raw.mjs` | `src/company-brain/config.mjs` | `../src/company-brain/config.mjs` | `../../../../apps/platform/src/company-brain/config.mjs` |
| `scripts/ad-video-keep-one-in-raw.mjs` | `src/company-brain/auth.mjs` | `../src/company-brain/auth.mjs` | `../../../../apps/platform/src/company-brain/auth.mjs` |
| `scripts/ads/check-registry-titles.mjs` | `src/ads/registry.mjs` | `../../src/ads/registry.mjs` | `../../../apps/platform/src/ads/registry.mjs` |
| `scripts/ads/check-script.mjs` | `docs/ads/rules-data.mjs` | `../../docs/ads/rules-data.mjs` | `../../../docs/ads/rules-data.mjs` |
| `scripts/apply-fundhub-cloudflare-dns.mjs` | `scripts/load-env.mjs` | `load-env.mjs` | `../../apps/platform/scripts/load-env.mjs` |
| `scripts/broll-record.mjs` | `src/metro2/letters/generate.mjs` | `../src/metro2/letters/generate.mjs` | `../../../../apps/platform/src/metro2/letters/generate.mjs` |
| `scripts/broll-record.mjs` | `src/consent/disclosures.mjs` | `../src/consent/disclosures.mjs` | `../../../../apps/platform/src/consent/disclosures.mjs` |
| `scripts/broll-record.mjs` | `src/finance/soft-pull-pricing.mjs` | `../src/finance/soft-pull-pricing.mjs` | `../../../../apps/platform/src/finance/soft-pull-pricing.mjs` |
| `scripts/broll-rename-for-matcher.mjs` | `src/company-brain/config.mjs` | `../src/company-brain/config.mjs` | `../../../apps/platform/src/company-brain/config.mjs` |
| `scripts/broll-rename-for-matcher.mjs` | `src/company-brain/auth.mjs` | `../src/company-brain/auth.mjs` | `../../../apps/platform/src/company-brain/auth.mjs` |
| `scripts/broll-upload-clips.mjs` | `src/company-brain/config.mjs` | `../src/company-brain/config.mjs` | `../../../apps/platform/src/company-brain/config.mjs` |
| `scripts/broll-upload-clips.mjs` | `src/company-brain/auth.mjs` | `../src/company-brain/auth.mjs` | `../../../apps/platform/src/company-brain/auth.mjs` |
| `scripts/cf-push-custom-html.mjs` | `src/analytics/clickfunnels.mjs` | `../src/analytics/clickfunnels.mjs` | `../../../apps/platform/src/analytics/clickfunnels.mjs` |
| `scripts/cf-push-custom-html.mjs` | `src/adplatforms/tokens.mjs` | `../src/adplatforms/tokens.mjs` | `../../../apps/platform/src/adplatforms/tokens.mjs` |
| `scripts/cf-push-custom-html.mjs` | `clickfunnels-fragments/tracking-manifest.mjs` | `../clickfunnels-fragments/tracking-manifest.mjs` | `../tracking-manifest.mjs` |
| `scripts/notion-legacy-transcribe.mjs` | `scripts/load-env.mjs` | `load-env.mjs` | `../../apps/platform/scripts/load-env.mjs` |
| `scripts/notion-rescue-missing.mjs` | `scripts/load-env.mjs` | `load-env.mjs` | `../../apps/platform/scripts/load-env.mjs` |
| `scripts/notion-retry-failed.mjs` | `scripts/load-env.mjs` | `load-env.mjs` | `../../apps/platform/scripts/load-env.mjs` |
| `scripts/notion-vimeo-watch.mjs` | `scripts/load-env.mjs` | `load-env.mjs` | `../../apps/platform/scripts/load-env.mjs` |
| `scripts/proof-crops-publish.mjs` | `src/company-brain/config.mjs` | `../src/company-brain/config.mjs` | `../../../apps/platform/src/company-brain/config.mjs` |
| `scripts/proof-crops-publish.mjs` | `src/company-brain/auth.mjs` | `../src/company-brain/auth.mjs` | `../../../apps/platform/src/company-brain/auth.mjs` |
| `scripts/slo-ads-drive-organize.mjs` | `src/company-brain/config.mjs` | `../src/company-brain/config.mjs` | `../../../../apps/platform/src/company-brain/config.mjs` |
| `scripts/slo-ads-drive-organize.mjs` | `src/company-brain/auth.mjs` | `../src/company-brain/auth.mjs` | `../../../../apps/platform/src/company-brain/auth.mjs` |
| `scripts/slo-broll-upload.mjs` | `src/company-brain/config.mjs` | `../src/company-brain/config.mjs` | `../../../../apps/platform/src/company-brain/config.mjs` |
| `scripts/slo-broll-upload.mjs` | `src/company-brain/auth.mjs` | `../src/company-brain/auth.mjs` | `../../../../apps/platform/src/company-brain/auth.mjs` |
| `scripts/slo-consolidate-filmed-one-folder.mjs` | `src/company-brain/config.mjs` | `../src/company-brain/config.mjs` | `../../../../apps/platform/src/company-brain/config.mjs` |
| `scripts/slo-consolidate-filmed-one-folder.mjs` | `src/company-brain/auth.mjs` | `../src/company-brain/auth.mjs` | `../../../../apps/platform/src/company-brain/auth.mjs` |

`docs/ads/rules-data.mjs` is in W4's slice; its final home decides the new spec for `check-script.mjs`.

## Code outside this slice that points into it (must be updated when these files move)

| Referrer | Points at | Proposed new path |
|---|---|---|
| `src/ads/funnel-proof-scripts.test.mjs` | `clickfunnels-fragments/05-thank-you.html` | `marketing/landing-pages/05-thank-you.html` |
| `src/ads/funnel-proof-scripts.test.mjs` | `clickfunnels-fragments/01-vsl.html` | `marketing/landing-pages/01-vsl.html` |
| `src/ads/utm-funnel-fragments.test.mjs` | `clickfunnels-fragments/01-vsl.html` | `marketing/landing-pages/01-vsl.html` |
| `src/http/apply-survey-webhook.test.mjs` | `clickfunnels-fragments/apply-survey.html` | `marketing/landing-pages/apply-survey.html` |
| `src/ads/book-calendar-framed.test.mjs` | `clickfunnels-fragments/04c-book-framed.html` | `marketing/landing-pages/04c-book-framed.html` |
| `src/ads/book-calendar-framed.test.mjs` | `clickfunnels-fragments/04d-book-fit.html` | `marketing/landing-pages/04d-book-fit.html` |
| `src/consent/disclosures.test.mjs` | `clickfunnels-fragments/slo/slo-01-sales.html` | `marketing/landing-pages/slo/slo-01-sales.html` |
| `src/http/slo-sales-widget-html.test.mjs` | `clickfunnels-fragments/slo/slo-01-sales.html` | `marketing/landing-pages/slo/slo-01-sales.html` |
| `src/ads/book-calendar-framed.test.mjs` | `clickfunnels-fragments/slo/slo-02-booking.html` | `marketing/landing-pages/slo/slo-02-booking.html` |
| `docs/workflows/live-walkthrough-2026-09-16.html` | `clickfunnels-fragments/07-vsl-watch-beacon.html` | `marketing/landing-pages/07-vsl-watch-beacon.html` |
| `src/ads/utm-funnel-fragments.test.mjs` | `clickfunnels-fragments/07-vsl-watch-beacon.html` | `marketing/landing-pages/07-vsl-watch-beacon.html` |
| `docs/workflows/marketing-walkthrough-2026-09-17.html` | `scripts/ads/check-registry-titles.mjs` | `marketing/ads/scripts/check-registry-titles.mjs` |
| `docs/workflows/portal-dispute-round-prove-2026-09-20/client-prove.mjs` | `scripts/load-env.mjs` | `apps/platform/scripts/load-env.mjs` |
| `docs/workflows/portal-dispute-round-prove-2026-09-20/prove.mjs` | `scripts/load-env.mjs` | `apps/platform/scripts/load-env.mjs` |
| `e2e/launch-proof-live.spec.mjs` | `scripts/launch-proof-fixtures.mjs` | `apps/platform/scripts/launch-proof-fixtures.mjs` |
| `src/http/launch-proof-fixtures.test.mjs` | `scripts/launch-proof-fixtures.mjs` | `apps/platform/scripts/launch-proof-fixtures.mjs` |
| `src/underwrite/black-report-client.test.mjs` | `scripts/black-reports/fundhub_gen.py` | `apps/platform/scripts/black-reports/fundhub_gen.py` |
| `src/underwrite/black-report-pdf.mjs` | `scripts/black-reports/fundhub_gen.py` | `apps/platform/scripts/black-reports/fundhub_gen.py` |
| `src/underwrite/output-baseline.test.mjs` | `scripts/black-reports/fundhub_gen.py` | `apps/platform/scripts/black-reports/fundhub_gen.py` |
| `src/deliverables/three-printer-wording.test.mjs` | `scripts/black-reports/recapture-fixtures.py` | `apps/platform/scripts/black-reports/recapture-fixtures.py` |
| `src/deliverables/zero-limit.test.mjs` | `scripts/black-reports/recapture-fixtures.py` | `apps/platform/scripts/black-reports/recapture-fixtures.py` |
| `src/pulse/daily-pulse.mjs` | `scripts/gate-relay/index.mjs` | `apps/platform/scripts/gate-relay/index.mjs` |
| `src/deliverables/preview.mjs` | `scripts/sim/push-credit.mjs` | `apps/platform/scripts/sim/push-credit.mjs` |
| `src/underwrite/funding-letter-pdf.pg.test.mjs` | `scripts/sim/push-credit.mjs` | `apps/platform/scripts/sim/push-credit.mjs` |
| `src/waypoints/blueprint-dispute.pg.test.mjs` | `scripts/sim/push-credit.mjs` | `apps/platform/scripts/sim/push-credit.mjs` |
| `src/waypoints/purchase.pg.test.mjs` | `scripts/sim/push-credit.mjs` | `apps/platform/scripts/sim/push-credit.mjs` |
| `src/waypoints/seed.pg.test.mjs` | `scripts/sim/push-credit.mjs` | `apps/platform/scripts/sim/push-credit.mjs` |
| `src/ads/book-calendar-framed.test.mjs` | `clickfunnels-fragments/tracking-manifest.mjs` | `marketing/landing-pages/tracking-manifest.mjs` |
| `src/ads/fh-events.test.mjs` | `clickfunnels-fragments/tracking-manifest.mjs` | `marketing/landing-pages/tracking-manifest.mjs` |
| `src/messaging/seed/collect.mjs` | `fundhub-docs/sources/AIRTABLE-BASE-EXTRACT.md` | `apps/platform/fundhub-docs/sources/AIRTABLE-BASE-EXTRACT.md` |
| `src/messaging/seed/collect.mjs` | `fundhub-docs/sources/EMAIL-TEMPLATES-SOURCE-OF-TRUTH.md` | `apps/platform/fundhub-docs/sources/EMAIL-TEMPLATES-SOURCE-OF-TRUTH.md` |
| `src/messaging/seed/workflow-keys.test.mjs` | `fundhub-docs/sources/EMAIL-TEMPLATES-SOURCE-OF-TRUTH.md` | `apps/platform/fundhub-docs/sources/EMAIL-TEMPLATES-SOURCE-OF-TRUTH.md` |
| `src/messaging/seed/collect.mjs` | `fundhub-docs/sources/SMS-TEMPLATES-CURRENT.md` | `apps/platform/fundhub-docs/sources/SMS-TEMPLATES-CURRENT.md` |
| `src/messaging/seed/workflow-keys.test.mjs` | `fundhub-docs/sources/SMS-TEMPLATES-CURRENT.md` | `apps/platform/fundhub-docs/sources/SMS-TEMPLATES-CURRENT.md` |
| `src/http/routes.test.mjs` | `scripts/dev-server.mjs` | `apps/platform/scripts/dev-server.mjs` |
| `src/adapters/commas.test.mjs` | `scripts/sim/push-payment.mjs` | `apps/platform/scripts/sim/push-payment.mjs` |
| `src/ads/fh-events.test.mjs` | `scripts/cf-push-custom-html.mjs` | `marketing/landing-pages/scripts/cf-push-custom-html.mjs` |
| `src/ads/funnel-proof-scripts.test.mjs` | `scripts/cf-push-custom-html.mjs` | `marketing/landing-pages/scripts/cf-push-custom-html.mjs` |
| `src/http/adintel-board.pg.test.mjs` | `scripts/seed-staff.mjs` | `apps/platform/scripts/seed-staff.mjs` |
| `src/http/campaign-endpoints.pg.test.mjs` | `scripts/seed-staff.mjs` | `apps/platform/scripts/seed-staff.mjs` |
| `src/http/campaigns-sync-activation.pg.test.mjs` | `scripts/seed-staff.mjs` | `apps/platform/scripts/seed-staff.mjs` |
| `src/http/campaigns-video-metrics.pg.test.mjs` | `scripts/seed-staff.mjs` | `apps/platform/scripts/seed-staff.mjs` |
| `src/http/conversations-read.pg.test.mjs` | `scripts/seed-staff.mjs` | `apps/platform/scripts/seed-staff.mjs` |
| `src/http/inbox-read.pg.test.mjs` | `scripts/seed-staff.mjs` | `apps/platform/scripts/seed-staff.mjs` |
| `src/http/inquiries.pg.test.mjs` | `scripts/seed-staff.mjs` | `apps/platform/scripts/seed-staff.mjs` |
| `src/http/messages-read.pg.test.mjs` | `scripts/seed-staff.mjs` | `apps/platform/scripts/seed-staff.mjs` |
| `src/http/monitoring.test.mjs` | `DEPLOY.md` | `apps/platform/DEPLOY.md` |

Skipped from that table: referrers under `scripts/tmp*` (archive-bound, 147 of them import `scripts/load-env.mjs`) and `tsconfig.json` (glob, listed above).

## Not opened

`.env` and `credentials/` were never opened. Each has one row. `.claude/settings.local.json`, `.claude/worktrees/`, `.serena/cache/` and `clickfunnels-fragments/test-results/` are gitignored and have one row each, not listed inside.
