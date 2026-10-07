# Yesdoor — path to $3M a month (2026-10-07)

Board and sources: `ops/workflows/yesdoor-3m-scale-2026-10-07.md`. Every number is either from a linked source there, from `src/config/offers.mjs`, or marked **assumed**.

**Owner-set 2026-10-07:** Chris handles Arizona and real estate licensing. The soft pull is the front door. Lifetime value comes from buyers guides, denial-help tools, lawyer referrals and credit repair, not only placement fees.

**Owner-set 2026-10-07 (target):** 2,000 leases a month, across California and Arizona. The edge: Yesdoor is the only platform that pre-qualifies with a CRS soft pull from just an email.

- 2,000 leases × 100% of first month at an **assumed** $1,500 = **$3M from placement alone**, before any back-end sales.
- California rents run higher than Phoenix, so every California lease raises the fee. That makes the target easier. CA rent and fee figures were not researched yet.
- Not researched yet: California locator fees, and whether California buildings pay locators at all.

**Owner-set 2026-10-07 (3-way money):** each building pays under its own fee structure. Yesdoor makes money three ways:

1. **Apartments** — placement fee, whatever that building's structure pays (100% of first month is typical; 50–125% seen; some flat).
2. **Renters** — back end: buyers guides, denial-help tools, lawyer referrals, credit repair.
3. **Affiliates and brokerage companies** — partners who use the email-only CRS prequal under their own deals. Fundhub's existing partner prices, for reference only (not Yesdoor prices): entry $10,000, add-ons $297/mo and $2,497 (`src/config/offers.mjs`).

Why the third line matters: a brokerage's agents already hold the licence and the building relationships. Each partner brings leases without Yesdoor adding staff or a licence in that city.

## The answer

- $3M a month = $36M a year. No locator found has confirmed that much. The biggest confirmed one is Smart City at about $22M a year (~$1.8M a month) across 8+ cities. UMoveFree is estimated at ~$2.6M a month.
- Placement fees alone, at **100% of first month** (the most common fee) and an **assumed** $1,500 rent: **2,000 leases a month.** That is bigger than Smart City.
- The edge is the back end. Every soft pull that does not lease (most of them) is a buyer for repair, denial help, guides or lawyers. Locators throw those people away.
- Realistic mix: **~1,600 leases ($2.4M) + ~$600K back end = $3M.**

## The math

| Line | Number | Basis |
|---|---|---|
| Lead → lease | 5–10% | Y3 |
| Leads a month for 1,600 leases | ~16,000–32,000 | Y3 rate |
| Cost per lead | $17–$38 (Meta), $35.52 (Google) | Y3 |
| Ad spend a month | ~$400K–$800K | Y3 × leads |
| Placement revenue | 1,600 × $1,500 = $2.4M | Y4 fee, **assumed** rent |
| Credit repair, done-for-you | $1,000 | offers.mjs |
| Repair first round | $200 | offers.mjs |
| Decline Autopsy | $27 | offers.mjs |
| Back end at **assumed** 2–3% of ~25,000 non-lease leads buying $1,000 repair | ~$500K–$750K | assumed take rate |

The back-end take rate is the most important number nobody has measured. Measure it in Phoenix first.

## Cash timing

- A search takes about 27 days. The fee pays at move-in or 30–90 days later, with a refund if the renter leaves inside 60 days (Y4).
- So an ad dollar comes back in roughly 2–4 months. At $400K–$800K a month of ads, plan on carrying **~$1M–$2.5M** before cash catches up. Back-end sales are paid on day one and close that gap.

## Cities

- One metro will not reach $3M. Smart City needed 8+ for $1.8M.
- Order: Phoenix → Texas (Dallas, Houston, Austin, San Antonio: biggest locator markets, licence rules are clear) → Atlanta, Denver, Nashville.
- Monthly renter move counts per city: not found. Pull Census data before picking city 2.

## Supply

- Buildings pay 50–125% of first month; 100% is typical. Some pay a flat ~$1,500 (Y4).
- Big management company portfolio deals (Greystar, Mark-Taylor, Avenue5): not found. These are the fastest way to add thousands of units. Ask them directly.
- Listing data: Yardi RentCafe API is approved partners only, pay per transaction. RealPage and Entrata terms: not found.

## Next

Run Phoenix demand-side only, as the README already plans, and measure three numbers: cost per lead, lead → lease, and back-end take rate. Those three decide everything above.

## Ascension funnel — three avatars (owner-set 2026-10-07)

Owner-set: Yesdoor runs prequal **and** a background check from just an email, so placements come from that. Ads run to all three avatars. Prices marked TBD are Chris's call. Prices shown come from Fundhub's own catalog (`src/config/offers.mjs`) and are reference points only.

### 1. Renters
| Step | Offer | Price |
|---|---|---|
| Ad | "See which apartments will approve you — just your email, no score hit" | — |
| Front door | Email-only prequal + background check, approval odds per building | Free |
| Core | Shortlist, tour booking, placement | Free (building pays) |
| Denied or low odds | Denial breakdown (like Fundhub's Decline Autopsy, $27) | TBD |
| Fix it | Repair first round (Fundhub: $200) → credit repair done-for-you (Fundhub: $1,000) | TBD |
| Hard cases | Lawyer referral (evictions, collections) | referral fee TBD |
| Later | Buyers guide (renting → buying a home) | TBD |

### 2. Apartments (buildings and management companies)
| Step | Offer | Price |
|---|---|---|
| Ad | "Pre-qualified, background-checked renters who want your building" | — |
| Front door | Free list of pre-qualified renters matching their units | Free |
| Core | Placement, paid per that building's own fee structure | their terms |
| Upsell | Priority placement / featured listing | TBD |
| Portfolio | One deal covering every building a management company runs | TBD |

### 3. Affiliates and brokerage companies
| Step | Offer | Price |
|---|---|---|
| Ad | "Pre-qualify every renter lead with just an email" | — |
| Front door | Free run on their own renter leads | Free |
| Core | Prequal + background check per renter, or monthly | TBD (see partner pricing research) |
| Top | White-label under their brand (Fundhub partner entry: $10,000) | TBD |

### Order to launch
1. Renter ads first. They create the list every other avatar buys.
2. Apartment ads once there is a renter list to show.
3. Partner ads once placements are proven. Proof of results sells partners.

## Partner pricing (research 2026-10-07)

What the market charges:
- Renter screening: TransUnion SmartMove $25 / $40 / $49 per report ([SmartMove](https://www.mysmartmove.com/pricing)); RentPrep from $21 ([review](https://fitsmallbusiness.com/rentprep-review)); RentSpree report $39.99–$49.99, PRO $19.99/mo ([saasworthy](https://www.saasworthy.com/product/rentspree/pricing)). All per report. None needs only an email.
- Referral splits between agents: 20–35%, 25% is the usual start ([AgentFire](https://agentfire.com/?p=131904), [CFA](https://consumerfed.org/wp-content/uploads/2020/09/Real-Estate-Referral-Fees-Report-9-21-20.pdf)). Locators often split 50/50 with their brokerage ([AptAmigo](https://blog.aptamigo.com/locator-commission/)).
- Brokerage CRM: Follow Up Boss $69/user/mo, $499/mo for 10, $1,000/mo for 30 ([LuxuryPresence](https://www.luxurypresence.com/?p=43368)); kvCORE ~$500+/mo.
- White-label pricing and apartment-locator franchise fees: not found.

**Recommended partner price (Chris decides):**
| Tier | Price | Why |
|---|---|---|
| Pay per renter | $29 per prequal + background check | Under SmartMove's $40 Plus, and email-only is easier for the renter |
| Office | $499/mo, up to 50 checks | Same as a 10-seat Follow Up Boss plan |
| Placement split | Yesdoor keeps 25% of the fee on leases a partner's renter signs through Yesdoor buildings | Standard referral split |
| White-label | $10,000 entry (Fundhub's partner price) + $499/mo | Matches the existing Fundhub ladder |

## California + Arizona (research 2026-10-07)

Rent, 2026, city level ([keepingupwithinflation](https://keepingupwithinflation.com/statistics/rent-by-city/)): Phoenix $1,550 · Sacramento $2,015 · Riverside $2,369 · Los Angeles $2,750 · San Diego $2,893 · San Francisco $3,723.

California fees: buildings usually pay one month's rent or more ([Smart City blog](https://smartcitylocating.com/?p=14070), weak source). LA tenant-placement fees run 48–100% of first month ([Utopia](https://utopiamanagement.com/how-much-does-property-management-cost-in-los-angeles)); San Diego 50–100% or flat $595 ([TenantCloud](https://www.tenantcloud.com/blog/property-management-fees-in-california)). Bay Area, Sacramento, Inland Empire fees: not found.

**The 2,000-lease math with real rents (fee = 100% of first month):**
| Mix | Revenue a month |
|---|---|
| 1,000 Phoenix ($1,550) + 1,000 LA/San Diego (~$2,800) | ~$4.35M |
| Same mix, California fee at 50% | ~$2.95M |
| 2,000 Phoenix only | ~$3.1M |

So 2,000 leases across CA and AZ clears $3M from placements alone in every mix above, before renter back end and partner revenue.

Other findings: California referral fees pass through a licensed broker ([ACME](https://support.acmehouseco.com/knowledge-base-internal/realtor-referrals)). The prepaid rental listing law (broker licence + $10,000 bond) covers selling lists to renters ([DRE](https://www.dre.ca.gov/files/pdf/ca/2012/ConsumerAlert_PRLS.pdf)). Yesdoor charges buildings. California background checks follow ICRAA notice steps ([RentSpree](https://support.rentspree.com/en/icraa-regulations)). Owner-set: Chris navigates licensing and screening rules. California locator company sizes and Arizona screening rules: not found.
