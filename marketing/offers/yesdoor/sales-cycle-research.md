# Yesdoor: selling and onboarding big operators (research 2026-10-07)

## Analogs: pay-only-on-success offers

- **Contingency recruiting** (paid only on hire):
  - Fees 15–25%; Bullhorn 2024 average 18.5% ([pin.com](https://www.pin.com/blog/negotiate-recruiter-fees/)).
  - Supplier onboarding takes 15–28 days at 63% of firms and 29–60 days at 31% (HICX 2021, [stampli](https://www.stampli.com/resources/vendor-onboarding-cycle-time-benchmarks/)).
  - Big buyers cut their agency lists to about 4 ([Robert Walters](https://robertwaltersgroup.com/content/dam/robert-walters/corporate/news-and-pr/files/whitepapers/robert-walters-ireland-implementing-and-maintaining-a-recruitment-psl.pdf)).
  - First agency to submit owns the candidate for 6–12 months; no fee if the company already knew the person ([BountyJobs](https://blog.bountyjobs.com/candidate-ownership-terms-a-must-have-in-any-recruitment-agency-contract_)).
  - Time to sign an enterprise client: not found.
- **A Place for Mom** (free to families; communities pay on move-in):
  - 14,000 of ~30,600 US communities ([SHN](https://seniorhousingnews.com/2024/06/20/us-senator-probes-a-place-for-mom-alleging-deceptive-practices/)). Grew partly by buying OurParents, which added 2,500 facilities ([Wiki](https://en.wikipedia.org/wiki/A_Place_for_Mom)).
  - Fees up to 100% of first month ([SHN](https://seniorhousingnews.com/2017/03/20/ace-contract-process-senior-housing-referral-agencies/)).
  - Credit fights: the same family arrives from two agencies, so communities push "no fee if already a prospect" and leads that expire.
  - Big operators cut back to build their own leads: Five Star's APFM share fell under 5% ([SHN 2017](https://seniorhousingnews.com/2017/11/10/five-star-seeks-momentum-promising-occupancy-trends/)); Brookdale and Sonida are building their own ([SHN 2024](https://seniorhousingnews.com/2024/11/18/how-a-place-for-moms-new-ceo-is-evolving-the-companys-relationships-with-operators/)).
  - US Senate probe in 2024 ([NBC](https://www.nbcnews.com/news/us-news/senate-announces-probe-place-for-mom-referral-service-rcna157282)).
- **Apartment List:** ~85% of revenue from pay-per-lease. AppFolio customers now sign up inside AppFolio with no separate onboarding ([Apartment List](https://www.apartmentlist.com/rental-management/apartment-list-joins-appfolio-stack)).
- **Rent.com (2009):** landlords disputed pay-per-lease bills they couldn't match to their own visitor records ([MFE](https://www.multifamilyexecutive.com/technology/multifamily-operators-grapple-with-lead-to-lease-tracking_o)).
- **Relocation companies** take 25–40% of commission ([Inman](https://inman.com/2007/02/13/relocation-fees-reach-breaking-point-some-agents)).
- **Mortgage:** paying a referral fee tied to a funded loan breaks federal settlement law (RESPA); a flat price per lead is allowed ([Foley](https://www.foley.com/insights/publications/2017/02/the-cfpbs-respa-consent-orders-eight-key-takeaways/)). This matters for the later mortgage expansion.

## Risks these analogs predict (and the system answer)

1. **"That renter was already ours."** → first-touch timestamp, a registration that expires, and a "known renter, no fee" rule. Added to the build spec §5b.
2. **The biggest customers build their own leasing and leave** (APFM/Five Star). → lock in portfolio contracts, and keep renter data and repeat renters on Yesdoor.
3. **Fees shrink when buildings are full.** → the model's fee per lease will swing with occupancy.
4. **Invoices checked line by line against their software.** → integration (visitor record pushed in, lease status pulled back) before billing at scale.
5. **"Free to renters" draws scrutiny.** → plain disclosure of who pays Yesdoor.
6. **Fastest path seen: being inside software the operator already uses** (Apartment List in AppFolio). → add AppFolio's partner stack to the integration list.
