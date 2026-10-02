# SLO Ads Drive — content map (transcript pass)

**Date:** 2026-09-23  
**Folder:** `13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ` (45 MP4s → **20 unique md5**)  
**Method:** One local file per md5 (`/tmp/slo-videos-by-md5/`). Audio via `afconvert` 16 kHz WAV. Speech via **faster-whisper** `base.en` (CPU). Matched opening lines and body beats to `docs/ads/fundhub-297/FundHub-LOCKED-ADS.md`, `FundHub-VSL-Scripts.md`, `docs/ads/portal-welcome-video.md`, and prior `docs/workflows/slo-video-script-check-2026-09-21.md`.  
**Inventory source:** `docs/workflows/slo-ads-drive-organize-2026-09-23.json`

---

## Executive findings

1. **`SLO VSL Take 1.mp4` (~344 MB) is not VSL 1.** Speech is the **portal welcome** walkthrough (~3:23), aligned with `docs/ads/portal-welcome-video.md` (“Hey, it's Chris. Welcome in…”, tracker, send a file, refer-a-friend). There is **no single full ~3:05 sales VSL 1** on Drive; sales VSL 1 is **four segments** (Open / Middle / FAQ / Close).
2. **Locked ads on tape:** **AD 1**, **AD 3**, **AD 6** (one partial + one hook-only), **AD 7** (Haynes call-pitch). **Not found in any of the 20 files:** **AD 2**, **AD 4**, **AD 5** (no “declined”, “roadmap without the call”, or “max fundability” opens).
3. **“SLO Ad 7 Call Pitch Take 2–6” is mostly mislabeled.** Take **2** = **LOCKED AD 3**. Take **3** = **LOCKED AD 6** (partial). Take **4** = **VSL 2 booking** (alt take, not an ad). Take **1** = **LOCKED AD 7** (correct hook). Takes **5–9** are **CTA scraps** or one-word fragments — trash candidates.
4. **`SLO Ad 7 Take 1.mp4`** = **unwritten “two sides” stacking script** (personal + business), not LOCKED AD 7 (that script lives on **Call Pitch Take 1**).
5. **Retarget:** **`SLO Funding Roadmap Take 3.mp4`** = checkout-abandon script (no repo doc). **`SLO Funding Roadmap Take 2.mp4`** = **11 s** portal-welcome cold open only — junk.
6. **25 Drive files** are **md5 dupes** of a keeper (mostly iPhone UUID names); safe to trash per organize JSON `plan.trash`.

---

## Content table (one row per unique md5)

| Drive filename(s) | md5 | duration | best script match | should rename to (Chris SLO naming) |
|---|---|---:|---|---|
| `8FEE9AD2-…mp4`, **`SLO VSL Take 1.mp4`** (keeper) | `ae3270598ab64c61e37b4d77a57f61b1` | 203s | **Portal welcome** — `docs/ads/portal-welcome-video.md` | **`SLO Portal Welcome Take 1.mp4`** (was wrongly “VSL Take 1”) |
| `89732C4A-…mp4`, **`SLO VSL 2 Booking.mp4`** | `15c8f0deed21739d668dfe98fc54d667` | 99s | **VSL 2 — Booking** — `FundHub-VSL-Scripts.md` | **`SLO VSL 2 Booking Take 1.mp4`** (keep) |
| `CF8122BD-…mp4`, **`SLO VSL 1 Open.mp4`** | `1931c9bbf10ed3de191d61cc75443f08` | 97s | **VSL 1 — Sales** (open + offer block) | **`SLO VSL 1 Open.mp4`** (keep) |
| `44BD450F-…mp4`, **`SLO VSL 1 Middle.mp4`** | `c7303ac4d9838e7177070836e6c31ba1` | 89s | **VSL 1 — Sales** (ML / deliverables / start FAQ) | **`SLO VSL 1 Middle.mp4`** (keep) |
| `01D86318-…mp4`, **`SLO VSL 1 Close.mp4`** | `332f58572745d57f14dc27dfedbd7f06` | 75s | **VSL 1 — Sales** (FAQ tail + guarantee + CTA) | **`SLO VSL 1 Close.mp4`** (keep) |
| `494FE8D9-…mp4`, **`SLO Ad 7 Take 1.mp4`** | `7c0b68b76a961b202ea8ebab0e89f79f` | 75s | **No locked script** — personal/business “two sides” variant | **`SLO Ad 7 Two Sides Take 1.mp4`** (or keep `SLO Ad 7 Take 1` per manifest) |
| `2D96BC3E-…mp4` (×3 dupes), **`SLO Ad 1 Take 1.mp4`** | `05ce196146b1de3d6c1626542cd4045c` | 67s | **LOCKED AD 1** — straight offer full read | **`SLO Ad 1 Take 1.mp4`** (keep) |
| `891D5D3A-…mp4`, **`SLO Ad 7 Call Pitch Take 2.mp4`** | `5095e39610caf4ec5604c1eca706e640` | 67s | **LOCKED AD 3** — “what your file is worth” | **`SLO Ad 3 Take 1.mp4`** |
| `BE952592-…mp4`, **`SLO Ad 7 Call Pitch Take 1.mp4`** | `33771941002cdda5afff57847c4ad9e9` | 66s | **LOCKED AD 7** — Haynes call / roadmap pitch | **`SLO Ad 7 Call Pitch Take 1.mp4`** (keep) |
| `C5F65378-…mp4`, **`SLO Funding Roadmap Take 3.mp4`** | `9bac5f15d90cf1d0e7adc687ab42a523` | 61s | **Checkout-abandon retarget** (no repo script) | **`SLO Funding Roadmap Take 3.mp4`** or **`SLO Retarget Checkout Take 3.mp4`** |
| `03C0BE65-…mp4`, **`SLO Ad 7 Call Pitch Take 3.mp4`** | `7656a6719d023abffe97773a2cbcc2b5` | 57s | **LOCKED AD 6** — Haynes partial (REASONS + CTA; missing hook) | **`SLO Ad 6 Take 1.mp4`** |
| `9616DBB6-…mp4`, **`SLO Ad 7 Call Pitch Take 4.mp4`** | `db08cdf7823291280c91854f55449315` | 55s | **VSL 2 — Booking** (alternate take; cuts mid-script) | **`SLO VSL 2 Booking Take 2.mp4`** |
| `C591AAD1-…mp4`, **`SLO Ad 7 Call Pitch Take 6.mp4`** | `468b90ae145f7c4843cd40ec70091fa4` | 37s | **LOCKED AD 6** — hook + start of REASONS only | **`SLO Ad 6 Take 2.mp4`** (partial) or **trash** if Ad 6 Take 1 is keeper |
| `1EA2FB13-…mp4`, **`SLO VSL 1 FAQ.mp4`** | `6a3520e0efcf5e9d45f89877f9b0f520` | 35s | **VSL 1 — Sales** (FAQ block only) | **`SLO VSL 1 FAQ.mp4`** (keep) |
| `24337812-…mp4`, **`SLO Ad 7 Call Pitch Take 5.mp4`** | `bbe474490a1a5ad4d86334a9436b0489` | 31s | **VSL 1 close CTA fragment** (not a standalone ad) | **Trash** |
| `91857F54-…mp4`, **`SLO Ad 7 Call Pitch Take 9.mp4`** | `928f3d5f01bcf79a3b7348b122b237d3` | 28s | **VSL 2 fragment** (“You can run the roadmap”) | **Trash** |
| `D9F44B24-…mp4`, **`SLO Funding Roadmap Take 2.mp4`** | `54dc462adba65b57ae558e0d5a3f6bd8` | 11s | **Portal welcome** cold open only | **Trash** (unless merged in edit) |
| `D8499A33-…mp4`, **`SLO Ad 7 Call Pitch Take 8.mp4`** | `451ee8473384bac2adab104e6d39af30` | 8s | **VSL 1 CTA fragment** | **Trash** |
| `E0B42CA1-…mp4`, **`SLO Ad 7 Call Pitch Take 7.mp4`** | `4f318b0c65c4e0a0ff91468a1934eb7b` | 4s | **CTA stutter fragment** | **Trash** |
| **`847ED8E1-…mp4`** (keeper; dup name collision in organize plan) | `f1920fd0cf8978d5846013a2c4a1b566` | 2s | **Junk** — “soft inquiry / score doesn't move” tail | **Trash** (same as old `SLO Ad 1 Take 2`) |

---

## VSL 1 on Drive (sales page)

| Segment | md5 | Duration | Covers (approx.) |
|---|---|---:|---|
| Open | `1931c9bb…` | 97s | “Your credit file could be worth…” through deliverables (cuts before “10 seconds… account”) |
| Middle | `c7303ac4…` | 89s | ML paragraph through “Three questions I get…” |
| FAQ | `6a3520e0…` | 35s | FAQ through “takes about six…” (truncated) |
| Close | `332f5857…` | 75s | “Do you do the work…” through duplicated max-funding close |

**Not on Drive:** one continuous **~185 s** full VSL 1 read. Editor must concat segments (or re-shoot).

**Mislabeled VSL segments (2026-09-21 names, now fixed on Drive):** old `SLO Ad 5 Take 1` / `SLO Ad 1 Take 1` / `SLO Ad 3 Take 1` / `SLO Funding Roadmap Call Take 1` were VSL 1 pieces — those filenames are gone; content now lives under **`SLO VSL 1 Open/Middle/FAQ/Close`**.

---

## Locked ads coverage

| Ad | On Drive? | Where (md5 / current name) |
|---|---|---|
| AD 1 | **Yes** | `05ce1961…` — `SLO Ad 1 Take 1.mp4` |
| AD 2 | **No** | — |
| AD 3 | **Yes** | `5095e396…` — misnamed **`SLO Ad 7 Call Pitch Take 2.mp4`** |
| AD 4 | **No** | — |
| AD 5 | **No** | — |
| AD 6 | **Partial** | `7656a671…` partial + `468b90ae…` hook-only; misnamed **Call Pitch Take 3 / 6** |
| AD 7 | **Yes** | `33771941…` — **`SLO Ad 7 Call Pitch Take 1.mp4`** |

---

## UUID / duplicate trash (md5 winners kept)

Trash **25 files** listed in `slo-ads-drive-organize-2026-09-23.json` → `plan.trash` (duplicate UUID exports and second copies of keepers). Do **not** trash md5 winners in `plan.keep`.

**Extra trash (content, not just md5):** micro-clips in table above (`f1920fd0`, `4f318b0c`, `451ee847`, `928f3d5f`, `bbe47449`, `54dc462a`); optional trash **`468b90ae`** if **`7656a671`** is the Ad 6 keeper.

---

## Organize script note

`scripts/slo-ads-drive-organize.mjs` **TO_CANONICAL** updated 2026-09-23 from this transcript pass (portal welcome rename, Ad 3/6/VSL2 mappings, stop forcing all UUIDs → `SLO VSL Take 1`). **Do not `--apply`** until Chris confirms rename list.

---

## Local artifacts (not committed)

- Video: `/tmp/slo-videos-by-md5/{md5}.mp4`
- Transcript: `/tmp/slo-transcripts-by-md5/{md5}.txt`
- Full JSON: `/tmp/slo-content-results.json`
