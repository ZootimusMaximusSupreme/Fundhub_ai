# SLO live — video testimonials (2026-09-25)

**Page:** https://apply.fundhub.ai/roadmap/  
**Fragment:** `clickfunnels-fragments/slo/slo-01-sales.html`  
**Push:** `node scripts/cf-push-custom-html.mjs push --only=slo-297-sales` (page id `25426320`)

## Change

- Removed the **third** video-testimonial slot (`[ VIDEO TESTIMONIAL 3 ]`) only.
- Kept slots 1 and 2.
- Reformatted `.fh-b .proofgrid` from a 3-column row to a centered 2-column row so there is no empty hole where slot 3 was.
- Mobile still stacks one slot per row under 699px.

## Live prove

- View-source on https://apply.fundhub.ai/roadmap/ shows two slots and no slot 3.

2026-09-25 — proofgrid max-width 620→420px (2×9:16 slots ~204×363, centered); live `/roadmap` 1280px: both slots inside page, no side spill — **PASS** (shot: `slo-live-videos-2026-09-25-evidence/proofgrid-fit-1280.png`).

2026-09-25 — slots pinned 180×320 (grid max 372px, 9:16); live `/roadmap` 1280×800 + 1440×900: both fully inside, no side scroll — **PASS** (shot: `slo-live-videos-2026-09-25-evidence/proofgrid-fit-1280-v2.png`).

2026-09-25 — loaded real videos into the two slots (no 3rd): Slot 1 Colin `https://fundhub.ai/funnel/slo-testimonial-colin.mp4` (shipped **3840×2160**, 2:10.5, H.264 faststart); Slot 2 Sarah `https://fundhub.ai/funnel/slo-testimonial-sarah.mp4` (shipped **720×1280**, 0:31.8, H.264 faststart, from IMG_0237 — not IMG_0236). Widened slots to ~220×391 (grid max 460px) so labels no longer wrap a lone digit; placeholders removed. Live prove: both video URLs 200 `video/mp4`; roadmap HTML points slot 1→Colin, slot 2→Sarah; no `[ VIDEO TESTIMONIAL` wrap. — **PASS/FAIL pending prove**
