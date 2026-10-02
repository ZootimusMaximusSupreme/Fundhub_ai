# SLO Ads Drive manifest — 2026-09-23

Folder: Fundhub + DirectRoas → Marketing Videos → **SLO Ads**  
Drive id: `13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ`

Organizer: `scripts/slo-ads-drive-organize.mjs`  

**Naming law (owner-set 2026-09-24):** `Offer / Ad # / Angle / Take #`. The file is `SLO Ad 7 — Haynes, the call that was never a roadmap Take 1.mp4`. The angle is the script name. Book: `docs/ads/NAMING.md`. Not pipeline ids (`086_t01_raw_2026-09-24.mp4`). The older `SLO Ad N Take M.mp4` line left the angle off. That shorter name is wrong.

Reference: `docs/workflows/slo-video-script-check-2026-09-21.md` (speech ↔ script; filenames stay SLO).

## Canonical MP4 names (from email + script-check)

| File | Riverside / notes |
|------|-------------------|
| `SLO Ad 1 Take 1.mp4` | Ad 1 — Straight offer, full read |
| `SLO Ad 2 Take 1.mp4`, `Take 2.mp4` | Ad 2 — Straight offer, declined and no… |
| `SLO Ad 3 Take 1.mp4` | Ad 3 — Straight offer, what your file is… |
| `SLO Ad 5 Take 1.mp4` | Ad 5 — Straight offer, max fundability,… |
| `SLO Ad 6 Take 1.mp4`, `Take 2.mp4` | Ad 6 — Haynes, you already know… (2 takes in Riverside) |
| `SLO Ad 7 Take 1.mp4` | Two-sides / stacking angle (was `SLO Ad Two Sides.mp4`) |
| `SLO Ad 7 Call Pitch Take 1.mp4` … `Take 9.mp4` | Ad 7 — Haynes, the call that was never… (+ extra takes) |
| `SLO Retargeting Take 3.mp4` | Retarget Funding Success Blueprint |
| `SLO Funding Roadmap Take 2.mp4`, `Take 3.mp4` | Checkout-abandon retarget (was `SLO Checkout Abandon …`) |
| `SLO Funding Roadmap Call Take 1.mp4` | Funding Roadmap Call (3 takes in Riverside) |
| `Fundhub Portal Welcome Video.mp4` | Fundhub Portal Welcome Video |
| `SLO VSL 1 Open.mp4`, `Middle`, `FAQ`, `Close` | SLO Main Page VSL segments |
| `SLO VSL 2 Booking.mp4` | Booking VSL |
| `SLO VSL Take 1.mp4` | Full-length VSL 1 export (~344 MB) |

## Dedupe / trash

- All `DUPLICATE*` copies
- `SLO Ad 1 Take 2.mp4` (2.5 s junk per script check)
- md5 duplicates (keep best `nameScore`; prefer `^SLO ` names)

## Re-run

```bash
node --env-file=.env scripts/slo-ads-drive-organize.mjs          # dry-run
node --env-file=.env scripts/slo-ads-drive-organize.mjs --apply   # trash + rename
```

Machine log: `docs/workflows/slo-ads-drive-organize-2026-09-23.json`.
