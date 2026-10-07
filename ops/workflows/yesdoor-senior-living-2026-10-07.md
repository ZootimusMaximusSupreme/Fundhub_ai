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
| 1 | The law: state referral-agency rules, Medicaid limits, Medicaid planning vs practicing law | this session (agent) | claimed |
| 2 | Market + money check: launch city, communities, fees, competitors, data for the check | this session (agent) | claimed |
| 3 | Yesdoor reuse map (read-only) | this session (agent) | done |
| 4 | Workflow questions to Chris, then the spec | this session | claimed — questions now, spec waits on 1–3 |

## Lane 1 — the law

_pending_

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
