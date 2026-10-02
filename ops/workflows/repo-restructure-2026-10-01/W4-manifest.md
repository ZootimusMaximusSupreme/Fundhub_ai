# W4 manifest — docs/ and untracked files

Inventory only. Nothing was moved, edited, deleted or committed. The only files written are `W4.tsv` and this manifest.

## Counts

- **Rows written:** 1364 (1254 files + 110 folders), plus the header line.
- **Files:** 1201 tracked, 53 untracked. Gitignored files skipped (see the last section).
- **Untracked files outside `docs/` and outside the other workflows' folders:** 0. All 395 untracked files in the repo sit in `docs/` (53, listed here), `scripts/` (334, W3), `.cursor/` (5, W3), `clickfunnels-fragments/` (2, W3) and `.claude/` (1, W3).
- **Rows that move:** 1198 (1105 files, 93 folders). **Stay put:** 166.
- **Rows that go to `archive/`:** 679 (628 files). Every archive move keeps its old path under `archive/` (`archive/docs/...`), so nothing collides.
- **Unclear rows:** 0. Every file got a description from its heading, top comment, title, keys, or (for screenshots, PDFs, fonts, the zip) its name and folder.

### Where the files go

| Destination | Files |
|---|---|
| `archive/` | 628 |
| `ops/workflows/` | 251 |
| `docs/journeys/` | 60 |
| `docs/underwriteiq/` | 60 |
| `marketing/ads/` | 46 |
| `marketing/landing-pages/` | 33 |
| `docs/specs/` | 27 |
| `docs/sops/` | 21 |
| `ops/ (top level and ops/_lanes/)` | 21 |
| `marketing/flywheel/` | 16 |
| `docs/ (top level)` | 15 |
| `docs/diagrams/` | 11 |
| `docs/finance/` | 10 |
| `marketing/avatars/` | 9 |
| `docs/legacy-strong/` | 9 |
| `docs/contracts/` | 8 |
| `marketing/offers/` | 7 |
| `docs/metro2/` | 6 |
| `docs/rules/` | 5 |
| `marketing/copy/` | 4 |
| `docs/designs/` | 4 |
| `marketing/vsl/` | 2 |
| `docs/prompts/` | 1 |

### Calls made in this inventory (W5 / the GATE can overrule)

- `docs/workflows/` boards → `ops/workflows/`. Dated audit, prove, proof, report, scorecard, validate, skeptic and agent-tester files → `archive/docs/workflows/`. A board named in a rule stays in `ops/workflows/` even if dated.
- `docs/workflows/archive/` (already archived) → `archive/docs/workflows/archive/`.
- Evidence and prove folders (`*-evidence/`, `*-prove-*/`, `*-proof-*/`, `lane-1/`, `w10-pack-2026-09-04/`, `blueprint-portal-screens-2026-09-20/` …) → `archive/`.
- `docs/ads/` general ad rules and tools (RULES, VOICE, NAMING, watch-curve, SECOND-LINE, CONCEPTS, CONTROLS, registry.json, rules-data.mjs, scripts/, build/, reference/) → `marketing/ads/` as one block, because `scripts/ads/check-script.mjs` and the ad-writer skill read them together. SLO-only files (`SLO-CHAT-PROMPT.md`, `slo-297-prompt-2026-09-18.md`, `fundhub-297/`, `trigger-maps/` for ads 84–90) → `marketing/ads/slo/`. The `fundhub-297/INDEX.md` links the $297 pack to the SLO chat prompt, so the $297 pack is filed under SLO. `ascension-ads.md` → `marketing/ads/ascension/`. The climate zip → `marketing/ads/climate/`; the climate front-door build → `marketing/landing-pages/`.
- `docs/avatars/`, `docs/flywheel/`, `docs/offers/`, `docs/copy/` → `marketing/` with the same sub-path. `docs/clickfunnels/` and `docs/workflows/cf-push-snapshots/` → `marketing/landing-pages/`.
- `UI-STANDARDS.md`, `PERF-STANDARDS.md`, `MONITORING-CONSENT-FORM.md`, `docs/compliance/`, `full-end-to-end-audit-rule-2026-08-25.md` → `docs/rules/`.
- `RUNBOOK.md`, `docs/runbooks/`, `docs/company-resources/` (staff ramp classes and playbooks), `manual-walkthrough-SOP.md`, `manual-walkthrough-runbook.html`, `docs/ops/clickfunnels-custom-html-push.md` → `docs/sops/`.
- `docs/ops/` → `ops/`. `STILL-MISSING.md` → `ops/`.
- Specs found in `docs/workflows/` (`portal-accountability-spec.md`, `portal-progress-contract.md`, `wl-offer-spec-2026-08-31.md`) → `docs/specs/`. UnderwriteIQ reference sets (`gold-deliverables-v5/`, `uwiq-reference-2026-07-25/`, `underwriteiq-logic-full-2026-08-25.md`) → `docs/underwriteiq/`.
- `docs/workflows/wave-3-checks/seed-live-client.mjs` imports `src/` (note `imports-src`). It is filed with its sibling check scripts in `ops/workflows/wave-3-checks/`; by the Brief's rule W5 may instead keep it with the app.
- Stay put: `docs/journeys/`, `docs/specs/`, `docs/diagrams/`, `docs/contracts/`, `docs/finance/`, `docs/legacy-strong/`, `docs/metro2/`, `docs/designs/`, `docs/prompts/`, `docs/sops/`, `docs/underwriteiq/`, and the top-level spec files. `END-TO-END-VERIFICATION.md` stays because `src/verification/report.mjs` rewrites it.

## Every `named-in-rule` path (114 rows) — W5 must update the rule text

| Path now | New path | How the rule names it | Rule / skill files |
|---|---|---|---|
| `docs` | `docs` | exact path | `CLAUDE.md` |
| `docs/PERF-STANDARDS.md` | `docs/rules/PERF-STANDARDS.md` | exact path | `.cursor/rules/audit-vs-fix-router.mdc`, `.cursor/skills/fundhub-builder/SKILL.md`, `.cursor/skills/fundhub-perf-auditor/SKILL.md` |
| `docs/UI-STANDARDS.md` | `docs/rules/UI-STANDARDS.md` | exact path | `.cursor/rules/audit-vs-fix-router.mdc`, `.cursor/rules/ui-standards.mdc`, `.cursor/skills/fundhub-builder/SKILL.md`, `.cursor/skills/fundhub-ui-auditor/SKILL.md`, `CLAUDE.md` |
| `docs/ads` | `marketing/ads` | exact path | `CLAUDE.md` |
| `docs/ads/ASSET-BANK.md` | `marketing/ads/ASSET-BANK.md` | exact path | `.cursor/skills/fundhub-ad-writer/SKILL.md` |
| `docs/ads/CONCEPTS.md` | `marketing/ads/CONCEPTS.md` | exact path | `.cursor/skills/fundhub-ad-writer/SKILL.md` |
| `docs/ads/CONTROLS.md` | `marketing/ads/CONTROLS.md` | exact path | `.cursor/skills/fundhub-ad-writer/SKILL.md` |
| `docs/ads/NAMING.md` | `marketing/ads/NAMING.md` | exact path | `.claude/rules/ad-naming.md`, `.claude/rules/ad-video-best-of-clips.md`, `.claude/rules/slo-one-filmed-folder.md`, `.cursor/rules/ad-naming.mdc`, `.cursor/rules/ad-video-best-of-clips.mdc`, `.cursor/rules/slo-one-filmed-folder.mdc`, `CLAUDE.md` |
| `docs/ads/RULES.md` | `marketing/ads/RULES.md` | exact path | `.claude/rules/ad-second-line.md`, `.cursor/rules/ad-second-line.mdc`, `.cursor/skills/fundhub-ad-writer/SKILL.md` |
| `docs/ads/SECOND-LINE.md` | `marketing/ads/SECOND-LINE.md` | exact path | `.claude/rules/ad-second-line.md`, `.cursor/rules/ad-second-line.mdc` |
| `docs/ads/SLO-CHAT-PROMPT.md` | `marketing/ads/slo/SLO-CHAT-PROMPT.md` | exact path | `.cursor/skills/fundhub-ad-writer/SKILL.md` |
| `docs/ads/VOICE.md` | `marketing/ads/VOICE.md` | exact path | `.cursor/skills/fundhub-ad-writer/SKILL.md` |
| `docs/ads/WRITE-ADS-FROM-HERE.md` | `marketing/ads/WRITE-ADS-FROM-HERE.md` | exact path | `.cursor/skills/fundhub-ad-writer/SKILL.md` |
| `docs/ads/fundhub-297` | `marketing/ads/slo/fundhub-297` | exact path | `.cursor/skills/fundhub-ad-writer/SKILL.md` |
| `docs/ads/fundhub-297/INDEX.md` | `marketing/ads/slo/fundhub-297/INDEX.md` | exact path | `.cursor/skills/fundhub-ad-writer/SKILL.md` |
| `docs/ads/registry.json` | `marketing/ads/registry.json` | exact path | `.cursor/skills/fundhub-ad-writer/SKILL.md`, `CLAUDE.md` |
| `docs/ads/scripts` | `marketing/ads/scripts` | pattern `docs/ads/scripts/<date>.md` | `.cursor/skills/fundhub-ad-writer/SKILL.md` |
| `docs/ads/watch-curve.md` | `marketing/ads/watch-curve.md` | exact path | `.claude/rules/ad-second-line.md`, `.claude/rules/ad-watch-curve.md`, `.cursor/rules/ad-second-line.mdc`, `.cursor/rules/ad-watch-curve.mdc`, `CLAUDE.md` |
| `docs/clickfunnels` | `marketing/landing-pages/clickfunnels` | pattern `docs/clickfunnels/**` | `.cursor/rules/clickfunnels-developers-docs.mdc` |
| `docs/compliance` | `docs/rules/compliance` | exact path | `CLAUDE.md` |
| `docs/flywheel/README.md` | `marketing/flywheel/README.md` | exact path | `.claude/commands/flywheel.md` |
| `docs/flywheel/partner/00-OWNER-NOTES.md` | `marketing/flywheel/partner/00-OWNER-NOTES.md` | by file name | `.claude/commands/flywheel.md` |
| `docs/journeys` | `docs/journeys` | exact path | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-agent-tester/SKILL.md`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-builder/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md`, `CLAUDE.md` |
| `docs/journeys/CHANGELOG.md` | `docs/journeys/CHANGELOG.md` | exact path | `.cursor/skills/fundhub-fixer/SKILL.md`, `CLAUDE.md` |
| `docs/journeys/affiliate-actual.md` | `docs/journeys/affiliate-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/affiliate-intended.md` | `docs/journeys/affiliate-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/authorized-rep-intended.md` | `docs/journeys/authorized-rep-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/client-actual.md` | `docs/journeys/client-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/client-intended.md` | `docs/journeys/client-intended.md` | exact path | `.cursor/skills/fundhub-agent-tester/SKILL.md` |
| `docs/journeys/client-progress-actual.md` | `docs/journeys/client-progress-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/climate-lead-magnet-intended.md` | `docs/journeys/climate-lead-magnet-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/decline-autopsy-actual.md` | `docs/journeys/decline-autopsy-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/deliverables-actual.md` | `docs/journeys/deliverables-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/dispute-rounds-actual.md` | `docs/journeys/dispute-rounds-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/fh-consulting-intended.md` | `docs/journeys/fh-consulting-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/gate-relay-actual.md` | `docs/journeys/gate-relay-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/gate-relay-intended.md` | `docs/journeys/gate-relay-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/hiring-actual.md` | `docs/journeys/hiring-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/ops-pulse-actual.md` | `docs/journeys/ops-pulse-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/ops-pulse-intended.md` | `docs/journeys/ops-pulse-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/optimize-actual.md` | `docs/journeys/optimize-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/optimize-intended.md` | `docs/journeys/optimize-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/paid-round-actual.md` | `docs/journeys/paid-round-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/repair-documents-actual.md` | `docs/journeys/repair-documents-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/repair-letter-send-actual.md` | `docs/journeys/repair-letter-send-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/role-closer-actual.md` | `docs/journeys/role-closer-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/role-closer-intended.md` | `docs/journeys/role-closer-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/role-csm-actual.md` | `docs/journeys/role-csm-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/role-funding-advisor-actual.md` | `docs/journeys/role-funding-advisor-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/role-funding-advisor-intended.md` | `docs/journeys/role-funding-advisor-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/role-inquiry-remover-actual.md` | `docs/journeys/role-inquiry-remover-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/role-inquiry-remover-intended.md` | `docs/journeys/role-inquiry-remover-intended.md` | exact path | `.cursor/skills/fundhub-agent-tester/SKILL.md` |
| `docs/journeys/role-owner-actual.md` | `docs/journeys/role-owner-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/role-owner-intended.md` | `docs/journeys/role-owner-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/role-sales-manager-actual.md` | `docs/journeys/role-sales-manager-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/role-sales-manager-intended.md` | `docs/journeys/role-sales-manager-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/slo-connections-actual.md` | `docs/journeys/slo-connections-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/slo-connections-intended.md` | `docs/journeys/slo-connections-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/slo-offer-actual.md` | `docs/journeys/slo-offer-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/slo-offer-intended.md` | `docs/journeys/slo-offer-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/waypoint-nudge-actual.md` | `docs/journeys/waypoint-nudge-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/waypoint-seeding-actual.md` | `docs/journeys/waypoint-seeding-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/white-label-actual.md` | `docs/journeys/white-label-actual.md` | pattern `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/white-label-intended.md` | `docs/journeys/white-label-intended.md` | pattern `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/legacy-strong/lenders-legacy-strong.csv` | `docs/legacy-strong/lenders-legacy-strong.csv` | exact path | `CLAUDE.md` |
| `docs/ops/2026-09-06-self-analysis.md` | `ops/2026-09-06-self-analysis.md` | exact path | `CLAUDE.md` |
| `docs/ops/clickfunnels-custom-html-push.md` | `docs/sops/clickfunnels-custom-html-push.md` | exact path | `.cursor/skills/fundhub-clickfunnels-html-push/SKILL.md` |
| `docs/ops/ship-log.md` | `ops/ship-log.md` | exact path | `CLAUDE.md` |
| `docs/prompts/testimonial-thumbnails.md` | `docs/prompts/testimonial-thumbnails.md` | exact path | `.cursor/skills/fundhub-testimonial-thumbnails/SKILL.md` |
| `docs/workflows` | `ops/workflows` | exact path | `.cursor/rules/agentic-audit-guardrails.mdc`, `.cursor/rules/audit-screenshot-markups.mdc`, `.cursor/rules/audit-vs-fix-router.mdc`, `.cursor/rules/grok-lattice-overseer-perpetual.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |
| `docs/workflows/agent-tester-2026-08-26.md` | `archive/docs/workflows/agent-tester-2026-08-26.md` | pattern `docs/workflows/agent-tester-YYYY-MM-DD.md` | `.cursor/skills/fundhub-agent-tester/SKILL.md` |
| `docs/workflows/archive/ads-revenue-model-2026-08-24.md` | `archive/docs/workflows/archive/ads-revenue-model-2026-08-24.md` | exact path | `.cursor/skills/fundhub-clickfunnels-html-push/SKILL.md` |
| `docs/workflows/archive/company-sim-2026-08-24.md` | `archive/docs/workflows/archive/company-sim-2026-08-24.md` | by file name | `.cursor/rules/full-end-to-end-audit.mdc` |
| `docs/workflows/archive/live-playwright-100.md` | `archive/docs/workflows/archive/live-playwright-100.md` | by file name | `.cursor/rules/live-playwright-100-before-manual.mdc` |
| `docs/workflows/archive/repo-purge-candidates-2026-08-21.md` | `archive/docs/workflows/archive/repo-purge-candidates-2026-08-21.md` | by file name | `.cursor/rules/repo-hygiene-vc-router.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md` |
| `docs/workflows/book-calendar-2026-09-22-evidence` | `archive/docs/workflows/book-calendar-2026-09-22-evidence` | pattern `docs/workflows/*-evidence/` | `.cursor/rules/audit-screenshot-markups.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |
| `docs/workflows/book-call-mobile-2026-09-22-evidence` | `archive/docs/workflows/book-call-mobile-2026-09-22-evidence` | pattern `docs/workflows/*-evidence/` | `.cursor/rules/audit-screenshot-markups.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |
| `docs/workflows/cf-push-snapshots` | `marketing/landing-pages/cf-push-snapshots` | exact path | `.cursor/skills/fundhub-clickfunnels-html-push/SKILL.md` |
| `docs/workflows/flywheel-partner.md` | `ops/workflows/flywheel-partner.md` | exact path | `.claude/commands/flywheel.md` |
| `docs/workflows/full-e2e-audit-2026-08-25.md` | `archive/docs/workflows/full-e2e-audit-2026-08-25.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-08-26.md` | `archive/docs/workflows/full-e2e-audit-2026-08-26.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-08-27-repair.md` | `archive/docs/workflows/full-e2e-audit-2026-08-27-repair.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-08-27.md` | `archive/docs/workflows/full-e2e-audit-2026-08-27.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-17-csm-ar.md` | `archive/docs/workflows/full-e2e-audit-2026-09-17-csm-ar.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-17-fulfillment.md` | `archive/docs/workflows/full-e2e-audit-2026-09-17-fulfillment.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-17-horsemen.md` | `archive/docs/workflows/full-e2e-audit-2026-09-17-horsemen.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-17-slo-blueprint.md` | `archive/docs/workflows/full-e2e-audit-2026-09-17-slo-blueprint.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-17.md` | `archive/docs/workflows/full-e2e-audit-2026-09-17.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-18-blueprint.md` | `archive/docs/workflows/full-e2e-audit-2026-09-18-blueprint.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-18-combo-inquiry.md` | `archive/docs/workflows/full-e2e-audit-2026-09-18-combo-inquiry.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-18-csm-ar-beta.md` | `archive/docs/workflows/full-e2e-audit-2026-09-18-csm-ar-beta.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-18-funding.md` | `archive/docs/workflows/full-e2e-audit-2026-09-18-funding.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-18-repair.md` | `archive/docs/workflows/full-e2e-audit-2026-09-18-repair.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-18.md` | `archive/docs/workflows/full-e2e-audit-2026-09-18.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-e2e-audit-2026-09-20.md` | `archive/docs/workflows/full-e2e-audit-2026-09-20.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-end-to-end-audit-rule-2026-08-25.md` | `docs/rules/full-end-to-end-audit-rule-2026-08-25.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/full-launch-lattice-2026-09-20.md` | `ops/workflows/full-launch-lattice-2026-09-20.md` | exact path | `.cursor/rules/grok-lattice-overseer-perpetual.mdc` |
| `docs/workflows/grok-overseer-handoff-2026-09-20.md` | `ops/workflows/grok-overseer-handoff-2026-09-20.md` | exact path | `.cursor/rules/grok-lattice-overseer-perpetual.mdc` |
| `docs/workflows/lattice-inventory-ai-ops-staff-2026-09-20.md` | `ops/workflows/lattice-inventory-ai-ops-staff-2026-09-20.md` | pattern `docs/workflows/{*lattice*,grok-overseer*}` | `.cursor/rules/grok-lattice-overseer-perpetual.mdc` |
| `docs/workflows/live-prove-2026-09-17-notes.md` | `ops/workflows/live-prove-2026-09-17-notes.md` | exact path | `.cursor/rules/named-fix-regression-gate.mdc` |
| `docs/workflows/ops-overseer-lattice-2026-09-20.md` | `ops/workflows/ops-overseer-lattice-2026-09-20.md` | exact path | `.cursor/rules/grok-lattice-overseer-perpetual.mdc` |
| `docs/workflows/overnight-lattice-2026-09-20.md` | `ops/workflows/overnight-lattice-2026-09-20.md` | pattern `docs/workflows/{*lattice*,grok-overseer*}` | `.cursor/rules/grok-lattice-overseer-perpetual.mdc` |
| `docs/workflows/push-live-audit-2026-08-27.md` | `archive/docs/workflows/push-live-audit-2026-08-27.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/rate-limits-audit-2026-09-19.md` | `archive/docs/workflows/rate-limits-audit-2026-09-19.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/roadmap-vslot-2026-09-22-evidence` | `archive/docs/workflows/roadmap-vslot-2026-09-22-evidence` | pattern `docs/workflows/*-evidence/` | `.cursor/rules/audit-screenshot-markups.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |
| `docs/workflows/share-audit-2026-09-19.md` | `archive/docs/workflows/share-audit-2026-09-19.md` | pattern `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/site-proof-2026-09-22-evidence` | `archive/docs/workflows/site-proof-2026-09-22-evidence` | pattern `docs/workflows/*-evidence/` | `.cursor/rules/audit-screenshot-markups.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |
| `docs/workflows/system-map-2026-08-26.md` | `ops/workflows/system-map-2026-08-26.md` | exact path | `.cursor/skills/fundhub-system-map/SKILL.md` |
| `docs/workflows/testimonial-thumbnails-2026-09-27.md` | `ops/workflows/testimonial-thumbnails-2026-09-27.md` | exact path | `.cursor/skills/fundhub-testimonial-thumbnails/SKILL.md` |
| `docs/workflows/video-stack-2026-09-22-evidence` | `archive/docs/workflows/video-stack-2026-09-22-evidence` | pattern `docs/workflows/*-evidence/` | `.cursor/rules/audit-screenshot-markups.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |
| `docs/workflows/watch-card-sizes-2026-09-22-evidence` | `archive/docs/workflows/watch-card-sizes-2026-09-22-evidence` | pattern `docs/workflows/*-evidence/` | `.cursor/rules/audit-screenshot-markups.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |
| `docs/workflows/watch-organize-2026-09-22-evidence` | `archive/docs/workflows/watch-organize-2026-09-22-evidence` | pattern `docs/workflows/*-evidence/` | `.cursor/rules/audit-screenshot-markups.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |
| `docs/workflows/watch-proof-2026-09-22-evidence` | `archive/docs/workflows/watch-proof-2026-09-22-evidence` | pattern `docs/workflows/*-evidence/` | `.cursor/rules/audit-screenshot-markups.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |
| `docs/workflows/watch-sizes-2026-09-22-evidence` | `archive/docs/workflows/watch-sizes-2026-09-22-evidence` | pattern `docs/workflows/*-evidence/` | `.cursor/rules/audit-screenshot-markups.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |

### Rule paths that point at nothing in this slice (already stale or gitignored)

These are named in a rule or skill but no tracked or untracked file sits at that exact path. W5 should repoint them when it edits the rule.

| Rule token | Named in | What is there |
|---|---|---|
| `docs/workflows/full-launch-lattice-2026-09-20-evidence/` | `.cursor/rules/grok-lattice-overseer-perpetual.mdc` | exists on disk but gitignored |
| `docs/workflows/live-playwright-100.md` | `.cursor/rules/live-playwright-100-before-manual.mdc` | exists at `docs/workflows/archive/live-playwright-100.md` |
| `docs/workflows/company-sim-2026-08-24.md` | `.cursor/rules/full-end-to-end-audit.mdc` | exists at `docs/workflows/archive/company-sim-2026-08-24.md` |
| `docs/workflows/e2e-verify-run5-evidence/_tools/` | `.cursor/skills/fundhub-ui-auditor/SKILL.md` | not in the repo |

### Rule patterns (globs and placeholders) that point into `docs/`

| Pattern | Named in |
|---|---|
| `docs/workflows/<batch>.md` | `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |
| `docs/journeys/<feature>-flow.md` | `CLAUDE.md` |
| `docs/workflows/<batch-name>.md` | `CLAUDE.md` |
| `docs/workflows/*-evidence/_mark-shots.mjs` | `.cursor/rules/audit-screenshot-markups.mdc`, `CLAUDE.md` |
| `docs/workflows/{*lattice*,grok-overseer*}` | `.cursor/rules/grok-lattice-overseer-perpetual.mdc` |
| `docs/workflows/**/*-evidence/**` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/*audit*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/*redundancy*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/simplify-review*.md` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/*-evidence/shots/` | `.cursor/rules/audit-screenshot-markups.mdc` |
| `docs/workflows/repo-hygiene-*.md` | `.cursor/rules/repo-hygiene-vc-router.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md` |
| `docs/clickfunnels/**` | `.cursor/rules/clickfunnels-developers-docs.mdc` |
| `docs/journeys/*-intended.md` | `.cursor/rules/full-end-to-end-audit.mdc`, `.cursor/skills/fundhub-auditor/SKILL.md`, `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/workflows/full-e2e-audit-YYYY-MM-DD.md` | `.cursor/rules/full-end-to-end-audit.mdc` |
| `docs/workflows/perf-audit-<date>.md` | `.cursor/skills/fundhub-perf-auditor/SKILL.md` |
| `docs/workflows/perf-audit-evidence/<page>/` | `.cursor/skills/fundhub-perf-auditor/SKILL.md` |
| `docs/workflows/*-evidence/` | `.cursor/rules/audit-screenshot-markups.mdc`, `.cursor/skills/fundhub-repo-hygiene/SKILL.md`, `.cursor/skills/fundhub-version-control/SKILL.md`, `CLAUDE.md` |
| `docs/journeys/*-actual.md` | `.cursor/skills/fundhub-fixer/SKILL.md` |
| `docs/journeys/<name>-intended.md` | `.cursor/skills/fundhub-agent-tester/SKILL.md`, `.cursor/skills/fundhub-builder/SKILL.md` |
| `docs/workflows/build-evidence/<name>/` | `.cursor/skills/fundhub-builder/SKILL.md` |
| `docs/workflows/agent-tester-YYYY-MM-DD.md` | `.cursor/skills/fundhub-agent-tester/SKILL.md` |
| `docs/ads/scripts/<date>.md` | `.cursor/skills/fundhub-ad-writer/SKILL.md` |

## Code and config that read or write a path in this slice at runtime — these break on move

Found by grepping `src/ scripts/ api/ netlify/ db/ e2e/ public/ .github/ .claude/workflows/ .cursor/skills/ .agents/`, root configs and the code files inside `docs/` for string paths into `docs/` (including `path.join(…, "docs", …)` forms). Comment-only lines are left out. Lines where the path only appears inside an error or help message are listed separately below.

34 files outside `scripts/tmp/` and `docs/`, 152 files in `scripts/tmp/` (W3's slice), 5 code files inside `docs/` that point at their own folder.

- `.gitattributes` — L10 `docs/journeys/CHANGELOG.md` → `docs/journeys/CHANGELOG.md`
- `.gitignore` — L29 `docs/workflows/*-evidence/` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L30 `docs/workflows/**/*-evidence/` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L31 `docs/workflows/*/evidence/` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L32 `docs/workflows/fix-*/evidence/` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L35 `docs/artifacts/` → (path itself gitignored, templated or absent; nearest row `docs` → `docs`); L36 `docs/jokes/` → (path itself gitignored, templated or absent; nearest row `docs` → `docs`)
- `playwright.launch-proof.config.mjs` — L13 `docs/workflows/launch-proof-2026-08-20-evidence/live-browser-last-run.json` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `playwright.live.config.mjs` — L71 `docs/workflows/e2e-verify-run4-evidence/live-playwright-100/last-run.json` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `e2e/conveyor-ui-times.spec.mjs` — L25 `docs/workflows/fundhub-conveyor-kpis-2026-08-23-evidence` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `e2e/launch-proof-live.spec.mjs` — L23 `docs/workflows/launch-proof-2026-08-20-evidence/screenshots` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `e2e/live-hole17-inquiry-upload.spec.mjs` — L14 `docs/workflows/e2e-round-2026-08-27-evidence/hole-17/shots` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `e2e/partner-brand-crm.spec.mjs` — L35 `docs/workflows/partner-brand-evidence` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/ad-scripts-load-locked.mjs` — L29 `docs/ads/fundhub-297/FundHub-LOCKED-ADS.md` → `marketing/ads/slo/fundhub-297/FundHub-LOCKED-ADS.md`
- `scripts/ads/check-script.mjs` — L46 `docs/ads/rules-data.mjs` → `marketing/ads/rules-data.mjs`
- `scripts/ads/check-script.test.mjs` — L21 `docs/ads/CONTROLS.md` → `marketing/ads/CONTROLS.md`
- `scripts/black-reports/regen-w10-pack.mjs` — L69 `docs/workflows/w10-pack-2026-09-04` → `archive/docs/workflows/w10-pack-2026-09-04`
- `scripts/broll-record.mjs` — L57 `docs/workflows/slo-broll-2026-09-23-evidence` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/build-crm-artifact.mjs` — L17 `docs/artifacts/crm-offline-bundle.html` → (path itself gitignored, templated or absent; nearest row `docs` → `docs`)
- `scripts/cf-push-custom-html.mjs` — L744 `docs/workflows/cf-push-snapshots` → `marketing/landing-pages/cf-push-snapshots`
- `scripts/diagrams/generate.mjs` — L17 `docs/diagrams` → `docs/diagrams`
- `scripts/flywheel/status.mjs` — L275 `docs/flywheel` → `marketing/flywheel`
- `scripts/joshify-templates-v2.mjs` — L114 `docs/workflows/messaging-review-2026-08-21-evidence/_templates.json` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/joshify-templates.mjs` — L226 `docs/workflows/messaging-review-2026-08-21-evidence/_templates.json` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/journeys/generate.mjs` — L27 `docs/journeys` → `docs/journeys`
- `scripts/lenders-extract-bureaus.mjs` — L78 `docs/legacy-strong/README.md` → `docs/legacy-strong/README.md`; L89 `docs/legacy-strong/bank-datapoints-active-banks.md` → `docs/legacy-strong/bank-datapoints-active-banks.md`; L90 `docs/legacy-strong/inquiry-master-database.csv` → `docs/legacy-strong/inquiry-master-database.csv`; L91 `docs/legacy-strong/state-funding-boards.md` → `docs/legacy-strong/state-funding-boards.md`; L110 `docs/workflows/lender-list-2026-09-05.md` → `ops/workflows/lender-list-2026-09-05.md`
- `scripts/lenders-sync-csv-after-cleanup.mjs` — L20 `docs/legacy-strong/lenders-legacy-strong.csv` → `docs/legacy-strong/lenders-legacy-strong.csv`
- `scripts/run-e2e-verification.mjs` — L52 `docs/END-TO-END-VERIFICATION.md` → `docs/END-TO-END-VERIFICATION.md`
- `scripts/ship.mjs` — L44 `docs/ops/ship-log.md` → `ops/ship-log.md`
- `scripts/sim/make-documents.mjs` — L60 `docs/workflows/sim-documents` → `ops/workflows/sim-documents`
- `scripts/slo-ads-drive-organize.mjs` — L203 `docs/workflows/slo-ads-drive-organize-2026-09-23.json` → `marketing/ads/slo/slo-ads-drive-organize-2026-09-23.json`
- `scripts/testimonials/proof-slots.mjs` — L22 `docs/workflows/testimonial-thumbnails-2026-09-27-evidence` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `src/ads/registry.mjs` — L22 `docs/ads/registry.json` → `marketing/ads/registry.json`
- `src/http/monitoring.test.mjs` — L43 `docs/RUNBOOK.md` → `docs/sops/RUNBOOK.md`
- `src/metro2/version.mjs` — L21 `docs/metro2/METRO2_MASTER_KNOWLEDGE_BASE.md` → `docs/metro2/METRO2_MASTER_KNOWLEDGE_BASE.md`
- `src/pulse/daily-pulse.mjs` — L44 `docs/workflows` → `ops/workflows`
- `src/security/superuser-guard.test.mjs` — L97 `docs/runbooks/postgres-least-privilege.md` → `docs/sops/postgres-least-privilege.md`
- `src/ui/screen-standard.test.mjs` — L261 `docs/UI-STANDARDS.md` → `docs/rules/UI-STANDARDS.md`
- `src/verification/report.mjs` — L10 `docs/END-TO-END-VERIFICATION.md` → `docs/END-TO-END-VERIFICATION.md`
- `docs/workflows/live-walkthrough-2026-09-16-src/gen-sheet.mjs` — L16 `docs/workflows/sim-documents/MATRIX.md` → `ops/workflows/sim-documents/MATRIX.md`
- `docs/workflows/site-proof-2026-09-22-evidence/_reshoot-06b-funnel-a.mjs` — L5 `docs/workflows/site-proof-2026-09-22-evidence/funnel-a` → `archive/docs/workflows/site-proof-2026-09-22-evidence/funnel-a`
- `docs/workflows/site-proof-2026-09-22-evidence/_walk-funnel-a.mjs` — L14 `docs/workflows/site-proof-2026-09-22-evidence` → `archive/docs/workflows/site-proof-2026-09-22-evidence`
- `docs/workflows/site-proof-2026-09-22-evidence/recheck/_shuffle.mjs` — L26 `docs/workflows/site-proof-2026-09-22-evidence/recheck/shuffle-${name}.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows/site-proof-2026-09-22-evidence/recheck` → `archive/docs/workflows/site-proof-2026-09-22-evidence/recheck`)
- `docs/workflows/site-proof-2026-09-22-evidence/recheck/_tx.mjs` — L17 `docs/workflows/site-proof-2026-09-22-evidence/recheck/tx-${name}.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows/site-proof-2026-09-22-evidence/recheck` → `archive/docs/workflows/site-proof-2026-09-22-evidence/recheck`)
- `scripts/tmp-a7-dashboard-prove.mjs` — L13 `docs/workflows/bland-agents-prove-evidence/a7` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp-hole1-finish.mjs` — L13 `docs/workflows/e2e-round-2026-08-27-evidence/hole1` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp-hole1-verify.mjs` — L13 `docs/workflows/e2e-round-2026-08-27-evidence/hole1` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp-hole3-finish.mjs` — L13 `docs/workflows/e2e-round-2026-08-27-evidence/hole3` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp-hole3-verify.mjs` — L13 `docs/workflows/e2e-round-2026-08-27-evidence/hole3` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp-issue-uw-deliverables.mjs` — L8 `docs/workflows/four-plus-pulse-2026-08-25-evidence/deliverables` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/after-sign-desks.mjs` — L11 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L12 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/ag09-bland-verify-full-key.mjs` — L246 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-2/validate-2026-09-19` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/ag09-bland-webhook-trace-2026-09-20.mjs` — L19 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-2/validate-2026-09-19` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/ag09-production-bland-poll.mjs` — L16 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-2/validate-2026-09-19` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/ag09-redial.mjs` — L24 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-2/validate-2026-09-19` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/ag09-talk-poll-only.mjs` — L20 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-2/validate-2026-09-19` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/ag09-talk-poll-run-722650.mjs` — L17 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-2/validate-2026-09-19` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/ai-ops-lane2-prove-2026-09-20.mjs` — L16 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-2` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/bank-yes-and-reupload.mjs` — L13 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L14 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L89 `docs/workflows/sim-documents/09/photo-id-1.png` → `ops/workflows/sim-documents/09/photo-id-1.png`; L94 `docs/workflows/sim-documents/09/proof-of-address-1.png` → `ops/workflows/sim-documents/09/proof-of-address-1.png`
- `scripts/tmp/beta-every-button-2026-09-20.mjs` — L152 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/beta-every-button-finish-2026-09-20.mjs` — L37 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/beta` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/beta-every-button-harvest-2026-09-20.mjs` — L167 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/beta-every-button-harvest.json` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/beta-reclick-8-2026-09-20.mjs` — L36 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/beta/reclick` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/blueprint-portal-prove-2026-09-20.mjs` — L16 `docs/workflows/full-launch-lattice-2026-09-20-evidence/blueprint-portal` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/blueprint-portal-screens-2026-09-20.mjs` — L13 `docs/workflows/blueprint-portal-screens-2026-09-20` → `archive/docs/workflows/blueprint-portal-screens-2026-09-20`
- `scripts/tmp/blueprint-portal-seed-2026-09-20.mjs` — L16 `docs/workflows/blueprint-portal-screens-2026-09-20` → `archive/docs/workflows/blueprint-portal-screens-2026-09-20`
- `scripts/tmp/capital-blueprint-live-click-2026-09-29.mjs` — L8 `docs/workflows/sim-documents/11/proof-of-address-1.png` → `ops/workflows/sim-documents/11/proof-of-address-1.png`
- `scripts/tmp/capital-blueprint-live-prove-2026-09-29.mjs` — L158 `docs/workflows/sim-documents/11/proof-of-address-1.png` → `ops/workflows/sim-documents/11/proof-of-address-1.png`
- `scripts/tmp/carl-barton-2026-09-18/compare-to-book.mjs` — L63 `docs/legacy-strong/lenders-legacy-strong.csv` → `docs/legacy-strong/lenders-legacy-strong.csv`; L113 `docs/legacy-strong/carl-barton-book-match.csv` → `docs/legacy-strong/carl-barton-book-match.csv`
- `scripts/tmp/comms-fire-blocked-timing-2026-09-20.mjs` — L15 `docs/workflows/comms-map-2026-09-19.md` → `ops/workflows/comms-map-2026-09-19.md`; L16 `docs/workflows/full-launch-lattice-2026-09-20-evidence/comms` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L611 `docs/workflows/comms-timing-map-2026-09-20.md` → `ops/workflows/comms-timing-map-2026-09-20.md`
- `scripts/tmp/comms-fire-remaining-2026-09-20.mjs` — L46 `docs/workflows/comms-map-2026-09-19.md` → `ops/workflows/comms-map-2026-09-19.md`; L47 `docs/workflows/full-launch-lattice-2026-09-20-evidence/comms` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L48 `docs/workflows/launch-prove-2026-09-19-evidence/comms-matrix.json` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L57 `docs/workflows/launch-prove-2026-09-19-evidence` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/comms-run-all-2026-09-19.mjs` — L12 `docs/workflows/launch-prove-2026-09-19-evidence` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/comms-run-all-2026-09-20.mjs` — L22 `docs/workflows/comms-map-2026-09-19.md` → `ops/workflows/comms-map-2026-09-19.md`; L23 `docs/workflows/full-launch-lattice-2026-09-20-evidence/comms` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L24 `docs/workflows/launch-prove-2026-09-19-evidence/comms-matrix.json` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L31 `docs/workflows/launch-prove-2026-09-19-evidence` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/disposition-finish-two-clicks-2026-09-20.mjs` — L13 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/closer` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/disposition-save-verify-2026-09-20.mjs` — L13 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/closer` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/doc-agent-eight.mjs` — L13 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/sim-documents/08` → `ops/workflows/sim-documents/08`
- `scripts/tmp/doc-agent-matrix-walk.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L24 `docs/workflows/sim-documents` → `ops/workflows/sim-documents`
- `scripts/tmp/doc-agent-retry.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L17 `docs/workflows/sim-documents` → `ops/workflows/sim-documents`
- `scripts/tmp/doc-agent-session.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L16 `docs/workflows/sim-documents` → `ops/workflows/sim-documents`
- `scripts/tmp/dump-uwiq-sim11-2026-09-20.mjs` — L17 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-deliverables/uwiq-generated` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/full-comms-prove-2026-09-19.mjs` — L5 `docs/workflows/comms-map-2026-09-19.md` → `ops/workflows/comms-map-2026-09-19.md`; L6 `docs/workflows/launch-prove-2026-09-19-evidence` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L8 `docs/workflows/full-comms-prove-2026-09-19.md` → `archive/docs/workflows/full-comms-prove-2026-09-19.md`
- `scripts/tmp/full-e2e-audit-2026-09-20-lane1-continue.mjs` — L15 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L22 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/funding-advisor/sim-photo-id.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/full-e2e-audit-2026-09-20-lane1.mjs` — L20 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/funded-l3-repair-p4.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L180 `docs/workflows/sim-documents/09/photo-id-1.png` → `ops/workflows/sim-documents/09/photo-id-1.png`; L185 `docs/workflows/sim-documents/09/proof-of-address-1.png` → `ops/workflows/sim-documents/09/proof-of-address-1.png`
- `scripts/tmp/gap1-doc-matrix.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L19 `docs/workflows/sim-documents` → `ops/workflows/sim-documents`
- `scripts/tmp/gap1-stage-confirm.mjs` — L13 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`
- `scripts/tmp/gap10-blueprint.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap11-progress.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap12-unlock-more.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap13-blueprint-send.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap14-academy.mjs` — L17 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L18 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap15-trial-send.mjs` — L15 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L16 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap16-consent.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap17-present-consent.mjs` — L15 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L16 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap18-present-03.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`
- `scripts/tmp/gap19-scores-docs.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap2-letter-inq.mjs` — L15 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L16 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L22 `docs/workflows/sim-documents` → `ops/workflows/sim-documents`
- `scripts/tmp/gap2-letter-loop.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L23 `docs/workflows/sim-documents` → `ops/workflows/sim-documents`
- `scripts/tmp/gap20-hold.mjs` — L15 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`
- `scripts/tmp/gap23-nobook-chase.mjs` — L13 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L14 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap28-trial-letters.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap29-blueprint-1000.mjs` — L17 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L18 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap3-apply-notify.mjs` — L17 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L18 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap30-academy.mjs` — L17 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L18 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap31-partner.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap34-csm-queue-leftover.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap34-csm-queue.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap35-halfway.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap36-calendar.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap37-claim.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap38-save-answers.mjs` — L15 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L16 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap39-consent-chrome.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap4-stack.mjs` — L15 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L16 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap5-ar-receipt.mjs` — L17 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L18 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap7-portal-payments.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap8-mark-funded.mjs` — L15 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L16 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/gap9-trial-done.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/hole17-composer-finish-2026-09-20.mjs` — L11 `docs/workflows/lane-1/playwright/product-fail` → `archive/docs/workflows/lane-1/playwright/product-fail`
- `scripts/tmp/hole17-finish-db-token-2026-09-20.mjs` — L13 `docs/workflows/full-launch-lattice-2026-09-20-evidence/hole17` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L14 `docs/workflows/lane-1/playwright/product-fail` → `archive/docs/workflows/lane-1/playwright/product-fail`
- `scripts/tmp/hole17-finish-live-2026-09-20.mjs` — L10 `docs/workflows/lane-1/playwright/product-fail` → `archive/docs/workflows/lane-1/playwright/product-fail`
- `scripts/tmp/hole17-finish-magic-only-2026-09-20.mjs` — L11 `docs/workflows/full-launch-lattice-2026-09-20-evidence/hole17` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L12 `docs/workflows/lane-1/playwright/product-fail` → `archive/docs/workflows/lane-1/playwright/product-fail`
- `scripts/tmp/hole17-finish-prove-2026-09-20.mjs` — L10 `docs/workflows/lane-1/playwright/product-fail` → `archive/docs/workflows/lane-1/playwright/product-fail`
- `scripts/tmp/hole17-finish-reuse-token-2026-09-20.mjs` — L10 `docs/workflows/full-launch-lattice-2026-09-20-evidence/hole17` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L11 `docs/workflows/lane-1/playwright/product-fail` → `archive/docs/workflows/lane-1/playwright/product-fail`
- `scripts/tmp/hole17-finish-send-link-2026-09-20.mjs` — L11 `docs/workflows/lane-1/playwright/product-fail` → `archive/docs/workflows/lane-1/playwright/product-fail`; L12 `docs/workflows/full-launch-lattice-2026-09-20-evidence/hole17` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/l1-repair-letters-pack-y2otg-2026-09-20.mjs` — L25 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/repair-letters` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/l1-repair-letters-y2otg-2026-09-20.mjs` — L21 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/fulfillment-repair/generated` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/l3-repair-dl-finish-prove.mjs` — L16 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/fulfillment-repair` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L129 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/fulfillment-repair/06-specialist-download-pass1.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L130 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/fulfillment-repair/07-specialist-download-pass2.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L131 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/fulfillment-repair/08-letter-drawer-download-pass1.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L132 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/fulfillment-repair/09-letter-drawer-download-pass2.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L133 `docs/workflows/` → `ops/workflows`
- `scripts/tmp/lane-1-beta-live-click-2026-09-20.mjs` — L36 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/beta` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane-deliverables-prove-2026-09-20.mjs` — L15 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-deliverables` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane-f-book-run-2026-09-19.mjs` — L11 `docs/workflows/launch-prove-2026-09-19-evidence/lane-f` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane-f-rebook-netlify.mjs` — L12 `docs/workflows/launch-prove-2026-09-19-evidence/lane-f` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane1-doc-check-desk-2026-09-20.mjs` — L19 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/doc-check` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L23 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/sim-photo-id.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane1-sms-dispatch-prove-2026-09-20.mjs` — L23 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/sms-dispatch` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane2-doc-check-complete-2026-09-20.mjs` — L21 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-2/doc-check-complete` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L27 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/funding-advisor/sim-photo-id.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane2-validate-leftovers-2026-09-19.mjs` — L14 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-2/validate-2026-09-19` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane3-closer-finish-2026-09-20.mjs` — L16 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/closer` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane3-fulfillment-funding-prove-2026-09-20.mjs` — L11 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/fulfillment-funding` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L12 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/funding-advisor` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane3-fulfillment-repair-prove-2026-09-20.mjs` — L17 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/fulfillment-repair` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L261 `docs/workflows/` → `ops/workflows`
- `scripts/tmp/lane3-funding-advisor-prove-2026-09-20.mjs` — L11 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/funding-advisor` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane3-inquiry-prove-2026-09-20.mjs` — L14 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/inquiry` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane3-repair-prove-2026-09-20.mjs` — L15 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/repair` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L261 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/repair/prove.json` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L262 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/repair/01-repair-queue.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L263 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/repair/02-repair-row-nine-expanded.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L264 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/repair/03-portal-nine.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lane3-sales-manager-prove-2026-09-20.mjs` — L12 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/sales-manager` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/launch-prove-2026-09-19-bcde-rerun.mjs` — L13 `docs/workflows/launch-prove-2026-09-19-evidence` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L287 `docs/workflows/launch-prove-2026-09-19-evidence/lane-c/prove.json` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L288 `docs/workflows/launch-prove-2026-09-19-evidence/lane-c/specialist-nine.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`); L289 `docs/workflows/launch-prove-2026-09-19-evidence/lane-c/portal-nine.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/launch-prove-2026-09-19-lane-f-comms.mjs` — L11 `docs/workflows/launch-prove-2026-09-19-evidence/lane-f` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/launch-prove-2026-09-19-lane-f.mjs` — L15 `docs/workflows/launch-prove-2026-09-19-evidence/lane-f` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/leftover-beta-33-36-prove.mjs` — L33 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/beta/leftover-33-36` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lenders-full-merge-2026-09-18/coverage.mjs` — L26 `docs/legacy-strong/lenders-legacy-strong.csv` → `docs/legacy-strong/lenders-legacy-strong.csv`
- `scripts/tmp/lenders-full-merge-2026-09-18/desk-names.mjs` — L12 `docs/workflows/lender-full-merge-2026-09-18-evidence/` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/lenders-full-merge-2026-09-18/desk-search.mjs` — L7 `docs/workflows/lender-full-merge-2026-09-18-evidence/` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/live-fix-2026-09-17/hole-1-packet.mjs` — L4 `docs/contracts/source-2026-08-28/Fundhub-Service-Agreements-Packet.pdf` → `docs/contracts/source-2026-08-28/Fundhub-Service-Agreements-Packet.pdf`
- `scripts/tmp/live-fix-2026-09-18/h16-backup-reader-local.mjs` — L17 `docs/workflows/sim-documents/09/` → `ops/workflows/sim-documents/09`
- `scripts/tmp/live-fix-2026-09-18/h24-regen-diff.mjs` — L24 `docs/journeys` → `docs/journeys`; L26 `docs/journeys/${f}` → (path itself gitignored, templated or absent; nearest row `docs/journeys` → `docs/journeys`)
- `scripts/tmp/live-fix-2026-09-18/h24-route-gap.mjs` — L77 `docs/journeys/${j}-actual.md` → (path itself gitignored, templated or absent; nearest row `docs/journeys` → `docs/journeys`)
- `scripts/tmp/live-fix-2026-09-18/r2-h24-intended-build.mjs` — L64 `docs/journeys/${name}-intended.md` → (path itself gitignored, templated or absent; nearest row `docs/journeys` → `docs/journeys`)
- `scripts/tmp/live-fix-2026-09-18/r2-n22-clear-photo.mjs` — L39 `docs/workflows/sim-documents/08/photo-id-1.png` → `ops/workflows/sim-documents/08/photo-id-1.png`
- `scripts/tmp/live-fix-2026-09-18/r2-n22-verify.mjs` — L31 `docs/workflows/sim-documents/08/photo-id-1.png` → `ops/workflows/sim-documents/08/photo-id-1.png`
- `scripts/tmp/live-playwright-100-score.mjs` — L8 `docs/workflows/e2e-verify-run4-evidence/live-playwright-100/last-run.json` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/meet-context-prove-lane1-2026-09-20.mjs` — L23 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/meet-context` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/meet-context-sweeper-prove-2026-09-20.mjs` — L29 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/meet-context/sweeper` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/meet-context-sweeper-prove-lane1-2026-09-20.mjs` — L30 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-1/meet-context/sweeper` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/mkt-walk-3.mjs` — L10 `docs/workflows/marketing-walkthrough-2026-09-17-notes.md` → `ops/workflows/marketing-walkthrough-2026-09-17-notes.md`
- `scripts/tmp/mkt-walk-leftover.mjs` — L14 `docs/workflows/marketing-walkthrough-2026-09-17-notes.md` → `ops/workflows/marketing-walkthrough-2026-09-17-notes.md`
- `scripts/tmp/mkt-walk.mjs` — L15 `docs/workflows/marketing-walkthrough-2026-09-17-notes.md` → `ops/workflows/marketing-walkthrough-2026-09-17-notes.md`; L16 `docs/workflows/marketing-walkthrough-2026-09-17-board.md` → `ops/workflows/marketing-walkthrough-2026-09-17-board.md`; L367 `docs/ads/scripts` → `marketing/ads/scripts`; L368 `docs/ads/20-ads.md` → (path itself gitignored, templated or absent; nearest row `docs/ads` → `marketing/ads`); L369 `docs/ads/SHOOT-PLAN.md` → (path itself gitignored, templated or absent; nearest row `docs/ads` → `marketing/ads`)
- `scripts/tmp/overseer-closer-punchlist-2026-09-20.mjs` — L280 `docs/workflows/lane-1/playwright/product-fail/hole17-prove-2026-09-20.json` → `archive/docs/workflows/lane-1/playwright/product-fail/hole17-prove-2026-09-20.json`
- `scripts/tmp/oxylabs-retry-apply-once-2026-09-20.mjs` — L13 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/fulfillment-funding/oxylabs-retry` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/oxylabs-retry-apply-once.mjs` — L13 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3/fulfillment-funding/oxylabs-retry` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/p3-ten-stage.mjs` — L11 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L12 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L13 `docs/workflows/manual-walkthrough-2026-09-03.md` → `ops/workflows/manual-walkthrough-2026-09-03.md`
- `scripts/tmp/portal-stepper-prove-2026-09-20.mjs` — L11 `docs/workflows/portal-stepper-prove-2026-09-20` → `archive/docs/workflows/portal-stepper-prove-2026-09-20`
- `scripts/tmp/portal-stepper-shots-2026-09-20.mjs` — L9 `docs/workflows/portal-stepper-prove-2026-09-20` → `archive/docs/workflows/portal-stepper-prove-2026-09-20`
- `scripts/tmp/raised-bar-apply-wait.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`
- `scripts/tmp/raised-bar-ar-finish.mjs` — L17 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L18 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/raised-bar-prove.mjs` — L16 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L17 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/raised-bar-walk.mjs` — L17 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L18 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L25 `docs/workflows/sim-documents` → `ops/workflows/sim-documents`
- `scripts/tmp/repair-letters-r1-r6-prove-2026-09-20.mjs` — L24 `docs/workflows/full-launch-lattice-2026-09-20-evidence/repair-letters-r1-r6` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/runbook-fulfill-existing.mjs` — L12 `docs/workflows/manual-walkthrough-2026-09-03.md` → `ops/workflows/manual-walkthrough-2026-09-03.md`; L13 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/runbook-p3-p6.mjs` — L13 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L14 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L15 `docs/workflows/manual-walkthrough-2026-09-03.md` → `ops/workflows/manual-walkthrough-2026-09-03.md`
- `scripts/tmp/sheet-click-resume.mjs` — L15 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L16 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L270 `docs/workflows/sim-documents/09` → `ops/workflows/sim-documents/09`; L378 `docs/workflows/sim-documents/10` → `ops/workflows/sim-documents/10`
- `scripts/tmp/sheet-click-walk.mjs` — L15 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L16 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`; L653 `docs/workflows/sim-documents/08` → `ops/workflows/sim-documents/08`; L836 `docs/workflows/sim-documents/09` → `ops/workflows/sim-documents/09`; L954 `docs/workflows/sim-documents/10` → `ops/workflows/sim-documents/10`
- `scripts/tmp/sheet-leftover-40.mjs` — L14 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L15 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/sheet-leftover-40b.mjs` — L12 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L13 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/sheet-leftover-40c.mjs` — L12 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L13 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/sheet-leftover-fulfill.mjs` — L13 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L14 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/sheet-spot.mjs` — L12 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`
- `scripts/tmp/sign-unblock-fulfill.mjs` — L13 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L14 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/slo-3step-2026-09-27/prove.mjs` — L10 `docs/workflows/slo-3step-2026-09-27-evidence/shots` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/slo-pack-inngest-prove-2026-09-20.mjs` — L18 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-deliverables/slo-dashboard/inngest` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/slo-pack-local-generate-2026-09-20.mjs` — L24 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-deliverables/slo-dashboard/generated` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/slo-pack-screenshots-2026-09-20.mjs` — L14 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-deliverables/slo-dashboard` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/slo-portal-unlock-prove-2026-09-20.mjs` — L16 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-deliverables/slo-dashboard` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/staff-ui-survey-2026-09-20.mjs` — L12 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/staff-ui-survey-fast-2026-09-20.mjs` — L7 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-3` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/stage-9-again.mjs` — L10 `docs/workflows/live-walkthrough-2026-09-16-notes.md` → `ops/workflows/live-walkthrough-2026-09-16-notes.md`; L11 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`
- `scripts/tmp/uwiq-portal-tile-shot-2026-09-20.mjs` — L12 `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-deliverables/uwiq-generated/portal_uwiq_tile_client.png` → (path itself gitignored, templated or absent; nearest row `docs/workflows` → `ops/workflows`)
- `scripts/tmp/wake-ready-screens-2026-09-21.mjs` — L13 `docs/workflows/blueprint-portal-screens-2026-09-20` → `archive/docs/workflows/blueprint-portal-screens-2026-09-20`
- `scripts/tmp/wake-ready-seed-2026-09-21.mjs` — L25 `docs/workflows/blueprint-portal-screens-2026-09-20` → `archive/docs/workflows/blueprint-portal-screens-2026-09-20`
- `scripts/tmp/walk1-apply-yes.mjs` — L11 `docs/workflows/manual-walkthrough-2026-09-03.md` → `ops/workflows/manual-walkthrough-2026-09-03.md`; L12 `docs/workflows/live-walkthrough-2026-09-16-board.md` → `ops/workflows/live-walkthrough-2026-09-16-board.md`

### Tests that check another file's text for a `docs/` path — fail when that text is updated

- `src/ui/screen-standard.test.mjs` L252: asserts `CLAUDE.md` includes the string `docs/UI-STANDARDS.md`. When W5 rewrites CLAUDE.md to `docs/rules/UI-STANDARDS.md`, this assertion must change in the same commit. (L260–261 also read the file itself.)
- `src/http/monitoring.test.mjs` L179: asserts root `DEPLOY.md` matches `/docs\/RUNBOOK\.md/`. Moving `RUNBOOK.md` to `docs/sops/` means DEPLOY.md and this regex change together. (L43 reads the file itself.)

### Code inside `docs/` that uses relative paths (`../`) — breaks when its folder depth changes

- `docs/ads/climate-front-door-2026-09-18/ClimateFrontDoor.jsx` (→ `marketing/landing-pages/climate-front-door-2026-09-18/ClimateFrontDoor.jsx`) — L19 `../_styles/map.css`; L20 `../_styles/front-door.css`
- `docs/workflows/book-call-mobile-2026-09-22-evidence/_shoot.mjs` (→ `archive/docs/workflows/book-call-mobile-2026-09-22-evidence/_shoot.mjs`) — L13 `../../..`
- `docs/workflows/live-walkthrough-2026-09-16-src/gen-sheet.mjs` (→ `ops/workflows/live-walkthrough-2026-09-16-src/gen-sheet.mjs`) — L5 `../../..`
- `docs/workflows/marketing-walkthrough-2026-09-17-src/gen-sheet.mjs` (→ `ops/workflows/marketing-walkthrough-2026-09-17-src/gen-sheet.mjs`) — L11 `../../..`
- `docs/workflows/mobile-check.mjs` (→ `ops/workflows/mobile-check.mjs`) — L28 `../..`
- `docs/workflows/portal-dispute-round-prove-2026-09-20/client-prove.mjs` (→ `archive/docs/workflows/portal-dispute-round-prove-2026-09-20/client-prove.mjs`) — L4 `../../../scripts/load-env.mjs`
- `docs/workflows/portal-dispute-round-prove-2026-09-20/prove.mjs` (→ `archive/docs/workflows/portal-dispute-round-prove-2026-09-20/prove.mjs`) — L4 `../../../scripts/load-env.mjs`
- `docs/workflows/watch-card-sizes-2026-09-22-evidence/_walk.mjs` (→ `archive/docs/workflows/watch-card-sizes-2026-09-22-evidence/_walk.mjs`) — L18 `../../..`
- `docs/workflows/watch-organize-2026-09-22-evidence/_walk.mjs` (→ `archive/docs/workflows/watch-organize-2026-09-22-evidence/_walk.mjs`) — L14 `../../..`
- `docs/workflows/wave-3-checks/fixture-server.mjs` (→ `ops/workflows/wave-3-checks/fixture-server.mjs`) — L5 `../../../public/`
- `docs/workflows/wave-3-checks/seed-live-client.mjs` (→ `ops/workflows/wave-3-checks/seed-live-client.mjs`) — L15 `../../../src/auth/org.mjs`; L16 `../../../src/auth/account-session.mjs`; L17 `../../../src/repair/pipeline.mjs`

### Message-only mentions (no break; the text goes stale)

These name a `docs/` path inside an error, help or label string. Nothing reads the file. Plus 13 files in `scripts/tmp/`.

- `api/campaigns/sync.mjs` — `docs/STILL-MISSING.md`
- `api/social/oauth.mjs` — `docs/STILL-MISSING.md`
- `db/migrate.mjs` — `docs/runbooks/postgres-least-privilege.md`
- `docs/workflows/live-walkthrough-2026-09-16-src/gen-sheet.mjs` — `docs/workflows/sim-documents/NN/consent-form.txt`, `docs/workflows/sim-documents/08/`, `docs/workflows/sim-documents/09/photo-id-1.png`, `docs/workflows/sim-documents/NN/`, `docs/workflows/sim-documents/MATRIX.md`, `docs/workflows/sim-documents/NN/consent-form.txt</code>`, `docs/workflows/sim-documents/MATRIX.md</code>`, `docs/workflows/live-walkthrough-2026-09-16.html`
- `e2e/integration-round.spec.mjs` — `docs/STILL-MISSING.md`
- `lane-deliverables/slo-dashboard/inngest/VERDICT.json` — `docs/workflows/full-launch-lattice-2026-09-20-evidence/lane-deliverables/slo-dashboard/inngest/prove-result.json`
- `scripts/ads/check-registry-titles.mjs` — `docs/ads/registry.json`
- `scripts/ads/check-script.mjs` — `docs/ads/rules-data.mjs`, `docs/ads/ASSET-BANK.md`, `docs/ads/RULES.md`, `docs/ads/CONTROLS.md`
- `scripts/ads/check-script.test.mjs` — `docs/ads/CONTROLS.md`
- `scripts/diagrams/generate.mjs` — `docs/diagrams`, `docs/diagrams/${b.rel}`, `docs/diagrams/`
- `scripts/diagrams/generate.test.mjs` — `docs/diagrams`
- `scripts/diagrams/render.mjs` — `docs/diagrams/`
- `scripts/flywheel/status.mjs` — `docs/flywheel/${campaign}`
- `scripts/journeys/generate.mjs` — `docs/journeys`, `docs/journeys/${b.rel}`, `docs/journeys/`
- `scripts/journeys/generate.test.mjs` — `docs/journeys`, `docs/journeys/${b.rel}`
- `scripts/journeys/render.mjs` — `docs/workflows/pii-and-journeys.md`
- `scripts/lenders-add-personal-loans.mjs` — `docs/legacy-strong/inquiry-master-database.csv`
- `scripts/lenders-alias-map.json` — `docs/legacy-strong/bank-datapoints-active-banks.md`, `docs/legacy-strong/inquiry-master-database.csv`, `docs/legacy-strong/state-funding-boards.md`, `docs/legacy-strong/bankers-rms.md`
- `scripts/lenders-extract-bureaus.mjs` — `docs/legacy-strong/`, `docs/legacy-strong/bank-datapoints-active-banks.md`, `docs/legacy-strong/inquiry-master-database.csv`
- `scripts/ship.mjs` — `docs/ops/ship-log.md`
- `scripts/sim/make-documents.mjs` — `docs/workflows/sim-documents/${p.nn}/`, `docs/workflows/sim-documents/MATRIX.md`
- `src/ad-videos/pipeline.mjs` — `docs/journeys/ad-video-flow.md`
- `src/ad-videos/states.test.mjs` — `docs/journeys/ad-video-flow.md`
- `src/adapters/oxylabs.mjs` — `docs/STILL-MISSING.md`
- `src/ads/registry.mjs` — `docs/ads/registry.json`
- `src/ads/registry.test.mjs` — `docs/ads/registry.json`
- `src/contracts/partner-license-terms.test.mjs` — `docs/specs/W0-decisions.md`, `docs/specs/W7-curriculum.md`
- `src/funding/billed-fee-check.mjs` — `docs/CLOSEOUT-FEE-BASIS.md`
- `src/http/client-progress.pg.test.mjs` — `docs/workflows/portal-progress-contract.md`
- `src/http/crm-html.test.mjs` — `docs/workflows/arizona-time-2026-08-28.md`
- `src/http/lenders-role-gate.test.mjs` — `docs/workflows/lenders-role-lock-2026-08-17.md`
- `src/http/monitoring.test.mjs` — `docs/RUNBOOK.md`
- `src/http/routes.test.mjs` — `docs/specs/W3-decline-autopsy.md`
- `src/sales/cockpit-honest-money.test.mjs` — `docs/CLOSER-DASHBOARD-SCREEN-MERGE-BUILD-SPEC.md`
- `src/ui/screen-standard.test.mjs` — `docs/UI-STANDARDS.md`
- `src/ui/status-tokens-are-semantic.test.mjs` — `docs/BRAND-THEMING-SPEC.md`
- `src/verification/report.mjs` — `docs/CLOSEOUT-FEE-BASIS.md`

### Config lines that point at this slice

- `.gitignore` L18 comment names `docs/workflows/mobile-check.mjs`; L29–32 ignore `docs/workflows/*-evidence/`, `docs/workflows/**/*-evidence/`, `docs/workflows/*/evidence/`, `docs/workflows/fix-*/evidence/`; L35–36 ignore `docs/artifacts/`, `docs/jokes/`. These patterns must move with `docs/workflows/`, or the 2,064 ignored evidence files below become untracked noise.
- `.gitattributes` L10: `docs/journeys/CHANGELOG.md merge=union` (journeys stay put, so no change).
- `playwright.live.config.mjs` L71 writes `docs/workflows/e2e-verify-run4-evidence/live-playwright-100/last-run.json`.
- `playwright.launch-proof.config.mjs` L13 writes `docs/workflows/launch-proof-2026-08-20-evidence/live-browser-last-run.json`.
- `netlify.toml` L225 comment names `docs/ops/apply-fundhub-netlify.md` (moves to `ops/`).
- `package.json`, `tsconfig.json`: no `docs/` paths.

## Gitignored files under `docs/` (skipped, not in the TSV)

2064 gitignored files sit on disk in 25 evidence folders. They are not listed row by row. They live inside `docs/workflows/`, so a folder move carries them along on disk; per the plan they belong in `archive/`.

| Files | Folder |
|---|---|
| 77 | `docs/workflows/2026-09-22-video-stack-mobile-evidence` |
| 31 | `docs/workflows/book-calendar-2026-09-22-evidence` |
| 3 | `docs/workflows/e2e-round-2026-08-27-evidence` |
| 1 | `docs/workflows/e2e-verify-run4-evidence` |
| 24 | `docs/workflows/full-e2e-audit-2026-09-17-csm-ar-evidence` |
| 19 | `docs/workflows/full-e2e-audit-2026-09-18-combo-inquiry-evidence` |
| 40 | `docs/workflows/full-e2e-audit-2026-09-18-csm-ar-beta-evidence` |
| 584 | `docs/workflows/full-launch-lattice-2026-09-20-evidence` |
| 53 | `docs/workflows/launch-prove-2026-09-19-evidence` |
| 3 | `docs/workflows/lender-book-2026-09-18-evidence` |
| 4 | `docs/workflows/lender-cleanup-2026-09-18-evidence` |
| 5 | `docs/workflows/lenders-pull-file-2026-09-18-evidence` |
| 979 | `docs/workflows/live-prove-2026-09-17-evidence` |
| 13 | `docs/workflows/live-walkthrough-2026-09-16-evidence` |
| 4 | `docs/workflows/personal-loans-2026-09-18-evidence` |
| 4 | `docs/workflows/roadmap-approvals-2026-09-21-evidence` |
| 4 | `docs/workflows/roadmap-proof-deck-2026-09-21-evidence` |
| 10 | `docs/workflows/roadmap-vslot-2026-09-22-evidence` |
| 102 | `docs/workflows/site-proof-2026-09-22-evidence` |
| 14 | `docs/workflows/slo-3step-2026-09-27-evidence` |
| 31 | `docs/workflows/slo-broll-2026-09-23-evidence` |
| 5 | `docs/workflows/slo-live-videos-2026-09-25-evidence` |
| 5 | `docs/workflows/testimonial-thumbnails-2026-09-27-evidence` |
| 25 | `docs/workflows/watch-proof-2026-09-22-evidence` |
| 24 | `docs/workflows/watch-sizes-2026-09-22-evidence` |
