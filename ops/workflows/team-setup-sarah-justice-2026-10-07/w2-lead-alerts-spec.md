# W2 — Lead alerts to Chris (spec only)

Date: 2026-10-07. Owner of this file: workflow W2 (Sonnet). Spec only. No code was written, nothing was sent, no setting was touched.

Board: `ops/workflows/team-setup-sarah-justice-2026-10-07.md`.

## The ask, in plain words

Chris is the setter for now. When any new lead comes in, he must get a text and an email right away. He answers the lead from his business cell with a personal video. Then he hands warm leads to Justice (High Ticket Closer). Sarah is the Sales Manager.

## The short answer

1. **No new-lead alert exists today.** I looked in `src/`, `api/`, `netlify/`, `scripts/`, `db/` and `docs/`. The only things that text Chris are the morning check, the finished-ad buzz, and Blake's referral mail. None of them fire when a normal lead arrives. Details in section 3.
2. **Every normal lead already passes through one event: `entry.captured`.** The ClickFunnels apply survey, the homepage survey, the climate lead magnet and the Pipeline "New Client" button all fire it. A person who books first (no survey) fires `booking.created` instead. Two triggers cover them all.
3. **The build is small.** One new workflow, one small helper file, two environment names, tests, one pulse check. No database change. No new route. No screen.
4. **Two things block the build, and only Chris can answer them.** Which phone number, and which email address. I could not find his business cell in the repo. See section 8.
5. **One risk to know now.** A text to Chris through our Twilio number has never been proven to reach his phone. On 2026-09-24 the finished-ad text did not arrive. The email is the backup, and the proof step checks Twilio's delivery status. See section 7.

## 1. Every way a lead comes in

I found 10 lead-in paths and 6 other doors that are not leads. Line numbers are from the checkout of 2026-10-07.

All the public ones are listed in the `ROUTES` map in `netlify/functions/api.mjs`. Webhooks go through a prefix rule at `netlify/functions/api.mjs:1258-1262`.

### Lead-in paths (a person's contact details come in)

| # | Path | Where in the code | What it writes and fires | Alert in the first build? |
|---|---|---|---|---|
| 1 | **ClickFunnels webhook** (opt-in, form, survey answers) | `POST /api/webhooks/clickfunnels`. `api/webhooks/[provider].mjs:54`, then `src/http/router.mjs:71` (checks the signature) and `:309`, then `src/adapters/clickfunnels.mjs:758` `handleClickFunnelsWebhook`. Event mapping at `:736` `mapToCanonical`. | Finds or creates the client (`:631`). Fires `entry.captured`, plus `survey.submitted` when answers are present. | **Yes** |
| 2 | **Apply survey** on apply.fundhub.ai (the real funnel) | Posts every screen to the same URL as #1 with the header `X-Fundhub-Apply-Survey-Ingest`. `src/adapters/clickfunnels.mjs:469-534`. Browser permission in `api/webhooks/[provider].mjs:36-52`. | The first screen is the contact screen: name, email, phone (`src/survey/cf-question-map.mjs:24-32`). Fires `entry.captured`. Later screens are repeats and start no new run (`clickfunnels.mjs:668-697`, six-hour window). | **Yes** (same trigger as #1) |
| 3 | **Booking first** (a calendar booking with no survey) | Same webhook. `mapToCanonical` turns an appointment into `booking.created` (`clickfunnels.mjs:736-748`). The client is created at `:631`. | Fires `booking.created`, not `entry.captured`. An opt-in text for staff already exists for this event (`src/workflows/s-04c-staff-booked-alert.mjs`) but it is off by default. | **Yes, only if the person is brand new** |
| 4 | **Homepage survey** | `POST /api/public/survey-submit`. Route `api.mjs:761`. `api/public/survey-submit.mjs:116` `runSurveySubmit`, emit at `:143`. | Creates the client. Fires `entry.captured` and `survey.submitted`. The event key has `Date.now()` in it (`:134`), so the event system does not collapse repeats. The alert must dedupe on the person. | **Yes** |
| 5 | **Climate lead magnet** (/climate/) | `POST /api/public/climate-match`. Route `api.mjs:772`. `climate-match.mjs:191` `recordClimateLead` calls `runSurveySubmit`. | Same as #4. | **Yes** (same trigger) |
| 6 | **Staff "New Client"** on the Pipeline board | `POST /api/pipeline-clients`. Route `api.mjs:360`. `api/pipeline-clients.mjs:109`. | Creates the client, fires `entry.captured` with source `pipeline`. | **Yes** (the alert says it was added by staff) |
| 7 | **Education enrollment** | `POST /api/public/education-enroll`. Route `api.mjs:763`. `education-enroll.mjs:118`. | Creates the client and puts a card on Sales/new_lead. **It fires no event on purpose** (see its header, lines 20-30). | **No.** Not an event path. Ask Chris (section 8). |
| 8 | **$297 roadmap page, contact typed** | `POST /api/public/slo-interest`. Route `api.mjs:787`. `slo-interest.mjs:291` and `:369`. | Saves event `slo.contact_started` once per email per day. **Creates no client.** Includes bots (it labels each one person or agent). | **No.** Too noisy, and no client to link to. Ask Chris. |
| 9 | **$297 roadmap checkout** | `POST /api/public/slo-checkout`. Route `api.mjs:783`. `slo-checkout.mjs:301`, buyer made at `src/slo/buyer.mjs:31`. | Creates the client. Fires no `entry.captured`. This is a buyer, not a lead to chase. | **No.** Ask Chris. |
| 10 | **Blake referral mail** | `src/workflows/blake-lead-watch.mjs` (every 5 minutes), `src/staff/blake-lead-watch.mjs:42`. | Reads Gmail, texts Chris the lead's name and phone. Creates no client. | **Already alerts** (text only, no email, up to 5 minutes late) |

### Doors that are not leads (checked, left alone)

| Door | Where | Why it is not a lead |
|---|---|---|
| Partner / affiliate application | `api/public/partner-apply.mjs:311` | A partner applicant, a different flow. |
| RB2B visitor push | `api/public/rb2b-webhook.mjs:98` | A named website visitor. Stored as an event. No client. |
| Job application | `api/hiring/apply.mjs:76` | A job candidate. |
| Payment from an unknown email | `src/adapters/commas.mjs:748` | A sale. It makes a client from the email alone. |
| Inbound text or call | `src/adapters/twilio.mjs` (`message.inbound`), `src/adapters/bland.mjs` | Replies from people we already have. They create no client. |
| Staff and partner client inserts | `api/contracts.mjs:289`, `src/contracts/upload.mjs:182`, `src/blueprint/credit-partner.mjs:68` | Made by staff or partners for work already in progress. |

### What I looked for and did not find

* **No bulk lead import.** The only import scripts in `scripts/` are for lenders (`lenders-import-*.mjs`). Nothing loads leads from a CSV.
* **No Meta lead-ads door.** A search for `leadgen` and "lead ads" across `src/`, `api/`, `netlify/`, `scripts/`, `docs/` found nothing.
* **No GoHighLevel door.** It is retired (`.claude/rules/ghl-blacklisted.md`).

## 2. The one thing every lead path shares

Paths 1 to 6 all call one function to find or create the person: `resolveClient` in `src/handlers/client-lifecycle.mjs:209`. It inserts a client row at `:235`, and it never creates the same email twice.

Then they fire one of two events:

* `entry.captured` for paths 1, 2, 4, 5 and 6.
* `booking.created` for path 3.

The system already runs workflows on those events. The welcome text and email to the lead (`src/workflows/s-00-welcome.mjs`) is one of them. It uses a one-time stamp on the client's file so it sends once. The alert should copy that exact pattern.

## 3. What exists today, and what is missing

| Thing | What it does today | Is it the new-lead alert? |
|---|---|---|
| `s-00-welcome` (`src/workflows/s-00-welcome.mjs`) | On `entry.captured`, queues a welcome text and email **to the lead**. | No. It talks to the lead, not to Chris. The lead gets it while Chris is also alerted. |
| `s-04c-staff-booked-alert` (`src/staff/booked-call-alert.mjs`) | On `booking.created`, texts owner, closer and sales manager. Off for each person until a switch is turned on (`db/migrations/258_staff_notify_booked_call_sms.sql`, default false). Text only. | No. It is about booked calls, and it only fires after a booking. |
| Blake lead watch (`src/staff/blake-lead-watch.mjs`) | Texts Chris name and phone for Blake referral mail. Goes to `PULSE_SMS_TO`. | No. One lead source only. No email. |
| Daily pulse and morning brief (`src/pulse/notify.mjs`, `src/ops/morning-brief.mjs`) | One text a day. Goes to `PULSE_SMS_TO`. | No. |
| Finished-ad and dying-ad buzz (`src/ad-videos/notify-fanout.mjs`) | Text to `AD_VIDEO_SMS_TO` (falls back to `PULSE_SMS_TO`) plus an ntfy push. | No. |
| `ntfy` provider (`src/messaging/providers/ntfy.mjs`) | A push to a public topic. | Not usable. Its own header says nothing about a client may go there, because anyone who guesses the topic can read it. |

**Why Chris is not getting a new-lead alert:** the code for it does not exist. A search for "new lead" alerts, `lead_alert`, `notify_owner`, and any text-to-Chris call found only the rows above.

**Also true today:** `PULSE_SMS_TO` is shared by the pulse, the Blake texts and the ad-video fallback. The board `ops/workflows/morning-brief-2026-10-05.md` says it most likely still holds the +1 661 test phone, because the step that moves it (MB1) has not run. So the alert must not use `PULSE_SMS_TO`. See section 6.

## 4. The trigger, and how one lead gets one alert

**New Inngest workflow `lead-alert-owner`**, built like `s-00-welcome`.

It runs on two events: `entry.captured` and `booking.created`.

It runs in the background, not inside the webhook. A slow phone company cannot slow the ClickFunnels webhook.

Steps, in order:

1. **Find the client.** Same call S-00 uses.
2. **Skip test files.** If the client is marked `is_demo` (an email with `+fhtest` in it), stop. The proof uses a `+sim-` email, which is not flagged.
3. **Skip old clients.** If the client row is more than 24 hours old, stop. This stops a text for every old client whose ClickFunnels contact gets touched again.
4. **Claim the text stamp.** Write `lead_alert_sms_at` on the client's file only if it is empty. One database statement, so two events at the same moment cannot both win. This is the existing function `claimCustomFieldLock` (`src/workflows/custom-fields.mjs:34`).
5. **Send the text.** If it fails, clear the stamp and let Inngest try again.
6. **Claim the email stamp** (`lead_alert_email_at`), **send the email**, same rule.

Each channel has its own stamp, so a text that worked is never sent twice when the email has to retry.

**Result: one text and one email per person, ever.** It does not matter if the person fires `entry.captured` five times, or fires `booking.created` after. The stamps are already there, so the workflow stays quiet.

Things that follow from this:

* A person who books without a survey (path 3) still gets one alert. A person who surveys and then books gets one alert, at the survey.
* A person added on the Pipeline board (path 6) gets an alert too. If Chris adds one himself, he gets a text for his own action. That is harmless.
* On the first deploy, any client created in the last 24 hours who touches the funnel again may get one alert. Those are real recent leads Chris has not been told about.
* If the lead's phone or email is missing, the alert still goes. It says "not given yet" for that line.

## 5. The messages

Name the company **Fundhub**. No emoji. The link goes on its own line so a phone makes it tappable.

### Text

```
New Fundhub lead
Jane Smith
(602) 555-0142
jane@example.com
Source: Ad 42 (42-ringlights)
Open: https://fundhub.ai/app/client-control-panel.html?id=<client id>
```

About 200 characters. That is two text segments. It fits.

### Email

Subject: `New Fundhub lead: Jane Smith, (602) 555-0142`

The subject alone tells him who it is and what number to text.

Body (plain text):

```
A new lead just came in.

Name: Jane Smith
Phone: (602) 555-0142
Email: jane@example.com
Source: Ad 42 (42-ringlights)
Time: 3:42 PM Arizona

Open the lead in the CRM:
https://fundhub.ai/app/client-control-panel.html?id=<client id>
```

### Where each line comes from

| Line | Read from | If it is missing |
|---|---|---|
| Name | `clients.first_name` and `last_name` | "Name not given" |
| Phone | `clients.phone`. US numbers shown as (XXX) XXX-XXXX. Anything else shown as stored. | "Phone: not given yet" |
| Email | `clients.email` | "Email: not given" |
| Source | The typed ad row `client_ad_attribution` (`readClientAdAttribution`, `src/ads/store.mjs:42`). Shown as `Ad <ad_id> (<utm_content>)`. | `clients.channel_source` (for example `clickfunnels`, `pipeline`, or the climate source). If that is empty too: "Source: not tagged". |
| Time | The event time, in Arizona time (America/Phoenix, the zone the rest of the messaging code uses) | n/a |
| Link | `https://fundhub.ai/app/client-control-panel.html?id=<client id>`. Base is `APP_BASE_URL`, then `URL`, then `https://fundhub.ai` (same rule as `src/messaging/dispatch.mjs`). | n/a |

The link is the real CRM pattern. `public/app/pipeline.html:2348` builds Sales-board links as `client-control-panel.html?id=`. The page reads `id` or `client_id` (`client-control-panel.html:2836`). Chris has to be signed in.

For paths 1 and 2, the ad number is already stored by the time the workflow runs. `onEntryCaptured` (`client-lifecycle.mjs:285`) writes it synchronously inside the webhook. The homepage survey (path 4) drops the ad tags, so those leads show their channel source instead.

## 6. Channels, and which provider sends each

Outbound sends go through `src/messaging/providers/*` and nowhere else (CLAUDE.md section 12). The new code adds no `fetch`.

| Channel | Provider file | Sends to | Settings it needs (names only) |
|---|---|---|---|
| Text | `src/messaging/providers/twilio.mjs` `send()` | `LEAD_ALERT_SMS_TO` (new) | `TWILIO_SEND_ACCOUNT_SID`, `TWILIO_SEND_AUTH_TOKEN`, `TWILIO_SEND_FROM` (already set) |
| Email | `src/messaging/providers/resend.mjs` `send()` | `LEAD_ALERT_EMAIL_TO` (new) | `RESEND_API_KEY`, `RESEND_FROM` (already set) |

**Not ntfy.** Its header forbids client details on it.

**Why send straight to the provider and not through the message queue** (`sendTemplated` and the dispatcher):

* The queue is checked against the lead's own consent and quiet hours. This alert is for Chris, not for the lead. The lead's consent has nothing to do with it.
* The queue waits for a five-minute sweeper. The board measured 46 to 270 seconds of waiting, plus workflow delay, in the F1 note at the top of `src/workflows/message-dispatch-sweeper.mjs`. Chris asked for "the moment".

This is the same direct pattern the Blake alert (`src/staff/blake-lead-watch.mjs`) and the staff credential mail (`src/auth/staff-mail.mjs`) already use.

**Both sends sit behind the messaging fence.** `MESSAGING_DRY_RUN` must be `0` in production. The board `ops/workflows/ad-video-pipeline-ready-2026-09-23.md` says it was set to `0`. The proof step confirms it.

**Two new settings, with no fallback.** Do not fall back to `PULSE_SMS_TO`. It may still be the +1 661 test phone, and that would silently send leads' phone numbers to the wrong place.

* `LEAD_ALERT_SMS_TO`: one number. A list with commas is allowed so Justice can be added later. Cleaned to the format Twilio wants by `normalizeUsNumber` (`src/pulse/notify.mjs:28`).
* `LEAD_ALERT_EMAIL_TO`: one address, or a list with commas.

Both unset means no alert and a red line in the pulse. It must never fall back to a guess.

**No quiet hours.** The alert is sent day and night, because Chris asked for "the moment". His phone's Do Not Disturb is his off switch. (Chris can change this.)

## 7. Build plan

Build session model: Sonnet. This is a normal build like S-00. The proof step sends to a real phone, so go slow on the number.

Order (CLAUDE.md section 3a: no schema, no front end, so this is back end only):

### Files

New:

| File | What it does |
|---|---|
| `src/staff/lead-alert.mjs` | Builds the text and the email (section 5). Reads the two settings. Picks the source line. Calls the two provider `send()` functions. Returns what happened per channel. Never prints the number. |
| `src/workflows/lead-alert-owner.mjs` | The Inngest function from section 4. Two triggers, per-channel stamps, retry on a failed send. |
| `src/staff/lead-alert.test.mjs` | Wording tests. |
| `src/workflows/lead-alert-owner.test.mjs` | Behavior tests (list below). |
| `docs/journeys/lead-alert-flow.md` | One-page Mermaid diagram of the states and events (CLAUDE.md 3a step 4). |

Edit:

| File | Change |
|---|---|
| `src/workflows/index.mjs` | Import and add `leadAlertOwner` to `functions`, with the standard header comment. |
| `src/workflows/index.test.mjs` | Add `"lead-alert-owner"` to `EXPECTED_WORKFLOW_IDS` (around line 124). |
| `src/pulse/system-checks.mjs` and `src/pulse/daily-pulse.mjs` | Add one check, `checkLeadAlerts`, next to `checkMessageQueue` (`daily-pulse.mjs:497`). See "Watching it" below. |
| `netlify.toml:94` | Add `LEAD_ALERT_SMS_TO` and `LEAD_ALERT_EMAIL_TO` to `SECRETS_SCAN_OMIT_KEYS`, the same way `PULSE_SMS_TO` is there. Otherwise a number that appears in a doc can fail a production build. |
| `.env.example` | Add the two names, empty. Names only. |
| `docs/journeys/CHANGELOG.md` | One line at the top. |

Not needed: no migration (the stamps live in `clients.custom_fields`, like S-00's), no new route, no screen, no change to `resolveClient`, no change to any intake handler.

Journeys: `client-intended.md` and `role-owner-intended.md` list API routes only. They have no lead step. Nothing in them conflicts, so the "stop and ask" rule in CLAUDE.md section 4 is not triggered. They are generated from routes, and this adds no route, so `npm run journeys:check` should still pass.

### Tests to add (in `src/`, so `npm test` picks them up — CLAUDE.md section 12)

`lead-alert-owner.test.mjs`, using `pgFake`, `fakeStep` and `ev` from `src/workflows/test-support.mjs`, like `s-00-welcome.test.mjs`:

1. A new lead gets one text and one email.
2. A second `entry.captured` for the same client sends nothing.
3. Two events at the same moment send once (the S-00 race test).
4. `booking.created` after `entry.captured` sends nothing more.
5. `booking.created` for a brand-new person sends one alert.
6. A client older than 24 hours gets no alert.
7. An `is_demo` client gets no alert.
8. Missing phone or email still sends, with "not given yet".
9. A failed text clears its stamp and asks for a retry. The email still goes.
10. Settings unset: no send, the stamp is cleared, no crash.

`lead-alert.test.mjs`: the wording above, the ad line, the fallback source line, the link base, the phone shape, "Fundhub" spelled right, text under 320 characters, and no `fetch` in the file.

`system-checks` tests for the new check, plus a `.pg.test.mjs` run only against a scratch database.

### Watching it (the pulse rule)

The pulse registry rule (`.claude/rules/pulse-registry.md`) says every new live thing is watched in the same change. Here is what that means for this build:

* `src/pulse/registry.mjs` lists only pingable `api/` doors, desks, and public pages. This build adds no `api/` file, so there is nothing to add there. Do **not** add an `ALLOWED_UNMONITORED` entry for it. That test (`registry.test.mjs`, "no ALLOWED_UNMONITORED entry is stale") fails when the key is not a real file.
* The job list in `src/pulse/heartbeats.mjs` holds cron jobs only. This workflow is event-driven, so it has no row there.
* The watch is the new pulse check `checkLeadAlerts` in `src/pulse/system-checks.mjs`. It reads the database and does not write. It goes RED when:
  * a non-demo client was created in the last 24 hours and has no `lead_alert_sms_at` or no `lead_alert_email_at`; or
  * `LEAD_ALERT_SMS_TO` or `LEAD_ALERT_EMAIL_TO` is not set (it checks by name and never prints the value).
* If a test door is ever added under `api/` for the proof, that door needs a registry row or an `ALLOWED_UNMONITORED` entry with a written reason of 40+ characters. The plan below does not add one.

### Definition of done (CLAUDE.md section 6)

`npm run lint`, `npx tsc --noEmit`, `npm test` with `DATABASE_URL` blank (never run tests against the live database), the journey doc and CHANGELOG line, and a change manifest on the board. Commit locally. Open a PR. Delete the branch after the merge.

### Ship

On the Mac, because the cloud cannot reach Netlify (CLAUDE.md section 11, Egress):

1. Set both settings once the numbers are known: `netlify env:set LEAD_ALERT_SMS_TO "<number>" --context production --context deploy-preview --context branch-deploy --secret`, then the same for `LEAD_ALERT_EMAIL_TO`.
2. Ship once: `npm run ship`. Confirm `/api/health` says pending 0. New settings only reach the functions after a deploy.

### Proof — one sim lead, run by the agent

Chris does not check his phone or inbox. The agent proves it.

1. Check `MESSAGING_DRY_RUN` is `0` and both settings are present, by name.
2. Make one sim lead. Do not walk the ClickFunnels apply page (`.claude/rules/sim-assume-paid.md`). Post to `https://fundhub.ai/api/public/survey-submit` (path 4). It fires the same `entry.captured` event the funnel fires, with no vendor side effects.
   * Name: "Sim LeadAlert".
   * Email: `stanbridgejchris+sim-leadalert-<timestamp>@gmail.com`. The sim email pattern already used on `ops/workflows/comms-timing-map-2026-09-20.md:18`. It is a plus tag with `+sim-`. Do **not** use `+fhtest`, which would flag it as a test file and silence the alert.
   * Phone: `+16616054248`, the agent sim phone, as the lead's phone. Never the personal prove phone.
3. Prove the text. Read Twilio's message log (read-only). Expect exactly one outbound text to the alert number, status `delivered`. Write down the seconds from the post to Twilio accepting it. If the status is `undelivered` or `failed`, write the Twilio error code in plain words (30034 and 30007 mean the phone company filtered it). Do not retry by hand.
4. Prove the email. Read the Resend delivery record (read-only): one email, `delivered`. If Chris picks an address the prove Gmail can read, read it with `src/gmail/` and check the subject, name, phone, source and link.
5. Check the sim client's file: both stamps are set. Wording matches section 5.
6. Post the same sim lead a second time. Expect **no** second text and **no** second email. The counts stay at 1 each.
7. Leave the sim row alone. Deleting it is a "delete data" call that only Chris makes.
8. Write PASS or FAIL for each step on the board. Stop. Do not start another hole.

What this proof sends for real: one text and one email to Chris, because that is the feature. The sim lead also gets the normal welcome text and email, to the plus-tag address and the agent phone.

Optional, only if Chris asks: repeat step 2 through the apply-survey ingest post (path 2), which also proves the ad line. It makes one ClickFunnels contact, like the apply-dual proof on 2026-09-30.

Never in this proof: flip `messaging_settings.outbound_enabled`, run `npm run verify:e2e`, or send to the personal prove phone.

### Risks

* **The text may not reach his phone.** The finished-ad text on 2026-09-24 did not arrive (`ops/workflows/grok-handoff-ad-video-text-2026-09-24.md`). The daily pulse text had never been sent live at that time. Possible causes are the wrong number or phone-company filtering because of 10DLC registration. The provider's own header says texts fail until that registration clears. Whether it has cleared is not written anywhere in the repo. Proof step 3 finds out. The email is the backup channel.
* **Wrong number means a lead's name and phone go to a stranger.** That is why the number question comes first, and why there is no fallback to `PULSE_SMS_TO`.
* **If Inngest is down, no alert.** The welcome text to the lead would be down too. The pulse check shows it within a day. `onEntryCaptured` says Inngest has failed to invoke functions before (`client-lifecycle.mjs:269-272`).
* **Launch day:** up to 24 hours of recent leads may each get one alert if they touch the funnel again.

## 8. Open questions only Chris can answer

1. **Which number gets the text?** The only number the repo knows is the one ending **6457**. Chris gave it on 2026-10-05 for the morning text (`ops/workflows/morning-brief-2026-10-05.md:23`). Nothing says it is the business cell, and the same board says the 2026-08-25 plan was his personal cell. Is 6457 the business cell? If not, what is the business cell number?
2. **Which email address gets the alert?** The repo shows his CRM login as `chris@fundhub.ai`. I did not find an address he said he wants alerts on. Say the one he reads on his phone. (If it is a Gmail the prove token covers, the agent can read the proof email too.)
3. **Which of these should also count as a lead?** (a) someone who typed their email on the $297 roadmap page but did not pay, (b) a $297 buyer, (c) an education enrollment. The default in this spec is none of them. Say "add (a)", "add (b)" or "add (c)" to change it.
4. **Text day and night?** The default is yes, 24 hours a day. Say if you want a quiet window.

Everything else in this spec is decided by the repo's existing patterns.

## 9. What I could not read or check

* **No `.env` and no `credentials/` folder in this cloud checkout.** I could not read local settings. The `.env.example` read was blocked by the environment's permission rules, so I did not work around it. A repo-wide search showed `PULSE_SMS_TO`, `CHRIS_PULSE_SMS` and `AD_VIDEO_SMS_TO` there, all commented out, empty.
* **Netlify's real values are out of reach from the cloud** (`api.netlify.com` is blocked). So I do not know what `PULSE_SMS_TO` holds today.
* **The live `staff` table was not checked.** It may hold Chris's phone on the owner row (the booked-call text reads `staff.phone`). That is outside the repo, so it was outside this run. The build session can read it and tell Chris what is on file.
* No message was sent. No setting was touched. No file other than this one was written.
