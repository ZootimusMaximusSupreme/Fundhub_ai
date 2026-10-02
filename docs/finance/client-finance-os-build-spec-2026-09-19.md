# Client Finance OS — build spec

**COMPLIANCE REVIEW REQUIRED** — this product talks about credit, pay-down, and money advice. Bank login and stored bank keys need a human compliance pass before they go live. CLAUDE.md §7. This label is a marker. It is not legal advice.

**Date:** 2026-09-19
**Owner:** Chris
**Status:** spec only. Not launch-necessary tonight. Do not write product code from this file until Chris reviews it.

---

## Chris law — never skip this order

Always, in this order:

1. **Build spec** (this file)
2. **Review / perfect** the spec with Chris
3. **Backend** — then revise until the data is perfect
4. **Front end last** — a screen is a window onto proven data

Do not skip to code. Do not draw a screen first. Do not “just wire Plaid” to look busy.

This matches owner rule 3a: workflow first, then tables, then a read that is tested, then a one-page flow picture, then the page.

---

## 1. What it is

A **client-only money home**.

One signed-in person sees **all of their money in one place**: personal cards, business cards, personal banks, business banks.

They get:

- **Dashboards** — a simple overview (what you have, what you owe, money in vs out). Charts are allowed. Fancy art is not required.
- **Cashflow** — money in vs money out **over time**. Personal cashflow and business cashflow stay **two pictures**. Never one mashed cash number.
- **Debt** — what they owe as **all debt**, **per business**, and **per card**.
- **Wallets and dues** — balances, due dates, bills we are sure about.
- **UnderwriteIQ** suggestions for paying balances down.
- A **money helper** that can remind them or hand a human a task when they are stuck.

A **live bank login (Plaid)** is how wallets and cashflow can fill in later. It is **not live today**. Empty plugs already exist. Do not say Plaid is on.

It is **not** the staff desk at `/app/finance-os.html`.

That staff page is for employees. It has a “find a client” picker and the CRM side menu. Staff keep that desk. Do not turn it into the client hub. Do not make a client pick themselves from a staff list.

FundHub CRM stays **fundhub.ai**. Do not bring back any old CRM vendor.

This hub is **the client’s own wallets**, not FundHub billing (our plans, our pay links, our invoices). Those stay on the staff money desk.

---

## 2. Who uses it, and when

**One role:** the signed-in **client**.

They open it after they have a FundHub login. Typical moments:

- They just bought help and want one place for their money picture
- A card payment is coming due
- They want to know what to pay down first
- They want the money agent to remind them or to get a human when they are stuck

**Staff** do not use this page to work a file. Staff keep `/app/finance-os.html`.

**Partners** stay out.

**First question the page must answer** (top-left, largest):

> “What money do I have, what do I owe, and what should I do next?”

Not company metrics. Not “pick a client.”

---

## 3. What they connect

Personal **and** business:

- Checking and savings
- Credit cards
- Other bank products the client actually has (loans, if we store them)

Each account must be labeled **personal**, **business**, or **not sure yet**.

“Not sure yet” is a real answer. It is **not** personal. The repo already stores that as `unknown`. Mixing piles into one “total cash” number is not allowed. Personal money and business money stay in separate groups.

**How they connect in version 1 (tonight / first backend — not Plaid)**

- Honest **typed-in** wallets are already how the product works today. A typed row must say it was typed in. Never dress it up as a live bank login.
- A **live bank login** (Plaid) is a **later** backend step. **Not tonight. Not live.** Tables and empty plugs already exist. The plugs still say “not built.” Do not draw a fake Chase button while that is true.

**How Plaid plugs in later (spec only — do not build it in this hub’s first pass)**

When Chris + a human compliance pass say go, Plaid is the fill-pipe for this hub. It does not replace the dashboards. It feeds them.

1. Client agrees (consent date on the login row). No consent stored = no login.
2. Plaid Link runs in the client hub (not the staff desk).
3. One bank login becomes one `plaid_items` row. Token stays ciphertext. We never print it.
4. That login can cover several accounts (checking + savings + a card). Those land in `bank_accounts`, still labeled personal / business / not sure yet.
5. Charges and deposits land in `bank_transactions`. Cashflow charts read those rows. No rows = no fake history.
6. Cards and loans we already store stay. Plaid does not invent a second set of numbers that disagree in silence. If two sources disagree, show both and say so. Do not pick a winner in this spec.

Until that pass: typed-in is the real product. The page never says “connected to the bank.”

The client may add more than one bank. One login at a bank can cover several accounts (checking + savings + a card). That is how the existing bank-login table is shaped.

We never store a full account number or a routing number on a dashboard table. Last 2–4 digits only.

A mixed / family / “both personal and business” account stays **not sure yet** until Chris names a rule. Do not invent a “mixed” label in this spec.

---

## 4. What they see

Four honest states, later, on the screen: loading, empty, error, full. Empty is not fake rows.

The page is a **dashboard first**, then the lists. Not a wall of accounts with no overview.

When there is data, they see:

**Dashboard (overview + simple charts)**

Top-left still answers: what you have, what you owe, what to do next.

Four overview boxes (simple bars or tiles are enough — this spec is not HTML):

1. **Cash** — personal cash, business cash, not-sure-yet cash. **Never one added-up cash number.**
2. **Debt** — all debt, then per business, then per card (see §4c).
3. **Cashflow** — money in vs money out over time. Personal chart and business chart stay **apart** (see §4b).
4. **Next** — next due + one UnderwriteIQ line.

Charts use stored numbers only. No fake history. A hole is a dash, not a pretty zero.

**Wallets**

- Personal banks
- Business banks
- Accounts we have not labeled yet (call them unclassified)
- Cards, with limit, balance, and room left when we know both numbers

**Payments**

- When each card payment is due
- Minimum due, when we have it
- Past due, when we have it
- We do **not** claim “paid” unless we stored that they paid. A due date that passed only means the date passed.

**Bills**

- Repeating charges we are confident are bills (rent, insurance, and the like)
- Weak guesses stay off the main list. They are not bills.

**Honesty rules already in the math**

- A missing number is a dash, never $0.00
- A total with holes is a floor, not a perfect total
- Money in is often a hole today. “What is left” is a worst case, not a forecast. Say that out loud. Do not print $0 income as if they earn nothing.
- Stand-in / mock bank rows must be labeled **not real** if any exist

This hub does **not** show FundHub’s own subscription plans or staff payment-link minting.

---

## 4b. Cashflow management

This hub is a **cashflow system**, not only a list of banks.

**Job:** show **money in vs money out over time**, so they can see if a month is tight before a card is due.

**Hard split**

- Personal cashflow is one picture.
- Business cashflow is another picture.
- Not-sure-yet stays its own picture until it is labeled.
- **Never mash personal and business into one cash number, one in-bar, or one out-bar.**

**What “in” and “out” mean**

| Side | What we count | Honesty |
|---|---|---|
| **Out** | Bills we are sure about, card minimums we stored, other outflows in `bank_transactions` if those rows exist | Weak guesses stay off the main chart |
| **In** | Deposits we stored, or pay the client typed in | If we have **no** inflows, the in-bar is a **dash / “we do not know money in yet.”** Never $0.00 as a fake paycheck |
| **Over time** | Week or month buckets from stored dates | No transaction rows = no fake history. Show the repeating bills on a calendar instead |

**Tool we already have (reuse, do not rewrite)**

`src/banking/cashflow.mjs` already answers: “when can you set a card payment so cash does not go below zero?” It uses two tracks (what is sure vs worst case). A missing number returns **no date**, not a guess. The client hub must show that refusal. Today that door is staff-gated. Client session gate is backend work after this spec.

That projector is **not** a full in-vs-out history by itself. It is the “when to pay” tool **inside** cashflow. The dashboard still needs the in-vs-out charts above.

**Until Plaid**

Typed-in wallets + known bills + known card dues. Say money-in is missing if we have no deposits. Do not invent paychecks.

**After Plaid (later)**

`bank_transactions` can fill real in and out. Charts then show history. Still two pictures: personal vs business. Still no mashed cash total.

---

## 4c. Debt management

This hub is a **debt system**, not only a card list.

They must see owed money three ways. All three. Always.

**1. All debt (global)**

One number: everything we know they owe (cards + loans we actually store).

- A hole in one card makes this a **floor**, not a perfect total. Say so.
- Missing balance = dash on that line. Do not treat it as $0 owed.
- Personal debt and business debt may **add into this one “all debt” number**, because Chris asked for a global total. Cash still never works that way.
- Under the global number, still show the split: personal owed / business owed / not-sure-yet owed. So they can see the mix.

**2. Per business**

Each named business on file gets its own owed pile (that business’s cards and loans).

- Personal is its own pile, not a business.
- Not-sure-yet is its own pile. Do not dump it into personal or into a business.
- Two businesses = two piles. Do not mash “all companies” into one business number.

**3. Per card**

Each card: owe, limit, room left, due, minimum — when we have those numbers.

- A **$0 limit** or **unknown limit** must not become “pay this card down to $0.”
- Loans we store show as their own rows in the same three views. If we do not store a loan, we do not invent one.

**Reuse**

`GET /api/read/finance-os` already has a **total card balance** across revolving lines (`os-grid`). That is the card piece of global debt. It is **not** per-business by itself. Backend must group by personal / each business / unclassified. Do not invent a second advice brain. Pay-down sentences still come from UnderwriteIQ.

---

## 5. UnderwriteIQ suggestions / pay-down

Reuse the engine we already have. Do not write a second advice brain.

`GET /api/read/underwrite` already returns the engine’s own English sentences **word for word**. We do not soften them, extend them, or add “you will get approved.”

Those sentences already cover:

- Pay revolving balances down when use of the cards is high
- File build-out and cleanup themes the engine already emits
- Missing fields named beside a sentence, so we do not print a confident line on empty data

Pay-down on this hub means:

- Show the suggestion
- Show the numbers behind it (balances, limits, use of credit)
- If the client is on a repair checklist, show the existing pay-down waypoint for each card — do not invent a third target

We do **not** promise a score jump as FundHub’s own claim. If the engine’s stored sentence says that, it stays a vendor sentence, marked for compliance review. We add no new outcome claims.

A card with a **$0 limit** or an **unknown limit** must not become “pay this card down to $0.” That bug already happened in the printed reports. This hub must not repeat it.

---

## 6. The agent

A **money helper for this client**, not a staff bot, not a bank login robot.

**What it does**

- Knows the client’s wallets, dues, cashflow picture, debt piles, and UnderwriteIQ suggestions
- Gives **practical** next steps: which bill is soon, which card is heavy, whether this month’s out is bigger than in **on the pile it belongs to**, what to pay first **from the stored numbers**
- Helps them **manage accounts in FundHub**: label personal vs business, mark a due they say they paid, ask them to add a missing wallet
- If they are **struggling**, stop advising in a loop and **hand a task to the client success manager (CSM)**

**Struggling** means one of these, all observable:

- A card due date has passed and we have no payment on file
- They say they cannot pay
- They ask for a person
- They opt out or mention a lawyer — then the helper **stops texting** (same stop rules as the rest of outbound)

**What it does not do**

- Log into Chase or any bank
- Move money, pay a card, or ACH
- Invent a balance
- Text from a personal prove phone. Sims use the agent number already in the repo.

**How it reaches them**

- **Now:** SMS on the live Twilio send path (queue a message, dispatcher sends). No extra SMS beyond what this helper’s events ask for.
- **Later:** push, when a real client app / subscribed device exists. Web push code already lives on the client portal. Do not fake Apple or Google store push. Do not build an App Store listing as part of this hub.

**Reuse, do not clone**

- The overdue **checklist** chaser (`waypoint-nudge`) already texts, then emails, then texts, then at the last step opens a **CSM task** and does **not** send a fifth client message. Copy that escalate pattern. Do not reuse the checklist copy for bank advice.
- There is **no** live Agent Editor row whose job is “manage all wallets.” That row is new work on the backend pass, after this spec is approved.

---

## 7. What already exists in the repo

Nothing below is a client hub. It is the pile we reuse.

### Staff page

- `/app/finance-os.html` — employee desk. Pick a client. CRM chrome. Reads several money APIs. **Not** the client product.
- Pulse already watches `finance-os.html`.

### Math and reads (staff-gated today)

A signed-in **employee** can already load one named file. A signed-in **client** is not admitted on these doors today. That client gate is work we still must build.

| Door | What it is |
|---|---|
| `GET /api/read/finance-os` | Seven credit numbers from **cards on file** only (limit, balance, room, use of credit, open lines, average APR, cheapest room). Source is `tradelines`. |
| `GET /api/read/money-map` | One join: cards due, bills, cash groups, alerts, use of credit from named engines. |
| `GET /api/read/underwrite` | UnderwriteIQ Lite: assessment + suggestion sentences + missing fields. |
| `GET /api/read/finance-command` | Company roll-up for staff. Marketing spend is company-wide. **Not** a client page. |
| `GET /api/finance/cashflow` | Day-by-day money picture + “when can I pay.” Staff-gated today. Money in is often missing. |
| `GET /api/finance/bank-accounts` | Typed-in bank buckets. Owner / admin / sales manager write. |
| `GET /api/finance/bills` | Repeating bills. Same tight write set. “Redetect” reads stored charges. It does not call a bank. |
| `GET/POST /api/banking/accounts` | Another typed-in write path (accounts, statement cycles, holdings). |
| `POST /api/banking/sync-accounts` | Asks a **provider**. Plaid still refuses. Mock is not a default. |
| `POST /api/banking/revoke` | Drops **our** stored bank login row. |

Code behind the numbers (no browser math):

- `src/finance/os-grid.mjs`
- `src/finance/banking-surface.mjs` — personal / business / unclassified; **no combined cash total**
- `src/finance/money-map.mjs`
- `src/underwrite/engine.mjs` + `src/underwrite/adapter.mjs` + `src/underwrite/report.mjs`
- `src/banking/recurring.mjs`, `cashflow.mjs`, `reminders.mjs`

The old `money-map.html` page is **gone**. The math stayed. Staff Finance OS absorbed the desk.

The client portal (`/app/client-portal.html`) is the client’s home today. It talks about UnderwriteIQ as a **service they can book**. It is not this money hub yet.

### Tables

| Table | What it holds |
|---|---|
| `tradelines` | Card **facility** from a credit file (lender, limit, balance, APR) |
| `card_liabilities` | Card **bill** (minimum, due date, statement) |
| `bank_accounts` | Banks and cards from a connection **or** typed in. `entity_kind`: personal / business / unknown |
| `entities` | Named wallets under one person (personal vs a business) |
| `plaid_items` | One row per bank **login**. Token column is ciphertext only. Consent date is null until they agree |
| `bank_transactions` | Charges and deposits **if** something wrote them |
| `recurring_bills` | Detected repeating outflows |
| `cashflow_reminders` | Stored “act on this” rows |
| `businesses` | Company on file (age). Used by UnderwriteIQ. Not the wallet grouping table |

### Plaid — empty on purpose (later plug-in, not live)

- `src/banking/plaid.mjs` has two **empty** plugs: `linkAccount` and `getAccounts`. They return “not configured” or “not implemented.” They do **not** call Plaid.
- Keys it would need, **names only**: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_TOKEN_ENC_KEY`. They are **not** in `.env.example`.
- Config present still does **not** mean the feature works. The plug still says not implemented.
- There is **no** live `POST /api/webhooks/plaid` route. Past checks saw 404.
- There has **never** been a Plaid Link / “Connect Chase” control in the product.
- Storing a real bank key needs SOC 2 review, a consent flow, and a human “turn it on.” An agent must not close that plug.
- **How it plugs into this hub later** is written in §3. Dashboards, cashflow, and debt **read** the tables Plaid would fill. They do not call Plaid themselves.

Typed-in banks are the **real** product today, not a placeholder.

### Agent / SMS / push already nearby

- Outbound SMS: Twilio provider + message queue + dispatcher
- Checklist chase: `src/nudge/run.mjs` — last rung is a **CSM** task, no fifth text
- Client portal can be installed as a web app; web push send path exists (`src/push/`). Apple / Google **store** apps are a **separate** owner track. Not this hub.

### FundHub billing (leave it on the staff desk)

Subscriptions, cards on file for **us**, and payment links are staff finance jobs. See `docs/FINANCE-OS-REBUILD-HANDOVER.md`. They are not this client hub.

---

## 8. What we must build (in order)

Do not start a later step until Chris has approved the spec and the earlier step is proven.

### Step 0 — this spec

Done when Chris says the spec is right (or names the edits).

### Step 1 — review / perfect

Chris reads this file. He names changes. We revise **this spec**, not the app.

Open decision for that review (one choice):

- Put Money **inside** the client portal, or
- Give Money its **own** client-only URL

Default if he does not care: **inside the client portal**, so the client has one home. Still **not** `/app/finance-os.html`.

### Step 2 — backend workflow and data (no screen)

Prove, in the database and APIs, that one client session can only see **their** file.

1. **Client-owned read** of the existing money picture (dashboard numbers, cashflow in vs out with personal/business split, debt rollups: all / per business / per card, wallets, dues, bills, seven credit numbers, UnderwriteIQ suggestions). Same math modules. Session client id only. A `client_id` in the URL cannot open someone else.
2. **Client-owned writes that are safe without Plaid:** add / label / close a **typed-in** wallet; say personal vs business; typed-in repeating pay **only if** we already have a place to store it (ask Chris before a new table). No full account numbers. No “sync from Chase.” No Plaid in this step.
3. **Empty states that are true:** no wallets yet; wallets typed in; credit file present but no banks; cashflow with bills but no money-in (dash, not $0); mock rows labeled not real.
4. **Money agent** as a real Agent Editor row + events: reminder, suggestion, “I need a human.” SMS now. CSM task on struggle. Stop rules shared with the rest of outbound.
5. Tests against a real scratch database as `fundhub_app`. Prove isolation. Do not point verify at live.

New tables only if a proven gap exists (for example: “client said they paid this due” if no table can hold that). Prefer columns on what we have. Ask Chris before a new table.

**Then revise until perfect.** A wrong total is a backend miss. Do not “fix it in the page.”

### Step 3 — one-page flow picture

After the reads work, write `docs/journeys/client-finance-os-flow.md`: states a wallet moves through, and the event that moves it.

When we build the screen, Builder also writes `docs/journeys/client-finance-os-intended.md` for Chris to approve. Agents do not silently edit other intended journeys to match.

### Step 4 — front end last

Only after backend numbers are proven.

- Client-only. Four states. Dashboard + cashflow charts + debt (all / per business / per card). No dead “Connect Chase” button.
- No staff picker. No CRM employee menu.
- Click the path twice on the live site before calling it done.
- Add the live page to the pulse list in the **same** change.
- Do not restyle the staff Finance OS page while doing this.

---

## 9. What we do not build yet

- **Plaid / live bank login** while keys are missing, while the plug is empty, or before Chris + compliance say go. Do not implement Plaid in the first backend pass of this hub. The plug-in is **specified** here. It is **not live**.
- **A fake Chase (or any bank) button** that does not connect
- **App Store / Play listing** as part of this hub. That is a separate owner track. SMS now. Push when a subscribed app exists.
- **Paying a card from FundHub** (ACH, card-to-card, bill pay)
- **Pretending we know money in** when no deposit rows exist (money-map already says income is not modelled). Typed-in pay is allowed. Auto-detected paychecks wait for stored transactions / later Plaid.
- **A combined cash number** (personal + business mashed). All-debt is allowed. Combined cash is not.
- **A combined net-worth number**
- **New Commas catalog products**
- **Any GoHighLevel / old CRM vendor**
- **Staff Finance OS redesign**
- **Launch-blocking this for the Saturday launch.** Owner: not tonight.

---

## 10. Done looks like

One real client (or one plus-tag sim) signs in.

1. They land on **their** money home (not the staff desk).
2. They see a **dashboard**: cash (split), debt (all + per business + per card), cashflow (in vs out, personal and business apart), and what to do next.
3. They see **all wallets we have for them**, split personal / business / unclassified. Empty is an honest empty, with one action: add a wallet.
4. They see balances, what is due, and bills we are confident about.
5. They get **one UnderwriteIQ suggestion** that matches their file (or a clear “we do not have enough on file yet”).
6. The **agent can act**: it sends an SMS that uses those numbers, and if they are struggling it opens a **CSM** task instead of nagging.

If banks were only typed in, the page says typed in. It never says “connected to the bank.”
If money in is unknown, the cashflow in-bar is a dash, not $0.

---

## Builder gate (seven answers)

1. **Role** — client only.
2. **One job** — show this person their money dashboard: cash, cashflow, debt, and the next money move.
3. **First question** — “What money do I have, what do I owe, and what should I do next?”
4. **Reuse** — `os-grid` (card totals), `banking-surface` (personal / business / unclassified; **no combined cash**), `money-map`, `cashflow.mjs` + `cashflow-seam` (pay-date projector), UnderwriteIQ adapter/engine, bank_accounts / tradelines / liabilities / bills / bank_transactions tables, Twilio send path, CSM task pattern from waypoint-nudge, client portal login. Staff `/app/finance-os.html` stays staff. Plaid module stays an **empty plug** until a later pass.
5. **Data** — same tables. New work is **client session gates**, dashboard/cashflow/debt rollups (all / per business / per card; cash never mashed), typed-in client writes, money-agent events, maybe one “they said they paid” field if we cannot store that today. Live Plaid is **not** in v1.
6. **Files (when Chris says go — not tonight)** — client read handler + tests; agent seed; `docs/journeys/client-finance-os-flow.md`; intended journey; pulse row; **then** the client screen. Do not edit `public/app/finance-os.html` for this product.
7. **Risk / proof** — risk: a client reads another file, or a typed balance looks live. Proof: isolation tests + live click twice as that client. Unknown money stays a dash.

---

## Risk

A staff desk and a client hub that share one URL will leak employee tools or the wrong file. Keep them apart.

---

## Left undone (on purpose)

- No product code from this spec tonight
- No Plaid implementation (plug stays empty; spec only says how it plugs in later)
- No App Store
- No commit of the dirty tree

**Next:** Chris reviews this spec. Reply with GO or the edits. Then backend. Screen last.
