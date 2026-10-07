# Medical niche research — 2026-10-07

Goal: find the best medical niches for the Fundhub / Yesdoor pattern — a free soft credit check
(or free qualify) tells the customer who will say yes, we match them, and the other side pays.
Source pattern: `marketing/offers/yesdoor/README.md`.

Chris said "run it all" — this one session runs every lane, with research agents in parallel.

| Lane | What | Owner | Status |
|---|---|---|---|
| A | Paying for elective care (implants, IVF, bariatric, cosmetic, LASIK, hearing, ortho, TRT/GLP-1) | this session (agent) | done |
| B | Medical debt on credit reports, charity care, bill negotiation | this session (agent) | done |
| C | Placements the provider pays for (trials, senior living, rehab, home health, Medicare/ACA) | this session (agent) | done |
| D | Score and rank the top 3 | this session | done |

## Lane A — done

Paying for elective care. Most lead-cost and approval numbers come from agencies and lenders selling their own product, so treat them as rough.

| Niche | Patient cost | Financing pain | Practice cost to win a patient | Meta lead cost |
|---|---|---|---|---|
| Full-arch implants | $15k–30k per arch ([elitedentistryrsm](https://elitedentistryrsm.com/dental-implants-cost-guide/)); ClearChoice $50k–90k both arches ([SeniorList](https://www.theseniorlist.com/dental/clearchoice/)) | 61% delay or decline over cost; traditional financing denies up to 50% ([Sunbit](https://sunbit.com/knowledge-center/dental/dental-practice-case-acceptance-sunbit-financing/)) | $180–340 per booked consult; practices with financing close 28–34% vs 22–26% ([Redefine](https://redefineweb.com/blog/dental-implant-facebook-ads-playbook-books-new-patients/)) | $45–95 ([Redefine](https://redefineweb.com/blog/dental-implant-facebook-ads-playbook-books-new-patients/)) |
| IVF | $19,857 per cycle ([SingleCare](https://www.singlecare.com/blog/ivf-cost/)) | 56% have no coverage; 70% took on debt (2015, n=213) | $200–400 per patient; $40k–80k revenue per patient ([Webtonic](https://www.webtonic.io/blog/fertility-ivf-digital-marketing-statistics)) | $80–350 |
| Cosmetic surgery | Breast augmentation $4,575–8,000 surgeon fee ([ASPS 2024](https://www.plasticsurgery.org/documents/news/statistics/2024/cosmetic-procedures-average-cost-2024.pdf)) | 64% of women worry how to pay | $400–1,400 per patient ([Sagapixel](https://sagapixel.com/plastic-surgery-marketing-agency/meta-ads/)) | $16–320 |
| LASIK | $1,500–5,000 per eye | not found | $1,500–3,500 per surgical patient ([specialty.vision](https://specialty.vision/ophthalmology-marketing-roi-benchmarks-for-2026/)) | not found |
| Hearing aids | $3,432–4,672 per pair ([HearingTracker](https://www.hearingtracker.com/hearing-aid-prices-survey)) | not found | $450+ per new client | $38 (one test) |
| Bariatric, ortho, hair, vein | $3k–26k | not found | not found | not found |
| TRT / GLP-1 | $99–299 a month | Too small to finance. No fit | — | — |

Lender fees to providers: CareCredit 1.9%–14.9% depending on promo (fee schedule filed with Maine legislature, [LD 2174](https://legislature.maine.gov/legis/bills/getTestimonyDoc.asp?id=181872)); Cherry 1.7–1.9%, claims 80%+ approval; Sunbit from 1.9%, claims 85–90%.
Lenders already pay for growth: Cherry pays up to $1,000 per practice referred ([Cherry](https://withcherry.com/referral)); CareCredit pays associations royalties per provider referred.
The gap: in-clinic tools (PatientFi, FinMkt, ChargeAfter) run after the patient is in the chair. LendingTree gives a loan but no provider. No tool found that does "one soft pull → which clinics' financing approves you → book the consult."
Legal: per-patient fees from providers are banned or risky in FL (§817.505, all payers), TX (Patient Solicitation Act), CA dental (fee-splitting), NY (§6530(19)). Flat fair-market fees are the safe shape. Taking lender money for sending borrower data needs a broker license in CA. Reg B treats regular referrers as creditors.

Lane A top 3: (1) Full-arch implants, (2) IVF, (3) Cosmetic surgery.

## Lane B — done

Medical debt and bills.

| Item | Number | Source |
|---|---|---|
| Medical collections still on reports | ~15M people, $49B+, avg $3,100, mostly South and low-income | [CFPB](https://www.consumerfinance.gov/archive/newsroom/cfpb-finds-15-million-americans-have-medical-bills-on-their-credit-reports/) |
| Federal medical-debt rule | Struck down July 11, 2025 | [accountsrecovery.net](https://www.accountsrecovery.net/2025/07/13/judge-vacates-cfpb-medical-debt-credit-reporting-rule/) |
| State bans | 15 states + DC. Under attack: CFPB said federal law overrides them (Oct 2025); a federal court blocked Texas's law (Aug 10, 2026) | [NCLC](https://library.nclc.org/article/latest-keeping-medical-debt-out-credit-reports); [ruling](https://www.accountsrecovery.net/2026/08/21/judge-strikes-down-state-law-barring-medical-debt-from-credit-reports/) |
| Charity care eligible people never get | $14B a year; only 29% of people who can't pay get it | [Dollar For via ClearHealthCosts](https://clearhealthcosts.com/blog/2024/05/looking-for-hospital-financial-aid-good-luck-and-dont-hold-your-breath/) |
| Who sells soft-pull charity screening | Experian Health, TransUnion Healthcare, Equifax, Waystar, FinThrive — sold to hospitals only. Prices not found | [Experian](https://www.experian.com/blogs/healthcare/case-study-how-uchealth-wrote-off-26-million-in-charity-care-with-patient-financial-clearance/) |
| Bill negotiators | Resolve 10–25% of savings; Goodbill 20% capped $1,000; CoPatient 35%. All under $6M raised | [Resolve](https://www.resolvemedicalbills.com/faqs/how-much-does-it-cost-to-work-with-resolve); [Goodbill](https://www.goodbill.com/blog/news-goodbill-raise-2m-funding-expands-cost-containment-plans-tpas) |
| Hospital-paid payment plans | PayZen: $32M equity + $200M credit line | [crowdfundinsider](https://www.crowdfundinsider.com/?p=198988) |
| More uninsured coming | +10M by 2034 (CBO) | [FactCheck](https://www.factcheck.org/2025/07/the-cbo-breakdown-on-medicaid-losses-increase-in-uninsured/) |

Legal: credit repair law (CROA) — no fee until work is done. Debt settlement licenses in CA, FL, IL, WA if negotiating debt already in collections. No patient-advocate license law found.

Lane B top 3: (1) Medical bill router — one soft pull + bill upload → charity care / negotiation / 0% plan, (2) Medical collections added to the Fundhub repair arm, (3) Sell the router to employers as a benefit.

## Lane C — done

Provider-paid placement. Every number has its source next to it.

| Niche | Who pays and how much | Size | Legal limits | Credit check fits? |
|---|---|---|---|---|
| Senior living placement | The community pays about 1 month of rent and care. Median assisted living is $5,900/mo ([Genworth](https://investor.genworth.com/news-events/press-releases/detail/982/)). Another estimate: 70–80% of first month, $3k–5k ([Beancount](https://beancount.io/blog/2026/07/19/senior-living-placement-agency-referral-fee-revenue-recognition-guide)) | 30,600 communities; A Place for Mom covers 14,000 ([SHN](https://seniorhousingnews.com/2024/06/20/us-senator-probes-a-place-for-mom-alleging-deceptive-practices/)) | WA RCW 18.330 (fee disclosure + refund); TX HB 3037 (disclosure). Federal opinion OIG AO 14-01 allows fees on private-pay residents only | Yes: affordability + bridge loans |
| Senior living bridge loans | The lender earns interest. Elderlife lends up to ~$50k+ and pays the community directly; works with 2,700 communities ([ElderLawAnswers](https://www.elderlawanswers.com/financial-company-specializes-in-bridge-loans-to-help-pay-for-senior-living-9051)) | not found | Lending law | Yes |
| Clinical trial recruitment | The drug company pays. $143–$11,392 per patient by therapy area (Tufts 2026 via [IntuitionLabs](https://intuitionlabs.ai/articles/clinical-trial-patient-recruitment-vendors-compared)); median $409 ([PMC9985191](https://pmc.ncbi.nlm.nih.gov/articles/PMC9985191)) | US $420M (2025) → $920M (2035); ~80% of trials miss enrollment on time | Low: ethics board reviews the ads | No: medical criteria |
| Elective care financing (dental, hearing) | Dental implant leads $30–70 ([Driven Dental](https://drivendentalmarketing.com/why-dental-implant-leads-not-converting/)); $500–900 to win one hearing patient ([Shoebox](https://www.shoebox.md/hearing-care-and-healthcare-resources/blog/hearing-care-industry-lead-generation-programs/)) | not found | State fee-splitting laws that cover all payers, e.g. CA B&P §650 | Yes |
| Home care referrals | The agency pays; amount not found | not found | Private pay mostly clear | Partly |
| Medicare Advantage | $694/new enrollee (2026); unlicensed lead source capped at $100 ([Ritter](https://ritterim.com/blog/2026-maximum-broker-commissions-for-medicare-advantage-and-medicare-part-d)) | 34.1M enrollees ([KFF](https://www.kff.org/medicare/issue-brief/medicare-advantage-2025-spotlight-a-first-look-at-plan-offerings/)) | License + per-company consent rules | No |
| ACA plans | ~$20 per member per month ([Ritter](https://www.ritterim.com/blog/how-much-can-agents-make-selling-under-65-insurance)) | 19.2M, down 13% in 2026 ([KFF](https://www.kff.org/quick-insights/aca-marketplace-enrollment-is-down-by-3-million-after-big-jump-in-premium-payments/)) | License | Income only |
| Addiction treatment | **Dead.** Paying for referrals is a crime: FL 817.505 and federal EKRA, including private insurance ([Foley](https://www.foley.com/insights/publications/2020/02/ekra-floridas-patient-brokering-act/)). LegitScript certification excludes lead generators | — | — | — |

Weak spot in the main incumbent: a 2024 Senate probe found ~40% of A Place for Mom families were placed above their stated budget (55% for memory care) ([SHN](https://seniorhousingnews.com/2024/06/20/us-senator-probes-a-place-for-mom-alleging-deceptive-practices/)).

Lane C top 3: (1) Senior living "which communities can you afford" + bridge loans, (2) Elective care financing match, (3) Clinical trial recruitment.
Meta lead cost: assisted living $70.81, healthcare average $41.60 ([Webtonic](https://www.webtonic.io/blog/senior-living-meta-ads-statistics)).

## Lane D — ranking (done)

Scored on: how big the payment is, whether the other side pays, how much Fundhub already has, how weak the competition is, legal friction, lead cost.

| Rank | Niche | Who pays | Fundhub reuse | Biggest risk |
|---|---|---|---|---|
| 1 | **Full-arch dental implants — "see which implant clinics' financing approves you, then book"** | Lenders (Cherry already pays up to $1,000 per practice referred) + flat monthly fee from practices | Highest. Soft pull → approval odds → match is UnderwriteIQ with a new label | Per-patient fees are illegal in FL, TX, CA dental, NY → use flat fees + lender money; CA broker license |
| 2 | **Senior living — "which communities can you actually afford" + bridge loans** | The community, ~1 month of rent and care (median $5,900). Family pays nothing — the exact Yesdoor model | High. Soft pull + lender match for the bridge loan | Affordability depends on assets and the house sale, not just credit. A Place for Mom already covers 14,000 of 30,600 communities. Private-pay residents only |
| 3 | **Medical bill router + medical collections in the repair arm** | Patient (20–35% of savings, credit repair fee); later employers | High. Credit report reading + dispute letters already exist | Low-income buyers; CROA no fee until done; state bans being knocked down |

Not recommended: addiction treatment (referral fees are a crime), Medicare/ACA (license, no credit angle), TRT/GLP-1 (ticket too small), clinical trials (medical gate, none of our tools carry over).
