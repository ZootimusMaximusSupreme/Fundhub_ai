# W2 manifest — app edges

Slice: `public/ api/ netlify/ db/ e2e/ vendor/ render-service/ extension/ wireframes/ assets/ dist/`.
Read-only. Table: `docs/workflows/repo-restructure-2026-10-01/W2.tsv`.

## Counts

| | |
|---|---|
| Rows written (not counting header) | **1,986** — 1,841 files + 145 folders |
| Tracked / untracked / ignored | 1,985 tracked · 0 untracked · 1 ignored (`public/leads/`) |
| Rows that move | **1,985** |
| Rows that stay | 1 — `public/leads/` (gitignored by `.git/info/exclude`, contents not listed) |
| Rows sent to `archive/` | **0** (no file was unclear; 13 files whose top lines did not describe them were read by hand) |
| → `apps/platform/` | 1,970 |
| → `apps/render-service/` | 6 |
| → `apps/extension/` | 9 |

## Where the four "decide" folders go, and why

| Folder | New path | Why (grep evidence) |
|---|---|---|
| `vendor/` | `apps/platform/vendor/` | `src/` reaches it by relative path: `src/finance/vendor/crs-engine.cjs` and `src/underwrite/vendor/*.cjs` use `../../../vendor/underwriteiq-full/...`; `src/underwrite/black-report-client.mjs:12`, `src/inquiry-ops/bureau-call.mjs:15`, `src/workflows/ai-set-01-josh-setter.mjs:15` and many tests use `../../vendor/...`. Those only keep working if `vendor/` sits beside `src/`. `vendor/underwriteiq/` has no importer (`src/underwrite/engine.mjs:19-24` says it "stays, unwired"); it moves with its siblings. |
| `assets/` | `apps/platform/assets/` | `src/deliverables/fonts.mjs:33` (`../../assets/fonts`), `src/messaging/assets.mjs:8,15` and `src/gifts/message-blaster.mjs:7,13` (ROOT = `src/..`/..). |
| `dist/` | `apps/platform/dist/` | Build output of `scripts/build-artifact.mjs` (`npm run artifact`), which writes `join(ROOT, "dist", …)` with ROOT = `scripts/..`. Follows wherever W3 puts that script. |
| `wireframes/` | `apps/platform/wireframes/` | UI mocks of the CRM screens. `.cursor/rules/ui-standards.mdc` globs it together with `public/app/`; `public/fh.css:1` says its tokens come from `wireframes/fundhub-brand.css`. |

All of `public/` stays one block under `apps/platform/public/`, including the funnel scripts and videos, `/climate` Next export and `aniso-face/`: every file there is a live URL, and the lender logo URLs stored in `lenders.logo_path` (`/assets/lenders/...`) only stay valid if `public/` stays the publish root.

## Paths named in a rule (`named-in-rule`)

| Path | Named in |
|---|---|
| `db/` | CLAUDE.md §2 ("search `src/`, `scripts/`, `db/` and `docs/`") |
| `db/migrate.mjs` | CLAUDE.md §11 (lines 442, 471, 500, 504, 514) |
| `db/schema/`, `db/migrations/`, `db/seed/` | CLAUDE.md §11 (lines 442, 470) |
| `db/migrations/286_client_ad_attribution.sql` | CLAUDE.md §3c (line 261) |
| `db/migrations/104_app_role.sql` | CLAUDE.md §12 (line 541) |
| `public/app/` | CLAUDE.md §3 (line 229); `.cursor/rules/ui-standards.mdc:3` glob `public/app/**/*.{html,css,js}`; `.cursor/rules/build-spec-then-backend-then-frontend.mdc:18,35`; `.cursor/rules/no-claude-in-cursor.mdc:26` |
| `api/` | CLAUDE.md §12 (line 536); `.cursor/rules/pulse-registry.mdc:10` |
| `api/finance/` | `.cursor/rules/build-spec-then-backend-then-frontend.mdc:36` (`api/finance/*`) |
| `api/analytics/clickfunnels-connect.mjs`, `api/analytics/clickfunnels-sync.mjs` | `.cursor/rules/clickfunnels-developers-docs.mdc:12` glob `api/**/clickfunnels*` |
| `netlify/functions/api.mjs` | CLAUDE.md §12 (line 546) |
| `wireframes/` | `.cursor/rules/ui-standards.mdc:3` glob `wireframes/**/*.{html,css}` |

No `.claude/rules/*.md` file names a path in this slice.

## Config lines that point at these folders (exact)

**netlify.toml**
- `6:   publish = "public"`
- `86:   command = "node db/migrate.mjs && npm run guard:db && npm run guard:rls"` (`[context.production]`)
- `97:   directory = "netlify/functions"`
- `100:     "assets/ebooks/fundhub-ebook-placeholder.pdf",`
- `101:     "assets/gifts/message-blaster.dmg",`
- `117:     "vendor/underwriteiq-full/**"`
- Comments only: `104` (`require("../../../vendor/underwriteiq-full/…/engine.js")`), `107` (`'../../vendor/underwriteiq-full/api/lite/crs/lender-matrix.js'`).
- `[functions."<name>"]` at 135, 138, 141, 144, 155, 163 and the redirects at 205 (`/.netlify/functions/partner-site/:splat`) and 253 (`/.netlify/functions/api/:splat`) use function names, not paths. They keep working if line 97 is updated.
- Same `included_files` list, not in this slice: `102:     "scripts/black-reports/**",` (W3).

**package.json**
- `12:     "migrate": "node db/migrate.mjs",`
- Indirect: `24: "test:e2e": "playwright test"` and `25: "test:e2e:live": "playwright test -c playwright.live.config.mjs"` → the playwright configs below.

**tsconfig.json**
- `32:   "include": ["src/**/*.mjs", "api/**/*.mjs", "scripts/**/*.mjs", "db/**/*.mjs"]`

**playwright.config.mjs**
- `110:   testDir: "./e2e",`
- `128:     command: \`node e2e/static-server.mjs\`,`
- `111:   testIgnore: ["**/launch-proof-live.spec.mjs"],` (glob, no folder)

**playwright.live.config.mjs**
- `64:   testDir: "./e2e",`
- `65:   testMatch: ["**/live-*.spec.mjs"],` (glob)

**playwright.launch-proof.config.mjs**
- `9:   testMatch: ["**/launch-proof-live.spec.mjs"],` — inherits `testDir: "./e2e"` from the live config.

**.github/workflows/tests.yml**
- `182:         run: npm run test:e2e` (→ `playwright.config.mjs` → `./e2e`)
- `265:         run: node db/migrate.mjs`
- `272:           if ! git diff --quiet -- db/expected-migrations.mjs; then`
- `273:             echo "::error::db/expected-migrations.mjs is stale. …"`
- `274:             git --no-pager diff -- db/expected-migrations.mjs`
- Comments only: 23 (`playwright.config.mjs plus e2e/`), 53 (`db/migrations/104_app_role.sql`), 252–253 (`db/migrate.mjs applies db/schema, then db/migrations, then db/seed`).

**db/migrate.mjs** (paths it builds itself)
- `14: import { pool, close, dbTarget } from "../src/db.mjs";` — fine if `src/` and `db/` move together.
- `16: const HERE = path.dirname(fileURLToPath(import.meta.url));`
- `100:   const envPath = path.join(HERE, "..", ".env");` — after the move this looks for `apps/platform/.env`, not the root `.env`. It is only read when the CLI hands over masked values.

## db/migrate.mjs — the name recorded in `schema_migrations`

```js
const DIRS = ["schema", "migrations", "seed"];            // line 17

function collect() {                                       // lines 163–173
  const files = [];
  for (const d of DIRS) {
    const dir = path.join(HERE, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      files.push({ key: `${d}/${f}`, path: path.join(dir, f) });
    }
  }
  return files;
}
…
await client.query(`INSERT INTO schema_migrations (key) VALUES ($1)`, [f.key]);   // line 221
```

**Plain answer: no. Moving `db/` to `apps/platform/db/` does not change the recorded names.** The key is only `<subfolder>/<file>`, for example `migrations/010_products.sql`. It has no `db/` prefix and no full path. It stays the same as long as the three subfolder names (`schema`, `migrations`, `seed`) and the file names stay the same. `db/expected-migrations.mjs` (built by `scripts/db/expected-migrations.mjs` with the same `${d}/${f}` walk) lists the same short keys. So `/api/health` would compare the same strings.

## Other couplings W5 will hit (looked up, not fixed)

- **render-service on Render.com.** `render-service/Dockerfile:43,47,48` copy `render-service/requirements.txt`, `scripts/black-reports/` and `render-service/wsgi.py` from a repo-root build context. `render-service/Dockerfile.dockerignore` allow-lists the same three paths. The Render.com service setting "Dockerfile Path = render-service/Dockerfile" (per the Dockerfile header and README) lives outside this repo.
- **scripts/lint.mjs:28** `const ROOTS = ["src", "scripts", "api", "netlify", "db", "public", "extension"];`. `extension` goes to `apps/extension/`, away from the platform block.
- **scripts/ship.mjs:89** imports `path.join(ROOT, "db/expected-migrations.mjs")`. **:131** runs `node db/migrate.mjs`.
- **scripts/db/expected-migrations.mjs:17** `const DB = path.join(HERE, "..", "..", "db");`. This only holds if it moves to `apps/platform/scripts/db/`.
- **scripts/build-artifact.mjs:16–17, 277–278** use ROOT/`public` and ROOT/`dist` (ROOT = `scripts/..`).
- **scripts/run-e2e-verification.mjs:36–37** `"e2e/verification-roles.spec.mjs"`, `"e2e/verification-security.spec.mjs"`.
- **scripts/lenders-audit/run.mjs:26** `path.join(ROOT, "public/assets/lenders")`.
- **src/security/migrations-production-only.test.mjs:39–40** reads `path.join(ROOT, "netlify.toml")` with ROOT = `src/../..`. After the move ROOT becomes `apps/platform/`, while `netlify.toml` stays at the repo root. Its check `/db\/migrate\.mjs/` still matches `apps/platform/db/migrate.mjs`.
- **e2e specs use paths relative to the working directory** (Playwright runs from the repo root): `e2e/live-hole10.spec.mjs:23–24`, `e2e/live-hole17-inquiry-upload.spec.mjs:14,177`, `e2e/verification-roles.spec.mjs:132–272`, `e2e/verification-security.spec.mjs:56,77,102`, `e2e/launch-proof-live.spec.mjs:23`, `e2e/conveyor-ui-times.spec.mjs:22–26`.
- **e2e and vendor code that reaches outside the app block by `../`:** `e2e/launch-proof-live.spec.mjs:18` → `../scripts/launch-proof-fixtures.mjs`; `e2e/partner-brand-crm.spec.mjs:35` → `../docs/workflows/partner-brand-evidence`; `vendor/underwriteiq-full/api/lite/letter-generator.js:24` → `../../../../docs/workflows/gold-deliverables-v5/fonts`; `scripts/tmp/capital-blueprint-live-click-2026-09-29.mjs:5` imports `../../e2e/live-auth.mjs`. Already pointing outside the repo today, so this break was not caused by the move: `vendor/underwriteiq-crs/metro2-kb-loader.js:24` → `../../../data/metro2-kb.md`.
- **`public/leads/`** is ignored through `.git/info/exclude`. `git mv public` leaves it behind at the old path.
