# Yesdoor to-do (master list, 2026-10-07)

Owner-set: goal is **$10M a month in 1 year**; 2 years is acceptable. Move fast. **All profit goes back into the company.**

What $10M a month takes (Scale Engine model): ~4,750 leases a month, ~1,400–2,800 large complexes, roughly $1M a month in ads. To hit it in 12 months, portfolio deals have to land by about month 3–6. The research says a test turns into a full portfolio in weeks to 5 months; getting the first test is the slow part.

Tags: **[Chris]** only Chris can do it · **[Agents]** Claude agents do it · **[Hire]** a person to hire.

## Week 1 — set up the company and start the long waits

- [ ] [Chris] Buy yesdoor.ai and yesdoor.co.
- [ ] [Chris] Create accounts: a new Supabase project, a new Netlify site, a new GitHub repo (for the split later), and a Twilio number + email sending domain for Yesdoor.
- [ ] [Chris] CRS: confirm the screening product on your account, the API docs, the per-pull price and the background-check price. Get Yesdoor API keys.
- [ ] [Chris] Plaid: new Yesdoor account or reuse Fundhub's.
- [ ] [Chris] Insurance quotes: $1M/$2M general liability (with additional-insured wording), errors-and-omissions, cyber.
- [ ] [Agents] SOC 2 plan: pick an auditor/tool, write the policies, start the Type II observation window. It takes 10–18 months, so this is the longest wait.
- [ ] [Agents] Security packet: standard questionnaire answers, a data processing agreement, a California privacy (CCPA) clause, a one-line "we never share one operator's data with another."
- [ ] [Agents] Written policies: fair housing, no steering, how criminal records are used per state, how screening data flows, what buildings see.
- [ ] [Chris + lawyers] Building fee agreement and broker partner agreement (templates; agents draft, lawyers check).
- [ ] [Chris] ALN Apartment Data subscription for Phoenix + LA + San Diego ($50 per city a month).

## Weeks 1–3 — build the MVP (running now)

- [x] [Agents] B1: detailed build spec (`docs/specs/yesdoor-mvp-build-spec.md`).
- [ ] [Agents] B2: database + read pages (running).
- [ ] [Agents] B3a: matcher + sandbox credit/bank/e-sign/building connections (running).
- [ ] [Agents] B3b: pre-screen endpoints + re-check, lifetime and stale-rules crons.
- [ ] [Agents] B4: building onboarding, tours, registration emails, invoices, fee ledger, broker ledger, disputes, scoreboard.
- [ ] [Agents] F1: Zillow-style site, Arizona sample listings, pre-screen funnel, tour booking, renter/building/broker/staff logins.
- [ ] [Agents] Swap sandboxes for live CRS, Plaid, email and text once Chris's keys are in.
- [ ] [Chris] Say "ship it" to merge and go live.

## Weeks 2–4 — sales machine

- [ ] [Hire] 5 closers on commission (suggested: 10% of an account's fees for its first 12 months). 2 on top-tier managers in AZ/SoCal, 3 on regional companies.
- [ ] [Chris] Investor buys the courses: Josh Braun B2B Growth Guide ($197), NAA Certified Apartment Supplier ($650–$810), Winning by Design (~$1,500/rep).
- [ ] [Agents] Target list from ALN + NMHC: every manager and building in Phoenix, LA and San Diego, ranked by tier (big fish first).
- [ ] [Chris] LinkedIn coffees: regional property managers / regional VPs at Greystar Phoenix and 2–3 others. Ask what leaves units empty, how often they catch fake pay stubs, and how locator paperwork works.
- [ ] [Agents] Credentialing: register on NetVendor (Greystar) and RealPage Vendor Credentialing as soon as insurance is in.
- [ ] [Agents] Pilot pitch kit: a renter-demand report per target, a one-page fee fit to the owner's budget, and the pilot terms (10 buildings, free, pay on lease).

## Weeks 2–6 — marketing machine

- [x] [Agents] M1: four customer profiles (`marketing/avatars/yesdoor/`).
- [ ] [Chris] Review the four profiles.
- [ ] [Agents] Offers on ACQ for each profile (base: `acq-money-model.md`).
- [ ] [Agents] Copy the Fundhub marketing machine for Yesdoor (plan first, then build).
- [ ] [Agents] Ad scripts for both lanes (Verified, Second Chance) plus partner ads; Chris films.
- [ ] [Chris] Ad budget for the Phoenix renter test (1–2 weeks).
- [ ] [Agents] Run the test; measure cost per lead, lead → lease, and back-end buy rate on the scoreboard.

## Months 2–6 — first pilots and portfolio wins

- [ ] [Closers] Sign the first pilots (tests of 5–10 buildings).
- [ ] [Agents] Connect each pilot's software: RealPage Registered Vendor and Entrata first (1–2 months with a shared client). Yardi needs 2 years and 3 clients, or a client sponsor.
- [ ] [Closers + Chris] Turn pilots into portfolio deals (weeks to 5 months per the data).
- [ ] [Hire] Ops person: building onboarding, collections, disputes.
- [ ] [Agents] Weekly gametape review of closer calls; scoreboard every Monday.

## Months 6–12 — scale to $10M

- [ ] Add Florida after its fees and rents are researched.
- [ ] Add AppFolio's partner stack (Apartment List signs landlords inside AppFolio).
- [ ] Partner program live: brokers, software tiers, licensed splits.
- [ ] Back-end offers live: denial breakdown, repair, lawyers, buyers guide.
- [ ] Lease-end repeat-renter engine running.
- [ ] Reinvest all profit into closers, ads and integrations.

## Later

- [ ] Commercial rentals.
- [ ] Other countries.
- [ ] Mortgages (note: a referral fee tied to a funded loan breaks federal RESPA rules; a flat per-lead price is allowed).
