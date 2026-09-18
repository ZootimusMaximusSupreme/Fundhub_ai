# Full End-To-End Audit — 2026-09-18 Combo + Inquiry

**Lane:** Combo + Inquiry. This file is this lane’s score only.  
**When:** 2026-09-18 ~1:52–2:02 a.m. Phoenix. Tester did the clicks. Chris said do better. Did not ask.  
**Gate:** live site. Sample credit only. No live bureau. No real card. Assume paid.  
**This pass:** walk + prove + score. **No product fixes. No HTML/CSS.**

Map read first: `docs/workflows/system-map-2026-08-26.md`. Desk load is not a journey. A 0.13s call is not talk.

## Files

| Horse | Name | client_id | Email | Phone |
|---|---|---|---|---|
| Combo (new) | Sim Combo-20260918 | `567c12ce-64de-4043-aa98-d842434bd267` | `stanbridgejchris+sim-combo-20260918@gmail.com` | `+16616054248` |
| Inquiry (reuse) | Sim Thirteen-NoBook | `7ccbeb76-df98-4125-8c14-0d1c9f5e3042` | `stanbridgejchris+sim-13@gmail.com` | `+16616054248` |

Did **not** remint #8 / #9 / #11. Did **not** copy Eight-Funding as this Combo person. Did **not** walk ClickFunnels apply.

**Why a new Combo person:** last night Combo was **not-present**. Live search tonight still had **zero** people with both a funding round and a repair program. Minted one plus-tag into the CRM through live `POST /api/public/survey-submit` (homepage door, not ClickFunnels).

**Why #13 for Inquiry:** notes named Thirteen-NoBook as the inquiry-like file. Last night it had **0** credit and **0** inquiry cases. Tonight we reused that same id and put sample credit on it with `scripts/sim/push-credit.mjs --profile fundable` so the inquiry desk had a real horse.

Shots: `docs/workflows/full-e2e-audit-2026-09-18-combo-inquiry-evidence/shots/`.

## Cite (required before PASS)

| Book | What it is | Tonight |
|---|---|---|
| `docs/journeys/client-intended.md` | **Doors only.** No talk order. No SMS order. | Sequence **UNVERIFIED**. Overall Combo cannot be PASS. |
| `docs/journeys/role-inquiry-remover-intended.md` | **Has a desk path:** Specialist → Inquiries / Repair toggle → queue → Send only when ready. Phone inquiry on hold. | Desk path walked. Did not press Send. Paper mail not-live tonight. |
| Live fire | System map §1 Client + Closer + Funding + §4 Repair + Specialist inquiry | Walked what fired. Did not invent missing steps. |

**Intended vs actual (FAIL findings, not silent fixes):**

- Client intended lists a small set of doors. `client-actual.md` lets a client reach more groups (affiliates, chat, climate, public, push, more read routes). That mismatch is a **FAIL**.
- Specialist intended lists fewer reach / block groups than `role-inquiry-remover-actual.md` (actual: **163 of 243** routes). That mismatch is a **FAIL**.
- Homepage JS still asks “Any negatives?” Live survey accepted `cf_svy_has_negatives` and sent Combo to **DOWNSELL**. The server question map in `src/survey/cf-question-map.mjs` does not list that question. Gap is a **FAIL** finding. Did not edit either file.

---

## Combo scorecard

Event list actually walked (live fire, this file only):

1. `entry.captured` → file born  
2. `survey.submitted` → Sales **Decision Rendered**  
3. S-00 welcome email + SMS  
4. Sample credit (`analysis.completed` + `decision.rendered`)  
5. `repair.enrolled` → `repair.docs.needed`  
6. Mint funding pay link (create, not send)  
7. Simulated $3,000 receipt (no card)  
8. Present / CCP / portal / Specialist Repair / Fulfillment look  

| Path | Result | Evidence |
|---|---|---|
| File born on CRM | **PASS** | Live survey 200. id `567c12ce-…`. Qualification **DOWNSELL**. Business **Combo 18 Holdings**. Two sample companies: Combo 18 One LLC (60 mo) + Combo 18 Two LLC (36 mo). |
| Welcome email | **PASS** | `EMAIL-S00-WELCOME` **delivered** via Resend to the plus-tag. Id `01a0b3ba-14df-7606-8ce2-4e78fac42d51`. |
| Welcome SMS | **PASS** | `SMS-S00-WELCOME` **delivered** via Twilio to `+16616054248`. Sid `SM99bb42fb01395ff473612e9251caeb47`. |
| Extra SMS | **PASS** | Only those two S-00 messages plus repair welcome **email**. No extra text. Pay link was **created**, not sent. |
| Sample credit | **PASS** (sandbox) | `push-credit --profile fundable`. EX **771** / EQ **778** / TU **766**. Estimate **$212,000**. Stamped simulated. Did not press Pull. |
| Repair enroll (assume paid) | **PASS** (row + email) | Live `POST /api/repair/enroll` full / cap **6** / paid **$1000**. `repair.enrolled` + `repair.docs.needed`. `EMAIL-REPAIR-WELCOME` **delivered**. |
| Funding assume-paid | **FAIL** | Pay link `pl_bd696468da1b9126a2afc9cc` **$3000** stay **created**. Inbox row `sim-pay-1789721627413` still **pending**, attempts **0**. No `deposit.paid`. **0** funding rounds. |
| Present | **PASS** (look) | `present.html?contact=` shows **SIM COMBO-20260918** and Combo 18 One LLC. Shot `02-combo-present.png`. Did not send pay or contract. |
| CCP name / scores | **PASS** (name) / **FAIL** (honesty) | Name + plus-tag match. 4 inquiries listed. Next line: **No step applies right now** while inquiries sit on the page, repair is awaiting docs, and consent is missing. Shot `01-combo-ccp.png`. |
| Specialist Repair | **PASS** (name on desk) | Repair tab: **Sim Combo-20260918** full — / 6, **awaiting documents**, red **no address on file**. Shot `06-specialist-repair.png`. Ready to send **0**. Did not Send. |
| Portal | **PASS** (name + scores) | Welcome back, Sim. Scores 771 / 778 / 766. Pre-qual **$212,000**. Dispute-letter sign box is up (not signed). Shot `03-combo-portal.png`. |
| Documents | **FAIL** | Documents desk **0**. UnderwriteIQ class **0**. |
| Meet / `said:` | **FAIL** | Agent-context 200. Pack has **no** `said:`. No new Meet. |
| Intended event order | **UNVERIFIED** | Client intended is doors only. |
| **Combo overall** | **FAIL** | Horse **exists** tonight (not not-present). Funding money never landed. Next-step line lies. No address / no letters. Sequence cannot be PASS. |

## Inquiry scorecard

Event list actually walked on #13:

1. Reused the no-book file (already had `entry.captured` + `survey.submitted` + old S-00).  
2. Sample credit (`analysis.completed` + `decision.rendered`).  
3. Created 3 inquiry cases (EX / EQ / TU) and generated items from the sample file.  
4. Specialist Inquiries desk look.  
5. Portal inquiry door look. Tried FTC / inquiry upload. **Did not** press Send / Enroll / bureau mail.

| Path | Result | Evidence |
|---|---|---|
| Reuse #13 | **PASS** | Same id `7ccbeb76-…`. Did not mint a second inquiry person. |
| Sample credit | **PASS** (sandbox) | Same fundable sample. Scores 771 / 778 / 766 on CCP + portal. Did not live-pull. |
| Inquiry cases on desk | **PASS** (look) | Specialist Inquiries: Three **Sim Thirteen-NoBook** rows, today, Experian **2** / Equifax **1** / TransUnion **1**, Ready for Review, chasing ID + proof + signed auth. Shot `05-specialist-inq.png`. Send visible. **Did not click Send.** |
| CCP next step | **PASS** | **Remove Inquiries** + the same 4 inquiry names. Shot `08-t13-ccp.png`. |
| Consent lie | **FAIL** | Blocker still says **No written permission** / cannot pull, while sample scores already show. |
| FTC pack on disk | **not-present** | `docs/workflows/sim-documents/MATRIX.md` says FTC / police report are not in the pack. Folders 08–12 have no FTC file. |
| Inquiry upload door | **PASS** (door) / **FAIL** (file did not land) | Portal has **Inquiry documents** with **FTC identity theft report**. “Upload inquiry docs” is there. Tester set a sim photo. **Send 1 file** never appeared. Documents API still **0**. Shots `09-t13-portal.png` · `12-t13-upload.png`. |
| One event-path SMS/email | **PASS** (no extra) | After credit + cases, #13 still has only yesterday’s S-00 email + SMS. No new text. Inquiry create/generate did not spray. |
| No-book chase | **FAIL** | Original #13 path is survey-done / never booked. `S-nobook` still never sent. |
| Paper mail / Enroll | **SKIP** | Forbidden tonight. Cases stay Queued. |
| Gmail anywhere | **FAIL** (could not read) | Laptop Gmail token is a 20-character mask. Inbox was not opened. Combo emails are still **delivered** in the database (Resend ids above). |
| Twilio | **PASS** (old #13 + new Combo) | Combo welcome Sid `SM99bb42fb…`. #13 welcome from 2026-09-17 still **delivered**. No new #13 SMS this hour. |
| Intended desk path | **PASS** (look) / Send **SKIP** | Inquiries toggle on first. Repair toggle works. Send not due for mail. |
| Intended vs actual routes | **FAIL** | Specialist intended vs actual route lists do not match. |
| **Inquiry overall** | **FAIL** | Better than last night: this is a real inquiry horse on the desk. Still not a journey PASS. Upload did not land. Consent line lies. No-book chase still dead. Sequence not PASS. |

## Dictator rows this lane owns

| Row | Ran? | Result |
|---|---|---|
| Combo horse | yes | Present as its own person. **FAIL** overall. |
| Inquiry horse | yes | #13 on the inquiry desk with cases. **FAIL** overall. |
| Extra SMS | counted | Combo: welcome SMS + welcome email + repair welcome email only. Inquiry: no new send. |
| FTC / inquiry upload | tried | Door **PASS**. File **FAIL**. FTC png **not-present** in sim-documents. |
| AI call / bureau phone | no | Phone inquiry stays on hold. Did not dial. |
| Paper mail | no | **SKIP**. |
| Meet `said:` | looked | **FAIL** on Combo pack. |

## What we did not do

No live CRS. No real card. No PostGrid. No new Commas catalog product. No personal prove phone. No `verify:e2e` on live. Did not flip `outbound_enabled`. Did not remint #8/#9/#11. Did not click Send on inquiry letters. Did not click Apply.

## Tally

| | Count |
|---|---|
| PASS | Combo born; S-00 email+SMS; sample credit both files; repair enroll row+email; Present look; Combo on Repair desk; #13 cases on Inquiries desk; no extra SMS |
| FAIL | Funding receipt stuck pending; Combo “No step applies”; Combo no address / 0 docs; consent lie on both; inquiry upload did not land; no-book chase; Gmail unread; intended vs actual route drift; no `said:` |
| SKIP | Inquiry Send / paper mail / live Pull / Apply / Enroll mail |
| not-present | FTC png in sim-documents |
| UNVERIFIED | Full talk / event-order PASS (client intended is doors only) |

**Lane hash: FAIL.** Combo is no longer missing. Inquiry is a full horse on the desk. Neither journey is PASS.

## Stop

Tester only. No product code changed. No HTML / CSS / `public/app` change. Did not start another hole.
