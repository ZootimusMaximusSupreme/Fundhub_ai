# Showed or no-show — flow (generated from code, 2026-10-05)

What happens to a booked sales call after its time passes, read from the code in `src/sales/call-outcomes.mjs` (the rule), `src/workflows/dpc-02-call-outcome-enforcement.mjs` (DPC-02 and DPC-02 — Late Show), `src/workflows/s-05a-no-show-recovery.mjs`, `src/handlers/meta-showed-call.mjs`, `src/handlers/comms.mjs`, `src/adapters/clickfunnels.mjs` and `src/adapters/bland.mjs`.

**No intended journey has this step yet.** No `-intended.md` file mentions a booked call, showed, no-show, the no-show texts or any Meta event. `client-intended.md` has no booking step at all.

**Owner-set 2026-10-05 (Chris, K3):**
1. A client showed when a closer logged Deposit, Downsell, Callback or Not a fit for them, at or after the call's booked start. Nothing else counts.
2. A cancelled call is never a no-show. A moved call is checked at its new time.
3. A closer who logs after the 5-minute check undoes the no-show: the card goes back to showed and the remaining no-show texts stop.
4. Meta gets a ShowedCall from the closer's log.

## The rule, in one place

`SHOWED_OUTCOMES` and `closerLoggedShowed()` in `src/sales/call-outcomes.mjs`. DPC-02, S-05A and the Meta ShowedCall all ask it.

| Case | Showed? |
|---|---|
| Closer logged Deposit, Downsell, Callback or Not a fit, at or after the booked start | Yes |
| Closer logged No show | No |
| An AI-setter (Bland) call finished — AI-SET-01's confirm call after the booking | No |
| The call time passed and no closer logged anything | No (nothing records a meeting without a log) |
| A closer log from an older call (before this call's booked start) | No |
| A demo closer log (`call_outcomes.is_demo`) | No |
| The call was moved | Not judged at the old time; judged at the new time |
| The call was cancelled | Never judged; never a no-show |

## A booked call, start to end

```mermaid
flowchart TD
    BOOK["booking.created<br/>(ClickFunnels calendar)"] --> RUN["DPC-02 starts<br/>waits until the booked end + 5 minutes"]
    MOVE["booking.rescheduled"] -->|"same email or booking id:<br/>the old run stops"| STOP1["old run stopped"]
    MOVE --> RUN2["DPC-02 starts again<br/>waits until the NEW end + 5 minutes"]
    CANCEL["booking.cancelled"] -->|"same email or booking id"| STOP2["run stopped<br/>no decision, no no-show texts"]
    RUN --> Q{"closerLoggedShowed:<br/>a closer log of Deposit, Downsell,<br/>Callback or Not a fit at or after<br/>the booked start?"}
    RUN2 --> Q
    Q -->|Yes| SH["call_outcome = showed<br/>last_progress_action = call_held<br/>sales card → showed"]
    Q -->|"No: no log, a closer's No show,<br/>only an AI-setter call, or an older log"| NS["call_outcome = no_show<br/>tag call:no_show<br/>sales card → lost<br/>emit booking.noshow<br/>(key: booking id + booked end)"]
    NS --> B["comms.mjs: bookings.status = noshow"]
    NS --> S5["S-05A no-show recovery<br/>touch 1 now (email + text)"]
    S5 --> W["wait 24h, then 48h, then 96h"]
    W --> C{"before touches 2, 3 and 4:<br/>booked again?<br/>or a closer logged that they showed?"}
    C -->|"booked again"| END1["stop"]
    C -->|"closer logged showed<br/>(reason closer_logged_showed)"| END2["stop"]
    C -->|neither| T["next touch"]
```

## The closer's log

```mermaid
flowchart TD
    LOG["Closer saves a log<br/>api/call-outcomes.mjs or the closer deck<br/>→ call_outcomes row"] --> EV["call.completed<br/>disposition closer, outcome, callOutcomeId"]
    EV --> M{"outcome is Deposit, Downsell,<br/>Callback or Not a fit?"}
    M -->|"No show"| NONE["no ShowedCall, nothing undone"]
    M -->|Yes| META["Meta ShowedCall (src/handlers/meta-showed-call.mjs)<br/>event_id showed.&lt;closer log id&gt;, system_generated<br/>hashed email + phone, external_id, kept fbc / fbp<br/>skips demo clients and company / test emails<br/>result written on the event row as payload.meta<br/>sends only when META_CAPI_ENABLED = 1"]
    M -->|Yes| LATE{"DPC-02 — Late Show:<br/>call_outcome still no_show?"}
    LATE -->|No| NOOP["nothing to undo"]
    LATE -->|Yes| UNDO["call_outcome = showed, call_held<br/>call:no_show tag off"]
    UNDO --> CARD{"sales card on lost?"}
    CARD -->|Yes| BACK["sales card → showed"]
    CARD -->|"No (it moved on)"| KEEP["card stays where it is"]
```

## What is not a signal

- **AI setter (Bland).** `src/adapters/bland.mjs` emits `call.completed` (source `bland`) for every finished robot call, voicemail and no answer included. AI-SET-01 places that call right after the booking to confirm it. It never counts as showed and never reaches Meta.
- **The calendar.** ClickFunnels only ever sends booked, moved or cancelled. `bookings.status` has `completed` in its word list (`src/bookings/store.mjs`), but nothing writes it.

## Limits, as built

- The first no-show text (touch 1) goes at the 5-minute check. A closer log after that stops touches 2 to 4. It cannot unsend touch 1.
- Stopping on a move or a cancel depends on the calendar event carrying the same email or booking id as the booking. That is the same match S-04B's reminders and BS-01's pre-call emails already use.
- One ShowedCall per closer log. A client with two held calls is two ShowedCalls, the way Schedule counts every booking.
- BS-01's pre-call emails ask the same rule with no booked start, so any held closer log for the client stops them.
