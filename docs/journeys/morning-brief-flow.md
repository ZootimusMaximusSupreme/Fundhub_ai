# Morning and evening brief — flow (generated from code, 2026-10-05)

What happens every morning and every evening, read from the code in `src/workflows/daily-pulse.mjs`, `src/workflows/evening-brief.mjs`, `src/pulse/daily-pulse.mjs`, `src/ops/morning-brief.mjs`, `src/ops/suggestions.mjs`, `src/pulse/notify.mjs` and `api/read/morning-brief.mjs`. Board: `ops/workflows/morning-brief-2026-10-05.md` (MB3, MB6). Spec: `docs/specs/morning-brief-2026-10-05.md`.

**No intended journey has this step yet.** No `-intended.md` file mentions the morning text, the evening text or the daily pulse text.

**Owner-set 2026-10-05 (Chris):**
1. When the brief goes live it **replaces** the old "Fundhub morning check" pulse text. One text, not two.
2. An **evening brief** at 9:00 p.m. Arizona: "Good evening, Chris." Same sections, same code, for today so far.

Both are **dry-run** today. `MORNING_BRIEF_LIVE` is false. Both briefs are built and saved. Nothing new is texted. The old pulse text still goes, unchanged.

## The morning run

```mermaid
flowchart TD
    CRON["6:00 a.m. Arizona<br/>cron 0 13 * * * (UTC)"] --> LIVEQ{"MORNING_BRIEF_LIVE?<br/>(false today)"}
    LIVEQ -->|false| P1A["Step 1: run-pulse<br/>Recon AG-07 audit<br/>sends its own 'Fundhub morning check' text<br/>(same as before)"]
    LIVEQ -->|true| P1B["Step 1: run-pulse<br/>Recon AG-07 audit, stores scorecard + agent_runs<br/>sendPulseText: false — no text of its own<br/>(sms.reason = replaced_by_morning_brief)"]
    P1A --> P2["Step 2: morning-brief<br/>runMorningBrief({ kind: 'morning', pulse, live })"]
    P1B --> P2
    P2 --> SYS["Systems: pulse result mapped to the<br/>MB2 scorecard contract<br/>PASS/up = green · FAIL/down = red · skip = not_checked<br/>green with no proof = not_checked"]
    P2 --> MKT["Marketing: ad spend YESTERDAY from ad_metrics_daily<br/>rest: 'waiting on the marketing numbers (M5)'"]
    P2 --> MON{"PLAID_ENV = production<br/>and an active plaid_items row?"}
    MON -->|No| MON0["'Money: not connected yet.'"]
    MON -->|Yes| MON1["Money posted YESTERDAY + month to date<br/>bank_transactions via src/finance/cashflow.mjs"]
    P2 --> TEAM["Team, LAST 24 HOURS: call_outcomes per closer,<br/>CSM overdue tasks, unrecorded calls;<br/>company 8 from computePulse (last 24 hours)"]
    P2 --> SUG["Suggestions: buildSuggestions (MB4)<br/>top 3 into the report, 1 into the text<br/>any failure → 'Suggestions: none today.'"]
    SYS --> TXT["Text: starts 'Good morning, Chris.'"]
    MKT --> TXT
    MON0 --> TXT
    MON1 --> TXT
    TEAM --> TXT
    SUG --> TXT
    TXT --> SEND["Send or dry-run (see below)<br/>row kind = 'morning'"]
```

## The evening run

```mermaid
flowchart TD
    ECRON["9:00 p.m. Arizona<br/>cron 0 4 * * * (UTC)<br/>EVENING_BRIEF_CRON — one line to change"] --> E1["evening-brief job<br/>runMorningBrief({ kind: 'evening', live })<br/>never runs the pulse"]
    E1 --> ESYS{"Today's morning_briefs row<br/>(kind 'morning') has a stored scorecard?"}
    ESYS -->|Yes| ESYS1["'Systems, from this morning's check at 6:00 AM: …'"]
    ESYS -->|No| ESYS0["'Systems: no morning check is stored for today,<br/>so nothing has been checked since last night.'"]
    E1 --> EMKT["Ad spend TODAY SO FAR (Arizona date)"]
    E1 --> EMON["Money: same switch; money posted TODAY SO FAR"]
    E1 --> ETEAM["Team, TODAY SO FAR (since Arizona midnight):<br/>calls held, no-shows.<br/>'Last 24 hours: N files funded' (company 8 window)"]
    E1 --> ESUG["Suggestions: buildSuggestions for today<br/>(same-day rows updated, never duplicated)"]
    ESYS1 --> ETXT["Text: starts 'Good evening, Chris.'"]
    ESYS0 --> ETXT
    EMKT --> ETXT
    EMON --> ETXT
    ETEAM --> ETXT
    ESUG --> ETXT
    ETXT --> ESEND["Send or dry-run (see below)<br/>row kind = 'evening'"]
```

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
    ROW --> READ["GET /api/read/morning-brief?date=&kind=morning|evening<br/>no kind = morning · bad kind 400 · none 404<br/>owner/admin only, org from session"]
    READ --> PAGE["Report page (MB5): UNVERIFIED, not on main"]
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
| Booked calls, shows, sales, return on ad spend, dying ads | Marketing machine M5 is not built. Not rebuilt here. |
| Marketing dashboard link | Not built yet |
| Money per company (Fundhub LLC, Fundhub Credit Solutions, FH Consulting) | Nothing records which bank account is which company |
| Ad money left on the credit line | No source in the repo |
| Funding advisor files per person | Nothing links a funding round to an advisor |
| "Today" | No source yet |
| Report link | MB5 page not on main |
| Red check: what the customer sees, since when, day count | MB2 scorecard |
| Evening systems | Reads the morning's stored check; MB2's own stored scorecard is not on main yet |

## Gaps (found, not fixed)

- When the brief is live and the brief step fails, the pulse text is already suppressed, so Chris gets no morning text that day. The pulse result is still stored.
- The company 8 numbers (cash collected, files funded) are always the last 24 hours, even in the evening. The evening text says "Last 24 hours" for those, not "today so far".
