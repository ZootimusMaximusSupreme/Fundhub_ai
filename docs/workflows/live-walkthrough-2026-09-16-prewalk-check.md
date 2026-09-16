# Pre-walk check — 2026-09-16

Two questions from Chris before the walk: does push-credit match a real CRS report so the screens load the same way, and does make-documents cover every upload the walk needs. Traced from the live build (f739305e) by one agent per question, then each answer attacked by a second agent. Read only; nothing was run against the database or the site.

Raw result: workflow wf_e1d9cb39-1c0.

```text
=== CREDIT verdict: mostly matches

-- writes compared
[no] soft_pull_requests ledger row
   real: A row is created as queued, then claimed, then fulfilled, and linked to the credit result. It records who asked, the reason, and a key that stops a repeat ($32 path key: diagnostic-paid:<event id>).
   fake: No row.
[no] consent check
   real: Refuses without valid soft_pull_consent, before anything else.
   fake: Not checked.
[no] SSN access log
   real: On the production host, reading the client's SSN writes an access-log row.
   fake: None. It uses a made-up SSN starting 666.
[partly] crs_results row
   real: provider "crs_softview", provider_result_id "crs-request-bundle:<hash>". outcome_tier starts empty and is filled right after. Written in one transaction with the ledger and the accounts.
   fake: provider and provider_result_id left empty, outcome_tier set at insert, not in a transaction.
[partly] crs_results.result contents
   real: The merged bureau record. The analysis handler then merges in scores, newInquiries (Equifax repeats kept) and source.
   fake: The same record plus the extra keys (card use, tier, pre-approvals, reason codes, signals, crm_payload, simulated stamp), then the same merge, with Equifax repeats removed.
[partly] tradelines (stored account list)
   real: Rows are keyed on account number. When bureaus share a number, the Equifax copy is written last and wins, and Equifax has no limit, so the stored limit is the high balance. No interest rate. raw holds vendor fields only.
   fake: One row per account from its first bureau (usually Experian), with the real limit and an interest rate on every account (0% on collections). raw includes the extra fields.
[no] card_liabilities (billing position, past due, payment status)
   real: None. The real pull never calls this. Even if it did, a vendor row has no account_ref key, so nothing would match.
   fake: Written for every account.
[no] client custom fields crs_inquiries_ex/eq/tu, crs_negative_items_count, crs_late_payments_count, crs_utilization, utilization, business_age_months
   real: None written.
   fake: All written.
[no] $32-path custom fields crs_status=Requested, crs_pull_scope, analyzer_path=Funding, round_hold_reason=Awaiting CRS
   real: Written before the pull (automatic path only).
   fake: Not written.
[partly] clients.outcome_tier
   real: Written by the pull BEFORE the two events go out, then again by the decision handler.
   fake: Written only by the decision handler on the laptop, AFTER the analysis event. So the document builder, which runs during the analysis event, sees no tier on a first push. No visible effect was found for the walkthrough's top-tier funding profile.
[partly] analysis.completed event
   real: crsResultId, requestId (ledger id), source crs, scores, bureaus, newInquiries (Equifax repeats kept), outcomeTier. Key crs-result:<id>:analysis.completed:v1.
   fake: The same keys and key pattern. requestId is "sim-walkthrough:<id>", newInquiries has the Equifax repeat removed, and simulated plus simulatedNotice are added. Only crs-pull's own replay check reads the simulated stamp.
[yes] decision.rendered event
   real: crsResultId, requestId, source, outcomeTier, fundingEstimate.
   fake: The same, plus the simulated stamp.
[yes] funding estimate fields (total_funding_estimate, analyzer_prequal_amount) and sales card move to Decision rendered
   real: Written only if the handlers are loaded. The $32 path runs in the sweeper, which loads them. The staff button's server function never loads them itself. They are there only if another request on the same warm server loaded them first (pipeline-clients, survey-submit, dashboard/seed).
   fake: Always written, because the script loads the handlers on the laptop.
[yes] after-pull checklist review (evaluateWaypoints)
   real: Runs inside the analysis handler.
   fake: Runs the same way, on the laptop.
[yes] tags path:funding / path:repair (C-06 run in-process)
   real: Added by the in-process copy of C-06 on the $32 path.
   fake: Added the same way on the laptop.
[no] documents (UnderwriteIQ pack)
   real: $32 path: built on the live server and saved with the live site's document store.
   fake: Built on the laptop by local code and saved with the laptop's store. In this agent's shell DOCUMENT_STORE_PROVIDER, NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN are all unset, and nothing loads .env, so the store is memory. The client is still marked delivered, so the live copy of the job skips.
[partly] Inngest background jobs (U-02 analyzer_status, U-03 crs_status=Complete, U-04 primary FICO, C-02 inquiry_log + 'Remove inquiries' task + inquiry:pending tag + round_hold_reason, U-05, DPC-01, AF-02)
   real: Sent from the live server with the live key, without waiting for an answer.
   fake: Sent from the laptop the same way. They arrive only if the exported INNGEST_EVENT_KEY is the real key. with-prod-env.sh checks only DATABASE_URL for a hidden (asterisk) value. A 2026-08-12 record says the Netlify copy of INNGEST_EVENT_KEY reads back hidden, and a failed send is silently dropped. So these jobs most likely never run for fake clients. Could not confirm today's value.

-- screens
[yes] Client Control Panel - Scores tile: It reads the three scores from the newest file. Only "sandbox" files are hidden, and the fake file says "simulated". A real pull fills it the same way.
[yes] Client Control Panel - Card Use tile: Only the fake file carries a card-use number. The page's own note says a real pull does not, so a real client shows "not measured".
[yes] Client Control Panel - Inquiries on the credit file tile: It walks the stored inquiry lists and drops repeats by name and bureau, so a fake file and a real file give the same kind of list.
[yes] Client Control Panel - Prequal tile: The decision handler writes the estimate. This is the same for real and fake. Repair tiers can get zero.
[partly] Client Control Panel - income lines (also in the Pipeline side drawer): Only the Experian line fills. Live Equifax files carry an income row, but the fake file does not, so the Equifax line stays blank.
[partly] Client Control Panel - Funding Apply door, Lenders page, Closer Dashboard lender list: The list needs a file with scores, and that part is the same. But it also hides banks that pull a bureau with new inquiries on the inquiry log. That log is filled only by a background job. For fake clients the job most likely never arrives from the laptop, so the list can show more banks than a real client would get.
[partly] Client Control Panel - Documents / Documents menu / portal Documents tab: Funding clients get rows in the list, but the files were saved in the laptop's memory, so downloads will likely fail. Repair clients get none from the push.
[yes] Closer Dashboard - credit panel (Scores, Utilization, Inquiries, Derogatories): Scores fill for both real and fake. Utilization and Derogatories fill only because push-credit saves extra data. A real pull shows dashes. The inquiry number counts the whole stored list, so a real pull also counts every Equifax repeat and shows a bigger number.
[yes] Closer Dashboard - What they can get (Conservative, Realistic, Personal + business): The fake file saves personal, business and total money, so all three boxes fill from it. A real pull saves only the total, in the custom fields. Its Realistic box then falls back to the small calculator. That calculator holds back loan money and marks the file not fundable when the late-payment and bad-item counts are unknown, so the number is different and usually lower.
[yes] Closer Dashboard - card funding calculator (read/tradelines): Every fake account has an interest rate, so the calculator orders cards by rate and shows rates. Real accounts have no rate, so those numbers stay blank on a real client.
[yes] Present deck - soft pull box and Engine data line: The fake client has no request row, so it reads "complete (from the stored result)". A real $32 pull reads "fulfilled" with no note. Tier, dollars and scores fill for both.
[yes] Present deck - S-07 Your results (funding): The amount comes from the client's stored estimate and the scores from the file. Same for real and fake.
[yes] Present deck - S-07 / S-09 repair results: The fake file saves the engine's signals and reason codes, so both fill. A real pull saves neither, so it shows a dash and an empty list. The deck counts each bureau's copy (about 9 for #9 and 4 for #10), while the Closer Dashboard's Derogatories counts accounts (4 and 2). So two screens show different numbers for the same fake client.
[yes] Client portal - Your credit scores, soft pull done, pre-qual: It reads scores the same way as the control panel. Any credit row not marked demo counts as a finished pull. The estimate shows only when it is above zero.
[yes] Progress page - Your scores / What moved: It reads every credit row that is not marked demo and shows each one's scores.
[yes] Pipeline - card and side drawer: The decision handler on the laptop moves the card and sets the tier, and the drawer reads the same scores as the control panel. The card's score line shows the survey answer, not the credit file.
[partly] Specialist desk - Repair Stage letters: Letters need a signed agreement or dispute authorization, plus an accepted ID. The content can differ from a real pull in four ways: (1) the fake puts the client row's name (like "SIM NINE-REPAIR") on all three bureaus, so the name letter can ask the bureau to delete it; (2) today's file date lets the stale-date and old-address findings fire; (3) the fake Equifax accounts say "collection" outright; (4) the fake Experian address is marked current.
[partly] Specialist desk - inquiry items: Items read from the file show at once. Items from the inquiry log need the background job, which most likely does not arrive from the laptop.
[yes] Calendar / tasks - Pre-funding review task: This job runs on the live site when a funding round starts. It counts any file with scores as complete, even if crs_status never flips.
[yes] Finance OS (finance-os.html): It fills with interest rates and billing records that only push-credit writes. A real client shows cards with no rates and no billing records.

-- documents: For the three funding clients (#8, #11, #12): yes, but the documents are built on Claude's laptop, not on the live site. For the two repair clients (#9, #10): no.

How it works:
- push-credit loads the event handlers on the laptop (push-credit.mjs:1024).
- When it sends "analysis complete", the laptop runs the document job with local code (crs-deliverables.mjs:53-61, register-all.mjs:70-76).
- The job builds files only for the three funding tiers. For REPAIR_ONLY it just adds a "path:repair" tag (c-06-crs-results-router.mjs:169-184).
- Files saved: the Credit Analysis Report, Credit Optimization Roadmap, Funding Snapshot and Bank and Lender Match List, plus the Capital Readiness Summary, plus per-bureau inquiry-removal and personal-info letters. Dispute letters are built but deliberately not saved (funding-letter-pdf.mjs:231-243). So the "dispute letter pack" on sheet line L1.10 is not one of the saved files.

Where the files go:
- with-prod-env.sh exports only the database address and the event key (lines 42-44). Nothing in src/ or scripts/sim loads .env.
- In this session's shell, DOCUMENT_STORE_PROVIDER, NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN are all unset. The local .env does say netlify-blobs, but it is never read. So the store falls back to memory (store.mjs:413-423), and the files vanish when the script ends.
- The live database still keeps rows pointing at them.
- The job marks the client "delivered" even if saving failed (c-06:103-137). The live copy of the job gets the same event id and skips (c-06:128-132). So the live site never rebuilds them.
- Result: the Documents list shows files that almost certainly cannot be downloaded.

How they print:
- The laptop has no WeasyPrint (python3 has no weasyprint module, and the Homebrew path is missing) and no render-service settings. So the short Node (pdf-lib) printer runs. That is the same printer the live site was measured using on 2026-09-06 (black-report-pdf.mjs:50-55, 228-262).
- The local printer file still differs from the live one (black-report-client.mjs). The bureau column says "All 3 bureaus" instead of the bureau names, and card use is re-added from accounts. The fake file's three copies agree, so the dollar figures should match.
- The booking link printed inside comes from the laptop's settings (default https://apply.fundhub.ai/funding-book-call). Whether the live site uses the same link could not be traced.

The one live-built path:
- On #11, "Send deliverables package now" (L1.15) builds the funding pack on the live server from the fake file and saves it with the live store (closer-deck.mjs:855-880). #8 and #12 get nothing built on the live site.
- Where the live site keeps files is still unconfirmed (status sweep item 3, sheet line 281).

make-documents.mjs only writes picture files to docs/workflows/sim-documents/ and does not touch the pack.

-- order rules
 * The client must already exist. Opt them in through ClickFunnels first, or push-credit stops with "no client with email" (push-credit.mjs:1027-1031).
 * Claude must run it with a readable DATABASE_URL, usually through scripts/sim/with-prod-env.sh. push-credit stops if it is unset (push-credit.mjs:1021), and with-prod-env.sh stops if it comes back hidden (with-prod-env.sh:44).
 * The identity file credentials/sim-identity/owner-identity.local.json must be on the laptop, or push-credit stops (push-credit.mjs:105-119). The client row's name ("Sim Nine-Repair" and so on) is written onto the file next to the legal name, so the engine's name check passes (push-credit.mjs:230-242, 1044-1048).
 * Consent before credit is a real-pull rule only. A real pull refuses without it (soft-pulls.mjs:306-314). push-credit never checks, so the walkthrough keeps that order only by following the sheet (L1.5 before L1.7).
 * Push credit BEFORE the payment push. When a funding round starts, the pre-funding review needs scores on file, or it makes "Cannot start funding — CRS incomplete" (c-05-pre-funding-review.mjs:36-50). Payment routing reads the tier only for a repair buyer who is on a funding tier (purchase-routing.mjs:33-44).
 * Reload the Present deck, the Client Control Panel and the Closer Dashboard after a push. They do not refresh on their own (the only timers are a clock and a payment watch).
 * Background changes (crs_status Complete, analyzer_status, the inquiry log, the 'Remove inquiries' task, inquiry tags) come later, and only if the event key Claude exports is the real one and not a hidden asterisk value. with-prod-env.sh does not check this key.
 * Documents are built only when the tier is FUNDING_PLUS_REPAIR, FULL_FUNDING or PREMIUM_STACK. Every new push builds another set. #11's live-built set exists only after its payment push and 'Send deliverables package now' (L1.15).
 * For repair round 2 and later, Stage refuses until a credit file NEWER than the last round's letters is on the client. So push credit again after Stage, not before (analyze.mjs:572-583).
 * Each push adds a new credit row, and the newest one wins. Stored accounts and billing records are never deleted. So pushing a DIFFERENT profile onto the same client leaves the first profile's accounts in the stored list (tradelines/store.mjs:23-32). The account numbers differ between profiles. Pushing the same profile again is safe.
 * Never use the 'Pull TransUnion / Experian / Equifax' buttons or pay the $32 link to get a newer file. Those are real bureau pulls.

-- mismatches
 * Card Use tile (Client Control Panel) and the Utilization row (Closer Dashboard): the fake client shows a percent. A real client shows "not measured" or a dash, because a real pull never saves a card-use number.
 * Derogatories row on the Closer Dashboard: the fake client shows a count. A real client shows a dash, because only push-credit writes the bad-item count.
 * "What they can get" Realistic box: the fake client shows the engine's saved personal amount. A real pull saves no amounts in the file, so this box falls back to the small calculator. That calculator marks the file not fundable and holds back loan money when the bad-item and late-payment counts are unknown, so the number differs and is usually lower. The Conservative box can differ too.
 * Present deck repair slides: the fake client shows "N negative items" and a list of reasons. A real client shows a dash and an empty list, because a real pull saves neither. The fake count also counts each bureau's copy, so it does not match the Closer Dashboard's count for the same client.
 * Present deck soft-pull line: the fake reads "complete (from the stored result)". A real $32 pull reads "fulfilled" with no note.
 * Closer Dashboard inquiry number: a real pull keeps every Equifax repeat (the vendor's Equifax sample lists every inquiry twice), so it shows a bigger number than the fake.
 * Interest rates: every fake account gets a rate, and collections get 0%. Real credit reports carry no rates. So Finance OS and the Closer Dashboard card calculator show rates, order and interest for fake clients that a real client would not have.
 * Billing records (past due, payment status): only fake clients have them, so Finance OS shows billing positions a real client would not have.
 * Equifax income line: live Equifax files carry an income guess, but the fake file does not, so that line is blank for fake clients.
 * Lender list: banks are hidden when the inquiry log shows new inquiries on the bureau they pull. That log is filled by a background job that most likely never arrives from the laptop, so fake clients can see more banks than a real client would.
 * Background jobs: if the laptop's event key is hidden, fake clients never get crs_status Complete, the inquiry log, the 'Remove inquiries — round in progress' task or the inquiry tags. A real pull gets them from the live site.
 * Documents: fake-client documents are built on Claude's laptop and saved only in the laptop's memory, so live downloads will almost certainly fail, and the live site does not rebuild them. Real $32-path documents are built and saved on the live server.
 * The walkthrough sheet (L1.10) says every push builds five documents, including a dispute letter pack. Repair clients #9 and #10 get none, and dispute letters are never saved in the funding set.
 * Repair letters, name: the fake file lists the client's made-up name (for example "SIM NINE-REPAIR") on all three bureaus next to the legal name from the ID. So the name letter can ask each bureau to delete it. A real file does not carry the name typed into the sign-up form as an extra name.
 * Repair letters, dates: the fake file date is today on all three bureaus. In the vendor's TransUnion and Equifax samples it is years earlier, which keeps the 'stale account date' and 'old address' findings from firing. So fake letters can include findings a real file shaped like those samples would not.
 * Equifax account details: the fake gives Equifax a loan type, business type, credit limit and payment grid on every account. The vendor's Equifax sample has none of these. On a file shaped like that sample, the letter would not call an account a 'collection' by name, and the stored card limit would come from the high balance.
 * Collection label: the fake marks collections with loanType "CollectionAgencyAttorney". That value is not in any vendor sample or engine file, so no one can say a real collection will look like this.
 * Stored account list: the fake keeps the Experian copy of each account. A real pull keeps the Equifax copy (the last one written) when the account numbers match, so stored limits and balances can differ.
 * Experian charge-offs: on a real Experian file the engine also counts a charge-off as a collection. The fake's charge-offs are not counted that way, so bad-item counts and reason codes can differ.
 * Experian address: the fake marks the current address "Current". The vendor's Experian sample marks none, so on a real Experian file the old-address rule treats every address as a former address.

-- field checks (not yes)
[partly] top-level envelope (the one stored record)
   real: source, product, environment ("production" on the live host), pulledAt, bureausPulled, bureaus_pulled, scores{ex,eq,tu}, scoreModels, tradelines, inquiries, publicRecords, bureaus{TU,EX,EQ}, bureauErrors, requestIds (the vendor's own ids). The analysis handler then merges in scores, newInquiries and source. No card use, no tier, no pre-approval, no reason codes.
   fake: The same keys, plus: environment "simulated", simulated, simulatedNotice, a top-level utilization number, crm_payload, outcome, preapprovals, reason_codes and the engine's full consumerSignals. requestIds are "simulated-TU/EX/EQ". "simulated" is not "sandbox", so no screen hides it.
[partly] scores
   real: TU: FICO® Score 9 twice, then CreditVision Income Estimator "47 B" (type 00W16), facta false. EX: Experian/Fair Isaac Risk Model V9, range 336-843, then Income Insight. EQ: FICO Score 9 with no percentile and no min/max. Live EQ also sends an IncomeView row (known only from code comments).
   fake: The same three FICO names (they match the engine's exact-name list), TU's repeat row, EX Income Insight and TU CreditVision (type "CVIE"). Every FICO row says 300-850 with a percentile and facta true. There is NO Equifax IncomeView row.
[partly] tradelines - top-level list
   real: Every bureau's copy of every account, one after another in TU, EX, EQ order, with vendor fields only.
   fake: ONE row per account, copied from its first bureau (Experian for three-bureau accounts, Equifax for EQ+TU accounts). It adds fields a real payload never has: currentBalance, apr, account_ref, paymentStatus, kind and bureau. The account list uses kind first, so a collection is stored as kind "revolving", the same result a real "Open" account gets.
[partly] tradelines - per-bureau account fields
   real: Equifax sample: loanType "UnknownLoanType" on all 13, no businessType, no creditLimitAmount, payment grid on 2 and late counts on 4, one row with no creditorName. Experian: a limit on 1 of 13, 7-digit subscriber codes. TransUnion: codes like "B 09616003".
   fake: Every bureau copy gets loanType (CreditCard/Automobile/CollectionAgencyAttorney), businessType, a limit on every card, a payment grid and late counts. Equifax-style subscriber codes ("190FP02874") on all three bureaus. The same account number on all three bureaus.
[partly] collections
   real: No collection-agency account appears in any sample. The engine counts a collection only when the worst rating type is "CollectionOrChargeOff". The letter code calls an account a collection only if loanType or businessType says "collection".
   fake: accountType Open, loanType CollectionAgencyAttorney, businessType Collection, current and worst rating CollectionOrChargeOff, comment "PLACED FOR COLLECTION". The value "CollectionAgencyAttorney" is not in any vendor file or engine code, only in push-credit and tests, even though push-credit's comment calls it the vendor's own value.
[partly] charge-offs
   real: Experian sample: current type ChargeOff, but worst type "CollectionOrChargeOff", so the engine also counts it as a collection. It has a chargeOffAmount. Equifax sample: current and worst type ChargeOff, accountType Open, status Open, comments GS MEDICAL and DB CHARGED OFF ACCOUNT.
   fake: accountType Revolving, current and worst type ChargeOff on every bureau, a chargeOffAmount, status Closed, comment AV CHARGED OFF ACCOUNT.
[partly] late payments
   real: Equifax sample: Late60Days, late counts, an adverse history, and a "Late Dates: 12/25-60, ..." comment. Late counts and grids sit on only a few Equifax rows.
   fake: Late30Days code 1, 2 lates, $185 past due, a 4-month adverse history, the same on all three bureaus. No Late Dates comment.
[partly] inquiries
   real: Per bureau: creditorName, borrowerSourceType, inquiryDate, businessType, subscriberCode, sourceType. In the Equifax sample EVERY inquiry is listed twice, and names are cut to 20 characters (Experian to 22). The TransUnion sample has none. The top-level list keeps every row, repeats included, and adds source and date.
   fake: Per-bureau rows have the same 6 fields but only ONE repeated Equifax pair per profile. Names are full length and match account names exactly. The top-level list REMOVES the Equifax repeat and has no borrowerSourceType.
[partly] public records
   real: publicRecordType, filedDate, dispositionType, docketIdentifier, courtName or bankruptcyType. Both the Experian and Equifax samples carry a discharged Chapter 7 bankruptcy.
   fake: Always an empty list.
[partly] personal info - names, SSNs, date of birth
   real: TU: names and an SSN. EX: names, no SSN key. EQ: SSN and date of birth, NO names key. The names are the person's real names.
   fake: Names and an SSN on all three bureaus, plus a second SSN on Equifax for repair-full. Date of birth on Equifax only. The FIRST name on every bureau is the client row's name (for example "SIM NINE-REPAIR"), next to the legal name from the identity file and a shortened or misspelled copy.
[partly] personal info - addresses
   real: TU and EQ mark their one address "Current". The Experian sample marks NONE of its 3 addresses current and uses ZIP+4.
   fake: The first address is marked "Current" on every bureau, Experian included. push-credit's comment says this copies exp.json, but exp.json has no Current marker.
[partly] file date (creditFileInfileDate)
   real: TU sample 2021-01-22 and EQ sample 2002-01-17, years before the request date. EX sample equals the request date.
   fake: The pull date on all three bureaus. The letter code measures ages from this date first.
[partly] alerts (responseAlertMessages)
   real: 2 per bureau: a FACTA notice (address mismatch on TU, risk score on EX and EQ) plus "CRS Fraud Finder order could not be processed". Neither matches the freeze or fraud-alert patterns.
   fake: An empty list. No routing effect was found.
[no] engine answers saved in the file
   real: None. The tier goes only into crs_results.outcome_tier and clients.outcome_tier. The money goes only into the decision event and then the client's custom fields.
   fake: outcome, preapprovals (totalPersonal/Business/Combined), reason_codes, the full consumerSignals and utilization are all saved inside the file. The deck, the Closer Dashboard and the Card Use tile read them.


=== DOCS
generator: {
 "makes": [
  "id-clean.png: driver's license (made-up Arizona license), clean copy, PNG. Good for about 4 more years.",
  "id-blurry.png: driver's license, blurry copy (the whole picture is blurred before it is saved; I did not run the script, so I did not see how hard it is to read), PNG",
  "id-expired.png: driver's license, expired copy (ran out 118 days ago, with a big faint EXPIRED stamp), PNG",
  "id-wrong-person.png: driver's license, wrong-person copy (name Marcus Reyes, but the same address, birth date and license number), PNG",
  "bank-statement-clean.png: personal checking statement from a made-up bank, clean copy (period ended about 30 days ago), PNG",
  "bank-statement-stale.png: personal checking statement, stale copy (period ended about 210 days ago), PNG",
  "bank-statement-blurry.png: personal checking statement, blurry copy, PNG",
  "proof-of-address-clean.png: power and water bill from a made-up company, clean copy (dated 9 days ago), PNG",
  "ssn-card-clean.png: Social Security card, clean copy (small print on it says SIMULATED — NOT A REAL CARD), PNG",
  "README.md: a table of each file and the answer the checker should give. This is not an upload."
 ],
 "output_folder": "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/sim-documents/ . The script writes to a path that starts from the folder it is run in, so it must be run from the project folder. The folder does not exist on the laptop today, so the files have not been made yet.",
 "identity_used": "One fake person for every client. The script reads credentials/sim-identity/owner-identity.local.json, the same file push-credit.mjs reads. That file exists, git ignores it, and its own note says it is fake. It holds a first and last name, a Social Security number starting with 000, a birth date and an Arizona address. It has no middle name and no past addresses. Every file shows this one name and address, except the wrong-person license (Marcus Reyes). The script has no way to pick a client: 'make docs #N' makes the same nine files for any client. One mismatch: the card shows the 000 number, but push-credit.mjs puts a different fake number (starting 666) on the fake credit file. The checker is never shown a number on file, so this does not change its answer.",
 "how_to_run": "From the project folder: `node scripts/sim/make-documents.mjs` writes the 9 PNG files and the README. `node scripts/sim/make-documents.mjs --list` only prints the list and writes nothing. `--today YYYY-MM-DD` moves all the dates. It needs Playwright, a tool that drives a hidden browser. Version 1.62.1 is installed, and the browser build it expects (1234) is installed too. It also needs the fake-identity file. It does not touch the database or any website. It lives only on the laptop (commit 2c1b6d90, on local main). It is not in the live build's scripts/sim folder.",
 "evidence": "scripts/sim/make-documents.mjs:4-5 (run and --list), :29 (imports playwright), :33-34 (OUT and IDENTITY_FILE are relative paths), :41-45 (--today), :47-57 (fields read: first, last, ssn, dob, current_address), :113-135 (Arizona license; expired = shift(-118), clean expiry = shift(1580)), :137-162 (statement end = -30 x monthsAgo; footer 'simulated document ... not a bank record'), :164-182 (bill dated shift(-9); footer 'Not a real utility bill'), :184-195 (card, 'SIMULATED — NOT A REAL CARD' at 9px), :200-220 (the 9-file plan with expected answers), :207-209 (wrong person keeps the same address and DOB), :231-243 (headless Chromium screenshot to .png, deviceScaleFactor 2), :248-270 (README). Identity file keys: _note (says FAKE), legal_first_name, legal_last_name, ssn (starts 000), dob, current_address (state AZ). No legal_middle_name, no known_prior_addresses. .gitignore:14. `ls docs/workflows/sim-documents` gives No such file or directory. node_modules/playwright 1.62.1; node_modules/playwright-core/browsers.json chromium revision 1234; ~/Library/Caches/ms-playwright/chromium-1234 and chromium_headless_shell-1234 present. Live tree scripts/sim/ has no make-documents.mjs. git log shows 2c1b6d90 on main. scripts/sim/push-credit.mjs:151-152 (credit file SSN is 666154480, not the identity file's)."
}

-- required docs
[made:partly type:yes] Photo ID (government ID, like a driver's license) (funding and repair) @ Client portal, card 'Send a file', box 'ID and personal documents', choice 'Photo ID', button 'Upload documents' | step L2.5 and L2.6 (#8), L2.15 (#9), L2.18 (#10). L2.4 makes the files. The refusal in L2.14 and the letters in L2.16 depend on this ID. | accepts PNG, JPG or PDF, up to 10 MB (10 MB is the default; a Netlify setting can change it). The server checks what is really inside the file. The file picker also offers HEIC (iPhone photos), but the server always refuses those.
   needs: The script makes four versions: good, blurry, expired and wrong person. The gap is the name. Every license shows the one fake name from the identity file. The walk clients are on file as 'Sim Eight-Funding', 'Sim Nine-Repair' and 'Sim Ten-Trial'. To match, the license would need the same name as the client on file, plus a fake address, birth date and expiry date. Note: any file sent as 'Photo ID' counts toward the ID-and-address set the moment it lands, even a blurry or wrong-person one.
[made:partly type:yes] Photo ID asked for again by the 3-hour reminder (F-02): 'Government ID uploaded' and 'Portal onboarding marked complete' (funding) @ Email and text 3 hours after #8's round starts (the moment #8 pays), then one more email 2 days later. They send the client to the portal. | step not in sheet (it fires after L2.1) | accepts Same portal box as the Photo ID row. But no upload can stop this reminder.
   needs: Nothing more to make, but nothing can satisfy it. The reminder checks two client settings: 'ID uploaded' and 'portal onboarding complete'. Nothing in the live code ever turns either one on. So #8 gets 'ID needed' messages even after uploading, and the reminder puts the 'docs missing' flag back on.
[made:partly type:yes] Proof of address (utility bill) (funding, repair and inquiry) @ Client portal, 'ID and personal documents' box, choice 'Proof of address' | step L2.15 (#9), L2.18 (#10). #8 is asked for it (the document email, and the portal note from #8's inquiry cases), but no sheet step uploads it for #8. | accepts PNG, JPG or PDF, up to 10 MB (HEIC is offered but refused)
   needs: The script makes only a good copy. It has no old or blurry bill. Same name gap as the ID: the bill shows the fake name, not the client's name on file. A match would need that name, a fake address and a recent date. The bill also says 'Simulated document for system testing. Not a real utility bill.' at the bottom.
[made:partly type:yes] Bank statement (the only choice is a plain 'Bank statement'; there is no business bank statement choice) (funding (it also counts as proof of address for repair and inquiry)) @ Client portal, 'ID and personal documents' box, choice 'Bank statement' | step L2.4 makes three copies. No sheet step uploads one. | accepts PNG, JPG or PDF, up to 10 MB
   needs: The script makes a personal checking statement: good, old (about 7 months) and blurry. There is no business account statement with a business name. It shows the fake name, not the client's name on file. The bottom says 'This is a simulated document produced for system testing. It is not a bank record.'
[made:partly type:yes] Social Security card (funding (optional). Inquiry only when a disputed item is about the Social Security number. Never required for repair.) @ Client portal, 'ID and personal documents' box, choice 'Social Security card' | step L2.4 makes it. No sheet step uploads it. | accepts PNG, JPG or PDF, up to 10 MB
   needs: The script makes a good copy with the fake 000 number and the fake name. The name does not match the client on file. Nothing on the funding or repair path requires this card. The inquiry path requires it only when a disputed item is about the Social Security number. The fake credit file's disputed items are inquiries, so it is not required there either. The number on the card is not the number on the fake credit file.
[made:no type:yes] Articles of organization or incorporation (LLC papers) (funding) @ The document-request email asks for it 'if you have an entity'. The checker's own instructions list it too. The portal has no Articles choice, so it could only go in as 'Something else'. | step not in sheet | accepts PNG, JPG or PDF, up to 10 MB. It would be filed as 'other'.
   needs: A fake state filing with a fake business name, a filing date and a state. The checker is told the business name on file, and for these clients that is 'not on file' (the survey stores none). No code rule requires it before funding moves.
[made:no type:yes] Passport (only if the checker asks for it) (funding and repair) @ Nowhere by name. The checker's instructions say: if the ID does not show the current home address, ask for a passport. The portal has no passport choice, so it would go in as 'Photo ID'. | step not in sheet | accepts PNG, JPG or PDF, up to 10 MB
   needs: A fake passport page with the client's name on file, a birth date and a passport number. It is only asked for if the checker decides the ID's address is not current. The checker is told 'address not on file' for these clients, so whether it asks is unknown.
[made:no type:yes] Proof of income (funding) @ Client portal, 'ID and personal documents' box, choice 'Proof of income' | step not in sheet | accepts PNG, JPG or PDF, up to 10 MB
   needs: A fake pay stub or income letter with the client's name on file, an employer and dates. No code rule requires it. The checker still reads it, and an accept on it would lift #8's funding pause just like an ID would.
[made:no type:yes] Tax return (funding) @ Client portal, 'ID and personal documents' box, choice 'Tax return' | step not in sheet (client #11 only answers 'Yes, tax returns' in the survey, L4.12; the survey asks for no file) | accepts PNG, JPG or PDF, up to 10 MB
   needs: A fake tax return page with the client's name on file, a tax year and income numbers. No code rule requires it. The checker still reads it, because every file sent through this box is checked.
[made:no type:yes] Fraud or identity theft papers (FTC or police report, filed as 'additional fraud docs') (inquiry / identity theft) @ Client portal choice 'Fraud / identity theft papers'. Also the Specialist desk, inside an open inquiry case, button 'Upload FTC or police report' (staff). | step not in sheet | accepts PNG, JPG or PDF, up to 10 MB. The staff picker takes '.pdf, any image', but the server still refuses anything that is not PNG, JPG or PDF.
   needs: A fake FTC identity theft report or police report with the client's name on file, a report number, a date and the accounts named. The system never makes one itself.
[made:no type:yes] FTC identity theft report (inquiry box) (inquiry) @ Client portal, box 'Inquiry documents', choice 'FTC identity theft report', button 'Upload inquiry docs'. This box shows for funding buyers (so #8 sees it) and for any client with an open inquiry case. | step not in sheet | accepts PNG, JPG or PDF, up to 10 MB (HEIC offered, refused)
   needs: A fake FTC report as above. The document checker never reads files sent through this box.
[made:yes type:yes] Photo ID sent through the 'Inquiry documents' box (inquiry) @ Client portal, 'Inquiry documents' box, choice 'Photo ID' | step not in sheet | accepts PNG, JPG or PDF, up to 10 MB
   needs: The script's license works here. It counts toward the ID-and-address set, but the checker never reads it, so it can never lift the funding pause or unlock letters.
[made:no type:yes] Bureau reply letter (the credit bureau's answer to a dispute) (repair) @ Client portal, box 'Upload your bureau response', choice 'Letter from a credit bureau' | step not in sheet as a step. It must be uploaded, and staff must confirm it, before L3.14 (see the L2.19 heads-up). | accepts PNG, JPG or PDF, up to 10 MB (HEIC offered, refused)
   needs: A fake Experian, Equifax or TransUnion reply letter with the client's name and the disputed accounts (creditor names and last four digits from the pushed credit file), each marked deleted, updated or verified. It has its own reader, which first checks the picture is sharp.
[made:no type:yes] Extra papers a bank asks for (lender conditions, F-06) (funding) @ Only starts when a bank email is sorted as 'missing documents'. The client gets a text ('lenders need a few documents ... Check your email') and an email. The email's words are actually the 'Funding is now locked' message and name no document. The client would upload through the 'ID and personal documents' box. | step not in sheet (L2.9 expects no bank emails in this test) | accepts PNG, JPG or PDF, up to 10 MB
   needs: Whatever the bank names. Could not trace a fixed list. Any upload clears this hold ('Missing Documents'), and that hold does not stop card moves anyway.
[made:no type:yes] LLC filing confirmation (repair (client checklist)) @ Checklist item 'File your LLC' says 'Send us the filing confirmation once you have it.' There is no upload choice for it except 'Something else'. | step not in sheet | accepts could only go in as 'Something else' (PNG, JPG or PDF)
   needs: A fake state filing receipt with a business name and state. Nothing closes this checklist item, even if the file is sent.
[made:no type:could not trace] EIN letter (the tax ID letter from the IRS) (repair (client checklist)) @ Nowhere. The checklist item 'Open a business checking account' tells the client to take the EIN letter to the bank. The checker's instructions say the EIN is a number, not a document. | step not in sheet | accepts no upload slot
   needs: Nothing asks for it as an upload.
[made:no type:could not trace] Voided check (other) @ could not trace. Nothing in the live code asks for one. | step not in sheet | accepts could not trace
   needs: Nothing asks for it.
[made:partly type:yes] Any file staff drops on a client's record (other (staff)) @ Client Control Panel, 'Documents' group, 'Drop a file here, or click to choose' | step not in sheet | accepts PNG, JPG or PDF (the picker offers only these)
   needs: Any script file can be dropped here, but this box never asks what the file is. So it is filed as 'other' and never counts as an ID or proof of address. The checker still reads it as type 'other', and if it says 'accept' that would lift #8's funding pause.
[made:partly type:could not trace] Photos texted back to the reminder text (funding and repair) @ The document-request text says 'Or just reply to this text with photos.' The email says 'Text photos directly to this number.' The texted-photo handler would file them. | step not in sheet | accepts could not trace. This path does not use the portal's file-type check.
   needs: This path will not work for the walk clients. An incoming text carries no client, so the site looks the client up by phone number. Every walk client has the same phone (+16616054248). When more than one client has the number, the photo is not saved to anyone.
[made:no type:yes] Any document for Capital Blueprint (#11) or Capital Academy (#12) (other (Blueprint / Academy)) @ None is asked for. By the seed data, #11's purchase opens the ID box and the bureau-reply box. #12's purchase opens no upload box. | step not in sheet (the L1 'watch closely' list notes this was not traced) | accepts PNG, JPG or PDF where a box shows
   needs: Nothing. No code found asks a Blueprint or Academy buyer for a document. Blueprint is a 'consulting' product, so it does not start the repair program or its document task. I did not check the live database for which unlocks each purchase really got.

-- blocks completion
 * #8 funding stops at L2.10 unless the checker says 'accept' to a file. Paying the $3,000 puts a pause on #8 called 'Documents Pending Approval'. The only planned way to lift it is the checker saying 'accept' to any file sent through the 'ID and personal documents' box or the staff drop box. There is no staff button for it: the release code exists, but no screen calls it, and it only works on a different pause anyway. While the pause is on, 'Mark round submitted' (L2.10), the drag to Approved (L2.11) and 'Mark funded' (L2.12) are all refused with 'Funding is paused (Documents Pending Approval). Clear the gate before moving this card.' So the success-fee bill and the rest of L3 for #8 never happen. Two other automatic steps can overwrite the pause with a reason that does not block: a round start while no credit file is on #8 ('Awaiting CRS'), and a new fake credit file that has inquiries on it ('New Inquiries'). Neither is planned for #8 after payment. Evidence: src/workflows/s-doc-collection.mjs:27-30; src/workflows/cards.mjs:50-66; src/inquiry-ops/doc-gate.mjs:44-53; api/pipeline-cards.mjs:99; public/app/client-control-panel.html:3162-3170,3202,3229; src/handlers/doc-check.mjs:145-152; src/crs/snapshot-negatives.mjs:213-235 (no caller); src/workflows/c-05-pre-funding-review.mjs:48; src/workflows/c-02-inquiry-created.mjs:54; scripts/sim/push-credit.mjs:1116-1122.
 * #9 and #10 get no letters (L2.16 to L2.19) until the checker says 'accept' to a file and reads a name off it. Until then, 'Stage' refuses with 'This client's ID has not been read yet, so no letter can name them.' The name the letters then use is the one printed on the fake file, not 'Sim Nine-Repair'. Evidence: src/repair/analyze.mjs:628-629, :664-666; api/repair/generate.mjs:52-54; src/handlers/doc-check.mjs:120-136; src/identity/verified.mjs:161-200; db/migrations/310_doc_check_verified_identity.sql:85-90.
 * #9 and #10 cards move to Analysis only when a 'Photo ID' file and a 'Proof of address' (or 'Bank statement') file are both on record, and only while the card sits in Intake or Awaiting Documents. The checker's answer does not matter for this, which is how a wrong-person ID can count. Evidence: src/repair/handlers.mjs:40-56, :120-143; src/repair/register.mjs:36-43; src/inquiry-ops/doc-gate.mjs:82-85.
 * #8's inquiry-removal cases stay 'Blocked'. When #8 pays, the site also opens inquiry-removal cases, because the fake credit file has inquiries on it. Those cases need a photo ID, a proof of address, and a signed authorization. The soft-pull sign-off can count as the signature; I did not confirm one is on file for #8. The sheet uploads only an ID for #8, so the cases stay blocked. #8's card waits in 'Awaiting Documents' on the Inquiry Removal board, and the portal keeps saying 'We still need proof of your address — a bank statement counts.' This does not stop the funding card. Evidence: src/handlers/inquiry-gate.mjs:213-241, :286-290; src/handlers/inquiry-docs.mjs:67-120; src/inquiry-ops/doc-gate.mjs:30-33, :82-96; scripts/sim/push-credit.mjs:657-663; public/app/client-portal.html:1590-1631; api/read/portal-summary.mjs:240.
 * The name risk. Every script file shows the one fake name. The walk clients are on file as 'Sim Eight-Funding', 'Sim Nine-Repair' and 'Sim Ten-Trial'. The soft-pull form does not change the name on file. The address and birth date typed on that form go to a separate place the checker never reads, so the checker is told 'address not on file', 'DOB not on file' and 'business name not on file'. The checker's instructions say the ID name and birth date must match what is on file, and the address must be current. A file whose identity does not match gets 'hold', and anything that does not match gets 'request more'. If it will not accept any script file, the first two blocks above hit #8, #9 and #10. I did not run the checker, so its real answer is unknown. Evidence: api/soft-pull-approve.mjs:449-469; src/pii/index.mjs:125; src/handlers/doc-check.mjs:193-221, :298-302; db/migrations/114_ghl_agent_seed.sql:215-221.
 * The checker may not be able to answer. (1) If the live site keeps uploaded files only in the server's short-term memory (the default), the checker runs in a separate process and cannot open the file. (2) If there is no AI key, the model is never called. In both cases staff get a task. Its title is 'Check this id document by hand — nobody has read it' (for a proof of address, 'Check this proof of address by hand — ...'). The sheet's L2.6 says 'photo id', which is not the real wording. No answer comes back, so the same blocks apply. (3) If the checker's record is not switched on ('live'), nothing happens at all: no text, no email, no task. Only an internal run note is saved. The storage setting and the key live in Netlify and could not be checked. Evidence: src/documents/store.mjs:412-424; src/handlers/doc-check.mjs:89-99, :245-261, :281-294, :339-354; src/documents/kinds.mjs:99; src/agents/model.mjs:86-98; db/migrations/114_ghl_agent_seed.sql:54-57, 168_retire_ghl_agents.sql:5-10, 267_document_check_live.sql:37-52.
 * The trial-done step (L3.14) needs a bureau reply letter uploaded and confirmed by staff. The script does not make one. Evidence: src/metro2/inbound/confirm.mjs:115-119; src/repair/response-agent.mjs:111-125; docs/workflows/live-walkthrough-2026-09-16.md L3.14.
 * Not a file, but also needed before #9 and #10 get letters: a signed repair agreement or a dispute authorization. The script cannot help with that. Evidence: src/repair/analyze.mjs:532-536; api/repair/generate.mjs:47.

-- doc-check: What the checker is given for each file: the type Chris picked, the file's name, the client's name on file (for example 'Sim Eight-Funding'), the address, birth date and business name on file, and today's date. For these clients the address, birth date and business name come through as 'not on file'. The soft-pull form saves the address and birth date in a separate place the checker does not read. The file name gives away the expected answer: 'id-blurry.png', 'id-expired.png', 'id-wrong-person.png' and 'bank-statement-stale.png' are all shown to the checker.

Its instructions say: the ID name must match the name on file; the birth date must match; the ID must show the current home address (or ask for a passport); a blurry or unreadable file gets 'request more'; anything missing, unclear, stale or not matching gets 'request more'; a file whose identity does not match the client gets 'hold'. They say nothing about expiry dates. For a Social Security card: accept it if it is readable and the name matches.

What each answer does:
- Accept: the name, address and birth date read off the file are saved first. Then the funding pause lifts (any file type, if the pause is on), the 'docs missing' flag comes off, any old 'please fix' note is cleared, and the 'Documents approved' email and text go out. (A separate workflow also takes the 'docs missing' flag off on every upload, whatever the answer.)
- Request more: the text 'Got your upload — one thing needs fixing ... Details in your portal' goes out. The reason shows as a note in the portal's 'Send a file' card until a later accept clears it. Nothing is saved.
- Hold: a staff task named 'Document hold — (reason)'. No message to the client.
- No answer (no AI key, a reply it cannot parse, or the file cannot be opened): a staff task named 'Check this id document by hand — nobody has read it' (the words change with the type, for example 'proof of address'). This is not the 'photo id' wording in the sheet.
- Checker not switched on, or its record missing: nothing happens at all. No text, no task.

For each script file (the script's expected answer first; I did not run the checker, so the real answer is unknown):
- id-clean: script expects accept. The name on it is not the name on file, and the address and birth date cannot be matched, so it may come back hold or request more.
- id-blurry: script expects request more. The picture is blurred, and the file name says blurry.
- id-expired: script expects request more. The instructions have no expiry rule, but the card has a faint EXPIRED stamp, the file name says expired, and the name does not match.
- id-wrong-person: script expects request more or hold. The name Marcus Reyes does not match. Whatever the answer, the file still counts toward a complete ID-and-address set (the known bug).
- bank-statement-clean: script expects accept. The name does not match, and the bottom says it is simulated and not a bank record.
- bank-statement-stale: script expects request more (period ended about 7 months ago).
- bank-statement-blurry: script expects request more.
- proof-of-address-clean: script expects accept. The name does not match, and the bottom says it is not a real utility bill.
- ssn-card-clean: script expects accept. The code says accept a readable card whose name matches, but the name will not match, and the card says SIMULATED.

Files sent through the 'Inquiry documents' box or the 'bureau response' box are never read by this checker. Evidence: src/handlers/doc-check.mjs:43-59, 89-112, 114-189 (hold at 174-186), 193-221 (business name at :206), 245-261, 281-294, 298-321 (filename at :312), 339-354; src/documents/kinds.mjs:99-102; src/workflows/doc-check.mjs:18-22; src/workflows/f-06-funding-conditions-missing-docs.mjs:57-66; api/documents-upload.mjs:191-204; public/app/client-portal.html:1612-1631; api/read/portal-summary.mjs:239; db/migrations/114_ghl_agent_seed.sql:215-221; 310_doc_check_verified_identity.sql:62-90; 267_document_check_live.sql:37-52; db/seed/013_section4_message_templates.sql:20-23; scripts/sim/make-documents.mjs:200-220.

-- summary: **Short answer:** The script makes the two papers the sheet uploads, a license and a power bill. It makes them as PNG pictures, and the site accepts PNG. The big risk is the name printed on them. If the checker won't say "accept," #8 can't be funded, and #9 and #10 get no letters.

**What I corrected in the first answer**
- **Task wording.** When nobody can read a file, the staff task says "Check this id document by hand — nobody has read it." It does not say "photo id," as sheet step L2.6 does.
- **Social Security card.** The repair path never needs it. Only the inquiry path can, and only when a disputed item is about the Social Security number. The fake credit file has no such item.
- **#8 also lands on the inquiry-removal path** the moment it pays, because its fake credit file has inquiries on it. That path needs an ID and a proof of address. The sheet only uploads an ID for #8, so:
  - those cases stay "Blocked"
  - the portal keeps asking #8 for proof of address

  This does not stop the funding card.
- **Texting photos in won't work.** All walk clients share one phone number. The site can't tell whose photo it is, so it saves it for no one.
- **Checker switched off.** Then nothing happens at all: no text and no task.
- **What the checker sees.** It is also told the business name, and for these clients that says "not on file."
- **#8's pause.** No staff button lifts it. Two other automatic steps could overwrite it by accident, but neither is planned after #8 pays.
- **Reminder.** The 2-day follow-up is an email only, not a text.
- **Two asks the first answer missed:**
  - A bank can ask for more papers. There are no bank emails in this walk.
  - The checker's instructions can ask for a passport. The script doesn't make one.

**What the script makes.** Nine fake PNG pictures:
- 4 driver's licenses: good, blurry, expired, wrong person
- 3 bank statements: good, old, blurry
- 1 power bill
- 1 Social Security card

All nine show one fake person, and every client gets the same set. The script must be run from the project folder. It hasn't been run yet, so the folder doesn't exist.

**What the walk uploads.** Steps L2.5, L2.6, L2.15 and L2.18 upload the license and the power bill. The site takes PNG, JPG and PDF. The picker also offers iPhone photos (HEIC), but the site always refuses them.

**The big risk: the name**
- Every fake paper shows the fake person's name.
- The clients are on file as "Sim Eight-Funding", "Sim Nine-Repair" and "Sim Ten-Trial".
- The checker is told to match the name on file.
- It can't match an address or birth date either, because it is told those are "not on file."

If it won't say "accept":
- #8 can't be marked submitted, approved or funded, so the success fee never happens.
- #9 and #10 never get letters.

I didn't run the checker, so its real answer is unknown. The same stall happens if the site can't open saved files or has no AI key. Those are Netlify settings I couldn't check. Then staff just get a "nobody has read it" task.

**Other things**
- The checker sees the file name, like "id-wrong-person.png," so the bad-copy tests partly give away the answer.
- The trial-done step (L3.14) needs a letter back from a credit bureau. The script doesn't make one.
- About 3 hours after #8 pays, #8 gets "ID needed" messages, then one more email 2 days later. Nothing on the site ever marks the ID as received, so uploading doesn't stop them.

**Not made by the script, and not in any sheet step**
- LLC papers
- Tax return
- Proof of income
- FTC or police report
- LLC filing receipt
- Business bank statement
- Passport

Nothing on the site asks for a voided check. The EIN letter has no upload spot. Blueprint and Academy buyers are asked for nothing.
```
