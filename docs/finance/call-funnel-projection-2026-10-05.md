# Book-a-call projection — $2,500 left and the $50K line (2026-10-05)

**For:** Chris. **Asked 2026-10-05:** "Show me what the projected revenue is going to be" for the ad money left and the $50K credit line, based on the call funnel model in the repo.

**Source model:** [`ops/workflows/ads-waterfall-projections-2026-08-26.md`](../../ops/workflows/ads-waterfall-projections-2026-08-26.md) (the band model). Every number below is that model's math with today's inputs swapped in. The math was re-run from the model's band table on 2026-10-05 and matched it to the cent ($427.19 per booked call).

## Today's inputs (owner-said 2026-10-05)

| Input | Value |
|---|---|
| Ad money left | about $2,500 (maybe $3,000) |
| New ad money | $50,000 credit line from a friend, for ads only |
| Cost per booked call | target $30. "Probably around $50." Worst case 25 booked calls on $2,500 = $100 |
| Show rate | "should be pretty high" on the new funnel |
| Goal | scale to about $250,000 a month |

## What one booked call is worth (from the model)

| Number | Value | Where it comes from |
|---|---|---|
| Booked calls that buy something | 31.4% | Model band table. Owner floor is 30%. |
| Cash Fundhub keeps per sale | $1,361 | Offer by score and cash, after financing payouts |
| **Cash this month per booked call** | **$427** | 31.4% × $1,361 |
| Funding clients per 100 booked calls | 4.4 | Only the 750+ with cash lane takes funding in the model |
| Success fee later, per funding client who funds | $7,000 at $100K funded, $12,000 at $150K | 10% minus the $3,000 deposit |

## The projection

Cash = money this month. "After no-pays" takes off the 5% who say yes and never pay (the model's leak knob).

| Budget | Cost per booked call | Booked calls | Sales | Cash this month | After no-pays | Funding clients | Success fees later (all fund at $100K–$150K) |
|---|---|---|---|---|---|---|---|
| $2,500 | $30 | 83 | 26 | **$35,600** | $33,800 | 3.7 | $25,700–$44,100 |
| $2,500 | $50 | 50 | 16 | **$21,400** | $20,300 | 2.2 | $15,400–$26,500 |
| $2,500 | $100 (worst case) | 25 | 8 | **$10,700** | $10,100 | 1.1 | $7,700–$13,200 |
| $3,000 | $30 | 100 | 31 | **$42,700** | $40,600 | 4.4 | $30,900–$52,900 |
| $3,000 | $50 | 60 | 19 | **$25,600** | $24,400 | 2.6 | $18,500–$31,800 |
| $50,000 | $30 | 1,667 | 523 | **$712,000** | $676,400 | 73.5 | $514,700–$882,400 |
| $50,000 | $50 | 1,000 | 314 | **$427,200** | $405,800 | 44.1 | $308,800–$529,400 |
| $50,000 | $100 | 500 | 157 | **$213,600** | $202,900 | 22.1 | $154,400–$264,700 |

Success fees come weeks later, only for clients a bank actually funds. The model does not know the fund rate, so "all fund" is the top of the range.

## Closers limit how fast the money can be spent

- One closer takes about 198 booked calls a month: 10 slots a day, packed at 90% (9 calls), 22 workdays. Source: the model's staffing section.
- 4 closers (1 now plus 3 onboarding) take about **790 booked calls a month**.
- So 4 closers fill up at about **$23,800 of ads a month at $30 a call**, or **$39,600 at $50**.
- At that pace the $50K lasts about 2 months at $30 a call, or about 5 weeks at $50, unless more closers are added.
- Spending the whole $50K in one month at $30 a call would need about 8 closers. At $50 a call, about 5.

## The $250,000-a-month goal

- $250,000 ÷ $427 = about **585 booked calls a month**, about 27 per workday.
- Ad money for that: about **$17,600 a month at $30 a call**, or **$29,300 at $50**.
- Closers for that: about **3 full calendars**.

## What is still a guess

1. **Every close rate is assumed.** The model was built with 0 paid closes. Book-a-call has had 0 bookings since 2026-10-02, because all 4 live ads pointed to /roadmap (checked 2026-10-05, `ops/workflows/business-todos-2026-10-04.md` W4). The first $2,500 measures the real rate.
2. **Chris's 9/30 numbers would cut cash about 20%.** About 50% show and about 50% close means 25% of booked calls buy, against the model's 31.4%. Example: $2,500 at $30 a call drops from $35,600 to about $28,400.
3. **Prices are from August.** The model prices Capital Blueprint at $1,000. It is $5,000 in `src/config/offers.mjs` (owner-set 2026-09-03), and the new menu is $2,500 / $5,000 / $10,000 (`TODO.md`, 2026-10-05). Course payouts in the model are the Commas lender payouts. ClarityPay's payouts replace them.
4. **Rebuild after the first 20 real sales.** Use the real show rate, close rate, offer mix and ClarityPay payouts. Do not tune the guesses before then.

## Financing the deposits for 30 days (owner-set 2026-10-05)

Chris: for the next 30 days, finance the parts that are normally cash — the credit optimization deposit and the funding deposit — so cash moves now. Example: "I only have $1,000" → finance the rest. Only for clients with really good files. Shut it off after 30 days.

What the model says this does (its knob 6, "do the 700–749 people with under $1K put $3,000 down"):

- Cash-poor 700–749 buyers move from Capital Academy (about $4,250 kept) to funding ($3,000 deposit, less ClarityPay's fee). Cash this month drops about $1,250 per switch, about 7% of the total.
- Funding clients go up about 50% (4.4 → 6.8 per 100 booked calls). Each one is a $7,000–$12,000 success fee later.
- Today `src/config/offers.mjs` has financing **off** for the funding deposit (`FUNDING_DFY.financing: false`) and **on** for credit optimization ($1,000) and the $200 starter. Turning it on for the deposit is a code change, and so is the 30-day shut-off.

### ClarityPay and the client's credit file

What ClarityPay says publicly (read 2026-10-05):

- "No hard pull credit pulls prior to commitment." Checking the offer is a soft pull. Source: https://www.claritypay.com/
- "Every loan with ClarityPay is provided by DR Bank, member FDIC." APRs from 0% to 36%. Source: https://www.claritypay.com/faqs
- Not stated anywhere public: whether **accepting** the loan triggers a hard pull, and whether the loan **reports** to the bureaus.

Why it matters: a funding client who finances the deposit gets a new inquiry and a new loan on the file right before the application rounds. Banks count both. Ask the ClarityPay rep before turning on deposit financing for funding clients:

1. Does accepting the loan trigger a hard pull? On which bureau?
2. Does the loan report to the bureaus? Which ones, and how many days after it funds?

## Still open (Chris decides)

- What counts as a "really good file" for financed deposits (a score floor, and anything else).

## Re-run this

The math is the band table in the source model, section 4: cash per booked call = sum over bands of (share of books × close rate × cash kept). Funding clients per booked call = 3/34 × 50%. Closer capacity = closers × 9 × 22.
