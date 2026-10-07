# Yesdoor avatar 2 — Second Chance renter (credit, eviction or criminal record problems)

**Made:** 2026-10-07, task M1 (`ops/workflows/yesdoor-mvp-build-2026-10-07.md`).
**Method:** Chris's Avatar Builder SOP, 7 steps (`.claude/workflows/avatar-builder.js`), short form, one file.
**Ground truth:** `marketing/offers/yesdoor/industry-research.md` (**IR**), `docs/specs/yesdoor-mvp-2026-10-07.md` (**spec**), `marketing/offers/yesdoor/scale-3m.md`, `marketing/offers/yesdoor/acq-money-model.md`, plus new web research linked inline.

**Tags:** **[ASSUMED]** our guess · **[OWNER]** Chris set it · **[SECONDHAND]** seen in a search summary, original not opened · **[GAP]** looked, not found.

---

## Step 1 — Foundation

1. **Service in one line.** A free check that shows which buildings will accept you, record and all, before you pay an application fee. [spec §13]
2. **Category.** Free second-chance apartment matching. Building pays on a signed lease. Back-end help for those who don't match yet: denial breakdown, credit repair, lawyer referral. [OWNER, spec §7b, acq-money-model]
3. **Core problem.** They get denied after they pay. Often it's one surprise item: an old eviction, a collection, a record. They never know in advance if a building will take them. [spec §13]
4. **Ideal client.** A renter with income who has a past eviction, collections, low score, or a criminal record, looking in Phoenix or Southern California.
5. **Before.** Applying blind. Fees lost. Denial letters with no clear reason. Running out of time on a move-out date.
6. **After.** A list of buildings whose own rules they meet. A tour booked. A lease. If no match today, a clear reason and a path to fix it.
7. **How it works.** Name, email, address → soft pull + background check + verified income → each building's rules checked → approved / likely / not this one → tour booked → registered with the building. On "not this one," shown the buildings they do qualify for, plus the back-end offers. [spec §3, §7b]
8. **Deliverables.** Match list, tour booking, a dated result per building, backup buildings if a building says no. [spec §16]
9. **Price.** Matching is free. Back end prices are TBD (Fundhub reference only: Decline Autopsy $27, repair first round $200, done-for-you repair $1,000). [acq-money-model]
10. **Competitors.** "Second chance apartment" lists and directories. Locators who take second-chance renters. Paid rental lists. Applying building by building.
11. **Differentiator.** Uses each building's own written rules, so the renter knows before paying. If a building says no anyway, Yesdoor rebooks them at a backup building. [spec §16]
12. **Objections.** "Everyone says second chance, then denies me." "Will this pull hurt my credit?" "Is this another paid list scam?" "Will they see my record?" [ASSUMED]
13. **Best testimonial.** NONE ON FILE.
14. **Common questions.** Do you take evictions? How old does it have to be? Felonies? Do I pay anything? [ASSUMED]
15. **Client language.** "second chance apartments," "felony friendly," "broken lease," "eviction on my record," "no credit check." [SECONDHAND — these are the search terms the sites below rank for]

## Step 2 — Overview

1. **Core promise.** Find out which apartments will say yes to you — record and all — before you pay a dime.
2. **Journey.** Free check → see the buildings that fit → book a tour → tour → lease. Or, if none fit yet: see why, and the fastest fix.
3. **Outcomes.** No more lost fees. A real place, not a maybe. A plan if today is a no.
4. **Benefits.** Stop wasting money on applications. Stop the hours on the phone. Keep the move-out date from becoming a crisis.
5. **Desires.** "I just want someone to say yes." "I want to know before I pay." "I want a fresh start." "I don't want to be judged for one bad year."
6. **Unique mechanism (named).** **The Before-You-Apply Match.** We check your file against each building's own rules first.
7. **Hidden mechanisms.**
   - Rules are the building's own, versioned and dated, re-confirmed monthly. [spec §16]
   - A denial must come with a reason. That reason updates the building's rules in the system. [spec §16]
   - A backup list of buildings the renter already clears, so a surprise "no" turns into a rebooked tour in minutes. [spec §16]
   - Second-chance buildings and buildings with empty units are signed first. [OWNER, spec §7b]

## Step 3 — Desire research

**Functional wants**
- A yes. Denials cluster around what this renter has: accounts in default or collections caused 32.9% of rejections; criminal history ~12%. [IR / PA Realtors]
- Not to waste fees: one family paid $380 ($80 per adult plus $220) and was denied for credit history; the complex kept it all. [Scripps News](https://scrippsnews.com/stories/renters-beware-application-fees-can-now-cost-hundreds-of-dollars/)

**Emotional needs**
- To be seen as a person, not a record.
- To stop feeling shut out.

**Pains and frustrations**
- Landlords fear exactly their history: missed rent 84%, past evictions 56%, criminal history 45%. [IR / SmartMove]
- Rejected renters averaged a ~538 score vs ~650 approved. [IR / Rentec]
- Records are often wrong. The CFPB got ~26,700 tenant-screening complaints from Jan 2019 to Sept 2022; more than 17,200 were about incorrect information. It found eviction records, accurate or not and whatever the outcome, have a high likelihood of leading to denial. [SECONDHAND — summaries of the CFPB Nov 2022 reports](https://www.troutman.com/insights/cfpb-highlights-purported-problems-with-tenant-background-checks/); [CFPB report PDF](https://files.consumerfinance.gov/f/documents/cfpb_consumer-snapshot-tenant-background-check_2022-11.pdf) (not opened)
- No feedback. One woman asked a rental agent what she could do better and was told: "No complex will take you." [Bucks County Courier Times, Jo Ciavaglia, 2021-11-19](https://www.yahoo.com/news/she-homeless-nearly-options-then-030100426.html)

**Existing solutions and complaints**
| Solution | Complaint |
|---|---|
| "Second chance" lists and blogs | They don't guarantee housing; full background checks still run. [SECONDHAND, Phoenix second-chance guides in search results] |
| Paid rental lists | One renter paid $180 for a list and still got only rejections. [Courier Times](https://www.yahoo.com/news/she-homeless-nearly-options-then-030100426.html) |
| Applying blind | $500 in nonrefundable fees for the same renter, and nothing but rejections. [same source] |
| Locators | Some locator jobs note many callers with "issues" like felonies and evictions. [SECONDHAND — Glassdoor review summary, page blocked] |

**Client voice (direct quotes, real sources)**
- "I was under the impression it was going to be refundable." — Erick Willett, denied for credit history after $380 in fees. [Scripps News](https://scrippsnews.com/stories/renters-beware-application-fees-can-now-cost-hundreds-of-dollars/)
- "Having a new baby, and all the expenses, this is a lot of money to us." — McKenzie Willett. [same]
- "It was exhaustive. Every rock I could turn over I turned over." — Karen McDonald, who had a criminal history, poor credit and a past eviction. [Courier Times](https://www.yahoo.com/news/she-homeless-nearly-options-then-030100426.html)
- "I had no opportunities left." — Karen McDonald. [same]
- "Someone saw me for the very first time." — Karen McDonald, after a landlord approved her. [same]
- Note: McDonald also had a housing voucher, which some landlords refused. Her story is not only about her record.
- **[GAP 1]** No Reddit or forum quotes captured (Reddit blocked from this session). Run that pass before ads.

**New desire opportunities**
- "Tell me before I pay." Owner's own experience: the worst part is not knowing. [spec §13]
- "Tell me why, and how to fix it." No one gives feedback today (McDonald). This is where the back end (denial breakdown, repair, lawyers) earns money. [acq-money-model]

## Step 4 — New mechanism

- **Name:** The Before-You-Apply Match.
- **One line:** Your file is checked against each building's own written rules first, so you only apply where your record already fits.
- **Three parts:**
  1. **Free Check** — soft pull, background check, verified income. [spec §7b]
  2. **House Rules Match** — the building's dated rules on evictions, records, score and income. [spec §16]
  3. **Backup Door** — if a building says no anyway, you're rebooked at a backup building you already clear. [spec §16]
- **Contrarian view:** The industry says "second chance" and then screens like everyone else. Yesdoor checks the rules first, so "second chance" means a real yes.
- **Hook samples (drafts):**
  1. "One old eviction shouldn't cost you $500 in fees. See who'll say yes first."
  2. "Record? Collections? See which apartments accept you — before you pay to apply."
  3. "Phoenix files twice the national rate of evictions. Some buildings still say yes. Here's which ones."

## Step 5 — New information

1. **Phoenix has a huge pool of renters with eviction filings.** Maricopa County had a record 87,310 eviction filings in 2024 and nearly 78,000 Jan–Nov 2025. "In Phoenix, we have [an eviction filing rate of] 14% for this last year, which is twice the amount of eviction filings that we see at a national level." — Juan Pablo Garnham, Eviction Lab. [KJZZ, 2025-12-26](https://www.kjzz.org/business/2025-12-26/2025-was-another-very-busy-year-for-maricopa-county-eviction-filings)
   - Why it's new: a filing is not an eviction, but it still shows up. That's a big, local market most sites ignore.
2. **Screening records are often wrong** (CFPB, above). Use: "Something on your report may not even be yours." This opens the denial-breakdown and repair back end. Do not promise a fix.
3. **California bans blanket record bans.** No blanket criminal-record bans; arrests without a conviction can't be used; each case reviewed one by one. [IR / CA CRD]. Use: in California, more buildings can say yes than renters think.
4. **Phoenix buildings have empty units.** Vacancy 12.1% in Q2 2025. [Matthews](https://www.matthews.com/insights/q225-multifamily-market-report-phoenix-az). Owner: sign second-chance buildings and buildings with empty units first (spec §7b). Empty units make buildings more open to this renter. [ASSUMED link between vacancy and looser rules]

## Step 6 — Core Avatar Profile

### Avatar name: **"Braced-for-No Bree"**

**Profile summary.** Bree works and can pay rent. But there's an eviction from a bad year, a collection, or an old record. Bree has applied before, paid the fee, and got the "no" after. Now every application feels like paying to be rejected. Bree doesn't need a pep talk. Bree needs one honest answer: "Will this building take me?" — before paying. And if the answer is no, Bree wants to know why and what fixes it. [composite; not a real person]

### The Core 5

**1. Desires**
- **Core desire:** A real yes, without being humiliated or robbed of fees along the way.
- **Surface desires:** Know before paying. A building that takes evictions or records. A fresh start. A reason when it's a no.

**2. Experiences**
- **Situational:** Has a move-out date coming. Has a past eviction filing, collections, or a record. [ASSUMED mix; each is a top denial cause per IR]
- **With other providers:** Fees kept after denial (Willett). Paid lists that didn't help, and no feedback ("No complex will take you," McDonald). Second-chance lists that still ran full checks.

**3. Emotions**
- **Primary:** Dread of the next "no."
- **Secondary:** Shame. Exhaustion ("Every rock I could turn over I turned over"). Distrust of anything that says "second chance." A small, guarded hope.

**4. Behaviors and habits**
- Searches "second chance apartments," "felony friendly apartments," "apartments that accept evictions" plus the city. [SECONDHAND — sites ranking for these terms]
- Calls buildings to ask before applying. Asks friends which places took them. [ASSUMED]
- Watches every dollar: upfront costs are the top hurdle for many renters (IR).

**5. Demographics (last)**
- Phoenix metro or Southern California. [OWNER markets]
- Score often in the 500s (rejected renters averaged ~538, IR / Rentec). [ASSUMED range]
- Has income; Yesdoor verifies it. [spec §7b]
- Housing ads on Meta can't target by age, gender or zip code. This section describes Bree; it is not a targeting list. [Jon Loomer](https://www.jonloomer.com/special-ad-categories-meta-ads/)
- Owner note: most demand skews subprime, like credit repair. [OWNER, spec §7b]

### Messaging blueprint

- **Core message:** You don't have to pay to find out anymore. See who says yes to you, record and all.
- **Winning hooks:** Step 4 hooks, plus "Something on your report may not even be yours. Get the free check."
- **Pains to agitate:** fees kept after a no; the surprise item at application time; no reason given; the move-out clock.
- **Belief to shift:** From "Second chance is a lie, everyone denies me" → To "Some buildings' own rules already fit me. I just need to know which ones before I pay."

---

## Step 7 — Verify

- **Fabrication:** every quote is from a named person in a published article, linked. CFPB numbers are marked SECONDHAND (summaries, PDF not opened). No forum quote invented (Gap 1).
- **Specificity:** Bree is a composite; demographics last.
- **Promises the offer can't back yet:**
  - Never "guaranteed approval" or "no credit check" — there is a check, and the building decides.
  - "Something on your report may not be yours" can open the repair offer; it must not promise removal.
  - "We refund your fee if they say no" is a draft design (spec §16 item 4), not set. Keep out of ads until Chris sets it.
  - Back-end prices are TBD.
- **Open gaps:** Gap 1 (forum quotes). How common lookback periods and DUI policies are (IR: not found). Arizona has no statewide fair-chance rule found (IR).
