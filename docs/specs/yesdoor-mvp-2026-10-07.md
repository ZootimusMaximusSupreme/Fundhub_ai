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
