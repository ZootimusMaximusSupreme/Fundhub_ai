# Testimonial thumbnails + captions (2026-09-27)

**Ask:** Every testimonial video gets a thumbnail with words on it so people know why to press
play, plus a one-line caption under the video. Three videos. All three go live on the roadmap
page. Colin's must be formatted tall (vertical).

**Owner call 2026-09-27:** use the **new** Colin file (the 1080p one from today), not the older
4K cut. Logged and closed — do not re-raise.

**Prompt of record:** `docs/prompts/testimonial-thumbnails.md`

---

## Task list

| Task | Owner | Status | What it owns |
|---|---|---|---|
| W1 — Words | this session | **done (hooks awaiting Chris)** | Transcripts, hook per video, captions, `content/testimonials/testimonials.json` |
| W2 — Video prep | unclaimed | pending | Colin sideways → tall, encode all 3 web-ready into `public/funnel/` |
| W3 — Thumbnail template | unclaimed | pending | Brand-matched HTML template + Playwright renderer → PNG |
| W4 — Live page | unclaimed | blocked | 3 slots in the fragment, posters + captions, push, prove live |

**Waiting on what:** W1, W2, W3 all start now. W3 needs W1's final headline words before it
renders for real. W4 needs W2's videos and W3's thumbnails.

---

## Shared context brief (read this, do not rediscover it)

### The three source videos — measured 2026-09-27 with ffmpeg

| Person | File in `~/Downloads` | Shape | Length |
|---|---|---|---|
| Colin | `Colin Testimonial .mp4` | **1920×1080 sideways**, 30fps | 2:09.00 |
| Gene | `Gene Testimonial.mp4` | 720×1280 tall, 30fps | 2:00.34 |
| Sarah | `Sarah Testimonial.mp4` | 720×1280 tall, 30fps | 0:35.82 |

Colin is the only sideways one. Every slot on the page is tall 9:16, so Colin has to be
reframed, not letterboxed.

### Where the page lives

- **Live URL:** https://apply.fundhub.ai/roadmap/
- **Fragment:** `clickfunnels-fragments/slo/slo-01-sales.html`
- **Testimonial block:** search `SLOT-TESTIMONIALS` (around line 2314). Two slots today —
  Colin and Sarah. Gene is not on the page yet.
- **Push:** `node scripts/cf-push-custom-html.mjs push --only=slo-297-sales` (page id `25426320`)
- **Videos are served from** `public/funnel/` in this repo → `https://fundhub.ai/funnel/<name>`
  (Netlify). Existing files there: `slo-testimonial-colin.mp4`, `slo-testimonial-sarah.mp4`,
  and their `-poster.jpg` files, all dated 2026-09-25.

### Brand tokens — read out of the fragment, line 56-60. Do not invent colors.

```
--ink      #0A0A0A     near-black, headline text
--ink2     #18181B
--gray     #52525B
--gray2    #8A8A93
--line     #E4E4E7
--sans     'Inter', system-ui, -apple-system, sans-serif
--mono     'JetBrains Mono', ui-monospace, SFMono-Regular, monospace
--spectrum linear-gradient(90deg,#F2A69B 0%,#F5CE8F 20%,#F2E39B 40%,#A8D8B0 60%,#A9C6E8 80%,#C4B3E5 100%)
button     #188bf6  (hover #0b78dd)
pulse dot  #A8D8B0
```

The page's accent is the pastel `--spectrum` gradient, not one flat color. Headline text on the
page is near-black on near-white. A thumbnail sits on a photo, so the text there is white with a
soft dark scrim; accent words take a colour pulled from `--spectrum`, not a new invented one.

The lowercase `fundhub.` wordmark is used as a faint ghost mark in the page footer
(`.ghost-mark .logo`, aspect ratio 2698/543).

### Tooling on this Mac — measured

- ffmpeg: `~/.local/bin/ffmpeg`. **There is no ffprobe.** Use `ffmpeg -i <file>` to read a file.
- Playwright: in `node_modules/.bin/playwright`.
- Whisper: not preinstalled. System python is 3.9.6 (Apple CommandLineTools) and its pip has no
  `--break-system-packages`. W1 installed it into a scratch venv instead.

### Copy rules — non-negotiable, from the prompt of record

Never "credit repair" (it is "credit optimization" / "optimized credit"). No "it's not X, it's Y".
No slogans, no metaphors, no two-sentence setup-then-punchline. Cause before effect. Never
"your number" or "the number". Never EIN, DUNS, or net-30 vendors. Never "no guarantees".
Company is **Fundhub** — never FundHub. Headlines may tighten a client's words but must never add
a number, result, or claim the client did not say.

---

## Change manifests

Fill this in when your task is done, before you report complete.

### W1 — Words

**Chris supplied the scripts on 2026-09-27.** Nothing was machine transcribed. An earlier attempt
to run Whisper was stopped by Chris — the prompt said to ask whether he had scripts first, and that
question was skipped. Do not re-run transcription; the scripts are the source of record.

Files written:

- `content/testimonials/transcripts/colin.txt`
- `content/testimonials/transcripts/gene.txt`
- `content/testimonials/transcripts/sarah.txt`
- `content/testimonials/testimonials.json` — 3 records, ids `colin`, `gene`, `sarah`
- `docs/prompts/testimonial-thumbnails.md` — prompt of record

Hooks picked (every one is a tightening of a line the client actually says — nothing added):

| id | Headline | Accent | From the client's own line | At |
|---|---|---|---|---|
| colin | Never seen this in 12 years | `12 years` | "I've never seen anything in the last 12 years of being in the industry…" | 0:24 |
| gene | About $420,000 over three years | `$420,000` | "…about $420,000 over the last three years." | 1:02 |
| sarah | Set to be approved for around $80,000 | `$80,000` | "…I haven't gotten it just yet, I'm set to be approved for around $80,000." | 0:28 |

`sort_order` is Colin 0, Gene 1, Sarah 2 — strongest proof first. Colin ran a funding company and
says he does not endorse people, which is the hardest thing to fake. Sarah is last because her
funding has not landed yet and she is on the team.

All three are `status: "draft"`. The prompt says only `approved` records go on the page. **They
stay draft until Chris signs off on the hooks.**

Timestamps came from the videos' own burned-in captions sampled every 2 seconds, so they are
accurate to about ±2s. They are a pointer to the line, not a cut point.

**W3 and W4 read `content/testimonials/testimonials.json`. Do not retype these words.**

### W2 — Video prep
_not started_

### W3 — Thumbnail template
_not started_

### W4 — Live page
_not started_

---

## Blockers and open questions

### FINDING — all three videos already have captions burned into the picture

Measured 2026-09-27 from frames sampled every 2 seconds across all three files. Every one carries
word-by-word coloured captions (the Submagic style) burned into the video itself, roughly:

| id | Where the burned-in caption sits |
|---|---|
| colin | low centre, about 88% down the 16:9 frame |
| sarah | centre, about 55–62% down the 9:16 frame |
| gene | low centre, about 88% down the 9:16 frame |

**Why this matters for W3:** a thumbnail is one frame of the video, so the client's own burned-in
caption will be sitting in the picture next to the new headline. Two sets of words on one image
reads as broken. W3 must handle it, not ignore it. Three ways, cheapest first:

1. Pick a frame from a gap between phrases where no caption is on screen. Gaps exist — Colin's last
   frame at about 2:08 is clean. This needs a denser frame scan than the 2-second one already done.
2. Put the headline's dark scrim directly over the burned-in caption band so the old words are
   covered and the new ones sit on top.
3. Gene has open blue sky across the whole top third of frame. His headline goes up there and never
   touches the caption band. Colin and Sarah have no equivalent clean zone.

Chris has not been asked to choose. W3 picks whichever works per video and shows him the result.

### OPEN — Gene has no slot on the live page yet

The fragment has two slots (Colin, Sarah). Gene is a third. W4 widens `SLOT-TESTIMONIALS` to three
and has to re-check the phone stack and the 1280px desktop fit, because the 2026-09-25 board shows
the pair was already tuned to just fit.

## Notes worth keeping

- The 4K law (`.claude/rules/video-4k-unless-ad.md`) says a non-ad video at 1080p is a defect.
  All three of today's files are under 4K (1920×1080 and 720×1280). Chris chose the new 1080p
  Colin on 2026-09-27 with that stated. Recorded, not reopened. Nothing gets upscaled.
