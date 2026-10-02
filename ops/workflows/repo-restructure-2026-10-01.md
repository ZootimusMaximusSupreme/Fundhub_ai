# Repo restructure — 2026-10-01

Chris asked: list every file and folder with one line each, propose a new layout
(`apps/`, `marketing/`, `docs/`, `ops/`, `archive/`), show every move as a table
**before changing anything**, then move (no deletes, unclear → `archive/`), fix every
path that breaks, and update `CLAUDE.md`.

Size measured 2026-10-01: **5,889 tracked files + 395 untracked** (not counting gitignored).

## Status

| # | Workflow | Owner | Status | Waits on |
|---|---|---|---|---|
| W1 | Inventory: `src/` (1,712 files) | this session | done — 1,831 rows, all → `apps/platform/src/`, 0 unclear | — |
| W2 | Inventory: app edges — `public/ api/ netlify/ db/ e2e/ vendor/ render-service/ extension/ wireframes/ assets/ dist/` (~2,300) | background agent | done — 1,986 rows, 1,985 → `apps/`, 0 unclear | — |
| W3 | Inventory: `scripts/ clickfunnels-fragments/ content/ lane-deliverables/ fundhub-docs/`, root files, dot-folders (~1,100) | background agent | done — 1,596 rows, 1,376 move, 90 unclear → `archive/` | — |
| W4 | Inventory: `docs/` (1,201) + every untracked file (395) | background agent | done — 1,364 rows, 1,198 move, 628 files → `archive/`, 0 unclear | — |
| GATE | Merge W1–W4 into one moves table, show Chris | this session | waiting on Chris — https://claude.ai/artifact/79VFQuZWC8dZyoZRc9fP52 | W1–W4 |
| W5 | Do the moves, fix every broken path, update `CLAUDE.md` | this session | pending | Chris says go on the table |
| V1 | Prove: lint, types, full test suite on a scratch database | agent | pending | W5 |
| V2 | Prove: Netlify build, routes, migration names unchanged | agent | pending | W5 |
| V3 | Prove: every path named in `CLAUDE.md`, rules, skills, docs opens | agent | pending | W5 |
| SHIP | `npm run ship` once | this session | pending | V1–V3 green |

W1–W4 run at the same time. They only read. W5 must be one agent: every path fix needs
the whole move list, and two agents moving files in one folder collide. V1–V3 run at the
same time after W5.

## Brief (every workflow reads this first)

### Target layout (Chris named the top level; inventories propose what goes inside)

```
apps/
  platform/        the Fundhub app as ONE block: src/ api/ netlify/ db/ public/ e2e/ ...
  render-service/
  extension/
marketing/
  ads/<offer>/     ads by offer (slo/, ...) — scripts, registry, take notes
  vsl/
  posts/
  landing-pages/   ClickFunnels page HTML and drafts
docs/
  rules/           human-readable rules and standards
  sops/
  (other docs/ subfolders stay under docs/ if they are product docs)
ops/               work boards, runbooks, ship log, ops notes
archive/           anything unclear, plus dated one-off audits and old evidence
```

### Hard limits

- **Read only.** Inventory workflows move nothing, edit nothing but their own TSV.
- **Never delete.** Unclear → `archive/<same path>`.
- **Stays at root** (the tools only look there): `.claude/ .cursor/ .agents/ .serena/ .gitignore .gitattributes .mcp.json .nvmrc .env.example package.json package-lock.json netlify.toml tsconfig.json deno.lock skills-lock.json playwright*.config.mjs CLAUDE.md README.md TODO.md`.
- **No GitHub (owner-set 2026-10-01, restating CLAUDE.md 2026-09-09).** Nothing runs `.github/workflows/tests.yml`, and no code reads it — only comments mention it. So `.github/` → `archive/.github/`, and W5 does **not** rewrite paths inside it. W3 was told it stays at root; the GATE overrides that row.
- **Gitignored stays put, one row each, no file listing:** `node_modules/ test-results/ .netlify/ credentials/ .playwright-mcp/ .env`. Never open `.env` or `credentials/`.
- **Move the app as one block.** `src/ api/ netlify/ db/ public/` import each other by relative path. Keeping them together under `apps/platform/` keeps those imports working. Only split a folder when it is plainly not app code.
- **A script that imports from `src/`** stays with the app unless it is plainly marketing.
- **Never invent a description.** Read the file's top comment or first lines. If you still cannot tell, write `unclear: <what you do know>` and send it to `archive/`.
- **Mark folders a rule names** (`docs/journeys/`, `docs/workflows/`, `clickfunnels-fragments/slo/fundhub-proof-cards.html`, `src/adapters/clarity-export.mjs`, `.claude/workflows/copy.js`, ...) with `named-in-rule` so W5 updates the rule.

### Known risk for W5 (say once)

`db/migrate.mjs` records each migration by its folder and file name. If moving `db/`
changes those names, the next ship would try to re-run every migration on the live
database. W5 checks how the name is built **before** moving `db/`, and V2 proves the
names match the live `schema_migrations` rows (read-only).

### Row format (TSV, one file per workflow)

Write to `docs/workflows/repo-restructure-2026-10-01/<W#>.tsv`, tab-separated, header:

```
path	kind	tracked	what_it_is	new_path	confidence	note
```

- `kind` = `file` or `folder`. Every folder gets its own row too.
- `tracked` = `y` / `n` / `ignored`.
- `what_it_is` = one plain line.
- `new_path` = full new path, or the same path if it stays.
- `confidence` = `sure` or `unclear` (unclear → `new_path` under `archive/`).
- `note` = `named-in-rule`, `imports-src`, `referenced-by:<file>`, or blank.

When done: write a short summary to `docs/workflows/repo-restructure-2026-10-01/<W#>-manifest.md`
(rows written, how many move, how many to archive, anything named in a rule, every config
line that points at your folders). **Inventory agents do not edit this board and do not
commit** — three agents writing one file or one git index at once collide. The coordinator
(this session) updates Status, merges manifests here, and commits.

## Prompts (paste into a new session, or this session fires them)

### W2 — app edges

```
Repo: /Users/chrisstanbridge/Developer/fundhub-platform. Board: docs/workflows/repo-restructure-2026-10-01.md.
You are W2 of a read-only repo inventory. Read the board's Brief first and obey it exactly.
Do not edit the board; the coordinator tracks status.
Your slice: every file and folder under public/ api/ netlify/ db/ e2e/ vendor/ render-service/ extension/ wireframes/ assets/ dist/ (tracked and untracked; skip gitignored).
For each, write one TSV row to docs/workflows/repo-restructure-2026-10-01/W2.tsv in the Brief's format: what it is (from its top comment / first lines — never invent) and its proposed new path under the Brief's target layout. Unclear → archive/<same path>.
Do not move, edit, or delete anything except your own TSV and manifest file. Do not commit.
Use scripts (git ls-files, head) to go fast; 2,300 rows is expected. Also note in your Manifest exactly where netlify.toml, package.json, tsconfig.json and the playwright configs point at your folders.
When done: write docs/workflows/repo-restructure-2026-10-01/W2-manifest.md (see the Brief) and stop. Never push.
```

### W3 — scripts, marketing, root, dot-folders

```
Repo: /Users/chrisstanbridge/Developer/fundhub-platform. Board: docs/workflows/repo-restructure-2026-10-01.md.
You are W3 of a read-only repo inventory. Read the board's Brief first and obey it exactly.
Do not edit the board; the coordinator tracks status.
Your slice: scripts/ clickfunnels-fragments/ content/ lane-deliverables/ fundhub-docs/ fundhub-brand.css, every root-level file, and .claude/ .cursor/ .agents/ .github/ .serena/ (dot-folders stay at root — still list them with one line each). Tracked and untracked; skip gitignored.
For each, write one TSV row to docs/workflows/repo-restructure-2026-10-01/W3.tsv in the Brief's format. For each script, grep its imports: if it imports from src/ or db/, mark `imports-src` and keep it with the app (apps/platform/scripts/) unless it is plainly marketing. Ad, VSL, post and ClickFunnels files go under marketing/ (ads by offer). Unclear → archive/<same path>.
Do not move, edit, or delete anything except your own TSV and manifest file. Do not commit.
In your Manifest, list every package.json script and every .github workflow step that names a path in your slice, and every .claude/skills symlink target.
When done: write docs/workflows/repo-restructure-2026-10-01/W3-manifest.md (see the Brief) and stop. Never push.
```

### W4 — docs and all untracked files

```
Repo: /Users/chrisstanbridge/Developer/fundhub-platform. Board: docs/workflows/repo-restructure-2026-10-01.md.
You are W4 of a read-only repo inventory. Read the board's Brief first and obey it exactly.
Do not edit the board; the coordinator tracks status.
Your slice: every file and folder under docs/ (tracked and untracked), plus every other untracked file in the repo outside docs/ (git ls-files --others --exclude-standard). Skip gitignored. Do not list this board's own folder (docs/workflows/repo-restructure-2026-10-01/).
For each, write one TSV row to docs/workflows/repo-restructure-2026-10-01/W4.tsv in the Brief's format. Ads, VSLs, posts, offers, copy → marketing/ (ads by offer). Rules, standards, compliance → docs/rules/. SOPs and runbooks → docs/sops/. Work boards and ops logs → ops/. Dated one-off audits and evidence dumps → archive/. Unclear → archive/<same path>.
Mark anything CLAUDE.md, .claude/rules/ or .cursor/rules/ names by path as `named-in-rule` (grep them).
Do not move, edit, or delete anything except your own TSV and manifest file. Do not commit.
When done: write docs/workflows/repo-restructure-2026-10-01/W4-manifest.md (see the Brief) and stop. Never push.
```

### V1 / V2 / V3 — written by W5 once the move list is approved

## Manifests

- W1: `repo-restructure-2026-10-01/W1-manifest.md` — `src/` (1,831 rows).
- W2: `repo-restructure-2026-10-01/W2-manifest.md` — app edges (1,986 rows). Proved: migration names are `migrations/<file>`, no `db/` prefix, so moving `db/` is safe.
- W3: `repo-restructure-2026-10-01/W3-manifest.md` — scripts, ClickFunnels, root, dot-folders (1,596 rows).
- W4: `repo-restructure-2026-10-01/W4-manifest.md` — `docs/` + untracked (1,364 rows).
- GATE merge: `moves.tsv` (6,777 rows: 6,286 files + 491 folders), `moves-summary.tsv` (141 folder lines), `moves-table.html` (the page Chris reviews). 0 missing, 0 duplicates, 0 two-files-one-destination clashes.

### GATE calls (coordinator)

- `.github/` → `archive/.github/` (no GitHub, owner-set).
- `render-service/` stays at root: Render.com's Dockerfile Path setting points at it and lives outside this repo (CLAUDE.md §2). Its Dockerfile `COPY scripts/black-reports/` still needs the new path in W5.
- Gitignored files inside a moving folder move with it and stay ignored (`.gitignore` lines 29–32 and `.git/info/exclude` updated). 2,064 evidence files under `docs/workflows/*-evidence`.
- Untracked files (395) move with plain `mv` and stay untracked.
- `.claude/settings.json` is not edited. `npm run ship` keeps working through the rewritten `package.json`.
- `marketing/posts/` gets a one-line README so the folder exists.

## Blockers

(none)

## Leftovers (not this batch — do not fix here)

- W4 found four paths named in rules that already pointed at nothing before this batch: `docs/workflows/company-sim-2026-08-24.md`, `docs/workflows/live-playwright-100.md` (both now in `docs/workflows/archive/`), `docs/workflows/e2e-verify-run5-evidence/_tools/` (missing), `docs/workflows/full-launch-lattice-2026-09-20-evidence/` (gitignored). W5 rewrites them to the new home only; it does not repair them.

## Cleanup — 2026-10-01 (owner-set)

Chris changed the job from "move everything" to "clear out the clutter". Owner rules: keep settings,
tweaks, tools, every `.md` file, Claude and Cursor rules, marketing, and anything credential-related.
No more git saves.

- Deleted (Chris ran the one command; the app's safety check blocks agents from deleting files that
  exist nowhere else): the 3,318 files in `repo-restructure-2026-10-01/final-delete.tsv`, about 284 MB.
  Old proof screenshots and recordings, `scripts/tmp*` scratch scripts, `.playwright-mcp/` screenshots,
  old non-.md doc exports, never-run vendor tests, old test output.
- Checked after: 0 of the 3,318 left on disk; nothing outside the list missing; all 109 held-back
  credential-looking files (`held-back-credentials.tsv`), `credentials/` and `.env` still there.
- `npm run lint`: pass (2,297 files). No type check in this repo.
- Folder restructure (W5): not started. `moves.tsv` and `final-plan.tsv` predate the cleanup and are stale.

## Leftover (found, not fixed — not this job)

- `npm test` without a database: 11,626 tests, 27 fail, 4 skipped. None of the 19 failing test files
  read a deleted area. The causes are code that moved ahead of its generated files or guards (stale
  `docs/diagrams`, stale `docs/journeys/*-actual.md`, stale `db/expected-migrations.mjs`, workflow
  registry counts 79 vs 89, adapter count 12 vs 13, org-scope and outbound-fetch guards, Arizona time
  in `finance-os.html`) plus one missing file, `public/climate/climate.js`, which was never on the
  delete list.
- Second batch (Chris ran it): removed `.netlify/functions/` (build output, 84 MB), the 9 duplicate fonts in
  `docs/workflows/gold-deliverables-v5/fonts/`, `dist/fundhub-frontend.html`, `assets/.DS_Store`, 3 empty folders.
  Checked after: all gone; `assets/fonts/` (9 fonts the app uses), `.netlify/state.json`, `.netlify/db`,
  `credentials/`, `.env` kept; lint pass. Not done: `git gc` (Chris's call, no git).

## Search cleanup — 2026-10-01

- Added one search filter, in three copies that say the same thing: `.ignore` (ripgrep, so Claude's
  Grep and Glob), `.cursorindexingignore` (Cursor's index), `ignored_paths` in `.serena/project.yml`.
  It hides minified third-party bundles, page draft/share/backup copies, push-time page snapshots,
  archived boards, finished proof folders and `scripts/tmp/`. Nothing deleted; every file still opens by path.
- Packed this batch's 11 data files (`W1–W4.tsv`, `moves*.tsv`, `moves-table.html`, `final-plan.tsv`,
  `cleanup-candidates.tsv`, `final-delete.tsv`, `more-candidates.json`) into
  `repo-restructure-2026-10-01/inventory-data-2026-10-01.tar.gz` (6.0 MB → 0.98 MB, all 11 checked
  byte-identical before the originals were removed). `held-back-credentials.tsv` left as is.
- Search went from 3,850 text files / 65.4 MB to 3,589 text files / 43.6 MB (-33%). Biggest file left: `docs/journeys/CHANGELOG.md` (0.84 MB, required by CLAUDE.md §4).

## Reorganize — 2026-10-01 (owner-set: just reorganize, do not edit or audit file contents)

- 34 moves: `clickfunnels-fragments/` → `marketing/landing-pages/`; `docs/ads|offers|avatars|copy|flywheel|clickfunnels`
  and `content/testimonials` → `marketing/` (SLO, ascension and climate ad files under `marketing/ads/<offer>/`);
  UI/speed standards, consent form, compliance, brand css → `docs/rules/`; runbook, playbooks → `docs/sops/`;
  loose specs → `docs/specs/` and `docs/finance/`; `docs/workflows/` and `docs/ops/` → `ops/`. Live app code not moved.
  `marketing/posts/` created with a one-line README.
- Path strings only were fixed in 276 files (moved docs excluded) (code, tests, settings, `.gitignore`, search
  filters, CLAUDE.md, Claude and Cursor rules, skills). Moved docs, boards, page HTML and snapshots: not edited.
  One comment in `public/funnel/vsl-watch-beacon.js` kept on the old path on purpose (a test requires it to
  stay byte-identical to its paste-in copy in `marketing/landing-pages/07-vsl-watch-beacon.html`).
- UnderwriteIQ letter writer (`vendor/underwriteiq-full/api/lite/letter-generator.js`) pointed at `assets/fonts/`:
  its old font folder was the duplicate set deleted in batch two. Live never packed either folder, so live letters
  were unaffected.
- `CLAUDE.md` §3b has a "Where things live" table.

## Leftover (found, not fixed)

- `netlify.toml` packs neither `assets/fonts/` nor the old gold font folder, so live UnderwriteIQ letters use the
  built-in fallback font, not Inter / JetBrains Mono. Was true before this cleanup.
