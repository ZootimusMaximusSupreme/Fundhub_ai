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
| W2 | Inventory: app edges — `public/ api/ netlify/ db/ e2e/ vendor/ render-service/ extension/ wireframes/ assets/ dist/` (~2,300) | background agent | claimed | — |
| W3 | Inventory: `scripts/ clickfunnels-fragments/ content/ lane-deliverables/ fundhub-docs/`, root files, dot-folders (~1,100) | background agent | claimed | — |
| W4 | Inventory: `docs/` (1,201) + every untracked file (395) | background agent | claimed | — |
| GATE | Merge W1–W4 into one moves table, show Chris | this session | pending | W1–W4 |
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
- **Stays at root** (the tools only look there): `.claude/ .cursor/ .agents/ .github/ .serena/ .gitignore .gitattributes .mcp.json .nvmrc .env.example package.json package-lock.json netlify.toml tsconfig.json deno.lock skills-lock.json playwright*.config.mjs CLAUDE.md README.md TODO.md`.
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

(none yet)

## Blockers

(none yet)
