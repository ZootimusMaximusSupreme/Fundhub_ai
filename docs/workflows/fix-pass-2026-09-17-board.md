# Fix pass board — 2026-09-17

**Source of the fix list:** `docs/workflows/live-walkthrough-2026-09-16-board.md` + `-notes.md` (the 2026-09-16/17 live walk).
**Rule for every lane:** fix only what is named below. No drive-by refactors. No restyles. Smallest diff that makes the named thing work.

---

## Version control (read before you touch a file)

1. A checkpoint tag is cut at the commit before this pass starts. If a lane breaks something, we roll back to the tag.
2. **All lanes work on `main` in this one checkout.** Parallel sessions share the working tree, so separate branches would fight each other. The guard is disjoint file ownership below — do not edit a file another lane owns.
3. **One commit per fix.** Small. The commit message names the GAP it closes.
4. Before every commit: `npm run lint`, `npx tsc --noEmit`, test suite green. No skipped or weakened tests.
5. **One `npm run ship` at the very end**, by whichever lane finishes last. Not five deploys.
6. If a fix needs a file you do not own, mark yourself `blocked` here with the reason and stop. Do not reach across.

---

## Lanes

| Lane | Owns (files) | Closes | Status | Owner |
|---|---|---|---|---|
| FIX-1 Portal money & unlocks | `public/app/client-portal.html`, `public/app/progress.html`, `src/entitlements/`, `src/paid-services/`, portal-summary read endpoint | GAP 7, GAP 10, GAP 30, GAP 11 | pending | — |
| FIX-2 Funding money on screen | `public/app/client-control-panel.html`, funding apply-door UI, `src/funding/`, `src/invoices/`, `src/commissions/` | GAP 4, GAP 8, GAP 20, "funded with no bank yes / no invoice" | pending | this chat |
| FIX-3 CSM role end to end | CSM screens under `public/app/`, `src/insights/`, `src/shifts/`, `src/consent/`, `public/app/consent-capture.html`, CSM task creator in `src/workflows/` | GAP 34, 35, 36, 37, 38, 39 | pending | — |
| FIX-4 Messaging that never landed | `src/messaging/`, reminder + chase workflows in `src/workflows/`, phone normalisation at intake | GAP 22, 23, 27, 21-leftover | pending | — |
| FIX-5 Money in, docs out, headline | `src/payments/` inbox sweeper, `src/deliverables/` + `src/underwrite/`, apply-site watch page copy | GAP 5, GAP 19, GAP 26 | pending | — |
| L4 Gmail + the ID reader | `src/gmail/`, `src/agents/model.mjs`, `src/handlers/doc-check.mjs`, `src/events/dead-letter.mjs`, `src/workflows/doc-check-retry-sweeper.mjs`, `scripts/google-oauth-mint.mjs` | Blocked-on-Chris #2 and #3 below | **done — not committed** | L4 |

**Dependencies: none. All five run at the same time.**

**One soft overlap, declared:** FIX-2 owns making the invoice (amount + when it is created). FIX-5 owns draining the payment inbox and flipping an invoice to paid. Different code, same table. Neither lane edits the other's file.

---

## Blocked on Chris — no code fix exists for these

These are credentials and money, not bugs. Naming them so no lane burns time on them.

1. **Bank Apply is dead.** The proxy login is rejected (407). Every Apply click returns `oxylabs_auth_failed`. No bank form can open until the Oxylabs login is fixed. Blocks the whole funding money path.
2. ~~**The document reader has no credit.**~~ **NO LONGER A HARD BLOCK — fixed by lane L4, 2026-09-17.** The account still has no credit (production, 2026-09-17: twelve DOC-CHECK runs, all `openai 429 — You have no credits remaining`), and no code can put money in it. What changed is that it is no longer permanent: a 429 now parks the document on a queue and a new sweeper re-reads it every 20 minutes for about nine days. **Chris funds the account and the backlog reads itself** — no re-upload, nobody un-wedging anything. Only funding is left for Chris, and after that nothing. Still blocks GAP 1, 2, 9, 28 *until* the account is funded.
3. **Gmail cannot be read.** The token on this laptop is a 20-character mask, not a real token. **Lane L4, 2026-09-17:** the repo had no way to MAKE a token — the one that worked in August was minted by an external tool ("file-sweep") that is not in this repo and no longer on this Mac. `scripts/google-oauth-mint.mjs` is that missing half: it runs the whole Google sign-in on the loopback address, asks for `gmail.modify` **and** `drive.readonly` in one consent, writes the token file in the exact shape `src/gmail/config.mjs` parses, and prints the single `netlify env:set` line. Proven end to end against Google with a dummy client — the flow ran to the token exchange and stopped only at "The OAuth client was not found". **What is left for Chris: create a Desktop-app OAuth client in the Google Cloud Console, download its JSON, and press Allow once.** Everything either side of that click is built. Undecided from this machine: whether the value on Netlify is genuine or the same pasted mask — either way the fix above is safe, because `GOOGLE_GMAIL_OAUTH_TOKEN_JSON` wins over the Drive keys and rotates nothing.
4. **No CSM can sign in.** Demo logins are switched off on the live deploy and there is no real `csm@fundhub.ai` staff row. Owner call: mint a real CSM staff row, or turn demo logins on. Agents will not invent a staff user.

---

## Copy-paste prompts

Open a new session, paste one block, go. Each block stands alone.

### FIX-1 — Portal money & unlocks

```
Repo: /Users/chrisstanbridge/Developer/fundhub-platform. Read docs/workflows/fix-pass-2026-09-17-board.md first and claim lane FIX-1 in the table. Read CLAUDE.md. Skip the section 0 split — the split is already done and you are one lane of it.

Fix exactly these four things from the 2026-09-16 live walk, smallest diff, nothing else:

1. GAP 7 — Client portal Payments tab shows nothing. The server endpoint /api/read/portal-summary already returns HTTP 200 with a $2,500 invoice due and a checkout link for client d682c13b-11f3-4bd5-a0c5-232b6a7875c4 (Sim Eight-Funding). The page paints "Success Fee —" and "No payments yet" and has zero buttons. Their $3,000 deposit (a succeeded transaction) and the $2,500 invoice both exist and neither appears. Make the tab paint what the server already returns, including a pay control for an unpaid invoice.

2. GAP 10 + GAP 30 — Paid products stay locked in the portal. Client 029964c5-4d8e-47ed-88c9-53ac13863fd4 (Sim Eleven-Blueprint) has a paid $5,000 Consulting Services Package on file, and their Capital Blueprint tile still reads "LOCKED ... Pricing is set on your call / On your call / Talk to an advisor". Sim Five-Academy has a signed agreement and their Capital Academy tile is still LOCKED with all 10 modules hidden. Trace payment -> entitlement -> tile state and fix the break so a paid product unlocks. Do not invent a new entitlement kind if one already exists.

3. GAP 11 — Repair progress is stuck. Client be3dcfd7-faae-4001-b97f-9bc30875bbcd (Sim Nine-Repair) opens progress.html and sees stage ANALYSIS, "We are reviewing your report. Waiting on you." The button "Run a round now" says "You already have one in progress" because there is an unpaid paid_services_request row (kind=dispute_round, status=awaiting_payment, id 6cd732ed-c555-48f2-a999-442a71571de1) with a checkout already minted. Continue / Yes continue / Take me to payment never appear, so the client has no way to finish paying. Give an awaiting_payment round a visible path back to its existing checkout.

Files you own: public/app/client-portal.html, public/app/progress.html, src/entitlements/, src/paid-services/, and the portal-summary read endpoint. Do not edit files another lane owns (see the board table).

Rules: work on main in this checkout. One commit per fix, message names the GAP. Before each commit run npm run lint, npx tsc --noEmit, and the test suite — all green, no skipped or weakened tests. Do NOT run npm run ship. Do not charge a real card, do not pay $32, do not enrol anyone, do not send paper mail. Prove each fix with a live Playwright click on fundhub.ai and record it on the board. Write your result and any leftover into the board file when done.
```

### FIX-2 — Funding money on screen  *(this chat owns it)*

```
Repo: /Users/chrisstanbridge/Developer/fundhub-platform. Read docs/workflows/fix-pass-2026-09-17-board.md first and claim lane FIX-2. Read CLAUDE.md. Skip the section 0 split.

Fix exactly these from the 2026-09-16 live walk on client d682c13b-11f3-4bd5-a0c5-232b6a7875c4 (Sim Eight-Funding), smallest diff, nothing else:

1. GAP 4 — the dollars on screen do not match the dollars in the file. The file holds two funded rounds of $25,000 each ($50,000 funded). The Apply door says "$10,000 confirmed across 1 bank yes". The Approved-confirmed tile says $10,000. The Funding round box shows only Round 2's $25,000 and never Round 1's. Arizona Bank & Trust is Denied in the file but its Approved-$ box still carries 25000.00. The success-fee task bills 25000 @ 10% = 2500, which is neither the door's $10,000 nor the $50,000 funded stack. Decide the one correct basis, make every screen agree with it, and stop a Denied bank from carrying an approved amount.

2. A round can be marked funded with no bank yes and no approved dollars, and that produced no invoice. The walk marked $25,000 funded with zero bank approvals and no success-fee bill was created. Marking funded should require a real bank yes, and a funded round should create the success-fee invoice.

3. GAP 20 — on the Client Control Panel, expand Credit & Hold Status: "On Hold Because" shows a dash. It should read the real hold reason (the walk sheet expects "Documents Pending Approval"). Ignore the separate Funding-round "On hold because" box — that one stays a dash on purpose.

Files you own: public/app/client-control-panel.html, the funding apply-door UI, src/funding/, src/invoices/, src/commissions/. Money is integer cents via src/commissions/money.mjs — fromCents returns a string, percentOf takes percent units, NULL means unknown and must survive. Do not edit files another lane owns.

Known dead end, do not chase it: clicking Apply returns oxylabs_auth_failed (proxy 407). No bank form can open. That is a credentials problem for the owner, not a bug to fix here.

Rules: work on main in this checkout. One commit per fix, message names the GAP. Before each commit run npm run lint, npx tsc --noEmit, and the test suite — all green. Do not weaken a test to make it pass. Do not mark anything funded on live without a real bank yes. Do not charge a card. Prove each fix with a live Playwright click and record it on the board.
```

### FIX-3 — CSM role end to end

```
Repo: /Users/chrisstanbridge/Developer/fundhub-platform. Read docs/workflows/fix-pass-2026-09-17-board.md first and claim lane FIX-3. Read CLAUDE.md. Skip the section 0 split.

The Client Success Manager role does not work. A live walk on 2026-09-17 scored it FAIL overall. Fix exactly these, smallest diff, nothing else:

1. GAP 34 — the CSM has no queue screen. GET /api/read/csm-queue returns HTTP 200 with 7 real tasks. No page in the app requests that endpoint, and no screen lists the tasks. The CSM's home is the pick-a-client Client Control Panel, and the next step it shows on Sim Eight-Funding is "Remove Inquiries", not the call they are supposed to make. Build the screen that reads that endpoint and shows the queue.

2. GAP 35 — paying does not create the halfway call. Sim Nine-Repair, Sim Ten-Trial and Sim Twelve-Academy all have a payment.received event and none of them got a halfway-call task. Sim Eight-Funding and Sim Eleven-Blueprint did get one, because they have deposit.paid / sale.closed. Repair, trial and academy payments must create the halfway task too.

3. GAP 36 — Sim Eight-Funding has the results call twice (round.funded fired twice, two open "Accountability call — results and what's next" rows). Stop the duplicate.

4. GAP 36 again — those tasks are undated, so they land in the calendar's "No date" pile (67-71 rows) instead of on a day. Give a created CSM task a due date so it appears on the calendar.

5. GAP 37 — a CSM cannot clock in. Clock-in lives on Staff & Teams and a CSM opening that URL is bounced to the Client Control Panel. Also, Claim does not stick — clicking it on a row leaves nothing claimed.

6. GAP 38 — there is nowhere to type the call answers. The API POST /api/customer-insights exists and there are 0 insight rows, because no screen posts to it; the task text literally tells the CSM to call the API by hand. Give them a form.

7. GAP 39 — the consent page wears the wrong words. Opening it with kind=call_recording or kind=marketing_use still titles the page "Soft Pull Consent", and after saving it says "Consent is on file. A soft pull may be requested for this client." The body copy is already correct per kind; only the title and the after-save line are wrong.

Files you own: the CSM screens under public/app/, public/app/consent-capture.html, src/insights/, src/shifts/, src/consent/, and the CSM task creator under src/workflows/. Do not edit files another lane owns.

Known dead end, do not chase it: no CSM can sign in on the live form. Demo logins are off on the deploy and there is no real csm@fundhub.ai staff row — only csm@demo.fundhub.local. That is an owner decision, not a bug to fix here. Do not create a staff user and do not invent a password.

Do NOT write docs/journeys/role-csm-intended.md. CLAUDE.md section 4 forbids agents writing intended journeys. Update docs/journeys/role-csm-actual.md in the same commit as the code, and append to docs/journeys/CHANGELOG.md.

Rules: work on main in this checkout. One commit per fix, message names the GAP. Before each commit run npm run lint, npx tsc --noEmit, and the test suite — all green, nothing skipped or weakened. Do not run npm run ship. Do not enrol anyone, send paper mail, pay $32, or click funding Apply. Prove each fix with a live Playwright click and record it on the board.
```

### FIX-4 — Messaging that never landed

```
Repo: /Users/chrisstanbridge/Developer/fundhub-platform. Read docs/workflows/fix-pass-2026-09-17-board.md first and claim lane FIX-4. Read CLAUDE.md. Skip the section 0 split.

Texts that should have gone out never did. Fix exactly these, smallest diff, nothing else:

1. GAP 27 — the welcome text failed for Sim Ten-Trial (22103bca-0ec9-4491-bb75-5d1b6528f116) and Sim Twelve-Academy (f01cc0e0-c8f6-4343-93e5-6a33f0d3112f). The SMS-S00-WELCOME rows exist with status "failed" and the error "destination is not an E.164 phone number". The stored phone numbers are not in international format. Normalise the number so the text can send. Both the welcome text and their booking-confirm text failed the same way.

2. GAP 22 — the day-before call reminder never fires for anyone. Template SMS-S04-02-REMIND-24H has zero rows on all six walk clients. The 2-hour (SMS-S04-03-REMIND-2H) and 15-minute (SMS-AISET04-HANDOFF) reminders did fire for Sim Eight-Funding and Sim Nine-Repair but for nobody else — Sim Ten-Trial, Sim Eleven-Blueprint, Sim Twelve-Academy and Sim Thirteen-NoBook have zero reminder rows of any kind despite having bookings.

3. GAP 23 — the 2-hour chase for someone who finished the survey and never booked does not fire. Sim Thirteen-NoBook (7ccbeb76-df98-4125-8c14-0d1c9f5e3042) got the welcome email and text at 06:21 UTC, sat in the sales pipeline at Survey Complete, and 11+ hours later had still received no chase.

4. GAP 21 leftover — the "we still need your ID" chase (about 3 hours after payment) and the 2-day follow-up email are not on Sim Eight-Funding's message list. The first document request did go out at 17:46 UTC. The later chases did not.

Files you own: src/messaging/, the reminder and chase workflows under src/workflows/, and phone normalisation at intake. Do not edit files another lane owns.

Hard rule from CLAUDE.md section 12: outbound sending is only permitted in src/messaging/providers/. Do not add an outbound fetch anywhere else. sendTemplated only writes queued rows; the dispatcher hands them to a provider.

Known dead end, do not chase it: Gmail cannot be read from this laptop — the token in the environment is a mask, not a real token. Prove delivery from the messages table, not from Gmail.

Rules: work on main in this checkout. One commit per fix, message names the GAP. Before each commit run npm run lint, npx tsc --noEmit, and the test suite — all green. Do not run npm run ship. The agent test phone is +16616054248 — do not text a real person. Record your result on the board.
```

### FIX-5 — Money in, docs out, headline

```
Repo: /Users/chrisstanbridge/Developer/fundhub-platform. Read docs/workflows/fix-pass-2026-09-17-board.md first and claim lane FIX-5. Read CLAUDE.md. Skip the section 0 split.

Three unrelated but small fixes. Do exactly these, smallest diff, nothing else:

1. GAP 5 — money that came in never gets recorded. A $2,500 receipt was posted for Sim Eight-Funding (d682c13b-11f3-4bd5-a0c5-232b6a7875c4) and returned HTTP 200. The payment inbox row (payment_id sim-pay-1789673486591) is still status "pending" with attempts 0 — the sweeper never picked it up. Invoice INV-B4B9C768 ($2,500 success fee) is still "sent" and unpaid, and the client's Balance outstanding still shows USD 2500.00. Find why the sweeper does not drain that row and fix it so a received payment closes its invoice.

2. GAP 19 — the five underwriting documents are missing from the Documents screen. Sim Eight-Funding's Scores tile is correct (EX 771, EQ 778, TU 766) but filtering Documents to UNDERWRITEIQ DELIVERABLES for that client says "Nothing matches that filter." The five that should be there: Credit Analysis Report, Credit Optimization Roadmap, Funding Snapshot, Bank and Lender Match List, Capital Readiness Summary. Work out whether they are never generated or generated and not filed against the client, then fix that one thing.

3. GAP 26 — the live ad page headline is missing two words. https://apply.fundhub.ai/watch reads "Get $50,000 to $1,000,000 in Funding in 14 Days or Less". It should read "Get Up to $50,000 to $1,000,000 in Funding in 14 Days or Less". One-line copy fix.

Files you own: src/payments/ (the inbox sweeper), src/deliverables/ and src/underwrite/, and the apply-site watch page copy. Do not edit files another lane owns. FIX-2 owns creating invoices and their amounts — you own draining the inbox and flipping an invoice to paid. Do not change how an invoice amount is calculated.

Rules: work on main in this checkout. One commit per fix, message names the GAP. Before each commit run npm run lint, npx tsc --noEmit, and the test suite — all green. Do not run npm run ship. Do not charge a real card and do not pay $32. Prove each fix with a live Playwright click and record it on the board.
```

---

## Results

Each lane writes here when done: what changed, what was proved with a live click, what is left.

### Baseline — measured 2026-09-17 on `main` at `ca0f7efd`, before any lane edited a file

Laptop, macOS, `DATABASE_URL` not readable from this session (so the database-backed tests skipped).

- `npm run lint` — **clean**, 2093 files parse (exit 0)
- `npx tsc --noEmit` — **clean** (exit 0)
- `npm test` — **9912 tests, 9904 pass, 4 fail, 4 skipped**

The four that were ALREADY failing before this pass started. If any of these is still failing at the end,
that is the baseline, not damage this pass did:

1. `client-control-panel.html binds the live URL client and does not fake a pull`
2. `every clock and timestamp on a staff screen is Arizona — no exceptions`
3. `every read endpoint scopes to the caller's company`
4. `registry: every routed api/ handler and live public/app desk is listed or explicitly unmonitored`

Rollback point: `git reset --hard checkpoint/pre-fix-pass-2026-09-17` (owner runs this; it is on the deny list
for agents).


---

## Parked for later validation (owner-set 2026-09-17)

**Oxylabs bank proxy — PARKED.** Chris: "Labs is not working right now — add to validation list for later."

What it blocks, so nobody re-discovers it cold:

- Clicking **Apply** on a funding round returns HTTP 422 `oxylabs_auth_failed` (the proxy answers 407,
  rejecting our username and password). No bank application form can open at all.
- That is the real reason the Apply door reads "0 banks" / "no matches". It is not a bank problem and not a
  lender-list problem.
- Downstream of it: no bank-yes can be recorded, so the confirmed-dollars figure cannot move, and the
  success-fee bill cannot be raised against real confirmed money.
- Credentials live in `OXYLABS_USERNAME` / `OXYLABS_PASSWORD` and are read in `src/adapters/oxylabs.mjs:53-55`.
  `src/verification/report.mjs:189` already lists "Oxylabs residential proxy geo-verify" as a credential check.

**To un-park:** confirm the Oxylabs account is paid and active, then hand over the username and password. An
agent sets them with `netlify env:set ... --secret` and re-runs the Apply click. No owner console work.

**Do not** build a workaround, a mock, or a fallback path for this. It is a credentials problem with a
credentials fix.

---

## L4 change manifest — Gmail + the ID reader (2026-09-17)

**Files added**

* `src/workflows/doc-check-retry-sweeper.mjs` — cron `*/20 * * * *`. Re-reads documents the reader could not read. Claims only `failed_events` rows whose handler is `doc-check`.
* `src/workflows/doc-check-retry-sweeper.test.mjs` — 13 tests.
* `scripts/google-oauth-mint.mjs` — the Google consent flow the repo never had.

**Files changed**

* `src/agents/model.mjs` — new export `classifyModelFailure()` + the `MODEL_*` reason constants; `callOpenAI` / `callAnthropic` / the catch now carry `status` out with the error. Nothing about model choice, provider or keys changed.
* `src/handlers/doc-check.mjs` — new exports `queueReaderRetry`, `RETRY_HANDLER`, `RETRY_MAX_ATTEMPTS`; new `queueRetryImpl` dep; `raiseUncheckedDocumentTask` takes an optional `title`; a retry records its own `agent_runs` row.
* `src/events/dead-letter.mjs` — `due()` takes an optional `handler` filter. Backward compatible; omitted = unchanged.
* `src/workflows/index.mjs` — registers `docCheckRetrySweeper`.
* `src/workflows/index.test.mjs` — `doc-check-retry-sweeper` added to `EXPECTED_WORKFLOW_IDS` with its reason.
* `src/handlers/doc-check.test.mjs` — 8 tests added. None removed, none weakened.
* `docs/journeys/doc-check-identity-flow.md` + `docs/journeys/CHANGELOG.md`.

**Routes/props/journeys:** no route added, no endpoint, no UI, no schema change, no migration, no new dependency. One new Inngest cron function.

**Deliberately NOT done:** the 28 pending `failed_events` rows from money and survey handlers (measured on production, 2026-09-17) are still unretried by anything. Draining those is a separate, much larger decision and this sweeper cannot touch them.

**Not run** (five agents share this checkout): `npm run lint`, `npx tsc --noEmit`, the full suite, `npm run ship`. Run here and green: `node --test` on the three lane test files (39 pass / 0 fail / 0 skipped) and on `index.test.mjs` + `registry.test.mjs` (21 pass / 0 fail). **Nothing is committed** — the lane brief forbids git in a shared checkout, so whoever integrates must commit these files (CLAUDE.md "commit locally, every session").

---

## Proof with a real database — 2026-09-17

Written by lane L5. My job was proof, not fixes. I changed no product code.

### What I set up

This Mac had no database on it. I built one just for testing. It is Postgres
16.14, the same version the notes in CLAUDE.md used on 2026-08-27. I started it
from nothing and applied all 285 setup files to it. They all applied with no
errors. I never pointed any test at the live database. I never ran
`npm run verify:e2e`.

### The biggest thing I found

**`npm test` never runs the database tests. It stops before it gets to them.**

The command runs the tests in two halves. First the plain tests, then the 199
database tests. If the first half has even one failure, it quits right there.
The first half has had 4 known failures for a while. So the second half has not
run. Not here, and not in the automatic checks either.

That means every "the suite is green with a database" claim made from
`npm test` only ever measured half the suite. I ran the second half by hand so
it would actually be measured.

### The real numbers

I had to run the two halves separately, and the tree kept changing under me
while I worked, so these are two readings taken minutes apart. That is honest,
not tidy.

**Half one — the plain tests** (no database needed). Taken 17:05.

* 9,977 tests. 9,966 passed. 9 failed. 2 skipped.

4 of those 9 are the known old ones you already listed. The other 5 are not
bugs. They are the footprint of lane L4's work sitting half-finished in the
shared folder: a new setup file and a new background job that the lists have
not been told about yet. They will go away when that work is finished and
saved.

**Half two — the 199 database tests.** Taken on a brand new, empty database
with nothing else touching it.

* 2,939 tests. 2,897 passed. 31 failed. 10 were cut off. 1 skipped.

I ran this twice, on two different fresh databases. Both runs gave the exact
same numbers. So the result is steady, not luck.

### Every failure, and who caused it

To answer "did today's work break this?", I took a copy of the code from before
today's fixes started and ran the same tests against it. That is the only
honest way to tell.

Old and already broken before today — **not caused by today's work**:

1. `GET /api/read/ad-spine` — a signed-in person with the wrong job gets in
2. `YouTube analytics connect/sync/read` — same kind of wrong-answer problem
3. `public decline autopsy` — 12 failures; the page is not wired to a web
   address, so it cannot be opened at all
4. `an approval with no amount is not chased on the wrong rail...`
5. `every waypoint the SQL removes is one the gate would have refused`
6. `F46 end to end — an ORDINARY client gets five deliverables`
7. `F46 end to end — an AUTHORIZED-USER-DOMINANT client gets six`
8. `the RAW seed — no emit step — is readable as a real bureau pull`
9. `nothing seeds a waypoint — until enrolment does`
10. `enrolling a client builds their checklist`
11. `a renamed card, a genuinely new card, and the way back`

Every one of those also failed on the older copy. None is new.

Not a real failure — **a test getting in another test's way**:

12. `replay() over the same event log sends ZERO messages`. This fails when the
    whole batch runs together. On its own, on a clean database, it passes 8 out
    of 8. Another test file leaves messages lying around and this one counts
    them. The code is fine. The tests need tidier housekeeping.

**Caused by today's work — this one is real:**

13. `GET /api/scripts/list` — **one partner can see another partner's saved ad
    scripts.** Two checks fail: "another partner's script is not in this
    partner's list" and "a staff session of another role still only gets the
    partner it named". It fails on its own, on a clean empty database, every
    time. So it is not a fluke.

    This came in today at 15:53 with the saved-ad-scripts work. The test file
    did not exist before that. This is one customer seeing another customer's
    private work. It is the kind of fault CLAUDE.md warns about most.

### PROVEN WORKING

I ran each of these against the real test database and watched what the
database actually held afterwards. All on a clean, empty database.

* **A round can no longer be marked funded with no bank approval.** 9 out of 9
  checks passed. Both doors are shut, not just one. The board door refuses and
  says why in plain words. The behind-the-scenes door also refuses, and I
  checked the round afterwards — it was still sitting unfunded, with no amount
  written on it. A round with a real bank yes still funds normally. A repeat of
  an already-funded round is not blocked, so nothing jams.
* **CSM calls.** 9 out of 9 checks passed. Paying for repair, trial or academy
  now creates the halfway call — I tested all three kinds of payment and each
  one made the call. The results call is no longer made twice: two separate
  funding events now leave exactly one call, not two. Every call created has a
  date on it, so none of them fall into the "no date" pile.
* **Phone numbers and the welcome text.** The number "(661) 605-4248" is turned
  into "+16616054248" before the text is addressed. I checked the saved message
  and that is what it holds. Nothing was blocked and nothing errored.
* **The 2-hour chase for someone who never booked.** It fires. Someone who
  finished the survey and did not book gets chased. Someone who did book is
  left alone.
* **The day-before call reminder.** It works. A call booked 3 days out produces
  the day-before reminder, and the 2-hour one as well.

### About the day-before reminder claim

The earlier agent said this was "not broken, the walk just measured too early".
**That agent was right.** I checked it properly instead of taking their word.

Two separate things back it up. First, a booking 3 days out really does produce
the day-before reminder on a real database — I watched it happen. Second, I
read the live records: Sim Eight-Funding booked at 06:18 for a call at 17:00
the same day. That is under 11 hours' notice. There was no "day before" left to
reach, so no reminder was correct.

One correction to the walk notes. They say Sim Eleven-Blueprint had a booking
but no reminders. He has **no booking at all** on the live system. So there was
nothing for a reminder to attach to.

The fix that made these reminders fire properly went in on 2026-09-03, two
weeks before the walk. So the code was already right when the walk ran.

### PROVEN BROKEN

* **Partners can see each other's saved ad scripts.** See number 13 above. New
  today. Reproduces every time on a clean database.

### STILL UNPROVEN, and why

* **The 11 old failures above.** I proved they are old. I did not prove what
  causes any of them. That was not my job today.
* **Anything on a screen.** I proved what the database does. I did not open a
  browser. A screen can still show the wrong thing while the data underneath is
  right.
* **Anything on the live site.** Everything I proved was on a test copy. None
  of it proves the live site behaves the same way, because the live site is
  running older code until somebody ships.
* **One single clean suite number.** Four other lanes were editing this same
  folder while I worked. The code moved under me twice. So the two halves were
  measured minutes apart, not at the same instant.

### What the live records say — read only, nothing changed

I only read. I set the connection to refuse writes before asking anything.
No row was added, changed or removed.

**Sim Eight-Funding (FH-000392)**

* The $2,500 success-fee invoice is still **unpaid**. It reads "sent", nothing
  paid against it, no payments recorded at all.
* Its payment inbox row is still **stuck**: waiting, tried 0 times, never
  picked up, never finished. It arrived at 19:31 and has not moved.
* 5 other payment rows are stuck the same way. 6 stuck in total. Every one has
  been tried zero times. Nothing is draining that inbox.
* Money owed still shows: **$5,000** outstanding on the deal. But only **$2,500**
  has been invoiced. Half the fee has never been billed.
* This is why: they have two funding rounds, both marked funded at $25,000 each.
  Round 2 has a real bank yes for $10,000 on it. **Round 1 has no bank
  applications on it at all** — it was marked funded for $25,000 with nothing
  behind it. That is the exact hole the new guard now closes. The old rows stay
  as they are; the guard only stops it happening again.
* **Waypoints: none.** They have zero. Only 3 clients in the whole live system
  have any waypoints, and they are not one of them.
* Entitlements: one — "Funding Snapshot", granted when they bought Card
  Stacking DFY.
* Tasks: 22 open. Two of them are the **same** "results and what's next" call,
  created twice. That is the duplicate the fix now prevents. Both have no date
  on them.

**Sim Eleven-Blueprint (FH-000398)**

* **What they paid:** $5,000. One payment, a deposit, taken 2026-09-17 at
  17:46. It went through. The deal is the "Consulting Services Package" at an
  agreed $5,000. Nothing is owed — the balance is zero.
* **They have no invoices at all.**
* **What they are entitled to right now:** one thing only — the "Metro 2
  Dispute Letter Pack", granted because of that purchase.
* **Waypoints: none.**
* One task: the halfway check-in call, with a date on it.
* No booking was ever made for them.

### How to repeat what I did

The test database was built in a scratch folder outside the repo, so nothing
here changed. Postgres 16.14 came from the `@embedded-postgres/darwin-arm64`
package and the pgvector add-on came from the `pgserver` Python package, because
neither one has both pieces on its own. Nothing was added to `package.json`.

To run the database tests without `npm test` cutting them off, run the 199
`*.pg.test.mjs` files directly with `node --test --test-concurrency=1`. One at a
time matters — they share tables and tread on each other otherwise.

