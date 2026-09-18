# Full End-To-End Audit — 2026-09-18 (hashed scorecard)

**When:** Fri Sep 18, 2026, ~1:47–2:02 a.m. Phoenix.  
**Tester only.** No product code changed. No extra SMS. No extra email. No HTML/CSS. No new hunt.

**Gate:** LIVE. Already answered. Credit was **sandbox / sample only.** Nobody pressed Pull. Nobody charged a real card. Files were treated as **already paid.** ClickFunnels apply was **not walked** (owner-ok). Do not score that skip as a product FAIL.

**This pass allowed sends.** Testers clicked Apply once, Stage once, uploaded on the live doors, and let Combo’s welcome texts fire. That still does **not** make the run a PASS.

## Overall verdict

**FAIL.** This was an attempt at Full End-To-End with sends. It is still not a complete Full End-To-End Audit.

All five horses exist now, including Combo. Screens often match the stored name, scores, and files. Staff clicked the real job buttons. Apply died. Stage refused. The document reader has no credit left. Prove Gmail cannot be read. Several screens still lie.

A skip is not a PASS. Meet after a real search is **SKIP**, not FAIL, except where a lane also scored the empty pack **FAIL** — that row stays **UNRESOLVED**. Do not call skip items PASS.

**Sources (only these, plus last night’s hash and holes 1–14):**

- `docs/workflows/full-e2e-audit-2026-09-18-funding.md`
- `docs/workflows/full-e2e-audit-2026-09-18-repair.md`
- `docs/workflows/full-e2e-audit-2026-09-18-blueprint.md`
- `docs/workflows/full-e2e-audit-2026-09-18-combo-inquiry.md`
- `docs/workflows/full-e2e-audit-2026-09-18-csm-ar-beta.md`
- `docs/workflows/full-e2e-audit-2026-09-17.md` (old vs new)
- `docs/workflows/live-prove-2026-09-17-notes.md` (holes 1–14)

---

## Dictator checklist

| Row | Result | One line |
|---|---|---|
| Five horsemen | **FAIL** | Funding / Repair / Combo / Inquiry / Course all exist. None is a journey PASS. Combo is **present** (not missing). Sequence still unverified (client and funding books are doors only). |
| Funding horse #8 | **FAIL** | File matches stored name, rounds, banks. Apply clicked **once** and died. Person row still says not funded. |
| Repair horse #9 | **FAIL** | Uploads landed. Stage clicked **once** and refused unread ID. Next-step line still lies. |
| Combo horse | **FAIL** (present) | New person `567c12ce-…` born tonight. Welcome SMS + email delivered. Funding money never landed. **Do not call Combo not-present.** |
| Inquiry horse #13 | **FAIL** (present) | Real inquiry cases on the desk. Upload door open; file did not land. Consent line lies. |
| Course horse #12 | **FAIL** | Academy tile opens (10 lessons). What You Own still empty. |
| Fulfillment | **FAIL** | Queue looks right. Apply once **FAIL**. Stage once **FAIL**. Portal / repair uploads **PASS**. Job not finished. |
| AI call | **SKIP** / **not-live** on the funding path | Funding fire does not place a phone call. Nobody dialed `+16616054248` tonight. A skip is not a call PASS. |
| AI doc chase | **FAIL** | Reader is on. Vendor said **no credits left (429)**. No chase text. No retake email. |
| FTC upload | **FAIL** + pack **not-present** | Inquiry door shows FTC. Tester set a sim photo. Send never appeared. File count stayed **0**. Repair file has no FTC door. Sim pack has no FTC picture. |
| Meet → `fetchContext` | **UNRESOLVED** | CSM: **SKIP** after a real search (0 spoken words anywhere). Funding + Combo: **FAIL** (pack has no `said:`). Same empty pack. Different score. Not PASS. |
| Beta every-button | desks **PASS** (open) / send buttons **SKIP** | Owner/ops pages loaded. Send / Pause / Email invoices / Save not clicked. A skip is not a button PASS. |

---

## Merged path table

Deduped from the five lanes. If two lanes disagree, both quotes sit here as **UNRESOLVED**.

| Path | Result | Evidence |
|---|---|---|
| `/api/health` | **PASS** | 200. Database up. Pending migrations **0**. All five lanes. |
| Owner session on live CRM | **PASS** (inject) | Cookie from the live database. Password login still **FAIL** (401). |
| Password login `chris@fundhub.ai` | **FAIL** | POST `/api/auth/login` **401** `invalid_credentials`. Same as hole 6. |
| ClickFunnels apply | **SKIP** | Owner-ok. Not walked. |
| Live CRS / $32 bureau | **SKIP** | Sample credit on file. Did not press Pull. |
| Extra SMS | **PASS** (none extra) | Combo: welcome SMS + welcome email + repair welcome email only. Funding: no new text tonight. Inquiry: no new send. Repair: reader died before a chase. |
| Funding Horse #8 | **FAIL**. Apply clicked. Sequence **UNVERIFIED**. | Name, email, phone, business, two $25k funded rounds, 6 banks match. Person `funded` still false. Intended funding page is doors only. |
| #8 queue | **PASS** (look) | Fulfillment list has Sim Eight-Funding. Next chip: Remove Inquiries. |
| #8 next action (screen vs engine) | **PASS** | Screen and fulfillment API both say Remove Inquiries (4 inquiries). |
| #8 next action vs stored field | **FAIL** | Stored `employee_next_action` still Collect Documents. Screen does not. Hole 12. |
| #8 docs vs stored | **PASS** | Documents **28** = API **28**. 11 UnderwriteIQ files on file (not sent). |
| #8 rounds / lenders vs stored | **PASS** | Round 1 funded $25,000. Round 2 funded $25,000, approved $10,000. Six banks fit. |
| #8 Apply click | **FAIL** | One click. `POST /api/proxy/launch` **422** `oxylabs_auth_failed`. Oxylabs **407**. Bank page not opened. Did not click again. |
| Banks notified tonight | **FAIL** | **0** new bank notices. Old rows unchanged (Arizona Denied, Native American Approved $10,000). |
| Person / ops funded tile vs two funded rounds | **FAIL** | Person `funded` false. Ops **FUNDED 1** / **$50k**. Fulfillment **TOTAL APPROVED** still says no bank approval while Round 2 shows **$10,000**. Hole 8. |
| Repair Horse #9 | **FAIL**. Stage clicked. Sequence **FAIL** / **UNVERIFIED**. | Name matches. Full / 6, stuck, **0** letters. Uploads landed. Stage refused unread ID. |
| #9 next step / ID unread | **FAIL** | Control panel: **No step applies right now.** Blockers still list unread ID / proof. Hole 7. Combo showed the same lie. |
| #9 queue (Specialist Repair) | **PASS** (look) **FAIL** (header lie) | Nine-Repair full / 6 Stuck. Header: “Nothing needs you — every file is waiting on a bureau.” Tiles: waiting **0**, **Stuck 2**. Hole 14. |
| #9 Stage (once) | **FAIL** | Clicked once. HTTP 200, `identity_not_verified`. Honest refuse. Job still not finished. |
| #9 letters | **FAIL** | Stored **0**. Screen **0**. Send still off. |
| Portal ID / proof / repair upload | **PASS** | #9: good ID, good proof, blurry ID, bureau letter all **Sent (200)**. |
| Simulated letter send | **not-live** | Specialist Send always posts paper mail. No simulate-send button. Not pressed. |
| Combo Horse | **FAIL** (present) | Live survey 200. id `567c12ce-…`. Welcome SMS Twilio `SM99bb42fb…`. Welcome email Resend delivered. Repair enrolled. **0** funding rounds. Pay link **$3,000** still created / inbox pending. Documents **0**. |
| Inquiry Horse #13 | **FAIL** (present) | Specialist Inquiries: three Sim Thirteen-NoBook rows (EX 2 / EQ 1 / TU 1). Sample scores 771 / 778 / 766. Not the old empty no-book-only path. |
| Inquiry upload / FTC | door **PASS** / file **FAIL** / FTC png **not-present** | Portal has Inquiry documents + FTC box. Send 1 file never appeared. Documents API still **0**. Pack has no FTC picture. |
| #13 consent lie | **FAIL** | Blocker still says no written permission while sample scores already show. |
| #13 no-book chase | **FAIL** | `S-nobook` still never sent. |
| Course / Academy #12 | **FAIL** | Client portal greets Sim. Capital Academy unlocked, 10 modules. What You Own: **Nothing to download yet.** Hole 11. |
| Fulfillment funding desk | **FAIL** on honest numbers. Apply **FAIL**. | List shows the sims. Banner / totals do not match #8. Apply died. |
| Fulfillment repair desk | Queue **PASS**. Stage **FAIL**. | Repair toggle matches stored programs. Stage cannot finish. |
| AI outbound call | **SKIP** / **not-live** | Funding workflows do not call Bland. No new dial tonight. |
| AI doc follow-up | **FAIL** | DOC-CHECK woke on #9 uploads. Vendor **429 — no credits remaining**. No SMS-DOC-02. No retake email. |
| FTC / portal / inquiry / repair upload | portal + repair **PASS**; inquiry/FTC **FAIL** | See rows above. Not one PASS. |
| Meet → `fetchContext` `said:` | **UNRESOLVED** | CSM searched live DB, reads, `src/`, `scripts/`, `docs/`: **0** transcripts, **0** `said:`. **SKIP**. Funding + Combo: agent-context **200**, **no** `said:` → **FAIL**. |
| UnderwriteIQ / gold HTML pack | **PASS** gold HTML on #11 and #8 files now exist / contract HTML still **FAIL** | #11: 4 gold HTML pages (~1.8 MB each), bytes fetched. #8: 11 UnderwriteIQ files; portal Funding Snapshot **Ready · DOWNLOAD**. Contract HTML still **PLACEHOLDER. THIS IS NOT THE REAL AGREEMENT TEXT.** Hole 1 not fully closed. |
| #11 Metro 2 pack | **FAIL** | Entitlements **2** active. Portal: Metro 2 **NOT READY YET**. Hole 2. |
| #11 portal as client | **PASS** | Chip Sim Eleven-Blueprint · client. Greeting **Welcome back, Sim**. Pack list + DOWNLOAD mint **200**. Blueprint Open + module 1 clicked. |
| #11 staff portal `?client_id=` greeting | **FAIL** | Address stayed `?client_id=`. Pack is Eleven’s. Greeting still **Welcome back, Chris**. Tonight did not use `?id=`. Hole 13 still (staff greets Chris). |
| `/progress.html` #11 | **PASS** | Staff `?client_id=` and client sign-in both open. Five checklist lines. **No** “Email me a sign-in link.” Hole 4 closed on this walk. |
| `/progress.html` #12 | **PASS** (opens) / **FAIL** (no checklist) | Page opens. Copy: “Your checklist has not been set up yet.” Stored waypoints **0**. |
| Present #8 / Combo (look) | **PASS** (look). Send **SKIP**. | Names match. Did not send pay or contract. |
| Invoice / pay link #8 | **PASS** (look). New mint **SKIP**. Pay not done. | **INV-B4B9C768** sent, **$2,500** due, **$0** paid. Custom pay link created. |
| Portal Payments tab #8 (staff) | **FAIL** | Only Card Stacking DFY **$3,000** succeeded. No **$2,500**. Portal API **does** have the bill. Funding + CSM agree. Hole 9. |
| Finance OS / Ops AR #8 | **PASS** (look) | Paid so far **$3,000**. Billed **$2,500**. Ops AR unpaid **$7,500**. Did not pay. Did not email. |
| CSM form login | **FAIL** | Demo off. `csm@fundhub.ai` **missing**. Elena Brooks row exists; form **401** (no known password). Owner can open the queue. Hole 3 still. |
| `/app/csm-queue.html` as owner | **PASS** (look) | Queue **200**, **7** calls. Eight owes **$2,500**. |
| CSM Claim once | **PASS** (sticks) | One click on #11 halfway task. Assignee = owner after reload. Chip still says **Claimed by a teammate**. Not scored as its own FAIL row. |
| GET `/api/public/slo-checkout` | **PASS** | 200. **$297**. Next `/slo/pull.html`. |
| `/slo/` · `/slo/pay.html` · `/slo/pull.html` | **PASS** (look) | Price **$297**. Did not click pay. Did not submit Build My Pack. |
| `POST /api/public/slo-checkout` once | **PASS** (mint, unpaid) | New plus-tag Sim SloEighteen. Keep title Consulting Services Assessment. **Did not pay.** |
| Gmail prove (`src/gmail/`) | **FAIL** | Token in env is not real JSON. Inbox was not opened. Database still says some mail was delivered. That is not a Gmail read. Funding, Repair, Combo agree. |
| SMS this file asked for (funding + Combo welcome) | **PASS** (Twilio accepted) | Agent phone `+16616054248` only. Funding older templates have `SM…` ids. Combo welcome `SM99bb42fb…`. No **401**. Provider “delivered” is noted; Gmail read still FAIL. |
| GET `/api/auth/login` (demo off) | **PASS** | Demo enabled **false**. Login page has no demo button row. |
| Ops Admin / Agent Editor / other ops desks | **PASS** (open) / send **SKIP** | Pages loaded as owner. Send / Pause / Email unsent / Save not clicked. |
| Blueprint separate `/blueprint` desk | **SKIP** | No live `/blueprint` URL. Live surface is the portal tile. |
| Intended talk / event order | **UNVERIFIED** | Client and funding intended files are doors only. Specialist intended has a desk path (walked; Send not due). Combo also scored intended vs actual route lists **FAIL**. |
| Live Playwright 100 suite | **SKIP** | Not this hash. |

---

## FAIL list (unique only)

Skips are not in this list. Combo is **present**, not missing. Meet is **UNRESOLVED**, not FAIL.

### Already on holes 1–14

From `docs/workflows/live-prove-2026-09-17-notes.md`. Still FAIL tonight.

1. **Hole 1 (half open).** Gold HTML pack is now on #8 and #11. Contract HTML is still placeholder text.
2. **Hole 2.** #11 owns Metro 2. Portal still says not built.
3. **Hole 3.** A real CSM still cannot do the job from the live form (`csm@fundhub.ai` missing; Elena 401).
4. **Hole 6.** `chris@fundhub.ai` password login still 401.
5. **Hole 7.** #9 (and Combo) say “No step applies” while unread-ID jobs are still open.
6. **Hole 8.** Funded numbers lie vs two funded $25k rounds.
7. **Hole 9.** Staff portal Payments tab still hides the $2,500 bill.
8. **Hole 11.** Course #12 What You Own is still empty.
9. **Hole 12.** #8 stored next-action still says Collect Documents.
10. **Hole 13.** Staff portal still greets Chris, not Sim (tonight on `?client_id=`).
11. **Hole 14.** Specialist header still says every file is waiting on a bureau while Stuck is 2.

**Closed or not re-failed tonight (do not recard):**

- **Hole 4.** `/progress.html` opened for #11 (staff and client). No magic-link bounce.
- **Hole 5.** Repair did not score empty first paint FAIL this pass.
- **Hole 10.** Inquiry is now a real horse on the desk (#13 with cases). Path still FAIL for other reasons below.

### NEW from this send pass

Titles only. Not paste cards.

1. Apply dies — proxy login failed (Oxylabs 407)
2. Prove Gmail cannot be read (token dead)
3. Document reader out of credit (429) — no chase text
4. Inquiry upload door open, file did not land
5. Consent line says no permission while scores already show
6. No-book chase never sent
7. Combo funding pay still pending — no round
8. Combo has 0 documents and no address
9. Intended vs actual route lists do not match
10. #12 progress page has no checklist

**Count:** already-carded still FAIL **11**. NEW **10**. Hole 4 / 5 / 10 not on the still-FAIL list.

---

## What got better vs 2026-09-17

Last night was look-only / no-send. Tonight sends were allowed. These things moved:

- **Gold HTML pack is real.** #11 four analysis pages are HTML (~1.8 MB each), not tiny PDFs. #8 has 11 UnderwriteIQ files. Portal Funding Snapshot says Ready.
- **Combo exists.** New plus-tag Sim Combo-20260918. Last night Combo was missing.
- **Welcome SMS and email fired** on Combo (Twilio + Resend delivered).
- **`/progress.html` opens.** Last night it bounced to “email me a link.” Tonight #11 staff and client see the five-line checklist.
- **Apply was clicked once.** Last night SKIP.
- **Stage was clicked once.** Last night SKIP.
- **Uploads were sent** on Repair (ID, proof, blurry ID, bureau letter).
- **Inquiry is a full horse** on the Specialist desk (#13 with cases and sample credit).
- **Portal opened as the client** (Sim greeting). Capital Blueprint Open + module 1. DOWNLOAD mint 200.
- **SLO checkout minted unpaid** (keep title Consulting Services Assessment). Did not pay.
- **CSM Claim clicked once** and stuck in the database.
- **Elena Brooks real CSM row exists** (form login still 401).
- **Funding SMS from earlier events** still show Twilio ids to the agent phone. No extra blast tonight.

Still not a journey PASS. Apply died. Stage refused. Reader has no credit. Gmail unread. Same lies on funded totals, Payments tab, Metro 2, course pack, next-step line, and staff Chris greeting.

---

## Files used (do not remint)

| # | Name | client_id |
|---|---|---|
| 8 | Sim Eight-Funding | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` |
| 9 | Sim Nine-Repair | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` |
| 11 | Sim Eleven-Blueprint | `029964c5-4d8e-47ed-88c9-53ac13863fd4` |
| 12 | Sim Twelve-Academy | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` |
| 13 | Sim Thirteen-NoBook | `7ccbeb76-df98-4125-8c14-0d1c9f5e3042` |
| — | Sim Combo-20260918 | `567c12ce-64de-4043-aa98-d842434bd267` |
| — | Sim SloEighteen (unpaid SLO mint) | `0dd8892c-6f1c-4fd5-84e4-4dc1b992b3d0` |

Phone on these files: agent number `+16616054248`. Emails are plus-tags.

---

## Stop

Tester only. No product code changed. No extra SMS. No extra email. No second hole. No HTML / CSS / public/app change.

---

## PASS freeze (regression gate)

Frozen from the merged path table above. **SKIP / FAIL / UNRESOLVED are not frozen.** Mixed rows: only the PASS slice is frozen. Count: **26**.

Gate: `.cursor/rules/named-fix-regression-gate.mdc`. After a named fix, a **different tester** than the fixer proves that hole live (click twice), then re-checks **only this list**. If any old PASS is now FAIL, the fix is **DIRTY**. Stop. Do not start the next hole. Do not fix the new break in the same chat. Write it on the board as a new hole.

Full e2e is **not** the per-hole gate. Full e2e only after these money-path holes prove: **15 Apply/Oxylabs**, **16 ID reader**, **9 portal Payments $2,500**, **3 real CSM login**, **2 Metro 2 built**.

1. `/api/health` — 200. Database up. Pending migrations 0.
2. Owner session on live CRM (cookie inject).
3. Extra SMS — none extra (only what that file asked for).
4. #8 queue look — Sim Eight-Funding on the fulfillment list. Next chip: Remove Inquiries.
5. #8 next action (screen vs engine) — both say Remove Inquiries.
6. #8 docs vs stored — Documents 28 = API 28. 11 UnderwriteIQ files on file.
7. #8 rounds / lenders vs stored — Round 1 funded $25,000. Round 2 funded $25,000, approved $10,000. Six banks fit.
8. Portal ID / proof / repair upload — #9 good ID, good proof, blurry ID, bureau letter all Sent (200).
9. #9 Specialist Repair queue look — Nine-Repair full / 6 Stuck on the tiles. (Header lie is **not** frozen.)
10. Fulfillment repair queue look — Repair toggle matches stored programs. (Stage is **not** frozen.)
11. Inquiry upload door open. (File land / FTC is **not** frozen.)
12. Gold HTML pack exists on #11 and #8. (Contract HTML placeholder is **not** frozen.)
13. #11 portal as client — chip Sim Eleven-Blueprint · client. Greeting Welcome back, Sim. DOWNLOAD mint 200. Blueprint Open + module 1 clicked.
14. `/progress.html` #11 — staff `?client_id=` and client sign-in both open. Five checklist lines. No “Email me a sign-in link.”
15. `/progress.html` #12 opens. (Empty checklist is **not** frozen.)
16. Present #8 / Combo look — names match. (Send is **not** frozen.)
17. Invoice / pay link #8 look — INV-B4B9C768 sent, $2,500 due, $0 paid. (New mint / pay is **not** frozen.)
18. Finance OS / Ops AR #8 look — paid so far $3,000. Billed $2,500. Ops AR unpaid $7,500.
19. `/app/csm-queue.html` as owner look — queue 200, 7 calls. Eight owes $2,500.
20. CSM Claim once — sticks. Assignee = owner after reload.
21. GET `/api/public/slo-checkout` — 200. $297. Next `/slo/pull.html`.
22. `/slo/` · `/slo/pay.html` · `/slo/pull.html` look — price $297. (Pay / Build My Pack is **not** frozen.)
23. POST `/api/public/slo-checkout` once — unpaid mint. Keep title Consulting Services Assessment.
24. SMS this file asked for — Twilio accepted to +16616054248. Combo welcome SM99bb42fb. No 401.
25. GET `/api/auth/login` — demo enabled false. Login page has no demo button row.
26. Ops Admin / Agent Editor / other ops desks open as owner. (Send / Pause / Email invoices / Save is **not** frozen.)
