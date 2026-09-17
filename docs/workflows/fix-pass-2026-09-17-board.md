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

**Dependencies: none. All five run at the same time.**

**One soft overlap, declared:** FIX-2 owns making the invoice (amount + when it is created). FIX-5 owns draining the payment inbox and flipping an invoice to paid. Different code, same table. Neither lane edits the other's file.

---

## Blocked on Chris — no code fix exists for these

These are credentials and money, not bugs. Naming them so no lane burns time on them.

1. **Bank Apply is dead.** The proxy login is rejected (407). Every Apply click returns `oxylabs_auth_failed`. No bank form can open until the Oxylabs login is fixed. Blocks the whole funding money path.
2. **The document reader has no credit.** Every ID read returns 429 (no credits on the AI account). Repair letters can never stage, because staging needs the ID read first. Blocks GAP 1, GAP 2, GAP 9, GAP 28.
3. **Gmail cannot be read.** The token in the environment is a 20-character mask, not a real token. "Prove it landed in Gmail" is impossible until a real token exists.
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

