# Video pipeline — API verification (owner research, 2026-09-22)

Chris pasted this research into the build thread on 2026-09-22. It is the ground truth for how the
automated video pipeline gets built. Anything an agent adds here must say where it came from.

## Verdict

The pipeline works end to end through APIs, with **two required changes** and **one open risk**.
The only unavoidable manual step is pasting a script into BigVU, because BigVU still has no public
API, webhook or Zapier trigger (re-checked 2026).

**Required change 1 — never hand a Google Drive link to Submagic (or to a transcriber).**
Drive's virus-scan page breaks programmatic downloads over 25 MB, and Submagic rejects Drive
folder/share links ("URL does not point to a downloadable media file"). Copy each Raw take to
Cloudflare R2 or S3 and pass a presigned URL (15+ minute life). The same URL feeds transcription.

**Required change 2 — "Composer 2.5" cannot be in the backend.** It is Cursor's coding-only model:
text only, Cursor only, no public API. Transcribe first, then have Claude (Anthropic API) match the
transcript to the script and produce the Submagic settings JSON.

**Open risk — B-roll timing after auto-cuts.** Submagic documents `startTime`/`endTime` "in seconds"
for `items[]` and for the transcript `words[]`, but never says whether item times are measured on the
original upload or on the shortened timeline when `removeSilencePace` / `removeBadTakes` cut the
video. (It does say Magic Clips times are "in the source video"; there is no equivalent note for
items.) Handle it one of two ways, never by guessing:
- **Safest:** create with `autoRender:false` → wait for the completed webhook → `GET /v1/projects/{id}`
  and read the real `words[]` timings → place B-roll with Update Project → call Export Project.
- **Simplest:** leave `removeSilencePace` and `removeBadTakes` off so the timeline never changes.
  For ~1-minute scripted teleprompter takes, auto-cutting is not needed.

## Step by step

| Step | Tool / API | Verdict | Endpoint or feature | Limits and gotchas |
|---|---|---|---|---|
| 1. Script into Drive, paste into BigVU | Google Drive API; BigVU manual | works, with a catch | `files.create` with `parents` = folder id | BigVU has no API, webhook or Zapier — the paste stays manual |
| 2. Film, share the take into Raw | BigVU mobile Share → Other Apps → Drive | works, with catches | Share button: Download File / Share on Other Apps | Rendered MP4; on a paid plan no watermark and captions are NOT burned in, so no double captions; about 1080p in practice (BigVU staff: Full HD max; adding subtitles downscales); generic file names; no bulk download on mobile |
| 3. Detect new takes | Google Drive API | works | `files.list` with `'FOLDER_ID' in parents and createdTime > '<RFC3339>' and trashed = false`; or `changes.watch` / `files.watch` | Push channels expire in ≤7 days with no auto-renew; filter on non-zero size + video mimeType so a half-uploaded file is skipped; polling every 2–5 minutes is the simple, reliable trigger |
| 4a. Transcribe, word level | Deepgram (recommended) | works | pre-recorded, accepts a remote URL, up to 2 GB, native word `start`/`end` | OpenAI gpt-4o-transcribe caps at 25 MB and 1,500 seconds and truncates long output, so it needs an ffmpeg audio extract; Deepgram takes the presigned URL directly |
| 4b. Submagic's own transcript | Submagic Get Project | works | `GET /v1/projects/{id}` → `words[]` with per-word times | Only exists after the project is created, so it cannot do the match-and-rename step; use it for exact B-roll placement |
| 4c. Rename the Drive file | Google Drive API | works | `files.update` with a new name | — |
| 4d. Match take to script | Claude (Anthropic API) | works | transcript text + candidate scripts → pick the match | Cursor Composer 2.5 cannot be used at all |
| 5. Decide settings and B-roll | Claude (Anthropic API) | works | text in, Submagic JSON out | — |
| 6. One Submagic call does the edit | Submagic Create Project | works, 2 doc gaps | `POST /v1/projects` | see the field list below |
| 6b. Render / export | Submagic | works | `autoRender:true` renders automatically; otherwise `PUT /v1/projects/{id}` then Export Project | Export limited to 50/hour; an update always needs a re-export |
| 7a. Finished file into Drive | Google Drive API | works | `files.create?uploadType=resumable`, `parents` = Finished folder | Download the webhook's `downloadUrl` immediately — its life is undocumented |
| 7b. Notify the phone | ntfy or Pushover | works | one HTTP POST | Avoid SMS: US A2P 10DLC registration takes 2–6 weeks and unregistered traffic is blocked |

## Submagic Create Project, what the docs confirm

- **Required:** `title`, `language`, `videoUrl`.
- **Optional:** `templateName` (default "Sara") or `userThemeId` (not both), `presetId` (cannot be
  combined with most styling fields), `aiEditTemplate` (kelly / karl / ella — when set, only
  title, language, videoUrl, webhookUrl and dictionary are allowed), `dictionary` (max 100 terms,
  50 characters each), `magicZooms`, `magicBrolls`, `magicBrollsPercentage` (0–100, default 50),
  `removeSilencePace` (natural / fast / extra-fast), `removeBadTakes`, `cleanAudio`,
  `disableCaptions`, `autoRender` (default true), `hookTitle`, `music`, `captionPositionX/Y`,
  `webhookUrl`, `items[]`.
- **`items[]`:** `ai-broll` needs type, startTime, endTime (greater than startTime and no more than
  12 seconds after it) and a prompt of 1–2500 characters, plus an optional layout. `user-media`
  needs type, startTime, endTime, `userMediaId`, optional layout. Items may not overlap in time.
  Layouts: cover, contain, rounded, square, split-50-50, split-35-65, split-50-50-bordered,
  split-35-65-bordered, pip-top-right, pip-bottom-right (images: cover / contain / rounded / square
  only). No documented cap on item count beyond non-overlap and the 12-second clip limit.
- **Webhook payload:** `{ projectId, status, downloadUrl, directUrl, timestamp }` — `downloadUrl` is
  a direct .mp4, `directUrl` is a CloudFront playback URL. Expiry is undocumented.
- **Cost and limits:** each AI B-roll item costs **3 AI credits**, and the Business + API plan
  includes only **15 AI credits a month** — heavy AI B-roll runs out fast, so prefer `user-media`
  clips we own. API access needs Business + API ($69/month monthly, $41/month annual) with 100 API
  minutes a month and a 30-minute max per project; extra minutes meter at about $0.10–$0.15.
  Rate limits: create 500/hr, get 100/hr, update 100/hr, export 50/hr, languages 100/min.
  Max file 2 GB, max duration 2 hours, MP4/MOV. Business supports 4K/60fps export.

## Quality claims, checked

- **Captions are near-perfect on clean audio.** An independent 30-day test averaged 0–2 corrections
  per 60-second clip on clean audio, 4–8 on noisy audio; Submagic markets 98.9%. A custom dictionary
  (brand terms such as Fundhub) improves it further.
- **Automatic B-roll is sometimes off topic.** Multiple reviewers report generic or mismatched
  footage that needs manual replacement. So our LLM specifies explicit B-roll prompts and placements
  through `items[]` instead of leaning on `magicBrolls`.

## What could not be confirmed

1. Whether `items[]` timestamps use the original or the post-cut timeline.
2. How long the webhook `downloadUrl` stays valid.
3. The exact HTTP path of Export Project (a POST "Export Project" endpoint is documented; the
   `/v1/projects/{id}/export` form is inferred).
4. BigVU export resolution in practice (reported as 1080p; 4K downscales when captions are added) —
   this collides with the owner law in `.claude/rules/video-4k-unless-ad.md`: anything that is not an
   ad must be 4K. Check the cap on the real device before filming a VSL, and if BigVU cannot hold 4K
   through export, film VSLs somewhere that can.

## Open items for the build

- Chris also named **Teleprompter.com** (its MCP connector is on his claude.ai account) as the
  teleprompter. This report is written against BigVU. Which app records the takes decides whether
  the script push is automatic (Teleprompter.com MCP) or manual (BigVU).
- Pricing moves; re-check Submagic and the recorder's plans before committing.
