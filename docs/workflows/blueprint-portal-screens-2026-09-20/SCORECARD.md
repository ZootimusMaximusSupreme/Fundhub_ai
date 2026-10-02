# Capital Blueprint portal screens — 2026-09-20

Sim: Eleven-Blueprint `029964c5-4d8e-47ed-88c9-53ac13863fd4`  
Portal: https://fundhub.ai/app/client-portal.html  
Progress: https://fundhub.ai/progress.html  
Assume paid. Sample credit file (not a live bureau pull). No card charge. No PostGrid.

## PASS / FAIL

| Item | Result |
|---|---|
| Chris can see dashboards with file data | **PASS** |
| Scores on portal + progress | **PASS** — Experian 771, Equifax 778, TransUnion 766 |
| Businesses | **PASS** — Holdings LLC Intelliscore 76, Ops LLC 64 |
| UnderwriteIQ / snapshot docs | **PASS** — Roadmap + Funding Snapshot downloadable. Capital Blueprint tile unlocked. |
| Prequal number | **PASS** — $212,000 |
| Waypoints = fundability engine, not 5 generic repair rows | **PASS as catalog** / **not an optimizer** (see below) |
| Accountability AI texts client | **HOOK PASS, SEND FAIL** — `SMS-WAYPOINT-DUE` queued to agent phone; Twilio 401 from this laptop |
| App Store push | **not built** — not faked |
| CSM escalate if struggling | **path exists** — nudge step 4 opens a CSM task; this sim already has open CSM task “Accountability call — halfway check-in” |

## PNG paths

All under `docs/workflows/blueprint-portal-screens-2026-09-20/`:

- `01-portal-dashboard.png` + `-click2.png` + `-MARKED.png` — first fold (video + dispute sign). Scores are below.
- `02-portal-scores.png` + `-MARKED.png` — scores + $212,000 pre-qual
- `02-portal-docs-own-list.png` + `-MARKED.png` — Roadmap + Funding Snapshot ready; Metro 2 pack not ready
- `03-blueprint-tile.png` — Capital Blueprint unlocked, five included items
- `04-progress-overview.png` + `-full.png` + `-click2.png` + `-MARKED.png` — scores, two businesses, next action
- `05-progress-waypoints.png` + `-MARKED.png` — fundability checklist
- `06-progress-business-toggle.png` — Holdings / Ops tabs
- `07-portal-chat.png` + `-MARKED.png` — staff chat, not AI coach

## What is on screen

Portal (as Sim Eleven-Blueprint):
- Greeting: Welcome back, Sim
- Signed Funding Agreement
- Funding file open, pre-qualified $212,000
- Scores 771 / 778 / 766 and Experian business 64 (portal shows one business number)
- What you own: Credit Optimization Roadmap, Funding Snapshot (download). Metro 2 letter pack: not ready yet
- Capital Blueprint tile: Unlocked / included. Mini-course list: analysis report, letter pack, roadmap, funding snapshot, lender list

Progress:
- In progress, waiting on you
- Same three bureau scores, pulled 17 Sep 2026
- Two businesses, toggle; Holdings 76 (no business PDF)
- Next: Do not open new credit
- Checklist: no new credit, personal loan (overdue), file LLC, get EIN, open business checking
- Documents list includes Roadmap, lender list, Funding Snapshot, Credit Analysis Report, letters, Capital Readiness Summary

## Waypoints truth

There **is** a fundability waypoint engine (`src/waypoints/seed.mjs` + `waypoint_definitions`).

It is **not** “whatever gets them to max fundability as fast as possible.” It is a **catalog of 6 definition types** from the Credit Optimization Roadmap:

1. Pay each revolving card down to 10% of limit (one row per card; skipped here because Chase/Amex/Cap One are already at target)
2. Do not open new credit
3. Talk to your advisor about a personal loan
4. File your LLC
5. Get your EIN
6. Open a business checking account

Count is **not hardcoded to 5**. This sim shows 5 because the 3 paydowns were skipped. A high-use file would add paydown rows.

No new 20-step UI was built (Grok does not add displays).

## Accountability truth

- No live agent named “accountability.” Live agents: AG-04 voice, AG-09 voice, AG-07 Recon, DOC-CHECK, OP-06.
- Existing backend: `waypoint-nudge-sweeper` → SMS due, email, second SMS, then **CSM staff task** (no fourth client text). Templates are live and approved.
- Portal chat is **message staff**, not an AI coach. App Store push does not exist.
- This pass queued `SMS-WAYPOINT-DUE` to the agent prove phone only. Local Twilio returned 401 (invalid username). Message stayed queued.
- CSM path exists. This file already has an open CSM task: Accountability call — halfway check-in (`customer-insights-mid`).
