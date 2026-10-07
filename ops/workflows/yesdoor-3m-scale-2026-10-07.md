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

## Tasks

| # | Unit | Owner | Status |
|---|---|---|---|
| Y1 | Unit economics: fee per lease, leases/mo needed, metros needed, margin, cash timing | this session | pending go |
| Y2 | Market + competitors: Nestra, big locators (Smart City etc.), their revenue, how they scaled | open | pending go |
| Y3 | Demand: renter ad channels, cost per qualified renter, lead→tour→lease rates | open | pending go |
| Y4 | Supply + licence: signing communities and management companies, fee terms, broker licence by state, listing data feeds | open | pending go |
| Y5 | Merge Y1–Y4, write report, commit | this session | waits on Y1–Y4 |

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

(this session)

## Y2

## Y3

## Y4

## Leftovers

(one card per break found that nobody named — do not fix)
