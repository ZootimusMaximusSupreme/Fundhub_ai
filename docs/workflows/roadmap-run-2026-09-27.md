# Roadmap run mode — 2026-09-27

Chris is running the $297 ads. Four jobs. Do not touch testimonials.

Shared rules for every job:

- Company name is **Fundhub**. Never FunHub.
- Do not edit HTML, CSS, or the look of a page. Grok does not design screens.
- Do not `npm run ship`. Do not commit files you did not change. The tree has other people's unfinished work. Commit only your own files.
- Do not text or email a real customer while building. Skip `actor=agent`, `@fundhub.ai`, and test emails.
- Write your result at the bottom of this file when done.

| Job | Owns | Status |
|---|---|---|
| Time on the roadmap page | `public/funnel/fh-attribution.js`, `api/public/slo-interest.mjs` | done |
| The genuine text and email | messaging only. Do not edit `fh-attribution.js` | done |
| Ad watch curve, rule, and a ping | Meta data, a rule, a text to Chris. No dashboard HTML | done |
| RB2B pixel | `public/funnel/rb2b.js` + public marketing pages | done |

## RB2B

- Loader: `public/funnel/rb2b.js` — Chris’s real snippet, id baked in.
- Public account id: `Z6PVLHZEJL6R` (not a secret). Also `RB2B_ID` in local `.env` and Netlify (production / deploy-preview / branch-deploy).
- Script URL: `https://ddwl4m2hdecbv.cloudfront.net/b/Z6PVLHZEJL6R/Z6PVLHZEJL6R.js.gz`
- Domain in RB2B: `fundhub.ai` (covers `apply.fundhub.ai` and other subdomains — do not change).
- Pixel **on** for public pages: apply funnel steps that load `fh-attribution.js` (which appends `/funnel/rb2b.js`), plus fundhub.ai marketing HTML that loads `/funnel/rb2b.js` directly. Not on staff `/app`, CRM, or employee portal.

## Time on page

**Event:** `slo.engagement` via `POST /api/public/slo-interest` with `kind: "engage"`.

**Stored (one `events` row per browser session, key `slo-engage:<session_id>`):**
- `seconds_on_page` — visible-tab seconds (hidden time does not count). Monotonic on update (max wins).
- `reached_form` — true once `#fhw` entered the viewport. Stays true once set.
- `actor` / `actor_reason` — same `classifyVisitor` rules as visit (webdriver / bot UA → agent).
- `session_id`, `landing_path`, `attribution` (UTMs).

**Client:** only when `#fhw` exists. Heartbeat every 30s while the tab is visible; also on hide / `pagehide`. Does not create a client, charge a card, or send email (`skipInngest`).

**Why not a new row every 30s:** the events table is append-only for inserts, but engage **updates the same row’s payload** after the first insert. One session → one row.

**How to read:**
- Reached the form: `payload.reached_form = true`.
- Left in a few seconds: `payload.seconds_on_page` is small (e.g. under ~10) and usually `reached_form = false`.
- Sat and scrolled to checkout: high `seconds_on_page` and `reached_form = true`.

**Files:** `public/funnel/fh-attribution.js` (+ synced `06-utm-hidden-fields.html`), `api/public/slo-interest.mjs`, `src/http/slo-interest.test.mjs`. Also loads `/funnel/rb2b.js` (404 ignored). Not shipped — needs deploy for live `/roadmap`.

## Genuine text

**Finished both message 1 and message 2.** Inbound SMS/email already exists (`message.inbound` via Twilio + Mailgun → `src/handlers/comms.mjs`). Message 2 listens on that same event.

### When they fire

| Message | When |
|---|---|
| SMS 1 + Email 1 | ~15 minutes after `slo.contact_started`, if still unpaid, actor=person, real phone, not a test/agent email |
| SMS 2 + Email 2 | Only after they reply (inbound SMS or email). Not before. Skips STOP/opt-out keywords |

No backfill — only contacts that hit Inngest after `skipInngest` is off for `kind: "contact"`. Outbound uses `sendTemplated` → queued `messages` → existing Twilio/mail providers. No second sender. Prove path: unit tests with fake emit / `actor=agent` skip (no live customer text).

### Exact copy shipped

**SMS 1**
> Hey, it's Chris at Fundhub. Not trying to sell you anything. I want to know what we could do to make the page better, and the offer better. I've been in this for 10 years and I've seen a lot of people get burned. What are your concerns?

**Email 1** — subject: `What almost stopped you?`
> Hey — it's Chris at Fundhub.
>
> Not trying to sell you anything. I want to know what we could do to make the page better, and the offer better. I've been in this for 10 years and I've seen a lot of people get burned.
>
> What are your concerns?
>
> Just hit reply.
>
> Chris

**SMS 2 / Email 2** (email subject: `One more question`)
> If we fixed that, would you want to be a Fundhub customer?

### Files

- `src/workflows/slo-genuine-followup.mjs` (+ test)
- `db/seed/027_slo_genuine_followup.sql` (templates)
- `api/public/slo-interest.mjs` — contacts no longer `skipInngest`
- Registered in `src/workflows/index.mjs`; emitter listed in `api/read/workflows.mjs`
- Not shipped — needs deploy + seed apply for live sends

## Watch curve

**Done (not shipped).** Meta definitions quoted in `docs/ads/watch-curve.md`. Rule in both homes: `.cursor/rules/ad-watch-curve.mdc` + `.claude/rules/ad-watch-curve.md` + short line in `CLAUDE.md`.

### Meta quotes used

- **Play** (`video_play_actions` / Help Center): starts to play; excludes replays.
- **25%** (Help `279891745529019`): played at 25% of length, including skips to that point.
- **ThruPlay** (Help `471190536725647`): completion or at least 15 seconds.
- **Curve** (Marketing API Insights): `video_play_curve_actions` — percentage still watching per second bucket 0–21. **Confirmed.** Stored as `ad_metrics_daily.video_play_curve` (migration `394`).

### Code

- Request + parse: `src/adplatforms/meta.mjs` (curve field added; quartiles kept; no invented 3-sec field).
- Persist: `api/campaigns/sync.mjs` `storeInsights`.
- Dying ping: `src/ops/watch-curve.mjs` — `p25/plays < 0.5` on ACTIVE ads with enough plays → `src/ad-videos/notify-fanout.mjs` (SMS + ntfy). Once per ad per day via `ad_watch_curve_alerts`.
- Campaign oPur TOF-SLO: not paused, budgets untouched (read-only path).

### How Chris gets the ping

Same buzz as finished ad videos: text to `AD_VIDEO_SMS_TO` (fallback `PULSE_SMS_TO`) plus ntfy topic. Fires after Meta campaign sync when a running ad is dying before 25%.

## Curve research

**Meta (fetched 2026-09-27):** Help `1792720544284355` lists video engagement metrics including 2-second continuous plays and 3-second video plays in Ads Manager; Help `279891745529019` defines 25% as played at a quarter of length including skip-ahead; Help `471190536725647` defines ThruPlay as completion or ≥15s (≥97% for shorter videos). **Andromeda:** Meta engineering post (Dec 2024) — retrieval narrows tens of millions of candidates to thousands; hierarchical index for growing creative volume from Advantage+ / GenAI; precomputed ad embeddings; future work mentions more diverse candidates. No Meta claim that “similar creatives are suppressed.”

**Drive:** SLO Ads folder (`13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ`) — 85 non-video files; **no** filenames mentioning curve / Andromeda / watch. Opened: `FundHub-Ad-Scripts-Batch-1` (internal “Andromeda era: 15–20+ creatives/week” — not Meta law); `Ad Scaling Framework.docx` (third-party SOP mentions Andromeda while scaling); `TLDR - Direct Response Ad Creation Framework SOP` (hook in first 3–5s — generic DR, not Meta quartiles). No dedicated curve notes on Drive.

**Shipped in repo:** `docs/ads/curve-optimization.md`; table `ad_watch_curve_diagnoses` → FK `ad_metrics_daily_id` (migration `395`). Saturday oPur numbers in the doc; **SLO4** sample film note: new cold open (face + overlay + first line under five seconds) — 339 plays, 22 at 25%.

## RB2B install result (2026-09-27)

- Baked id `Z6PVLHZEJL6R` into `public/funnel/rb2b.js` (CloudFront URL above).
- Set `RB2B_ID` in local `.env` (gitignored) and Netlify production / deploy-preview / branch-deploy.
- Public marketing pages without `fh-attribution.js` now load `/funnel/rb2b.js` (script tag only).
- Apply funnel + `/roadmap` already load `fh-attribution.js` → get the pixel once `rb2b.js` is live.
- Not installed on `/app/*`, `login.html`, `portal-login.html`, `crm.html`, client `progress.html` / `contract.html`, or partner board/live desks.

## RB2B email storage (2026-09-27)

**Where the row lives:** `events` table, `name = 'rb2b.visitor_identified'`, one row per email (`idempotency_key = rb2b:<email>`). Payload holds email, name, linkedin_url, company, job_title, page_url, seen_at. Repeat visits update the same row (latest page wins). No client. No mail. No drip. Form emails stay on `slo.contact_started`.

**Live webhook URL:** `https://fundhub.ai/api/public/rb2b-webhook?secret=<RB2B_WEBHOOK_SECRET>`  
(Secret is in local `.env` and Netlify as `RB2B_WEBHOOK_SECRET`. RB2B docs: no signature — secret must be in the URL query string.)

**Chris — one RB2B step:** Open https://app.rb2b.com/integrations/webhook → paste that full URL → Save. (RB2B has no API to register the webhook for you.)

## Merged status

### Ads

One campaign is on: oPur: TOF-SLO: $297, $100 a day, started Saturday. Four videos, all to https://apply.fundhub.ai/roadmap/. Late afternoon: about $181 spent, 2,036 people saw them, 107 opened the page, 0 purchases. Spend is too small to judge the page. SLO1 gets the cheap page opens. SLO4 spends the most and keeps the fewest people. Ignore the old ClickFunnels count of 296. Use Meta's 107.

### Measuring, already on

The first box (name, email, phone) is saved even if they leave without paying. A Fundhub or test email is marked agent. Any other email is a person. We record how long they stay and whether the form came on screen. About 15 minutes after a real person leaves their info and does not pay, they get a text and an email asking what their concerns are. If they answer: "If we fixed that, would you want to be a Fundhub customer?" If an ad dies before the quarter mark and people are not tapping through, Chris gets a text to change the opening. If they leave the video early because they already clicked, that is a hop. Do not tell him to recut it. A full watch is not a sale. The purchase is the score. Playbook: `docs/ads/curve-optimization.md` (definitions also in `docs/ads/watch-curve.md`). Table `ad_watch_curve_diagnoses` can hold the diagnosis, whether the fix is the picture, the words, or both, and the film note. It does not fill itself every morning yet.

### RB2B

The account id is set: Z6PVLHZEJL6R. The pixel is live on public pages via `public/funnel/rb2b.js`. Staff screens are off. RB2B does not give phone numbers. It gives name, job, LinkedIn, and work email for some US visitors. Webhook storage is in the repo: rows go in the `events` table as `rb2b.visitor_identified`, at `https://fundhub.ai/api/public/rb2b-webhook` (secret in the query string). Our own visit tracker, when last counted, only had about one hour of history (15 person visits, 0 paid). Do not replace Meta's 107 with that 15.

### Emails

The long drip is not sending. Cold, warm, and hot (N-01, N-02, N-03) were turned off on August 22. Paying takes someone out. After the work is done they are supposed to come back in. N-04 (after funding closeout) and N-06 (another funding wave) are wired and send. The repair-done note (N-05) and the Analyzer-rerun note (N-08) are written and not wired. The AI emails that would use their file are not running. Tonight's two genuine notes are not that long drip. Seed `027_slo_genuine_followup` and the Inngest path are present.

### Tomorrow

Cost to get an email, which ad got the cheap page open, and whether anyone answered the text. No reply yet means there is nothing to rewrite the offer from.
