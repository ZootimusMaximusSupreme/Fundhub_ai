# Yesdoor flow (what the database enforces today)

Status: **B2 (database + reads) and B4 (buildings, tours, money).** Written from the migrations and the code, not from the spec. Every arrow below is a rule the database holds in `db/migrations/434_yesdoor_core.sql`, `435_yesdoor_pipeline.sql`, `436_yesdoor_money.sql` or `437_yesdoor_cancel_after_registration.sql`, or a move that code in `src/yesdoor/store/` makes (named in the section). An arrow that only the spec draws, and nothing builds yet, is marked **NOT BUILT YET**.

Spec: `docs/specs/yesdoor-mvp-build-spec.md` (§3 draws these). Board: `ops/workflows/yesdoor-mvp-build-2026-10-07.md`.

Built in B4 (sections 10 to 15): onboarding companies and buildings, agreements and the signing link, the building portal writes (rules, units, spreadsheet and feed import, stage updates), booking and changing a tour, the move-in fee and invoice, payments, refunds, broker payouts, disputes, and the daily job that turns a paid fee safe.

Not built yet (arrives in B3b and F1): the pre-screen and matcher wiring, the sandbox CRS and Plaid calls from the public doors, the re-check, touches and stale-rules crons, the outbox dispatcher, the public lead door, and every screen. A broker sign-up door does not exist, so brokers are added by staff for now.

Deviation from spec §3 (migration 437): a renter who cancels after the building has been registered can now leave from `registered` and `toured`, not only from `booked`. Without that arrow a renter's cancelled tour kept holding one of their 3 open places.

## 1. Who sees what

```mermaid
flowchart LR
    subgraph Logins
      S[Staff: owner, ops, sales, collections]
      R[Renter: emailed link]
      BU[Building user: emailed link]
      BR[Broker: emailed link]
    end
    S -->|desk views: pipeline, companies, buildings, disputes, scoreboard| D1[No credit fields]
    S -->|ledger: ops and collections| D2[Money, integer cents]
    S -->|renter timeline and screening: ops and owner only| C[Full credit file and raw report]
    R --> M[Own status, results, tours. No credit numbers]
    BU --> B[approved / likely / no, income verified, risk tier, max rent. No credit fields]
    BR --> K[Name and stage only, plus own money]
    P[Anyone] --> L[Public listings: signed buildings plus flagged samples]
```

## 2. Signing in (renter, building user, broker)

```mermaid
flowchart TD
    A[POST auth/link with an email] --> L{Rate limit: 3 per address, 15 per source, 15 minutes}
    L -->|over| X[429]
    L -->|ok| W{Who is this address?}
    W -->|active account| I[Link issued]
    W -->|renter with no account| I2[Link issued, account made at verify]
    W -->|suspended account| N[Receipt only, no email]
    W -->|nobody| N2[Receipt only, no email]
    I --> U[Same answer to the caller in every case]
    I2 --> U
    N --> U
    N2 --> U
    I --> E[Email queued in yd_outbox, nothing is sent]
    E --> V[GET or POST auth/verify with the token]
    V -->|first use, inside 15 minutes| T[Session, 30 days, slides on use]
    V -->|forged, expired, spent, suspended since| F[401 invalid_link, always the same]
```

Staff do not use this. Staff sign in with the existing staff login and are checked by role.

## 3. Renter stage (`yd_renters.stage`)

```mermaid
flowchart LR
    lead --> screened --> matched --> booked --> placed --> lifetime
    lead --> inactive
    screened --> inactive
    matched --> inactive
    booked --> inactive
```

**UNVERIFIED:** the database only checks that the stage is one of the seven values, not the order. The code that moves it, as traced in B4: booking a tour sets `booked` (from `lead`, `screened` or `matched`); a move-in sets `placed`; cancelling the last open application sets `matched` again. `lead`, `screened`, `matched`, `lifetime` and `inactive` are B3b's (the pre-screen, the touches cron) and are not built yet.

First touch (`source_kind`, `source_ad_id`, `source_broker_id`, `first_touch_at`) is written once. A trigger refuses any later change. A disagreement is decided on `yd_disputes`, never by editing the renter.

## 4. Application stage (`yd_applications.stage`), enforced

```mermaid
flowchart TD
    B[booked] -->|registration email queued + timestamp| R[registered]
    R -->|building or system marks| T[toured]
    R -->|no-show| N[no_show]
    T --> A[applied]
    A --> AP[approved]
    A --> D[denied]
    AP -->|lease dates + rent| L[lease_signed]
    L -->|move-in confirmed| M[moved_in]
    M -->|invoice issued| I[invoiced]
    I -->|payment logged| P[paid]
    P -->|refund_days pass| S[safe]
    P -->|renter leaves inside refund_days| RF[refunded]
    B --> X[cancelled]
    R -->|renter cancels the tour, added in 437| X
    T -->|renter walks away before applying, added in 437| X
    D -->|backups offered by email, renter books another| RM[(new application)]
```

What the database holds on this path:

- A placement is created at `booked`, only at a building that has signed (see section 7), and only while the renter has fewer than 3 open applications.
- Only the arrows above are allowed (`yd_stage_move_ok`). Skipping a stage, going back, and leaving `no_show`, `denied`, `cancelled`, `safe` or `refunded` are all refused.
- `registered` and everything after it needs the registration timestamp and the queued message together. That timestamp is the proof of referral, and it never changes after it is set.
- `denied` needs a reason. `lease_signed` and later need the lease start, end and rent.
- Every move stamps that stage's own timestamp and writes one `yd_events` row, named `application.<stage>`. The creation writes `application.booked`.
- A building may mark a registration `known_prospect` with evidence, within 3 days of receiving it; that opens an attribution dispute (section 15).
- Who moves each stage (B4): booking makes `booked` then `registered` in one transaction (section 11). The building sets `toured`, `no_show`, `applied`, `approved`, `denied`, `lease_signed`, `moved_in` and `refunded` from its portal (sections 12 and 13). The system moves `moved_in` to `invoiced` when the fee is earned. Staff payment moves `invoiced` to `paid` (section 14). The daily job moves `paid` to `safe`. The renter moves `booked`, `registered` or `toured` to `cancelled`.

"Open" means `booked`, `registered`, `toured`, `applied`, `approved` or `lease_signed`.

## 5. Fee (`yd_fee_ledger.status`), enforced

```mermaid
flowchart LR
    E[earned] -->|invoice attached| I[invoiced] -->|payment logged| P[paid] -->|60 days after paid, building's refund_days| S[safe]
    E --> V[void]
    I --> V
    P -.->|refund: a NEW negative row reverses it in full| R[(refund row)]
```

- Amount is bigint cents, positive for a fee and negative for a refund.
- The amount can be corrected only while `earned`. After that it is frozen. Identity and stamped times never change.
- A refund row must reverse one placement fee on the same application, for exactly its negation, once. The original row is left as it was.
- A fee is `safe` only `refund_days` (the building's, default 60) after `paid_at`.
- One placement fee per application. The idempotency key can never earn the same fee twice.
- A fee can be billed only on its own building's invoice, or its company's.

## 6. Broker money (`yd_broker_ledger.status`), enforced

```mermaid
flowchart LR
    E[earned] --> H[held] --> PA[payable] --> PD[paid]
    E --> V[void]
    H --> V
    PA --> V
    RF[Fee refunded] -->|voids an unpaid share| V
```

- A broker is paid only on a placement that broker first-touched (`yd_applications.broker_id`), never more than the fee.
- `payable` and `paid` wait until the building's fee is `safe`, and until `hold_until` has passed.
- A share already paid out is left alone when the fee is refunded. A `broker.clawback_needed` event is written so a person decides.
- B4 moves: `earned` when the placement fee is earned (a licensed split partner only: a software partner earns nothing); `held` when the building's payment is logged, until paid + the building's refund days; `payable` when the daily job makes the fee safe; `paid` when staff record a payout reference (the broker must be an active partner).

## 7. Who can be matched or booked

```mermaid
flowchart TD
    Q{Building} -->|sample, is_sample = true| OK[Allowed: demo only, nothing is sent]
    Q -->|status signed or live| G{Signed building_fee agreement, its own or its company's?}
    G -->|yes| OK2[Allowed]
    G -->|no| NO[Refused: yd_building_not_signed]
    Q -->|target, pitched, agreement_sent, paused, churned| NO
```

Agreements: `draft` to `sent` to `signed`, or `void` from any of them. Terms are fixed from the moment it is sent. A signed agreement is never edited.

## 8. Building status (`yd_buildings.status`)

```mermaid
flowchart LR
    target --> pitched --> agreement_sent --> signed --> live
    signed --> paused
    live --> paused
    paused --> signed
    paused --> live
    live --> churned
    signed --> churned
    paused --> churned
```

**UNVERIFIED:** the database checks the value is one of the seven, not the order of moves. The code that moves it (B4): sending an agreement sets `agreement_sent`; the signature sets `signed`; three "approved, then denied" in 90 days sets `paused` (section 12); voiding a signed agreement sets `paused`; staff may pause, resume (needs a signed agreement), churn, or move `target` and `pitched` by hand. `signed` and `agreement_sent` are never set by hand. Pausing for stale rules is B3b's cron and is not built yet.

## 9. Money and records kept forever

Nothing in Yesdoor is deleted. `DELETE` and `TRUNCATE` are revoked from the app role on every `yd_` table, and consents, screenings, raw payloads, income checks, matches, rules, agreements, applications, tours, disputes, events, invoices, the fee ledger, the broker ledger and renter refunds also carry the `fundhub_no_delete()` trigger, which stops the table owner too. A finished screening is frozen; a re-check is a new row. Building rules are never edited; a change is a new version.

## 10. Onboarding a building and signing the agreement (B4)

Code: `src/yesdoor/store/supply-writes.mjs`, `agreements.mjs`. Doors: `POST staff/companies`, `POST staff/buildings`, `POST staff/agreement`, `POST webhooks/esign`. Staff roles: ops and sales (the owner always).

```mermaid
flowchart TD
    A[Staff adds a company and a building: details, fee terms, refund days, tour hours, leasing email, connection, flags] --> T[Building: target or pitched]
    T --> D[POST staff/agreement: draft snapshots the fee terms]
    D --> S[Send: a signing link is made and ONE email is queued. Nothing is sent]
    S --> AS[Building agreement_sent. For a company agreement: the company and its buildings still onboarding]
    S --> LK[Staff also get the link back]
    LK --> SG[Signer opens the link and POSTs webhooks/esign with a name]
    SG -->|link forged, expired, wrong secret or unknown id| N[One answer: 404 not_found]
    SG -->|genuine| OK[Agreement signed, signer and time recorded]
    OK --> BS[Building signed. A company signature signs its buildings still onboarding]
    BS --> M[Matchable: renters can now be matched and booked]
    OK -.->|void later| V[Agreement void: its buildings are paused unless another signed agreement covers them]
```

- Sample buildings and companies cannot be sent an agreement.
- Without `YD_LINK_SECRET` (32 characters or more) sending fails closed with a 503 and changes nothing.
- A broker partner agreement is signed the same way; the broker becomes `active` once signed, and (for a split partner) once the licence is verified.
- An application fee nobody told us stays unknown (null), never 0.

## 11. Booking a tour (B4)

Code: `src/yesdoor/store/booking.mjs`. Doors: `POST public/book` (renter token), `POST me/tour` (renter session).

```mermaid
flowchart TD
    R[Renter: token, building, unit, start time] --> V{Renter token live and a renter of this company?}
    V -->|no| U[401, the same for every reason]
    V -->|yes| C{Building signed or a flagged sample, unit active, a match that is not no, fewer than 3 open, none open here, time inside the window and tour hours}
    C -->|any fails| X[Plain 400 or 409, nothing written]
    C -->|all pass| TX[ONE transaction]
    TX --> A1[Application born at booked, with the first-touch broker]
    A1 --> A2[Building registered through its connector: one yd_outbox row, timestamped by the database clock]
    A2 -->|no leasing email| RB[Everything rolls back]
    A2 --> A3[Application moves to registered with the timestamp and message together]
    A3 --> A4[Tour written, renter stage booked, renter confirmation email queued, events]
```

- The renter can reschedule (a new time, same rules) or cancel (tour and placement cancelled, one open place freed, the registration timestamp kept, the building gets a queued notice).
- A building that said no to this renter in the last 90 days is not booked again.

## 12. A building moves a renter along, and a denial after "approved" (B4)

Code: `src/yesdoor/store/placements.mjs`. Door: `POST building/update` (building user, only at their own buildings; anything else is a 404).

```mermaid
flowchart TD
    U[Building sets a stage] --> Y{Allowed arrow, and not already done?}
    Y -->|already done| NC[200 unchanged]
    Y -->|not an arrow| E[409 with a plain sentence]
    Y -->|ok| K{Which stage}
    K -->|toured, no_show| TT[Stamp, and the tour closes as completed or noshow]
    K -->|applied, approved| ST[Stamp]
    K -->|lease_signed| LS[Needs real dates, end after start, rent in whole cents]
    K -->|moved_in| MI[Section 13]
    K -->|denied| DN{Reason given?}
    DN -->|no| E2[400 reason_required]
    DN -->|yes| TX[ONE transaction]
    TX --> M1{Did our match say approved?}
    M1 -->|yes| M2[Building mismatch count plus 1, event building.mismatch]
    M2 --> P{3 mismatches inside 90 days?}
    P -->|yes| PA[Building paused, event staff.rules_review. Rules are NOT changed]
    M2 --> F{Application fee waived?}
    F -->|no and amount known| RF[Renter refund owed row]
    F -->|no and amount unknown| RU[Event renter_refund.amount_unknown, no invented row]
    M1 -->|no, only likely| NM[No count, no refund]
    TX --> BK[Backups: the renter's other approved buildings, best rent fit first, up to 5, email queued]
```

## 13. Moving in earns the fee (B4)

Code: `src/yesdoor/store/fee-ledger.mjs`.

```mermaid
flowchart TD
    MI[Building sets moved_in] --> D{Open attribution dispute?}
    D -->|yes| H[No fee yet: reason dispute_open]
    D -->|no| E{Registration inside 90 days of the lease, and no upheld known-prospect claim?}
    E -->|no| NE[No fee: reason expired or known_prospect, event fee.not_earned]
    E -->|yes| A{Fee amount known and above 0?}
    A -->|no| NA[No fee: reason fee_terms_unknown or zero_fee]
    A -->|yes| FE[Fee earned: percent of the LEASE rent, or the flat amount. Idempotent]
    FE --> IV[Invoice issued, net terms from the building. The fee is invoiced]
    IV --> AP[Application moves to invoiced]
    FE --> BR[First-touch broker, licensed split partner only: share earned]
    H -.->|ops rejects the claim later| FE
```

## 14. Payment, safe, refund, payout (B4)

Code: `src/yesdoor/store/money.mjs`, `src/yesdoor/workflows/yd-fee-safe.mjs`. Doors: `POST staff/payment`, `POST staff/refund`, `POST staff/broker-payout` (ops and collections, the owner always).

```mermaid
flowchart TD
    PY[Staff log a payment: method, reference, when it arrived] --> IP[Invoice paid, fee paid, application paid]
    IP --> BH[Broker share held until paid + the building's refund days]
    IP --> J{Daily job yd-fee-safe, 08:00 UTC}
    J -->|paid at least refund_days ago, never reversed| SF[Fee safe, application safe]
    SF --> BP[Broker share payable]
    BP --> PO[Staff record a payout reference: share paid, active partners only]
    IP -->|renter left inside the window, building or staff report it| RV[A NEW negative row reverses the fee in full, application refunded]
    RV --> BV[Broker's unpaid share void; a paid one raises broker.clawback_needed]
    RV -->|after the window| NO[409 refund_window_closed: the fee is safe]
    RV --> RP[Staff record the refund paid back to the building]
```

- A renter's application fee owed back (section 12) is marked paid through the same payment door.
- The database checks the clock for `safe` and for a broker being payable; the job only asks for moves it allows.

## 15. Disputes (B4)

Code: `src/yesdoor/store/disputes.mjs`. Door: `POST staff/disputes`. Open: ops, sales, collections. Decide: ops and the owner. Due 14 days after it opens. "Upheld" means whoever opened it was right.

```mermaid
flowchart TD
    O[A building files a known-prospect claim, or staff open a dispute] --> OP[Dispute open, due in 14 days]
    OP --> DC{Ops or the owner decides}
    DC -->|attribution or fee: upheld| UP{A fee exists?}
    UP -->|no| NF[No fee will ever be earned for this renter here]
    UP -->|earned or invoiced| VD[Fee, invoice and broker share void]
    UP -->|paid or safe| RV[A negative row reverses it in full]
    DC -->|attribution: rejected| RJ{Moved in with the fee held back?}
    RJ -->|yes| EA[Fee earned now, with its invoice]
    RJ -->|no| KP[Fee kept as it is]
    DC -->|denial| NT[Recorded only]
    DC -->|decided once| FZ[Never re-decided: the same answer is a 200, another is a 409]
```
