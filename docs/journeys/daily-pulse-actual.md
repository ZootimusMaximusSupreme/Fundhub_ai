# daily-pulse — actual

What the code does today. Traced from `src/workflows/daily-pulse.mjs`, `src/pulse/daily-pulse.mjs`, `src/pulse/registry.mjs`, `src/pulse/heartbeats.mjs`, `src/pulse/system-checks.mjs`, `src/pulse/scorecard.mjs`, `src/messaging/providers/pulse-probes.mjs`, `src/pulse/notify.mjs`, `src/workflows/client.mjs`, the six `netlify/functions/*` scheduled functions and `api/read/systems-check.mjs`. Not from the spec.

**There is no `daily-pulse-intended.md`.** Nobody has written the intended version of this journey, so there is nothing hand-signed to compare it against. That gap is a finding, not something this file fills.

This is Recon (AG-07), the one watchdog. It reports. It never fixes, never pulls credit, never charges a card, never mails paper, and never calls the Clarity Data Export.

## Every morning

```mermaid
flowchart TD
    CRON["Inngest cron 0 13 * * * (Recon AG-07)"] --> RUN["runDailyPulse"]
    RUN --> NINE["The first nine checks: health, login, apply door, underwrite door, gate relay, Recon row, unrecorded calls, Gmail"]
    RUN --> REG["Registry: GET every routed page and API route"]
    REG --> REFUSE{"API answered 400/401/403/405?"}
    REFUSE -->|"JSON with ok:false or error"| UP[up]
    REFUSE -->|"anything else (gateway page, Netlify 404, crash)"| DOWN[down]
    RUN --> PAGES["apply.fundhub.ai: /roadmap /roadmap-book /roadmap-thank-you /watch /apply /funding-book-call /thank-you — 200 and the page's own words"]
    RUN --> VSL["fundhub.ai/funnel/*.mp4 — 2-byte range read, video type"]
    RUN --> JOBS["job_heartbeats: newest run per scheduled job (24 Inngest + 6 Netlify)"]
    JOBS --> LATE{"older than 3x its schedule? (monthly: missed the 1st by a day)"}
    LATE -->|yes, or last pass errored| JRED[red]
    LATE -->|no| JGREEN[green]
    LATE -->|"no heartbeats long enough to judge"| JNC[not checked]
    RUN --> MSG["messages: oldest due queued per channel (> 30 min = red), failed in 24 h"]
    RUN --> FE["failed_events: open (pending/exhausted) and new in 24 h"]
    RUN --> MONEY["commas_inbox: newest received_at (> 72 h = red). ClickFunnels orders and ClarityPay: not checked"]
    RUN --> META["events.payload.meta in 24 h: accepted > 0 and errors 0 (off unless META_CAPI_ENABLED=1)"]
    RUN --> OUT["pulse-probes: one read per key, ADAPTERS fence — Twilio, Meta, ClickFunnels, Commas, Plaid, CRS login, Submagic, OpenAI; ClarityPay not checked"]
    RUN --> SITE["Netlify site + last deploy (not checked without NETLIFY_AUTH_TOKEN)"]
    RUN --> MAC["mac-repo: not checked (Mac reporter is plan only)"]
    NINE & UP & DOWN & PAGES & VSL & JRED & JGREEN & JNC & MSG & FE & MONEY & META & OUT & SITE & MAC --> CARD["buildScorecard: green needs proof; skip = not_checked; red gets customer_sees + fix"]
    CARD --> PREV["loadPreviousScorecard: last stored morning"]
    PREV --> REPEAT["same red as last morning keeps since; day_count = days since + 1"]
    REPEAT --> SMS["textChris: 'X green, Y red, Z not checked' to PULSE_SMS_TO"]
    REPEAT --> DARWIN["ticketDarwin (WhatsApp only if DARWIN_WHATSAPP)"]
    REPEAT --> SAVE{"live run?"}
    SAVE -->|yes| ROW["pulse_scorecards: one row per Phoenix date (upsert)"]
    SAVE -->|dry run| NOSAVE[not stored]
    REPEAT --> FILE["pulse-YYYY-MM-DD.md board file (kept only on a laptop; /tmp on the server)"]
    REPEAT --> AGRUN["agent_runs row (live only)"]
```

A check that throws becomes one red row with its message. It does not stop the morning text.

## Every scheduled run (the receipts the morning reads)

```mermaid
flowchart TD
    IC["Any Inngest cron run (event inngest/scheduled.timer)"] --> MW["heartbeat add-on on the one Inngest client"]
    MW -->|finished| HB["INSERT job_heartbeats (runner inngest, ok/error, count if the job said one)"]
    EV["Event-driven Inngest run"] --> NOHB[no heartbeat — no schedule to be late against]
    NF["Netlify scheduled function: staff-message, social-publish, creative-job-runner, hubstaff-poll, ad-video, commas-inbox"] --> HBN["recordHeartbeat (runner netlify)"]
    HB --> T[(job_heartbeats — insert only)]
    HBN --> T
```

A heartbeat that cannot be written is logged and dropped. The job's own work is never failed by it.

## Reading the stored morning

```mermaid
flowchart TD
    GET["GET /api/read/systems-check?date=YYYY-MM-DD"] --> AUTH{"requireAuth, then ROLE_SETS.OPS"}
    AUTH -->|no session| U401[401]
    AUTH -->|not owner/admin| F403[403]
    AUTH -->|ok| DATE{"date given?"}
    DATE -->|not YYYY-MM-DD| B400[400]
    DATE -->|given| ONE["that morning's row"]
    DATE -->|none| NEWEST["newest morning"]
    ONE & NEWEST --> FOUND{row?}
    FOUND -->|no| N404[404]
    FOUND -->|yes| OK["200: date, ran_at, checks[], green/red/not_checked counts"]
```

## Gaps between this and what was asked (spec, "What it misses")

- **No intended journey.** See the top of this file.
- **ClickFunnels order notices are not checked.** No code anywhere handles a ClickFunnels order (`src/adapters/clickfunnels.mjs` maps appointments, forms and surveys). There is no field to read, so none is guessed.
- **ClarityPay is not checked.** No code and no key exist in the repo.
- **Site paused / last deploy** stay not checked until `NETLIFY_AUTH_TOKEN` exists in the site's own environment. This change does not set it.
- **The Mac's repo copy** stays not checked. The reporter is plan only.
- **Outside-service reads sit behind the ADAPTERS fence.** If `ADAPTERS_DRY_RUN` is not explicitly off in production, every probe is shown as not checked, with that reason.
- **The board file is still written.** On the server it lands in `/tmp` and is lost. The database row is the record that is kept.
