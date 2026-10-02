# W1 manifest — `src/`

- **Rows:** 1,831 (1,712 files + 119 folders). All tracked, none untracked.
- **Moves:** all of them, as one block: `src/<x>` → `apps/platform/src/<x>`. Nothing goes to archive.
- **Unclear:** 0. The 8 files with no header comment are 3 `index.mjs` entry points that re-export their folder, and 5 two-line shims under `src/underwrite/vendor/` that load `vendor/underwriteiq-full/`. All 8 are described from what they actually contain.
- **No header but described from exports:** 17 rows say "No header comment. Exports: …".
- **Descriptions** come from each file's own top comment (first sentence). Tests with no comment say "Tests for <name>".

## Named in a rule (W5 must update the rule text)

42 rows. These include `CLAUDE.md` (`src/http/routes.test.mjs`, `src/http/auth-gate.test.mjs`,
`src/security/migrations-production-only.test.mjs`, `src/commissions/money.mjs`,
`src/messaging/providers/*`, `src/messaging/dispatch.mjs`, `src/workflows/message-dispatch-sweeper.mjs`,
`src/workflows/index.mjs`, `src/adapters/lendflow.mjs`, `src/workflows/ds-02-diy-letters.mjs`,
`src/workflows/c-06-crs-results-router.mjs`, `src/lib/`, `src/handlers/`, `src/mail/`,
`src/verification/scratch-guard.mjs`), `.claude/rules/clarity-export-rate-limit.md` and its Cursor twin
(`src/adapters/clarity-export.mjs`), and `.claude/rules/ad-watch-curve.md` and its twin
(`src/ad-videos/notify-fanout.mjs`). Cursor-only rules naming `src/`: `pulse-registry`,
`commas-catalog-hands-off`, `verify-scratch-only`, `full-end-to-end-audit`, `clickfunnels-developers-docs`.
Skills naming `src/`: `fundhub-agent-tester`, `fundhub-system-map`, `fundhub-fixer`, `fundhub-auditor`,
`fundhub-clickfunnels-html-push`. Filter `W1.tsv` on `named-in-rule` for the full list.

## Config that points at `src/` (W5 must rewrite)

- `package.json`: the test glob (`src/**`), `src/security/rls-shape.test.mjs`, `src/security/superuser-guard.test.mjs`.
- `netlify.toml`: `src/finance/vendor/crs-engine.cjs` (included files), `src/security/…`.
- `tsconfig.json`, `playwright*.config.mjs`: name `src/`.
- `.github/workflows/tests.yml`: names `src/compliance/*`, `src/creative/*`, `src/http/*`, `src/social/*`, `src/security/*` test files.

## `src/` reaches outside itself (these break if the other folder lands somewhere else)

Relative imports leaving `src/`, by the folder they land in:

| Lands in | Imports | Example |
|---|---|---|
| `api/` | 272 | tests import `../../api/<handler>.mjs` |
| `netlify/` | 41 | tests import `../../netlify/functions/api.mjs` |
| `vendor/` | 9 | `src/underwrite/vendor/*.cjs` → `../../../vendor/underwriteiq-full/…` |
| `scripts/` | 8 | `src/pulse/daily-pulse.mjs` → `../../scripts/gate-relay/index.mjs`; tests → `../../scripts/sim/*` |
| `db/` | 4 | `src/http/health.mjs` → `../../db/expected-migrations.mjs` |
| `clickfunnels-fragments/` | 3 | `src/ads/*.test.mjs` → `../../clickfunnels-fragments/tracking-manifest.mjs` |

Plus path strings read at runtime (not imports): non-test code names `public/` 27×, `db/` 4×,
`vendor/` 3×, `docs/` 3×, `content/` 3×, `assets/` 2×, `scripts/` 2×, `fundhub-docs/` 1×. Tests name
`public/` 64×, `clickfunnels-fragments/` 23×, `db/` 11×, `scripts/` 9×, `vendor/` 7×, `docs/` 5×.
29 `path.join` / `path.resolve` calls build these from separate pieces (`"docs"`, `"public"`, …),
so a plain find-and-replace on `docs/` will **miss** them.

**What this means for W5:** if `api/ netlify/ db/ public/ vendor/` move into `apps/platform/` with `src/`,
the 334 relative imports to them keep working untouched. Whatever leaves the block (`scripts/`,
`clickfunnels-fragments/`, `docs/`, `content/`, `assets/`, `fundhub-docs/`) needs every reference above
rewritten. The 29 split-up `path.join` calls have to be fixed by hand.
