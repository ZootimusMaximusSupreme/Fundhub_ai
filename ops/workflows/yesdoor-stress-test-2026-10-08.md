# Yesdoor stress test: the 10 prompts and the cash fix

**Date:** 2026-10-08 (written 2026-10-09). **Asked by:** Chris: "this company is a CFO nightmare, but I'm sure there is a solution. Run these prompts. Do deep research."
**Prompts:** Alejandro Yaniz, "10 AI Prompts to Stress-Test Any Strategy".
**Status:** Draft 1. Built from 489 research findings across 8 questions. A fact-check pass is still running (workflow run `wf_82e79f1c-cfa`). When it finishes, any claim it kills gets struck through here, and new evidence gets added.
**How to read numbers:** every number has a source link, or says **(our math)**. Our math only uses sourced inputs.
**Owner-set and not reopened here:** $100k cash before any spend. How ad spend is funded is Chris's call. Split tests are fine. Yesdoor holds real estate licences in AZ, CA and FL. Senior living is a niche on Yesdoor. Zero going-around-us from all parties. Chris's word wins.

**Owner decision since this was written (2026-10-09):** 55+ goes first, paid at lease signing with net-30 at most. Regular apartments and assisted living come later (spec §16).

Related files: spec `docs/specs/yesdoor-senior-living-2026-10-07.md` · board `ops/workflows/yesdoor-senior-living-2026-10-07.md` · going-around-us research `ops/workflows/yesdoor-zero-circumvention-2026-10-08.md`.

---

## The short answer

| # | Answer |
|---|---|
| 1 | **Nobody lends against a fee before it is billed.** The bank regulator calls an unbilled fee "ineligible" ([OCC handbook, pp. 17–18](https://www.occ.gov/publications-and-resources/publications/comptrollers-handbook/files/asset-based-lending/pub-ch-asset-based-lending.pdf)). We found no lender that buys apartment-locator or senior-placement fees. GoHealth paid for leads up front, waited for commissions, and filed Chapter 11 on June 7, 2026 ([SEC 8-K](https://www.sec.gov/Archives/edgar/data/1808220/000162828026041369/goco-20260605.htm)). |
| 2 | **The fix is getting paid sooner, not borrowing.** Bill the day the fee is earned. Ask for payment in 10 days. Send reminders, charge late fees, and stop sending renters to late payers. A Place for Mom does all of this ([APFM partner FAQ](https://partnercentral.aplaceformom.com/faq/)). Add day-7 card cash from renters. Use Google's pay-later ad billing once Yesdoor qualifies. **(our math)** Cutting the cycle from about 3 months to about 2 lets the same $100k carry about $50k of ads a month instead of about $33k. |
| 3 | **One input in the plan can't legally happen.** The plan counts about $23 per lead of credit repair cash inside 30 days. The law bans charging for credit repair before the work is done ([15 U.S.C. 1679b](https://www.law.cornell.edu/uscode/text/15/1679b)). If it's sold by phone, the wait is 6+ months ([16 CFR 310.4](https://www.law.cornell.edu/cfr/text/16/310.4)). So the 30-day gap is the full $36 per lead. |
| 4 | **The biggest unknown is the 7.5% lease rate.** No public benchmark exists ([LetHub](https://www.lethub.co/blog/lead-to-lease-conversion-metrics)). A firm that works with 10,000+ apartment communities sees about 4% on broad leads ([Respage](https://respage.com/blog/lead-to-lease-conversion-rate-benchmark/)). At 4% a full-month fee still wins, and a half-month fee loses **(our math)**. A test of about $15k in Phoenix measures it. |
| 5 | **Focus.** Each line passes the 3-sentence test alone; together they fail (Prompt 9). 16 of 17 big marketplaces started with one city or one category ([Lenny Rachitsky](https://www.lennysnewsletter.com/p/how-to-kickstart-and-scale-a-marketplace)). The evidence points to Phoenix apartments first, while buildings are emptiest (11.6% vacancy, [Cushman & Wakefield](https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats/phoenix-marketbeats/multifamily)), and senior living second as its own test. Chris decides the order. |

---

## Part 1: The cash problem (the CFO ask)

### 1.1 How big the hole is

**The rule (our math):** cash stuck = monthly ad spend × months until the fee arrives. Payroll comes on top.

| Months from ad spend to cash | Most ads $100k can carry each month **(our math, before payroll)** |
|---|---|
| 4 | $25k |
| 3 | $33k |
| 2 | $50k |
| 1.5 | $67k |

**Where the months go: apartments**

| Step | What happens today | Source |
|---|---|---|
| Ad click → lease | Renters start looking 2.9 months before they move, on average. 16% look less than a month. | [Entrata 2024 Resident Report](https://go.entrata.com/rs/223-FOQ-437/images/Resident_Report_2024.pdf?version=0) |
| Move-in → bill | Apartment List: the move-in report is due by the 7th of the next month. | [Apartment List terms, 2026](https://assets.ctfassets.net/q0agej0fsolp/12JJDbfQjO7PFYBuWVXqGw/9d9b970cfd6bade97b98eae4c5064c97/2027_Update_to_T_Cs_v2.pdf) |
| Bill → paid | Apartment List: 30 days, so 5–10 weeks after move-in **(our math)**. Stake (Texas): 8–16 weeks after move-in. Promove (Atlanta): "typically" 60–90 days. Irvine Company: 15–20 business days, $500 flat. | [Stake rebate terms](https://www.umovefree.com/rebate-terms) · [Promove terms](https://www.promove.com/referral-program/Promove.Realtor.Referral.Program.Terms.Conditions.09-30-23.pdf) · [Irvine PDF](https://irvinecompanyapartments.com/content/dam/apartments/3-readytopublish/graphics/BrokerReferralProgramRequirements_Customer-Facing_effective2.6.25) |
| Phoenix check | Smart City pays its own agents early and says that is "60–90 days sooner" than other brokerages. So Phoenix buildings likely pay about 60–90+ days after move-in (our reading). | [Smart City Phoenix job post](https://smart-city-locating.breezy.hr/p/014004171a77-phoenix-apartment-locator) |
| Paid → safe | Yesdoor code marks a fee "safe" only 60 days after it's paid. Brokers get paid after that. | `db/migrations/436_yesdoor_money.sql`, `src/yesdoor/config.mjs` (main) |

**Total (our math):** about 2 to 7 months from ad click to cash, depending on where in the search Yesdoor meets the renter. Chris's "2–4 months" sits in the middle.

**Where the months go: senior living**

| Step | What happens today | Source |
|---|---|---|
| Lead → move-in | Median 41 days for lead-site leads. Average 58 days for assisted living. 56% move in within 30 days. One operator (12 Oaks) runs about 120–145 days. | [WelcomeHome](https://www.welcomehomesoftware.com/post/quality-move-ins-referrals) · [Aline via Ziegler](https://www.ziegler.com/media/dtten4z3/sl_znews_090423.pdf) · [SHN Sept 2026](https://seniorhousingnews.com/2026/09/09/brookdale-atria-sonida-other-senior-living-operators-adapt-to-industrys-supply-demand-imbalance/) |
| Move-in → bill | Arizona: the community has 14 days to report the admission. The agency then has 14 days to deliver the disclosure. No fee can be paid until the community has it. | [A.R.S. 36-446.14](https://www.azleg.gov/ars/36/00446-14.htm) |
| Bill → paid | Yesdoor default: 30 days. One agency: about 60 days after move-in. | migration 436 · [Innovative Senior Concepts job post](https://www.wayup.com/i-j-Senior-Living-Placement-Agent-INNOVATIVE-SENIOR-HOME-CARE-LLC-507636136046919/) |

**Total (our math):** about 85 days (41 + 14 + 30) for a typical lead. The spec says "1–2 months, not measured". That only holds with the fixes below.

### 1.2 What does NOT fix it

| Idea | Why it fails for Yesdoor now | Source |
|---|---|---|
| Borrow against fees not yet billed | Unbilled fees are ineligible. A bill 90 days past due drops out. Banks expect refunds plus disputes of 5% or less. | [OCC](https://www.occ.gov/publications-and-resources/publications/comptrollers-handbook/files/asset-based-lending/pub-ch-asset-based-lending.pdf) |
| Sell invoices (factoring) on day 1 | FundThrough: "No construction or real estate". Kriya funds only the part of a fee that can't be refunded. It needs £1M in revenue. | [FundThrough](https://www.fundthrough.com/pricing/) · [Kriya](https://kriya.co/knowledge-centre/recruitment-finance-explained) |
| Commission advances | They cover home sales paid at closing by escrow. They don't cover leases. eCommission charges about $220 to advance $2,000 for 20 days. | [eCommission](https://www.ecommission.com/commission-advance/) |
| Revenue-based loans | Wayflyer needs 6+ months of $10k+ monthly sales. Lighter Capital needs $15k+ monthly recurring revenue. Clearco needs over $100k a month. | [Wayflyer](https://help-center.wayflyer.com/en/articles/633716-what-are-the-requirements-to-get-funding-from-wayflyer) · [Lighter](https://www.lightercapital.com/how-it-works) · [Clearco](https://www.clear.co/) |
| Credit repair cash on day 1 | Banned until the work is done. 6+ months if sold by phone, even when the renter calls in from an ad. Lexington Law's owners got a proposed $2.7B judgment over this rule. Stripe won't process credit repair. | [CROA](https://www.law.cornell.edu/uscode/text/15/1679b) · [TSR](https://www.law.cornell.edu/cfr/text/16/310.4) · [CFPB](https://www.consumerfinance.gov/about-us/newsroom/cfpb-reaches-multibillion-dollar-settlement-with-credit-repair-conglomerate) · [Stripe](https://stripe.com/legal/restricted-businesses) |
| Affiliate payouts (insurance, credit builders, repair referrals) | Paid 1–4 months later and can be taken back. That's the same delay as the fees. Each adds about $1–$3 per lead **(our math)**. | [Impact payment timing](https://help.impact.com/brand/what-would-you-like-to-learn-about/getting-started/set-action-locking-and-payment-scheduling-periods) · [Credit People $84](https://www.flexoffers.com/affiliate-programs/the-credit-people-affiliate-program/) |
| Renters insurance commissions | Arizona average premium is $163 a year. At 10–15% commission that's about $16–$24 a policy, or about $1.22–$1.83 per lead **(our math)**. Getting paid needs a licensed agency. | [III](https://www.iii.org/fact-statistic/facts-statistics-homeowners-and-renters-insurance) · [WTW](https://www.wtwco.com/en-us/notices/personal-lines-national-commission-rates) · [A.R.S. 20-298](https://www.azleg.gov/ars/20/00298.htm) |

### 1.3 What DOES fix it: the cash plan, ranked

| # | Fix | Who already does it | What it does to cash | The catch |
|---|---|---|---|---|
| 1 | **Bill the day the fee is earned.** Bill at lease signing or on move-in day, not after a monthly report. The contract makes the building report within 24 hours. | Zillow: the fee is owed when the lease is signed ([10-K](https://www.sec.gov/Archives/edgar/data/1617640/000161764026000015/z-20251231.htm)). APFM bills within 24 hours of move-in ([FAQ](https://partnercentral.aplaceformom.com/faq/)). A California senior fee contract requires notice within 24 hours ([template](https://forms-library.signnow.com/316868-referral-and-placement-fee-agreement-california-home-for-seniors)). | Cuts about 1–5 weeks of reporting delay **(our math)**. | We need proof of the lease or move-in. Monthly rent-roll checks already sit in the going-around-us stack (spec §15). |
| 2 | **Net-10, reminders at +7 and +14 days, a late fee, and no new renters for late payers.** | APFM: net-10/30, late fees, cut-off ([FAQ](https://partnercentral.aplaceformom.com/faq/)). Reed: bills due in 14 days ([terms](https://resources.reed.com/hubfs/7.%20RFP%20%2B%20EMEA/EMEA/RSR%20Terms%20of%20Business%20%28ROI%29.pdf)). Fundhub already runs notice, +7, +14 and staff hand-off steps for funding fees. | Net-10 instead of net-30 is about 3 weeks sooner **(our math)**. | Yesdoor code today: net-30 default and no reminder steps for building bills (migration 436). This is a build item. |
| 3 | **The refund promise only holds if the building paid on time.** | Reed Ireland's terms. UK Recruiter gives the same advice. ([Reed](https://resources.reed.com/hubfs/7.%20RFP%20%2B%20EMEA/EMEA/RSR%20Terms%20of%20Business%20%28ROI%29.pdf) · [UK Recruiter](https://ukrecruiter.co.uk/?p=2937892)) | Gives payers a reason to pay on time. | Not seen in apartment or senior contracts yet. New for this market. |
| 4 | **Senior: the family signs the Arizona disclosure before names unlock** (already in spec §5a). The community can then pay right away. | Arizona law holds the fee until the community has the record ([A.R.S. 36-446.14](https://www.azleg.gov/ars/36/00446-14.htm)). | Removes up to about 4 weeks of legal hold **(our math)**. | None. It's already the plan. |
| 5 | **Electronic payment (ACH).** | Greystar's suppliers on electronic pay "report receipt of payment up to 10 days faster" than checks ([Greystar](https://greystar.com/contact-us/supplier-and-vendor-opportunities/us-supplier-partnerships)). | Up to about 10 days. | Big managers make vendors register first. |
| 6 | **Some money before the move-in:** a small fee per approved tour (taken off the placement fee later) or a monthly listing fee. Split-test it. | Senior Living Smart charged $400 per tour (2015, [SHN](https://seniorhousingnews.com/2015/12/13/how-senior-living-can-build-better-referral-pipelines/)). SeniorVu charged $20 a month plus $10 a lead ([SLF](https://www.seniorlivingforesight.net/new-disruptive-technology-unveiled-at-argentum-stronger-leads-less-work-lower-cost/)). Caring.com sells per lead ([how it makes money](https://www.caring.com/about/how-we-make-money)). Apartment List adds a $39 monthly fee for 100+ unit communities ([listing](https://rentalrealestate.com/tools/apartment-list/)). Zillow offers a flat monthly rate ([Zillow](https://www.zillow.com/z/rental-property-advertising/)). | Fair per-lead value **(our math)**: apartments about $112.50 at a 7.5% lease rate. Senior about $53–$256. | Arizona's required senior disclosure sentence assumes pay-on-move-in ([SB 1477](https://www.azleg.gov/legtext/57leg/2R/laws/0178.htm)). Nevada ([NRS 449.1145](https://www.leg.state.nv.us/NRS/NRS-449.html)) and Texas ([SB 1383](https://capitol.texas.gov/tlodocs/89R/billtext/html/SB01383F.htm)) allow period fees. When Nevada used subscriptions, small communities balked ([minutes](https://archive.leg.state.nv.us/Session/82nd2023/Minutes/Senate/HHS/Final/704.pdf)). We found no apartment or senior buyer that prepays placement credits. |
| 7 | **Day-7 renter cash:** the $27 denial breakdown. In Arizona, a Zillow-style $35 "apply everywhere" pass. The paid roadmap (spec §14, not decided). | Zillow charges renters $35 to apply to any number of listings for 30 days ([Zillow](https://www.zillow.com/rental-manager/tenant-screening/)). Commas card cash lands about day 7 (`docs/finance/slo-cash-flow-scaling-2026-09-18.md`). | If 26% of leads buy a $35 pass, it covers the $9 pull **(our math)**. | California and Florida refund most renter-paid list fees (spec §14). Card disputes stay open 120 days ([Stripe](https://docs.stripe.com/disputes/how-disputes-work)). Nobody has measured how many will buy. |
| 8 | **Pay the ad bill later:** Google Ads monthly invoicing, net-30. | [Google Ads](https://support.google.com/google-ads/answer/2375377) | Each $10k a month of Google ads gets paid about a month later **(our math)**. | Needs a business at least 1 year old, an account in good standing 6 months, and $5k a month of spend in 3 of the last 12 months. Our sources show no Meta equivalent. |
| 9 | **Use paid fees now and keep a refund reserve,** instead of freezing each fee for 60 days. | Robert Half books a placement fee when the offer is accepted and holds a reserve for its 90-day guarantee ([10-K](https://www.sec.gov/Archives/edgar/data/315213/000031521326000006/rhi-20251231.htm)). | Frees each fee about 60 days sooner for spending, minus the reserve **(our math)**. | Size the reserve from Yesdoor's real refund rate, and aim for under 5% (the bank bar above). |
| 10 | **Later, not now:** sell bills once Yesdoor has a payment history. | altLINE prices rise with age, from 1.5% (0–30 days) to 4.5% (81–90 days) ([altLINE](https://altline.sobanco.com/invoice-factoring/invoice-factoring-rates-explained/)). QUBA (UK) advances 75% when a placement starts ([QUBA](https://quba.solutions/recruitment-funding-solutions/perm-recruitment-funding/)). SBA working-capital lines need 1 year of history ([SBA](https://www.sba.gov/funding-programs/loans/7a-loans)). | About $60 to advance a $1,500 fee paid on day 75 **(our math)**, if a factor will buy it. | Factors check the payer's credit. "Non-recourse" doesn't cover disputes ([altLINE](https://altline.sobanco.com/recourse-vs-non-recourse-factoring/)). |

### 1.4 The spend rule (our math, built on Hormozi's 30-day rule in *$100M Money Models*, [Lenny's payback benchmarks](https://www.lennysnewsletter.com/p/payback-period), [Skok](https://www.forentrepreneurs.com/saas-metrics-2/) and [Balfour](https://brianbalfour.com/essays/average-cac-mistakes-growth))

1. **Monthly ad spend ≤ (cash − 3 months of payroll) ÷ months from spend to cash.**
2. Raise spend only out of fees actually collected.
3. **Stop signal:** money owed to Yesdoor grows faster than cash for 2 months in a row. GoHealth was owed $925.2M with $32.9M of cash, 28 times its cash **(our math)**, before it went bankrupt ([8-K Ex. 99.1](https://www.sec.gov/Archives/edgar/data/1808220/000162828026022434/goco-20251231xexhibit991.htm)).
4. Never let one payer be more than 20% of what is owed to Yesdoor (a lender rule in an [ABF Journal example](https://www.abfjournal.com/understanding-the-concept-and-rationale-of-standard-accounts-receivable-ineligibles/)).

### 1.5 With the fixes (our math)

| | Today | With fixes 1–5 and 9 |
|---|---|---|
| Apartments: move-in → cash | about 5–16 weeks | about 2–4 weeks |
| Senior: lead → cash | about 85 days | about 55 days (41 + 3 + 10) |
| Ads $100k can carry each month, before payroll | about $33k (3-month cycle) | about $50k (2-month cycle) |

---

## Part 2: The 10 prompts

### Prompt 1: Hidden assumptions

| Assumption | What the evidence says | Likely true? | If it breaks |
|---|---|---|---|
| 7.5% of leads lease | No benchmark exists ([LetHub](https://www.lethub.co/blog/lead-to-lease-conversion-metrics)). About 4% on broad leads ([Respage](https://respage.com/blog/lead-to-lease-conversion-rate-benchmark/)). 12% on leads a locator already vetted ([Bisnow](https://www.bisnow.com/dallas-ft-worth/news/multifamily/apartment-locators-balance-transparency-with-tiktok-trends-as-their-influence-expands-135286)). | Low–Medium | At 4%, ads plus the pull cost $900 per lease **(our math)**. Still fine on a full-month fee, but a loss on a 50% fee. |
| A lead costs $27 | Real estate Facebook leads average $13.74 in 2026. The all-industry average is $27.39 ([LocaliQ](https://localiq.com/blog/facebook-advertising-benchmarks/)). Meta's price per ad rose 12% in a year ([Meta Q2 2026](https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Second-Quarter-2026-Results/default.aspx)). | High | The Google fallback costs $99.48 per apartments lead ([LocaliQ search](https://localiq.com/blog/real-estate-advertising-benchmarks/)). |
| A pull costs $9 | A credit-only soft pull is $3.84–$7.99 ([iSoftPull](https://app.isoftpull.com/pricing)). But the spec also checks evictions and criminal records. That full check lists at $34.99–$49 ([Checkr](https://checkr.com/pricing) · [SmartMove](https://www.mysmartmove.com/)). | High for credit only. Low for the full check. | A lead costs $62–$76 if every lead gets the full check **(our math)**. Fix: run the eviction and criminal check only after the renter picks a building. |
| The fee is about $1,500 | Phoenix median rent is $1,255 ([Apartment List](https://www.apartmentlist.com/rent-report/az/phoenix)). The average is $1,496 ([RentCafe](https://www.rentcafe.com/average-rent-market-trends/us/az/phoenix/)). Discounts run 14.8%, tied for deepest of the 50 biggest metros ([RealPage](https://www.realpage.com/analytics/concessions-by-metro-august-2026/)). Buildings near full pay about 50% ([AptAmigo](https://blog.aptamigo.com/locator-commission/)). | Medium | A 50% fee needs a 5.7% lease rate to break even **(our math)**. |
| Second-chance buildings pay | A national second-chance locator claims 50–70% of buildings pay no locator fee, and most that do pay 50%. It charges renters instead ([Second Chance Locators](https://secondchancelocators.com/about-us/)). That's a competitor's claim, not data. | Low–Medium | Renter-paid fees (Arizona only, spec §14) or a signed fee before sending renters. |
| Fees arrive 2–4 months after the lead | 2–7 months from the ad click (§1.1, our math). | Medium | More cash stuck. See §1.1. |
| Credit repair pays on day 1 | Banned (§1.2). | **Low** | The 30-day gap is the full $36 per lead. |
| A senior lead costs about $71 | It traces to 2020–21 LocaliQ social data from small budgets, and it includes home care ([LocaliQ](https://localiq.com/blog/healthcare-advertising-benchmarks/)). Senior search leads rose 46% since then ([LocaliQ search](https://localiq.com/blog/healthcare-search-advertising-benchmarks/)). | Low–Medium | About $104 if social rose the same way **(our math, an assumption)**. |
| 2–5% of senior leads move in | Sonida 1.8%, Beztak 2.6% ([SHN](https://seniorhousingnews.com/?p=50237)). Lead-site leads 4% per community ([WelcomeHome](https://www.welcomehomesoftware.com/post/data-shows-what-happened-benchmarks-show-what-it-means)). The affordability check might raise it. That's unmeasured. | Medium | Break-even after advisor pay is 2.5% at a $3,500 fee **(our math)**. |
| Communities will pay $3,500–$6,400 | Arizona median is $6,370 a month ([CareScout 2024](https://assets.carescout.com/55da049c1f/282102.pdf)). One operator says dropping paid referrals saved it $5,000–$7,000 per move-in ([SHN, sponsored](https://seniorhousingnews.com/2024/02/26/how-one-operator-saves-5k-per-move-in-and-another-boosts-website-move-ins-by-67/)). But occupancy hit 90.4% ([NIC](https://www.nic.org/news-press/senior-housing-occupancy-nears-record-high-as-majority-of-markets-surpass-90/)), and 28% of communities took zero lead-site leads in Q2 2026 ([WelcomeHome](https://www.welcomehomesoftware.com/post/the-leads-are-falling-the-sky-is-not-here-s-what-s-happening)). | Medium | Start with small homes that have no sales team (spec §5a). |
| Buildings and communities will sign quickly | CarePatrol spends about 6 weeks building its provider network before referrals flow ([CarePatrol](https://carepatrol.com/franchising/business-opportunity-senior-care-advisor/)). | Medium | Sign them before any ad money is spent. That costs nothing from the $100k. |
| Nobody goes around us | No source measures how often renters skip a locator. Google is piloting rental listing ads in Q4 2026 ([Digible](https://digible.com/our-thoughts/google-real-estate-ads/)). | Medium | The going-around-us stack (spec §15). |
| One team can run every line | 7 payer types and about 18 offers across the plans **(our count)**. | Low | Prompt 9. |
| Meta keeps accepting the ads | Housing ads lose age, ZIP and lookalike targeting. "Are you bankrupt?" style hooks are banned ([Meta](https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category/) · [Meta ad standards](https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/)). | Medium–High if the copy follows the rules | A library of copy that passes the rules, before launch. |

### Prompt 2: Pre-mortem. It's October 2027 and Yesdoor ran out of cash

| When | What went wrong | The signal we missed | What we do now |
|---|---|---|---|
| Months 1–2 | Apartments, senior living and add-ons launched together. Nobody owned collections. | Nobody could say who pays first (Prompt 9). | One line, one payer, one offer. One named owner for collections. |
| Months 2–4 | 4% of leads leased, not 7.5%. The full background check ran on every lead. | Ads plus checks topped $900 per lease. | Run the full check after the renter picks a building. Measure on about 430 leads before scaling. |
| Months 3–6 | Second-chance buildings paid 50% or nothing. Fees were figured on discounted rent. | The fee mix in signed agreements. | Get the fee level signed before sending renters. Buy commission data per building: ALN sells it for $50 per market per month ([ALN](https://alndata.com/locator)). |
| Months 4–8 | Buildings paid 60–90 days after move-in. What we were owed grew faster than cash. That's the GoHealth pattern: in 2025 it burned $121.9M of operating cash with a 14.43% loan rate ([10-K](https://www.sec.gov/Archives/edgar/data/1808220/000162828026022454/goco-20251231.htm)). | Owed up and cash down, 2 months in a row. | §1.3 fixes 1–5 and the spend rule. |
| Months 6–9 | Meta rejected "bad credit?" hooks. Lead cost climbed. | Ad rejections. Cost per lead over $40. | Rule-safe copy. Have buildings send us the renters they deny (Grubhub got about 30% of new sign-ups from restaurants, [Casey Winters](https://www.caseyaccidental.com/p/the-best-way-to-drive-demand-in-marketplaces)). |
| Months 6–12 | Sunny paid Phoenix renters $150–$500 cash back ([Sunny](https://www.sunny.com/az/phoenix)). Smart City opened in Phoenix in November 2026 ([Smart City](https://smartcitylocating.com/phoenix-apartments/home-page-phoenix/)). "Who referred first" fights grew. | A rising duplicate-claim rate. | Register before reveal. Any renter reward is disclosed and paid only on a checked lease (spec §15). |
| Months 9–12 | Senior communities at 90% full wouldn't add another agency. Paid senior leads moved in at about 2%. Each move-in cost more in ads than the fee. | Under 2.5% move-ins after 200 leads. | Small homes first. Match on budget. Call within minutes (speed raises conversion, [Aline](https://www.ziegler.com/media/dtten4z3/sl_znews_090423.pdf)). |
| Month 12 | Failing buildings never paid. Bankrupt owners listed unpaid fees: Smart City $3,354 ([Whitestone filing](https://storage.courtlistener.com/recap/gov.uscourts.txnb.527947/gov.uscourts.txnb.527947.5.0.pdf)); Apartment List $29,538 and Apartments.com $185,923, all marked disputed ([Louis Investments filing, 2026](https://storage.courtlistener.com/recap/gov.uscourts.txnb.544656/gov.uscourts.txnb.544656.45.0_2.pdf)). | Bills more than 60 days late. | The 20% cap per payer. Stop sending renters to late payers. |

Most startup deaths are running out of cash (70% of 431 shutdowns), but that's the last step. Poor fit (43%) and bad unit math (19%) come first ([CB Insights](https://www.cbinsights.com/research/report/startup-failure-reasons-top/)).

### Prompt 3: The 10 hardest board questions

| # | Question | Straight answer |
|---|---|---|
| 1 | One business or three? | Today, three: 7 payer types and about 18 offers **(our count)**. Paul Graham: if you can't say it in one phrase, "your plans may not be sufficiently focused" ([PG](http://paulgraham.com/investors.html)). The fix is one line at a time. |
| 2 | Who pays first, and when does the cash land? | The building or community. Apartments: 2–16 weeks after move-in. Senior: about 85 days after the lead (§1.1). |
| 3 | What's the real lease rate? | Unknown. 4% on broad leads, 12% on vetted ones (Prompt 1). We measure it on about 430 leads. |
| 4 | What if a building pays half, or nothing? | It happens (Prompt 1). Break-even goes from 2.4% to 5.7% **(our math)**. |
| 5 | Why would a renter use us over Sunny's $500 or Zillow? | Zillow charges $35 to apply. Yesdoor shows who will say yes before anyone applies. Not proven yet. Apartment List also only takes 20+ unit properties ([Apartment List](https://portal.apartmentlist.com/listwithus)), so small buildings are open. |
| 6 | Why would a senior community add another agency? | Most won't. Lead-site leads per 100 units fell about 20% since January 2025 ([WelcomeHome](https://www.welcomehomesoftware.com/post/the-leads-are-falling-the-sky-is-not-here-s-what-s-happening)). The opening is about 1,320 small Phoenix homes with no sales team (spec §5a). |
| 7 | How deep is the cash hole, and what stops a GoHealth? | Ads × months to cash (§1.1). The spend rule and the stop signal (§1.4). No lender before billing. |
| 8 | What if Meta blocks the ads or prices rise? | Rule-safe copy. Keep paid ads at 30–40% of new users over time ([Andrew Chen](https://andrewchen.com/paid-marketing-addiction/)). Get buildings to send us renters. |
| 9 | Who goes around you, and how would you know? | Nobody publishes a rate. Contracts, register-before-reveal, and a monthly rent-roll match ([zero-circumvention board](yesdoor-zero-circumvention-2026-10-08.md)). |
| 10 | What number makes you stop? | Prompt 10's stop rules. |

### Prompt 4: How competitors respond

No source showed an incumbent cutting its fee to beat a newcomer. They pay the consumer, sell search rank, buy rivals, sue, and lobby.

| Competitor | What they've done | Likely response to Yesdoor | Our counter-move |
|---|---|---|---|
| **Apartment List** (pay per lease, about 6M units) | Sunny pays Phoenix renters $150–$500 ([Sunny](https://www.sunny.com/az/phoenix)). It sells rank by auction ([LIFT](https://www.apartmentlist.com/rental-management/lift-apartment-list-search-ranking)). It's inside ChatGPT and AppFolio. | Raise cash back. Get buildings to bid more per lease. | Show approval odds first (they don't). Go after buildings under 20 units. Any reward is small, disclosed, and paid only on a checked lease. |
| **Zillow** (rentals up 31%, 79,000 apartment properties) | "Capture more of the marketing dollars"; the only real estate app in Google Gemini ([Q2 2026 letter](https://www.sec.gov/Archives/edgar/data/1617640/000161764026000050/exhibit992.htm)). | Bundle more into the building's flat fee. | Don't fight on listings. Be the "who will say yes" step. |
| **Smart City Locating** (300+ agents, opens in Phoenix November 2026) | Pays its agents early. Sends hard second-chance renters to second-chance services ([Smart City](https://smartcitylocating.com/blog/renting-roadblocks-reasons-apartment-applications-get-denied/)). | Fight over the same buildings. | The renters it sends away are Yesdoor's lane. |
| **Apartments.com / CoStar** | Subscriptions. A $500M judgment over copied photos ([CoStar](https://en.wikipedia.org/wiki/CoStar_Group)). | Sue copycats. | Never copy their photos or data. |
| **A Place for Mom** (about $100M of marketing a year) | Budget matching since 2024 ([SHN](https://seniorhousingnews.com/2024/11/18/how-a-place-for-moms-new-ceo-is-evolving-the-companys-relationships-with-operators/)). A $500 USAA gift card per move-in ([SHN](https://seniorhousingnews.com/2023/11/21/transactions-morningstar-living-moravian-manor-affiliate/)). Owns AgingCare. Won a case over listing communities that don't pay it ([dismissal](https://storage.courtlistener.com/recap/gov.uscourts.nysd.633725/gov.uscourts.nysd.633725.35.0.pdf); appeal filed Oct 7, 2026). Sues to collect. | Outspend us, and tighten its "we referred them first" rules. | Small homes (APFM lists under half of communities). Call in minutes. Families sign before names unlock. |
| **SilverAssist** (Caring.com + 130 Oasis offices) | Bought Caring.com in January 2026. Bridge loans of $5k–$500k in about 24 hours ([ElderLife](https://www.elderlifefinancial.com/bridge-loans/)). Pitches itself as "operator-first" ([SHN](https://seniorhousingnews.com/2026/01/15/what-the-caring-com-acquisition-means-for-senior-living-sales-and-marketing/)). | Same pitch as ours, with more money. | Our own affordability check plus Fundhub-style lender matching for families who need a bridge (an idea, not decided). |
| **CarePatrol** (5 metro Phoenix offices) | Sues ex-owners under 2-year, 50-mile non-competes ([court record](https://storage.courtlistener.com/recap/gov.uscourts.flsd.573346/gov.uscourts.flsd.573346.1.0.pdf)). | Defend its territory. | Don't hire their advisors. Win on online speed. |

### Prompt 5: Resource reality and a phased plan

| Realistic | Too ambitious for $100k |
|---|---|
| One city (Phoenix) and one line at a time | Three states at once |
| About 25 signed buildings first | 7 payer types and about 18 offers |
| A test of about $15k in ads | A $200k-a-year salesperson before proof: about $50k over 90 days, half the gate **(our math)** |
| One licensed person plus agents. CarePatrol owners start alone at home ([CarePatrol](https://carepatrol.com/franchising/research-carepatrol/faqs/)). | Senior living, apartments and insurance at the same time |

**Phased version**

| Phase | When | What | Ad money |
|---|---|---|---|
| 0 | Now, before the gate | Put the PR #55 code live (`/api/yesdoor/public/listings` still returns 404). Sign about 25 Phoenix buildings. Add net-10, reminder steps and a late fee. Set up consent logs. Build items wait on Chris's go. | $0 |
| 1 | Days 1–90 after the $100k | The Phoenix apartments test (Prompt 10) | About $15.4k |
| 2 | If apartments pass | Grow apartments under the spend rule. Start the senior test with small homes (about $14.4k). Google pay-later billing once Yesdoor qualifies. | By the rule |
| 3 | If senior passes | Grow senior. Add-ons through the licensed agency. Next state. | By the rule |

### Prompt 6: Second-order effects

| Who | Second order | Third order |
|---|---|---|
| Renters | Shown only paying buildings, they also check Zillow. OpenTable listed only its partners, and Yelp took the search ([Lenny](https://www.lennysnewsletter.com/p/what-theyd-do-differently-kickstarting)). | Fewer renters come back to Yesdoor for their next move. |
| Second-chance renters | Extra charges: guarantors cost 24–130% of a month's rent ([TheGuarantors](https://theguarantors.com/key-pm)). Screening flags bring add-on fees ([CFPB](https://files.consumerfinance.gov/f/documents/cfpb_tenant-background-checks-market_report_2022-11.pdf)). | Complaints, then a press story, then a state law. That's what happened to APFM: a 2010 story, a 2011 Washington law, a 2024 Senate letter ([RCW 18.330](https://app.leg.wa.gov/RCW/default.aspx?cite=18.330&full=true)). |
| Families | Too many calls. One APFM reviewer counted 35 ([Trustpilot](https://www.trustpilot.com/review/www.aplaceformom.com)). | Robocall lawsuits run $500–$1,500 per text or call ([47 U.S.C. 227](https://www.law.cornell.edu/uscode/text/47/227)). |
| Team | Collections becomes a real job. Irvine voids a fee if the claim is late ([Irvine](https://irvinecompanyapartments.com/content/dam/apartments/3-readytopublish/graphics/BrokerReferralProgramRequirements_Customer-Facing_effective2.6.25)). | New hires paid per lease need 90+ classroom hours and an exam first ([A.R.S. 32-2124](https://www.azleg.gov/ars/32/02124.htm)), so growth waits on licensing. |
| Buildings and communities | Full buildings cut fees to 50%. A building already paying Apartment List sees Yesdoor as a second fee. | Big operators move referrals in-house, like Beztak and Sonida ([SHN](https://seniorhousingnews.com/?p=50237)). |
| Operations | More volume, more disputes. Credit repair needs a high-risk card processor that holds 0–10% back ([Durango](https://durangomerchantservices.com/merchant-account-for-credit-repair/)). | Payer bankruptcies turn fees into unpaid claims (Prompt 2). |
| Competitors | Matching Sunny's cash back sends money out 4–9 weeks before the fee comes in **(our math)** ([Sunny FAQ](https://www.sunny.com/faq)). | A cash-back race drains the thin margin. |

### Prompt 7: What must be true

| Condition | We control it? | How we'll know |
|---|---|---|
| Every building and community signs the fee agreement before any referral | **Yes** | Signed agreements |
| Each fee is billed within 24 hours, at net-10, with reminders | **Yes** | Days from move-in to paid, per building |
| The lead is called within minutes | **Yes** | Speed-to-call report |
| Leases or move-ins clear break-even (apartments 2.4–5.7%, senior about 2.5%) | Partly | The 90-day test |
| Refunds plus disputes stay under 5% | Partly | The ledger |
| Phoenix buildings stay empty enough to pay full fees | No (outside bet). Phoenix rent cuts are shrinking ([RealPage](https://www.realpage.com/analytics/3q-2026-us-data-update/)), so fees may shrink in 2027–2028 (our reading). | The fee mix in new agreements |
| Meta prices and rules stay workable | No (outside bet) | Cost per lead, ad rejections |
| Senior operators keep paying agencies | No (outside bet). Occupancy is at a record high. | New community sign rate |
| Rivals don't outbid us for renters | No (outside bet) | Duplicate claims, lost-renter surveys |

### Prompt 8: Three realistic worst cases

| Worst case | How it happens | Early warning | Do now |
|---|---|---|---|
| **1. Cash squeeze** | Slow payers, 50% fees and refunds all hit at once. That's the GoHealth and SelectQuote path. SelectQuote marked revenue down $193.3M when more customers cancelled than it assumed ([10-K](https://www.sec.gov/Archives/edgar/data/1794783/000179478324000061/slqt-20240630.htm)). | Money owed up and cash down 2 months in a row. Median days-to-pay over 45. | §1.3 fixes 1–5 and 9. The spend rule. |
| **2. The lead engine breaks** | Meta rejects ads, leads cost more, the lease rate sits near 3–4%. | Upper end of the lease-rate range under 3%. Cost per lead over $40. | Rule-safe copy before launch. Renters sent by buildings. Only test early steps against each other (Prompt 10). |
| **3. Squeezed from both sides** | Sunny's cash back, Smart City in Phoenix, buildings cutting fees, APFM outspending us. Or a texting or consent lawsuit. MediaAlpha and Assurance IQ paid $145M to the FTC over lead practices ([FTC](https://www.ftc.gov/news-events/news/press-releases/2025/08/assurance-iq-mediaalpha-pay-total-145-million-settle-ftc-charges-they-misled-consumers-seeking)). | Buildings slow to sign. Duplicate fights rise. Complaints. | Register before reveal. Signed consent logs. A renter reward only on a checked lease. |

### Prompt 9: The simplicity test

**The whole plan fails.** It only fits in 3 sentences if each sentence is a list, and a new hire still can't say who the main customer is.

**Focused apartments: passes.**
1. Yesdoor shows Phoenix renters which apartment buildings will say yes, using one soft credit check that doesn't hurt their score.
2. We book the tour, and the building pays us about one month's rent after the renter moves in.
3. Renters who aren't approved yet can buy a $27 breakdown of what to fix.

**Focused senior: passes.**
1. Yesdoor's free check shows a Phoenix family which assisted living homes their parent can afford and will be accepted at.
2. An advisor books the tours.
3. The home pays us when the parent moves in.

Each line passes alone. Together they fail. The problem is running them at the same time, not any one line. Rover's early leader called adding lines at the seed stage "probably a mistake" ([Lenny](https://www.lennysnewsletter.com/p/what-theyd-do-differently-kickstarting)). Shyp's CEO called running two customer types at once "my mistake" ([Kevin Gibbon](https://www.linkedin.com/pulse/i-cant-wait-you-see-what-we-do-next-kevin-gibbon/)).

### Prompt 10: The 90-day pressure test

**Goal:** prove the unit math and the payment speed, not the total cash. Most apartment cash lands after day 90 **(our math)**.

| Milestone | Days | Proof |
|---|---|---|
| 1. Supply signed | 1–30 (start before the gate) | About 25 Phoenix buildings with signed fees. The share at 100% vs 50%. Each building's payment terms. |
| 2. Unit math measured | 31–75 | About 430 leads (about $15.4k). Cost per lead, pull match rate, tour rate, lease rate with a 95% range, and the share who buy the $27 breakdown. |
| 3. Cash proven | 60–90 | First bills paid. Median days from move-in to paid, per building. Refund and dispute rate. Attempts to go around us that we caught. |

**Stop or grow (our math)**

| Line | Stop if | Grow if |
|---|---|---|
| Apartments | By about day 75, the top of the 95% lease-rate range is under 3%. Or most buildings haven't paid their first bill within about 45 days of move-in. | The bottom of the range is at least 5%, and median move-in to paid is 30 days or less. |
| Senior (later test, about 203 leads, $14.4k) | 1 or fewer move-ins from the first 100 leads after 60 days. If the true rate were 5%, that happens only about 4% of the time. | 5 or more move-ins from the first 100 leads. If the true rate were 2%, that happens only about 5% of the time. |

**Split tests (Chris: "we can split test ideas")**
- Testing lease rate against lease rate needs about 2,005 leads per version. That's out of reach.
- Early steps, like 40% vs 55% signing the disclosure or booking a tour, need about 173 per version ([Evan Miller calculator](https://www.evanmiller.org/ab-testing/sample-size.html) plus our math).
- So split-test the early steps: names before vs after signing, and online-first vs an advisor call first (spec §13).

---

## Repo facts the research changed (not edited; listed for Chris)

"Board" means `ops/workflows/yesdoor-senior-living-2026-10-07.md`.

| Where | What it says | What the research found |
|---|---|---|
| Spec §1 | "a Senate probe found about 40% of A Place for Mom families were placed above their budget" | The 40% comes from APFM's own partner FAQ, quoted in Sen. Casey's 2024 letter ([SHN](https://seniorhousingnews.com/2024/06/20/us-senator-probes-a-place-for-mom-alleging-deceptive-practices/)). Also, APFM has matched on budget since 2024, so the "nobody checks money first" edge is smaller. |
| Spec §13 | Senior lead about $71 | 2020–21 data that includes home care. About $104 is possible today (Prompt 1). |
| Spec §13 | Senior fees in about 1–2 months | About 85 days typical; 12 Oaks runs 120–145 days (§1.1). |
| Yesdoor money plan (`acq-money-model.md`, branch `yesdoor-3m-scale`) | Credit repair cash inside 30 days | Not allowed (§1.2). |
| `marketing/offers/yesdoor/scale-3m.md` (branch `yesdoor-3m-scale`) | Google lead at $35.52 (2021 data) | $99.48–$102.51 in 2026 ([LocaliQ](https://localiq.com/blog/real-estate-advertising-benchmarks/)). |
| `ops/workflows/yesdoor-3m-scale-2026-10-07.md` line 83 | Fees paid "30–90 days", citing a Rentgrata page | That page covers resident move-in bonuses, not locator fees. Use Promove, Stake and Irvine instead (§1.1). |
| Board line 47 | "A Place for Mom robocall settlement $6M (2020)" | Preliminary approval was denied in 2019. The final outcome isn't verified ([Bloomberg Law](https://news.bloomberglaw.com/class-action/robocall-class-settlement-worth-6-million-denied-initial-nod)). |
| Board line 59 | Oasis has 130 franchises | Confirmed ([SHN](https://seniorhousingnews.com/2023/10/16/silverassist-acquires-oasis-senior-advisors-expanding-care-navigation-services/)). |
| Board line 59 | "No public sign any of them runs an affordability + acceptance check before referring" | A Place for Mom built a model by April 2024 that matches families on budget, location and care needs ([SHN](https://seniorhousingnews.com/2024/04/15/a-place-for-mom-names-new-ceo-current-leader-kutscher-to-chair-board/)). |
| Board line 47 | Cedar Communities v. Caring.com | Real. Both sides dismissed it on July 14, 2026, without prejudice, so it could be filed again ([court record](https://storage.courtlistener.com/recap/gov.uscourts.gand.339890/gov.uscourts.gand.339890.30.0.pdf)). |

## Not reached yet

- **The fact-check pass is still running.** This file gets updated when it ends.
- Two rounds hit the shared web-search limit and read known pages directly. Reddit, BBB and podcasts weren't searched.
- No Phoenix locator fee data is public. ALN sells it at $50 per market per month.
- No current per-tour price list for senior living. APFM's contract payment days aren't public.
- How often renters or families go around a locator: no source measures it anywhere.
