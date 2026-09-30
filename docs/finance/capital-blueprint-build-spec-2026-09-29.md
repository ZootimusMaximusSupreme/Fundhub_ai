# Capital Blueprint — build spec

**Date:** 2026-09-29  
**Status:** build spec only. No product code changed by this file.  
**Company:** Fundhub  
**Source offer:** `docs/finance/capital-blueprint-next-2026-09-29.md` (owner-set offer). Where this package differs from that file, **this package wins**.

---

## 1. What this is

This is the build book for the **Capital Blueprint** offer sold at **$5,000 to $10,000** for 12 months, then a **monthly member fee** (amount not set). It is not the $297 Funding Roadmap. It is the system that stays with the file: paydown help, Finance OS, monthly soft pulls, an accountability agent on open checklist steps with proof, a CSM on exceptions and closing prep, a free credit partner file, bank relationship tracking, Next Funding Sequence, and a physical welcome kit.

**Soft pull** means a credit check that does not hurt the score the way a hard pull does. **UnderwriteIQ** means Fundhub’s funding math and pack that run off that credit file. **Waypoint** means one checklist step on the client’s file. **CSM** means Client Success Manager — the staff person on exceptions and closing prep.

---

## 2. What we are not building

- Do **not** change the Funding Roadmap ($297). Do not put these features on the roadmap page or pack.
- **Pre-application check** is **not** a new feature. Chris is treating it as part of the existing process and taking it off the feature list. Do not spec or build it as new work.
- Do not invent prices for the monthly member fee, letter-mail fees, or quiet-day counts Chris did not set.
- Do not create a new Commas catalog product. Keep titles only: Consulting Services Assessment, Engagement, Package, Standard, Trial, Program, Records, Completion, Deposit, and Business Financial Assessment. Never `POST /public-api/products/create`.
- Do not read or change the Capital Blueprint contract text in `db/migrations/288_real_contract_text.sql`.
- Do not list the six old PDFs as the product. The papers are inputs. The offer is the system around the file.
- Do not design colors or write HTML in this build. Page work stays for Claude when Chris names it.

---

## 3. Whole-package build order

Smallest thing that makes $5,000–$10,000 feel different from the roadmap first:

1. **Accountability agent on the open checklist step** (SMS about the current open waypoint; load open steps into agent context; CSM on silence / “stop”). Checklist seed already exists on Blueprint pay.
2. **Dispute-round waypoint steps** (letter-mail steps with due dates and proof-to-clear). Without these, the agent has nothing honest to chase for disputes.
3. **Proof-to-clear** for mail / bureau reply (upload path already exists elsewhere; Blueprint verify does not yet).
4. **CSM exception + closing-prep tasks** (queue exists; assignment of one CSM per client does not).
5. **Ready-for-funding → closer alert** (needs a clear “file is ready” rule + prep steps closed).
6. **Monthly soft pull job that actually fulfils** (queue row exists; bureau fulfil seam is still open).
7. **Finance OS for Blueprint buyers** (screen and entitlement exist; live bank connect does not).
8. **Paydown simulator, payment timing, promo tracking** (inside Finance OS; mostly new).
9. **Credit partner file** (second person model not in the repo).
10. **Bank relationship tracker** (closer-offered only when they have capital).
11. **Next Funding Sequence**.
12. **Welcome kit** (ops / fulfillment; not in product code).

**Honest 48-hour slice:** steps 1 only, on existing open waypoints, without inventing letter steps or live bank connect. Financing pressure does not make Plaid or bureau fulfilment exist.

**Catalog fact (do not change prices here):** `src/config/offers.mjs` `UWIQ_DELIVERABLES` lists Capital Blueprint at `$5,000` (`priceCents: 500000`), floor `$1,000`, product code `consulting-package`, title Consulting Services Package. Owner range for this offer is **$5,000 to $10,000**. Monthly member fee after 12 months: **amount not set**.

---

## 4. Feature specs

For each feature: what exists, backend, frontend, agent, build order, 48-hour vs later.

---

### 4.1 Paydown simulator (inside Finance OS)

**A. What exists today**

- Paydown **targets** exist as checklist math: `src/waypoints/definitions.mjs` (`PAYDOWN_TARGET_FRACTION = 0.1`), seeded from `db/migrations/362_waypoint_definitions_seed.sql`, closed by re-pull in `src/waypoints/verify.mjs`.
- UnderwriteIQ already prints “pay this card to this target” in deliverables (`src/underwrite/black-report-client.mjs`, funding snapshot / roadmap PDFs).
- **No** “enter how much cash you have → split across cards → show approval before/after” simulator screen or API was found. **Not in the repo** as a product tool.

**B. Backend**

- New read/write is needed: cash-on-hand input (session or saved row), allocation plan, projected approval using existing UnderwriteIQ / black-report numbers — do **not** invent a second underwriting engine.
- Tables: prefer extending something Finance OS already reads (`crs_results`, tradelines, `client_waypoints` params). A new migration only if you must persist scenarios; do not invent balances the bureau did not report.
- Who writes: client or staff on Finance OS. Event: optional domain event later; not required for a first calculator.

**C. Frontend**

- Belongs on **Finance OS**: `public/app/finance-os.html` (staff today). Client view may later sit beside portal progress (`public/progress.html` / `public/app/client-portal.html` link). Describe as: a simple cash box and a before/after approval number. Do not design the page here.

**D. Agent**

- Accountability agent can **talk about** the open paydown waypoint. No separate “simulator agent.” Optional later: agent offers to run the split when the open step is a paydown.

**E. Build order**

- Needs a credit file with limits/balances and UnderwriteIQ preapproval fields first. Finance OS entitlement for Blueprint buyers should be decided before client self-serve.

**F. 48-hour vs later**

- **Later.** Not a 48-hour slice. Closers can still sell “we tell you what to pay down” from existing checklist + pack.

---

### 4.2 Finance OS (connect accounts, track cards, agent paydown guidance; 12 months then monthly member fee)

**A. What exists today**

- Screen: `public/app/finance-os.html`, CSS `public/app/finance-os.css`.
- Read API: `api/read/finance-os.mjs`, suggestions: `api/read/finance-os-suggestions.mjs`.
- Entitlement: `src/finance/finance-os-entitlement.mjs` — tier string `finance-os` on `subscriptions`. Price on that tier: **not set** in code (`price_cents` may be NULL).
- Monthly pull sweeper: `src/workflows/finance-os-pull-sweeper.mjs` (queues a soft-pull **request** for entitled clients).
- Banking / Plaid: `src/banking/plaid.mjs` — **empty seams**. `linkAccount()` / `getAccounts()` return not implemented. Cards today mainly come from soft-pull tradelines (`api/finance/liabilities.mjs` notes this).
- Statement-day math exists as pure helpers: `src/banking/statement-cycles.mjs` (calendar day math; not a full “pay this card on this day” product).

**B. Backend**

- On Blueprint pay (`src/waypoints/purchase.mjs` / money-chain): decide whether payment also creates an active `subscriptions` row with `tier = 'finance-os'` for 12 months. That wiring is **not** confirmed as automatic today — treat as required Blueprint build work.
- After 12 months: monthly member fee. **Amount not set.** Do not invent. Billing must reuse a **keep** Commas title. If no keep title fits a recurring member fee, that is a **blocker** (see end of this section).
- Soft-pull queue already supports `requested_by_kind = 'system'` (`db/migrations/380_finance_os_monthly_pull.sql`). Fulfilment to a real bureau answer is still a separate seam (`fulfilSoftPull` in `src/finance/soft-pulls.mjs` — called from tests, not from a live provider path in app code per migration header).
- Do **not** invent live bank balances. Until Plaid (or another approved connector) is implemented and turned on by a human decision, Finance OS tracks cards from the credit file + manual staff entry only.

**C. Frontend**

- Extend `public/app/finance-os.html`. Plain words: connected money view, every card, and “what to pay down to get ready.” Client portal may later deep-link here; today Finance OS is a staff app screen.

**D. Agent**

- Accountability agent texts about open paydown waypoints. Finance OS suggestions endpoint is staff-read, not an agent brain. Wire suggestions into agent context only after open waypoints are in `fetchContext`.

**E. Build order**

1. Entitlement for Blueprint buyers.  
2. Honest card list from credit file.  
3. Live bank connect (later; SOC/consent/human turn-on).  
4. Monthly member fee after month 12 (price + keep title).

**F. 48-hour vs later**

- Entitlement + “suggestions from latest pull” can move in a short slice if Blueprint already has a credit file. **Live account connect is later — not in the repo as a working connector.**

**Commas / member fee blocker:** recurring monthly member fee after 12 months has **no owner-set dollar amount** and no confirmed keep title for that charge. Do not invent a product name. Stop and ask Chris which keep title and amount before minting pay links.

---

### 4.3 Monthly soft pull (paid)

**A. What exists today**

- Soft-pull ledger: `src/finance/soft-pulls.mjs`, `api/finance/soft-pull.mjs`, table `soft_pull_requests`.
- Consent: `client_consents` kind `soft_pull_consent` (`db/migrations/099_client_consents.sql`).
- Finance OS sweeper queues **one system request per billing period** for `finance-os` subscribers — described as included with that add-on, not as a separate paid SKU.
- Owner package says: a new pull every 30 days updates the plan and **rewrites the next round of letters** from what changed.
- Letter regen paths exist for repair / UnderwriteIQ packs (`src/underwrite/letter-pack.mjs`, repair Metro2 paths). Blueprint “rewrite letters after monthly pull” as an automatic product loop is **not** wired end-to-end.

**B. Backend**

- Job: keep using `src/workflows/finance-os-pull-sweeper.mjs` (or a Blueprint-specific twin) on a 30-day / period clock. Do not turn on a live bureau pull in a build chat without Chris naming live vs sandbox.
- After a result lands: run existing waypoint verify (`src/waypoints/verify.mjs`), reseed/update paydowns (`src/waypoints/seed.mjs`), regenerate letter pack through existing underwrite/repair writers — do not invent a second letter engine.
- “Paid”: either included in Blueprint / Finance OS entitlement, or a separate charge on a **keep** title. Extra pull-as-a-product needs a keep title; if none fits, **blocker**.

**C. Frontend**

- Staff: Finance OS + client control / Present soft-pull controls already used for pulls. Client: portal does not need a new “run my pull” galaxy for v1 if the system queues it.

**D. Agent**

- After a pull updates waypoints, agent context must see the new open step (see required verify section §5).

**E. Build order**

1. Consent on file.  
2. Request queue (exists).  
3. Fulfil seam closed (bureau answer → `fulfilSoftPull`).  
4. Verify waypoints + rewrite letters.

**F. 48-hour vs later**

- Queue-only is already coded for Finance OS. **Real monthly pull + letter rewrite is later** until fulfilment is live.

---

### 4.4 Ready-for-funding trigger to the closer

**A. What exists today**

- UnderwriteIQ engine returns `fundable` among other fields (`src/underwrite/engine.mjs` → vendored `computeUnderwrite`).
- Outcome tiers stamp on decision (`clients.outcome_tier`, e.g. `FULL_FUNDING`) via lifecycle handlers.
- Funding snapshot copy talks about “fundable right now” amounts (`src/deliverables/funding-snapshot.mjs`).
- Closers have desks: `public/app/closer-dashboard.html`, `public/app/closer-call.html`.
- Tasks: `src/lib/create-task.mjs` with `assigneeRole: "closer"`.
- Related but different: inquiry path sets `ready_for_next_round` and creates a next-round task (`src/workflows/c-03-inquiry-removed-resume-or-hold.mjs`) — **not** the Blueprint “DIY file ready → close done-for-you funding” alert.

**B. Backend**

- Define one product rule: “file is ready” = UnderwriteIQ shows fundable / ready **and** every CSM prep step for this Blueprint client is closed (owner rule). Do not invent a second scoring model.
- Who writes: a workflow on analysis/decision completion (or a sweeper) that checks readiness + prep flags, then `createTask(..., assigneeRole: "closer", title: …)`.
- Must not invent: do not alert on a PDF title alone; do not skip prep.

**C. Frontend**

- Closer sees the task on closer dashboard / call cockpit. Plain words: “this Blueprint client is ready — call to close done-for-you funding.”

**D. Agent**

- No agent closes funding. Agent stops at checklist; closer gets the human alert.

**E. Build order**

- Accountability prep steps + CSM prep call complete + stable readiness signal from UnderwriteIQ.

**F. 48-hour vs later**

- **Later** as a full gate. A manual closer task SOP is possible as temporary ops, not product.

---

### 4.5 Payment timing (inside Finance OS)

**A. What exists today**

- Statement calendar helpers: `src/banking/statement-cycles.mjs`.
- Mock banking data can carry `last_statement_date` (`src/banking/mock.mjs`).
- No product feature that tells each client “pay this card on this day before a round.” **Not in the repo** as a finished feature.

**B. Backend**

- Needs statement day per card (from bank connect or staff entry). Then compute “pay by” date before report date.
- Do not invent statement days. Unknown → no instruction (NULL survives).

**C. Frontend**

- Finance OS card list: one line per card with pay-by day.

**D. Agent**

- Can text the open paydown step with the pay-by day once the data exists.

**E. Build order**

- Card identity + statement day source first (bank connect or manual). Depends on Finance OS.

**F. 48-hour vs later**

- **Later.** Statement math alone is not the product.

---

### 4.6 Promo tracking after funding (inside Finance OS)

**A. What exists today**

- No 0% promo end-date tracker, no 60/30/7 day alert product. Cashflow code mentions promo rates only as something it does **not** model (`src/banking/cashflow.mjs`). **Not in the repo.**

**B. Backend**

- New stored fields per funded card / promo: end date, alert ledger (60 / 30 / 7). Outbound SMS/email only through `src/messaging` providers + dispatcher — no new texting vendor.
- Who writes: staff at funding close, or import from bank data if/when available. Do not invent end dates.

**C. Frontend**

- Finance OS after funding: promo list + countdown. Alerts also as messages/tasks.

**D. Agent**

- Optional chase texts on those alert days; or staff tasks. Prefer reusing nudge/task patterns.

**E. Build order**

- Client must be funded (`clients.funded` / funding rounds). Promo rows required.

**F. 48-hour vs later**

- **Later.**

---

### 4.7 Accountability agent with dispute-round steps

**A. What exists today**

- Checklist seed on Blueprint pay: `src/waypoints/purchase.mjs` → `src/waypoints/seed.mjs` → definitions in `db/migrations/362_waypoint_definitions_seed.sql`.
- Seeded client tasks today (verified):  
  1. Pay each revolving card down to target (`paydown`, closes on re-pull).  
  2. Do not open new credit (`no_new_credit`, can block on re-pull).  
  3. Talk to advisor about a personal loan.  
  4. File LLC.  
  5. Get EIN.  
  6. Open business checking.  
- **Letter-mailing / dispute-round steps are not in that seed.** Migration 362 header says dispute rounds and inquiry-removal letters are **Fundhub’s work, not the client’s**, and were **not seeded on purpose**. So the brief’s claim “current checklist has no letter-mailing steps” is **true** for `waypoint_definitions` / Blueprint checklist. Letter **generation and PostGrid mail** exist on repair / inquiry paths (`src/messaging/providers/mail-letter.mjs`, `src/repair/send.mjs`, Metro2 DIY), not as Blueprint waypoint rows.
- Progress UI: `public/progress.html`, `src/progress/read.mjs` (`nextStepOf`).
- Overdue chase ladder (not a coach agent): `src/nudge/` — SMS/email then CSM task at step 4 (`STAFF_TASK_ROLE = "csm"` in `src/nudge/run.mjs`). Ladder overdue days: 0 / 2 / 5 / **9** in `src/nudge/ladder.mjs` (`STEPS`). That is **days overdue on a waypoint**, not Chris’s “client went quiet for N days” setting.
- Agent runtime: `src/agents/`. Context: `src/agents/context.mjs` `fetchContext` — **does not load waypoints** (verified in §5).
- Proof-to-clear for mail receipt / bureau photo: **not** in `src/waypoints/verify.mjs` (only paydown + no_new_credit). Self-attest exists: `src/waypoints/self-attest.mjs`. Uploads: `api/documents-upload.mjs`.

**B. Backend**

- Keep `waypoint_definitions` / `client_waypoints` as source of truth.
- Add dispute-round definitions (mail letter, upload receipt, wait for bureau response) with `due_offset_days`, ordered `position`, and new `verify_kind` values handled in `src/waypoints/verify.mjs` (or a dedicated proof reviewer that completes the waypoint).
- Proof clears step only when: re-pull shows the change, photo of mail receipt, or uploaded bureau response — owner rule. Wire upload → review → `completeWaypoint`.
- Agent texts about **current open step** via existing SMS provider pattern (`src/messaging/providers/*`, queue + `src/messaging/dispatch.mjs`).
- Quiet / “stop”: CSM task via `createTask` with `assigneeRole: "csm"`. Quiet **days not set** by Chris. Related placeholder already in repo: nudge ladder step 4 at **9 days overdue** (`src/nudge/ladder.mjs`) — different meaning; do not silently reuse without owner say.
- Letter-mailing **upsell** charge: must use a keep Commas title. Self-serve dispute round pricing exists in `src/waypoints/pricing.mjs` / `src/paid-services/round.mjs` ($100 base etc.) — that is round pricing, not “per letter mailed.” Catalog maps DIY pack to vendor title **Consulting Services Letters** in `offers.mjs`, which is **not** on the keep list. **Blocker:** do not invent a product name; ask which keep title bills letter mailing.

**C. Frontend**

- Client checklist: `public/progress.html` (and portal link in `public/app/client-portal.html`). Staff: CSM queue `public/app/csm-queue.html` for exceptions.

**D. Agent**

- **No dedicated Blueprint coach agent exists today.** Build by extending agent prompts + select rules in `src/agents/` and putting open waypoints into `fetchContext`. Nudge ladder is backup chase, not the coach.

**E. Build order**

1. Open step in agent context.  
2. Dispute-round waypoint rows.  
3. Proof-to-clear.  
4. Quiet/stop → CSM.  
5. Letter-mail upsell billing (after keep title decision).

**F. 48-hour vs later**

- **48-hour:** one agent job = text about existing open waypoint; put open waypoints in `fetchContext`; escalate “stop” / ladder-exhausted to CSM.  
- **Later:** dispute steps, photo proof gates, letter upsell, dedicated agent row polish.

---

### 4.8 CSM assigned to each client (exceptions and closing prep, not every check-in)

**A. What exists today**

- Role: `db/migrations/290_csm_role.sql`. Desk: `public/app/csm-queue.html`, API `api/read/csm-queue` (and related read tests).
- Tasks created with `assigneeRole: "csm"` (nudge step 4, AR, SLO cultivate paths, etc.).
- **No** `assigned_csm` / `csm_staff_id` column on clients was found. Queue is role-based open tasks, not “this CSM owns this Blueprint client.”

**B. Backend**

- Need durable assignment: which staff CSM owns this client (migration + write on Blueprint close / pay).
- Agent does regular check-ins. CSM tasks only for: quiet/stop exceptions, closing prep call before closer, other owner-named exceptions.
- Prep call: task on CSM queue; answers may use existing insights path (`customer_insights`, CSM form on queue).
- Closer alert only after prep steps closed **and** UnderwriteIQ ready (see 4.4).

**C. Frontend**

- `public/app/csm-queue.html` — exceptions and prep list. Not a daily check-in farm for every client.

**D. Agent**

- Agent owns check-ins. CSM is human backup. Do not make the CSM the default rung for every nudge if product says agent owns check-ins — align nudge step 4 / new quiet rule with that split when building.

**E. Build order**

- Assignment field → prep task types → gate closer alert.

**F. 48-hour vs later**

- Role + queue exist. **Per-client assignment + prep gate are later** (short if only assignment + one task type).

---

### 4.9 Credit partner file

**A. What exists today**

- Soft pull, UnderwriteIQ, checklist are all **one client id**.
- Spouse appears in sales scripts (`public/app/present.js`) as an objection, not as a second credit file.
- No `related_client` / household / co-applicant table linking two credit files for stacking was found. **Not in the repo.**

**B. Backend**

- Model a second `clients` row (or explicit partner link table) tied to the primary Blueprint account.
- Partner gets: own soft-pull consent (`soft_pull_consent` on **their** id — primary consent does **not** cover them), own soft pull, own UnderwriteIQ run, own checklist seed.
- Dashboard merges both files and shows **combined approval amount** (sum/stack rule must use existing preapproval fields — do not invent math).
- One partner included. **Do not add a fee.** Do not create a Commas product for “partner add-on.”

**C. Frontend**

- Staff Present / client control / progress: show primary + partner and combined amount. Portal may show both checklists. Exact screen: extend existing closer/present and progress reads — Claude builds UI when named.

**D. Agent**

- Same accountability pattern per person (open step on that person’s waypoints).

**E. Build order**

- Link model + consent for partner → pull → UnderwriteIQ → checklist → combined amount UI.

**F. 48-hour vs later**

- **Later.** Second-person model is greenfield.

---

### 4.10 Bank relationship tracker

**A. What exists today**

- Business checking is already a **self-serve waypoint** (`business_checking` in 362 seed) — open a business checking account. That is not the same as “open accounts at match-list banks and track deposits.”
- Lender/match list is a Blueprint deliverable (pack contents). Deposit / relationship tracking for those banks: **not in the repo** as a tracker product.
- Fulfillment next-actions know funding prep concepts (`src/fulfillment/next-action.mjs`) but not this tracker.

**B. Backend**

- To-do / waypoint-style rows per business and personal file for named banks — only when the closer offers it to clients who **already have capital** to fund deposits. Not seeded for every Blueprint buyer.
- Tracking deposits needs bank data or staff attestation. Do not invent deposit amounts.

**C. Frontend**

- Checklist / Finance OS / fulfillment desk — pick one home when building; default: staff to-do on closer/funding desk, client sees offered items only.

**D. Agent**

- Only chase if the step was offered and opened. No agent invents bank opens for everyone.

**E. Build order**

- Closer offer flag → optional waypoints → deposit proof later.

**F. 48-hour vs later**

- **Later.** Closers can offer verbally without product until tracker exists.

---

### 4.11 Next Funding Sequence

**A. What exists today**

- Owner rename: this is **Next Funding Sequence** (was “round two planner” in the prior brief).
- Shows the **date the file is ready for the next sequence of rounds**.
- Partial cousins: `ready_for_next_round` custom field + task after inquiry removal (`c-03`); fulfillment `prepare_next_round`; funding rounds table. None of these is the Blueprint post-funding recovery date planner. **Not in the repo** as this product.

**B. Backend**

- After funding, compute or staff-set a **ready date** for the next sequence; alert closer when that date hits (task via `createTask`, role closer).
- Do not invent recovery formulas. If math is not owner-set, store a staff-entered date first.

**C. Frontend**

- Finance OS and/or closer dashboard: “next sequence ready on DATE.”

**D. Agent**

- Optional reminder; human closer owns the fee close.

**E. Build order**

- Funded client → ready date field → alert job.

**F. 48-hour vs later**

- **Later** (staff-entered date + task is a thinner later slice than auto math).

---

### 4.12 Welcome kit (physical)

**Keep:** hat, stickers, mailed package with file analysis, plan, and bank list.

**Add:**

- Metal card with QR code to the app  
- Round-one mailing kit: envelopes, certified mail forms, and a pen  
- One-page summary in the laminated packet: how much they qualify for **today** and **after the plan** (numbers from UnderwriteIQ / funding snapshot — do not invent)  
- Signed note from Chris  

**A. What exists today**

- No welcome-kit fulfillment module, inventory, or ship trigger for Blueprint was found in product code. Partner welcome email exists (`src/partners/welcome.mjs`) — different product. PostGrid is for **letters**, not swag kits. **Physical kit ops: not in the repo.**

**B. Backend**

- Minimum: on Blueprint pay, create a **fulfillment / ops task** (role TBD — funding_advisor or ops) with kit checklist. PDF one-pager can reuse funding snapshot numbers from existing deliverables.
- QR target: live app/portal URL already known (`https://fundhub.ai` / portal). Do not invent a new domain.

**C. Frontend**

- Staff fulfillment desk / task queue. Not a client marketing page.

**D. Agent**

- No agent. Ops ships.

**E. Build order**

- Pack PDFs exist from pull → print one-pager → warehouse ships kit. Soft pull + deliverables before personalized packet.

**F. 48-hour vs later**

- Ops task on pay is a thin slice. Metal cards / warehouse inventory are **ops later**, not a code fantasy.

---

## 5. Required verify — does agent context load checklist steps?

**Claim from the brief:** “the agent context doesn't load open checklist steps today.”

**Verified: TRUE.**

- Function: `fetchContext` in `src/agents/context.mjs`.
- It loads: conversation, recent messages, survey keys, client row, pipeline stage, funding round, custom-field snapshot (fico, prequal, `agent_context` field, etc.), customer insights, recent call outcomes.
- It does **not** query `client_waypoints`, does not call `src/progress/read.mjs`, and does not mention checklist / next step in `formatPromptBlock`.
- Grep under `src/agents/` for waypoint/checklist: **no matches**.

So a Blueprint coach cannot honestly “stay on the open step” until `fetchContext` (or a sibling used by the runtime) loads open waypoints / `nextStep`.

---

## 6. Accountability rules (exact)

| Rule | Spec |
|---|---|
| Source of truth | Existing checklist: `waypoint_definitions` + `client_waypoints` (`src/waypoints/*`, migrations 330/361/362). |
| Dispute-round steps | Add them. Today’s seed has **no** letter-mailing steps (362 verified). |
| Order + due dates | `position` + `due_at` / `due_offset_days`. |
| Agent check-ins | Agent texts the **current open step**. CSM does **not** check in on every client. |
| Clear a step | Only with proof: re-pull change, mail-receipt photo, or uploaded bureau response. |
| Quiet / stop | CSM gets a task. Quiet **days not set**. Related existing constant: nudge step 4 at 9 days **overdue** in `src/nudge/ladder.mjs` — different meaning. |
| CSM prep | CSM runs prep call **before** closer calls. |
| Closer alert | All prep steps closed **and** UnderwriteIQ shows file ready. |

---

## 7. Commas / charge blockers (do not invent titles)

| Charge | Keep title? | Note |
|---|---|---|
| Capital Blueprint $5k–$10k | Consulting Services Package (`consulting-package`) | In catalog today at $5,000 list; owner range allows up to $10,000 — price change is a separate owner edit, not this spec’s job. |
| Monthly member fee after 12 months | **Unset** | Amount not set. Which keep title? **Blocker until Chris says.** |
| Monthly soft pull (if billed extra) | **Unset** | Prefer include in Blueprint/Finance OS. Extra SKU needs keep title. |
| Letter-mailing upsell | **Blocker** | No keep title for per-letter mail. Do not use or invent “Consulting Services Letters” as a new catalog create. Reuse a keep title Chris names, or bill via an existing keep product id only. |
| Credit partner | No charge | Included. |

Never `POST /public-api/products/create`.

---

## 8. Single next build step

**Wire open checklist steps into `fetchContext` (`src/agents/context.mjs`) and point one existing agent prompt at the client’s current open waypoint so SMS check-ins can name the real step — without adding dispute-letter waypoints, Plaid, or live bureau fulfilment yet.**

That is the smallest product difference from the $297 roadmap a closer can say out loud: the $5,000–$10,000 offer has a coach on the open checklist step.
