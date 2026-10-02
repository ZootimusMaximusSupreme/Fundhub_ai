# SLO live — video testimonials (2026-09-25)

**Page:** https://apply.fundhub.ai/roadmap/  
**Fragment:** `clickfunnels-fragments/slo/slo-01-sales.html`  
**Push:** `node scripts/cf-push-custom-html.mjs push --only=slo-297-sales` (page id `25426320`)

## Change

- Two slots only (no third).
- Slot 1 = Colin, Slot 2 = Sarah — real `<video>` players, not placeholder text.
- Grid widened to ~220×391 each (max-width 460px) so labels never wrap a lone digit; pair still fits a 1280px page with no side scroll.

## Hosted files

| Slot | Person | Live URL | Shipped resolution |
|------|--------|----------|--------------------|
| 1 | Colin | https://fundhub.ai/funnel/slo-testimonial-colin.mp4 | **3840×2160**, 2:10.5, H.264 +faststart |
| 2 | Sarah | https://fundhub.ai/funnel/slo-testimonial-sarah.mp4 | **720×1280**, 0:31.8, H.264 +faststart (IMG_0237, not IMG_0236) |

## Live prove

2026-09-25 — proofgrid max-width 620→420px; live `/roadmap` 1280px: both slots inside page — **PASS** (shot: `slo-live-videos-2026-09-25-evidence/proofgrid-fit-1280.png`).

2026-09-25 — slots pinned 180×320 (grid max 372px); live 1280 + 1440: both inside — **PASS** (shot: `slo-live-videos-2026-09-25-evidence/proofgrid-fit-1280-v2.png`).

2026-09-25 — loaded Colin + Sarah videos; widened to 220×391 (grid 460px); placeholders gone. Live: both URLs **200** `video/mp4`; slot 1→Colin, slot 2→Sarah; no `[ VIDEO TESTIMONIAL` wrap; no side scroll at 1280 (grid 460, slots 220×391). Shot: `slo-live-videos-2026-09-25-evidence/proofgrid-videos-1280.png`. — **PASS**
