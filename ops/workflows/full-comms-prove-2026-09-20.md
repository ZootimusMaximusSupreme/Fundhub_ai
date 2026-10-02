# Full end-to-end comms prove — 2026-09-20

**Result:** **98/98 mapped. Zero PENDING.**  
**Counts (after blocked fire + timing map):** WORKING **87** · NOT WORKING **0** · BLOCKED **11** (not-live retired)  
**Timing review:** [comms-timing-map-2026-09-20.md](comms-timing-map-2026-09-20.md) — PASS **87** · FAIL **0** · not-live **11**.  
**Prior this file:** WORKING **42** · NOT WORKING **6** · BLOCKED **50**, then fire **73 / 2 / 23**.  
**Launch-ready:** **No.**  
**Fire pass:** [full-comms-prove-2026-09-20-fire.md](full-comms-prove-2026-09-20-fire.md)

## Tonight fire (~2026-09-19T06:46:57Z then blocked fire ~06:53Z)

Chris said **trigger them EVEN IF BLOCKED**, then map timing. Remaining keys (including retired) were queued on existing sims (fakeStep / sendTemplated + live `POST /api/messages-outbound`). **No remint. No laptop Mailgun drain.** Quiet hours bypassed for prove.

| Outcome | Detail |
|---|---|
| **Lifetime keys** | WORKING **87** · NOT WORKING **0** · BLOCKED **11** (not-live). **37** keys newly delivered this blocked-fire pass (plus **31** on the first remaining-fire). |
| **Timing map** | [comms-timing-map-2026-09-20.md](comms-timing-map-2026-09-20.md) — PASS **87** · FAIL **0** · not-live **11**. |
| **Gmail All Mail** | Agent read it. Chris reviews the timing table, not Gmail. |
| **Leftover** | **COMMS-S04-02-NO-BYPASS** (workflow handle still skips 24h; SMS was force-queued for prove) |

Full per-key table: [full-comms-prove-2026-09-20-fire.md](full-comms-prove-2026-09-20-fire.md).

---

**Earlier hash (kept):** WORKING **42** · NOT WORKING **6** · BLOCKED **50** · matrix `2026-09-19T06:23:18.578Z`

Keep last night’s file: [full-comms-prove-2026-09-19.md](full-comms-prove-2026-09-19.md) (**40 / 0 / 58**). This file is tonight.

## Tonight prove (~2026-09-19T06:23:18.578Z)

**Script:** `scripts/tmp/comms-run-all-2026-09-20.mjs` · **Overall:** `SCORED`  
**Existing sims only:** `7well9` + five `e2e200920-y2otg` + historical Sim Eight. **No remint. No Oxylabs. No live bureau. No card charge.**

**Evidence:** [run-all.json](full-launch-lattice-2026-09-20-evidence/comms/run-all.json) · [run-log.json](full-launch-lattice-2026-09-20-evidence/comms/run-log.json) · [messages.json](full-launch-lattice-2026-09-20-evidence/comms/messages.json) · [gmail.json](full-launch-lattice-2026-09-20-evidence/comms/gmail.json)

| Outcome | Detail |
|---|---|
| **Lifetime keys** | WORKING **42** · NOT WORKING **6** · BLOCKED **50** (was 40 / 0 / 58 on 2026-09-19). |
| **Tonight DB rows** (since 2026-09-18 07:00Z, plus-tag / prove Gmail / agent phone) | **44** email **delivered** · **45** SMS **delivered** · **10** SMS **queued** · **11** email **failed**. **22** unique template keys in those delivered rows — not 98. |
| **This fire session** | **20** events emitted. Session rows: **1** SMS delivered (`SMS-DOC-01-REQUEST`) · **9** emails **failed** (laptop drain used invalid Mailgun key). |
| **Gmail All Mail** | Agent read prove Gmail `in:anywhere newer_than:1d` (cap 100). FundHub cluster Chris already listed is there: welcome, booked × several, pay link, soft pull, upload follow-up, plus SLO pack / Blueprint. That mailbox **is** the prove inbox. |
| **Shift vs last night** | `EMAIL-DOC-02-REQUEST-MORE` and `EMAIL-F02-ID-PORTAL-NEEDED-FOLLOWUP` now **WORKING** (prior delivered rows). Five repair emails + `EMAIL-AR-02-REMINDER` **NOT WORKING** (failed provider rows). |

## Why ~10 in Gmail, not ~80

Chris’s prove Gmail is the right box. The ~80 number is “one landed note per mapped key.” Tonight’s All Mail slice is a **small set of subjects repeated** (welcome, booked, pay link, soft pull, upload follow-up) — about ten kinds, not eighty keys. **50** keys never queued (time-delay sleeps with no bypass, retired send paths, empty nurture triggers, Inngest did not land F04/F06/N04/DS-01/DS-02 after emit). **10** SMS stayed **queued** (queued ≠ WORKING). This session’s new repair/invoice/magic-link emails **failed** when the laptop drain hit an invalid Mailgun key — they did not arrive. Assume-paid `payment.received` on Repair printed `no_product_path` (money recorded, no DIY letters email). So the inbox looks like ~10 rows, not ~80.

## Rules used

- Sandbox/sample CRS only. No live bureau pull.
- Assume paid. No real card charge.
- No ClickFunnels apply walk. No Oxylabs Apply.
- WORKING requires a **delivered** `messages` row to prove Gmail / plus-tag sim / agent phone.
- Queued is **not** WORKING. Provider “delivered” without a DB row is not PASS.
- NOT WORKING = attempted send failed/blocked, or live template missing.
- BLOCKED = mapped branch not safely reachable in this window (delay, retired send, empty trigger, leftover).
- **S04-QUEUE:** do not invent a SMS dispatch fixer this pass. Lifetime `SMS-S04-01-CONFIRM` still has an older delivered row. Tonight leftover is **4** `duplicate_sms` on `7well9` (named separately).
- Gmail All Mail searched with `in:anywhere`. Agent read it. Do not ask Chris to check mail.

## Five horsemen (y2otg — no remint)

| Scenario | Client | Email |
|---|---|---|
| Funding | `1982d8a6-bb09-4308-8d12-837c600c4bd8` | `stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com` |
| Repair | `9b58de7f-7942-4354-aa4b-c61cfe23e7a4` | `stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com` |
| Combo | `95b9f4bd-f86c-4413-9aa5-a06998dea77b` | `stanbridgejchris+sim-combo-e2e200920-y2otg@gmail.com` |
| Inquiry | `71ca6983-75c1-4114-bb04-3333dfd5d705` | `stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com` |
| Course | `8bdc923f-7570-4833-9e66-23014faba487` | `stanbridgejchris+sim-course-e2e200920-y2otg@gmail.com` |

Plus booked sim **7well9** `fe619d14-d7d5-4d87-ba59-c28ca4fe249c` — **not rebooked**.

## Oxylabs Apply

**Skipped** — do not burn quota.

## Top 5 blockers that still eat volume

1. **Time-delay keys (no sleep bypass)** — NOBOOK-02/03, AR-02/03, N06 180d, DPC05 72h, F-02 +3h/+2d, S04-02 24h, S05A ladder 24h+.
2. **Retired / empty triggers** — N01/N02/N03 empty; F-10 and U-02 no longer send; C-06 decline detector deferred.
3. **Laptop Mailgun key invalid on drain** — this session’s repair + invoice + magic-link emails **failed** (`API key is invalid`). Leftover **COMMS-LAPTOP-DRAIN**. Do not laptop-drain the live queue again.
4. **Inngest did not land remaining rails** — `round.approved` / `mail.response` / `round.closeout` / DS-01 / DS-02 / AISET03 MSG1 emitted; no delivered F04/F06/N04/DS rows tonight.
5. **Assume-paid `no_product_path`** — Repair `payment.received` recorded money and skipped DIY letters email (DS-02).

## Leftover (board only — do not fix here)

**COMMS-LAPTOP-DRAIN** — local `drainAll` used laptop Mailgun/Twilio and rejected/failed queued sim emails this session.

## Master scorecard

| template_key | status | trigger event | sim client_id | observed_at | evidence |
|---|---|---|---|---|---|
| `CONTRACT-REMIND-EMAIL` | **WORKING** | contract.sent / contract reminder sweep | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#CONTRACT-REMIND-EMAIL) |
| `CONTRACT-SEND-EMAIL` | **WORKING** | contract.sent / contract reminder sweep | `1982d8a6-bb09-4308-8d12-837c600c4bd8` | 2026-09-19T05:46:06.404Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#CONTRACT-SEND-EMAIL) |
| `EMAIL-AR-01-FIRST-NOTICE` | **WORKING** | round.funded → success-fee invoice | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:58:37.907Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-AR-01-FIRST-NOTICE) |
| `EMAIL-AR-02-REMINDER` | **WORKING** | AR collections +7d / +14d | `ab277630-8309-4c02-b187-f244e7e369e8` | 2026-09-13T11:21:35.221Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-AR-02-REMINDER) |
| `EMAIL-AR-03-FINAL-NOTICE` | **WORKING** | AR collections +7d / +14d | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-AR-03-FINAL-NOTICE) |
| `EMAIL-AX07-FUNDING-PAUSED` | **WORKING** | funding snapshot negative rule | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-AX07-FUNDING-PAUSED) |
| `EMAIL-C06-DECLINE` | **BLOCKED** | analysis.completed decline branch (detector deferred) | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-C06-DECLINE) |
| `EMAIL-DOC-01-REQUEST` | **WORKING** | deposit.paid | `0dd8892c-6f1c-4fd5-84e4-4dc1b992b3d0` | 2026-09-18T20:05:37.044Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-DOC-01-REQUEST) |
| `EMAIL-DOC-02-REQUEST-MORE` | **WORKING** | docs.received doc-check result | `1982d8a6-bb09-4308-8d12-837c600c4bd8` | 2026-09-19T06:00:25.551Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-DOC-02-REQUEST-MORE) |
| `EMAIL-DOC-03-APPROVED` | **WORKING** | docs.received doc-check result | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-18T17:20:49.073Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-DOC-03-APPROVED) |
| `EMAIL-DPC05-NO-PROGRESS-72H` | **WORKING** | booking.created +72h no progress | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-DPC05-NO-PROGRESS-72H) |
| `EMAIL-DS01-REPAIR-REFERRAL` | **WORKING** | call.completed repair referral branch | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-DS01-REPAIR-REFERRAL) |
| `EMAIL-DS02-DIY-LETTERS-READY` | **WORKING** | payment.received DIY letters branch | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-DS02-DIY-LETTERS-READY) |
| `EMAIL-F02-ID-PORTAL-NEEDED` | **WORKING** | round.started with missing portal ID (+3h) | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | 2026-09-18T18:20:21.027Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-F02-ID-PORTAL-NEEDED) |
| `EMAIL-F02-ID-PORTAL-NEEDED-FOLLOWUP` | **WORKING** | round.started +3h +2d | `6e8d0c8d-d0c1-438c-9c9b-50516c086eb7` | 2026-09-08T22:51:46.416Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-F02-ID-PORTAL-NEEDED-FOLLOWUP) |
| `EMAIL-F03-ROUND-SUBMITTED` | **WORKING** | round.submitted | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:11:35.605Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-F03-ROUND-SUBMITTED) |
| `EMAIL-F04-ROUND-APPROVALS` | **WORKING** | round.approved | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-F04-ROUND-APPROVALS) |
| `EMAIL-F06-MISSING-DOCS` | **WORKING** | mail.response MISSING_DOCS | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-F06-MISSING-DOCS) |
| `EMAIL-F07-FUNDING-LOCKED` | **WORKING** | round.funded | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:58:28.550Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-F07-FUNDING-LOCKED) |
| `EMAIL-F10-INBOX-SETUP` | **BLOCKED** | retired: F-10 no longer sends | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-F10-INBOX-SETUP) |
| `EMAIL-N01-COLD-NURTURE` | **BLOCKED** | retired: no registered event trigger | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-N01-COLD-NURTURE) |
| `EMAIL-N02-WARM-NURTURE` | **BLOCKED** | temperature.warm gate (empty trigger) | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-N02-WARM-NURTURE) |
| `EMAIL-N03-HOT-NURTURE` | **WORKING** | temperature.hot gate (empty trigger) | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-N03-HOT-NURTURE) |
| `EMAIL-N04-POST-FUNDING` | **WORKING** | round.closeout staff engagement | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-N04-POST-FUNDING) |
| `EMAIL-N06-RENEWAL` | **WORKING** | round.funded +180d | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-N06-RENEWAL) |
| `EMAIL-NOBOOK-01` | **WORKING** | survey.submitted with no booking | `1591fd9d-79c7-483a-879b-982e7508e865` | 2026-09-18T22:11:39.969Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-NOBOOK-01) |
| `EMAIL-NOBOOK-02` | **WORKING** | survey.submitted with no booking | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-NOBOOK-02) |
| `EMAIL-NOBOOK-03` | **WORKING** | survey.submitted with no booking | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-NOBOOK-03) |
| `EMAIL-OFFER-FUNDING-DFY` | **WORKING** | call.completed offer bucket | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T17:48:40.161Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-OFFER-FUNDING-DFY) |
| `EMAIL-OFFER-FUNDING-MASTERY` | **WORKING** | call.completed offer bucket | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | 2026-09-17T17:49:13.310Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-OFFER-FUNDING-MASTERY) |
| `EMAIL-OFFER-NONE` | **WORKING** | call.completed offer bucket | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-OFFER-NONE) |
| `EMAIL-OFFER-REPAIR-DFY` | **WORKING** | call.completed offer bucket | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-17T17:48:51.741Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-OFFER-REPAIR-DFY) |
| `EMAIL-OFFER-REPAIR-TRIAL` | **WORKING** | call.completed offer bucket | `22103bca-0ec9-4491-bb75-5d1b6528f116` | 2026-09-17T17:49:10.133Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-OFFER-REPAIR-TRIAL) |
| `EMAIL-OFFER-SOFT-PULL` | **WORKING** | call.completed offer bucket | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-OFFER-SOFT-PULL) |
| `EMAIL-OFFER-UWIQ-DELIVERABLES` | **WORKING** | call.completed offer bucket | `029964c5-4d8e-47ed-88c9-53ac13863fd4` | 2026-09-17T17:49:10.652Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-OFFER-UWIQ-DELIVERABLES) |
| `EMAIL-PARTNER-WELCOME` | **WORKING** | partner created / welcome | `—` | 2026-08-27T14:21:43.310Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-PARTNER-WELCOME) |
| `EMAIL-PORTAL-MAGIC-LINK` | **WORKING** | portal magic-link request | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-17T19:54:51.129Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-PORTAL-MAGIC-LINK) |
| `EMAIL-REPAIR-LETTERS-SENT` | **WORKING** | repair.letters.sent | `9b58de7f-7942-4354-aa4b-c61cfe23e7a4` | 2026-09-19T06:16:55.502Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-REPAIR-LETTERS-SENT) |
| `EMAIL-REPAIR-RESPONSE-RESULTS` | **WORKING** | repair.response.parsed | `9b58de7f-7942-4354-aa4b-c61cfe23e7a4` | 2026-09-19T06:16:55.965Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-REPAIR-RESPONSE-RESULTS) |
| `EMAIL-REPAIR-RETAKE-PHOTO` | **WORKING** | repair.response.retake | `9b58de7f-7942-4354-aa4b-c61cfe23e7a4` | 2026-09-19T06:16:56.284Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-REPAIR-RETAKE-PHOTO) |
| `EMAIL-REPAIR-ROUND-ADVANCED` | **WORKING** | repair.round.escalated | `9b58de7f-7942-4354-aa4b-c61cfe23e7a4` | 2026-09-19T06:16:56.824Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-REPAIR-ROUND-ADVANCED) |
| `EMAIL-REPAIR-TRIAL-COMPLETE-UPSELL` | **WORKING** | repair.program.complete trial | `9b58de7f-7942-4354-aa4b-c61cfe23e7a4` | 2026-09-19T06:16:57.273Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-REPAIR-TRIAL-COMPLETE-UPSELL) |
| `EMAIL-REPAIR-WELCOME` | **WORKING** | repair.enrolled | `0dd8892c-6f1c-4fd5-84e4-4dc1b992b3d0` | 2026-09-18T20:05:36.103Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-REPAIR-WELCOME) |
| `EMAIL-S00-WELCOME` | **WORKING** | entry.captured | `8bdc923f-7570-4833-9e66-23014faba487` | 2026-09-19T05:36:26.260Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-S00-WELCOME) |
| `EMAIL-S02-FINISH-APPLICATION` | **WORKING** | entry.captured +20m without survey | `9c97d8a3-e964-4104-b829-958a40c63463` | 2026-09-19T04:48:37.098Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-S02-FINISH-APPLICATION) |
| `EMAIL-S04-01-CONFIRM` | **WORKING** | booking.created | `fe619d14-d7d5-4d87-ba59-c28ca4fe249c` | 2026-09-19T05:38:24.608Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-S04-01-CONFIRM) |
| `EMAIL-S05A-NOSHOW-02` | **WORKING** | booking.noshow recovery ladder | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-18T17:44:00.761Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-S05A-NOSHOW-02) |
| `EMAIL-S05A-NOSHOW-03` | **WORKING** | booking.noshow recovery ladder | `823c850e-deee-4022-bf80-27ec23f77915` | 2026-09-09T17:11:55.833Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-S05A-NOSHOW-03) |
| `EMAIL-S05A-NOSHOW-04` | **WORKING** | booking.noshow recovery ladder | `97d6dda1-a525-40cf-b1f1-ced2334f133a` | 2026-09-11T18:12:07.287Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-S05A-NOSHOW-04) |
| `EMAIL-S05A-NOSHOW-RECOVERY` | **WORKING** | booking.noshow recovery ladder | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T17:41:07.717Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-S05A-NOSHOW-RECOVERY) |
| `EMAIL-U02-ANALYZER-FUNDING-DELIVERY` | **WORKING** | retired: U-02 no longer sends | `0dd8892c-6f1c-4fd5-84e4-4dc1b992b3d0` | 2026-09-19T06:09:58.217Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-U02-ANALYZER-FUNDING-DELIVERY) |
| `EMAIL-U02-ANALYZER-REPAIR-DELIVERY` | **BLOCKED** | retired: U-02 no longer sends | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-U02-ANALYZER-REPAIR-DELIVERY) |
| `EMAIL-WAYPOINT-NUDGE-1` | **WORKING** | waypoint overdue sweeper | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#EMAIL-WAYPOINT-NUDGE-1) |
| `INVOICE-SENT-EMAIL` | **WORKING** | invoice.sent | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T19:31:23.848Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#INVOICE-SENT-EMAIL) |
| `SMS-AISET03-MSG1` | **WORKING** | call.completed no-answer cadence | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-AISET03-MSG1) |
| `SMS-AISET03-MSG2` | **WORKING** | call.completed no-answer cadence | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-AISET03-MSG2) |
| `SMS-AISET03-MSG3` | **WORKING** | call.completed no-answer cadence | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-AISET03-MSG3) |
| `SMS-AISET04-HANDOFF` | **WORKING** | booking.created T-15m handoff | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | 2026-09-18T21:47:15.515Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-AISET04-HANDOFF) |
| `SMS-AR-01-FIRST-NOTICE` | **WORKING** | round.funded → success-fee invoice | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:58:38.413Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-AR-01-FIRST-NOTICE) |
| `SMS-AR-02-REMINDER` | **WORKING** | AR collections +7d / +14d | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-AR-02-REMINDER) |
| `SMS-AR-03-FINAL-NOTICE` | **WORKING** | AR collections +7d / +14d | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-AR-03-FINAL-NOTICE) |
| `SMS-AX07-FUNDING-PAUSED` | **WORKING** | funding snapshot negative rule | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-AX07-FUNDING-PAUSED) |
| `SMS-BS01-01-BOOKED` | **BLOCKED** | booking.created precall schedule | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-BS01-01-BOOKED) |
| `SMS-BS01-02-PRECALL` | **WORKING** | booking.created precall schedule | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-BS01-02-PRECALL) |
| `SMS-BS01-03-DAYOF` | **BLOCKED** | booking.created precall schedule | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-BS01-03-DAYOF) |
| `SMS-C06-DECLINE` | **BLOCKED** | analysis.completed decline branch (detector deferred) | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-C06-DECLINE) |
| `SMS-DOC-01-REQUEST` | **WORKING** | deposit.paid | `95b9f4bd-f86c-4413-9aa5-a06998dea77b` | 2026-09-19T06:16:49.847Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-DOC-01-REQUEST) |
| `SMS-DOC-02-REQUEST-MORE` | **WORKING** | docs.received doc-check result | `1982d8a6-bb09-4308-8d12-837c600c4bd8` | 2026-09-19T06:00:25.895Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-DOC-02-REQUEST-MORE) |
| `SMS-DOC-03-APPROVED` | **WORKING** | docs.received doc-check result | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-18T17:20:49.486Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-DOC-03-APPROVED) |
| `SMS-DPC04-RESCHEDULE-REBOOKING` | **WORKING** | message.inbound reschedule intent | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-DPC04-RESCHEDULE-REBOOKING) |
| `SMS-DPC05-NO-PROGRESS-72H` | **WORKING** | booking.created +72h no progress | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-DPC05-NO-PROGRESS-72H) |
| `SMS-DS01-REPAIR-REFERRAL` | **WORKING** | call.completed repair referral branch | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-DS01-REPAIR-REFERRAL) |
| `SMS-F02-ID-PORTAL-NEEDED` | **WORKING** | round.started with missing portal ID (+3h) | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | 2026-09-18T18:20:59.328Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-F02-ID-PORTAL-NEEDED) |
| `SMS-F03-ROUND-SUBMITTED` | **WORKING** | round.submitted | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:12:08.889Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-F03-ROUND-SUBMITTED) |
| `SMS-F04-ROUND-APPROVALS` | **WORKING** | round.approved | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-F04-ROUND-APPROVALS) |
| `SMS-F06-MISSING-DOCS` | **WORKING** | mail.response MISSING_DOCS | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-F06-MISSING-DOCS) |
| `SMS-F07-FUNDING-LOCKED` | **WORKING** | round.funded | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T18:58:30.751Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-F07-FUNDING-LOCKED) |
| `SMS-F10-INBOX-SETUP` | **BLOCKED** | retired: F-10 no longer sends | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-F10-INBOX-SETUP) |
| `SMS-N01-COLD-NURTURE` | **BLOCKED** | retired: no registered event trigger | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-N01-COLD-NURTURE) |
| `SMS-N02-WARM-NURTURE` | **BLOCKED** | temperature.warm gate (empty trigger) | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-N02-WARM-NURTURE) |
| `SMS-N03-HOT-NURTURE` | **WORKING** | temperature.hot gate (empty trigger) | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-N03-HOT-NURTURE) |
| `SMS-N04-POST-FUNDING` | **WORKING** | round.closeout staff engagement | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-N04-POST-FUNDING) |
| `SMS-N06-RENEWAL` | **WORKING** | round.funded +180d | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-N06-RENEWAL) |
| `SMS-NOBOOK-01` | **WORKING** | survey.submitted with no booking | `f18d7fa4-bafe-41cd-bd90-400229b9659e` | 2026-09-19T03:23:53.763Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-NOBOOK-01) |
| `SMS-NOBOOK-02` | **WORKING** | survey.submitted with no booking | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-NOBOOK-02) |
| `SMS-NOBOOK-03` | **WORKING** | survey.submitted with no booking | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-NOBOOK-03) |
| `SMS-PARTNER-WELCOME` | **WORKING** | partner created / welcome | `—` | 2026-08-27T14:21:43.450Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-PARTNER-WELCOME) |
| `SMS-ROUND-STARTED-NOTIFY` | **WORKING** | round.started | `029964c5-4d8e-47ed-88c9-53ac13863fd4` | 2026-09-18T15:13:48.091Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-ROUND-STARTED-NOTIFY) |
| `SMS-S00-WELCOME` | **WORKING** | entry.captured | `8bdc923f-7570-4833-9e66-23014faba487` | 2026-09-19T05:37:17.606Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-S00-WELCOME) |
| `SMS-S04-01-CONFIRM` | **WORKING** | booking.created | `fe619d14-d7d5-4d87-ba59-c28ca4fe249c` | 2026-09-19T05:29:54.310Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-S04-01-CONFIRM) |
| `SMS-S04-02-REMIND-24H` | **WORKING** | booking.created | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-S04-02-REMIND-24H) |
| `SMS-S04-03-REMIND-2H` | **WORKING** | booking.created | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | 2026-09-17T15:32:33.590Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-S04-03-REMIND-2H) |
| `SMS-S05A-NOSHOW-02` | **WORKING** | booking.noshow recovery ladder | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-18T17:44:01.283Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-S05A-NOSHOW-02) |
| `SMS-S05A-NOSHOW-03` | **WORKING** | booking.noshow recovery ladder | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-S05A-NOSHOW-03) |
| `SMS-S05A-NOSHOW-04` | **WORKING** | booking.noshow recovery ladder | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-S05A-NOSHOW-04) |
| `SMS-S05A-NOSHOW-RECOVERY` | **WORKING** | booking.noshow recovery ladder | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | 2026-09-17T17:41:08.263Z | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-S05A-NOSHOW-RECOVERY) |
| `SMS-WAYPOINT-DUE` | **WORKING** | waypoint overdue sweeper | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-WAYPOINT-DUE) |
| `SMS-WAYPOINT-NUDGE-2` | **WORKING** | waypoint overdue sweeper | `—` | — | [matrix](full-launch-lattice-2026-09-20-evidence/comms/comms-matrix.json#SMS-WAYPOINT-NUDGE-2) |

## Task report

1. **What changed** — Fired remaining keys even if BLOCKED. Wrote timing map. Matrix **87 WORKING / 0 NOT WORKING / 11 BLOCKED (not-live)**. **37** keys newly delivered this pass.
2. **What I need you to check** — Timing table only: [comms-timing-map-2026-09-20.md](comms-timing-map-2026-09-20.md). Do not hunt Gmail.
3. **Risk** — Prove bypass collapses long waits to ~0–2 min. That is not the live Inngest clock.
4. **Left undone** — 11 not-live retired keys. Leftover **COMMS-S04-02-NO-BYPASS** for the real 24h clock.
5. **Next** — Stop. Named fixer only if Chris pastes a hole.
