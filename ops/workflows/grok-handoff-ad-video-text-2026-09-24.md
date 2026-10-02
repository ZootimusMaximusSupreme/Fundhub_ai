# Hand-off prompt — get video 1 texted to Chris (for Grok 4.7 Fast)

Written 2026-09-24 06:16 UTC when Chris said stop. Paste everything below the
line into a fresh Grok session in this repo. It stands on its own.

---

You are working in the Fundhub repo at `/Users/chrisstanbridge/Developer/fundhub-platform` (branch `main`). Chris is the owner; he does not read code; write to him in short plain sentences. Company name is **Fundhub** (never FundHub).

## The one goal

**Chris must receive a TEXT MESSAGE on his phone with the finished video 1 and its Approve/Reject links, sent by the pipeline itself.** Everything else is secondary. Do not start any other take. Do not touch websites, HTML, or design files.

## What is already true (do not redo)

* The ad-video pipeline runs end to end on production: Drive take → Submagic → captions → our B-roll clips → export → render → notify → `awaiting_approval`. Eighteen breaks were fixed tonight; the board is `docs/workflows/submagic-settings-lock-2026-09-23.md` (read W5–W10 and the leftover cards).
* Video 1 = `ad_videos` row `963ed282-7f76-451e-8c15-0bd873384f21`, ad **84**, take **1**, status `awaiting_approval`, Submagic project `c3904797-dca9-4f32-af5d-c73fe637243c`, 3 clips, rendered 05:43:02 UTC. Its approve token is on the row (`approval_token`, plain — the token IS the credential). Links Chris already has in chat:
  * Video (Submagic): the row's `finished_url`
  * Video (Drive, index at front, plays in browser): https://drive.google.com/file/d/17WiAfDQdLW6JiP0UqIv7vsLK34BIns-u/view
  * Approve: `https://fundhub.ai/api/public/ad-video-approve?token=<approval_token>&decision=approve`
  * Reject: same with `&decision=reject`
* The notify step went out at 05:45:22 with no error recorded — but that was the **ntfy** push. **The text did not arrive.** The fan-out (`src/ad-videos/notify-fanout.mjs`) counted ntfy as success. Nothing retries a failed buzz.
* The number: `PULSE_SMS_TO` on Netlify (stored `--secret`; from a laptop `netlify env:get` returns a 20-character mask, so you cannot read or test it locally — production sees the real value). The repo documents it as Chris's number (`src/pulse/notify.mjs`). It is now normalised to E.164 before reaching Twilio (shipped `f313103d`). The daily pulse has NEVER sent a real text (`dryRun` defaults true), so this number was never exercised before tonight.
* Every notify now logs one line per channel in the worker log: `[ad-video-notify] sms: sent|not sent (<reason>) … | ntfy: …`. That line is your proof.

## What is half-done — finish this first

Branch **`wip/ad-video-rebuzz`** (one commit) holds the complete fix: a `renotify` step, a `rebuzz` loop in the sweeper that re-sends the buzz for any `awaiting_approval` row with no `notified_at` (for a day, reusing the row's token so sent links stay live), and the fan-out changed so that **with a number set, sent means the text went**. Product code and its new tests are done. Two EXISTING tests need their expectations updated (not product bugs):

1. `src/ad-videos/notify-fanout.test.mjs` — "with no number set, the text is skipped and said so": the error text is now `no number set for a text`.
2. `src/workflows/ad-video-sweeper.test.mjs` — "the batch limit reaches the store": the fake store records the LAST `listPending` call; the new `rebuzz` loop makes a second call with `limit: 25`, so it sees 25 instead of 3. Record the walk's call specifically (or the first call).

Steps:

```bash
git checkout wip/ad-video-rebuzz
# fix the two test expectations above
npm run lint
node --test src/ad-videos/*.test.mjs src/workflows/ad-video-sweeper.test.mjs src/lib/no-unfenced-transmit.test.mjs src/http/scheduled-functions-return.test.mjs src/http/ad-video-worker-guard.test.mjs
# must print "# fail 0" — do not ship red
git checkout main && git merge --no-ff wip/ad-video-rebuzz && git branch -d wip/ad-video-rebuzz
npm run ship        # allowed, required; do NOT run it within 30 s before a 5-minute mark
```

Then arm the resend for video 1 (through the store's own patch path, never raw SQL):

```bash
node --env-file=.env --input-type=module -e '
import * as store from "./src/ad-videos/store.mjs";
import { db, close } from "./src/db.mjs";
const [r] = await store.listPending(db, { states: ["awaiting_approval"], limit: 1 });
await store.patch(db, r.id, { notified_at: null });
console.log("re-buzz armed for", r.drive_raw_name); await close();'
```

The scheduler runs every 5 minutes (`netlify/functions/ad-video-sweeper.mjs` taps `ad-video-worker-background.mjs`). **A background function can serve the previous build for one or two ticks after a deploy** — wait for the pass after that.

Prove it:

```bash
netlify logs --source functions --function ad-video-worker-background --since 10m
# look for:  [ad-video-notify] sms: sent to …NN | ntfy: sent
```

If the line says `sms: not sent (<reason>)`, that reason is the answer. Report it in plain words. Likely: Twilio auth (`TWILIO_SEND_ACCOUNT_SID/AUTH_TOKEN/FROM`), the number rejected (`21211`), or carrier/10DLC filtering (`30034`, `30007`). **Do not unset, clear, rotate or overwrite any key or number — ever.** Fix in code around it or report and stop.

## Rules that bind you

* Never delete, unset or overwrite a stored credential or variable value. Never print one.
* Commit locally every time you finish a unit; never push; there is no GitHub in use.
* Ship only with `npm run ship`, only on a green gate.
* Do not start take 2. `SLO Ad 3 Take 1.mp4` is back in the SLO Ads root on purpose; leave it. Raw folder id `12L_RH8QycTZFeaXn4rHs9AIeGq7XokWU`.
* Stills are held out of B-roll (`AD_VIDEO_BROLL_STILLS=1` re-enables) because Submagic never finishes taking a PNG in. Leave that.
* Read `CLAUDE.md` §2, §8, §11 before anything else. Chris gave full authorization for this goal — no questions; if a rule blocks the obvious move, find the best alternative inside the rules and say what you did.

## Reading the row

```bash
node --env-file=.env --input-type=module -e '
import * as store from "./src/ad-videos/store.mjs";
import { db, close } from "./src/db.mjs";
for (const r of await store.listPending(db, { states: ["awaiting_approval","matched","rendered","failed"], limit: 5 }))
  console.log(r.drive_raw_name, r.status, "notified:", r.notified_at, "err:", r.notify_error, "step:", r.last_step, r.last_step_note);
await close();'
```

## Done means

Chris says he got the text, and the worker log line shows `sms: sent`. Then write one line on the board (`docs/workflows/submagic-settings-lock-2026-09-23.md`, section W10) saying so, commit, and stop.
