# SLO Ads Drive manifest — 2026-09-23

Folder: Fundhub + DirectRoas → Marketing Videos → **SLO Ads**  
Drive id: `13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ`

Organizer: `scripts/slo-ads-drive-organize.mjs`  
Naming law: **`SLO … / TAKE #`** (Chris's Drive labels). Not pipeline ids (`LOCKED-AD-*`, `VSL-01-*`, `043_t01_raw`).

Reference: `docs/workflows/slo-video-script-check-2026-09-21.md` (speech ↔ script; filenames stay SLO).

## Canonical MP4 names

| File | Notes |
|------|--------|
| `SLO Ad 1 Take 1.mp4` | Normalize from `SLO Ad 1.mp4` if needed |
| `SLO Ad 6 Take 1.mp4` … `Take 7.mp4` | Seven takes |
| `SLO Ad 7 Call Pitch Take 1.mp4`, `Take 2.mp4` | Call pitch |
| `SLO Ad Two Sides.mp4` | Two-sides / stacking angle |
| `SLO Checkout Abandon Take 2.mp4`, `Take 3.mp4` | Checkout abandon retarget |
| `SLO VSL 1 Open.mp4`, `Middle`, `FAQ`, `Close` | Sales VSL segments |
| `SLO VSL 2 Booking.mp4` | Booking VSL |
| `SLO VSL Take 1.mp4` | Full-length VSL 1 export (was UUID `8FEE9AD2-…`; ~344 MB, inferred from size vs `SLO VSL 2 Booking`) |

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
