# Landing page conversion — why no sales on the $297 SLO offer

Date: 2026-09-28. Numbers pulled live from the production database
(`ad_metrics_daily`, `funnel_page_stats`) — not estimates.

---

## The short answer

Zero sales on $208 of spend is **normal**. The money did not buy enough people.

But two things in the numbers are not normal, and both cost real money:

1. **It costs $70 to show the ad to 1,000 people.** Normal is $10–$40. You are
   paying about double for the same eyeballs.
2. **Eight out of ten people who start the video quit before the quarter mark.**
   Meta's own rule for that: the opening line is the problem, not the ending.

---

## W1 — Meta (DONE)

Campaign `oPur: TOF-SLO: $297`, objective SALES. Ran 2 days: Sept 26–27.

| | |
|---|---|
| Spend | **$207.89** |
| People it was shown to (impressions) | 2,949 |
| Cost per 1,000 shows (CPM) | **$70.49** |
| Clicks (all kinds) | 183 |
| Video plays started | 1,872 |
| Still watching at the quarter mark | 320 — **17%** |
| Sales, leads, sign-ups Meta recorded | **0** |

### Per ad

| Ad | Spend | Shown to | CPM | Clicks | Plays | Still there at 25% |
|---|---|---|---|---|---|---|
| SLO4 | **$110.73** | 736 | **$150** | 42 | 546 | **7%** |
| SLO3 | $45.57 | 1,595 | **$29** | 70 | 876 | 19% |
| SLO1 | $31.84 | 457 | $70 | 67 | 314 | **32%** |
| SLO2 | $19.75 | 161 | $123 | 4 | 136 | 8% |

**SLO4 ate 53% of the budget at the worst price and the worst hold.**
**SLO3 is the cheapest reach. SLO1 holds people best.**

### Older campaign, for contrast
`oSched: VSL: Funding`, PAUSED. Aug 17–20, $86.86, 456 shows, 19 clicks, 0 sales.
Same story, smaller.

---

## W2 — ClickFunnels (DONE — and the data is missing)

**The nightly ClickFunnels sync has not recorded anything since 2026-09-22.**
That is four days *before* the ads started. So there is **no funnel data at all**
covering this spend. Nobody can say how many of the 183 clicks reached the page.

Why it stopped: the nightly job asks the database for active ClickFunnels
accounts using a plain connection. Row-level security hides the row from that
connection, so the job sees **zero accounts** and quietly does nothing. Measured
today: plain connection sees 0 rows, staff connection sees 1 active row.
`src/workflows/clickfunnels-analytics-sweeper.mjs:11`.

Last real numbers, from the manual Sept 22 pull (before any SLO ad ran):

| Page | Views | Conversions |
|---|---|---|
| VSL | 352 | 0 |
| Thank You | 228 | 0 |
| Funding Book Call | 140 | 46 |
| Apply | 127 | 326 |
| **$297 Roadmap Sales** | **27** | **0** |
| **$297 Roadmap Order** | **2** | 0 |
| $297 Roadmap Book | 0 | 0 |
| $297 Roadmap Thank You | 0 | 0 |

NOT A FINDING ABOUT THE ADS — this is all pre-campaign traffic.

---

## W4 — Tracking (PARTIAL)

- Meta connection is live and synced today at 07:02. Token stored, account
  `act_982103620742368`.
- Meta's own count of purchases, leads and sign-ups is **0** for every day.
  So the zero is real on Meta's side, not a reporting hole.
- **Blind spot:** we store `clicks` (all clicks — includes likes, expands and
  video taps) but we do **not** store link clicks or landing page views. So we
  cannot tell from our own data how many of the 183 clicks actually landed on
  the sales page. Pulling those two fields live from Meta was blocked by this
  session's safety classifier (it refused to decrypt the stored ad token).

---

## What the numbers say to do

1. **Turn SLO4 off.** It took half the budget at $150 per 1,000 shows and lost
   93% of viewers before the quarter mark.
2. **Rewrite the first line of SLO4 and SLO2. Keep the body.** Meta's rule:
   people leaving before 25% is an opening problem.
3. **Put the budget on SLO3 (cheapest reach) and SLO1 (best hold).**
4. **$208 is not a verdict.** Budget $1,500–$3,000 before judging the offer.
5. **Price is not the problem.** $297 is locked (`f441f41`) and correct for this
   buyer. Do not re-open it.

## Leftover — not fixed, not asked for

The ClickFunnels nightly sync is a no-op because of the row-level-security
scope. One leftover card, per the hard lock. Not touched.

---

# Campaign structure — what is there vs what it should be (2026-09-28)

Measured from the database, not assumed.

## What the media buyer built

```
Campaign: oPur: TOF-SLO: $297          objective = SALES (purchase)
  └─ Ad set: oPur: TOF-SLO: 25-55M: SBOs: 2.5M   (2.5M people, ACTIVE)
       ├─ oVid: SLO1   ├─ oVid: SLO2
       ├─ oVid: SLO3   └─ oVid: SLO4
```

One campaign. One ad set. Four videos. ~$100/day. Cold audience only.

This is the standard consolidated setup. It is the right shape for a big budget
with a pixel that has already seen hundreds of sales. It is the wrong shape for
a pixel that has seen **zero**.

## The three problems

**1. It asks Meta to find buyers using an example of zero.**
The ad set optimizes for Purchase. Meta needs **50 purchases in 7 days** to stop
guessing. At $297 that is about $15,000 a week in sales. At $100/day it will
never get there, so it guesses forever. That is exactly what "Learning Limited"
means. It is also why the worst ad (SLO4) ate 53% of the budget — with no sales
to learn from, there is nothing to steer by.

**2. Four videos is not enough any more.**
Meta's Andromeda algorithm (fully rolled out July 2025) rewards creative
*volume and variety*. The current bar is **15–20 genuinely different videos a
week**, or 50+ if repurposing. Four is 2024 thinking. And it has to be different
*reasons to buy*, not four ways of saying the same line. This is the most likely
single cause of the $70 CPM.

**3. Every impression is bought ice cold.**
Cold traffic is the most expensive traffic there is. There is no warm-audience
layer, so you pay top price for every single view.

## What it should look like

Three campaigns, not one. Same ~$100/day.

| Campaign | Optimizes for | Structure | Budget |
|---|---|---|---|
| **A. Content bin (cold)** | Engagement, then ThruPlay | 5–12 ad sets, **one video each**, same cold audience, ad-set budget optimization | $5–10/day per ad set |
| **B. Direct response (warm)** | Purchase | One ad set. Audience = anyone who watched 10 sec of a bin video or touched the FB/IG page, 365-day window | The rest |
| **C. Cyclic copies of B** | Initiate Checkout, then View Content / Landing Page View | Duplicate B, change only the event | Small |

**Why A works:** engagement costs about **$0.01** a person. You build a warm
list cheaply, and warm traffic has a far lower CPM than cold. That is the direct
fix for the $70 CPM.

**Why C works:** it is Haynes' fix for Learning Limited. Nobody buys 50 times a
week at $297, but plenty of people will hit checkout or land on the page. Those
cheaper events fire often enough to feed the algorithm real data, and the
purchase campaign gets smarter off the back of it.

**Content bin rule:** one video per ad set, all ad sets in one campaign, same
audience in every ad set. It is a spider web, not a sequence — let Meta pick
who sees what.

## Order of operations

1. **Film more videos.** 15–20 different angles, different reasons to buy. This
   is the number one lever and nothing else matters as much.
2. **Stand up Campaign A** with those videos. Cheap.
3. **Move direct response to the warm audience** once A has run 3–5 days.
4. **Add the cyclic copies** for the cheaper events.
5. **Then** spend $1,500–$3,000 and read the result.

## Not changing

- The $297 price. Locked (`f441f41`). Correct for this buyer.
- Nothing in the live account. This is a recommendation, not an action.
