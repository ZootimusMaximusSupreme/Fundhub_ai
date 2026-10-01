# Apply survey rebuild — batch board (2026-09-30)

Parallel lanes for `/apply` native survey rebuild. Shared extract: `docs/clickfunnels/apply-survey-extract-2026-09-30.md`.

**Handoff §4 (attribution + CRM + webhooks):** extract doc §4 — `cf_svy_*` keys, per-screen webhooks, completion sentinel `cf_svy_available_capital`, ingress `https://fundhub.ai/api/webhooks/clickfunnels`.

---

## Lanes

| Lane | Owner | Status | Deliverable |
|------|-------|--------|-------------|
| Extract / ground truth | — | **done** | `docs/clickfunnels/apply-survey-extract-2026-09-30.md` |
| **Meta-plan** | agent | **done** | `docs/ads/apply-survey-meta-tracking-2026-09-30.md` |
| **WINS** | agent | **done** | `clickfunnels-fragments/apply-survey.html` — 16 real `{ amount, img, alt }` from watch-proof / deck.json; strip batch on step advance; no live /apply push |
| UI / fragments | pending | pending | Marked draft per `page-edits-marked-draft.mdc` before push |
| **Webhook** | agent | **done** | `SEND_STEP` POST in `apply-survey.html`; browser ingest via `CLICKFUNNELS_APPLY_SURVEY_INGEST_SECRET` + `clickfunnels.mjs`; tests in `clickfunnels.test.mjs` |
| Harness / e2e | pending | pending | `clickfunnels-fragments/harness/apply.html` parity |

---

## Meta-plan manifest

- Event map: Lead, Schedule, ShowedCall, Purchase, BackendRevenue
- Browser vs CAPI split documented
- Repo fire points named; **deposit → no existing Meta fire** (code grep)
- Read-only — no live campaign changes

---

## Open (other lanes)

- Full webhook option id matrix (extract §7 UNKNOWNs)
- Verify mapping for `cf_svy_revenue_verifiable` since 2026-09-04 fix-batch
