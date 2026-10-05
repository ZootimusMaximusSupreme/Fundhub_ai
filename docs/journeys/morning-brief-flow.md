# Morning brief — flow (generated from code, 2026-10-05)

What happens every morning, read from the code in `src/workflows/daily-pulse.mjs`, `src/ops/morning-brief.mjs`, `src/pulse/notify.mjs` and `api/read/morning-brief.mjs`. Board: `ops/workflows/morning-brief-2026-10-05.md` (MB3). Spec: `docs/specs/morning-brief-2026-10-05.md`.

**No intended journey has this step yet.** No `-intended.md` file mentions the morning text or the daily pulse text. Chris has to decide whether this text replaces the pulse text or comes as well. Until he does, the brief is **dry-run**: it is built and saved, and nothing new is texted.

## The run

```mermaid
flowchart TD
    CRON["6:00 a.m. Arizona<br/>cron 0 13 * * * (UTC)"] --> P1["Step 1: run-pulse<br/>Recon AG-07 audit<br/>(unchanged; still sends its own text)"]
    P1 --> P2["Step 2: morning-brief<br/>runMorningBrief({ db, env, pulse })"]
    P2 --> SYS["Systems: pulse result mapped to the<br/>MB2 scorecard contract<br/>PASS/up = green · FAIL/down = red · skip = not_checked<br/>green with no proof = not_checked"]
    P2 --> MKT["Marketing: ad spend yesterday from ad_metrics_daily<br/>rest: 'waiting on the marketing numbers (M5)'"]
    P2 --> MON{"PLAID_ENV = production<br/>and an active plaid_items row?"}
    MON -->|No| MON0["'Money: not connected yet.'"]
    MON -->|Yes| MON1["bank_transactions via src/finance/cashflow.mjs<br/>(same read as Finance OS)"]
    P2 --> TEAM["Team: computePulse(period today) company 8,<br/>call_outcomes per closer last 24 h,<br/>CSM overdue tasks, unrecorded calls"]
    SYS --> TXT["Text: starts 'Good morning, Chris.'"]
    MKT --> TXT
    MON0 --> TXT
    MON1 --> TXT
    TEAM --> TXT
    TXT --> SENT{"Row for this Arizona day<br/>already 'sent'?"}
    SENT -->|Yes| STOP["Stop. Never text twice."]
    SENT -->|No| LIVE{"MORNING_BRIEF_LIVE?<br/>(false today)"}
    LIVE -->|false| DRY["delivery_status = dry_run<br/>(or no_number if PULSE_SMS_TO unset)"]
    LIVE -->|true| SMS["Twilio via src/pulse/notify.mjs<br/>to PULSE_SMS_TO"]
    SMS -->|accepted| S1["delivery_status = sent, sent_at set"]
    SMS -->|refused| S2["delivery_status = failed"]
    DRY --> ROW[("morning_briefs<br/>one row per org per Arizona day")]
    S1 --> ROW
    S2 --> ROW
    ROW --> READ["GET /api/read/morning-brief?date=<br/>owner/admin only, org from session"]
    READ --> PAGE["Report page (MB5): UNVERIFIED, not built"]
```

## States of a `morning_briefs` row

```mermaid
stateDiagram-v2
    [*] --> dry_run: built while MORNING_BRIEF_LIVE is false
    [*] --> no_number: PULSE_SMS_TO and CHRIS_PULSE_SMS unset
    [*] --> sent: live, Twilio accepted
    [*] --> failed: live, Twilio refused
    dry_run --> dry_run: rerun same morning (row updated)
    no_number --> dry_run: rerun after the number is set
    failed --> sent: rerun same morning, accepted
    dry_run --> sent: rerun same morning, live
    sent --> [*]: final, never rewritten or re-sent
```

## What prints a "waiting" line instead of a number

| Part | Why |
|---|---|
| Booked calls, shows, sales, return on ad spend, dying ads | Marketing machine M5 is not built. Not rebuilt here. |
| Marketing dashboard link | Not built yet |
| Money per company (Fundhub LLC, Fundhub Credit Solutions, FH Consulting) | Nothing records which bank account is which company |
| Ad money left on the credit line | No source in the repo |
| Funding advisor files per person | Nothing links a funding round to an advisor |
| Suggestions, "Today" | MB4 (waits on Chris's yes to the cadence rules) |
| Report link | MB5 page not built |
| Red check: what the customer sees, since when, day count | MB2 scorecard |
