# Prompt of record — testimonial thumbnails + captions

Saved 2026-09-27. This is the ask, in Chris's words, kept so any later session can read the
original instead of a summary of it.

Board for the run: `docs/workflows/testimonial-thumbnails-2026-09-27.md`

---

## What Chris added on top of the prompt

- The 3 testimonials are in `~/Downloads`.
- They must be loaded onto the live roadmap website.
- Colin's testimonial must be formatted for vertical.
- Asked which Colin file to use (new 1080p vs older 4K) — **owner call: the new one.**

---

## The prompt

I want to rebuild the testimonial section on my landing page. Right now each video only shows the
client's face, so nobody knows why they should press play. For every testimonial video, I want a
thumbnail with a text overlay that makes someone want to click, and a short caption under the video.

Follow the "work backwards" rule in CLAUDE.md. Before building anything, ask me workflow questions
one at a time until you are 95% confident. At minimum, find out:

1. Where the testimonial videos live (repo folder, Google Drive, Vimeo/YouTube links, or a hosting service).
2. Whether I have scripts or transcripts for each video, or whether you need to transcribe them.
3. Which file and component renders the current testimonial section.

### Step 1: Data file first (the back end)

Create `content/testimonials/testimonials.json`. One record per video:

```json
{
  "id": "mike-r-hvac",
  "client_name": "Mike R.",
  "business_type": "HVAC owner",
  "video_src": "",
  "transcript_path": "content/testimonials/transcripts/mike-r-hvac.txt",
  "hook_source_quote": "",
  "hook_source_timestamp": "",
  "thumbnail_headline": "",
  "thumbnail_accent_words": "",
  "caption": "",
  "best_frame_timestamp": "",
  "thumbnail_path": "",
  "sort_order": 0,
  "status": "draft"
}
```

### Step 2: Pair each video with its words

- If I give you scripts, match each script to its video by name or by comparing against a transcript.
- If there is no script, transcribe the audio (use local Whisper via
  `pip install openai-whisper --break-system-packages`, extracting audio with ffmpeg first).
- Save each transcript to `content/testimonials/transcripts/<id>.txt`.
- Show me a table of video → transcript → the hook you picked before moving on, so I can confirm
  every pairing is correct.

### Step 3: Pick the hook for each video

There is no fixed format for the headline. Read the whole transcript and pick whatever the client
says that is most likely to make a visitor click. It could be a dollar amount, a timeframe, a
before-and-after, a problem they got past, a strong emotional line, or something surprising they
said. Every video is different, so decide per video.

Rules:

- The hook has to come from what the client actually says. Save the exact line to
  `hook_source_quote` and its timestamp to `hook_source_timestamp`.
- You can tighten their words into 3–7 words for the thumbnail, but never add a number, result, or
  claim they didn't say.
- Put the words that should stand out (a number, a key phrase) in `thumbnail_accent_words` so they
  get the accent color.
- Across the full set, vary the hooks so every thumbnail doesn't read the same way.

### Step 4: Write the caption

One line in this format: `Name, business type. One sentence about what happened, in their own terms.`
Example: "Mike R., HVAC owner. Got denied at his bank, then came to Fundhub and closed $120K in
business credit."

Copy rules for the headline and caption (non-negotiable, also in my never-say list):

- Never write "credit repair". The term is "credit optimization" / "optimized credit".
- No "it's not X, it's Y" lines, no slogans, no cute metaphors, no two-sentence setups where the
  second sentence lands the point.
- State cause before effect.
- Never write "your number" or "the number".
- Never mention EIN, DUNS, or net-30 vendors.
- Never write "no guarantees".
- Keep it plain and specific, the way the client would say it.

### Step 5: Pick the thumbnail frame

- Use ffmpeg to pull a frame every 2 seconds from each video.
- Look at the frames yourself and pick one where the face is sharp, eyes are open, the expression
  matches the hook, and there is open space on one side for the text.
- Save the timestamp to `best_frame_timestamp` and the raw frame to
  `content/testimonials/frames/<id>.jpg`.

### Step 6: Render the thumbnails on brand

- Before designing anything, find the Fundhub brand in the repo: colors, fonts, the lowercase
  "fundhub." wordmark, and any existing design tokens or Tailwind config. Match the look of the
  current landing page. If you can't find something, ask me.
- The client's face fills the full frame. The headline sits as an overlay on top of the video frame,
  on whichever side has open space, with a subtle dark scrim behind the text only as much as needed
  for it to read. No solid color panel splitting the thumbnail.
- Headline in the brand font, bold, large enough to read on a phone. Accent words in the brand
  accent color.
- Small "fundhub." wordmark in a corner and a clean play button.
- Build it as an HTML/CSS template at 1280×720 and render to PNG with Playwright, so I can edit the
  template later.
- Save to `public/testimonials/thumbnails/<id>.png` and fill in `thumbnail_path`.
- Render one thumbnail first and show it to me before you do the rest.

### Step 7: Wire up the landing page

- Update the testimonial component to read from `testimonials.json`.
- Each card shows the thumbnail as the video poster, the video plays on click, and the caption sits
  directly under the video.
- Sort by `sort_order`, strongest testimonial first.
- Only show records with `status: "approved"`.

### Step 8: Double check before you hand it over

- Open every thumbnail PNG and confirm the headline matches `hook_source_quote` and says nothing the
  client didn't say.
- Confirm every caption follows the copy rules above.
- Confirm the thumbnails match the brand and the current landing page.
- Give me a list of any videos where you weren't confident in the hook.

Save this prompt to `docs/prompts/testimonial-thumbnails.md` and commit everything we produce in
this session to the repo.

---

## Where reality differed from the prompt, and why

- **Thumbnails render 720×1280, not 1280×720.** Every testimonial slot on the live roadmap page is
  tall 9:16 (`.proofgrid .vslot` in `clickfunnels-fragments/slo/slo-01-sales.html`). A 16:9
  thumbnail would be letterboxed inside a 9:16 player and the headline would shrink to nothing on a
  phone. Same template, portrait canvas.
- **`pip install openai-whisper --break-system-packages` does not run on this Mac.** System python
  is 3.9.6 from Apple CommandLineTools and its pip is 21.2.4, which has no
  `--break-system-packages` flag. Installed into a scratch venv instead. Same local Whisper, same
  result, nothing added to the repo.
- **The page is a ClickFunnels custom-HTML fragment, not a component.** There is no React
  testimonial component to point at `testimonials.json`. `slo-01-sales.html` is pushed to
  ClickFunnels as one HTML page. So `testimonials.json` is the source of record and the fragment's
  slot markup is generated from it, rather than the page reading the JSON at runtime.
