# Yesdoor senior living — 2026-10-07

Chris picked senior living from the medical niche research (`ops/workflows/medical-niche-research-2026-10-07.md`)
and wants it merged into Yesdoor.

The idea: a free affordability check shows a family which assisted living and memory care communities
they can afford and that will take them. The family pays nothing. The community pays when the
resident moves in. Same shape as Yesdoor apartments (`marketing/offers/yesdoor/README.md`).
Yesdoor MVP is being built on `yesdoor/i1` (PR #55).

The open lane: A Place for Mom exists, but nobody checks first whether the family can actually
afford the place. A 2024 Senate probe found about 40% of its families were placed above their
budget.

Chris said "go" — this session runs lanes 1–3 with research agents, and runs lane 4 itself.

| Lane | What | Owner | Status |
|---|---|---|---|
| 1 | The law: state referral-agency rules, Medicaid limits, Medicaid planning vs practicing law | this session (agent) | done |
| 2 | Market + money check: launch city, communities, fees, competitors, data for the check | this session (agent) | done |
| 3 | Yesdoor reuse map (read-only) | this session (agent) | done |
| 4 | Workflow questions to Chris, then the spec | this session | draft workflow up — waiting on Chris |

## Lane 1 — the law (done)

Research, not legal advice. Every row has its source.

| State | Law | License? | What it requires | Fee rules |
|---|---|---|---|---|
| **AZ** | [A.R.S. §36-446.14](https://www.azleg.gov/ars/36/00446-14.htm), amended by [SB 1477](https://www.azleg.gov/legtext/57leg/2R/laws/0178.htm) (effective 9/12/2026) | None | Disclose any business tie, that the community pays, and the fee (or a good-faith estimate), in the required wording (14-point type if written). The family signs an acknowledgment. **The community may not pay until it has that acknowledgment.** Keep copies 1 year. Background check or adult protective services registry proof. General liability $1M/$3M **and** professional liability $1M/$3M. Fine up to $1,000 per violation | No cap. Family may stop any time; after that, a fee only for a community already named, within 12 months |
| **TX** | [Bus. & Com. Code ch. 121 (SB 1383)](https://capitol.texas.gov/tlodocs/89R/billtext/html/SB01383F.htm), effective 9/1/2025 | None | Written disclosure (services, who pays, right to stop, "list may not include all communities"). No financial interest in communities. **Cannot hold a power of attorney.** Background checks. Liability insurance | Fee must be paid within 3 years of the referral. No fee on transfers within the same community |
| **FL** | [§429.195](https://m.flsenate.gov/Statutes/429.195) | None found | — | Facilities may pay only for **non-Medicaid** residents; anything else is a felony under §817.505 |
| **WA** | [RCW 18.330](https://app.leg.wa.gov/RCW/default.aspx?cite=18.330&full=true) | None | Dated disclosure before referral + signed acknowledgment. Background checks every 24 months. $1M liability insurance. Records 6 years | No cap. **Prorated refund** if the resident dies, is hospitalized or transfers within 30 days. No fee on Medicaid-funded referrals |
| **NV** | NRS ch. 449 ([SB 299](https://www.leg.state.nv.us/Statutes/83rd2025/Stats202510.html)) | **Registration** (state health division) | Written contract with each community; consent; records 3 years; cannot hold a power of attorney | Only three fee shapes allowed |
| **OR** | [ORS 443.370–.376](https://ltcr.oregon.gov/FAQ) | **Registration**, $750 / 2 years | Written disclosure before referral; $1M insurance | Not found |
| **MD** | [Health-Gen. §19-1813](https://health.maryland.gov/ohcq/Pages/Assisted-Living-Referrer.aspx) | **Registration** | Disclose financial ties | — |
| **CO, OK, GA, CA** | CO HB20-1101; OK 63 O.S. §1-866; GA SB 439 (2026, unverified); CA HSC §1569.47 (no license for assisted living; a license is needed for nursing-home referrals) | No | Disclosure / right to stop | OK: fees paid for 36 months max; GA: 24 months |

No specific law found in most other states (MN, IL, NY and others). VA has bills pending.

**Medicaid:** never take a fee on a Medicaid-paid resident. [OIG AO 14-01](https://hallrender.com/2014/03/06/oig-approves-senior-community-referral-arrangement/) was approved only because federal-program residents were left out completely. In Arizona, a fee for an ALTCS (Arizona Medicaid) placement is a **felony** ([A.R.S. §13-3713](https://www.azleg.gov/ars/13/03713.htm)).

**Medicaid planning:** a non-lawyer may screen against published limits, give document checklists, and help file the application. A non-lawyer may **not** advise on spend-down strategy, gifting, retitling or trusts ([Ohio UPL 11-01](https://www.supremecourt.ohio.gov/Boards/UPL/advisory_opinions/UPLAdvOp_11_01.pdf); Florida Supreme Court). Hand those off to elder-law attorneys. **Arizona lets lawyers pay referral fees** (ER 7.2 and 5.4 dropped 1/1/2021, [Clyde & Co](https://www.clydeco.com/en/insights/2021/05/lawyers-risk-management-newsletter-may-2021)); most states don't.

**Credit check consent:** written (e-signed) instruction from the person whose file is pulled ([15 U.S.C. §1681b](https://www.law.cornell.edu/uscode/text/15/1681b)). Senior signs if able; otherwise keep a copy of a financial power of attorney. Yesdoor staff never hold a power of attorney (banned in TX, NV, OK). Agent's own inference, not a found authority: sending credit results to communities could make Yesdoor a consumer reporting agency.

**Enforcement history:** [FTC v. CarePatrol](https://www.ftc.gov/node/46371) (2012, false "we know these facilities" claims); A Place for Mom robocall settlement $6M (2020); Senate Aging probe of A Place for Mom (2024); Cedar Communities v. Caring.com, false "free" ads and steering (ended July 2026).

**Launch states:** (1) Arizona — Yesdoor's home market, clear 2026 law, no license, no cap. (2) Texas — no license, clear rules, big market. (3) Florida — no registration, statute allows private-pay fees, but a Medicaid slip is a felony.

## Lane 2 — market and money check (done)

**Launch: Phoenix.** Second: Las Vegas (most empty units — 87.0% occupancy, among the lowest 3, [NIC MAP](https://www.nicmap.com/news/senior-living-occupancy-grows-amid-construction-slowdown-limiting-options-for-older-adults/)).
- Maricopa + Pinal: **213 assisted living centers (20,222 beds) + 1,320 small homes of 10 beds or fewer (10,539 beds)**. 192 centers and 1,304 homes are licensed for memory care ([ADHS data](https://services6.arcgis.com/clPWQMwZfdWn4MQZ/ArcGIS/rest/services/Public_Access_Features_WFL1/FeatureServer/11)). Small homes have no sales team.
- Arizona median assisted living: **$6,370/month** (US $5,900) ([CareScout 2024](https://assets.carescout.com/55da049c1f/282102.pdf)).

**Fees:** A Place for Mom charges the community first month's rent and care; in WA about $3,500 per move-in ([ElderLawAnswers](https://attorney.elderlawanswers.com/elder-care-referral-services-attracting-increased-scrutiny-9119)). Industry: up to 100% of the first month. Agreements are per agency; communities push to leave care charges out and to put an expiry on each lead ([SHN](https://seniorhousingnews.com/2017/03/20/ace-contract-process-senior-housing-referral-agencies/)). "Who referred first": Caring.com gives the community 5 business days to flag a duplicate ([Caring.com](https://partners.caring.com/avoid-paying-multiple-referral-sources-senior-living-lead/)).

**Competitors (correction to round 1):** **SilverAssist** owns Caring.com (bought 2026-01-12), Oasis Senior Advisors (130 franchises), ElderLife Financial (bridge loans) and AidandAttendance.com — referral bundled with bridge loans and VA help ([Pulse 2.0](https://pulse2.com/silverassist-acquires-caring-com-to-expand-national-senior-housing-referral-network/)). CarePatrol (HQ Gilbert, AZ, 153 offices) and Assisted Living Locators (HQ Scottsdale) are local franchises. Olera (NIH-funded) is building AI family profiles that surface benefits; beta 2026. **No public sign any of them runs an affordability + acceptance check before referring.**
Lead sites convert badly: Sonida got 11,000 leads from one site in 2024 and 200 move-ins (~1.8%) ([SHN](https://seniorhousingnews.com/?p=50237)).

**Data for the money check:**
- Arizona care levels: supervisory, personal, directed (memory) ([ADHS](https://hsapps.azdhs.gov/ls/sod/alprovtypes.aspx)).
- VA Aid & Attendance (from 2025-12-01): veteran $2,424/mo; with spouse $2,874/mo; surviving spouse $1,558/mo; net worth limit $163,699 ([VA](https://www.va.gov/pension/veterans-pension-rates/)). Decisions now ~57–73 days.
- Phoenix homes: 78 days on market, median $483,000 ([AZ Big Media](https://azbigmedia.com/real-estate/metro-phoenix-home-sales-gain-momentum-as-fall-approaches/)).
- Bridge loans: ElderLife $5k–$500k, up to 12 months, interest-only, paid to 3,500+ communities; rate not published ([ElderLife](https://www.elderlifefinancial.com/bridge-loans/)). Owned by the competitor above.
- ALTCS (Arizona Medicaid long-term care): income cap $2,982/mo, assets under $2,000, 5-year look-back, 60–90 days to decide ([Jackson White](https://www.jacksonwhitelaw.com/altcs/altcs-eligibility/)). How many communities accept it: not found.
- Speed: **56% of assisted living and 62% of memory care move-ins happen within 30 days of the first inquiry** ([Ziegler/Aline](https://www.ziegler.com/media/dtten4z3/sl_znews_090423.pdf)).
- Long-term-care insurance daily benefit norms today: not found.

## Lane 3 — Yesdoor reuse map (done)

Read from `origin/yesdoor/i1` (PR #55) and `origin/yesdoor-3m-scale`. Verdicts are design proposals.

**Reuse as-is:** magic-link login and sessions; the match engine's approved / likely / no / unknown logic, rule versioning and stale-rule cap (`match/rules.mjs`, `match/match.mjs`); backups ranking (`yd_matches`); referral proof — registration timestamp and "known prospect" window; invoices (`yd_invoices`); disputes (`yd_disputes`, add a proration kind); e-sign mechanism (`yd_agreements`, HMAC link); events, outbox, crons plumbing; `yd_state_rules` table.

**Change:**
- `yd_renters` is one person. Senior living is a household: the shopper (adult child, siblings), the resident (or a couple), and who holds legal authority (power of attorney).
- `yd_accounts` allows one account per renter. Needs several logins per search, with roles.
- Consent and soft pull (`yd_consents`, `yd_screenings`) need "whose credit" vs "who signed", plus proof of authority.
- `yd_income_checks` is one monthly number. Needs income + assets + VA + long-term-care insurance + home value.
- Community rules replace credit rules: care levels offered, payers accepted, minimum private-pay runway, conditions excluded.
- Listings: price is a stack (base rate + care-level fee + community fee + second-person fee), not one rent.
- Stages: no lease end (month to month); add care assessment, deposit / hold, waitlist, waiting on a house sale.
- Fee refunds: the database only allows a full refund, counted from payment. Washington-style rules need a prorated refund counted from move-in, with reasons (death, hospital).
- Tour time zones only cover AZ / CA / FL; broker licence check only AZ / CA / FL.
- Staff desk: care notes are health data and need their own access tier.
- Public pages: one renter, no care or asset inputs.

**Missing entirely:** care-needs level and nurse assessment; payer mix (private pay, VA, LTC insurance, Medicaid waiver); asset runway and house-sale timing; the household as 2+ people; prorated refund; a family-side disclosure; senior-living software connectors; the licensing basis for senior referral.

**Facts:** migrations 434–437 on `yesdoor/i1` (`main` ends at 433). 27 `yd_` tables. Money is integer cents; NULL means unknown. A public request's org is `YD_ORG_SLUG`, so senior living needs its own org or a line marker on the `yd_` tables.

## Lane 4 — workflow answers (Chris, one at a time)

| # | Question | Answer | Set by |
|---|---|---|---|
| 1 | After the free check, who walks the family to a move-in? | **Online first, advisor after** — the family runs the check and sees matches online; an advisor calls the ones ready to move and books tours (same concierge model as Yesdoor apartments) | Agent default — Chris said "idk" (2026-10-07). Change any time |

### Draft workflow — defaults from the research (Chris marks what is wrong)

Nothing below is decided until Chris says so. Each line is a default.

1. **Where:** Phoenix first (Yesdoor's home market). Las Vegas next (needs Nevada registration).
2. **Who:** the shopper is usually the adult child; the resident is the parent (or a couple). One search, several people, one login each.
3. **The free check (about 3 minutes):** who is moving, care level (Arizona's three: supervisory, personal, memory care), area, how soon. Then money: monthly income, savings, VA service (yes/no), long-term-care insurance, a house (value, selling or not).
4. **No credit pull by default.** Communities decide on care needs and money runway, not credit score. A soft pull happens only if the family wants a bridge loan, with the senior's e-signature or a copy of a financial power of attorney. Credit data never goes to a community — only our answer.
5. **The answer:** a monthly budget, how many years the money lasts, and flags — "VA benefit likely (+$2,424/mo)", "Medicaid (ALTCS) likely", "bridge loan until the house sells". Then the communities that fit the care level and budget, each marked approved / likely / no / unknown, with the full price (base rate + care fee + community fee).
6. **Arizona disclosure:** before any referral the family e-signs the state-required disclosure (who pays us, how much, any business ties). The community cannot pay without it.
7. **Advisor:** online first; an advisor calls families who are ready to move and books tours.
8. **Community steps:** tour → the community's own care assessment → accepted or declined → deposit or room hold → (waiting on house sale, if any) → move-in. A "we said yes, they said no" is counted against the community's rules, same as Yesdoor.
9. **Getting paid:** the community tells us of the move-in (Arizona: within 14 days). We invoice; the fee is set in each community's agreement (flat or % of first month). Fee is earned at move-in.
10. **Hard stops, built into the database:** no fee ever on a Medicaid (ALTCS) resident — that is a felony in Arizona. Staff never hold a power of attorney. No Medicaid planning advice — Medicaid families go to an elder-law attorney, VA claims go to an accredited veterans service officer (free), house questions go to a realtor.
11. **Refund:** prorated refund to the community if the resident leaves, dies or goes to hospital within 30 days of move-in (required in Washington; offered everywhere as a trust point).
12. **Before launch:** two insurance policies ($1M/$3M general and professional liability), background checks on every advisor, and the exact Arizona disclosure wording.

## Size at scale (2026-10-07, Chris asked "how much a month at scale")

Inputs (sourced): Phoenix 30,761 licensed beds (lane 2, ADHS); assisted living occupancy 88.4% ([NIC](https://www.nic.org/blog/senior-housing-occupancy-climbs-in-second-quarter-2026/)); median stay ~22 months (NCAL, via [Senior Services of America](https://seniorservicesofamerica.com/what-is-the-average-length-of-stay-in-assisted-living/) — weak, secondary); ~18% of residents rely on Medicaid, no fee on those ([NCOA](https://www.ncoa.org/article/does-medicaid-pay-for-assisted-living/)); A Place for Mom ~$442M revenue and ~130,000 moves in FY2025 (company-profile sites, weak: [bitscale](https://bitscale.ai/directory/a-place-for-mom), [canvasbusinessmodel](https://canvasbusinessmodel.com/products/a-place-for-mom-business-model-canvas)) → about $3,400 per move.

Arithmetic (agent's, not sourced): 30,761 × 88.4% ≈ 27,200 residents ÷ 22 months ≈ **1,236 move-ins a month in Phoenix**, ~1,014 private pay.

| Our share of Phoenix private-pay move-ins | Move-ins / month | At $3,500 each | At $5,000 each |
|---|---|---|---|
| 5% | 51 | $177k | $253k |
| 15% | 152 | $532k | $760k |
| 25% | 253 | $887k | $1.27M |

National ceiling: A Place for Mom ≈ $37M a month. 10% of its volume ≈ $3.7M a month.

## Can it all merge into Yesdoor? (2026-10-07)

Chris asked whether senior living, behavioral health, etc. can all merge into Yesdoor.

- **Yes, as "lines" on one Yesdoor:** apartments (live build), senior living (this board), next private-pay home care (not researched for Arizona yet). Same engine: free check → which places say yes → the place pays on move-in or start. Tech: lane 3 found each Yesdoor deployment is one org (`YD_ORG_SLUG`); lines need a line marker on the `yd_` tables or one org per line.
- **Behavioral health cannot be a paid line.** Paying for referrals to addiction treatment, recovery homes or labs is a federal crime even with private insurance (EKRA, [Foley](https://www.foley.com/insights/publications/2020/02/ekra-floridas-patient-brokering-act/)); Florida §817.505 and Arizona §13-3730 (sober-living homes) too. Meta requires LegitScript, which excludes lead generators ([LegitScript](https://www.legitscript.com/certification/addiction-treatment-certification/faq/)). Therapy matching is insurance-paid and owned by Headway and Rula. Only a free listing with no fee would be legal — no revenue.

---

# Lines law check — AZ, CA, FL (2026-10-07)

Chris: "even hospice … look up AZ, CA, FL law, get creative." For each possible Yesdoor line, find what
the law in Arizona, California and Florida allows, and every legal way to get paid.

| Lane | Lines | Status |
|---|---|---|
| L1 | Senior living (assisted living, memory care), independent living / 55+, skilled nursing | claimed (agent) |
| L2 | Home care (private pay), home health, hospice | claimed (agent) |
| L3 | Behavioral health: residential treatment, sober living, outpatient therapy, psychiatry | claimed (agent) |
| L4 | Creative ways to get paid across all lines (who else pays besides the provider) | done |
| L6 | Big referral opportunities, any industry: supplier legally pays $1,000+ per placement (Chris: "find big referral opps") | claimed (agent) |
| L5 | Rank lines and payment models | pending (this session) |

## L4 — creative ways to get paid (done)

| Model | Who pays | Typical $ | Legal risk | AZ / CA / FL notes |
|---|---|---|---|---|
| **Flat provider subscription, set in advance at fair market value** | Providers | Psychology Today $29.95/mo ([NBCC](https://www.nbcc.org/resources/nccs/therapydirectory)); OIG opinions 19-04 and 23-04 (Zocdoc) accepted per-booking fees set in advance, at fair market value, not tied to insurance, and **paying more does not raise ranking** ([Frier Levitt](https://www.frierlevitt.com/articles/navigating-compliance-in-online-healthcare-marketplaces-insights-from-oig-opinions/)) | Low–medium | **FL §817.505(3)(i)** exception: an information service may take provider fees if it does not steer or diagnose and fees are set in advance at fair market value ([flsenate](https://m.flsenate.gov/Statutes/817.505)) |
| **Per-move-in fee, private-pay assisted living only** | Communities | First month's rent and care | Low with disclosure | AZ §36-446.14 + SB 1477 (disclosure, no cap); CA H&S §1569.47 (disclose who pays, fines $250–$1,000); FL §429.195(2) (only if not on Medicaid) |
| **Employer caregiving benefit** | Employers | Wellthy "starting at $450/month per employee" ([wellthy.com](https://www.wellthy.com/employers/purchase-plan)) | Low | No AZ/CA/FL buyer found yet |
| **Health plan contracts** (Medicare Advantage, CalAIM, ALTCS) | Plans | Papa: per-member per-month, amount private ([KFF](https://kffhealthnews.org/news/article/medicare-advantage-plans-senior-companions-profits/)) | Medium (don't also take provider money for steering plan members) | CA CalAIM nursing-home-to-assisted-living transitions served only 765 people July 2023–June 2024 ([CHCF](https://www.chcf.org/resource/2025/02/21/strengthening-calaims-assisted-living-transitions-role-community-care-hubs/)) |
| **Family-paid concierge** | Families | Care managers $100–$250/hr; first assessment $150–$750 ([Caring.com](https://www.caring.com/senior-care/geriatric-care-managers)) | Low | All three |
| **Be the licensed provider** | Medicaid, plans, private pay | Abby Care: $15M revenue 2025, $225M valuation, in FL ([runtimewire](https://runtimewire.com/article/abby-care-havi-nguyen-paid-family-caregivers-medicaid-ai)) | Medium | **FL §817.505(3)(h):** licensed nurse registries may legally collect fees for placing caregivers |
| Hospital discharge software | Hospitals | Prices not public; WellSky/CarePort runs 54M referrals a year ([BusinessWire](https://www.businesswire.com/news/home/20260302799514/en/WellSky-Centralizes-Post-Acute-Referral-Intake-With-Intelligent-AI-Integration)) | Low | Crowded |
| Government grants | AHCCCS, Area Agencies on Aging | AZ Rural Health Transformation $167M; open $17M care-coordination grant ([AHCCCS](https://www.azahcccs.gov/AHCCCS/Initiatives/RHTP/index.html)) | Low | Slow |
| Lenders, VA, life settlements | Various | VA: no fee before the first VA decision ([38 CFR 14.636](https://www.law.cornell.edu/cfr/text/38/14.636)); life settlement referral ~0.10–0.25% of face value | Medium–high | Each needs its own license |

Rules that matter most: (1) gate every fee by payer — per-move-in fees only on private pay; Medicare/Medicaid lanes switch to flat fees or employer/plan/family money; (2) **ranking is never for sale** — the "who says yes" answer comes from the family's facts only.

Agent's top 5: flat provider subscription → private-pay move-in fee → employer benefit → health plan contracts → family concierge. Also: Florida nurse registry for home care; Arizona $17M care-coordination grant.
