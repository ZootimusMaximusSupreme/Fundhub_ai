# Assumed funnel + ad metrics (for Gemini / planning)

**Built:** 2026-09-22  
**Sources:** ClickFunnels API pull (`cf-page-stats-pull-2026-09-22.json`), `docs/workflows/archive/ads-revenue-model-2026-08-24.md` (Chris/Paul ad truth through Aug 15).  
**Not Meta measured.** No CTR, CPM, or CPC was stored in the repo. Everything below is labeled **fact**, **CF all-time**, or **assumed**.

---

## 1. Ad facts (repo — use these, do not swap)

| Metric | Value | Window |
|--------|-------|--------|
| Meta spend | **$322.89** | Through **Aug 15, 2026** |
| Booked calls (Paul) | **16** | Same window |
| Cost per booked call (math) | **$20.18** | $322.89 ÷ 16 |
| Cost per booked call (quoted) | **~$33** | Paul/Chris — may be different slice or rounding |
| Total Meta spend (quoted) | **~$680** | All-in, later snapshot |
| Budget | Cut **$100 → $50/day** | Aug 15 era |
| Pixel | `2403674420141513` | — |

**CRM (not the $33 numerator):** 20 booking rows through Aug 15; 40 rows later — different count than Paul’s 16.

---

## 2. ClickFunnels — Fundhub Funnel (`968281`, apply.fundhub.ai)

**Pulled:** 2026-09-22 via API. **All-time** step stats (not filtered to Aug 15).

| Live URL | Step | views_all | views_unique | optins | optin_rate (CF) |
|----------|------|-----------|--------------|--------|-----------------|
| `/watch` | VSL | 77 | 28 | 0 | 0 |
| `/apply` | Apply | 23 | 19 | 72 | 3.79 |
| `/funding-book-call` | Book | 42 | 28 | 11 | 0.39 |
| `/thank-you` | Thank you | 62 | 61 | 0 | 0 |
| `/roadmap` | $297 sales | 27 | 5 | 0 | 0 |
| `/fundhub-297-roadmap-book--c8e0b` | $297 book | 0 | 0 | 0 | 0 |
| `/roadmap-thank-you` | $297 TY | 0 | 0 | 0 | 0 |
| `/order` (297 checkout step) | Order | 2 | 1 | 0 | 0 |

**How to read CF `optin_rate`:** on Apply, CF reports `optins ÷ views_unique` on that step (72 ÷ 19 ≈ 3.79). Opt-ins are **cumulative on the step**, not “this week only.” Do not treat 72 as “72 people this month.”

Raw JSON: `docs/workflows/cf-page-stats-pull-2026-09-22.json`.

---

## 3. Assumed CPC → implied clicks (Aug 15 spend only)

No click log in Fundhub. Back into clicks from spend and a **CPC band** (finance cold traffic — **assumed**, not measured):

| Assumed CPC | Implied clicks ($322.89 ÷ CPC) |
|-------------|--------------------------------|
| $2.50 | **129** |
| $3.00 | **108** |
| $3.50 | **92** |
| $4.00 | **81** |

**Working mid:** **~108 clicks** at **$3.00 CPC**.

---

## 4. Assumed ad Link CTR (needs impressions — pick a band)

CTR = link clicks ÷ impressions. We have **no impressions** in repo.

**Method:** assume a **cold finance Link CTR**, then get impressions = clicks ÷ CTR.

| Assumed Link CTR | Implied impressions (if 108 clicks) |
|------------------|-------------------------------------|
| 0.8% | 13,500 |
| 1.0% | 10,800 |
| 1.2% | 9,000 |
| 1.5% | 7,200 |
| 2.0% | 5,400 |

**Planning default for Gemini (label as ASSUMED):** **Link CTR 1.0%–1.5%**, **CPC ~$3**, **108 clicks** on **$322.89** spend.

That is **consistent with spend + CPC**, not read from Ads Manager.

---

## 5. Funnel assumptions (old apply path — book a call)

Use **16 booked calls** and **~108 assumed clicks** (mid CPC):

| Metric | Formula | Assumed value |
|--------|---------|---------------|
| Click → booked call | 16 ÷ 108 | **~14.8%** (ASSUMED — very high; small N) |
| Spend → booked call | already fact | **$20.18** (FACT math) or **~$33** (quoted) |

Compare to CF **all-time** (do not mix windows blindly):

- **11 optins** on book step vs **16** Paul calls — same order of magnitude, different definitions.
- **28 unique** VSL views all-time vs **108** implied clicks in Aug window — clicks likely **> unique VSL views** over life, or Aug clicks mostly pre/post CF window overlap; **do not force equality**.

**Honest on-page rates (CF all-time, same funnel, weak cohort math):**

- VSL unique → book-step unique: 28 → 28 views on book (not a clean funnel ratio).
- Apply step: **72 opt-ins** lifetime on step with **19 unique** views on that step (CF definition).

For Gemini: say **“booked-call funnel, ~15% click-to-book on Aug slice if CPC $3”** only with the ASSUMED tag.

---

## 6. $297 `/roadmap` path (no ad history yet)

CF all-time: **27** views (**5** unique), **0** sales on step. Too thin for CTR or conversion assumptions. Use industry ranges in ads docs, not these numbers.

---

## 7. One paste block for Gemini (honest)

```text
Fundhub measured (repo + CF API 2026-09-22):
- Aug 15 ad slice: $322.89 spend, 16 booked calls, $20.18 CPBC by division (quoted ~$33).
- No stored Meta CTR/CPC/CPM.

Assumed (for modeling only, not measured):
- CPC $2.50–$4.00 → ~81–129 clicks on $322.89; mid ~108 @ $3.
- Link CTR band 1.0–1.5% cold finance → ~7k–11k impressions if 108 clicks.
- Click-to-booked-call ~15% on that slice (16/108) — small sample.

CF all-time funnel (Fundhub Funnel): /watch 77 views (28 uniq), /apply 72 step opt-ins (19 uniq views), /book 11 optins (28 uniq views), /thank-you 62 views. Not the same date range as Aug ad spend.
```

---

## 8. What would make this real

1. **Meta Ads Manager** export or `META_ACCESS_TOKEN` + sync → actual CTR, CPC, impressions.  
2. **Date-range CF stats** (`timerange_start` / `timerange_end` on `/pages/{id}/stats`) aligned to Aug 1–15.  
3. **DirectROAS** (Paul’s dashboard) if it holds daily clicks — not in this repo.
