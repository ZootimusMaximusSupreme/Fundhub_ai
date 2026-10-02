# Full end-to-end comms prove — 2026-09-19

**Result:** **98/98 mapped. Zero PENDING.**  
**Counts:** WORKING **40** · NOT WORKING **0** · BLOCKED **58**  
**Launch-ready:** **No** — 0 keys are not working and 58 remain blocked.  
**Matrix refreshed:** `2026-09-19T05:12:39.418Z` ([comms-matrix.json](launch-prove-2026-09-19-evidence/comms-matrix.json))

## Tonight max prove (~2026-09-19 05:12 UTC)

**Script:** `scripts/tmp/comms-run-all-2026-09-19.mjs` · **Overall:** `PARTIAL_S00_PASS_S04_BLOCKED`  
**Evidence:** [comms-run-all-2026-09-19.json](launch-prove-2026-09-19-evidence/comms-run-all-2026-09-19.json) · [blockers](launch-prove-2026-09-19-evidence/comms-run-all-blockers.json) · [7well9 Gmail + order](launch-prove-2026-09-19-evidence/lane-f/gmail-7well9-2026-09-19.json)

| Outcome | Detail |
|---|---|
| **New fresh PASS (order + timing)** | On sim **7well9** (`fe619d14-d7d5-4d87-ba59-c28ca4fe249c`): `entry.captured` → ~4m → `EMAIL-S00-WELCOME` + `SMS-S00-WELCOME` both **delivered**; Gmail All Mail shows welcome subject at 04:45:12 UTC. |
| **Re-run during prove** | Live `survey.submitted` on same client at 05:00:16 UTC (no duplicate S00 spam in DB). |
| **Still blocked (env)** | ClickFunnels webhook: **401 `bad_signature`** (local CF secret masked len 20; dev context len 84 still rejects on live). No `booking.created` → post-book S04 / nobook chase on this sim not fired tonight. |
| **Still blocked (Apply)** | Oxylabs launch on funding sim eight: **422 `oxylabs_auth_failed`** (production creds masked in CLI). |
| **Scorecard shift (not new sends)** | `EMAIL-DOC-02-REQUEST-MORE` and `SMS-PARTNER-WELCOME` moved **NOT WORKING → BLOCKED** on the *delivered* bar. **Product:** migration **371** + `doc-check.mjs` / `welcome.mjs` on branch — merge/deploy; then prove on next `request_more` / partner sweeper. |

**Post-book keys still blocked on 7well9 after survey:** `SMS-S04-01-CONFIRM`, `EMAIL-S04-01-CONFIRM`, `SMS-S04-02-REMIND-24H`, `SMS-S04-03-REMIND-2H`, `EMAIL-NOBOOK-01`, `SMS-NOBOOK-01` (need CF book or time-delay maturity).

## Rules used

- Sandbox/sample CRS only. No live bureau pull.
- Assume paid. No real card charge.
- No ClickFunnels apply. Plus-tag sims and agent phone `+16616054248` only.
- WORKING requires a delivered `messages` row to a plus-tag sim or the agent phone.
- NOT WORKING means an attempted send failed/blocked, or the live template row is missing.
- BLOCKED means the mapped branch was not safely reachable in this prove window.
- Fresh S04 **rebook ~05:22Z:** CF secret from gitignored `.env` (len 84) verifies on live; `booking.created` on `7well9`; **EMAIL-S04-01-CONFIRM** still never queued; SMS confirm **queued** not delivered — [rebook-agent-2026-09-19.json](launch-prove-2026-09-19-evidence/lane-f/rebook-agent-2026-09-19.json).
- Gmail All Mail was searched with `in:anywhere`; the fresh welcome was observed. Evidence: [lane-f/gmail.json](launch-prove-2026-09-19-evidence/lane-f/gmail.json).

## Five horsemen

| Scenario | Client | Events | Template messages | Sample CRS rows | Businesses |
|---|---|---:|---:|---:|---:|
| Combo | `567c12ce-64de-4043-aa98-d842434bd267` | 22 | 11 | 1 | 2 |
| Inquiry | `7ccbeb76-df98-4125-8c14-0d1c9f5e3042` | 28 | 4 | 1 | 0 |
| Repair | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 104 | 30 | 4 | 0 |
| Funding | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 120 | 41 | 1 | 1 |
| Course | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | 38 | 18 | 1 | 0 |

The five files show event-path activity in production data. Existing delivered provider rows were reused to avoid duplicate client sends. No product code or copy was changed.

## Oxylabs Apply

**FAIL** — live Apply returned `oxylabs_auth_failed`. Evidence: [lane-a](launch-prove-2026-09-19-evidence/lane-a/).

## Master scorecard

| template_key | status | trigger event | sim client_id | observed_at | evidence |
|---|---|---|---|---|---|
| `CONTRACT-REMIND-EMAIL` | **BLOCKED** | contract.sent / contract reminder sweep | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#CONTRACT-REMIND-EMAIL) |
| `CONTRACT-SEND-EMAIL` | **WORKING** | contract.sent / contract reminder sweep | `22103bca-0ec9-4491-bb75-5d1b6528f116` | 2026-09-17T18:53:43.049Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#CONTRACT-SEND-EMAIL) |
| `EMAIL-AR-01-FIRST-NOTICE` | **WORKING** | round.funded → success-fee invoice | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:58:37.907Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-AR-01-FIRST-NOTICE) |
| `EMAIL-AR-02-REMINDER` | **BLOCKED** | AR collections +7d / +14d | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-AR-02-REMINDER) |
| `EMAIL-AR-03-FINAL-NOTICE` | **BLOCKED** | AR collections +7d / +14d | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-AR-03-FINAL-NOTICE) |
| `EMAIL-AX07-FUNDING-PAUSED` | **BLOCKED** | funding snapshot negative rule | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-AX07-FUNDING-PAUSED) |
| `EMAIL-C06-DECLINE` | **BLOCKED** | analysis.completed decline branch | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-C06-DECLINE) |
| `EMAIL-DOC-01-REQUEST` | **WORKING** | deposit.paid | `0dd8892c-6f1c-4fd5-84e4-4dc1b992b3d0` | 2026-09-18T20:05:37.044Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-DOC-01-REQUEST) |
| `EMAIL-DOC-02-REQUEST-MORE` | **BLOCKED** | docs.received doc-check result | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-DOC-02-REQUEST-MORE) |
| `EMAIL-DOC-03-APPROVED` | **WORKING** | docs.received doc-check result | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-18T17:20:49.073Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-DOC-03-APPROVED) |
| `EMAIL-DPC05-NO-PROGRESS-72H` | **BLOCKED** | booking.created +72h no progress | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-DPC05-NO-PROGRESS-72H) |
| `EMAIL-DS01-REPAIR-REFERRAL` | **BLOCKED** | call.completed repair referral branch | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-DS01-REPAIR-REFERRAL) |
| `EMAIL-DS02-DIY-LETTERS-READY` | **BLOCKED** | payment.received DIY letters branch | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-DS02-DIY-LETTERS-READY) |
| `EMAIL-F02-ID-PORTAL-NEEDED` | **WORKING** | round.started with missing portal ID | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | 2026-09-18T18:20:21.027Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-F02-ID-PORTAL-NEEDED) |
| `EMAIL-F02-ID-PORTAL-NEEDED-FOLLOWUP` | **BLOCKED** | round.started with missing portal ID | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-F02-ID-PORTAL-NEEDED-FOLLOWUP) |
| `EMAIL-F03-ROUND-SUBMITTED` | **WORKING** | round.submitted | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:11:35.605Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-F03-ROUND-SUBMITTED) |
| `EMAIL-F04-ROUND-APPROVALS` | **BLOCKED** | round.approved | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-F04-ROUND-APPROVALS) |
| `EMAIL-F06-MISSING-DOCS` | **BLOCKED** | mail.response / docs.received missing conditions | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-F06-MISSING-DOCS) |
| `EMAIL-F07-FUNDING-LOCKED` | **WORKING** | round.funded | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:58:28.550Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-F07-FUNDING-LOCKED) |
| `EMAIL-F10-INBOX-SETUP` | **BLOCKED** | round.started funding inbox setup | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-F10-INBOX-SETUP) |
| `EMAIL-N01-COLD-NURTURE` | **BLOCKED** | retired: no registered event trigger | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-N01-COLD-NURTURE) |
| `EMAIL-N02-WARM-NURTURE` | **BLOCKED** | temperature.warm gate | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-N02-WARM-NURTURE) |
| `EMAIL-N03-HOT-NURTURE` | **BLOCKED** | temperature.hot gate | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-N03-HOT-NURTURE) |
| `EMAIL-N04-POST-FUNDING` | **BLOCKED** | round.funded / round.closeout | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-N04-POST-FUNDING) |
| `EMAIL-N06-RENEWAL` | **BLOCKED** | round.funded delayed renewal | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-N06-RENEWAL) |
| `EMAIL-NOBOOK-01` | **WORKING** | survey.submitted with no booking | `1591fd9d-79c7-483a-879b-982e7508e865` | 2026-09-18T22:11:39.969Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-NOBOOK-01) |
| `EMAIL-NOBOOK-02` | **BLOCKED** | survey.submitted with no booking | `7ccbeb76-df98-4125-8c14-0d1c9f5e3042` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-NOBOOK-02) |
| `EMAIL-NOBOOK-03` | **BLOCKED** | survey.submitted with no booking | `7ccbeb76-df98-4125-8c14-0d1c9f5e3042` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-NOBOOK-03) |
| `EMAIL-OFFER-FUNDING-DFY` | **WORKING** | call.completed offer bucket | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T17:48:40.161Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-OFFER-FUNDING-DFY) |
| `EMAIL-OFFER-FUNDING-MASTERY` | **WORKING** | call.completed offer bucket | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | 2026-09-17T17:49:13.310Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-OFFER-FUNDING-MASTERY) |
| `EMAIL-OFFER-NONE` | **BLOCKED** | call.completed offer bucket | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-OFFER-NONE) |
| `EMAIL-OFFER-REPAIR-DFY` | **WORKING** | call.completed offer bucket | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-17T17:48:51.741Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-OFFER-REPAIR-DFY) |
| `EMAIL-OFFER-REPAIR-TRIAL` | **WORKING** | call.completed offer bucket | `22103bca-0ec9-4491-bb75-5d1b6528f116` | 2026-09-17T17:49:10.133Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-OFFER-REPAIR-TRIAL) |
| `EMAIL-OFFER-SOFT-PULL` | **BLOCKED** | call.completed offer bucket | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-OFFER-SOFT-PULL) |
| `EMAIL-OFFER-UWIQ-DELIVERABLES` | **WORKING** | call.completed offer bucket | `029964c5-4d8e-47ed-88c9-53ac13863fd4` | 2026-09-17T17:49:10.652Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-OFFER-UWIQ-DELIVERABLES) |
| `EMAIL-PARTNER-WELCOME` | **WORKING** | partner created / welcome | `567c12ce-64de-4043-aa98-d842434bd267` | 2026-08-27T14:21:43.310Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-PARTNER-WELCOME) |
| `EMAIL-PORTAL-MAGIC-LINK` | **WORKING** | portal magic-link request | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-17T19:54:51.129Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-PORTAL-MAGIC-LINK) |
| `EMAIL-REPAIR-LETTERS-SENT` | **BLOCKED** | repair.letters.sent | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-REPAIR-LETTERS-SENT) |
| `EMAIL-REPAIR-RESPONSE-RESULTS` | **BLOCKED** | repair.response.parsed | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-REPAIR-RESPONSE-RESULTS) |
| `EMAIL-REPAIR-RETAKE-PHOTO` | **BLOCKED** | repair.response.retake | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-REPAIR-RETAKE-PHOTO) |
| `EMAIL-REPAIR-ROUND-ADVANCED` | **BLOCKED** | repair.round.escalated | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-REPAIR-ROUND-ADVANCED) |
| `EMAIL-REPAIR-TRIAL-COMPLETE-UPSELL` | **BLOCKED** | repair.program.complete trial | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-REPAIR-TRIAL-COMPLETE-UPSELL) |
| `EMAIL-REPAIR-WELCOME` | **WORKING** | repair.enrolled | `0dd8892c-6f1c-4fd5-84e4-4dc1b992b3d0` | 2026-09-18T20:05:36.103Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-REPAIR-WELCOME) |
| `EMAIL-S00-WELCOME` | **WORKING** | entry.captured | `d23c8fe5-a44c-44f2-835a-d51f55564023` | 2026-09-19T04:45:11.146Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-S00-WELCOME) |
| `EMAIL-S02-FINISH-APPLICATION` | **WORKING** | entry.captured +20m without survey | `9c97d8a3-e964-4104-b829-958a40c63463` | 2026-09-19T04:48:37.098Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-S02-FINISH-APPLICATION) |
| `EMAIL-S04-01-CONFIRM` | **WORKING** | booking.created | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | 2026-09-17T06:24:14.695Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-S04-01-CONFIRM) |
| `EMAIL-S05A-NOSHOW-02` | **WORKING** | booking.noshow recovery ladder | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-18T17:44:00.761Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-S05A-NOSHOW-02) |
| `EMAIL-S05A-NOSHOW-03` | **WORKING** | booking.noshow recovery ladder | `823c850e-deee-4022-bf80-27ec23f77915` | 2026-09-09T17:11:55.833Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-S05A-NOSHOW-03) |
| `EMAIL-S05A-NOSHOW-04` | **WORKING** | booking.noshow recovery ladder | `97d6dda1-a525-40cf-b1f1-ced2334f133a` | 2026-09-11T18:12:07.287Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-S05A-NOSHOW-04) |
| `EMAIL-S05A-NOSHOW-RECOVERY` | **WORKING** | booking.noshow recovery ladder | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T17:41:07.717Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-S05A-NOSHOW-RECOVERY) |
| `EMAIL-U02-ANALYZER-FUNDING-DELIVERY` | **WORKING** | analysis.completed delivery branch | `567c12ce-64de-4043-aa98-d842434bd267` | 2026-09-18T17:30:56.749Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-U02-ANALYZER-FUNDING-DELIVERY) |
| `EMAIL-U02-ANALYZER-REPAIR-DELIVERY` | **BLOCKED** | analysis.completed delivery branch | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-U02-ANALYZER-REPAIR-DELIVERY) |
| `EMAIL-WAYPOINT-NUDGE-1` | **BLOCKED** | waypoint overdue sweeper | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#EMAIL-WAYPOINT-NUDGE-1) |
| `INVOICE-SENT-EMAIL` | **WORKING** | invoice.sent | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T19:31:23.848Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#INVOICE-SENT-EMAIL) |
| `SMS-AISET03-MSG1` | **BLOCKED** | setter no-answer cadence | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-AISET03-MSG1) |
| `SMS-AISET03-MSG2` | **BLOCKED** | setter no-answer cadence | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-AISET03-MSG2) |
| `SMS-AISET03-MSG3` | **BLOCKED** | setter no-answer cadence | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-AISET03-MSG3) |
| `SMS-AISET04-HANDOFF` | **WORKING** | setter 3-way handoff | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | 2026-09-18T21:47:15.515Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-AISET04-HANDOFF) |
| `SMS-AR-01-FIRST-NOTICE` | **WORKING** | round.funded → success-fee invoice | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:58:38.413Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-AR-01-FIRST-NOTICE) |
| `SMS-AR-02-REMINDER` | **BLOCKED** | AR collections +7d / +14d | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-AR-02-REMINDER) |
| `SMS-AR-03-FINAL-NOTICE` | **BLOCKED** | AR collections +7d / +14d | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-AR-03-FINAL-NOTICE) |
| `SMS-AX07-FUNDING-PAUSED` | **BLOCKED** | funding snapshot negative rule | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-AX07-FUNDING-PAUSED) |
| `SMS-BS01-01-BOOKED` | **BLOCKED** | booking.created precall schedule | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-BS01-01-BOOKED) |
| `SMS-BS01-02-PRECALL` | **BLOCKED** | booking.created precall schedule | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-BS01-02-PRECALL) |
| `SMS-BS01-03-DAYOF` | **BLOCKED** | booking.created precall schedule | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-BS01-03-DAYOF) |
| `SMS-C06-DECLINE` | **BLOCKED** | analysis.completed decline branch | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-C06-DECLINE) |
| `SMS-DOC-01-REQUEST` | **WORKING** | deposit.paid | `029964c5-4d8e-47ed-88c9-53ac13863fd4` | 2026-09-18T15:13:47.692Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-DOC-01-REQUEST) |
| `SMS-DOC-02-REQUEST-MORE` | **WORKING** | docs.received doc-check result | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-18T17:20:57.463Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-DOC-02-REQUEST-MORE) |
| `SMS-DOC-03-APPROVED` | **WORKING** | docs.received doc-check result | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-18T17:20:49.486Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-DOC-03-APPROVED) |
| `SMS-DPC04-RESCHEDULE-REBOOKING` | **BLOCKED** | message.inbound reschedule intent | `7ccbeb76-df98-4125-8c14-0d1c9f5e3042` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-DPC04-RESCHEDULE-REBOOKING) |
| `SMS-DPC05-NO-PROGRESS-72H` | **BLOCKED** | booking.created +72h no progress | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-DPC05-NO-PROGRESS-72H) |
| `SMS-DS01-REPAIR-REFERRAL` | **BLOCKED** | call.completed repair referral branch | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-DS01-REPAIR-REFERRAL) |
| `SMS-F02-ID-PORTAL-NEEDED` | **WORKING** | round.started with missing portal ID | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | 2026-09-18T18:20:59.328Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-F02-ID-PORTAL-NEEDED) |
| `SMS-F03-ROUND-SUBMITTED` | **WORKING** | round.submitted | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:12:08.889Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-F03-ROUND-SUBMITTED) |
| `SMS-F04-ROUND-APPROVALS` | **BLOCKED** | round.approved | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-F04-ROUND-APPROVALS) |
| `SMS-F06-MISSING-DOCS` | **BLOCKED** | mail.response / docs.received missing conditions | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-F06-MISSING-DOCS) |
| `SMS-F07-FUNDING-LOCKED` | **WORKING** | round.funded | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:58:30.751Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-F07-FUNDING-LOCKED) |
| `SMS-F10-INBOX-SETUP` | **BLOCKED** | round.started funding inbox setup | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-F10-INBOX-SETUP) |
| `SMS-N01-COLD-NURTURE` | **BLOCKED** | retired: no registered event trigger | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-N01-COLD-NURTURE) |
| `SMS-N02-WARM-NURTURE` | **BLOCKED** | temperature.warm gate | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-N02-WARM-NURTURE) |
| `SMS-N03-HOT-NURTURE` | **BLOCKED** | temperature.hot gate | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-N03-HOT-NURTURE) |
| `SMS-N04-POST-FUNDING` | **BLOCKED** | round.funded / round.closeout | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-N04-POST-FUNDING) |
| `SMS-N06-RENEWAL` | **BLOCKED** | round.funded delayed renewal | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-N06-RENEWAL) |
| `SMS-NOBOOK-01` | **WORKING** | survey.submitted with no booking | `f18d7fa4-bafe-41cd-bd90-400229b9659e` | 2026-09-19T03:23:53.763Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-NOBOOK-01) |
| `SMS-NOBOOK-02` | **BLOCKED** | survey.submitted with no booking | `7ccbeb76-df98-4125-8c14-0d1c9f5e3042` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-NOBOOK-02) |
| `SMS-NOBOOK-03` | **BLOCKED** | survey.submitted with no booking | `7ccbeb76-df98-4125-8c14-0d1c9f5e3042` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-NOBOOK-03) |
| `SMS-PARTNER-WELCOME` | **BLOCKED** | partner created / welcome | `567c12ce-64de-4043-aa98-d842434bd267` | 2026-08-27T14:21:43.450Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-PARTNER-WELCOME) |
| `SMS-ROUND-STARTED-NOTIFY` | **WORKING** | round.started | `029964c5-4d8e-47ed-88c9-53ac13863fd4` | 2026-09-18T15:13:48.091Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-ROUND-STARTED-NOTIFY) |
| `SMS-S00-WELCOME` | **WORKING** | entry.captured | `d23c8fe5-a44c-44f2-835a-d51f55564023` | 2026-09-19T04:46:54.643Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-S00-WELCOME) |
| `SMS-S04-01-CONFIRM` | **WORKING** | booking.created | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-17T06:23:19.644Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-S04-01-CONFIRM) |
| `SMS-S04-02-REMIND-24H` | **BLOCKED** | booking.created | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-S04-02-REMIND-24H) |
| `SMS-S04-03-REMIND-2H` | **WORKING** | booking.created | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-17T15:32:33.590Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-S04-03-REMIND-2H) |
| `SMS-S05A-NOSHOW-02` | **WORKING** | booking.noshow recovery ladder | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-18T17:44:01.283Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-S05A-NOSHOW-02) |
| `SMS-S05A-NOSHOW-03` | **BLOCKED** | booking.noshow recovery ladder | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-S05A-NOSHOW-03) |
| `SMS-S05A-NOSHOW-04` | **BLOCKED** | booking.noshow recovery ladder | `567c12ce-64de-4043-aa98-d842434bd267` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-S05A-NOSHOW-04) |
| `SMS-S05A-NOSHOW-RECOVERY` | **WORKING** | booking.noshow recovery ladder | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T17:41:08.263Z | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-S05A-NOSHOW-RECOVERY) |
| `SMS-WAYPOINT-DUE` | **BLOCKED** | waypoint overdue sweeper | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-WAYPOINT-DUE) |
| `SMS-WAYPOINT-NUDGE-2` | **BLOCKED** | waypoint overdue sweeper | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | — | [matrix](launch-prove-2026-09-19-evidence/comms-matrix.json#SMS-WAYPOINT-NUDGE-2) |
