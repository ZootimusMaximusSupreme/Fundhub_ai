# Yesdoor: selling and onboarding big operators (research 2026-10-07)

## Analogs: pay-only-on-success offers

- **Contingency recruiting** (paid only on hire):
  - Fees 15–25%; Bullhorn 2024 average 18.5% ([pin.com](https://www.pin.com/blog/negotiate-recruiter-fees/)).
  - Supplier onboarding takes 15–28 days at 63% of firms and 29–60 days at 31% (HICX 2021, [stampli](https://www.stampli.com/resources/vendor-onboarding-cycle-time-benchmarks/)).
  - Big buyers cut their agency lists to about 4 ([Robert Walters](https://robertwaltersgroup.com/content/dam/robert-walters/corporate/news-and-pr/files/whitepapers/robert-walters-ireland-implementing-and-maintaining-a-recruitment-psl.pdf)).
  - First agency to submit owns the candidate for 6–12 months; no fee if the company already knew the person ([BountyJobs](https://blog.bountyjobs.com/candidate-ownership-terms-a-must-have-in-any-recruitment-agency-contract_)).
  - Time to sign an enterprise client: not found.
- **A Place for Mom** (free to families; communities pay on move-in):
  - 14,000 of ~30,600 US communities ([SHN](https://seniorhousingnews.com/2024/06/20/us-senator-probes-a-place-for-mom-alleging-deceptive-practices/)). Grew partly by buying OurParents, which added 2,500 facilities ([Wiki](https://en.wikipedia.org/wiki/A_Place_for_Mom)).
  - Fees up to 100% of first month ([SHN](https://seniorhousingnews.com/2017/03/20/ace-contract-process-senior-housing-referral-agencies/)).
  - Credit fights: the same family arrives from two agencies, so communities push "no fee if already a prospect" and leads that expire.
  - Big operators cut back to build their own leads: Five Star's APFM share fell under 5% ([SHN 2017](https://seniorhousingnews.com/2017/11/10/five-star-seeks-momentum-promising-occupancy-trends/)); Brookdale and Sonida are building their own ([SHN 2024](https://seniorhousingnews.com/2024/11/18/how-a-place-for-moms-new-ceo-is-evolving-the-companys-relationships-with-operators/)).
  - US Senate probe in 2024 ([NBC](https://www.nbcnews.com/news/us-news/senate-announces-probe-place-for-mom-referral-service-rcna157282)).
- **Apartment List:** ~85% of revenue from pay-per-lease. AppFolio customers now sign up inside AppFolio with no separate onboarding ([Apartment List](https://www.apartmentlist.com/rental-management/apartment-list-joins-appfolio-stack)).
- **Rent.com (2009):** landlords disputed pay-per-lease bills they couldn't match to their own visitor records ([MFE](https://www.multifamilyexecutive.com/technology/multifamily-operators-grapple-with-lead-to-lease-tracking_o)).
- **Relocation companies** take 25–40% of commission ([Inman](https://inman.com/2007/02/13/relocation-fees-reach-breaking-point-some-agents)).
- **Mortgage:** paying a referral fee tied to a funded loan breaks federal settlement law (RESPA); a flat price per lead is allowed ([Foley](https://www.foley.com/insights/publications/2017/02/the-cfpbs-respa-consent-orders-eight-key-takeaways/)). This matters for the later mortgage expansion.

## Risks these analogs predict (and the system answer)

1. **"That renter was already ours."** → first-touch timestamp, a registration that expires, and a "known renter, no fee" rule. Added to the build spec §5b.
2. **The biggest customers build their own leasing and leave** (APFM/Five Star). → lock in portfolio contracts, and keep renter data and repeat renters on Yesdoor.
3. **Fees shrink when buildings are full.** → the model's fee per lease will swing with occupancy.
4. **Invoices checked line by line against their software.** → integration (visitor record pushed in, lease status pulled back) before billing at scale.
5. **"Free to renters" draws scrutiny.** → plain disclosure of who pays Yesdoor.
6. **Fastest path seen: being inside software the operator already uses** (Apartment List in AppFolio). → add AppFolio's partner stack to the integration list.

## What could block or slow onboarding (research 2026-10-07)

- **Vendor credentialing:**
  - Greystar requires NetVendor "compliant" status first: background, insurance and licences. About $49–$149 a year per company; review in about 24 hours; a bad insurance certificate is the top delay ([Greystar](https://greystar.com/contact-us/supplier-and-vendor-opportunities/us-supplier-partnerships), [NetVendor](https://www.netvendor.com/vendor-support), [FAQ](https://faq.netvendor.com/article/167-how-long-does-approval-take)).
  - RealPage Vendor Credentialing: W-9, vendor agreement, background check, fee $80–$99, up to 10 days ([BH packet](https://livebh.com/?p=13156)).
  - Sample general liability ask: $1M per claim / $2M total ([Redstone](https://redstoneresidential.com/wp-content/uploads/2023/01/Redstone-Residential-Vendor-Enrollment-3-1.docx.pdf)). E&O and cyber limits: not found.
- **Security:** big operators increasingly require SOC 2 ([Swifty](https://beswifty.com/blog/why-soc-2-certification-matters-in-multifamily-marketing/)). SOC 2 Type II takes 10–18 months, with a 3–12 month observation window that can't be skipped ([Bastion](https://bastion.tech/learn/soc2/how-long-does-soc2-take)). California privacy law (CCPA) vendor clauses apply ([MRI](https://www.mrisoftware.com/ca/blog/ccpa-for-multifamily-properties-what-you-need-to-know/)).
- **Who approves the fee:** the locator fee is an operating expense the owner pays back, so it must fit the owner's budget ([sample agreement](https://www.lawinsider.com/contracts/6OixcPek4ev)).
- **Irvine Company's real broker rules** ([PDF](https://irvinecompanyapartments.com/content/dam/apartments/3-readytopublish/graphics/BrokerReferralProgramRequirements_Customer-Facing_effective2.6.25.pdf)):
  - The referrer must be a California-licensed broker.
  - **$500 flat** per lease of 6+ months; the form is due within 90 days of lease start; paid 15–20 business days after move-in.
  - **No gifts or incentives to renters**, and no fee for past residents.
- **Software access:**
  - Yardi: 2 years in business, 3 live Voyager clients, $25K for the first 2 connections, 2–4 months ([Propexo](https://docs.propexo.com/pms-guidance/yardi/approval-qa-process)).
  - RealPage: a free "Registered Vendor" path, with security review and a shared client ([Propexo](https://docs.propexo.com/pms-guidance/real-page/important-notes)).
  - Entrata: a shared client requests access; 1–2 months; $5K/$25K/$60K a year by data use ([Propexo](https://docs.propexo.com/pms-guidance/entrata/approval-qa-process)).
- **Antitrust heat:** RealPage–DOJ settlement approved May 20, 2026; Greystar's final March 2, 2026, which bars sharing data with other landlords ([MassLandlords](https://masslandlords.net/realpage-greystar-other-landlords-agree-to-settlement-in-doj-antitrust-lawsuit/)). California AB 325 limits shared pricing tools ([Sheppard](https://www.sheppard.com/insights/blogs/california-passes-broad-limits-on-common-pricing-algorithms)). Expect "what do you do with our rent data?"
- **Screening liability:** SafeRent ~$2.3M ([Cohen Milstein](https://www.cohenmilstein.com/class-action-lawsuit-on-ai-related-discrimination-reaches-final-settlement/)); RealPage $3M to the FTC under the credit reporting law ([AGG](https://www.agg.com/news-insights/publications/ftc-reaches-3-million-settlement-with-a-tenant-screening-10-22-2018/)). HUD withdrew its 2022 criminal-records guidance in Sept 2025 ([LeadingAge](https://leadingage.org/hud-withdraws-wide-ranging-fair-housing-policies/)).

## Ready before the first big-operator meeting

1. **Security packet:** a SOC 2 plan with dates (start the Type II clock now), standard security questionnaire answers, a data processing agreement, a CCPA clause, and a one-line answer on rent data (Yesdoor never shares one operator's rents or data with another).
2. **Credentialing kit:** W-9, $1M/$2M general liability with additional-insured wording, E&O and cyber quotes, owner background checks ready (NetVendor, RealPage).
3. **Written policy:** fair housing, no steering, how criminal records are used per state law, and exactly how screening data flows (CRS as the credit bureau; what buildings see).
4. **Fee terms:** licences (AZ, CA, FL); fee after signed lease and move-in; flat-fee option (Irvine pays $500 flat); a one-page fit to the owner budget.
5. **Software plan:** one pilot client per system. RealPage Registered Vendor and Entrata first; Yardi after 2 years and 3 clients (or a client sponsor).
