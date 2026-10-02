# SLO live VSLs on the funnel — 2026-09-25

Job: put the two edited VSLs on the live $297 funnel pages. Sales page and booking page only.
Portal welcome video is a different run.

## What was broken

Both live pages already asked for the right file names. The files were not there.

| Live URL | `<video src>` in the live page | Before |
|---|---|---|
| https://apply.fundhub.ai/roadmap/ | `https://fundhub.ai/funnel/slo-vsl.mp4` | **404** |
| https://apply.fundhub.ai/roadmap-book | `https://fundhub.ai/funnel/slo-vsl2-funding.mp4` | **404** |

So no page HTML had to change and no ClickFunnels push was needed. The fix is the files.

## Sources (Google Drive, edited 2026-09-25)

| Page | Drive file | Drive id | Size | md5 |
|---|---|---|---|---|
| Sales / roadmap | `SLO Main Page VSL.mp4` | `1iPr3He8-GwkLaTA5RxPDaa2HgKkjNCDU` | 479,886,758 B | `fd0244bf16f5ee2eae19d93142c702f7` |
| Booking | `VSL 2 — Booking page.mp4` | `1d6fnyDWPwI7dZFWaCNRvppbyyQPogiJW` | 290,031,184 B | `3f0eb49c1840f45723605f03a2fd3fcf` |

## Resolution — both sources are 1080p, not 4K

Measured with ffmpeg before any encode:

```
SLO Main Page VSL.mp4   1920x1080  30 fps  2:25.80  26,064 kb/s
VSL 2 — Booking page.mp4 1920x1080 30 fps  1:27.54  26,237 kb/s
```

`video-4k-unless-ad.mdc` says a non-ad video that comes back at 1080p is a defect.
It is reported here, not hidden. Nothing was upscaled — the shipped files are the
same 1920x1080 the edit came back as. Re-filming in 4K is the fix for that defect
and it is a separate job.

## What was shipped

Re-encoded for web delivery only. Resolution, frame rate and length unchanged.
H.264 CRF 26, cap 3 Mbps, AAC 128 kbps, `+faststart` so the browser can start
playing before the whole file lands.

| File | Resolution | Duration | Bitrate | Size |
|---|---|---|---|---|
| `public/funnel/slo-vsl.mp4` | 1920x1080 | 2:25.82 | 3,149 kb/s | 57.4 MB |
| `public/funnel/slo-vsl2-funding.mp4` | 1920x1080 | 1:27.55 | 3,160 kb/s | 34.6 MB |
| `public/funnel/slo-vsl-poster.jpg` | 1920x1080 | — | — | 240 KB |

The poster is the sales page's own `poster=` attribute, which was also 404 — the
first frame of the same video, so the box is not black before playback starts.

## Result

**PASS — live 2026-09-25 (ship `e3b5e997`, log commit `7669c698`).**

Proved with HTTP HEAD (agent, no Chris click):

| URL | Status | Content-Type | Size |
|---|---|---|---|
| https://fundhub.ai/funnel/slo-vsl.mp4 | **200** | `video/mp4` | 57,398,098 B |
| https://fundhub.ai/funnel/slo-vsl2-funding.mp4 | **200** | `video/mp4` | 34,585,975 B |
| https://fundhub.ai/funnel/slo-vsl-poster.jpg | **200** | `image/jpeg` | 240,305 B |

Both mp4s start with `ftypisom` and accept byte ranges (206). Local ffmpeg: sales **1920×1080** 2:25.82; booking **1920×1080** 1:27.55. **4K defect:** these are VSLs at 1080p — shipped as-is, not upscaled. Re-film in 4K is a separate job.

Nothing pushed. Page HTML untouched. One `npm run ship` only.

## Leftover — not fixed here

`https://fundhub.ai/funnel/slo-vsl3-repair.mp4` is still 404. The booking page swaps to it
only when the visitor is on the credit-repair track (`track=repair`). No edited repair VSL
was named for this run.
