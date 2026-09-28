# Ad watch curve

**Owner law (2026-09-27):** Video ad drop-off uses Meta's own definitions. Not a blog opinion. Book: `docs/ads/watch-curve.md`.

## What the numbers mean (Meta)

- A **play** means the video started. Replays do not count.
- **25% / 50% / 75% / 100%** means they reached that fraction of the length (including people who skipped to that point).
- **ThruPlay** means they watched 15 seconds, or they finished a video shorter than that.
- There is **no 3-second field**. Do not invent one. Closest opening signal we store is 2-second continuous plays.
- The second-by-second curve is Meta field `video_play_curve_actions`, stored as `ad_metrics_daily.video_play_curve`.

## What to fix when it dies

- If **most plays never reach 25%**, the opening is the problem: new first line, same body. Do **not** recut the ending first.
- If they **pass halfway** and still do not tap, the offer or the last line is the problem.
- If they **watch** and do not tap, the ask is the problem.

## Notify Chris

When a running ad matches "dies before 25%", buzz him on the same phone/ntfy path the ad-video pipeline already uses (`src/ad-videos/notify-fanout.mjs`). One or two sentences: which ad, and that people are leaving before the quarter mark, so the opening has to change. Do not pause the campaign or change budgets from this rule.

## Never

- Invent a 3-second Meta field
- Recut the ending first when people leave before 25%
- Build a new notify vendor for this buzz
