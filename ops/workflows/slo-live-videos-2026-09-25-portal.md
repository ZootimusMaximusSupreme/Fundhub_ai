# SLO live videos — portal welcome, 2026-09-25

**Lane:** portal welcome only. Not roadmap. Not funnel VSLs. Not testimonials. Not `SLO_DEMO_PAY`.

## Verdict

**PASS** — live static file is up; welcome-video content row + all eight tier map rows point at it; signed playback redirects to the new file (82MB), not the August 2.6MB placeholder.

## 1080 note (defect)

Source Drive file: `Fundhub Portal Welcome Video.mp4` (id `1D0UAokYexCW6zaQfgJoIV8o0hmbsuGE_`).

Shipped cut is **1920×1080** (re-encode, faststart, ~82MB). Owner law: non-ad videos must be **4K**. This is a defect. Do **not** upscale. Ship the real file; re-film / re-export in 4K later.

Measured on disk: `kMDItemPixelWidth=1920`, `kMDItemPixelHeight=1080`, duration ≈ 141.6s (`2:21`).

## Live URL

https://fundhub.ai/assets/video/portal-welcome.mp4

| Check | Result |
|---|---|
| HEAD | **200** |
| `Content-Type` | `video/mp4` |
| `Content-Length` | `82433551` |

Hosted from commit `e3b5e997` (`public/assets/video/portal-welcome.mp4` + `_headers`). Went live on an already-running Netlify prod deploy (funnel/checkout lane). **No second `npm run ship` started.**

## Database (no deletes, `DATABASE_URL` unchanged)

Org: `fb789b0b-8d8d-4cdc-8a24-ee6b6659e0b6`

| | Before | After |
|---|---|---|
| Video id | `bc191d8f-b011-4721-9d6d-320727761d60` | same row (updated, not deleted) |
| `storage_key` | `netlify-blob://…` August placeholder | `https://fundhub.ai/assets/video/portal-welcome.mp4` |
| `byte_size` | `2687193` | `82433551` |
| `duration_label` | `1:19` | `2:21` |

All **8** `content_tier_map` rows already pointed at that video id (`default`, `diagnostic`, `card-stacking-dfy`, `consulting-package`, `repair-bundle`, `repair-trial`, `inquiry-removal`, `funding-mastery`). They still do. Older library rows left in place.

## Prove — agent only

1. Static asset HEAD → 200 / `video/mp4` / 82433551.
2. `resolveWelcomeVideo` for org default → video id `bc191d8f-…`, `byte_size` 82433551, `storage_key` = live URL.
3. Signed `GET https://fundhub.ai/api/content/welcome-video?id=…&exp=…&sig=…` → **302** `Location` base `https://fundhub.ai/assets/video/portal-welcome.mp4` (Netlify may append the request query string; asset still 200 / 82MB with that query).
4. Followed asset is **not** the 2.6MB August blob.

Portal HTML unchanged. Hero still calls `/api/content/welcome-video`; playback branch redirects when `storage_key` is https.

## Left alone

- Roadmap page / ClickFunnels HTML
- Testimonial slots
- `SLO_DEMO_PAY`
- Other agents’ uncommitted notes (`slo-live-videos-2026-09-25-roadmap.md`, `slo-01-sales.html`, tmp scripts)
- No `git push`
