# Perfect file — syntax

**Company:** Fundhub  
**Product:** UnderwriteIQ  
**Date:** 2026-09-26  
**Kind:** Spec from repo sources + Chris’s funding walk law (same day, corrected order). No inventing dollar amounts or “unlimited funding.”

**Name note:** Chris typed “alec duepesh.” In this repo the scrape and gap boards use **Alec Delpuech** / Legacy Strong. Ads also say **Alec Dupesh**. Same person; same Notion scrape under `credentials/notion-scrape/output/`.

---

## Funding walk — Chris law (this is the order)

This order is the law. Do not invent a different one.

| # | Step | What it means |
|---|---|---|
| **1** | Prime the personal credit file | Nothing else is worth doing until the personal file is prime. Ready bar = existing UnderwriteIQ **fundable** (700+, util ≤30% or unknown, zero bad marks). |
| **2** | Personal funding | For people with **no business**. Also the extra stack when someone has a business and wants more money on a business round. **Personal comes before business.** |
| **3** | Companies | Only when they have companies or open aged ones. Name must be good. NAICS must be good **when a company is on the path.** A person with **no company must not stick here** — they go personal funding → lender list → apply. |
| **4** | Lender list (geo) | Optimize for home state and/or business state. Only after personal is primed, and after companies are satisfied **if** they are on the company path. No-business path does **not** need a company or NAICS. |
| **5** | Apply forever | Round after round. A round can be personal only. A business round can include personal funding. This step **never completes.** |

**Code:** `src/underwrite/funding-sequence.mjs` — `evaluateFundingSequence` walks this order. The UnderwriteIQ read returns `fundingSequence` on every assessment (`api/read/underwrite.mjs` → `buildReport`).

---

## What the perfect file is

The **perfect file** is the credit-and-business profile that is ready for the next funding step without fighting itself.

It is not a promise of a dollar amount. UnderwriteIQ’s dollar number is a **first-look guess**, not a bank saying yes (`docs/workflows/underwriteiq-plain-2026-08-25.md`, `docs/workflows/underwriteiq-logic-full-2026-08-25.md`).

Chris’s own materials do **not** define a product called “unlimited funding.” What they do say:

- Go after the **most funding your file can possibly get** (`docs/ads/fundhub-297/FundHub-LOCKED-ADS.md`, `docs/ads/fundhub-297/FundHub-VSL-Scripts.md`).
- Personal funding **plus** business funding, across **multiple businesses**, stacked — **potentially seven figures** (same Locked Ads / Ad 7). Always “potentially,” never a flat seven figures.
- Run it right and funding stops being a one-time chase — **hundreds of thousands again and again** while you stay in business (VSL 2 booking script).
- Alec’s aged-corp sequence page ends with **“Total Funding Potential: 500k+”** (`credentials/notion-scrape/output/details-aged-corp--1b8c3aa7/FULL.md`). That is Alec’s line, not a Fundhub guarantee.

**MISSING:** A Fundhub owner line that literally defines “unlimited funding” as a fixed dollar, a lender product, or a contractual promise. Do not invent one.

---

## How to use this syntax

1. Walk the **funding walk** above. Do not skip ahead.
2. Fill every **field** you can measure. Unknown stays blank — do not invent.
3. Check the **ready gates** before moving to the next step.
4. Alec scrape notes may confirm a detail. They do **not** override Chris’s order above.

---

## Ready gates — Chris walk

Use these as a checklist. **Unknown = not ready** unless a cited rule says null is allowed.

| Step | You may move when… | Blocking if… | Code |
|---|---|---|---|
| **1. Prime personal** | UnderwriteIQ **fundable**: score ≥ 700, util ≤ 30% or null, negatives measured === 0 | Score under 700; measured negatives; (util over 30 when known) | `underwrite.fundable` |
| **2. Personal funding** | Step 1 ready | Personal not prime | `personalFundingReady()` |
| **3. Companies (name + NAICS)** | **No companies** → step is skipped (ready). **Has companies** → ≥1 with a **non-blank name** and a **NAICS** on `entity_data.naics` (or `naics_code`) | On company path: blank name; no NAICS | `companiesReady()` |
| **4. Lender list (geo)** | Steps 1–2 ready, companies satisfied **or skipped**, and home and/or business state known | Personal not prime; company path incomplete; geography unknown | `lenderListReady()` + `src/lenders/match.mjs` |
| **5. Apply forever** | Steps 1–4 ready | Prior steps incomplete | Never “complete” — rounds keep going |

### Step the code cannot finish yet

**NAICS write path (company path only).** Client `businesses` can hold NAICS on `entity_data.naics` (jsonb — **no new table**). The checkout save (`parseSloBusinesses`) stores `naics` when the order sends it. UnderwriteIQ then audits that code and the company name in `companyAudit` (`src/underwrite/company-audit.mjs`): a code off the low-risk list, or a name with a flagged word, comes back as a suggestion and a reason. It does not rename the company and it does not block payment. The checkout page does not yet show the industry list. Until a code is saved, the **company** path stays blocked with `company_naics_missing`. A **no-business** personal-funding file is **not** blocked by missing NAICS.

---

## Syntax — fields by walk step

### Step 0. Source snapshot (always first, before the walk)

| Field | Meaning | Source |
|---|---|---|
| Pull date | When the three-bureau file was read | UnderwriteIQ / CRS path |
| Soft vs hard pull | Soft so score does not move (Fundhub $297 promise) | `docs/ads/fundhub-297/FundHub-VSL-Scripts.md` |
| Bureaus present | Experian, Equifax, TransUnion — which have a score | `docs/workflows/underwriteiq-logic-full-2026-08-25.md` |
| Score type | FICO vs free Vantage | Alec wants **FICO**. UnderwriteIQ: **GAP** — does not check score type |

**Ready to analyze:** at least one bureau has a real score.

---

### Step 1 fields — prime the personal file

#### Scores

| Field | Perfect / strong target | UnderwriteIQ fundable | Cite |
|---|---|---|---|
| Score (per bureau) | **700+** strong; **740+** Alec RM | Primary bureau **≥ 700** | Alec; `underwriter.cjs` |
| Median across bureaus | Roadmap table | Printed; not the fundable gate alone | `roadmap.mjs` |

#### Utilization

| Field | Alec strong | UnderwriteIQ fundable | Fundhub roadmap target |
|---|---|---|---|
| Per card | Under **10%**; **0–3%** best | Not checked per card | Pay each open card to **10%** |
| File overall | — | **≤ 30%** (null does not fail fundable) | Overall under **10%** |

Cites: Alec thin-profile / checklist / RM; `underwriter.cjs`; `src/waypoints/definitions.mjs` (`PAYDOWN_TARGET_FRACTION = 0.1`).

#### Accounts (tradelines)

| Field | Perfect / strong | UnderwriteIQ | Cite |
|---|---|---|---|
| Open personal accounts | **4+** | Thin if fewer than **3** good lines | Alec; `underwriter.cjs` |
| High-limit card | ≥ **$10,000** | Stacks from seasoned open revolving ≥ **$5,000** × 5.5 | Alec; engine |
| Average age | ≥ **2 years** | No average; seasoning = line ≥ **24 months** | Alec; engine |

#### Negatives

| Field | Perfect | UnderwriteIQ fundable |
|---|---|---|
| Collections / charge-offs / bankruptcies | **None** | Measured **negatives === 0** (null fails) |

#### Hard inquiries

Alec gates on recent inquiries per bureau. UnderwriteIQ **fundable ignores** inquiry count. Still clean them on the optimize path; they do not block step 1’s fundable flag.

#### Personal identity hygiene

Extra names / addresses / jobs — clean before apply. **MISSING** in UnderwriteIQ dollar engine.

---

### Step 2 — personal funding

| Field | Rule |
|---|---|
| Path | Open once personal is prime. No company required. |
| With a business later | Personal funding still comes **before** business on the walk. It is also the extra stack on a business round. |

---

### Step 3 fields — companies (only if on the company path)

| Field | Rule | UnderwriteIQ today | Cite |
|---|---|---|---|
| Company present | Optional. Zero companies → step skipped | `companiesReady` sets `skipped: true` | `funding-sequence.mjs` |
| **Legal name** | Good, usable name **when companies exist** | `businesses.name` | Chris law |
| **NAICS** | Correct industry code **when companies exist** | Read from `entity_data.naics` — **write path MISSING** | Chris law |
| Age | Existing or aged companies; Alec LOC often wants **24+** months | Age multiplies company dollars (0.5× / 1× / 2×) | engine; business-funding.mjs |
| Entity type / EIN / DUNS / website | Alec prep | Ignored by Lite dollars | Alec checklist; gaps board |

Name and NAICS belong **with** companies on the company path. They do **not** block a no-business personal-funding file.

---

### Step 4 fields — lender list by geography

| Field | Rule | Code |
|---|---|---|
| Home state | Where the person lives | `resolveMatchStates` / pii + custom fields |
| Business state | Where the company is (company path) | `businesses.entity_data.state` |
| Lender shortlist | Match lenders that cover home **and/or** business state | `src/lenders/match.mjs` |

Do **not** optimize the lender list before personal is prime. On the company path, do not optimize before companies are ready (name + NAICS).

---

### Step 5 — apply forever

| Field | Rule |
|---|---|
| Lender order | Apply in the optimized list order |
| Rounds | Round after round — `funding_rounds` count is informational; step never completes |
| Personal-only round | Allowed |
| Business round | May include personal funding |
| One-and-done | **Forbidden** |

---

### UnderwriteIQ money fields (Fundhub engine shape)

Not Alec’s published formula. Documented so the perfect file can be checked against what Fundhub prints.

| Field | Rule | Cite |
|---|---|---|
| Card dollars | Highest open revolving, ≥ 24 mo, limit ≥ $5,000, × **5.5** | underwriter.cjs |
| Loan dollars | Highest seasoned installment/auto/mortgage ≥ $10,000, no lates, × **3** | Same |
| One-bureau cut | If only one bureau is fundable, personal dollars × **1/3** | Same |
| Company dollars | Card dollars × age multiplier; stacked **per saved company** | Same |
| Fundable flag | score ≥ 700 AND (util null or ≤ 30) AND neg === 0 | Same — **step 1 gate** |

**Alec never published** the 5.5×, 3×, or one-third rules (`docs/workflows/uw-alec-gaps-2026-08-25.md`).

---

### Credit Optimization Roadmap months (deliverable copy)

The **Credit Optimization Roadmap** PDF/HTML still prints a six-month strip (`src/deliverables/roadmap.mjs` `MONTHS`). That strip is **buyer-facing deliverable copy**. Chris’s **walk law** above is what UnderwriteIQ logic follows for next step. If the month strip and the walk disagree, the walk wins for product logic; do not “fix” the strip in this change (HTML/CSS / buyer pages stay untouched).

---

### Alec notes (confirm only — do not override Chris order)

After the personal file is ready, Alec’s aged-corp pages talk about banking relationships, funding rounds, and WIPE between rounds. Use those notes for bank detail on the **company** path. Round detail: `credentials/notion-scrape/output/details-aged-corp--1b8c3aa7/FULL.md` and `the-perfect-funding-sequence-aged-corps--2edc3aa7/FULL.md`. Those bank dollar goals are not Fundhub promises.

---

## Perfect file — one-page field list

```text
# PERFECT FILE SNAPSHOT
pull_date:
bureaus_with_score: [EX | EQ | TU]
scores: { experian:, equifax:, transunion:, median: }
utilization_overall_pct:
utilization_per_open_card: [ { creditor:, limit:, balance:, pct: } ]
open_account_count:
negatives_count:
# Step 1 gate
underwriteiq_fundable: yes|no
# Step 2
personal_funding_open: yes|no
# Step 3 — only if companies exist (else skipped)
companies: [ { name:, naics:, age_months:, state: } ]
companies_skipped: yes|no
# Step 4
home_state:
business_state:
lender_list_optimized: yes|no
# Step 5
funding_round_count:
apply_forever: yes   # never done
next_walk_step: prime_personal|personal_funding|companies|lender_list|apply_forever
```

---

## Disagreements — Alec vs UnderwriteIQ (reference only)

| Topic | Alec | UnderwriteIQ / Fundhub |
|---|---|---|
| Ready score | 700+ strong; **740+** RM | Fundable at **700** (step 1) |
| Utilization | Strong ≤10% per card | Fundable ≤30% overall |
| Inquiries | Hard gate | Fundable ignores |
| Company age for LOC | ≤23 months defeats | Still pays at 12–23 months |
| Walk order | Aged-corp banking sequence after personal | **Chris law:** prime → personal funding → companies (if any) → geo lender list → apply forever |
| “Unlimited funding” | Not defined in scrape | Not a Fundhub product promise |

---

## Sources used (paths)

**Chris walk (this change):**

- `src/underwrite/funding-sequence.mjs`
- `src/underwrite/report.mjs` (`fundingSequence` on buildReport)
- `api/read/underwrite.mjs`

**Alec scrape (confirm only):**

- `credentials/notion-scrape/output/the-perfect-funding-sequence-aged-corps--2edc3aa7/FULL.md`
- `credentials/notion-scrape/output/details-aged-corp--1b8c3aa7/FULL.md`
- `credentials/notion-scrape/output/funding-checklist--a32ca1c4/FULL.md`
- `credentials/notion-scrape/output/update-biz-info--e3cf8232/FULL.md` (biz name / industry hygiene)

**UnderwriteIQ / product:**

- `docs/workflows/uw-alec-gaps-2026-08-25.md`
- `docs/workflows/underwriteiq-logic-full-2026-08-25.md`
- `src/underwrite/vendor/underwriter.cjs`
- `src/lenders/match.mjs`
- `src/deliverables/roadmap.mjs`
- `src/waypoints/definitions.mjs`

---

## Explicitly missing (do not invent)

1. A Fundhub definition of **“unlimited funding.”**
2. A write path that saves **NAICS** onto client `businesses.entity_data` (blocker for the **company** path only — not for no-business personal funding).
3. Alec’s published **card × N** formula matching Lite’s 5.5 / 3.
4. UnderwriteIQ reading of AU vs primary, income, DUNS, or banking deposits for the dollar engine.

---

*End of syntax. Logic + this doc updated for Chris locked walk order. Not committed. Not shipped.*
