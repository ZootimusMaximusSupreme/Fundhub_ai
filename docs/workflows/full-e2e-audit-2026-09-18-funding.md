# Funding lane — Full End-To-End Audit 2026-09-18

**Lane:** FUNDING. This file is this lane’s score only.  
**When:** Fri Sep 18, 2026, ~1:47–1:57 a.m. Arizona. Last night was look-only. This pass clicked Apply once.  
**Tester only.** No product-code fixes. No HTML/CSS/`public/app` edits.

**File:** #8 Sim Eight-Funding `d682c13b-11f3-4bd5-a0c5-232b6a7875c4`  
**Email:** `stanbridgejchris+sim-08@gmail.com`  
**Phone:** `+16616054248` (agent number only)

**Did not:** live credit pull, real card, paper mail, remint #8, ClickFunnels apply, flip outbound, new catalog products, personal prove phone, second Apply click.

Staff password login for `chris@fundhub.ai` was **401** (`invalid_credentials` with `STAFF_INITIAL_PASSWORD`). Owner session was minted from the live database and put on as a cookie. Tokens are not printed.

Live site: https://fundhub.ai  
Health: **200**. Database up. Pending migrations **0**.

Shots: `/tmp/full-e2e-2026-09-18-funding/`

---

## Overall

**FAIL.**

The file opens. The name, email, phone, business, rounds, and banks match what is stored. Staff can see the next job. Apply is live and was clicked **once**. Apply died with a proxy login error. The person row still says this file is not funded while two $25,000 rounds are funded. Prove Gmail is dead. Funding does not place an AI phone call.

This is not a journey PASS. Opening the desk is not the journey.

---

## System map (required before any PASS)

Map: `docs/workflows/system-map-2026-08-26.md`

- **Funding intended:** `docs/journeys/role-funding-advisor-intended.md` — **doors only.** No talk order. No event list. Sequence for “finish Apply” is **UNVERIFIED**.
- **Live fire walked:**
  1. Queue / next action / docs (look + click).
  2. One Apply → `POST /api/proxy/launch` → **422** `oxylabs_auth_failed` (Oxylabs **407**). Did not hammer Apply. No bank page opened. No new bank row written.
  3. Invoice / pay link **look**. Already minted. Did not pay. Did not send a second invoice email.
  4. SMS this file already asked for: Twilio accepted (see SMS). No extra text tonight.
  5. AI call: funding live fire (`src/workflows/f-01` … `f-11`, Apply) does **not** call Bland. Josh (`ai-set-01-josh-setter`) fires on `booking.created`, not Apply. **SKIP** (not-live on this path). A 0.13s call would be FAIL; none was placed tonight.
- **Voice prompts (count only):** AG-04 Setter Josh live, **3750** letters, Bland. AG-09 live, **1846**. DOC-CHECK live, **3275**. No funding-advisor voice agent.

A desk load is not a journey PASS.

---

## File vs stored

| Fact | Stored | Screen | Score |
|---|---|---|---|
| Name | Sim Eight-Funding | Sim Eight-Funding | **PASS** |
| Email | `stanbridgejchris+sim-08@gmail.com` | same | **PASS** |
| Phone | `+16616054248` | `+16616054248` (API / context) | **PASS** |
| Business | Eight-Funding LLC, Gilbert AZ, 56 months | Present: Eight-Funding LLC | **PASS** |
| Person `funded` | **false**, amount empty | Dashboard client `funded: false`. Ops tile **FUNDED 1** / **$50k** | **FAIL** — lie vs two funded rounds |
| Rounds | Round 1 funded $25,000, approved blank. Round 2 funded $25,000, approved $10,000 | Control panel: “Round 1 · funded · approved — · funded $25,000 \| Round 2 · funded · approved $10,000 · funded $25,000.” | **PASS** (rounds vs stored) |
| Banks / apps | Arizona Bank Denied, no URL. Native American Bank Approved **$10,000**, has URL. Six lenders fit | Apply door: “$10,000 confirmed across 1 bank yes.” 6 fit. Arizona: no online application. Native American **10000.00** Approved | **PASS** (look) |
| Next action (live engine) | API: Remove Inquiries (4 inquiries) | Control panel: **Remove Inquiries**. Four names: Capital One EX, Syncb/Paypal EX, Navy Federal CU TU, Citibank NA EQ | **PASS** |
| Stored field `employee_next_action` | still **Collect Documents** | Screen says Remove Inquiries | **FAIL** (stale field) |
| Docs | API **28**. Uploads 15, contracts 2, invoices class 0, UnderwriteIQ class 11 pending / not sent | Documents desk **TOTAL 28**. Same classes | **PASS** (count) |
| Contract | Funding Agreement **signed** 2026-09-17 | Present + portal stage: agreement signed | **PASS** (look) |
| Sample CRS | on file, scores 771 / 778 / 766 | Portal API same scores. Did not Pull | **PASS** (sandbox) |
| Gold HTML pack | last night 0 UnderwriteIQ files; tonight 11 personal-info / snapshot PDFs exist | Portal body: Funding Snapshot **Ready · DOWNLOAD**. Personal info — EQ **Ready** | **PASS** (pack now on portal). Did not open the file bytes this lane |

---

## Queue → next action → docs → Apply

| Step | Result | Evidence |
|---|---|---|
| Queue | **PASS** (look) | Fulfillment API has Sim Eight-Funding. Next chip: Remove Inquiries. List text includes “Sim Eight-Funding / They have credit inquiries…”. URL https://fundhub.ai/app/pipeline.html (Fulfillment). First paint is other sims; the file is further down. Shot `pipeline-fulfillment.png`. |
| Next action | **PASS** on the control panel / **FAIL** vs stored field | Screen + fulfillment API: Remove Inquiries. Stored field still Collect Documents. Shot `ccp8.png`. |
| Docs | **PASS** (count) | Documents **28** = API **28**. ID / proof / bank still on file. 11 UnderwriteIQ files generated, **not sent**. Shot `docs8.png`. |
| Apply click | **FAIL** | One click. `POST /api/proxy/launch` **HTTP 422**. Error **`oxylabs_auth_failed`**. Modal: “Oxylabs rejected the proxy login (**407**). Username is the account id without the customer- prefix.” Browser routing **NOT** active. Bank page **not** opened. Did not click again. Shot `apply-after.png`. |
| Banks notified vs screen vs DB | **FAIL** (Apply) / **PASS** (old rows) | Tonight: **0** new bank notices. Applications table unchanged: Arizona **Denied**, Native American **Approved $10,000**. Screen still shows those two plus four more fit banks with Apply. |

Fulfillment header still says **TOTAL APPROVED — No honest source yet / No bank approval has ever been recorded** while this same file shows **$10,000** approved. That is a lie. Shot `pipeline-fulfillment.png`.

---

## Invoice / pay link (look + no new mint)

| Check | Result | Evidence |
|---|---|---|
| Success-fee invoice | **PASS** (look) | Stored + API: **INV-B4B9C768**, status **sent**, **$2,500.00** due, **$0** paid, source funding success fee. Already emailed 2026-09-17 (`INVOICE-SENT-EMAIL` delivered). Task still open: “Invoice client — confirmed approvals 25000 @ 10% = 2500.00 (send)”. Did **not** mint a second bill. Did **not** email again. Did **not** pay. |
| Pay link | **PASS** (look) | Custom link **$2,500**, status **created**, not paid. Fanbasis checkout URL on portal API. Deposit **$3,000** Card Stacking DFY already succeeded. |
| Finance OS | **PASS** (deposit look) | https://fundhub.ai/app/finance-os.html?client_id=… Name Sim Eight-Funding. Paid so far **$3,000.00**. Shot `finance8.png`. |
| Portal Payments tab | **FAIL** | Account & history → Payments opened. Visible area did not show the **$2,500** bill. Portal API **does** have Due **$2,500**. Header after that click showed **Chris Stanbridge**, not Sim. Shot `portal8-account-pay.png`. |

---

## SMS (only this file’s events)

**PASS** for the funding texts that already ran. Destination **+16616054248** only. Provider **twilio**. Each row has a Twilio id starting `SM…`. Status **delivered**. No **401**. No extra text tonight (Apply failed before a new round event).

| Template | Twilio accepted |
|---|---|
| SMS-ROUND-STARTED-NOTIFY | yes (`SM2fd951…`) |
| SMS-F03-ROUND-SUBMITTED | yes (two rows) |
| SMS-F07-FUNDING-LOCKED | yes |
| SMS-AR-01-FIRST-NOTICE | yes |
| SMS-F02-ID-PORTAL-NEEDED | yes |
| SMS-DOC-01-REQUEST | yes |

Provider “delivered” is noted. The prove this lane needed was Twilio accepted, not a second send.

---

## Email / Gmail

**FAIL.** `src/gmail/` is not ready. `GOOGLE_DRIVE_OAUTH_TOKEN_JSON` is a 20-character mask, not a real token (`invalid_json`). No token file on disk. Did not ask Chris. Stored mail still says the funding emails were delivered to `stanbridgejchris+sim-08@gmail.com` (invoice, round submitted, funding locked, welcome). That is the database, not a Gmail read.

---

## AI outbound CALL to +16616054248

**SKIP / not-live on the funding path.**

Funding workflows do not call `placeCall`. Josh’s one row on this file is `ai-set-01-josh-setter`, status **initiated**, from **booking.created** on Sep 17 — not from Apply tonight. Did not dial a new call. A skip is not a call PASS. System map: an 8-second or 0.13s Bland ring would be FAIL if we had claimed one.

---

## AI doc follow-up

**SKIP.** Would text or email. Open tasks still say “Check this id/proof/ssn by hand — nobody has read it.” Did not accept/reject docs. Tags still include `docs:missing` while 28 files sit on the desk.

---

## Closer context / `said:`

**FAIL.** GET `/api/read/agent-context?client_id=…` **200**. Pack has name, phone, round #2 funded, messages. **No** `said:` line. Two `call_outcomes` rows are deposit with **empty** transcript. No new Meet tonight.

Context also says pipeline stage **Round Submitted** while both rounds are **funded**.

---

## Present

**PASS** (look). Send **SKIP**. URL https://fundhub.ai/app/present.html?contact=d682c13b-11f3-4bd5-a0c5-232b6a7875c4 — Sim Eight-Funding, Funding Strategy Session, Eight-Funding LLC. Did not send pay or contract. Shot `present8.png`.

---

## Password login

**FAIL** (form). **PASS** (inject). POST `/api/auth/login` **401** `invalid_credentials`. Session inject as owner worked. Live CRM opened as Chris Stanbridge · owner.

---

## Score table

| Motion | Score |
|---|---|
| `/api/health` | PASS |
| Owner session inject | PASS |
| Password login `chris@fundhub.ai` | FAIL (401) |
| ClickFunnels apply | SKIP (owner-ok) |
| Live CRS / $32 | SKIP (sample on file) |
| #8 name / email / phone / business | PASS |
| #8 queue | PASS (look) |
| #8 next action (screen vs engine) | PASS |
| #8 next action vs stored field | FAIL (stale Collect Documents) |
| #8 docs vs stored | PASS (28 = 28) |
| #8 rounds vs stored | PASS |
| #8 banks vs stored | PASS (look) |
| #8 Apply click | FAIL — 422 `oxylabs_auth_failed` / Oxylabs 407 |
| Banks notified tonight | FAIL (none; Apply died) |
| Person / ops funded tile vs two $25k rounds | FAIL |
| Fulfillment TOTAL APPROVED vs $10,000 bank yes | FAIL |
| Invoice / pay link look | PASS; new mint SKIP; new email SKIP; pay not done |
| Portal Payments vs $2,500 due | FAIL |
| SMS this file asked for | PASS (Twilio SM ids, agent phone only) |
| Gmail prove | FAIL (token dead) |
| AI call | SKIP / not-live on funding path |
| AI doc follow-up | SKIP |
| Meet → `said:` | FAIL |
| Present look | PASS; send SKIP |
| Funding sequence PASS | UNVERIFIED (intended is doors only) |

**Lane overall: FAIL.** Stop.

---

## Stop

Tester only. No product code changed. No second Apply. No HTML / CSS / public/app change. No remint of #8.
