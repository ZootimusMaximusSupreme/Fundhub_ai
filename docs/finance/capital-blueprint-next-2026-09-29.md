# Capital Blueprint — owner-set offer

**Owner-set 2026-09-29.** The offer below is the product. It replaces the prior strategy draft in this file (kept below for history). No product code changed. The $297 roadmap is unchanged.

---

## Owner-set 2026-09-29. Chris: this is the Capital Blueprint offer.

### Capital Blueprint

- Paydown simulator: The client enters how much cash they have, and it splits that across their cards and shows the projected approval amount before and after.
- Finance OS: Connects all their accounts and tracks every card, and the agent tells them what to pay down to get ready for funding. It includes 12 months, then moves to the monthly member fee.
- Monthly soft pull: A new pull every 30 days updates the plan and rewrites the next round of letters based on what changed on the file.
- Accountability agent: Stays on the client's open checklist step and moves them to the next one. A step only clears after they upload proof, like a mail receipt or bureau response.
- Dispute-round steps: The current checklist has no letter-mailing steps, so these get added for the agent and the proof requirement to work on.
- Ready-for-funding trigger: When UnderwriteIQ shows the file is ready, the closer gets an alert to call and close the done-for-you funding.
- Pre-application check: Before every round, the system confirms the bureau data matches, balances report low, inquiries are in range, and documents are uploaded.
- Decline defense: When a bank declines, the system reads the reason and runs the reconsideration on the ops side.
- Payment timing: Balances report on the statement date, so the system tells the client which day to pay each card before a round.
- Promo tracking: After funding, the client gets alerts 60, 30 and 7 days before each 0% promo ends, along with a payoff or transfer plan.
- Payment reserve tracking: The system flags when their cash drops below six months of minimum payments, since a missed payment damages the file before round two.
- Welcome kit: A mailed package with their file analysis, plan and bank list that arrives when they sign up.
- Letter mailing upsell: The client can pay to have their letters mailed, billed per letter as each one goes out.
- CSM: One person collects client data and watches the dashboards, and everything else runs automatically.

### New to add

- Credit partner file: A spouse or business partner joins as a second applicant, which adds their approvals to the stack and raises your success fee.
- New-credit alert: One new card or inquiry can push back a round, so the system flags it the day it shows up.
- Application document vault: The agent collects bank statements, tax returns and ID ahead of time, so the file is complete when the closer calls.
- Bank relationship tracker: The client opens accounts at the banks on their match list, and Finance OS tracks deposits so the relationship is established before they apply.
- Round-two planner: After funding, the system calculates when the file has recovered enough for another round and alerts the closer, which sets up the next success fee.

### Notes

The $297 roadmap is unchanged.

This offer is the system around the file: paydown, monthly pulls, an agent that will not advance a step without proof, and the alerts that set up the closer's funding fee.

The offer sells for $5,000 to $10,000 for 12 months, then a monthly member fee. Chris named the monthly fee and did not set the dollar amount. Do not invent the monthly price. Note: the live catalog still lists $5,000 (discount floor $1,000) until someone changes it.

Nothing in this list is built by this change. The file only records the offer.

### Test

The new list (Finance OS, paydown simulator, monthly pull, alerts, welcome kit, and the rest) is not built, so there is nothing to click. The test is one real buyer paying a price between $5,000 and $10,000 for this offer as he wrote it. Pass means they paid. Fail means they did not.

---

# Prior strategy draft (replaced as the product by the owner-set offer above)

Date: **2026-09-29**  
Status: prior draft only. Kept for history. The owner-set offer above is the product.  
Company: **Fundhub**

---

## 1. The business problem

The **$297 Funding Roadmap** is the infant front offer. It is perfect as that front offer. Leave it alone.

It also creates a sales problem. A buyer can get the same family of papers for $297. When a closer later asks for **$5,000** for the Capital Blueprint, the buyer hears “more of the same PDFs.”

So the Blueprint cannot stay “the papers plus a mini course.” It has to become a **different product**: guidance that stays with them, proof before a step clears, and a clear time window. Same papers are not the offer. The offer is help that turns the papers into finished steps.

This document does **not** propose changes to the roadmap page, price, or pack.

---

## 2. Current roadmap (fill from the repo)

**Leave it alone.**

| Fact | What the repo says | Source |
|---|---|---|
| Price | **$297** (`SLO_PRICE_CENTS = 29700`) | `src/slo/offer.mjs` |
| Catalog title | Consulting Services Assessment | `src/slo/offer.mjs` |
| Product / purpose | `diagnostic` / soft-pull diagnostic path | `src/slo/offer.mjs`, `docs/journeys/slo-offer-intended.md` |
| After pay | Soft pull → pack prints → book a call | `docs/journeys/slo-offer-intended.md` |
| Closer pipeline after that | Funding at **$3,000** to start (counts toward the 10% success fee) | `docs/finance/slo-offer-model-2026-09-18.md`, `docs/company-resources/closer-slo-pipeline-2026-09-18.md` |

**What the sales page promises** (promise only — from `clickfunnels-fragments/slo/slo-01-sales.html`):

- Soft pull; score does not move.
- About **ten seconds** later, five documents in the portal, yours to keep.
- **7-day refund** if they are not happy.
- Five docs: How Much You Qualify For; Credit Analysis Report; Credit Optimization Roadmap; Dispute Letter Pack; Bank & Lender Match List.
- Free bonus: **Business Duplication Map**.

**One line:** the roadmap stays as it is. Do not edit it.

---

## 3. Current Capital Blueprint (fill from the repo)

| Fact | What the repo says | Source |
|---|---|---|
| List price | **$5,000** (`priceCents: 500000`) | `src/config/offers.mjs` `UWIQ_DELIVERABLES` |
| Owner set that price | **2026-09-03** | `db/migrations/289_capital_blueprint_price.sql`; comment in `offers.mjs` |
| Discount floor | **$1,000** (`priceMinCents: 100000`) | `src/config/offers.mjs` |
| Product code | `consulting-package` (Consulting Services Package) | `src/config/offers.mjs` |
| How it is sold | Closer Present deck: Course 1 / DIY when they pass on done-for-you funding | `public/app/present.js` (S-19 DIY / Course one; wrap S-24) |
| Closer wrap | Deliverables land from the pull; **you run it at your own pace**; nobody is working the file for you | `public/app/present.js` `UWIQ_DELIVERABLES` S-24 |
| Named contents | Credit Analysis Report; Dispute Letter Pack; Credit Optimization Roadmap; Funding Snapshot; Bank & Lender Match List; How To Use This mini course | `UWIQ_DELIVERABLES_CONTENTS` in `src/config/offers.mjs` |
| Checklist on pay | Paying `consulting-package` seeds `client_waypoints` | `src/waypoints/purchase.mjs` (hooked from money-chain) |
| Portal tile | Capital Blueprint tile; **`slo_paid` also opens that tile** and the five pack rows | Comments in `public/app/client-portal.html` (~858–863, ~1638–1642) |

### Feature check (only what a file can prove)

| Thing Chris named | Verdict | Where |
|---|---|---|
| **Checklists (waypoints)** | **Found.** Six definition types seed into a client checklist on Blueprint pay. Progress page shows “Your checklist.” | `src/waypoints/purchase.mjs`, `db/migrations/362_waypoint_definitions_seed.sql`, `public/progress.html`, `src/progress/read.mjs` |
| **Step proof / auto-close** | **Partly found.** Paydown steps close only when a new credit pull shows the balance at target. “No new credit” can move to **blocked** if a new revolving account appears. LLC / EIN / business bank / personal-loan talk steps are **self-tick** (client says done) or stay open until a person marks them. | `src/waypoints/verify.mjs`, `src/waypoints/self-attest.mjs`, `api/waypoint-tick.mjs` |
| **Step blocking (hard gate: next step locked until proof)** | **Not found as a product gate.** There is a “next step” highlight and a `blocked` state for the no-new-credit rule. There is no code that locks later checklist steps behind photo proof or a letter-mail gate. | `src/progress/read.mjs` `nextStepOf`; `verify.mjs` blocked branch |
| **Dashboard for Blueprint** | **Partial.** Client progress page + portal progress link show the checklist. No separate “Capital Blueprint dashboard” product screen was found. Staff closer dashboard is a different tool. | `public/progress.html`, portal link in `public/app/client-portal.html` |
| **Gamification** (points, badges, streaks, levels) | **Not found in the repo** (search for `gamif` returned nothing relevant). | — |
| **Agent whose only job is the open checklist step** | **Not found.** Agent runtime exists (`src/agents/`). Overdue checklist chase exists as the **nudge ladder** (SMS/email queue), not as a dedicated Blueprint coach agent. Agent context builder does not currently load open waypoints. | `src/agents/`, `src/nudge/index.mjs`, `src/agents/context.mjs` |
| **Proof before step clears** (photo of mailed letter, bureau letter back) | **Not found** for Blueprint waypoints. | — |
| **Letter check before they mail** | **Not found** as a Blueprint-only review step. Letter generation exists for repair / Metro 2 paths; that is not a pre-mail coaching gate for DIY Blueprint. | — |
| **Call / text that agent; human backup** | **Partial.** SMS outbound and AI agents exist in the product. A Blueprint-specific coach agent with human backup is **not** wired as a named offer feature. Nudge can escalate overdue waypoints toward a human staff task. | `src/messaging/`, `src/agents/`, `src/nudge/run.mjs` |
| **Set time window (e.g. 90 days) then stop** | **Not found** on Blueprint / waypoints. | — |

Checklist steps the catalog actually seeds (titles are the actions):

1. Pay each revolving card down to a target (closes on credit re-pull).  
2. Do not open new credit while the file is in work (rule; never self-closed).  
3. Talk to your advisor about a personal loan.  
4. File your LLC.  
5. Get your EIN from the IRS.  
6. Open a business checking account.

---

## 4. What expensive DIY programs sell when the papers are cheap

Patterns from public sources (no invented stats). What we took from each:

1. **Done-with-you vs done-for-you vs DIY**  
   - Source: [Ken Yarmosh — DIY vs DWY vs DFY](https://kenyarmosh.com/blog/diy-vs-dwy-vs-dfy-offers/)  
   - Takeaway: DIY scales and finishes poorly; DWY sells frameworks + feedback + accountability while the client still does the work; DFY sells certainty and labor. Premium price needs a middle or high rung that is **not** “download the files.”

2. **Accountability is the product when information is everywhere**  
   - Source: [The Success Academy — Done With You vs Done For You](https://thesuccessacademy.co.uk/done-with-you-vs-done-for-you-business-coaching-uk/)  
   - Takeaway: Buyers often already have knowledge. They pay for someone (or a system) that keeps them applying it.

3. **Fixed window + deadlines + check-ins beat open-ended self-pace**  
   - Sources: [UseKaido — 90-day coaching program](https://www.usekaido.com/blog/90-day-coaching-program); [Automateed — group coaching vs course](https://www.automateed.com/group-coaching-program-vs-course)  
   - Takeaway: A **set term** (90 days is a common coaching frame), session-end commitments, and mid-week check-ins. Open-ended “at your own pace” is the cheap-course posture.

4. **AI-era buyers expect a persistent checker between sessions**  
   - Sources: [aramb — AI accountability coach agent](https://aramb.ai/blog/ai-accountability-coach-agent/); [Asadqi on AI accountability agents](https://www.asadqi.com/ai-accountability-coach-agents-in-2026-automate-the-between-session-follow-up-then-rent-it-out-1563/)  
   - Takeaway: The agent remembers **this client’s** open commitment, checks in on a cadence, adapts to the reply, flags silence, and hands a human a digest. Human keeps judgment; agent owns the chase.

5. **Proof before the next step clears**  
   - Sources: [CoachGuide — evidence required on tasks](https://coachguide.io/features/task-management); [FreshLearn — assignment gates](https://freshlearn.com/blog/freshlearn-it-trainers-assessments-coding-curriculum/); [Overwatch IQ — proof uploads](https://custodydesign.com/overwatch-iq-self-managed-proofing-accountability/)  
   - Takeaway: “I did it” is not enough. Upload / approval unlocks the next module. That is how high-ticket feels different from a PDF pack.

6. **Self-serve courses often do not get finished (research, not a sales claim)**  
   - Source: Jordan, *IRRODL* — MOOC completion median **12.6%** across 221 courses (range 0.7%–52.1%): [academia.edu copy of the paper](https://www.academia.edu/13467027/Massive_open_online_course_completion_rates_revisited_Assessment_length_and_attrition)  
   - Related: EDUCAUSE on MOOC certification often in the low single digits when counting all registrants: [MOOC Completion and Retention](https://er.educause.edu/articles/2014/12/mooc-completion-and-retention-in-the-context-of-student-intent)  
   - Takeaway for Fundhub: selling “you run it yourself” at $5,000 fights the market pattern. Selling **guided steps with proof and a clock** matches how premium offers justify price next to cheap materials.

---

## 5. Gaps — what $297 already gets vs what $5,000 gets today

Overlapping PDF names are **not** the strategy. They are the **devalue problem**. Named here only so the closer knows why “same papers” lands.

| | $297 Funding Roadmap | $5,000 Capital Blueprint (today in code) |
|---|---|---|
| Soft pull + custom pack | Yes | Sold from an existing pull / Present path |
| Same family of reports / letters / roadmap / lender list | Yes (sales page names) | Yes (`UWIQ_DELIVERABLES_CONTENTS`) |
| Business Duplication Map | Promised on sales page | Not listed in `UWIQ_DELIVERABLES_CONTENTS` |
| Mini course “How To Use This” | Portal tile shows modules as “Coming soon” | Listed as a deliverable in `offers.mjs` |
| Checklist seeded on pay | **No** (`diagnostic` does not create waypoints) | **Yes** (`consulting-package` only) |
| Portal “Capital Blueprint” tile unlocked | **Yes via `slo_paid`** (this is part of the devalue problem) | Yes via entitlement / pay |
| Someone who stays on the open step | No | Closer script says **nobody is working the file** |
| Proof of mail / bureau reply to clear a step | No | No |
| Pre-mail letter check | No | No |
| 90-day window then stop | No | No |

**What a closer can honestly say today:** you get the how-to framing, financing may be offered, and paying seeds a portal checklist.  
**What a closer cannot honestly say today:** this is a guided 90-day program with an agent on your open step, proof before a step clears, and a letter check before you mail.

Financing for the Blueprint offer is already flagged on in the catalog (`financing: true` on `UWIQ_DELIVERABLES`). That is payment rail, not product differentiation.

---

## 6. Blueprint-only improvements (ranked)

Build on the direction Chris already heard. Rank = sell power × honesty about what exists.

| Rank | Improvement | Why it makes $5,000 make sense | Next 48 hours? | Later build? |
|---|---|---|---|---|
| **1** | **One agent whose only job is the client’s open checklist step** — texts/calls about that step; human is backup when the agent stops or escalates | Turns DIY papers into **done-with-you**. Closers can say: you are not alone with a PDF. | **First slice — yes, if kept tiny.** Reuse agents + SMS + existing open waypoint (“next step”). Prompt + select rule + put open waypoint into agent context. Do **not** invent a new portal. | Full voice, multi-step coaching, digest UI for humans |
| **2** | **Proof before a step clears** — photo of mailed letter / certified receipt; later bureau reply | Stops “I mailed it” lies. Matches premium evidence gates. | **No.** Needs upload → review → waypoint complete. Portal upload paths exist elsewhere; Blueprint mail-proof is not wired. | Yes — first on letter-mail steps, then bureau reply |
| **3** | **Letter check before they mail** | Stops bad mailings that waste a 30-day clock. | **No as auto-AI review.** Could be a **human** temporary SOP (staff replies in SMS) without new screens — still not “productized.” | Yes — AI or staff queue on draft letter |
| **4** | **They can call or text that agent; human backup** | AI-era expectation: always-on chase, human judgment on hard cases. | **Partial with #1.** Inbound agent reply paths exist; Blueprint coach is not a live named agent yet. | Dedicated Blueprint agent row, escalation playbook, coverage hours |
| **5** | **Set time (Chris heard 90 days) then it stops** | Creates urgency and a clear end — not forever DIY access sold as “Course 1.” | **No as enforcement.** No 90-day Blueprint clock in waypoints today. | Yes — entitlement / nudge / agent end date |

### Honest 48-hour bar (financing is near; production-ready must be real)

Ship **one** difference the closer can say out loud:

> “$297 is the map. $5,000 is the coach on your checklist — it stays on the open step, and a person can take over.”

That means: seed already exists for payers; wire **one** agent to the **one** open waypoint; SMS in; escalate to human on stop words / silence.  
Do **not** promise photo gates, letter AI review, gamification, or a new dashboard galaxy in 48 hours. Those are the next slices after financing is live.

---

## 7. Actionable next steps (ordered)

Agents do the work later. Chris does not click ClickFunnels, log into tools, or edit pages for this.

1. **Ship the Blueprint coach slice** — one agent, one job: the client’s current open checklist step; SMS; human backup. Prove on one paid Blueprint file.  
2. **Rewrite Present wrap for Blueprint only** — stop saying “nobody is working the file.” Say: agent on the open step, checklist in the portal, human backup. (Present copy change when Chris names that fix — not this doc.)  
3. **Decide portal devalue** — `slo_paid` unlocking the Capital Blueprint tile makes $297 look like the $5,000 product. Strategy choice later; do not touch the live roadmap.  
4. **Add proof-to-clear** for mail steps (photo / receipt) once the agent slice is live.  
5. **Add pre-mail letter check** (staff first, then automate).  
6. **Add a 90-day window** that ends agent chase and sets expectations on the close.  
7. **Only then** consider dashboards / polish. No gamification unless Chris names it after the core loop works.

---

## 8. What this document does not do

- Does not change the roadmap page, offer, or pack.  
- Does not read or quote the Capital Blueprint contract text.  
- Does not implement any of the steps above.  
- Does not invent features that are not in the repo.

---

## Sources (repo)

- `src/slo/offer.mjs`  
- `docs/journeys/slo-offer-intended.md`  
- `clickfunnels-fragments/slo/slo-01-sales.html` (promise copy only)  
- `docs/finance/slo-offer-model-2026-09-18.md`  
- `docs/company-resources/closer-slo-pipeline-2026-09-18.md`  
- `src/config/offers.mjs`  
- `public/app/present.js`  
- `src/waypoints/purchase.mjs`  
- `db/migrations/362_waypoint_definitions_seed.sql`  
- `db/migrations/289_capital_blueprint_price.sql`  
- `db/migrations/383_blueprint_entitlement.sql`  
- `public/app/client-portal.html`  
- `public/progress.html`  
- `src/waypoints/verify.mjs`  
- `src/nudge/index.mjs`  
- `src/agents/`  

## Sources (web research)

Listed inline in §4.
