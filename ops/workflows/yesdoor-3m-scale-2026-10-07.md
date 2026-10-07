# Yesdoor — path to $3M a month (2026-10-07)

Research only. No product code changes. Final report: `marketing/offers/yesdoor/scale-3m.md`.

Ask (Chris): "Yes door ai scale to 3m/mo insights."

## Shared brief (ground once — read this, do not re-read the repo)

- Yesdoor = concierge apartment matching, Phoenix metro first. One soft credit pull, no score damage, renter is told which buildings will approve them. Free to the renter. The building pays a placement fee (usually a share of first month's rent) on a signed referral agreement.
- Modelled on the live `nestra.ai`. Domains yesdoor.ai and yesdoor.co were open on 2026-09-24.
- Software is mostly reused Fundhub machinery (soft pull, messaging, booking, agents, funnel push).
- Known hard parts, in order: getting paid by buildings, real estate licence / broker of record, keeping rents and availability true, renters (easy).
- Planned sequence: launch the free demand side first, run ads two weeks, then sign properties holding a list of pre-qualified renters.
- Source: `marketing/offers/yesdoor/README.md`, page `marketing/offers/yesdoor/yesdoor.dc.html`.
- Target: $3,000,000 revenue per month.
- **Owner-set 2026-10-07 — revenue is not only placement fees.** The soft pull is the front door. Lifetime value comes from: buyers guides, tools that help renters overcome apartment denials, lawyer referrals, credit repair, and more. Y1 models placement fees plus these back-end streams.

## Tasks

| # | Unit | Owner | Status |
|---|---|---|---|
| Y1 | Unit economics: placement fee + back-end LTV (guides, denial tools, lawyers, repair), fee per lease, leases/mo needed, metros needed, margin, cash timing | this session | done |
| Y2 | Market + competitors: Nestra, big locators (Smart City etc.), their revenue, how they scaled | open | done |
| Y3 | Demand: renter ad channels, cost per qualified renter, lead→tour→lease rates | agent | done |
| Y4 | Supply + licence: signing communities and management companies, fee terms, broker licence by state, listing data feeds | open | done |
| Y5 | Merge Y1–Y4, write report, commit | this session | done |

Y1–Y4 run at the same time. No dependencies between them. Y1 uses ranges and Y5 swaps in Y2–Y4's real numbers. Y5 waits on all four.

Every fact needs a source link. If a number cannot be found, write "not found." Do not guess.

## Prompts (paste one per new session)

### Y2 — Market and competitors

```
Fundhub repo, branch with board ops/workflows/yesdoor-3m-scale-2026-10-07.md. Read that board's Shared brief only.
Task Y2. Mark Y2 claimed on the board. Research only, no code.
Find, with source links: (1) what nestra.ai does, its markets, pricing, funding, traffic; (2) the biggest US apartment locators (Smart City Locating, Apartment Experts, Locate.com and others) — revenue, leases per month, markets, headcount, how they grew; (3) total locator / renter-referral revenue in the US and in the top 10 rental metros; (4) any locator or rental-matching company that has passed $3M a month and how long it took.
Write findings under "## Y2" on the board. Plain English, short lines, numbers with links. "Not found" where you cannot find it. Commit and push. Mark Y2 done.
```

### Y3 — Renter demand

```
Fundhub repo, board ops/workflows/yesdoor-3m-scale-2026-10-07.md. Read that board's Shared brief only.
Task Y3. Mark Y3 claimed. Research only, no code.
Find, with source links: (1) renter ad costs on Meta, Google and TikTok for apartment search terms in Phoenix, Dallas, Houston, Atlanta (cost per lead); (2) locator lead → tour → signed lease rates; (3) how long a renter takes from first click to signed lease; (4) which channels the big locators lean on (SEO, Google, Meta, referrals); (5) renter move volume per month in those metros.
Write under "## Y3" on the board: cost per signed lease range, by channel. Plain English, numbers with links, "not found" where missing. Commit, push, mark Y3 done.
```

### Y4 — Supply and licence

```
Fundhub repo, board ops/workflows/yesdoor-3m-scale-2026-10-07.md. Read that board's Shared brief only.
Task Y4. Mark Y4 claimed. Research only, no code.
Find, with source links: (1) typical locator fees apartments pay (percent of first month, flat fee) in Phoenix, Texas, Georgia, Florida; (2) how locators get paid and how long payment takes after move-in; (3) which big management companies (Greystar, Mark-Taylor, Avenue5, etc.) pay locators and whether they sign one deal for all their buildings; (4) real estate licence rules for paid renter referral in Arizona, Texas, Georgia, Florida, Colorado, Nevada, North Carolina — who needs a licence, broker of record, time to get one; (5) listing and availability data feeds (RentCafe/Yardi, RealPage, Entrata, ILS feeds) — access and cost.
Write under "## Y4" on the board. Plain English, numbers with links, "not found" where missing. Commit, push, mark Y4 done.
```

## Y1

Done. See `marketing/offers/yesdoor/scale-3m.md`. Owner-set: Chris handles AZ/real estate licensing.

## Y2

Done (agent). nestra.ai: "Concierge Apartment Matching in Arizona"; pricing/funding/traffic not found. Smart City: $7.7M (2017) → $22M+ (2019), ~99 staff, 10+ cities ([Inc post](https://smartcitylocating.com/blog/smart-city-locating-included-on-the-inc-5000-list-of-americas-top-private-companies/)). UMoveFree ~$30.9M/yr estimate ([prospeo](https://prospeo.io/c/umovefree-apartment-locators-revenue)). Online rental services ~$1.1B (2026) ([IBISWorld](https://www.ibisworld.com/united-states/industry/online-apartment-rental-services-in-the-us/5453/)). No locator confirmed past $3M/mo.

## Y3

Done (agent). Sources are mostly vendor blogs, US averages; Phoenix/Dallas/Houston/Atlanta splits not found.

- Lead → lease 5–10% (best >12%) ([LetHub](https://www.lethub.co/blog/lead-to-lease-conversion-metrics), [DoorLoop](https://www.doorloop.com/blog/lead-to-lease-conversion-rate)). Lead→tour 33–55%, tour→app 46–61%, app→lease 42–80% ([Apartment List](https://www.apartmentlist.com/rental-management/how-to-measure-ai-leasing-performance)). Locator-specific rates: not found.
- Google rentals: $35.52/lead, $3.10/click ([LuxuryPresence](https://www.luxurypresence.com/blogs/real-estate-paid-advertising-statistics/), [WordStream](https://www.wordstream.com/blog/ws/2021/08/31/real-estate-advertising-benchmarks)) → ~$355–$710 per lease.
- Meta real estate: $16.61–$38/lead (LuxuryPresence) → ~$166–$760 per lease.
- TikTok: $4 (one [case study](https://ads.tiktok.com/business/vi/inspiration/rent-social-lead-generation-case-study)) to $15–$45 ([Webtonic](https://www.webtonic.io/blog/real-estate-tiktok-ads-statistics)) → ~$40–$900 per lease. Weakest number.
- Search takes ~27 days ([Off Campus Partners](https://www.offcampuspartners.com/grow/learning-center/renter-survey-highlights)); start ~2.9 months before move ([Entrata 2024](https://go.entrata.com/rs/223-FOQ-437/images/Resident_Report_2024.pdf?version=0)).
- Locator channels: SEO, Google, Meta, chatbots; one Austin locator +1,490% leads from local SEO ([Smart Apartment Data](https://smartapartmentdata.com/?p=7854)). Per-locator channel split: not found.
- Phoenix: 46% of renters moved within two years ([Copper Courier](https://coppercourier.com/politics/page/10)). Monthly move counts: not found.

## Y4

Done (agent). Fee 100% of first month typical, 50–125% range, some flat $1,500 ([AptAmigo](https://blog.aptamigo.com/locator-commission/), [usahousinginformation](https://usahousinginformation.com/how-much-do-realtors-charge-to-find-a-rental/)). Paid on move-in, 60-day refund ([uMoveFree](https://www.umovefree.com/property-relations-old)); 30–90 days ([Rentgrata](https://help.rentgrata.com/hc/en-us/articles/1500006379821-Does-Rentgrata-or-the-Property-Manager-pay-out-move-in-bonuses)). TX licence required ([TREC](https://www.trec.texas.gov/q-real-estate-license-necessary-order-be-apartment-locator)); AZ 90 hrs + exam + sponsoring broker ([ADRE](https://azre.gov/sites/default/files/Forms/Licensing/Original_Licensing_Brochure.PDF)). Yardi RentCafe API: approved partners, pay per transaction ([Yardi](https://www.yardi.com/?p=354732)). Not found: Greystar/Mark-Taylor/Avenue5 locator policy, FL/CO/NV/NC rules, RealPage/Entrata terms.

## Leftovers

(one card per break found that nobody named — do not fix)
