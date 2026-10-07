# Yesdoor avatar 4 — Broker / apartment locator / referral partner

**Made:** 2026-10-07, task M1 (`ops/workflows/yesdoor-mvp-build-2026-10-07.md`).
**Method:** Chris's Avatar Builder SOP, 7 steps (`.claude/workflows/avatar-builder.js`), short form, one file.
**Ground truth:** `marketing/offers/yesdoor/industry-research.md` (**IR**), `docs/specs/yesdoor-mvp-2026-10-07.md` (**spec**), `marketing/offers/yesdoor/scale-3m.md`, `marketing/offers/yesdoor/acq-money-model.md`, plus new web research linked inline.

**Tags:** **[ASSUMED]** our guess · **[OWNER]** Chris set it · **[SECONDHAND]** seen in a search summary or second site, original not opened · **[GAP]** looked, not found · **[RECOMMENDED]** a price in the plan that Chris has not set yet.

---

## Step 1 — Foundation

1. **Service in one line.** Pre-qualify every renter lead with just their name, email and address — credit, background and income — then send them to contracted buildings and get your share, with proof the building can't lose. [OWNER; scale-3m]
2. **Category.** Renter pre-qualification software plus a licensed placement split. [spec §5]
3. **Core problem.** Locators do the work and then lose the fee: the guest card doesn't carry their name, the renter goes direct, the invoice is late, or the building pays slow and claws back. [IR]
4. **Ideal client.** A licensed apartment locator or small brokerage in Arizona, California or Florida with its own renter leads. [OWNER licence states, spec §5]
5. **Before.** Chasing renters for documents. Guessing which second-chance buildings take whom. Calling leasing offices to prove a referral. Waiting 30+ days to get paid, then a clawback.
6. **After.** Every renter pre-qualified in a minute. Every renter registered with the building, timestamped, before the tour. Live status. Paid after the building pays and the 60-day hold clears.
7. **How it works.** Sign up → pick a plan → licence checked (split partners only) → agreement signed → link codes → their renters are tagged → they see stages (no credit details) → paid after the building pays and 60 days pass. [spec §5]
8. **Deliverables.** Prequal + background check per renter, link codes, broker portal with renters and money (earned, building paid, broker paid). [spec §5, §15]
9. **Price.** [RECOMMENDED, Chris decides] $29 per renter; $499/mo office plan; 25% of the placement fee for licensed partners; white-label $10,000 + $499/mo. Free trial on 25 of their own renter leads. [scale-3m; acq-money-model]
10. **Competitors.** ALN Locator ($50 per city a month) and Smart Apartment Data for building data and billing; screening reports (SmartMove $25–$49, RentSpree $39.99–$49.99); joining a big locator firm (Smart City, AptAmigo). [IR; scale-3m]
11. **Differentiator.** Email-only prequal (no one else found doing it) plus automatic, timestamped registration that is the referral proof. [scale-3m; spec §3]
12. **Objections.** "Will Yesdoor steal my renters?" "Why share 75% of the fee?" "Do my renters' details stay mine?" "What if the building says it never saw my client?" [ASSUMED; first two follow from the split and from IR pains]
13. **Best testimonial.** NONE ON FILE.
14. **Common questions.** How fast do I get paid? Who owns the renter? What do I see? Is it legal for me to get a split? [ASSUMED]
15. **Client language.** "guest card," "locator fee," "commission," "invoice," "clawback," "second chance," "split," "move-in," "lease-up." [IR]

## Step 2 — Overview

1. **Core promise.** Pre-qualify every renter in a minute, and never lose a fee to a missing guest card again.
2. **Journey.** Try it free on 25 leads → see who qualifies where → book tours → renter registered with a timestamp → watch status live → get paid.
3. **Outcomes.** More leases per lead. No lost commissions. Faster, clearer pay.
4. **Benefits.** Spend time on renters who can sign. Stop calling offices to prove referrals. Know when the money is coming.
5. **Desires.** "I want to get paid for every renter I place." "I want to stop wasting tours on renters who won't pass." "I want to know which second-chance buildings will actually take my client."
6. **Unique mechanism (named).** **The First-Touch Lock.**
7. **Hidden mechanisms.**
   - The renter is registered with the building by email, timestamped, before any tour, with Yesdoor (and the broker's code) as source. [spec §3, §12]
   - First touch wins, with a dispute step decided within 14 days. [spec §15, §17]
   - Invoice made automatically on confirmed move-in. [spec §17 item 10]
   - Each building's rules are stored, including second-chance rules. [IR "what this means"; spec §16]

## Step 3 — Desire research

**Functional wants**
- Steady leads. Top AptAmigo locators close 15–25 leases a month; a deal takes 5–14 days. [IR / AptAmigo — recruiting claim]
- Fast pay. Smart City pays new agents a 90-day $1,500 draw and 30% up front on move-in. [IR / Ladders]
- A fair split: 50/50 with a brokerage is "really good"; some firms 80/20. [IR / AptAmigo]
- Fees: most common is 100% of a month's rent; full buildings ~50%; some flat ~$1,500. [IR / AptAmigo]

**Emotional needs**
- To be paid for work already done.
- Not to look foolish in front of a client when a building says no. [ASSUMED]

**Pains and frustrations**
- Lost guest cards and late invoices: "missed commissions and lost revenue." [IR / Smart Apartment Data]
- Renters skip the locator's name on the card. [IR / Stake]
- No contract, no pay; new owners don't know old deals; pay only after move-in and cleared rent. [IR / evict.com]
- Slow pay, e.g. 30 days after lease start; 60-day clawbacks. [IR / Treaty Oak, Stake]
- Second-chance buildings each have their own rules. [IR / Houston Case Managers]
- Some locator firms pay agents slowly — one review summary describes commission unpaid for over six months. [SECONDHAND — Glassdoor search summary; page blocked]

**Existing solutions and complaints**
| Solution | Complaint |
|---|---|
| ALN / Smart Apartment Data | Data and billing help, but the locator still proves each referral by hand. [IR] |
| Screening reports | Paid per report; renter must fill out a full form. [scale-3m] |
| Big locator firm | Split with the brokerage; firm's own pay timing. [IR] |
| Going solo | Heavy workload, can't scale. [SECONDHAND — search summary] |

**Client voice (direct quotes, real sources)**
- "missed commissions and lost revenue" — Smart Apartment Data, describing locators' guest-card and invoice problem (vendor voice, not a locator). [IR](https://smartapartmentdata.com/apartment-locating/apartment-data-software)
- "Many renters now discover, evaluate, and select apartments through TikTok, Instagram, and Google before speaking with a property." — Lauren Eurto, Greystar (building side, shows where renters come from). [CREDaily, 2026-07-08](https://www.credaily.com/?p=219786)
- **[GAP 1]** No first-person locator quote captured. Glassdoor and Ladders returned 403; Reddit is blocked from this session. Pull from r/realtors, locator Facebook groups and Glassdoor from a machine that can reach them.

**New desire opportunities**
- "Proof the building can't argue with." Timestamped registration before the tour. Nobody in the research automates it for the locator. [ASSUMED "nobody"; IR found manual proof only]
- "Know before the tour." Email-only prequal saves tours on renters who'd fail. [scale-3m]

## Step 4 — New mechanism

- **Name:** The First-Touch Lock.
- **One line:** Your renter is pre-qualified from an email and registered with the building, timestamped, before the tour — so the fee is yours on record from the first touch.
- **Three parts:**
  1. **Email Prequal** — credit, background, verified income, approved / likely / no per building. [spec §3, §7b]
  2. **Timestamp Registration** — sent to the leasing office before the tour, Yesdoor + your code as source. [spec §3, §12]
  3. **Live Money Board** — earned, building paid, your payout date. [spec §15]
- **Contrarian view:** Locators are taught to chase guest cards and invoices. Yesdoor makes the system do it before the tour.
- **Hook samples (drafts):**
  1. "Stop losing fees to a missing guest card."
  2. "Pre-qualify every renter lead with just an email." (owner hook, scale-3m)
  3. "Know which second-chance buildings take your client — before the tour."

## Step 5 — New information

1. **Locators are a top source for big managers.** Greystar: locator referrals were 6.5% of leases in Dallas / Houston / Austin, converting at 12%. Fogelman: 1.3% of leads but nearly 20% of applications and 15% of move-ins in Texas. [SECONDHAND — CREDaily, 2026-07-08](https://www.credaily.com/?p=219786)
   - Use: "Buildings need you. Get paid like it."
2. **Locators now compete on social.** Smart City has 151,000+ TikTok followers across three markets and nearly 400,000 on Instagram. [same source]
   - Use: their leads come cold from social; prequal sorts them fast.
3. **In Arizona and California, a split needs a licence.** Referring renters for a fee is broker work (A.R.S. 32-2101; Cal. B&P 10131), and paying unlicensed people is barred (A.R.S. 32-2155; B&P 10137). [scale-3m]
   - Use: licensed partners get the split; unlicensed affiliates buy the software tiers. [scale-3m]
4. **Referral split norms.** Agent-to-agent referrals: 25% (range 20–35%). [IR / Follow Up Boss]

## Step 6 — Core Avatar Profile

### Avatar name: **"Guest-Card Gabe"**

**Profile summary.** Gabe is a licensed locator, solo or on a small team, in Phoenix or Southern California. Gabe gets renter leads from social and referrals, many of them with credit or eviction problems. Gabe spends tours on renters who won't pass, and calls leasing offices to prove a referral when the guest card didn't carry his name. He has had a fee arrive 30+ days late, and one clawed back. He doesn't need more leads as much as he needs every lead sorted fast, and every fee locked from the first touch. [composite; not a real person]

### The Core 5

**1. Desires**
- **Core desire:** Get paid, every time, for every renter he places — without fighting for it.
- **Surface desires:** Know who qualifies where before the tour. Proof of referral. Fast pay. A clear status board. Second-chance buildings he can trust.

**2. Experiences**
- **Situational:** Juggling renters across many buildings with different rules (IR). Leads from TikTok and Instagram (CREDaily). Pays for ALN data (IR). [ASSUMED he has all three]
- **With other providers:** Lost a fee to a missing guest card (IR). Paid 30+ days after lease start (IR). A 60-day clawback (IR).

**3. Emotions**
- **Primary:** Feeling cheated out of work already done.
- **Secondary:** Anxiety about pay timing. Fear Yesdoor will cut him out. Pride in finding people a home. [ASSUMED]

**4. Behaviors and habits**
- Uses ALN or Smart Apartment Data. Posts listings and apartment tours on TikTok and Instagram. Texts renters all day. Tracks invoices in a spreadsheet. [IR; CREDaily; spreadsheet ASSUMED]
- Picks who to work with by how fast and reliably they pay. [ASSUMED; IR recruiting pitches lead with pay speed]

**5. Demographics (last)**
- Licensed in Arizona, California or Florida. [OWNER, spec §5]
- Solo or small brokerage. [ASSUMED]
- Volume: median locator volume not found (IR). Top AptAmigo locators claim 15–25 leases a month.

### Messaging blueprint

- **Core message:** Every renter pre-qualified from an email. Every fee locked from the first touch.
- **Winning hooks:** Step 4 hooks, plus "Greystar says locators convert at 12%. Stop losing your fee on the paperwork."
- **Pains to agitate:** missing guest cards; renters going direct; late invoices; clawbacks; wasted tours.
- **Belief to shift:** From "Proving my referral is my job" → To "The system proves it before the tour, and I just watch the money board."

---

## Step 7 — Verify

- **Fabrication:** no locator quote is invented; Gap 1 is open. The Smart Apartment Data and Greystar quotes are labelled as vendor / building voice. Greystar / Fogelman numbers are SECONDHAND.
- **Specificity:** Gabe is a composite; demographics last.
- **Promises the offer can't back yet:**
  - Prices are RECOMMENDED, not set by Chris.
  - "Paid fast" — the broker is paid after the building pays and the 60-day hold clears. Don't promise a day count. [spec §5]
  - "Your renters stay yours" — first touch wins, with disputes (spec §15). Say that, not "always."
  - Split only for licensed partners (scale-3m). Unlicensed partners get software tiers, no split.
- **Open gaps:** Gap 1 (first-person locator voice). Locator fees in California and Florida not fully researched (scale-3m). Median locator volume not found (IR).
