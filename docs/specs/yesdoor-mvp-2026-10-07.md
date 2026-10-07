# Yesdoor MVP spec — draft for Chris (2026-10-07)

Status: **draft spec, words only.** No code, routes or database changes until Chris approves this (owner law: spec → review → backend → front end).

## 1. What it is

Yesdoor is an automated apartment placement company with its own brand. It runs on the Fundhub engine as its own organization, so its renters, buildings and brokers never mix with Fundhub clients. It is a simple referral CRM: every renter, building and broker is one record that moves through a tracked path.

- Renters use it free.
- Buildings list free and pay a fee only when a lease is signed.
- Brokers send renters and get paid a share, or pay for the tool.

It is simpler than the consulting software: no funding desks, no letters, no underwriting packs.

## 2. Who uses it

| User | What they do |
|---|---|
| Renter | Finds a building, books a tour, passes the pre-screen, tours, leases |
| Building (leasing office or manager) | Onboards, keeps listings current, gets renters, pays fees |
| Broker or affiliate | Sends renters with a link code, sees their renters, gets paid |
| Yesdoor staff and agents | Work the queues: renters by stage, buildings to onboard, invoices, payouts |

## 3. Renter path (Chris's order)

1. **Arrives** from an ad (ad id saved, same as Fundhub's `utm_content`), a broker link code, search, or a direct visit.
2. **Browses** content and contracted buildings only: photos, rent, specials, area.
3. **Picks a building** and a tour time.
4. **Pre-screen (the legal step):** consent text, then the soft pull and background check. Result for that building: approved, likely, or not this one.
5. **Booking confirmed** when the result is approved or likely. On "not this one," they're shown the buildings they do qualify for, plus the back-end offers.
6. **Registered with the building:** the renter is sent to the building before the tour, with Yesdoor as the only source. This is the referral proof.
7. **Toured → Applied → Lease signed → Moved in.** Each step is confirmed by the building, the building's software, or the renter.
8. **Fee invoiced at move-in → Fee paid → Safe at 60 days** (no refund owed; broker payout released).
9. **Lifetime:** check-ins at move-in, day 30 and month 6, then 90 days before lease end. A renter who moves gets re-matched.

The renter portal holds their status, bookings and results. Upsells plug in later.

## 4. Building path

1. **Onboard:** one form, pre-filled by agents where possible. It covers:
   - building and units
   - rental rules: minimum score, income multiple, eviction and criminal rules, deposit
   - fee terms
   - the leasing-office email
   - which property software they use
2. **Sign the fee agreement** (e-sign). Nothing is sent to a building before this.
3. **Connect** (recommended order, easiest first):
   1. Day 1: Yesdoor's own portal, or a spreadsheet upload, for listings and availability.
   2. The standard listing feed (MITS) they already send to Apartments.com: listings in.
   3. Entrata's open API, both ways: renter pushed in as a visitor record; lease status pulled back for move-in proof and renewal date.
   4. Yardi and RealPage once clients sponsor the access.
4. **Live → first renter → first lease → first fee paid.**
5. **Payer score:** buildings that pay on time get more renters; slow payers get fewer, and collections follows up.

## 5. Broker path

1. Sign up → pick a plan (software only, or a licensed placement split).
2. Licence checked (split partners only, AZ, CA or FL).
3. Agreement signed → link codes issued.
4. Their renters are tagged; they see their renters' stages (no credit details).
5. Paid after the building pays and the 60-day hold clears.

## 6. What gets tracked

- **Renter:** contact, source (ad id or broker code), consent record, pull result, building results, bookings, stage, lease dates, lifetime check-ins.
- **Building:** details, rules, fee terms, agreement, software and connection status, listings, renters sent, leases, invoices, days to pay.
- **Broker:** licence, plan, agreement, link codes, renters, earned, held and paid.
- **Money:** every fee is a ledger row: earned → invoiced → paid → safe, with refunds as reversals. Integer cents, the same as Fundhub.
- **Events:** each step above is an event with a timestamp and its proof. The CRM shows the timeline per record.

## 7. Built from Fundhub (reuse, not rebuild)

| Need | Fundhub piece |
|---|---|
| Soft pull, $9 | `src/finance/soft-pulls.mjs`, `crs-pull.mjs` |
| Consent wording | `src/consent/` |
| Buildings, rules, matching | `src/lenders/` (store, match, spreadsheet import) |
| Approval result | `src/underwrite/` engine |
| Fee agreement + e-sign | `src/contracts/` |
| Tour booking | `src/bookings/` |
| Email, text, AI calls, mail, Meta tracking | `src/messaging/providers/` |
| Fee ledger and refunds | `src/commissions/` |
| Broker splits, link codes, payouts | `src/affiliates/` |
| Passwordless login | `src/auth/magic-link.mjs` |
| Separate brand and domain | `src/brand/`, `src/partners/` |
| Monitoring | `src/pulse/registry.mjs` (every new page and route goes in) |

**Owner-set 2026-10-07:** the renter gives **name, email and current address, no SSN**. Yesdoor uses a different CRS product (the $9 screening product), not Fundhub's current pull. CRS documents a soft pull without SSN that matches a person from name and current address, with date of birth helping. Match rates drop without SSN, and thin files are hardest to find ([CRS](https://crscreditapi.com/soft-pull-without-ssn/)). When no file matches, the renter is asked for date of birth. Fundhub's pull needs name, date of birth, SSN and address (`src/finance/crs-pull.mjs:450-482`), so the new product is a new connection. Its API docs are not in the repo yet.

## 7b. Income check (owner-set 2026-10-07)

- Income is verified, not typed. The renter links a bank account (Plaid) or uploads bank statements. Fake paystubs are common, especially from self-employed renters.
- Reuse: Fundhub already has Plaid and income tools in `src/banking/` (`plaid.mjs`, `recurring.mjs` for repeat deposits, `cashflow.mjs`, `import.mjs` for statements).
- Result shown to the renter: "Approved up to $X rent," from verified income plus credit plus background. Buildings see "income verified" on every Yesdoor renter.
- Two lanes, one engine (owner-approved 2026-10-07):
  - **Yesdoor Verified (prime):** sold on speed and deals.
    1. Verify once, apply anywhere.
    2. Application fee waived by buildings for verified renters.
    3. First pick of specials and units.
    4. Fast tour booking, including evenings and weekends.
    5. Move-in reward (check each state's rules first).
  - **Yesdoor Second Chance:** renters with credit or eviction problems. Sold on approval, with the back end behind it (denial help, repair, lawyers). Sign second-chance buildings and buildings with empty units first.
  - Same building contracts and tracking. Only the ads and the promise change.
  - Market note (owner, 2026-10-07): most demand skews subprime, like credit repair. The building pays, so renter spending power matters only for the back end. Track 60-day refunds from week one.
  - Open: launch both lanes together, or Second Chance first.

## 8. Brand

The brand identity is new and not set yet. Approach (owner-set): take the structure of an existing site and give it Yesdoor's own spin. Starting point: `marketing/offers/yesdoor/yesdoor.dc.html`. Use its structure only; every word, image and the logo are Yesdoor's own.

## 9. Not in the MVP

- Upsells: the portal leaves room for them.
- Commercial rentals.
- Yardi and RealPage connections.
- Florida (until its fees are researched).

## 10. Open questions (one at a time, Chris answers)

1. ~~What does the renter type at the pre-screen?~~ **Answered (owner-set):** name, email and address (no SSN), through the CRS screening product.
2. ~~Background check every time?~~ **Answered (owner-set):** yes. Every pre-screen checks credit, past evictions and background. The result sets the renter's risk tier, and the tier decides which buildings they can be placed in. Background check cost on top of the $9 pull: not known yet. California background checks need the ICRAA notice and free-copy box.
3. Who confirms "toured" and "applied": the building, the renter, or both?
4. What does a broker see about their renters: stage only, or also approved / not approved?
5. First market and first buildings: Phoenix, starting with buildings that already pay locators?
6. Brand: which existing site's structure to start from?

Once these are answered: database design, then the backend with tests, then the journey diagram (`docs/journeys/yesdoor-flow.md`), then screens last.

## 11. MVP question list (2026-10-07, 11pm, with Claude's default for each)

Chris can answer "defaults OK" and name only the ones to change.

Product:
1. Who confirms tour and application? *Default: both. The building through its software or email, the renter by tapping a text.*
2. What does a broker see? *Default: stage only. No credit details.*
3. Launch both lanes, or Second Chance first? *Default: Second Chance first.*
4. First market? *Default: Phoenix.*
5. Are brokers in the MVP? *Default: no. Add them after the first 25 paid fees.*

Money:
6. Default fee ask to buildings? *Default: the building's own locator fee, else 100% of first month.*
7. Refund window? *Default: 60 days.*
8. How do buildings pay? *Default: invoice by email, paid by ACH or check, logged by staff.*

Things only Chris has (can come tomorrow):
9. The CRS screening product's name, login, API docs, and the price of the background check.
10. Plaid: reuse Fundhub's Plaid account, or a new one for Yesdoor?
11. Buy yesdoor.ai (and yesdoor.co)?
12. Brand: which website's structure to start from?
13. Sending email and text number for Yesdoor (a new domain sender and a new Twilio number)?
14. Who works the staff queue in week one?

## 12. Chris's answers (2026-10-07, late)

- **Rely on buildings and systems** to confirm tours and applications, not on renters.
- **Brokers:** an affiliate portal showing whether their renters showed up to booked tours. **No going around Yesdoor:** a signed contract plus first-touch tagging (renter registered with a timestamp before any tour) blocks a broker from cutting Yesdoor out.
- **Lanes:** launch both together. Same engine, two offers, two avatars.
- **First market:** Arizona or Southern California, starting with managers' headquarters.
- **Fee:** the building sets it (usually its locator fee or one month's rent). Large institutions first, smaller ones along the way. The refund window is still open; researched norm is 60 days.
- **Payment:** wire or ACH. Look up how Greystar pays vendors.
- **Brand:** like Apartments.com but better. Built at the end. The system comes first.
- **Order of work (owner-set):**
  1. avatars
  2. offers on ACQ
  3. scrape the full ACQ course
  4. an outbound strategy grounded in facts
  5. the pitch, last

  One step at a time.
- **Sales training:** research the best outbound sales courses; an investor buys one.

## 13. Renter pain, from the owner's own experience (2026-10-07)

- Denials often come from **one surprise item**: a background record, or a negative credit item that shows up right at application time. This happens even with good credit and verified income.
- The worst part is **not knowing**: "Will they accept this?" Renters apply, pay the fee, and find out after.
- Many buildings weigh a background item above income. Rules vary by building, so a renter can't tell in advance.
- Product fit: Yesdoor answers "will this building accept me, record and all?" before the renter applies. Second Chance buildings get matched to those renters.

## 14. CRS, Greystar payment, refunds (research 2026-10-07)

- **CRS:** the tenant screening product needs full name, date of birth, **SSN**, previous address and past landlords ([CRS tenant screening](https://crscreditapi.com/tenant-screening/)). It includes criminal and eviction records ([CRS public records](https://crscreditapi.com/public-record-data/)). The no-SSN soft pull (name, current address, date of birth; "85%+" match on their OffersIQ product) is sold for pre-qualification. It is not stated for tenant screening ([CRS no-SSN](https://crscreditapi.com/soft-pull-without-ssn/)). Prices are not published. API docs: https://crscreditapi.redoc.ly/
  - **Owner-set (Chris has a CRS account):** CRS screening does **not** require SSN for Yesdoor's use. The website text above is out of date for this account. No SSN anywhere in the flow.
- **Greystar pays vendors** by check or ACH through Paymode-X (preferred, about 10 days faster). Vendors are checked through NetVendor. Invoices go through RealPage Spend Management ([Greystar suppliers](https://greystar.com/contact-us/supplier-and-vendor-opportunities/us-supplier-partnerships)). Payment terms: not found.
- **Locator invoice fields** (secondhand): locator, tenant, property, unit, move-in date, lease term, commission, invoice number and date.
- **When fees arrive:** often 30–45 days after the lease starts; some pay at move-in, some at 60–90 days ([HAR](https://www.har.com/question/26830_commission-payments-on-leases)).
- **Refund window:** 60 days is confirmed (skip or eviction, [Stake/uMoveFree](https://www.umovefree.com/property-relations)). 90 days is reported for the National Association of Apartment Locators but not confirmed. Default stays 60.

## 15. System design answers (owner-set, 2026-10-07)

1. **Separate app.** It is built here first, then split into its own repo. No data overlap with Fundhub. Fundhub modules are copied in as starting code, not shared live.
2. **Renter login:** yes, with their tours. **Top priority: seamless integrations** with building software.
3. **Building login:** yes.
4. **Broker login:** yes. They see their renters and their money: earned, when the building paid, when the broker gets paid.
5. What a building sees: open.
6. **One renter, many buildings:** probably not many. Renters pay an application fee per building. Limit open.
7. **Credit:** first touch wins, timestamped. Special cases exist, so add a **dispute** step.
8. **Old results:** keep every result, forever.
9. **Retention:** keep forever (overrides the default retention for this app).
10. Lease-end re-check: open. Owner wants a full follow-up sequence.

Goal (owner): dominate rentals, then expand into mortgages.

## 16. Sharing results, accuracy, re-checks (owner-set, 2026-10-07)

- **No raw credit report to buildings** (owner: likely not allowed; a third party may do their underwriting). Buildings get what their underwriting needs to push the approval through. Yesdoor does the application work for them, which saves them money.
- **Legal path found, California:** AB 2559 (2022) created the *reusable tenant screening report*. It is prepared within the last 30 days by a consumer reporting agency, at the applicant's request and expense, and given to the landlord free, directly or through a third-party website. Landlords may accept it but don't have to ([Gov. press release](https://ward.asmdc.org/press-releases/20220914-governor-newsom-signs-bill-standardize-reusable-screening-reports-rental), [Senate analysis](https://sjud.senate.ca.gov/sites/sjud.senate.ca.gov/files/ab_2559_ward_sjud_analysis.pdf)). Washington (2019) and Maryland (2021) have similar laws. Arizona and Florida: not found.
- **Approval accuracy is on Yesdoor and the building:** a renter told "approved" who then gets denied is the worst outcome. Draft fixes:
  - Every building confirms its rules on a schedule. Stale rules pause that building's matches.
  - Every result shows the date of the rules it used.
  - Track a "we said yes, they said no" rate per building.
  - **Handling "we said approved, the building said no" (Claude's design; Chris asked Claude to decide):**
    1. **Prevent:**
       - Rules come from the building's own system or feed, are versioned and dated, and are re-confirmed monthly.
       - "Approved" only when the renter clears every rule with room to spare. Close calls show "likely."
       - The contract says the building approves renters who meet its stated rules, or gives a reason. That matches how buildings must apply their own criteria anyway, and California's first-qualified-applicant rule (AB 2493).
    2. **Detect:** a denial needs a reason, entered in the building portal or sent by integration.
    3. **Recover in minutes:** the renter is re-matched to a backup list of buildings they already clear, and the tour is rebooked. The renter is never left with nothing.
    4. **Application fee:** the contract asks buildings to waive it for Yesdoor-screened renters, so a mismatch costs the renter nothing. Where it isn't waived, Yesdoor refunds the fee (typical $50; California cap ~$66).
    5. **Learn:**
       - The denial reason updates that building's rules in the system.
       - Each building gets a mismatch rate.
       - Too many mismatches pause the building until its rules are reviewed.
- **Re-checks (owner-set, corrected):** Yesdoor **never asks the renter for updates**. Yesdoor runs the situation: it knows first, or at the same time as everyone else. Re-checks run on a schedule, using consent captured once at sign-up, plus building data feeds. The sign-up consent wording must cover repeat checks; confirm that wording with CRS.
- **V2** comes later; it should be "really amazing."
- How many buildings one renter can apply to: still open.

## 17. Last questions before the detailed build spec (with defaults)

Owner process: settle every question → detailed build spec (Opus) → backend (Sonnet) → front end.

Layout:
1. **What a building sees:** approved / likely / no, income verified, risk tier; in California, the reusable screening report where accepted.
2. **Max open applications per renter:** 3.
3. **Re-check schedule:** monthly while searching, and 90 days before lease end.
4. **Risk tiers:** 4 (A–D), set by score band, evictions, criminal flags, and rent-to-income.
5. **Rent rule when a building doesn't state one:** rent up to one third of verified monthly income.
6. **Staff roles:** owner, ops, sales, collections. Only ops and the owner see credit details.
7. **Building connections, v1:** portal + spreadsheet + listing-feed import. Entrata API next.
8. **Tours:** the building sets tour hours in its portal; Yesdoor books; synced to their system later.
9. **Renter messages:** email + text. AI calls later.
10. **Getting paid:** the system makes the invoice on confirmed move-in and emails it; payment (ACH, Paymode-X, check) is logged.
11. **Broker payouts:** marked paid in the ledger after the 60-day hold, same as Fundhub's commission ledger.
12. **Disputes:** the owner or ops decides, within 14 days.
13. **Back-end upsells in the MVP:** no; space only.
14. **State rules:** a per-state rules table (for example California background-check notices and the fee cap).

Needed from Chris (accounts; agents can't create these from the cloud):
15. A new Supabase project and a new Netlify site for Yesdoor (the cloud blocks both APIs).
16. CRS API login for Yesdoor; Plaid keys; a Twilio number; an email sending domain.
17. The domain (yesdoor.ai).
