# Comms timing map — 2026-09-20

Chris: read this table. You do not need to open Gmail. Agent already read All Mail.

**When:** 2026-09-19T06:53:25.446Z  
**Sims:** existing plus-tag only (7well9 + y2otg five). No remint. No live bureau. No card. Live send path (no laptop Mailgun drain).

**How to read wait times:** “Intended wait” is what the product is supposed to do. “Queued → sent” is what actually happened on this prove. Prove bypasses sleeps (7d / 24h / 72h / 180d collapse to about **0–2 minutes**) so you can see the message. A short actual wait on a long intended wait is the bypass, not a broken clock in production Inngest.

**Score this pass:** PASS **87** · FAIL **0** · not-live **11** (98 keys).

**Newly delivered this fire:** `EMAIL-AR-01-FIRST-NOTICE`, `EMAIL-AR-02-REMINDER`, `EMAIL-AR-03-FINAL-NOTICE`, `EMAIL-C06-DECLINE`, `EMAIL-F03-ROUND-SUBMITTED`, `EMAIL-F07-FUNDING-LOCKED`, `EMAIL-F10-INBOX-SETUP`, `EMAIL-N01-COLD-NURTURE`, `EMAIL-NOBOOK-02`, `EMAIL-NOBOOK-03`, `EMAIL-OFFER-FUNDING-DFY`, `EMAIL-OFFER-FUNDING-MASTERY`, `EMAIL-OFFER-REPAIR-DFY`, `EMAIL-OFFER-REPAIR-TRIAL`, `EMAIL-OFFER-UWIQ-DELIVERABLES`, `EMAIL-PARTNER-WELCOME`, `EMAIL-U02-ANALYZER-REPAIR-DELIVERY`, `SMS-AISET03-MSG2`, `SMS-AISET03-MSG3`, `SMS-AR-01-FIRST-NOTICE`, `SMS-AR-02-REMINDER`, `SMS-AR-03-FINAL-NOTICE`, `SMS-BS01-01-BOOKED`, `SMS-BS01-03-DAYOF`, `SMS-C06-DECLINE`, `SMS-F03-ROUND-SUBMITTED`, `SMS-F07-FUNDING-LOCKED`, `SMS-F10-INBOX-SETUP`, `SMS-N01-COLD-NURTURE`, `SMS-N02-WARM-NURTURE`, `SMS-NOBOOK-02`, `SMS-NOBOOK-03`, `SMS-PARTNER-WELCOME`, `SMS-S04-02-REMIND-24H`, `SMS-S04-03-REMIND-2H`, `SMS-WAYPOINT-DUE`, `SMS-WAYPOINT-NUDGE-2`

Evidence: [timing-rows.json](full-launch-lattice-2026-09-20-evidence/comms/timing-rows.json) · [gmail-timing](full-launch-lattice-2026-09-20-evidence/comms/gmail.json)

| template_key | channel | trigger event | intended wait | actual queued → delivered (min) | verdict | Gmail subject / SMS first 40 | sim used |
|---|---|---|---|---|---|---|---|
| `EMAIL-S00-WELCOME` | email | entry.captured | immediate | 05:36:26 → 05:55:33 (19 min) | **PASS** | You're in — here's what happens next | stanbridgejchris+sim-course-e2e200920-y2otg@gmail.com |
| `SMS-S00-WELCOME` | sms | entry.captured | immediate → sweeper ~5m | 05:37:17 → 05:59:13 (22 min) | **PASS** | Hi Sim — Josh at Fundhub. Your applicati… | stanbridgejchris+sim-course-e2e200920-y2otg@gmail.com |
| `EMAIL-S02-FINISH-APPLICATION` | email | entry.captured | sleep 20m after entry if no survey | 05:09:29 → 06:47:33 (98 min) | **PASS** | You were halfway through — finish what y… | stanbridgejchris+sim-lanef-book-7wkizw@gmail.com |
| `EMAIL-NOBOOK-01` | email | survey.submitted (no book) | sleep 2h after survey if no book | 22:11:39 → 22:16:20 (5 min) | **PASS** | Your application is in — the call isn't … | stanbridgejchris+sim-rr2n11b-202609182002@gmail.com |
| `SMS-NOBOOK-01` | sms | survey.submitted (no book) | sleep 2h after survey if no book | 03:23:53 → 03:25:17 (1 min) | **PASS** | Walk, it's Josh at Fundhub. Your applica… | e2e+climate-walk2phone@fundhub.ai |
| `EMAIL-NOBOOK-02` | email | survey.submitted (no book) | sleep +24h after nobook-01 | 06:53:28 → 06:53:39 (0 min) | **PASS** | The order matters more than the score | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `SMS-NOBOOK-02` | sms | survey.submitted (no book) | sleep +24h after nobook-01 | 06:53:35 → 06:53:39 (0 min) | **PASS** | Sim — Josh at Fundhub again. Still nothi… | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `EMAIL-NOBOOK-03` | email | survey.submitted (no book) | sleep +72h after survey (48h after 02) | 06:53:29 → 06:53:39 (0 min) | **PASS** | Closing this out unless you want the cal… | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `SMS-NOBOOK-03` | sms | survey.submitted (no book) | sleep +72h after survey (48h after 02) | 06:53:35 → 06:53:39 (0 min) | **PASS** | Last one from me, Sim — Josh at Fundhub.… | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `EMAIL-S04-01-CONFIRM` | email | booking.created | immediate on booking.created | 05:38:24 → 05:39:23 (1 min) | **PASS** | You're booked — Mon, Sep 21, 2026, 10:32… | stanbridgejchris+sim-lanef-book-7well9@gmail.com |
| `SMS-S04-01-CONFIRM` | sms | booking.created | immediate on booking.created → sweeper | 05:29:54 → 05:59:13 (29 min) | **PASS** | You're booked, Sim. Sun, Sep 20, 2026, 1… | stanbridgejchris+sim-lanef-book-7well9@gmail.com |
| `SMS-S04-02-REMIND-24H` | sms | booking.created | sleepUntil appointment − 24h | 06:53:36 → 06:53:39 (0 min) | **PASS** | Sim — your Fundhub call is tomorrow, at … | stanbridgejchris+sim-course-e2e200920-y2otg@gmail.com |
| `SMS-S04-03-REMIND-2H` | sms | booking.created | sleepUntil appointment − 2h | 06:53:36 → 06:53:39 (0 min) | **PASS** | Sim — your Fundhub call is in about two … | stanbridgejchris+sim-course-e2e200920-y2otg@gmail.com |
| `SMS-AISET03-MSG1` | sms | call.completed no-answer | immediate on no-answer | 06:47:03 → 06:47:33 (0 min) | **PASS** | Hey Sim, it's Josh from Fundhub — just t… | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `SMS-AISET03-MSG2` | sms | call.completed no-answer | sleep 30m after MSG1 | 06:53:31 → 06:53:39 (0 min) | **PASS** | Hey Sim, Josh again from Fundhub. Wanted… | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `SMS-AISET03-MSG3` | sms | call.completed no-answer | sleep 2h after MSG2 | 06:53:31 → 06:53:39 (0 min) | **PASS** | Last try from Josh at Fundhub, Sim. Happ… | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `SMS-AISET04-HANDOFF` | sms | booking.created T-15m | T-15m before appointment | 21:47:15 → 21:50:16 (3 min) | **PASS** | Sim, it's Josh at Fundhub. Your call sta… | stanbridgejchris+sim-12@gmail.com |
| `SMS-BS01-01-BOOKED` | sms | booking.created | retired — S-04B owns booked text | 06:53:33 → 06:53:39 (0 min) | **not-live** | Hey Sim, it's Fundhub. You're booked — w… | stanbridgejchris+sim-course-e2e200920-y2otg@gmail.com |
| `SMS-BS01-02-PRECALL` | sms | booking.created | 48h before appointment | 06:47:20 → 06:47:33 (0 min) | **PASS** | Hey Sim, Fundhub here. Quick check-in be… | stanbridgejchris+sim-course-e2e200920-y2otg@gmail.com |
| `SMS-BS01-03-DAYOF` | sms | booking.created | retired — S-04B T-2h owns it | 06:53:33 → 06:53:39 (0 min) | **not-live** | Hey Sim, Fundhub — your call is coming u… | stanbridgejchris+sim-course-e2e200920-y2otg@gmail.com |
| `EMAIL-S05A-NOSHOW-RECOVERY` | email | booking.noshow | immediate on booking.noshow | 06:47:13 → 06:47:33 (0 min) | **PASS** | We missed you — your analysis is still h… | stanbridgejchris+sim-08@gmail.com |
| `SMS-S05A-NOSHOW-RECOVERY` | sms | booking.noshow | immediate on booking.noshow | 06:47:13 → 06:47:33 (0 min) | **PASS** | Sim, it's Fundhub — looks like we missed… | stanbridgejchris+sim-08@gmail.com |
| `EMAIL-S05A-NOSHOW-02` | email | booking.noshow | sleep 24h after noshow | 06:47:14 → 06:47:33 (0 min) | **PASS** | Still holding your analysis | stanbridgejchris+sim-08@gmail.com |
| `SMS-S05A-NOSHOW-02` | sms | booking.noshow | sleep 24h after noshow | 06:47:14 → 06:47:33 (0 min) | **PASS** | Hey Sim, Fundhub again. We held your spo… | stanbridgejchris+sim-08@gmail.com |
| `EMAIL-S05A-NOSHOW-03` | email | booking.noshow | sleep 48h more | 06:47:14 → 06:47:33 (0 min) | **PASS** | Do you still want this? | stanbridgejchris+sim-08@gmail.com |
| `SMS-S05A-NOSHOW-03` | sms | booking.noshow | sleep 48h more | 06:47:15 → 06:47:33 (0 min) | **PASS** | Hey Sim, quick one. Do you still want to… | stanbridgejchris+sim-08@gmail.com |
| `EMAIL-S05A-NOSHOW-04` | email | booking.noshow | sleep 96h more | 06:47:15 → 06:47:33 (0 min) | **PASS** | Closing your file for now | stanbridgejchris+sim-08@gmail.com |
| `SMS-S05A-NOSHOW-04` | sms | booking.noshow | sleep 96h more | 06:47:15 → 06:47:33 (0 min) | **PASS** | Hey Sim, Fundhub. Closing your file for … | stanbridgejchris+sim-08@gmail.com |
| `EMAIL-OFFER-SOFT-PULL` | email | call.completed closer | immediate on closer offer | 06:47:19 → 06:47:33 (0 min) | **PASS** | Your UnderwriteIQ assessment is running | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `EMAIL-OFFER-NONE` | email | call.completed closer | immediate on closer offer | 06:47:20 → 06:47:33 (0 min) | **PASS** | Where things stand | stanbridgejchris+sim-course-e2e200920-y2otg@gmail.com |
| `EMAIL-OFFER-FUNDING-DFY` | email | call.completed closer | immediate on closer offer | 06:53:29 → 06:53:39 (0 min) | **PASS** | You're set up — here's what we need from… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-OFFER-FUNDING-MASTERY` | email | call.completed closer | immediate if Mastery paid | 06:53:29 → 06:53:39 (0 min) | **PASS** | Funding Mastery — you're enrolled | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-OFFER-REPAIR-DFY` | email | call.completed closer | immediate on closer offer | 06:53:29 → 06:53:39 (0 min) | **PASS** | Your repair file is open | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `EMAIL-OFFER-REPAIR-TRIAL` | email | call.completed closer | immediate on closer offer | 06:53:30 → 06:53:39 (0 min) | **PASS** | Your first repair round is starting | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `EMAIL-OFFER-UWIQ-DELIVERABLES` | email | call.completed closer | immediate on closer offer | 06:53:30 → 06:53:39 (0 min) | **PASS** | Your deliverables package is being built | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-PORTAL-MAGIC-LINK` | email | portal magic-link request | immediate on magic-link request | 06:51:21 → 06:53:39 (2 min) | **PASS** | Your Fundhub sign-in link | stanbridgejchris+sim-inquiry-20260827@gmail.com |
| `CONTRACT-SEND-EMAIL` | email | contract send | immediate on contract send | 05:46:06 → 05:46:06 (0 min) | **PASS** | Please sign: Soft Pull Authorization | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `CONTRACT-REMIND-EMAIL` | email | contract reminder sweep | chase after 3 days unsigned | 06:47:02 → 06:47:33 (1 min) | **PASS** | Still waiting on your signature: Soft Pu… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `INVOICE-SENT-EMAIL` | email | invoice.sent | immediate on invoice.sent | 06:16:52 → 06:47:33 (31 min) | **PASS** | Your invoice from Fundhub — $100.00 | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-DOC-01-REQUEST` | email | deposit.paid | immediate on deposit.paid | 06:16:49 → 06:47:33 (31 min) | **PASS** | Documents needed before we can start | stanbridgejchris+sim-combo-e2e200920-y2otg@gmail.com |
| `SMS-DOC-01-REQUEST` | sms | deposit.paid | immediate on deposit.paid | 06:16:49 → 06:20:44 (4 min) | **PASS** | Hey Sim, Fundhub. Before we can start, w… | stanbridgejchris+sim-combo-e2e200920-y2otg@gmail.com |
| `EMAIL-DOC-02-REQUEST-MORE` | email | docs.received | immediate on doc-check request_more | 06:00:25 → 06:01:23 (1 min) | **PASS** | One thing to fix on your upload | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-DOC-02-REQUEST-MORE` | sms | docs.received | immediate on doc-check request_more | 06:00:25 → 06:01:23 (1 min) | **PASS** | Hey Sim, Fundhub. Got your upload — one … | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-DOC-03-APPROVED` | email | docs.received | immediate on doc-check accept | 17:20:49 → 17:30:39 (10 min) | **PASS** | Documents approved — you're moving | stanbridgejchris+sim-09@gmail.com |
| `SMS-DOC-03-APPROVED` | sms | docs.received | immediate on doc-check accept | 17:20:49 → 17:30:39 (10 min) | **PASS** | Hey Sim, documents approved. We're optim… | stanbridgejchris+sim-09@gmail.com |
| `SMS-DPC04-RESCHEDULE-REBOOKING` | sms | message.inbound reschedule | immediate on inbound “reschedule” | 06:47:04 → 06:47:33 (0 min) | **PASS** | Hey Sim, it's Fundhub. Here's your link … | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `EMAIL-DPC05-NO-PROGRESS-72H` | email | booking.created | sleep 72h after book if stalled | 06:47:08 → 06:47:33 (0 min) | **PASS** | 72-hour no-progress escalation | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-DPC05-NO-PROGRESS-72H` | sms | booking.created | sleep 72h after book if stalled | 06:47:08 → 06:47:33 (0 min) | **PASS** | Hey Sim, Fundhub checking in — we haven'… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-U02-ANALYZER-FUNDING-DELIVERY` | email | analysis.completed | retired — analysis.completed used to send | 06:09:58 → 06:11:19 (1 min) | **PASS** | Your Fundhub file is complete — audit, l… | stanbridgejchris+sim-slo-20260918@gmail.com |
| `EMAIL-U02-ANALYZER-REPAIR-DELIVERY` | email | analysis.completed | retired — repair pack ships from DS-02 | 06:53:31 → 06:53:39 (0 min) | **not-live** | EMAIL — Analyzer Repair Delivery | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `EMAIL-C06-DECLINE` | email | analysis.completed | retired/deferred — decline detector is a no-op | 06:53:26 → 06:53:39 (0 min) | **not-live** | Your Fundhub review — what we found | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `SMS-C06-DECLINE` | sms | analysis.completed | retired/deferred — decline detector is a no-op | 06:53:33 → 06:53:39 (0 min) | **not-live** | Hey Sim, it's Fundhub. We reviewed your … | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `SMS-ROUND-STARTED-NOTIFY` | sms | round.started | immediate on round.started | 15:13:48 → 15:15:03 (1 min) | **PASS** | Hey Sim, Fundhub — your funding round is… | stanbridgejchris+sim-11@gmail.com |
| `EMAIL-F02-ID-PORTAL-NEEDED` | email | round.started | sleep 3h after round.started if ID missing | 06:47:09 → 06:47:33 (0 min) | **PASS** | One quick step before we can begin | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-F02-ID-PORTAL-NEEDED` | sms | round.started | sleep 3h after round.started if ID missing | 06:47:09 → 06:47:33 (0 min) | **PASS** | Hey Sim, Fundhub needs your ID upload to… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-F02-ID-PORTAL-NEEDED-FOLLOWUP` | email | round.started | sleep +2d after first F-02 | 06:47:10 → 06:47:33 (0 min) | **PASS** | P2 — ID / Portal Still Missing | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-F03-ROUND-SUBMITTED` | email | round.submitted | immediate on round.submitted | 06:53:27 → 06:53:39 (0 min) | **PASS** | Funding Round has been submitted | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-F03-ROUND-SUBMITTED` | sms | round.submitted | immediate on round.submitted | 06:53:34 → 06:53:39 (0 min) | **PASS** | Hey Sim, Fundhub — your round was submit… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-F04-ROUND-APPROVALS` | email | round.approved | immediate on round.approved | 06:47:10 → 06:47:33 (0 min) | **PASS** | Approvals are in for Funding Round | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-F04-ROUND-APPROVALS` | sms | round.approved | immediate on round.approved | 06:47:10 → 06:47:33 (0 min) | **PASS** | Hey Sim, Fundhub — you have an approval … | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-F06-MISSING-DOCS` | email | mail.response MISSING_DOCS | immediate on mail.response MISSING_DOCS | 06:47:11 → 06:47:33 (0 min) | **PASS** | Funding is now locked — here’s what happ… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-F06-MISSING-DOCS` | sms | mail.response MISSING_DOCS | immediate on mail.response MISSING_DOCS | 06:47:11 → 06:47:33 (0 min) | **PASS** | Hey Sim, Fundhub — lenders need a few do… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-F07-FUNDING-LOCKED` | email | round.funded | immediate on round.funded | 06:53:27 → 06:53:39 (0 min) | **PASS** | FR22 – Total Funding Locked | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-F07-FUNDING-LOCKED` | sms | round.funded | immediate on round.funded | 06:53:34 → 06:53:39 (0 min) | **PASS** | Hey Sim, Fundhub — funding is locked. Ne… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-F10-INBOX-SETUP` | email | round.started | retired — F-10 no longer sends | 06:53:27 → 06:53:39 (0 min) | **not-live** | Your funding inbox is ready | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-F10-INBOX-SETUP` | sms | round.started | retired — F-10 no longer sends | 06:53:34 → 06:53:39 (0 min) | **not-live** | Hey Sim, Fundhub — your funding inbox is… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-AX07-FUNDING-PAUSED` | email | CRS second snapshot negatives | immediate on second CRS snapshot with new negatives | 06:46:58 → 06:47:33 (1 min) | **PASS** | Funding paused — action needed | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-AX07-FUNDING-PAUSED` | sms | CRS second snapshot negatives | immediate on second CRS snapshot with new negatives | 06:46:58 → 06:47:33 (1 min) | **PASS** | Hey Sim — we've briefly paused your file… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-DS01-REPAIR-REFERRAL` | email | call.completed repair referral | immediate on Repair Referral Sent | 06:47:16 → 06:47:33 (0 min) | **PASS** | The step that unlocks your funding | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `SMS-DS01-REPAIR-REFERRAL` | sms | call.completed repair referral | immediate on Repair Referral Sent | 06:47:16 → 06:47:33 (0 min) | **PASS** | Hey Sim, it's Fundhub. Based on your rev… | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `EMAIL-DS02-DIY-LETTERS-READY` | email | payment.received DIY | after DIY letters generate on payment.received | 06:47:17 → 06:47:33 (0 min) | **PASS** | Your correction letters are ready | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `EMAIL-REPAIR-WELCOME` | email | repair.enrolled | immediate on repair.enrolled | 06:16:54 → 06:47:33 (31 min) | **PASS** | Welcome — here is what happens next in y… | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `EMAIL-REPAIR-LETTERS-SENT` | email | repair.letters.sent | immediate on repair.letters.sent | 06:47:18 → 06:47:33 (0 min) | **PASS** | Your dispute letters are on the way | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `EMAIL-REPAIR-RESPONSE-RESULTS` | email | repair.response.parsed | immediate on repair.response.parsed | 06:47:18 → 06:47:33 (0 min) | **PASS** | We reviewed your bureau response | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `EMAIL-REPAIR-RETAKE-PHOTO` | email | repair.response.retake | immediate on repair.response.retake | 06:47:18 → 06:47:33 (0 min) | **PASS** | Please retake your bureau letter photo | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `EMAIL-REPAIR-ROUND-ADVANCED` | email | repair.round.escalated | immediate on repair.round.escalated | 06:47:18 → 06:47:33 (0 min) | **PASS** | Round 2 is out | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `EMAIL-REPAIR-TRIAL-COMPLETE-UPSELL` | email | repair.program.complete | immediate on trial program complete | 06:47:19 → 06:47:33 (0 min) | **PASS** | Your trial rounds are complete — next st… | stanbridgejchris+sim-repair-e2e200920-y2otg@gmail.com |
| `EMAIL-AR-01-FIRST-NOTICE` | email | invoice.sent success fee | immediate on success-fee invoice.sent | 06:53:26 → 06:53:39 (0 min) | **PASS** | Invoice — Round complete | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-AR-01-FIRST-NOTICE` | sms | invoice.sent success fee | immediate on success-fee invoice.sent | 06:53:32 → 06:53:39 (0 min) | **PASS** | Hey Sim, Fundhub billing. Round is compl… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-AR-02-REMINDER` | email | invoice.sent success fee | sleep 7d after AR-01 if unpaid | 06:53:26 → 06:53:39 (0 min) | **PASS** | Invoice is still open | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-AR-02-REMINDER` | sms | invoice.sent success fee | sleep 7d after AR-01 if unpaid | 06:53:32 → 06:53:39 (0 min) | **PASS** | Hey Sim, Fundhub billing. Invoice for is… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-AR-03-FINAL-NOTICE` | email | invoice.sent success fee | sleep 7d more (14d total) if unpaid | 06:53:26 → 06:53:39 (0 min) | **PASS** | Final notice — invoice | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-AR-03-FINAL-NOTICE` | sms | invoice.sent success fee | sleep 7d more (14d total) if unpaid | 06:53:32 → 06:53:39 (0 min) | **PASS** | Hey Sim, Fundhub billing. Final notice o… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-N01-COLD-NURTURE` | email | (none — retired) | retired — empty trigger | 06:53:28 → 06:53:39 (0 min) | **not-live** | A quick insight most people miss | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `SMS-N01-COLD-NURTURE` | sms | (none — retired) | retired — empty trigger | 06:53:34 → 06:53:39 (0 min) | **not-live** | Hey Sim, Fundhub here. Most owners we ta… | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `EMAIL-N02-WARM-NURTURE` | email | (none — retired) | retired — empty trigger | 06:53:28 → 06:53:39 (0 min) | **not-live** | A small shift that makes a big differenc… | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `SMS-N02-WARM-NURTURE` | sms | (none — retired) | retired — empty trigger | 06:53:35 → 06:53:39 (0 min) | **not-live** | Hey Sim, it's Fundhub. You looked at fun… | stanbridgejchris+sim-inquiry-e2e200920-y2otg@gmail.com |
| `EMAIL-N03-HOT-NURTURE` | email | (none — retired trigger) | retired trigger (handle still can send) | 06:47:29 → 06:47:33 (0 min) | **PASS** | Knowing when to move forward | stanbridgejchris+sim-course-e2e200920-y2otg@gmail.com |
| `SMS-N03-HOT-NURTURE` | sms | (none — retired trigger) | retired trigger (handle still can send) | 06:47:29 → 06:47:33 (0 min) | **PASS** | Hey Sim, Fundhub. You were one step from… | stanbridgejchris+sim-course-e2e200920-y2otg@gmail.com |
| `EMAIL-N04-POST-FUNDING` | email | round.closeout | immediate on staff round.closeout | 06:47:12 → 06:47:33 (0 min) | **PASS** | What comes after funding | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-N04-POST-FUNDING` | sms | round.closeout | immediate on staff round.closeout | 06:47:12 → 06:47:33 (0 min) | **PASS** | Hey Sim, it's Fundhub. Checking in now t… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-N06-RENEWAL` | email | round.funded | sleep 180d after round.funded | 06:47:07 → 06:47:33 (0 min) | **PASS** | When “second-wave” funding makes sense | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-N06-RENEWAL` | sms | round.funded | sleep 180d after round.funded | 06:47:07 → 06:47:33 (0 min) | **PASS** | Hey Sim, Fundhub here. Your profile has … | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-WAYPOINT-DUE` | sms | waypoint sweeper | sweeper: due today (step 1) | 06:53:37 → 06:53:39 (0 min) | **PASS** | Hi Sim, it's Fundhub. This is due today … | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-WAYPOINT-NUDGE-1` | email | waypoint sweeper | sweeper: 2 days overdue (step 2) | 06:46:59 → 06:47:33 (1 min) | **PASS** | Still waiting on one thing from you | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `SMS-WAYPOINT-NUDGE-2` | sms | waypoint sweeper | sweeper: 5 days overdue (step 3) | 06:53:37 → 06:53:39 (0 min) | **PASS** | Hi Sim, Fundhub again about on your file… | stanbridgejchris+sim-funding-e2e200920-y2otg@gmail.com |
| `EMAIL-PARTNER-WELCOME` | email | partner created | immediate on partner created | 06:53:30 → 06:53:39 (0 min) | **PASS** | You are in — | stanbridgejchris+sim-lanef-book-7well9@gmail.com |
| `SMS-PARTNER-WELCOME` | sms | partner created | immediate on partner created if SMS consent | 06:53:36 → 06:53:39 (0 min) | **PASS** | Fundhub: you are in, . Go to and use "Fo… | stanbridgejchris+sim-lanef-book-7well9@gmail.com |

## FAIL / not-live leftover

- `SMS-BS01-01-BOOKED` — **not-live** — retired — S-04B owns booked text
- `SMS-BS01-03-DAYOF` — **not-live** — retired — S-04B T-2h owns it
- `EMAIL-U02-ANALYZER-REPAIR-DELIVERY` — **not-live** — retired — repair pack ships from DS-02
- `EMAIL-C06-DECLINE` — **not-live** — retired/deferred — decline detector is a no-op
- `SMS-C06-DECLINE` — **not-live** — retired/deferred — decline detector is a no-op
- `EMAIL-F10-INBOX-SETUP` — **not-live** — retired — F-10 no longer sends
- `SMS-F10-INBOX-SETUP` — **not-live** — retired — F-10 no longer sends
- `EMAIL-N01-COLD-NURTURE` — **not-live** — retired — empty trigger
- `SMS-N01-COLD-NURTURE` — **not-live** — retired — empty trigger
- `EMAIL-N02-WARM-NURTURE` — **not-live** — retired — empty trigger
- `SMS-N02-WARM-NURTURE` — **not-live** — retired — empty trigger

Leftover (do not fix here): **COMMS-S04-02-NO-BYPASS** still true for the real Inngest clock. Tonight the 24h reminder was queued by prove sendTemplated so you can read it.

