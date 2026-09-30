# Capital Blueprint — owner decisions still open

**2026-09-29.** Backend and UI v1 shipped. These are not blockers for selling on a call; they block billing automation or hard-coded product rules.

| Decision | Status |
|----------|--------|
| Quiet days before CSM task (coach silence) | **Not set** — nudge ladder uses 9 days **overdue on a waypoint**, different meaning |
| Monthly member fee after 12 months (dollar amount) | **Not set** |
| Which keep Commas title bills monthly member fee | **Not set** |
| Which keep Commas title bills per-letter mailing upsell | **Not set** — do not invent catalog products |
| Credit partner combined approval math rule | **Sum** of primary + partner prequal fields in code today; confirm if that is the business rule |
| Next Funding Sequence date | **Staff-entered** `YYYY-MM-DD` today; no auto recovery formula |
| Monthly soft pull | **Simulated** unless `CRS_ALLOW_LIVE` and `FINANCE_OS_SYSTEM_PULL_LIVE` are both on |
| Live Plaid / bank connect | **Not implemented** — `src/banking/plaid.mjs` is empty seams |

When Chris sets a row, update this file and wire the code that reads it.
