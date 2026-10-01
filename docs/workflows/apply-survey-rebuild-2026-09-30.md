# Apply survey rebuild — batch board (2026-09-30)

Parallel lanes for `/apply` native survey rebuild. Shared extract: `docs/clickfunnels/apply-survey-extract-2026-09-30.md`.

**Handoff §4 (attribution + CRM + webhooks):** extract doc §4 — `cf_svy_*` keys, per-screen webhooks, completion sentinel `cf_svy_available_capital`, ingress `https://fundhub.ai/api/webhooks/clickfunnels`.

**Dual-write (shipped `8807da10`, handoff `docs/clickfunnels/apply-survey-rebuild-2026-09-30.md` §3):** custom survey still POSTs each step only to Fundhub (`/api/webhooks/clickfunnels` + ingest secret). After that write, the server upserts the same step onto the ClickFunnels contact (`syncApplySurveyClickfunnelsContact` → `POST …/contacts/upsert`, match on email). **Cortana** in that handoff is the **Commas checkout key**, not a reader in this repo. ClickFunnels workflows/automation read **`cf_svy_*` on the CF contact**; the upsert is what fills those attributes when the page is custom HTML instead of the native survey.

---

## Lanes

| Lane | Owner | Status | Deliverable |
|------|-------|--------|-------------|
| Extract / ground truth | — | **done** | `docs/clickfunnels/apply-survey-extract-2026-09-30.md` |
| **Meta-plan** | agent | **done** | `docs/ads/apply-survey-meta-tracking-2026-09-30.md` |
| **WINS** | agent | **done** | `clickfunnels-fragments/apply-survey.html` — 16 real `{ amount, img, alt }` from watch-proof / deck.json; strip batch on step advance; no live /apply push; harness synced (`npm run harness` → `harness/apply-survey.html`) |
| UI / fragments | pending | pending | Marked draft per `page-edits-marked-draft.mdc` before push |
| **Webhook** | agent | **done** | `SEND_STEP` POST in `apply-survey.html`; browser ingest via `CLICKFUNNELS_APPLY_SURVEY_INGEST_SECRET` + `clickfunnels.mjs`; route forwards that secret (`src/http/router.mjs`); tests in `clickfunnels.test.mjs` and `src/http/apply-survey-webhook.test.mjs` |
| **E2E** | agent | **done** | Scorecard below. Custom `/apply` live (2026-09-30 cutover). Dual-write proved on live. |

---

## Meta-plan manifest

- Event map: Lead, Schedule, ShowedCall, Purchase, BackendRevenue
- Browser vs CAPI split documented
- Repo fire points named; **deposit → no existing Meta fire** (code grep)
- Read-only — no live campaign changes

---

## E2E scorecard (2026-09-30)

Live `https://apply.fundhub.ai/apply/` is the custom fragment (`data-fh-apply-survey="1"`, title **Fundhub Apply Survey**). Ingest is on (`window.FH_APPLY_SURVEY_INGEST` injected at push).

| Check | Result | Command |
|-------|--------|---------|
| Fragment shape: question labels, no Other, SEND_STEP payload, 16 approval cards, no `fbq(` | **PASS** | `node --test src/http/apply-survey-webhook.test.mjs` |
| `/api/webhooks/clickfunnels` accepts apply-survey contact (`entry.captured`) and `cf_svy_*` labels (`survey.submitted`) plus attribution; missing ingest secret is 401 | **PASS** | same file (fake db, no live write) |
| Adapter apply-survey ingest tests | **PASS** | `node --test src/adapters/clickfunnels.test.mjs` |
| Watch proof scripts (not edited; ran because the survey reuses those 16 cards) | **PASS** | `node --test src/ads/funnel-proof-scripts.test.mjs` |
| Webhook router still fail-closed | **PASS** | `node --test src/http/router.test.mjs` |
| Combined unit run of the four files above | **PASS** | 114 pass, 0 fail |
| Playwright: contact, trunk, 6 business options, personal 9 steps, business 9 steps, calendar card, progress text, branch split, no page errors, SEND_STEP post shape | **PASS** | `cd clickfunnels-fragments && npm test -- tests/apply-survey.spec.mjs` — 6 passed |
| Meta browser checklist | **PASS** (doc) | `docs/ads/apply-survey-meta-tracking-2026-09-30.md` §8. No `fbq(` in `apply-survey.html` |
| POST contact step to live `/api/webhooks/clickfunnels` + CF contact upsert | **PASS** | `e2e+apply-dual-*@fundhub.ai` handoff payload (`step_key: contact`). Webhook 200. ClickFunnels API: `first_name`/`last_name`/`phone_number` + attribution attrs (`landing_path`, `utm_source`). No deletes. |
| Cut over live `/apply` | **PASS** | Custom survey live; native CF survey replaced on `/apply/`. |

## Still open (not dual-write)

- Browser Meta Lead/Schedule on the live page (meta-plan §8) — not in this lane.
- Live booking calendar embed in the survey card — stand-in may remain; separate lane.
- Planned Use "Other" on any leftover native CF copy — separate lane.

## Open (other lanes)

- Full webhook option id matrix (extract §7 UNKNOWNs)
- Verify mapping for `cf_svy_revenue_verifiable` since 2026-09-04 fix-batch
