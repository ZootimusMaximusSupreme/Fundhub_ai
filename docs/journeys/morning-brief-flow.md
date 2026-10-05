# Morning and evening brief — flow (generated from code, 2026-10-05)

What happens every morning and every evening, read from the code in `src/workflows/daily-pulse.mjs`, `src/workflows/evening-brief.mjs`, `src/pulse/daily-pulse.mjs`, `src/pulse/scorecard.mjs`, `src/ops/morning-brief.mjs`, `src/ops/brief-offers.mjs`, `src/ops/suggestions.mjs`, `src/pulse/notify.mjs` and `api/read/morning-brief.mjs`. The page: `public/app/morning-brief.html` + `public/app/morning-brief.js`. Board: `ops/workflows/morning-brief-2026-10-05.md` (MB2, MB3, MB4, MB5, MB6). Spec: `docs/specs/morning-brief-2026-10-05.md`.

**No intended journey has this step yet.** No `-intended.md` file mentions the morning text, the evening text or the daily pulse text.

**Owner-set 2026-10-05 (Chris):**
1. When the brief goes live it **replaces** the old "Fundhub morning check" pulse text. One text, not two.
2. An **evening brief** at 9:00 p.m. Arizona: "Good evening, Chris." Same content as the morning: systems first, then the sales team, money, and ads.
3. Ad and sales numbers are **organized per offer and per funnel**. A number that cannot be split shows once under "all offers", with a one-line reason.
4. The stored report is the detail. The text is a short summary that ends "Full report: <link>".

Both are **dry-run** today. `MORNING_BRIEF_LIVE` is false. Both briefs are built and saved. Nothing new is texted. The old pulse text still goes, unchanged.

## The morning run

```mermaid
flowchart TD
    CRON["6:00 a.m. Arizona<br/>cron 0 13 * * * (UTC)"] --> LIVEQ{"MORNING_BRIEF_LIVE?<br/>(false today)"}
    LIVEQ -->|false| P1A["Step 1: run-pulse<br/>Recon AG-07 audit<br/>sends its own 'Fundhub morning check' text<br/>(same as before)"]
    LIVEQ -->|true| P1B["Step 1: run-pulse<br/>Recon AG-07 audit<br/>sendPulseText: false — no text of its own<br/>(sms.reason = replaced_by_morning_brief)"]
    P1A --> SC["runDailyPulse builds MB2's scorecard<br/>(green / red / not_checked; each red with<br/>customer_sees, since, day_count, fix)<br/>saved to pulse_scorecards on a live run"]
    P1B --> SC
    SC --> P2["Step 2: morning-brief<br/>runMorningBrief({ kind: 'morning', pulse, live })"]
    P2 --> SYS{"pulse.scorecard there?"}
    SYS -->|Yes| SYS1["Systems from that scorecard<br/>'N of M checks green. K red: id (day 2) …'"]
    SYS -->|No| SYS2{"pulse_scorecards row<br/>for today?"}
    SYS2 -->|Yes| SYS1
    SYS2 -->|No| SYS0["'Systems: the morning check did not run,<br/>so nothing was checked.'"]
    P2 --> NUMS["One staff-scoped read (src/ops/brief-offers.mjs)<br/>window = YESTERDAY, Arizona midnight to midnight"]
    NUMS --> MKT["Marketing per offer → per funnel<br/>spend (per offer only), new people, booked,<br/>cost per booked, showed, no-shows, sales, cash,<br/>return on ad spend, dying ads with their offer"]
    NUMS --> TEAM["Team per closer → per offer → per funnel<br/>calls held, no-shows, sales (deposits), close rate"]
    P2 --> TEAM2["Team, company-wide (not split, reason shown):<br/>CSM overdue, unrecorded calls,<br/>company 8 (last 24 hours)"]
    P2 --> MON{"PLAID_ENV = production<br/>and an active plaid_items row?"}
    MON -->|No| MON0["'Money: not connected yet.'"]
    MON -->|Yes| MON1["Money posted YESTERDAY + month to date<br/>bank_transactions via src/finance/cashflow.mjs"]
    P2 --> SUG["Suggestions: buildSuggestions (MB4)<br/>top 3 into the report, 1 into the text<br/>any failure → 'Suggestions: none today.'"]
    SYS1 --> TXT["Text: 'Good morning, Chris.' … headline numbers,<br/>reds, 1 suggestion<br/>last line: 'Full report: …/app/morning-brief.html?date='"]
    SYS0 --> TXT
    MKT --> TXT
    TEAM --> TXT
    TEAM2 --> TXT
    MON0 --> TXT
    MON1 --> TXT
    SUG --> TXT
    TXT --> SEND["Send or dry-run (see below)<br/>row kind = 'morning'"]
```

## The evening run

```mermaid
flowchart TD
    ECRON["9:00 p.m. Arizona<br/>cron 0 4 * * * (UTC)<br/>EVENING_BRIEF_CRON — one line to change"] --> E1["evening-brief job<br/>runMorningBrief({ kind: 'evening', live })<br/>never runs the pulse"]
    E1 --> ESYS{"pulse_scorecards row<br/>for today (Arizona)?"}
    ESYS -->|Yes| ESYS1["'Systems, from this morning's check at 6:00 AM: …'"]
    ESYS -->|No| ESYS0["'Systems: no morning check is stored for today,<br/>so nothing has been checked since last night.'"]
    E1 --> ENUMS["Same per-offer / per-funnel read,<br/>window = TODAY SO FAR (Arizona midnight to now)"]
    E1 --> EMON["Money: same switch; money posted TODAY SO FAR"]
    E1 --> ESUG["Suggestions: buildSuggestions for today<br/>(same-day rows updated, never duplicated)"]
    ESYS1 --> ETXT["Text: 'Good evening, Chris.' …<br/>last line: 'Full report: …?date=…&kind=evening'"]
    ESYS0 --> ETXT
    ENUMS --> ETXT
    EMON --> ETXT
    ESUG --> ETXT
    ETXT --> ESEND["Send or dry-run (see below)<br/>row kind = 'evening'"]
```

## Where the offer and the funnel come from

```mermaid
flowchart LR
    SPEND["ad_metrics_daily (spend)"] -->|ad_id = ad_row_id| SPINE["v_ad_label_spine<br/>ad → creative → script.offer_key"]
    PERSON["client_ad_attribution<br/>(first touch, one row per person)"] -->|ad_id = fundhub_ad_number| SPINE
    PERSON -->|landing_path| MAP["src/funnel/pages.mjs<br/>watch · roadmap · homepage"]
    SPINE -->|no label, or one number with<br/>two different labels| NOL["'No offer label'"]
    MAP -->|no page| NOP["'No landing page'"]
    MAP -->|page not on the map| OTH["'Other page'"]
    CASH["transactions with no person<br/>bookings with no person"] --> ALL["all_offers.not_split<br/>shown once, with its reason"]
```

Spend belongs to an ad and an ad has no funnel, so spend, cost per booked person and return on ad spend are split by offer only. That is the first `not_split` line. Cash uses the same "paid" statuses as the company cash number (`src/dashboard/kpis.mjs`).

## Send, save, read (both kinds)

```mermaid
flowchart TD
    IN["Built brief (morning or evening)"] --> SENT{"Row for this Arizona day<br/>and this kind already 'sent'?"}
    SENT -->|Yes| STOP["Stop. Never text twice."]
    SENT -->|No| LIVE{"MORNING_BRIEF_LIVE?<br/>(false today)"}
    LIVE -->|false| DRY["delivery_status = dry_run<br/>(or no_number if PULSE_SMS_TO unset)"]
    LIVE -->|true| SMS["Twilio via src/pulse/notify.mjs<br/>to PULSE_SMS_TO"]
    SMS -->|accepted| S1["delivery_status = sent, sent_at set"]
    SMS -->|refused| S2["delivery_status = failed"]
    DRY --> ROW[("morning_briefs<br/>one row per org per Arizona day per kind<br/>(433: unique org, day, kind)")]
    S1 --> ROW
    S2 --> ROW
    ROW --> READ["GET /api/read/morning-brief?date=&kind=morning|evening<br/>answers { date, kind, brief }<br/>no kind = morning · bad kind 400 · none 404<br/>owner/admin only, org from session"]
    READ --> PAGE["Report page /app/morning-brief.html (MB5)<br/>owner/admin only (shell OWNER_ADMIN_ONLY + ROLE_SETS.OPS)<br/>date picker, default today in Arizona<br/>Morning / Evening switch sends kind="]
    PAGE --> P1{"Answer"}
    P1 -->|200, row kind matches| P2["Six parts in order: Systems (red first),<br/>Marketing (all-offers tiles, offer → funnel table,<br/>not-split lines, dying ads), Money,<br/>Team (closer → offer → funnel), Suggestions, Today"]
    P1 -->|404| P3["'No morning/evening brief was saved for that day.'"]
    P1 -->|row kind differs from the ask| P4["'No evening brief was saved for that day.'<br/>(never paints one kind under the other's label)"]
    P1 -->|401/403| P5["'This report is for owner and admin logins.'"]
```

## States of a `morning_briefs` row (same for each kind)

```mermaid
stateDiagram-v2
    [*] --> dry_run: built while MORNING_BRIEF_LIVE is false
    [*] --> no_number: PULSE_SMS_TO and CHRIS_PULSE_SMS unset
    [*] --> sent: live, Twilio accepted
    [*] --> failed: live, Twilio refused
    dry_run --> dry_run: rerun same day and kind (row updated)
    no_number --> dry_run: rerun after the number is set
    failed --> sent: rerun same day and kind, accepted
    dry_run --> sent: rerun same day and kind, live
    sent --> [*]: final, never rewritten or re-sent
```

The database holds each kind to its greeting: a morning row must start "Good morning, Chris." and an evening row "Good evening, Chris." (`morning_briefs_text_starts_ck`, migration 433).

## What prints a "waiting" line instead of a number

| Part | Why |
|---|---|
| Marketing dashboard link | Not built yet |
| Money per company (Fundhub LLC, Fundhub Credit Solutions, FH Consulting) | Nothing records which bank account is which company |
| Ad money left on the credit line | No source in the repo |
| Funding advisor files per person | Nothing links a funding round to an advisor |
| "Today" | No source yet |

## Gaps (found, not fixed)

- When the brief is live and the brief step fails, the pulse text is already suppressed, so Chris gets no morning text that day. The pulse result is still stored.
- The company 8 numbers (cash collected, files funded) are always the last 24 hours, even in the evening. The text says "Last 24 hours" for those, not "today so far".
- A morning run whose pulse was a dry run carries the scorecard in the brief, but the scorecard is not saved to `pulse_scorecards` (MB2 saves on live runs only). That evening then says no check is stored.
- Offer comes from the first of the marketing machine's three lead → offer rules only (the ad's script label). The other two (campaign mapping, landing page → offer) have no table yet, so those people show under "No offer label".
