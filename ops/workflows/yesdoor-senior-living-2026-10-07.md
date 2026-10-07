# Yesdoor senior living — 2026-10-07

Chris picked senior living from the medical niche research (`ops/workflows/medical-niche-research-2026-10-07.md`)
and wants it merged into Yesdoor.

The idea: a free affordability check shows a family which assisted living and memory care communities
they can afford and that will take them. The family pays nothing. The community pays when the
resident moves in. Same shape as Yesdoor apartments (`marketing/offers/yesdoor/README.md`).
Yesdoor MVP is being built on `yesdoor/i1` (PR #55).

The open lane: A Place for Mom exists, but nobody checks first whether the family can actually
afford the place. A 2024 Senate probe found about 40% of its families were placed above their
budget.

Chris said "go" — this session runs lanes 1–3 with research agents, and runs lane 4 itself.

| Lane | What | Owner | Status |
|---|---|---|---|
| 1 | The law: state referral-agency rules, Medicaid limits, Medicaid planning vs practicing law | this session (agent) | done |
| 2 | Market + money check: launch city, communities, fees, competitors, data for the check | this session (agent) | claimed |
| 3 | Yesdoor reuse map (read-only) | this session (agent) | done |
| 4 | Workflow questions to Chris, then the spec | this session | claimed — questions now, spec waits on 1–3 |

## Lane 1 — the law (done)

Research, not legal advice. Every row has its source.

| State | Law | License? | What it requires | Fee rules |
|---|---|---|---|---|
| **AZ** | [A.R.S. §36-446.14](https://www.azleg.gov/ars/36/00446-14.htm), amended by [SB 1477](https://www.azleg.gov/legtext/57leg/2R/laws/0178.htm) (effective 9/12/2026) | None | Disclose any business tie, that the community pays, and the fee (or a good-faith estimate), in the required wording (14-point type if written). The family signs an acknowledgment. **The community may not pay until it has that acknowledgment.** Keep copies 1 year. Background check or adult protective services registry proof. General liability $1M/$3M **and** professional liability $1M/$3M. Fine up to $1,000 per violation | No cap. Family may stop any time; after that, a fee only for a community already named, within 12 months |
| **TX** | [Bus. & Com. Code ch. 121 (SB 1383)](https://capitol.texas.gov/tlodocs/89R/billtext/html/SB01383F.htm), effective 9/1/2025 | None | Written disclosure (services, who pays, right to stop, "list may not include all communities"). No financial interest in communities. **Cannot hold a power of attorney.** Background checks. Liability insurance | Fee must be paid within 3 years of the referral. No fee on transfers within the same community |
| **FL** | [§429.195](https://m.flsenate.gov/Statutes/429.195) | None found | — | Facilities may pay only for **non-Medicaid** residents; anything else is a felony under §817.505 |
| **WA** | [RCW 18.330](https://app.leg.wa.gov/RCW/default.aspx?cite=18.330&full=true) | None | Dated disclosure before referral + signed acknowledgment. Background checks every 24 months. $1M liability insurance. Records 6 years | No cap. **Prorated refund** if the resident dies, is hospitalized or transfers within 30 days. No fee on Medicaid-funded referrals |
| **NV** | NRS ch. 449 ([SB 299](https://www.leg.state.nv.us/Statutes/83rd2025/Stats202510.html)) | **Registration** (state health division) | Written contract with each community; consent; records 3 years; cannot hold a power of attorney | Only three fee shapes allowed |
| **OR** | [ORS 443.370–.376](https://ltcr.oregon.gov/FAQ) | **Registration**, $750 / 2 years | Written disclosure before referral; $1M insurance | Not found |
| **MD** | [Health-Gen. §19-1813](https://health.maryland.gov/ohcq/Pages/Assisted-Living-Referrer.aspx) | **Registration** | Disclose financial ties | — |
| **CO, OK, GA, CA** | CO HB20-1101; OK 63 O.S. §1-866; GA SB 439 (2026, unverified); CA HSC §1569.47 (no license for assisted living; a license is needed for nursing-home referrals) | No | Disclosure / right to stop | OK: fees paid for 36 months max; GA: 24 months |

No specific law found in most other states (MN, IL, NY and others). VA has bills pending.

**Medicaid:** never take a fee on a Medicaid-paid resident. [OIG AO 14-01](https://hallrender.com/2014/03/06/oig-approves-senior-community-referral-arrangement/) was approved only because federal-program residents were left out completely. In Arizona, a fee for an ALTCS (Arizona Medicaid) placement is a **felony** ([A.R.S. §13-3713](https://www.azleg.gov/ars/13/03713.htm)).

**Medicaid planning:** a non-lawyer may screen against published limits, give document checklists, and help file the application. A non-lawyer may **not** advise on spend-down strategy, gifting, retitling or trusts ([Ohio UPL 11-01](https://www.supremecourt.ohio.gov/Boards/UPL/advisory_opinions/UPLAdvOp_11_01.pdf); Florida Supreme Court). Hand those off to elder-law attorneys. **Arizona lets lawyers pay referral fees** (ER 7.2 and 5.4 dropped 1/1/2021, [Clyde & Co](https://www.clydeco.com/en/insights/2021/05/lawyers-risk-management-newsletter-may-2021)); most states don't.

**Credit check consent:** written (e-signed) instruction from the person whose file is pulled ([15 U.S.C. §1681b](https://www.law.cornell.edu/uscode/text/15/1681b)). Senior signs if able; otherwise keep a copy of a financial power of attorney. Yesdoor staff never hold a power of attorney (banned in TX, NV, OK). Agent's own inference, not a found authority: sending credit results to communities could make Yesdoor a consumer reporting agency.

**Enforcement history:** [FTC v. CarePatrol](https://www.ftc.gov/node/46371) (2012, false "we know these facilities" claims); A Place for Mom robocall settlement $6M (2020); Senate Aging probe of A Place for Mom (2024); Cedar Communities v. Caring.com, false "free" ads and steering (ended July 2026).

**Launch states:** (1) Arizona — Yesdoor's home market, clear 2026 law, no license, no cap. (2) Texas — no license, clear rules, big market. (3) Florida — no registration, statute allows private-pay fees, but a Medicaid slip is a felony.

## Lane 2 — market and money check

_pending_

## Lane 3 — Yesdoor reuse map (done)

Read from `origin/yesdoor/i1` (PR #55) and `origin/yesdoor-3m-scale`. Verdicts are design proposals.

**Reuse as-is:** magic-link login and sessions; the match engine's approved / likely / no / unknown logic, rule versioning and stale-rule cap (`match/rules.mjs`, `match/match.mjs`); backups ranking (`yd_matches`); referral proof — registration timestamp and "known prospect" window; invoices (`yd_invoices`); disputes (`yd_disputes`, add a proration kind); e-sign mechanism (`yd_agreements`, HMAC link); events, outbox, crons plumbing; `yd_state_rules` table.

**Change:**
- `yd_renters` is one person. Senior living is a household: the shopper (adult child, siblings), the resident (or a couple), and who holds legal authority (power of attorney).
- `yd_accounts` allows one account per renter. Needs several logins per search, with roles.
- Consent and soft pull (`yd_consents`, `yd_screenings`) need "whose credit" vs "who signed", plus proof of authority.
- `yd_income_checks` is one monthly number. Needs income + assets + VA + long-term-care insurance + home value.
- Community rules replace credit rules: care levels offered, payers accepted, minimum private-pay runway, conditions excluded.
- Listings: price is a stack (base rate + care-level fee + community fee + second-person fee), not one rent.
- Stages: no lease end (month to month); add care assessment, deposit / hold, waitlist, waiting on a house sale.
- Fee refunds: the database only allows a full refund, counted from payment. Washington-style rules need a prorated refund counted from move-in, with reasons (death, hospital).
- Tour time zones only cover AZ / CA / FL; broker licence check only AZ / CA / FL.
- Staff desk: care notes are health data and need their own access tier.
- Public pages: one renter, no care or asset inputs.

**Missing entirely:** care-needs level and nurse assessment; payer mix (private pay, VA, LTC insurance, Medicaid waiver); asset runway and house-sale timing; the household as 2+ people; prorated refund; a family-side disclosure; senior-living software connectors; the licensing basis for senior referral.

**Facts:** migrations 434–437 on `yesdoor/i1` (`main` ends at 433). 27 `yd_` tables. Money is integer cents; NULL means unknown. A public request's org is `YD_ORG_SLUG`, so senior living needs its own org or a line marker on the `yd_` tables.

## Lane 4 — workflow answers (Chris, one at a time)

| # | Question | Answer | Set by |
|---|---|---|---|
| 1 | After the free check, who walks the family to a move-in? | **Online first, advisor after** — the family runs the check and sees matches online; an advisor calls the ones ready to move and books tours (same concierge model as Yesdoor apartments) | Agent default — Chris said "idk" (2026-10-07). Change any time |
