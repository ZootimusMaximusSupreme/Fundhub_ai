# Yesdoor avatar 3 — Leasing manager / regional VP at a large apartment manager (Arizona / Southern California)

**Made:** 2026-10-07, task M1 (`ops/workflows/yesdoor-mvp-build-2026-10-07.md`).
**Method:** Chris's Avatar Builder SOP, 7 steps (`.claude/workflows/avatar-builder.js`), short form, one file.
**Ground truth:** `marketing/offers/yesdoor/industry-research.md` (**IR**), `docs/specs/yesdoor-mvp-2026-10-07.md` (**spec**), `marketing/offers/yesdoor/scale-3m.md`, `marketing/offers/yesdoor/acq-money-model.md`, plus new web research linked inline.

**Tags:** **[ASSUMED]** our guess · **[OWNER]** Chris set it · **[SECONDHAND]** seen in a search summary or second site, original not opened · **[GAP]** looked, not found.

---

## Step 1 — Foundation

1. **Service in one line.** Pre-screened renters — soft pull, background check, bank-verified income — sent to your vacant units. You list free and pay only when a lease is signed. [OWNER]
2. **Category.** Pay-per-lease renter placement (a licensed locator with its own renter funnel). [OWNER; scale-3m licensing section]
3. **Core problem.** Units sit empty, leads cost money, and a growing share of applicants are fake. On-site teams turn over and can't spot forged documents.
4. **Ideal client.** A regional VP or regional manager over 10+ communities at a large manager in Phoenix or Southern California, measured on occupancy and bad debt. [OWNER first market: "starting with managers' headquarters," spec §12]
5. **Before.** Concessions stacked to fill units. Listing-site spend per lease. Fraud found after move-in. On-site staff stretched.
6. **After.** A steady flow of renters who are already verified and want their building. Fees paid only on leases that stick past 60 days.
7. **How it works.** Agents pre-fill the building page and rules → building picks a fee preset and signs → leasing-office email set. Renters are registered before each tour with a timestamp. Invoice on confirmed move-in. 60-day refund if the renter leaves. [scale-3m "3 taps"; spec §4, §6]
8. **Deliverables.** Free renter-demand report (how many pre-approved renters want this building). Registered, verified renters. Invoice per lease. Mismatch rate per building. [acq-money-model; spec §16]
9. **Price.** Free to list. Fee on the building's own terms (usually its locator fee or one month's rent). [OWNER, spec §12]
10. **Competitors.** Listing sites (Apartments.com, Zillow; ~$1,005 per lease, IR / Yardi). Existing locators (Smart City, local firms). Screening and fraud tools (Snappt and similar). In-house marketing.
11. **Differentiator.** Every renter arrives with income verified by the bank, not a pay stub, and is checked against this building's own rules. Pay only on lease. [spec §7b, §16]
12. **Objections.** "We don't pay locators." "Another vendor to onboard." "Who's liable if your 'approved' renter fails our screening?" "Our software (Yardi / RealPage / Entrata) won't connect." [ASSUMED from the vendor process below; not interviewed]
13. **Best testimonial.** NONE ON FILE.
14. **Common questions.** What's the fee? Do you replace our screening? How do we get billed and paid? Fair housing? NetVendor / Paymode-X? [ASSUMED; vendor steps from spec §14]
15. **Client language.** "occupancy," "NOI," "bad debt," "days vacant," "lead-to-lease," "cost per lease," "concessions," "lease-up," "guest card." [IR / MRI; scale-3m]

## Step 2 — Overview

1. **Core promise.** Verified renters for your vacant units. Pay only when they sign — and stay.
2. **Journey.** See the free demand report → 3 taps to sign up → renters start showing up registered → leases → invoice at move-in → safe at 60 days. [scale-3m, spec §3]
3. **Outcomes.** Fewer days vacant. Lower cost per lease. Less fraud reaching the lease. Less work for on-site staff.
4. **Benefits.** Hit the occupancy number without another concession. Show the owner lower bad debt.
5. **Desires.** "I need heads in beds that actually pay." "I need my team selling, not playing detective." "I want to look good on my monthly report."
6. **Unique mechanism (named).** **The Verified Renter Pipeline.**
7. **Hidden mechanisms.**
   - Income comes from the bank (Plaid) or statements, not pay stubs. [spec §7b]
   - Renters are matched to the building's own stated rules, so the ones who arrive already fit. [spec §16]
   - Fee only on signed lease, refunded if the renter leaves within 60 days. [OWNER default, spec §14]
   - Each renter is registered by email, timestamped, before the tour. Clean source tracking for their own reports. [spec §3]

## Step 3 — Desire research

**Functional wants**
- Fill units. Vacant days averaged 34.4 at end of 2024. [IR / RealPage]
- Phoenix: vacancy 12.1%, 24,187 units under construction, rents −2.6%, over 50% of communities discounting, six to eight weeks free in lease-up (Q2 2025). [Matthews](https://www.matthews.com/insights/q225-multifamily-market-report-phoenix-az)
- Cut fraud and bad debt. Bad debt averaged $4.2M per operator (median $800K); fraud caused 24.5% of it and 23.8% of eviction filings. [IR / NMHC]
- Lower cost per lease. Listing sites cost ~$1,005 per lease. [IR / Yardi, SECONDHAND]

**Emotional needs**
- To be the regional who hits the number.
- To protect a stretched team. On-site turnover ~32.7% a year. [IR / Bisnow]

**Pains and frustrations**
- Fraud is relentless: 93% of property managers saw fraud in the past 12 months; 73% of rental fraud is caught after move-in. [NAA, 2024-07-24](https://naahq.org/news/beware-fake-pay-stubs)
- On-site staff aren't trained to catch forgeries (Moore quote below).
- Top challenges in the 2025 Performance Ecosystem Report: operational efficiency and maximizing revenue and profit. [SECONDHAND — Multifamily Executive summary](https://www.multifamilyexecutive.com/property-management/operational-efficiencies-top-industry-challenge-for-property-managers_o)

**Existing solutions and complaints**
| Solution | Complaint |
|---|---|
| Listing sites | Pay for leads, not leases; ~$1,005 per lease. [IR / Yardi] |
| Concessions | Six to eight weeks free in lease-up eats revenue. [Matthews] |
| Fraud tools | Fraud keeps adapting (Loebsack quote below). |
| Locators | Strong conversion (data below), but invoices and proof are manual and messy. [IR] |

**Client voice (direct quotes from named operators, real sources)**
- "We're almost mini-FBI investigators." — Amanda Kitts, SVP Property Management, Northwood Ravin. [REBusiness, 2022-04-28](https://rebusinessonline.com/?p=316117)
- "A leasing consultant's job is not to look at a document and try to see if it's a forgery or not. It's just not in their job description." — Bob Moore, Managing Director, FCA Management. [same]
- "Assistant managers are getting crushed because they're not getting their collections bonuses because people aren't paying rent." — Kevin Owens, Division President, RPM Living. [same]
- "It's worth it long term just to get the bad debt off the books." — Amanda Kitts. [same]
- "Denial rates end up being good for the business." — Mike Gomes, Chief Experience Officer, Cortland. [Multifamily Dive, 2022-11-01](https://www.multifamilydive.com/news/application-fraud-on-the-rise/635458/)
- "Every time we find a new fraud tactic and a way to stop it, they come up with another." — Chris Loebsack, Loebsack and Brownlee. [NAA, 2024-07-24](https://naahq.org/news/beware-fake-pay-stubs)
- "...never accept photos and screenshots and to request the physical documents..." — Stephanie Jackson, SVP, RAM Partners. [same]
- Note: the REBusiness and Multifamily Dive quotes are from 2022. The 2024–25 fraud numbers say the problem grew.

**New desire opportunities**
- "Renters who are already verified when they walk in." Fraud tools check after the application. Yesdoor checks before the tour. [spec §7b]
- "Pay for leases that stay." The 60-day refund means bad placements cost nothing. [OWNER default]

## Step 4 — New mechanism

- **Name:** The Verified Renter Pipeline.
- **One line:** Renters reach your leasing office already soft-pulled, background-checked, bank-verified and matched to your own rules — and you pay only on a signed lease that lasts 60 days.
- **Three parts:**
  1. **Bank-Verified Income** — no pay stubs. [spec §7b]
  2. **Your Rules, Pre-Matched** — dated, re-confirmed monthly; a mismatch rate per building. [spec §16]
  3. **Pay-on-Lease Ledger** — timestamped registration, invoice at move-in, 60-day refund. [spec §3, §6]
- **Contrarian view:** The industry pays for traffic and screens for fraud afterward. Yesdoor screens first and charges only for the lease.
- **Hook samples (drafts):**
  1. "We have [N] pre-approved renters who want [Building]." (N from real demand; owner hook, scale-3m)
  2. "Your leasing team isn't the FBI. Get renters whose income is already bank-verified."
  3. "Six weeks free is expensive. A fee on a signed lease isn't."

## Step 5 — New information

1. **Locators convert better than almost any lead source.** At Greystar, locator referrals were 6.5% of leases across Dallas, Houston and Austin communities, converting at 12%. At Fogelman, locators were only 1.3% of leads in Texas but nearly 20% of applications and 15% of move-ins. [SECONDHAND — CREDaily, 2026-07-08](https://www.credaily.com/?p=219786); the original Greystar / Fogelman source was not found. These are Texas numbers, not Arizona or California.
   - Why it's new: many regionals think of locators as a cost. The data says they're among the best sources.
   - Use: "Locators already drive a big share of your move-ins in Texas. We're the locator that verifies income first."
2. **Fraud is caught too late.** 73% of rental fraud is found after move-in. [NAA](https://naahq.org/news/beware-fake-pay-stubs)
   - Use: "Verify before the tour, not after the move-in."
3. **Phoenix oversupply.** 12.1% vacancy and over 50% of communities discounting (Matthews, Q2 2025); Phoenix had the highest share of yearlong concessions, 14.9% (Realtor.com via [CREDaily, 2026-09-20](https://www.credaily.com/?p=222979)).
   - Use: the fee on one signed lease costs less than weeks of free rent across the board. [ASSUMED math; depends on the building]
4. **Southern California differs.** Inland Empire vacancy 5.2% in Q2 2026, with Class A vacancy up after ~12,000 new units since 2023 [SECONDHAND — Northmarq summary](https://www.northmarq.com/sites/default/files/docs/NMMarketInsights-Q22026-Inland-Empire.pdf). San Diego operators offering concessions even on renewals [SECONDHAND — Matthews summary]. LA County undersupplied [SECONDHAND — USC Lusk summary].
   - Use: in SoCal, sell fraud reduction and lease-up of new Class A, not "fill your empties."
5. **How big managers buy.** Greystar pays vendors by check or ACH through Paymode-X, checks vendors through NetVendor, and runs invoices through RealPage Spend Management. Greystar runs Yardi Voyager, RealPage OneSite and Entrata Core. [spec §14; scale-3m]

## Step 6 — Core Avatar Profile

### Avatar name: **"Occupancy-Gap Olivia"**

**Profile summary.** Olivia is a regional VP over a group of communities in the Phoenix metro or Southern California. Her monthly report is occupancy, NOI, bad debt, days vacant, and cost per lease. In Phoenix she is fighting new supply with weeks of free rent. Her site teams turn over, and they're being asked to spot fake pay stubs they were never trained to catch. She doesn't need another lead source. She needs leases that stick, from renters who are who they say they are, and she needs it not to add work for her team. [composite; not a real person]

### The Core 5

**1. Desires**
- **Core desire:** Hit occupancy without giving away the store, and stop fraud from turning into bad debt.
- **Surface desires:** Fewer days vacant. Lower cost per lease. Fewer concessions. A team that sells instead of investigates. Clean source reporting.

**2. Experiences**
- **Situational:** Lease-ups and stabilized buildings competing on concessions (Matthews). Staff turnover ~32.7% (IR). Fraud in almost every portfolio (IR / NMHC).
- **With other providers:** Pays listing sites per lead or per month. Has locator invoices to approve and source disputes to settle. Has bought fraud tools and still sees fraud. [ASSUMED she has all three; each is common per IR]

**3. Emotions**
- **Primary:** Pressure. The number is the number.
- **Secondary:** Frustration at fraud that keeps adapting. Protectiveness of her team. Skepticism of vendors who promise "leads." [ASSUMED]

**4. Behaviors and habits**
- Lives in reports from Yardi, RealPage or Entrata. [ASSUMED; Greystar runs all three, scale-3m]
- Goes to NAA Apartmentalize and local AZ / SoCal apartment association events. [ASSUMED; NAA panels quoted above are where peers talk]
- Approves vendors through procurement (NetVendor-style) and finance (Paymode-X-style). [spec §14]
- Buys on peer proof and a pilot, not on a cold pitch. [ASSUMED]

**5. Demographics (last)**
- Title: Regional Manager, Regional VP, VP of Operations, or SVP Property Management. [IR / MRI; titles from the quotes above]
- Portfolio: often 10+ communities. [ASSUMED]
- Employer: a large manager (top 10 run ~2.76M units, scale-3m / NMHC via Dunn Report).
- Based at or near the manager's Arizona or Southern California office. [OWNER]

### Messaging blueprint

- **Core message:** Verified renters who want your building. You pay only for leases that last.
- **Winning hooks:** Step 4 hooks, plus "73% of rental fraud is caught after move-in. Ours is checked before the tour."
- **Pains to agitate:** weeks of free rent; fake pay stubs; bad debt; staff playing detective; paying for leads that never lease.
- **Belief to shift:** From "Locators are a cost we tolerate" → To "A locator that verifies first is the cheapest, cleanest lease source we have."

---

## Step 7 — Verify

- **Fabrication:** all quotes are from named people in linked articles. The Greystar / Fogelman locator numbers are marked SECONDHAND (one trade newsletter; original not found). SoCal market figures are marked SECONDHAND.
- **Specificity:** Olivia is a composite; demographics last.
- **Promises the offer can't back yet:**
  - "[N] pre-approved renters" must be a real count. Until renter ads run, N is zero. [OWNER sequencing: renter ads first, scale-3m]
  - Don't say "we replace your screening." Buildings still decide; Yesdoor does not hand over raw credit reports. [spec §16]
  - "Connects to Yardi / RealPage" — not yet. v1 is portal, spreadsheet and listing feed; Entrata next. [spec §17 item 7]
  - The 60-day refund is the researched default, not a signed term. [spec §12]
- **Open gaps:** Which big managers pay locators in AZ / CA (scale-3m: not found; ALN lists commission per property). No regional VP interviews yet — the first five sales calls should be recorded and fed back into this file.
