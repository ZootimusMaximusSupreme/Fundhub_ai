# /apply survey rebuild + Meta tracking — handoff (2026-09-30)

Preview artifact: `clickfunnels-fragments/apply-survey.html` (local harness; open in browser). Source of truth for fields: `docs/clickfunnels/apply-survey-extract-2026-09-30.md`.

## 1. Survey flow (unchanged logic)

Contact first (kept first on purpose so partial leads get the 20-minute nudge).

| # | Screen | Key | Type |
|---|---|---|---|
| 1 | Let's Start With Your Info | first_name, last_name, email, phone | contact |
| 2 | Set Your Target Amount | cf_svy_funding_target_amount | single |
| 3 | Planned Use | cf_svy_planned_use | single (Other removed) |
| 4 | What Would This Money Change Right Now? | cf_svy_money_change_now | multi |
| 5 | Your Current Score | cf_svy_self_reported_fico | single |
| 6 | Do You Have a Business? | cf_svy_has_business | single, 6 options, branch |
| 7a/8a | Annual Business Revenue / Can You Verify Revenue? | cf_svy_business_revenue / cf_svy_revenue_verifiable | any "Yes" on #6 |
| 7b/8b | Annual Personal Income / Can You Verify Income? | cf_svy_annual_income_range / cf_svy_income_verifiable | "No, personal funding only" |
| 9 | Available Capital | cf_svy_available_capital | single (completion sentinel) |

Business options, exact labels (plain hyphens, never en dashes):
`Yes, less than 6 months old` · `Yes, 6-12 months` · `Yes, 1-2 years` · `Yes, 2-5 years` · `Yes, 5+ years` · `No, personal funding only`

All other option labels: verbatim from the extract §2. Send labels, never CF option ids.

## 2. What the rebuild adds

- One question per screen; single-choice answers auto-advance on tap; Back button.
- Progress: live % + "Question X of Y", recalculated when the branch changes the count; fills to 90% across questions.
- Contact polish: names auto-capitalized ("Mary Ann", "O'Neil-Smith"); email lowercased, format-checked, typo suggestion for common domains ("Did you mean …@gmail.com?"); phone formatted (480) 555-1234, leading 1 dropped, valid 10-digit US only.
- Security: "Secure application" lock on the contact screen; under phone: "Only used to confirm your call and send reminders."; row beside Next: Encrypted connection · Never sold or shared · No credit pull to apply.
- Score reassurance: hint "Every score has a path…"; picking 500-579, 580-649 or Not sure shows a one-line reassurance ~1.6s before advancing.
- Approvals strip under the card: still between steps, each Next slides in the next higher batch (2 per row on phones, 3 on desktop), lowest → highest by the last screen. Each card = approval photo (sized to the image, max 240px tall) + amount. Placeholders now; feed the same 16 real approvals used on /watch (watch-proof.js WINS) as `{ amount, img }`.
- End: ~1.4s review loader (4 checks) → clean result screen (checkmark, "You're qualified. Pick a time below.", recap of target / score / funding type) → booking calendar card on the same page, auto-scrolls to it. Calendar card shows: Free call · Soft pull only, zero score impact · Reschedule anytime. Live calendar embed goes in that card.
- "Takes about 10 seconds" line kept per owner (note: real completion is ~40–60s).

## 3. Wiring (Cursor)

- Keep the native CF survey live until cutover (spec §7). This replaces it after Friday's launch.
- Per-screen submit like CF today: `SEND_STEP` posts on every advance → `https://fundhub.ai/api/webhooks/clickfunnels` (or `/api/webhooks/clickfunnels` on other hosts). `entry.captured` after contact; `survey.submitted` once any cf_svy_* answer exists. Payload shape: `{ source, funnel: 'apply-survey', step_key, email, name, phone, answers, a1, a2, attribution{ utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_path, referrer_domain } }` (labels, never CF option ids).
- Browser auth: header `X-Fundhub-Apply-Survey-Ingest` must match Netlify `CLICKFUNNELS_APPLY_SURVEY_INGEST_SECRET` (set on the page at cutover as `window.FH_APPLY_SURVEY_INGEST`). CF HMAC is unchanged for real CF webhooks.
- Preview guards (`apply-survey.html`): **no network POST** on `file://` unless `window.FH_APPLY_SURVEY_WEBHOOK_FORCE = true` (still needs ingest token). `STEP_LOG` + `window.FH_SURVEY_PAYLOAD` always capture payloads locally.
- Hidden fields keep their names so fh-attribution.js stamps them.
- Dual feed: the browser still posts every step only to Fundhub. After that write, the server copies the same step onto the ClickFunnels contact (`POST /workspaces/{id}/contacts/upsert`, match on email) using `CLICKFUNNELS_API_KEY`. The page never holds that key.

```text
SEND_STEP
  → POST /api/webhooks/clickfunnels (ingest secret, unchanged)
       → Fundhub: entry.captured, and survey.submitted once any cf_svy_* answer is present
       → ClickFunnels contact: email, first name, last name, phone,
         custom_attributes cf_svy_* labels, plus utm_* / landing_path / referrer_domain / a1 / a2
```

ClickFunnels custom attributes are text, so a multi-select is a JSON list of those same labels. A contact update ClickFunnels sends back is read as that list again, so Fundhub still stores an array. There is no Cortana reader in this repo. The name Cortana here is the Commas checkout key. What loses the answers if we only hit Fundhub is the ClickFunnels contact, which is what a ClickFunnels workflow reads. The native survey used to fill those attributes on each screen. This upsert is that fill.
- Turn "Other" off on the CF Planned Use question too, so both versions collect the same answers.
- Split test old /apply vs new: judge on booked calls per click.

## 4. Meta tracking plan

| Moment | Event | Value | Source |
|---|---|---|---|
| Survey submitted | Lead | none | browser |
| Call booked | Schedule — optimize for this first | none | browser + CAPI |
| $32 soft pull paid on the call | ShowedCall (custom) | 32 | CRM → CAPI |
| Any offer paid or financed | Purchase | real cash collected ($200 / $1K / $3K / financed amount on approval) | CRM → CAPI |
| Funding success fee paid later | BackendRevenue (custom) | fee amount | CRM → CAPI, kept out of Purchase |

- Once ShowedCall reaches ~50/week, test a campaign optimized for ShowedCall.
- Open: does the CRM already fire anything to Meta on deposit?

## 5. Baseline + targets

- Old funnel (VSL + book only): ~12% click-to-book, $30–35 per booked call, ~50% show, ~50% close.
- Guess for new funnel: 15–20% click-to-book, $21–27 per booked call, 60–70% show with a setter.
- Watch cost per showed call and cash collected per ad dollar.
- Launch spend: $250–300/day.
