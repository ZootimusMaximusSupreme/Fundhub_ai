# /watch and /roadmap video testimonials stack on a phone — live proof, 2026-09-22

The owner asked for one video testimonial per row on a phone. Both pages are
live and doing that. These shots are the live pages, no injected CSS.

## What the shots show

| file | page | screen | result |
|---|---|---|---|
| `watch-390x844-MARKED.png` | /watch | 390x844 Android | 1 per row, 342x608 |
| `watch-360x800-MARKED.png` | /watch | 360x800 Android | 1 per row, 312x554.7 |
| `watch-1280x900-MARKED.png` | /watch | 1280x900 desktop | 3 per row, 257.3x457.5 |
| `roadmap-390x844-MARKED.png` | /roadmap | 390x844 Android | 1 per row, 342x608 |
| `roadmap-360x800-MARKED.png` | /roadmap | 360x800 Android | 1 per row, 312x554.7 |
| `roadmap-1280x900-MARKED.png` | /roadmap | 1280x900 desktop | 3 per row, 293.3x521.5 |

Every card reads `aspect-ratio: 9 / 16`, fill `rgb(17,17,19)`, border
`rgb(38,38,43)`, 12px corners. No sideways scroll at any of the three widths on
either page. Desktop is untouched.

## Where the red boxes come from

`_proof.mjs` reads each card's real rectangle out of the browser and writes it
to `shot-marks.json`. `_apply-marks.py` draws the box there and refuses to draw
one that falls outside the picture, so a red box can never point at empty space.
A card only gets a box when the whole card is inside the frame.

## Rerun

```
node _proof.mjs          # live pages -> _raw/ + shot-marks.json
python3 _apply-marks.py . # burn the red boxes and the legend
```

`_proof.mjs` drives its own headless Chromium through the repo's playwright.
