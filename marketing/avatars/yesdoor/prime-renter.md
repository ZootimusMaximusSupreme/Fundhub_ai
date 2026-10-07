# Yesdoor avatar 1 — Prime renter (Yesdoor Verified lane)

**Made:** 2026-10-07, task M1 (`ops/workflows/yesdoor-mvp-build-2026-10-07.md`).
**Method:** Chris's Avatar Builder SOP, 7 steps (`.claude/workflows/avatar-builder.js`): foundation → overview → desire research → mechanism → new information → avatar → verify. Steps are short here so one file holds the whole avatar.
**Ground truth:** `marketing/offers/yesdoor/industry-research.md` (called **IR** below), `docs/specs/yesdoor-mvp-2026-10-07.md` (**spec**), `marketing/offers/yesdoor/scale-3m.md`, `marketing/offers/yesdoor/acq-money-model.md`, plus new web research linked inline.

**Tags:** **[ASSUMED]** = our guess, not sourced. **[OWNER]** = Chris set it. **[SECONDHAND]** = seen in a search summary or a second site, the original was not opened. **[GAP]** = we looked and did not find it.

---

## Step 1 — Foundation (the business, from this renter's side)

1. **Service in one line.** Verify your credit, background and income once, for free, and see which contracted apartments will approve you before you pay any application fee. [OWNER, spec §7b]
2. **Category.** Free apartment matching and placement. The building pays a fee only on a signed lease. [OWNER]
3. **Core problem.** A good renter still has to guess. They pay a fee per building, wait, and race other renters for the same unit. Rules differ by building, so they can't tell ahead of time. [spec §13]
4. **Ideal client.** A renter in Phoenix, Los Angeles or San Diego with solid credit, steady income and a clean record, who wants a good unit fast and wants the move-in deal. [OWNER lanes, spec §7b]
5. **Before.** Many tabs open. Two or more applications out. A fee paid each time. Tracking landlord replies. Worried about fake listings.
6. **After.** One check done. A short list of buildings that will say yes. A tour booked tonight or this weekend. A clear "approved up to $X rent." [spec §7b]
7. **How it works.** Name, email, address → soft pull + background check + bank-linked income (Plaid) or bank statements → approved / likely / not this one, per building → tour booked → building gets the renter registered before the tour. [spec §3, §7b]
8. **Deliverables.** Approval result per building, "approved up to $X rent," tour bookings, a renter portal with status. [spec §3, §7b]
9. **Price.** Free to the renter. [OWNER]
10. **Competitors.** Zillow and Apartments.com (search, then apply building by building). Portable screening reports like RentSpree ($39.99–$49.99 per report, scale-3m). Apartment locators (free to the renter, paid by the building, IR).
11. **Differentiator.** Answers "will this building approve me?" before the fee, using each building's own rules. Verified income, not typed income. [spec §7b, §13]
12. **Objections.** "Will it hurt my score?" "Why do you want my bank?" "Is this a scam listing site?" "Will the building really honor it?" [ASSUMED — not measured]
13. **Best testimonial.** NONE ON FILE. Yesdoor has no clients yet.
14. **Common questions.** Does the check hurt my score? Do I still pay the application fee? Which buildings? How fast can I tour? [ASSUMED]
15. **Client language.** "application fee," "approved," "move-in special," "weeks free," "tour," "is this listing real." [ASSUMED from the research topics below; no verbatim renter thread was opened — see Gap 1]

## Step 2 — Overview (the client's view)

1. **Core promise.** See every apartment that will approve you, before you pay to apply.
2. **Journey.** Pick a building → 60-second check → see approved / likely → book a tour (evenings and weekends) → tour → lease → move-in. [spec §3, §7b]
3. **Outcomes.** Fewer fees paid. No surprise denial. First look at specials. A faster move.
4. **Benefits.** Apply once, not five times. Keep the money for the deposit. Spend the weekend touring, not filling out forms.
5. **Desires.** "I want to know I'm approved before I go." "I want the best deal, not the leftover unit." "I don't want to get scammed." "I want this done this week."
6. **Unique mechanism (named).** **The Yesdoor Verified Pass.** Verify once. Apply anywhere on Yesdoor. [OWNER name: Yesdoor Verified, spec §7b]
7. **Hidden mechanisms (why it works).**
   - Income comes from the bank, not a pay stub. Buildings trust that, because fake pay stubs are their top fraud (84.3% of operators saw them, IR / NMHC).
   - Each building's own rules are stored and dated. "Approved" only when the renter clears every rule with room to spare. Close calls show "likely." [spec §16]
   - The renter is registered with the building before the tour, so the building knows exactly who is coming. [spec §3]

## Step 3 — Desire research

**Functional wants**
- Spend less on application fees. 79% of recent renters paid one; typical $50; 66% sent two or more applications. [IR / Zillow, MPA]
- Win the unit against other renters. 22% named competing with other renters as a top frustration. [IR / Zillow 2022]
- Get the deal. In Phoenix, over 50% of communities offered some discount in Q2 2025, and lease-up buildings typically gave six to eight weeks free. [Matthews, Q2 2025](https://www.matthews.com/insights/q225-multifamily-market-report-phoenix-az)
- Avoid fake listings. 43.1% saw scam listings; typical loss $400. [IR / Apartment List]

**Emotional needs**
- Certainty. 40% of renters lost sleep during the search. [IR / Zillow 2022]
- Feel like a good catch, not a suspect. [ASSUMED]

**Pains and frustrations**
- Affordability 38%, tracking landlord messages 26%, competing 22%. [IR / Zillow 2022]
- Upfront costs: ~35% say upfront costs are their biggest hurdle. [IR / HousingFinance]. Among renters who named upfront costs, 40% named application fees in 2023, up from 35% two years before (Fannie Mae, via [Center for American Progress](https://www.americanprogress.org/article/capping-rental-application-fees-at-5/)).
- Fees are often kept even after a denial. One property's site said "All application fees are not refundable for any reason." [Scripps News, John Matarese](https://scrippsnews.com/stories/renters-beware-application-fees-can-now-cost-hundreds-of-dollars/)

**Existing solutions and complaints**
| Solution | Complaint |
|---|---|
| Zillow / Apartments.com | Fee per building; no answer on approval until after you pay. [spec §13] |
| Portable screening report | Paid per report ($39.99–$49.99, RentSpree, scale-3m); landlords don't have to accept it (California AB 2559, spec §16). |
| Apartment locator | Free, but the renter still applies and pays each building. [ASSUMED] |
| Walk-in to the leasing office | Rules are not posted in a way a renter can check. [spec §13] |

**Client voice (direct quotes, real sources only)**
- Clare Trapasso, Realtor.com (expert, not a renter): "It never hurts to ask to get a refund, especially if you don't get the place." [Scripps News](https://scrippsnews.com/stories/renters-beware-application-fees-can-now-cost-hundreds-of-dollars/)
- **[GAP 1]** No verbatim quote from a prime renter was captured. Reddit is blocked from this cloud session (it returns a block page). Run a Reddit pass (r/Apartmentliving, r/phoenix, r/LosAngeles, r/sandiego) from a machine that can reach it, before ads are written.

**New desire opportunities**
- "Approved before I pay." No major site sells this to renters. [spec §13; ASSUMED that no major site sells it — not fully checked]
- "First pick of the special." In an oversupplied market like Phoenix, the renter holds the power, but no tool tells them where they're already approved *and* where the deals are.

## Step 4 — New mechanism

- **Name:** The Yesdoor Verified Pass.
- **One line:** One free check of credit, background and bank-verified income, matched against each building's own written rules, so you only apply where you'll be approved.
- **Three parts:**
  1. **Verify Once** — soft pull, background check, bank-linked income. [spec §7b]
  2. **Rules Match** — each building's dated rules, approved / likely / no. [spec §16]
  3. **Front of the Line** — fast tours, first pick of specials, fee waived where the building agrees. [spec §7b; fee waiver is a contract ask, no building has agreed yet]
- **Contrarian view:** The industry says "apply and find out." Yesdoor says find out first, then apply.
- **Hook samples (drafts, not approved copy):**
  1. "Stop paying $50 to find out. See which apartments approve you first."
  2. "Verified once. Approved where it counts. Tour tonight."
  3. "Half of Phoenix buildings are running specials. Here's where you're already approved."

## Step 5 — New information

1. **Phoenix is a renter's market right now.** Vacancy 12.1%, rents −2.6%, over 50% of communities discounting, six to eight weeks free in lease-up (Q2 2025). [Matthews](https://www.matthews.com/insights/q225-multifamily-market-report-phoenix-az). Phoenix had the highest share of communities with yearlong concessions, 14.9% (Realtor.com data, Sept 2026). [CREDaily](https://www.credaily.com/?p=222979)
   - Why it's new: renters think they're competing. In Phoenix, buildings are competing for them.
   - Use: lead with the deal, not the fear.
2. **Buildings distrust pay stubs.** 93.3% of operators got fraudulent applications; 84.3% saw fake pay stubs. [IR / NMHC]. "Nowadays anyone can download payroll software and create these documents there..." — Patricia Daly, MRI Software. [NAA, 2024-07-24](https://naahq.org/news/beware-fake-pay-stubs)
   - Why it's new: the honest renter pays for the fraud through slow, suspicious screening.
   - Use: "Your income, proven by your bank. No pay-stub suspicion."
3. **Southern California is tighter.** Los Angeles County stays undersupplied; San Diego vacancy held at 5.4% in Q3 2025 with wide concessions. [SECONDHAND — search summaries of USC Lusk and Matthews reports; pages not opened]
   - Use: in LA and San Diego, sell speed and certainty more than deals.

## Step 6 — Core Avatar Profile

### Avatar name: **"Sure-Thing Sam"**

**Profile summary.** Sam is ready to move. Good credit, a steady paycheck, no record. Sam is not worried about being denied. Sam is worried about wasting time, wasting fees, and losing the good unit to someone faster. Sam has three tabs of listings open, has seen at least one that looked fake, and knows Phoenix buildings are giving weeks free but can't tell which deal is real. Sam wants it handled this week. [composite built from the research above; Sam is not a real person]

### The Core 5

**1. Desires**
- **Core desire:** To get the best unit, fast, with zero wasted money or doubt.
- **Surface desires:** Approved before paying. The move-in special. A tour after work. A listing that's real. One application, not five.

**2. Experiences**
- **Situational:** Has applied to two or more places (66% do, IR). Juggling landlord messages (26% name it, IR). Seeing "weeks free" offers everywhere in Phoenix (Matthews).
- **With other providers:** Paid fees that weren't refunded. Waited days for an approval email. Saw scam listings (43.1%, IR). [ASSUMED that Sam had all three; each is common per the sources]

**3. Emotions**
- **Primary:** Impatience. The search is a chore that keeps eating evenings.
- **Secondary:** Low-grade worry (40% lost sleep, IR). Annoyance at being treated like a fraud risk. Fear of missing the better deal. [ASSUMED mix]

**4. Behaviors and habits**
- Searches on Zillow, Apartments.com, Google. Finds apartments on TikTok and Instagram too: "Many renters now discover, evaluate, and select apartments through TikTok, Instagram, and Google before speaking with a property." — Lauren Eurto, Greystar. [CREDaily, 2026-07-08](https://www.credaily.com/?p=219786)
- Compares specials. Books tours on evenings and weekends. Peak search is early summer (first week of June, Zillow 2025). [Zillow](https://zillow.mediaroom.com/2025-05-28-Rental-hunting-season-hits-fever-pitch-as-June-begins,-Zillow-data-shows)

**5. Demographics (last, never the driver)**
- Lives in or is moving to Phoenix, Los Angeles or San Diego. [OWNER markets]
- Rent range: Phoenix ~$1,550, LA ~$2,750, San Diego ~$2,893 (city averages, scale-3m).
- Credit around or above ~650 (approved renters averaged ~650, IR / Rentec). [ASSUMED as a cut line]
- Meta treats housing ads as a Special Ad Category: no targeting by age, gender or zip code, and a 15-mile minimum radius. So this section describes Sam. It is not an ad-targeting list. [Jon Loomer](https://www.jonloomer.com/special-ad-categories-meta-ads/)

### Messaging blueprint

- **Core message:** Know you're approved before you apply. Then get the best deal first.
- **Winning hooks:** the three in Step 4, plus "Phoenix buildings are giving weeks free. See the ones that already said yes to you."
- **Pains to agitate:** fees paid to find out; the slow approval email; losing the unit; fake listings.
- **Belief to shift:** From "I have to apply to find out" → To "I find out first, for free, then apply once."

---

## Step 7 — Verify (adversarial pass)

- **Fabrication:** every number above traces to IR or a linked page. The only quotes are from named experts in published articles. No renter quote is invented; the gap is marked (Gap 1).
- **Specificity:** Sam is a composite. Demographics are last.
- **Promises the offer can't back yet:**
  - "Fee waived" — no building has agreed. Say "where the building agrees" until contracts say so.
  - "Move-in reward" — owner note says check each state's rules first (spec §7b). Not in hooks.
  - "Approved" is the building's call. Use "approved by the building's own rules" and show the rules date (spec §16).
  - "Only contracted buildings" — there are none yet. Ads wait for signed buildings or say "sample."
- **Open gaps:** Gap 1 (real renter quotes). Florida not covered (owner lists it as a third market; rents only in scale-3m).
