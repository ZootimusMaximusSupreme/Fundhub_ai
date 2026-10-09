# Yesdoor — senior living line (spec)

**Date:** 2026-10-07  **Status:** draft for Chris to review. This is words, not code. Nothing is built.
**Research behind every fact:** `ops/workflows/yesdoor-senior-living-2026-10-07.md` (sources linked there).

**Owner-set 2026-10-09: 55+ goes first.** Assisted living and memory care are parked. Chris: "tough to compete there, lets do 55+." The 55+ line is §16. Sections 1 and 3–6 and the senior parts of §13 describe the parked assisted-living line.

## 1. What it is

Yesdoor gets people into places (owner-set 2026-10-07). Senior living is one niche on Yesdoor, not the whole platform (owner-set 2026-10-08) — the same way dentist funding is a niche on Fundhub. This line does it for seniors.

A family takes a free check. Yesdoor shows them which assisted living and memory care communities
they can afford and that will take their parent. An advisor helps the ones who are ready. The family
pays nothing. The community pays Yesdoor when the resident moves in.

What nobody else does: check the money **before** sending the family anywhere. In 2024 a Senate probe
found about 40% of A Place for Mom families were placed above their budget.

## 2. Lines and launch order

| Order | Line | Where | How Yesdoor is paid |
|---|---|---|---|
| 1 | 55+ (active adult) and independent living (owner-set 2026-10-09) | Phoenix, Arizona | Community pays per lease, owed at lease signing, net-30 at most (§16) |
| Parked | Assisted living + memory care, private pay (owner-set 2026-10-09) | Phoenix, Arizona | Community pays per move-in |
| Later | Private-pay home care | Arizona first | Agency pays per new client |
| — | Add-ons: renters insurance, deposit alternative, lease guarantor | Apartments line first | Insurance commission (licensed agency) |
| Later | Same lines in Nevada, Texas, California, Florida | — | Same, under each state's rules |

Kept out of Yesdoor: hospice, home health, addiction treatment (no per-patient fee is legal);
cash-pay mental health (not a place); franchise placement and practice funding (Fundhub).

## 3. Who is involved

- **Shopper:** usually the adult child. Brothers and sisters can join the same search.
- **Resident:** the parent, or a couple.
- **Legal representative:** whoever holds a financial power of attorney, if the parent can't sign.
- **Community:** the assisted living center or small home (Arizona has 1,320 small homes of 10 beds or fewer in Phoenix).
- **Yesdoor advisor:** calls families who are ready, books tours.
- **Yesdoor staff:** sign communities, send invoices, handle disputes.

## 4. The journey

1. The family lands on the Yesdoor senior page.
2. **Free check, about 3 minutes:** who is moving, care level (Arizona has three: supervisory, personal, memory care), area, how soon.
3. **Money:** monthly income, savings, VA service (yes/no), long-term-care insurance, a house (value, selling or not).
4. **No credit pull by default.** Communities decide on care needs and money, not credit score. A soft pull only happens if the family wants a bridge loan, with the senior's e-signature or a copy of a financial power of attorney.
5. **The answer:** a monthly budget, how many years the money lasts, and flags such as "VA benefit likely (+$2,424 a month)", "Medicaid (ALTCS) likely", "bridge loan until the house sells".
6. **Matches:** communities that fit the care level and budget, each marked approved / likely / no / unknown, with the full price (base rate + care fee + community fee).
7. **Arizona disclosure:** before any referral, the family e-signs the state disclosure: who pays Yesdoor, how much, and any business ties. The community can't pay without it.
8. **Advisor call** for families ready to move. The advisor books tours.
9. **Community steps:** tour → the community's own care assessment → accepted or declined → deposit or room hold → waiting on a house sale, if any → move-in.
10. If Yesdoor said "approved" and the community said no, it counts against that community's rules, same as Yesdoor apartments.
11. **Move-in:** the community tells Yesdoor (Arizona: within 14 days). Yesdoor sends the invoice.
12. **After move-in:** check-ins at move-in and day 30.

**Hand-offs with no fee:** Medicaid families go to an elder-law attorney. VA claims go to an
accredited veterans service officer, who is free. House questions go to a realtor.

## 5. Money

- The fee is set in each community's signed agreement: flat, or a % of the first month.
- The fee is earned at move-in.
- **Refund:** a prorated refund to the community if the resident leaves, dies or goes to hospital within 30 days of move-in. Washington requires this; Yesdoor offers it everywhere.
- Disputes ("who referred first", "they declined after we said yes", refunds) are decided within 14 days.
- Typical fee: about $3,500 to $6,370 per move-in (Arizona median assisted living is $6,370 a month).

## 5a. Locking the deal (Chris, 2026-10-08: "how can we get them to actually sign before")

Two leaks: the family goes quiet, or the family and the community skip Yesdoor once they've met.

**Signatures come first, before any names:**
1. **Community signs first.** No community appears in results until it has signed the Yesdoor fee agreement (e-sign, same as Yesdoor apartments). The agreement says:
   - a family Yesdoor registered counts for **12 months**
   - the community has **5 business days** to say "already our prospect", or the fee stands (the Caring.com rule)
   - the community must report a move-in within 14 days (Arizona law)
2. **Family signs before seeing names.** The family e-signs the Arizona disclosure and acknowledgment **before** the matched list unlocks. The law already requires this, and it doubles as our proof that Yesdoor referred them. Under Arizona's 2026 law, if a family later cancels, the fee is still owed on any community Yesdoor already named that they move into within 12 months.
3. **Registration on booking.** When Yesdoor books a tour, the community gets a timestamped registration (Yesdoor apartments already does this). Tours are booked through Yesdoor, not by the family calling the community.

**Stop families going quiet:**
- Speed: 56% of assisted living move-ins happen within 30 days of the first inquiry, so the advisor calls within minutes, not days.
- Only families who can afford it and fit the care level see matches. That keeps conversion high and makes communities want our families.
- Start with the 1,320 small Phoenix homes. They have no sales team, so they need us most and are least likely to cut us out.

**What can't be done:** lock a family to Yesdoor only. Texas and Arizona give families the right to stop at any time, and Washington bans exclusive deals.

## 6. Hard rules (built into the database, not just the screens)

1. **No fee, ever, on a Medicaid resident** (Arizona ALTCS, California Medi-Cal, Florida Medicaid). In Arizona that fee is a felony.
2. **Disclosure before referral, acknowledgment before invoice** (Arizona).
3. **Ranking is never for sale.** The answer comes from the family's facts only, never from who pays.
4. **Credit data never goes to a community.** Only Yesdoor's answer does.
5. **Consent comes from the person whose file is pulled,** or a copy of their financial power of attorney.
6. **Staff never hold a power of attorney** (banned in Texas, Nevada and Oklahoma).
7. **No Medicaid planning advice.** Screening, checklists and hand-offs only.
8. **No per-patient fee from a hospice, home health agency or addiction provider,** in any line, ever.

## 7. Add-ons

| Add-on | Line | Why |
|---|---|---|
| Renters insurance | Apartments | Every renter needs it |
| Deposit alternative | Apartments | Lowers move-in cash |
| Lease guarantor | Apartments | Turns a "no" into a "yes" for second-chance renters |

The match answer can say **"approved with a guarantor"** when a building accepts one.
Path to get paid: Yesdoor holds a property & casualty agency license in Arizona, California and
Florida. Without a license, only flat referral fees that don't depend on the sale.

## 8. What carries over from the Yesdoor apartments build (PR #55)

- **Keep as-is:** login links, the match engine's approved / likely / no / unknown logic and stale-rule cap, backup matches, "who referred first" proof, invoices, disputes, e-sign, events and outbox.
- **Change:**
  - The renter becomes a household: shopper, resident, legal representative.
  - Several logins per search.
  - Income becomes income + savings + VA + long-term-care insurance + house.
  - Building rules become community rules: care levels, payers accepted, money runway.
  - Price becomes a stack.
  - Stages: no lease end; add assessment, hold, waiting on house sale.
  - Refunds become prorated from move-in.
- **New:**
  - care level
  - payer type on every resident
  - the Medicaid fee block
  - the family disclosure
  - a "line" marker so apartments, seniors and home care share one Yesdoor

## 9. Before launch (not code)

- Two insurance policies: general and professional liability, $1M per claim / $3M total each (Arizona law).
- Background check on every advisor.
- The exact Arizona disclosure wording.
- Signed agreements with Phoenix communities.
- Real estate license (independent living line) and property & casualty agency license (add-ons).

## 10. Size

Phoenix: about 1,236 move-ins a month, about 1,014 private pay (agent math from state bed counts,
88% occupancy, ~22-month stays). At 15% of those, at $3,500 to $5,000 each: **about $532k to $760k a month**.

## 11. Defaults already set (Chris can change any)

| Decision | Default |
|---|---|
| Who guides the family | Online first, advisor after (Chris said "idk"; agent default) |
| Credit pull | Off by default; only for bridge loans |
| First market | Phoenix |
| Refund | 30-day prorated, everywhere |
| Family pays | Nothing |

## 12. Build order (CLAUDE.md §3a, owner rule 2026-09-19)

1. Chris reviews this spec.
2. Schema and migration: household, care level, payer type, Medicaid fee block, prorated refund, line marker. Built alongside the Yesdoor apartments tables (PR #55), not apart from them.
3. Read endpoints with tests that run against a real database.
4. Flow diagram: `docs/journeys/yesdoor-senior-flow.md`.
5. Screens last.

## 13. Launch gate and split tests (owner-set 2026-10-08)

**Launch gate:** Yesdoor does not start spending until it has **$100k in cash**, and probably a **$250k MCA (merchant cash advance) for ad spend**. Until then, plan against a $100k virtual budget.

**What $250k of ad spend buys (agent math, sourced inputs):**

| Line | Lead cost | Leads | If this % move in | Move-ins | Fees |
|---|---|---|---|---|---|
| Senior living | ~$71 (assisted living, Meta) | ~3,500 | 2% / 5% | ~70 / ~175 | ~$250k–$450k / ~$615k–$1.1M |
| Apartments | ~$36 ($27 ads + $9 pull, Yesdoor scale plan) | ~6,900 | 7.5% | ~520 | ~$780k at $1,500 each |

Funding the ad spend is Chris's call (owner-set 2026-10-08).

Fee timing:
- **Apartments:** 2–4 months from the lead (Yesdoor plan, `marketing/offers/yesdoor/acq-money-model.md`).
- **Senior living:** likely faster. 56% of assisted living move-ins happen within 30 days of the first inquiry. The community reports the move-in within 14 days (Arizona). Then the invoice is paid. That makes about 1–2 months, not yet measured.

**Split tests (Chris: "we can split test ideas"):**
1. Sign before seeing names **vs** see "3 communities fit you, $5,200–$6,100 a month" first, then sign to unlock names.
2. Online first, advisor after **vs** advisor calls every family right away.

## 14. Idea: paid "what you qualify for" roadmap (Chris, 2026-10-08 — not yet decided)

Chris: "Give what they qualify for in our ecosystem, then they pick whatever they want, and we track it on the back end. Kind of like the paid SLO offer system."

How it would work (same shape as Fundhub's $297 roadmap, `marketing/landing-pages/slo/FUNDHUB-297-FUNNEL-README.md`):
1. The person pays up front for a roadmap of everything they qualify for across Yesdoor: apartments, senior living, add-ons and credit help.
2. They pick whatever they want.
3. Yesdoor tracks the pick on the back end, so the place's fee is still claimed.

Why it helps:
- **Cash on day 1**, instead of 1–4 months later.
- **Less going around us:** the person has already paid and picked inside Yesdoor.

What each state allows when the renter or family pays:

| Who pays | AZ | CA | FL |
|---|---|---|---|
| Family pays (senior living) | The Arizona referral-agency law already covers a fee "collected from either the resident or the facility". Same disclosures apply. | Not checked | Not checked |
| Renter pays for a rental list | No rule found | Needs a real estate or prepaid rental listing licence and a contract the state approved first. Full refund if fewer than 3 matching listings within 5 days. Refund of everything above $50 if they don't rent through us ([B&P §10167.9–.10](https://california.public.law/codes/ca_bus_and_prof_code_section_10167.9)) | Contract or receipt required. Refund of everything above 25% if they don't rent. Full refund if the list isn't accurate. Breaking this is a misdemeanor ([§475.453](https://m.flsenate.gov/Statutes/475.453)) |

So in California and Florida, most of a renter's fee comes back if they don't rent. Day-1 cash from renters really holds in Arizona and in senior living.

## 15. Zero circumvention — the stack (owner-set goal 2026-10-08)

Full research with sources: `ops/workflows/yesdoor-zero-circumvention-2026-10-08.md`.

Build these, in this order:
1. **Register before reveal.** Names and contacts unlock only after the signed disclosure and consent. Tours and applications go through a Yesdoor link that stamps Yesdoor as the lead source.
2. **One contract for every building and community:**
   - first registered wins
   - 6 months for apartments, 12 months for senior
   - 5 business days to flag a duplicate
   - 14-day move-in report
   - audit rights
   - price parity
   - unreported placement = fee + interest + audit and collection costs (not a flat 2x, which likely fails in AZ and FL)
3. **Monthly match** of registered names against rent rolls and move-in lists, plus a yearly audit.
4. **Renter move-in reward,** paid only on a verified lease, and disclosed. No cash rebates to families in Florida (felony).
5. **Re-pull consent extended** to confirm the new address for 12 months. An address change triggers an audit. Never use the Post Office change-of-address file.
6. **Broker partners:** a tracking code per renter, 12-month protection, lease proof and a buyout fee.
7. **Staff:** license law already bans side fees. Pay only on reconciled placements. CRM roles with export logs. Covenants by state (CA: confidentiality only; FL: non-solicit of 6 months or less; AZ: narrow non-solicit).
8. **Add-on partners and lenders:** data used only for named purposes, a 30–45-day window, no credit data shared.
9. **Double registration:** first registered wins, and the family gets sent back to the first agent.
10. **In-app messaging** that hides contact info until the person commits.

What can't be stopped, only caught: someone who found the place on their own first, and a building that leaves a lease off its rent roll.

## 16. 55+ first (owner-set 2026-10-09)

Chris: "tough to compete there, lets do 55+." Assisted living is parked.

**What it is:** Yesdoor apartments with a 55+ filter. One soft credit check shows a Phoenix renter aged 55 or over which 55+ communities will approve them. Yesdoor books the tour. The community pays Yesdoor.

| | 55+ line | Source |
|---|---|---|
| Who pays | The community | — |
| Fee | Not known yet. The first signed communities will show it. | No public number found |
| Law | Arizona real estate licence, which Yesdoor holds (owner-set). Arizona's assisted-living referral law (§36-446.14) is not in the way. | `ops/workflows/yesdoor-senior-living-2026-10-07.md` (L1 table) |
| When Yesdoor is paid | **Owner-set 2026-10-09:** the fee is owed at lease (contract) signing, payment terms net-30 at most, refunded if the renter never moves in. Chris: "We just need to get paid on contract signing or whatever, net30 account max. Otherwise it can't really work." | Zillow's fee is owed when the lease is signed (stress test §1.3) |
| Do communities need renters? | Yes. Phoenix 55+ (active adult) is 88.7% full, the lowest of the 15 biggest active-adult markets. | NIC, Oct 1, 2026 (stress test, Prompt 1) |
| First contact to move-in | About 66 days (independent living average). No 55+-only number found. | Aline via Ziegler, 2023 |
| Ads | Meta housing ads can't target by age. Copy can't ask "Are you 55+?" because Meta bans ads that imply the viewer's age. Describe the place instead ("New 55+ homes in Phoenix"). Meta also evens out who sees housing ads by age, gender and race, so expect more views per lead. | Meta ad standards; Meta ads-fairness update, Jan 2023 |
| What carries over | The Yesdoor apartments build (PR #55): soft pull, match, tour booking, registration proof, fee ledger. New: a 55+ filter, and billing at lease signing instead of after move-in. | `src/yesdoor`, migrations 434–437 |

**Target (Chris, 2026-10-09):** about 5:1 return on ad spend. Our math: with ads plus the pull at about $36 a lead, 5:1 needs about a 12% lease rate on a $1,500 fee, or 7.5% on a $2,400 fee. The Phoenix test measures both.

**Open:** the fee size, and the competition. Competition research: `ops/workflows/yesdoor-55plus-competition-2026-10-09.md`.

