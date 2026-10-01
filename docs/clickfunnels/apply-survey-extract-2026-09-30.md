# Apply survey extract — builder spec (2026-09-30)

Extraction only for `https://apply.fundhub.ai/apply`. No new survey UI in this doc. Sources: live HTML (curl 2026-09-30), `docs/clickfunnels/cf-survey-ground-truth.md`, `src/survey/cf-question-map.mjs`, fragments, webhook adapter, funnel manifest.

---

## 1. Live page identity

| Field | Value |
|--------|--------|
| Live URL | https://apply.fundhub.ai/apply |
| CF path slug | `/apply-page` (manifest) |
| Manifest key | `apply-survey` |
| ClickFunnels page id | **25068989** |
| Push strategy | `head_footer_append_only` — custom HTML **sandwiches** native widget; does **not** replace survey |
| Top fragment | `clickfunnels-fragments/02a-apply-top.html` (hero + grid + `fh-attribution.js`) |
| Bottom fragment | `clickfunnels-fragments/02b-apply-bottom.html` (marquee + footer + `fh-attribution.js`) |
| Native widget | `[data-page-element="Survey/V1"]` (ClickFunnels survey, classic design) |
| Funnel position | Step after `/watch`, before `/funding-book-call` (`docs/workflows/funnel-cutover-2026-09-21.md`) |
| Local harness | `clickfunnels-fragments/harness/apply.html` (mock `Survey/V1` + same shell CSS) |

**Live-only survey params (from view-source 2026-09-30):**

| Param | Value |
|--------|--------|
| `data-param-workflow_id` | `1924936` |
| `data-param-survey_progress_enabled` | `true` |
| `data-param-survey_end_text` | `You're qualified. Pick a time below.` |
| `data-param-survey_end_href` (attribute) | `?next_funnel_step=true` |
| Resolved `survey_end_href` (SSR JSON script) | `?next_funnel_step=80990c5df16ff32c707d0d256491785e782bb4d9076255915ac9b7fa47b5b992` (CF funnel step token; **do not hard-code** in a replacement — use CF next-step or explicit `/funding-book-call` only if cutover doc says so) |
| `survey_questions` in SSR JSON | `null` (question list loads client-side; not in static HTML) |

**Repo vs live copy drift:** committed `02a-apply-top.html` eyebrow is `Application` only. **Live** eyebrow is `Application · Step 1 of 2` (matches harness `apply.html`).

---

## 2. Every survey question (ClickFunnels apply order)

Ground truth for titles and option **labels**: `docs/clickfunnels/cf-survey-ground-truth.md` and `src/survey/cf-question-map.mjs`.  
Contact step is **first** on CF (homepage widget runs contact **last** — not this page).

**Counts:** **11** defined steps (1 contact + **10** `cf_svy_*` questions). Each submission skips **one** branch pair (business revenue/verify **or** personal income/verify), so the visitor sees **9** question screens after contact (**10** screens total including contact).

### Step 1 — Contact (required)

| Order | Title (verbatim) | Field type | Options | Required | `payloadKey` / storage |
|------:|------------------|------------|---------|:--------:|-------------------------|
| 1 | Let's Start With Your Info | Contact (CF native) | — | Yes | Built-in contact fields (see §3). Not a `cf_svy_*` key. |

CF UI labels (live `surveyTexts`): First Name, Last Name, Email, Phone Number.

**UNKNOWN:** exact HTML `name=` attributes on native CF contact inputs on this page. Looked: live HTML (empty `<form></form>` until JS), repo harness uses mock radio names only. CF editor or a completed webhook capture would confirm.

### Steps 2–11 — Mapped questions

| Order | Title (verbatim) | Type | Required | `cf_svy_*` key | Options (verbatim labels) |
|------:|------------------|------|:--------:|----------------|----------------------------|
| 2 | Set Your Target Amount | Single select (radio) | Yes | `cf_svy_funding_target_amount` | Less than $50k · $50k - $100k · $100k - $200k · $200k - $400k · $400k+ |
| 3 | Planned Use | Single select + **Other enabled** | Yes | `cf_svy_planned_use` | Growth (marketing, inventory, hiring) · Equipment or buildout · Debt consolidation · Payroll or rent · Covering a shortfall right now · Not sure yet · *(Other → free text in CF)* |
| 4 | What Would This Money Change Right Now? | **Multi-select** | Yes | `cf_svy_money_change_now` | Peace of mind (stop stressing about cash) · Grow faster (more customers / more reach) · Pay off pressure (wipe out high-interest debt) · Stability (cover bills / buffer slow weeks) · Fresh start (new business / startup launch) |
| 5 | Your Current Score | Single select | Yes | `cf_svy_self_reported_fico` | 500-579 · 580-649 · 650-699 · 700-749 · 750+ · Not sure |
| 6 | Do You Have a Business? | Single select (**branch**) | Yes | `cf_svy_has_business` | Yes, less than 6 months old · Yes, 6-12 months · Yes, 1-2 years · Yes, 2-5 years · Yes, 5+ years · **No, personal funding only** |
| 7a | Annual Business Revenue | Single select | Yes (if any **Yes…** tenure on step 6) | `cf_svy_business_revenue` | Under $100k · $100k - $249k · $250k - $499k · $500k - $999k · $1M+ |
| 8a | Can You Verify Revenue? | Single select | Yes (business path) | `cf_svy_revenue_verifiable` | Yes, bank statements · Yes, tax returns · Yes, both · Not right now |
| 7b | Annual Personal Income | Single select | Yes (if step 6 = **No, personal funding only**) | `cf_svy_annual_income_range` | Less than $50k · $50k-$99k · $100k-$199k · $200k-$499k · $500k+ |
| 8b | Can You Verify Income? | Single select | Yes (personal path) | `cf_svy_income_verifiable` | Yes, pay stubs · Yes, W-2 or tax returns · Yes, both · Not right now |
| 9 | Available Capital | Single select | Yes | `cf_svy_available_capital` | Less than $1k · $1k - $5k · $5k - $25k · $25k - $100k · $100k+ |

**Not on this CF survey:** “Any negatives on your credit report?” (`cf_svy_has_negatives`) — homepage only per ground truth (2026-08-25). Do not add to CF from repo.

**Harness note:** `harness/widgets/survey-shell.html` shows subhead **Required to continue.** on a sample step; live per-question subheads **UNKNOWN** without CF editor or client render.

---

## 3. Custom / hidden fields, attribution, CRM mapping

### 3a. Survey answer keys (`cf_svy_*`)

| Key | CRM / DB | Notes |
|-----|----------|--------|
| `cf_svy_funding_target_amount` | `clients.custom_fields` + typed `client_custom_fields` | CF may send numeric **option row id** on key; words on `cf_svy_funding_target_amount_label` |
| `cf_svy_planned_use` | same | Other text stored as answer value when chosen |
| `cf_svy_money_change_now` | same; typed column is `text[]` | Multi; CF may send `cf_svy_money_change_now_labels` (array or JSON string) |
| `cf_svy_self_reported_fico` | same | Label sibling: `cf_svy_self_reported_fico_label` |
| `cf_svy_has_business` | same | May send `cf_svy_has_business_label` / `_labels` |
| `cf_svy_business_revenue` | same | Business branch only |
| `cf_svy_revenue_verifiable` | same | Business branch only |
| `cf_svy_annual_income_range` | same | Personal branch only |
| `cf_svy_income_verifiable` | same | Personal branch only |
| `cf_svy_available_capital` | same | **Completion sentinel** — when present, CRM advances to `survey_complete` (`src/handlers/client-lifecycle.mjs`) |

**Adapter behavior:** `src/adapters/clickfunnels.mjs` `pickSurveyAnswers()` keeps `cf_svy_*` keys and, when values look like CF option ids (≥5 digit), replaces with `_label` / `_labels` text when present.

**UNKNOWN:** full map of CF option row id → label for every option (repo only has examples in tests, e.g. id `207883` → `$200k - $400k`). Source: CF admin export or `webhook_captures` with `CF_CAPTURE_MODE=1`.

### 3b. Standard contact fields (webhook / CRM)

| Field | Typical CF / webhook paths |
|-------|---------------------------|
| Email | `contact.email` / `email_address` |
| First / last name | `first_name`, `last_name`, or `full_name` |
| Phone | `phone`, `phone_number` |

Mapped in CF to built-in contact columns — **do not rename** (`OWNER-CF-SETUP-CHECKLIST.md`).

### 3c. Attribution & affiliate hidden fields

Loaded on apply via `https://fundhub.ai/funnel/fh-attribution.js` (same behavior as `clickfunnels-fragments/06-utm-hidden-fields.html`). Script stamps hidden inputs on **every** `form` on the page.

| Hidden input `name` | Purpose | CRM / events |
|----------------------|---------|----------------|
| `utm_source` | Ad source (e.g. `fb`) | `events` payload `attribution`; `client_ad_attribution` (`db/migrations/286_client_ad_attribution.sql`) |
| `utm_medium` | e.g. `paid` | same |
| `utm_campaign` | Lane e.g. `funding600` | same |
| `utm_content` | Ad id slug e.g. `42-ringlights` | same; ties to `fundhub_ad_id()` |
| `utm_term` | Variant e.g. `sun` | same |
| `landing_path` | First-touch pathname | same |
| `referrer_domain` | Referrer hostname | same |
| `a1` | Affiliate tier-1 (`?a1=`, `?ref=`, `?code=`) | Webhook → `entry.captured` / `survey.submitted` payload; AF-02 |
| `a2` | Affiliate tier-2 | same |

**Not captured:** `fbclid` or other click ids (by design in `06-utm-hidden-fields.html`).

**Apply page:** no `#fhw` roadmap widget — `/roadmap`-only behaviors in that file (slo-interest, engage pulse) do **not** run on `/apply`.

### 3d. Consent / TCPA on apply

**UNKNOWN / not in apply fragments:** no consent checkbox on `/apply` in `02a`/`02b` or live curl. SLO sales widget consent is on `/roadmap` only.

### 3e. Legacy `cf_svy_*` columns (not in current CF survey)

Exist in schema / carbon-copy writer but **not** mapped on apply survey today: `cf_svy_has_negatives`, `cf_svy_your_why`, `cf_svy_what_matters_most`, `cf_svy_tried_restoration_before`, `cf_svy_clarity_first`, etc. (`src/handlers/client-custom-fields.mjs` allowlist).

### 3f. Webhook ingress

| Item | Value |
|------|--------|
| URL | `https://fundhub.ai/api/webhooks/clickfunnels` |
| Method | POST |
| Secret | Netlify `CLICKFUNNELS_WEBHOOK_SECRET` (HMAC per CF 2.0 docs) |
| Canonical events (typical form/survey post) | `entry.captured`; plus `survey.submitted` when `cf_svy_*` answers present |
| `survey.submitted` payload | `email`, `name`, `phone`, `funnel`, `source: clickfunnels`, `answers`, `a1`, `a2`, `attribution` |
| Repeat suppression | Same email + funnel within window: `survey.submitted` / `entry.captured` still merge data; Inngest run may be skipped (`REPEAT_SUPPRESSED_EVENTS`) |

**Downstream CRM writes (`survey.submitted`):**

- Merge all `answers` into `clients.custom_fields` (jsonb)
- `upsertSurveyCarbonCopy` → typed `client_custom_fields` for known `cf_svy_*` columns
- If `cf_svy_available_capital` present → `lifecycle_status: Survey Complete`, sales stage `survey_complete`

**Stage-2 qualification (homepage API path, not CF redirect):** `src/config/survey-qualification.mjs` expects FICO 700–749 or 750+ and `cf_svy_has_negatives = No` for PASS. **CF apply does not collect negatives** → live CF completions often **`MANUAL_REVIEW`** if that gate is applied without homepage data.

---

## 4. Post-submit behavior

| Behavior | Detail |
|----------|--------|
| In-funnel redirect | CF survey end link: `survey_end_href` → next funnel step (resolves to tokenized `?next_funnel_step=…`; destination step is **`/funding-book-call`** in intended journey) |
| End copy | `You're qualified. Pick a time below.` |
| Intended next URL | https://apply.fundhub.ai/funding-book-call (`docs/workflows/manual-walkthrough-2026-09-03.md`, perf audit notes on `survey_end_href`) |
| Webhooks | CF workspace webhook(s) → Fundhub adapter → `entry.captured` + `survey.submitted` (per partial/full submit depending on CF event configuration) |
| Workflows (examples) | `s-nobook-chase` on `survey.submitted`; `s-02-incomplete-survey-nudge` after `entry.captured` if no survey within 20m |
| Homepage-only API | `POST /api/public/survey-submit` is **not** the live CF apply path; used for `fundhub.ai` widget with redirect rules (PASS → book call) |

**UNKNOWN:** exact CF webhook event names (e.g. per-question vs final-only) for workflow `1924936`. Confirm in CF Automations / webhook delivery log.

**Not on apply submit:** Meta InitiateCheckout (roadmap pay), slo-interest contact beacon (no `#fhw`).

---

## 5. Layout as of now (shell + widget chrome)

### 5a. Page structure (top → bottom)

1. **Fixed grid background** — `#FCFCFC`, 44×44px lines, `body::before` (`02a`)
2. **Header** — centered Fundhub logo (inline SVG data URI), 124×25px (104×21 on ≤640px)
3. **Hero** (`.fh-a`) — centered, max-width 900px wrap, 24px horizontal padding
4. **Native `Survey/V1`** — CF-rendered card (between fragments)
5. **Marquee** — full-bleed white band, scrolling trust lines (tri-bureau soft pull, lender matrix, etc.)
6. **Footer** — funding + Meta disclaimers, privacy/terms links, “systems nominal · fundhub.ai”
7. **Ghost watermark** — large faint logo (`96vw` width)

Both fragments load **`fh-attribution.js`** (do not also paste `06-utm-hidden-fields.html`).

### 5b. Hero copy (live 2026-09-30)

| Element | Exact string |
|---------|----------------|
| Eyebrow | `Application · Step 1 of 2` |
| H1 | `Let's See What You Qualify For` |
| Lede | `A few quick questions, then pick a time for your call. Soft pull only. Zero score impact.` |

### 5c. Survey card shell (Fundhub CSS on native widget)

From `02a` / `02b` (top margin differs slightly):

| Property | Value |
|----------|--------|
| Max width | 900px |
| Width | `calc(100% - 48px)` → **24px gutter** each side |
| Margin | 20px auto (top) / 28px auto (bottom block) |
| Background | `#FCFCFC` (top) / `#fff` (bottom rules) |
| Border | 1px `#E4E4E7`, radius 14px |
| Shadow | `0 18px 44px rgba(10,10,10,.10)` |
| Inner padding | 12px |

CF section wrappers around survey are forced **transparent** so the grid shows through (`:has([data-page-element="Survey/V1"])`).

### 5d. Typography / tokens

- Fonts: Inter (UI), JetBrains Mono (eyebrow, marquee, footer meta)
- Ink `#0A0A0A`, gray body `#52525B`, line `#E4E4E7`
- Spectrum accent gradient on eyebrow rule and marquee dividers

### 5e. Mobile / layout pain points (documented elsewhere — not fixed here)

| Issue | Source |
|-------|--------|
| Full-bleed footer/marquee uses `width: 100vw` + `margin-left: calc(50% - 50vw)` (`02b`) — can cause **horizontal scroll** on some viewports | `02b-apply-bottom.html`, `fixes-v2.md` |
| Survey card **48px** total horizontal inset vs book page **16px** gutters on phones (`04d-book-fit`) | `fundhub-funnel-dropins-v2` / book-fit note |
| Grey boxes below footer | **Not** on live apply at 375px (2026-08-11); if seen in CF **editor preview**, delete empty elements below bottom custom HTML (`fixes-v2.md`) |
| V2 widget polish (blue progress, radio selected `#188bf6`, Inter on inputs) | **`clickfunnels-fragments/fundhub-funnel-dropins-v2/02a-apply-top.html`** — optional drop-in; **not** committed as live `02a` unless pushed |

---

## 6. UNKNOWN gaps (Chris / CF admin)

| Gap | Where to look |
|-----|----------------|
| Native contact field `name=` attributes | CF survey editor → contact step; or webhook capture body |
| Per-question CF subheadlines (e.g. “Required to continue.”) | CF editor or live render after JS |
| Full option row id → label map for all questions | CF admin or production webhook capture |
| Webhook fires: every step vs final submit only | CF workspace webhooks / automation for funnel workflow `1924936` |
| Whether all ten `cf_svy_*` attributes are mapped in CF (checklist said “None” historically) | CF survey → Contact Attribute per question |
| Exact next-step URL when `next_funnel_step` token changes | CF funnel step graph (apply → book) |

---

## 7. Rebuild constraints

| Rule | Why |
|------|-----|
| **Keep native CF `Survey/V1` on `/apply` until cutover** | `docs/workflows/funnel-cutover-2026-09-21.md` — no full custom replacement for apply path; manifest `head_footer_append_only` |
| **Preserve `cf_svy_*` attribute keys and option label strings** | Webhook adapter, CRM merge, closer deck, pipeline UI, qualification config |
| **Preserve branch rule** | “No, personal funding only” → personal income + verify; any Yes tenure → business revenue + verify |
| **Preserve multi-select semantics** for `cf_svy_money_change_now` | Typed `text[]` column; CF `_labels` sibling |
| **Preserve attribution hidden field names** | `utm_*`, `landing_path`, `referrer_domain`, `a1`, `a2` |
| **Keep post-submit funnel handoff to booking step** | Intended `/funding-book-call`; calendar must stay native CF |
| **Do not add `cf_svy_has_negatives` to CF** without explicit owner decision | Ground truth + checklist |
| **Label/id duality** | Replacements must either send human labels or ids **plus** `_label`/`_labels` like CF, or CRM will show numeric ids |
| **Safe to change without webhook break** | Hero/marketing copy in `02a`/`02b`, grid/card chrome CSS, marquee/footer text (not survey field names), V2 visual polish on shell only |
| **Not safe** | Renaming `cf_svy_*`, reordering branch logic without migration, replacing survey with custom HTML while still expecting CF webhook shape |

---

## Quick reference counts

| Metric | Count |
|--------|------:|
| Survey question definitions (incl. contact) | **11** |
| Active `cf_svy_*` keys on apply | **10** |
| Hidden attribution + affiliate field names | **7** |
| Screens per completion (typical) | **10** (contact + 8 answered + branch pair collapsed) |

**One-line summary:** **11** steps defined (**10** `cf_svy_*` + contact), **17** non-survey hidden/contact/UTM field names documented; **6** UNKNOWN rows need CF admin or webhook capture.
