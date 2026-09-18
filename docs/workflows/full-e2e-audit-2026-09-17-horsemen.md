# Full End-To-End Audit — 2026-09-17 overnight HORSEMEN

**Lane:** HORSEMEN. This file is this lane’s score only.  
**When:** 2026-09-17 night into 2026-09-18 (~10:22–10:26 p.m. Phoenix). Chris said good night. Tester did all clicks.  
**Gate (already answered):** live site, sample / sandbox credit only. No live $32 bureau.  
**This pass:** look + prove + score. **No product fixes.** Opus is separately on gold-pack hole 1. Scored live as it is. Did not wait.

## Laws this night

- **NO SMS. NO EMAIL.** No Send, Present-send, Apply (notifies), Stage-if-it-notifies, slo-checkout POST, send-portal-link, Messaging Send, Enroll, paper mail, real card, live CRS, new Commas products.
- Did not flip `outbound_enabled`. Did not run `verify:e2e` on live DB.
- Send paths are **SKIP** (owner no-send tonight). Never fake PASS.
- Assume paid. Skip ClickFunnels apply (owner-ok). Did not remint. Did not run a second funnel pass on the same contact.
- Staff: password login for `chris@fundhub.ai` was already 401 earlier tonight. This walk minted an owner session from the live database and put the cookie on. Tokens are not printed.
- Agent phone only `+16616054248`. No personal prove phone.
- System map read: `docs/workflows/system-map-2026-08-26.md`. Desk load is not a journey. Intended files for client / funding advisor are **doors only** (no talk order, no event order) → sequence cannot be PASS.

## Files reused (do not remint)

| # | Name | client_id | Role this night |
|---|---|---|---|
| 8 | Sim Eight-Funding | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` | Funding horse |
| 9 | Sim Nine-Repair | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` | Repair horse (full, 6 rounds) |
| 10 | Sim Ten-Trial | `22103bca-0ec9-4491-bb75-5d1b6528f116` | Repair trial (2 rounds) |
| 11 | Sim Eleven-Blueprint | `029964c5-4d8e-47ed-88c9-53ac13863fd4` | Paid pack / portal check |
| 12 | Sim Twelve-Academy | `f01cc0e0-c8f6-4343-93e5-6a33f0d3112f` | Course / Academy horse |
| 13 | Sim Thirteen-NoBook | `7ccbeb76-df98-4125-8c14-0d1c9f5e3042` | Inquiry-like no-book (not a real inquiry case) |

Phone on these files is the agent number `+16616054248` (Ten and Twelve stored as `(661) 605-4248`). Emails are plus-tags `stanbridgejchris+sim-08` through `+sim-13`.

**Combo horse:** **not-present.** None of these six files has both a funding round and a repair program. A wider search for sim / Combo people with both also returned **0**.

## How this was walked

1. Live health GET.
2. Playwright against `https://fundhub.ai` with the owner session cookie (no Allow popup).
3. Human-like clicks on the live site: Pipeline → Fulfillment tab, Specialist **Repair** toggle, Present deck for #8 (look only), portal scroll on #11. **Did not** click Send, Apply, Stage, Enroll, Pull, or Email me a sign-in link.
4. Did **not** run `npm run test:e2e:live`. That suite signs in with the staff password (already 401) and some specs click Send.

Shots (local, not in git): `/tmp/full-e2e-horsemen-2026-09-17/`.

## Gate

| Check | Result | Evidence |
|---|---|---|
| `/api/health` | **PASS** | 200. Database ok. Pending migrations **0**. |
| Owner session on live CRM | **PASS** (inject) | Landed `https://fundhub.ai/app/pipeline.html`. Screen: Chris Stanbridge · owner. Password login **not** re-tried (SKIP / known 401). |
| ClickFunnels apply | **SKIP** | Owner-ok. Not walked. |
| Live CRS / $32 bureau | **SKIP** | Sample credit already on file. Did not press Pull. |
| SMS / email / Send / Apply / Enroll | **SKIP** | Owner no-send. |

---

## Scorecard (live hashed ~2026-09-17 10:26 p.m. Phoenix)

| Path | Result | Evidence |
|---|---|---|
| Funding Horse #8 | **FAIL** (look). Sequence **UNVERIFIED**. Send/Apply **SKIP**. | See §Funding. File opens. Name, email, scores, signed Funding Agreement, and two **funded** rounds match the stored file. Still not a journey PASS: intended funding page is doors only; Apply not clicked; gold pack missing; person row still says not funded while two rounds are funded. |
| Repair Horse #9 | **FAIL** (first paint + next-step lie). After wait, file **looks** right. Sequence **UNVERIFIED**. Stage/Send **SKIP**. | See §Repair. First paint empty. After ~8s, Nine-Repair loads. Signed Credit Repair Agreement. Specialist Repair tab shows full / 6, stuck, **0** letters. Next step on the control panel says “No step applies” while blockers still say start repair. |
| Repair trial #10 | **PASS** (look only). Stage/Send **SKIP**. | Ten-Trial opens. Trial program active, cap 2, stuck in analysis, **0** letters. Signed Credit Repair Agreement. Portal scores 541 / 566 / 552 (different person than #8). |
| Combo Horse | **not-present** | No combo sim in this batch. Do not invent one. |
| Inquiry path | **FAIL** (look). Send **SKIP**. Sequence **UNVERIFIED**. | No dedicated inquiry-only horse. Specialist Inquiries queue **does** show **Sim Eight-Funding** (Equifax + TransUnion, Ready for Review, Send visible — not clicked). #13 is a no-book file, not an inquiry case (next step Get Consent; **0** credit file; **0** inquiry rows). Intended Specialist page **does** have a desk path; Send / paper mail forbidden tonight. |
| Course / Academy #12 | **FAIL** (look). Enroll **SKIP**. Sequence **UNVERIFIED**. | Twelve-Academy opens. Course entitlement is on. Funding Agreement signed. Scores 771 / 778 / 766. Portal **What You Own** says **Nothing to download yet**. Control panel next step “No step applies” with blocker “Strategy session booked.” |
| Fulfillment funding | **SKIP** Apply. **FAIL** on honest numbers. | Fulfillment tab opened. It lists these sims’ next jobs. Banner said **TOTAL APPROVED — No bank approval has ever been recorded** while #8 Round 2 shows approved **$10,000** and funded **$25,000**. Did not click Apply. |
| Fulfillment repair | **SKIP** Stage/Send. **PASS** (look of the desk). | Repair toggle clicked. Queue: Ten-Trial trial — / 2 analysis Stuck; Nine-Repair full — / 6 analysis Stuck; Ready to send **0**. Matches stored programs. |
| AI outbound call | **SKIP** | No-send night. Did not dial. |
| AI doc follow-up | **SKIP** | Would send mail / SMS. |
| FTC / portal / inquiry / repair upload | **PASS** (already on file, look). New upload **SKIP**. | #8/#9/#10 already have ID + proof-of-address (and #8 bank / SSN card) on Documents. Did not upload more. Did not click portal Upload. |
| Meet → `fetchContext` `said:` | **FAIL** | GET agent-context for #8 returned 200. Pack has **no** `said:`. No new Meet tonight. |
| UnderwriteIQ / gold HTML pack | **FAIL** | Live as it is (Opus on hole 1). Documents class UnderwriteIQ = **0** on #8, #9, #12. #11 pack is **PDFs**, not gold HTML. #8 portal: Funding Snapshot entitlement is on, screen says **NOT READY YET**. |
| #11 Metro 2 pack | **FAIL** | Entitlements **2** active (Roadmap + Metro 2). Portal What You Own: Roadmap **DOWNLOAD** ready; **Metro 2 Dispute Letter Pack = NOT READY YET**. |
| `/progress.html` | **FAIL** | `https://fundhub.ai/progress.html?id=029964c5-4d8e-47ed-88c9-53ac13863fd4` bounced to `https://fundhub.ai/portal-login.html?next=%2Fprogress.html` (“Email me a sign-in link”). Did not click that button. Progress **API** 200 with 5 checklist lines. |
| #9 CCP first paint | **FAIL** | ~0.4s: picker empty / “Loading… No client open.” ~8s: Sim Nine-Repair. Same hole as the evening look. |
| Present #8 (look) | **PASS** (look). Send **SKIP**. | `https://fundhub.ai/app/present.html?contact=d682c13b-11f3-4bd5-a0c5-232b6a7875c4` — “SIM EIGHT-FUNDING”, Funding Strategy Session, Eight-Funding LLC. Did not send pay or contract. |
| Contracts already signed | **PASS** (look) | DB + API + portal: #8/#11/#12 Funding Agreement signed; #9/#10 Credit Repair Agreement signed. Dates 2026-09-17. |
| Sample CRS | **PASS** (sandbox) | Credit objects on file for #8–#12. #13 has **0**. Did not live-pull. |
| Live Playwright 100 suite | **SKIP** | Would use password login / Send. Not this no-send night. |

### Dictator checklist (this lane)

| Row | Ran? | Result |
|---|---|---|
| 1 Five horsemen event paths | look only | Funding / Repair / Course walked as far as no-send allows. Combo **not-present**. Inquiry used #8 cases + #13 no-book. Full event fire **SKIP**. Sequence **UNVERIFIED** (intended client + funding files are doors only). |
| 2 Fulfillment + mint + AI CALL + AI doc chase + uploads | partial look | Desk look yes. Apply / mint / call / chase **SKIP**. Uploads already on file. |
| 3 Meet tape → transcriber → `said:` | looked | **FAIL** — no `said:` on #8. |
| 4 Beta every-button | no | Other lane. Not hashed here. |
| 5 On-screen matches file; desk motion finished | yes look | Mixed. Names/scores/agreements match. Funded flag, gold pack, Metro 2, Snapshot, progress page, and “No step applies” do **not**. Apply/Send not finished (SKIP). |
| 6 Offers, contracts, UWIQ, AR, workflows, agents | look | Contracts signed **PASS**. UWIQ gold **FAIL**. #8 success-fee invoice **$2,500** status **sent**, **$0** paid. Voice agents **SKIP**. |
| 7 Incorporation date ask | no | Would be Present send / closer talk. **SKIP**. |
| 8 Agent does all testing | yes | Did not ask Chris. |

---

## Funding #8 — walk

**Cite:** `docs/journeys/role-funding-advisor-intended.md` — doors only. **No event list.** Live fire (system map): queue → next job → docs → Apply → mint invoice. Apply **SKIP**.

**URL:** `https://fundhub.ai/app/client-control-panel.html?id=d682c13b-11f3-4bd5-a0c5-232b6a7875c4`

**On screen:** Sim Eight-Funding · `stanbridgejchris+sim-08@gmail.com`. Next: **Remove Inquiries** (4 inquiries: CAPITAL ONE EX, SYNCB/PAYPAL CREDIT EX, NAVY FEDERAL CU TU, CITIBANK NA EQ). Funding round **Round 2**, status **funded**, approved **$10,000**. Every round: Round 1 funded $25,000; Round 2 funded $25,000. Lenders **6 fit** (Arizona Bank & Trust, Comerica, First National Bank Texas, Native American Bank, TCF Bank, Verify Bank). Apply buttons visible. **Did not click Apply.**

**Matches the file:**
- API funding-rounds: 2 rows, both `funded`, both card stacking, **$25,000** each.
- Lender match: 6 banks fit of 307; scores EX 771 / EQ 778 / TU 766; estimate **$212,000**.
- Portal: Welcome back, Sim. Funding Agreement **Signed**. Pre-qual **$212,000**. Same three scores.
- Documents: **17** files (2 contracts settled, 15 uploads). Funding Agreement signed PDF on file.

**Does not match / still broken:**
- Person row `funded` is **false** and `funded_amount` is empty while two rounds are funded. System map calls that a lie.
- Documents UnderwriteIQ class **0**.
- Portal What You Own: **Funding Snapshot = NOT READY YET** even though entitlement `funding-snapshot` is on.
- Search shows pipeline cards: Funding **Round Submitted**, Inquiry **Specialist Assigned**, Sales **Lost** — not a Funded column.

**Present look:** `https://fundhub.ai/app/present.html?contact=d682c13b-11f3-4bd5-a0c5-232b6a7875c4` — session slide 1/24, name matches.

**Result:** look of the file **mostly true**. Journey **FAIL** / sequence **UNVERIFIED**. Apply **SKIP**.

---

## Repair #9 and trial #10 — walk

**Cite:** `docs/journeys/role-inquiry-remover-intended.md` — **does** have a desk path: Specialist → Inquiries / Repair toggle → queue → open file → Send only when a letter is ready. Live fire (system map): enroll → docs → letters ready → send (paper). Enroll/Stage/Send **SKIP**.

**#9 first paint FAIL**  
URL: `https://fundhub.ai/app/client-control-panel.html?id=be3dcfd7-faae-4001-b97f-9bc30875bbcd`  
~0.4s: “Loading… No client open — pick one below.”  
~8s: Sim Nine-Repair · `stanbridgejchris+sim-09@gmail.com`. Next: **No step applies right now.** 4 inquiries listed. Blockers include signed **Credit Repair Agreement** and “Start the repair program.”

**Specialist Repair (clicked Repair):** `https://fundhub.ai/app/inquiry-remover.html`  
Need me **0**. Ready to send **0**. Stuck **2**. Rows: **Sim Ten-Trial** trial — / 2 analysis Stuck; **Sim Nine-Repair** full — / 6 analysis Stuck. Matches DB (`repair_programs`: Nine full cap 6 active; Ten trial cap 2 active). Letters ready **0**. **Did not** click Send or Stage.

**#9 portal:** `https://fundhub.ai/app/client-portal.html?id=be3dcfd7-faae-4001-b97f-9bc30875bbcd` — Welcome back, Sim. Scores **541 / 566 / 552** (not the 771 file — good, this is a different person).

**#10 CCP:** `https://fundhub.ai/app/client-control-panel.html?id=22103bca-0ec9-4491-bb75-5d1b6528f116` — Sim Ten-Trial. Next: No step applies. 3 inquiries. Pipeline Sales **Showed**.

**Result:** desk path visible. Letters not ready, so Send was not due. First paint still empty. Next-step line on CCP does not match the repair blockers. Sequence cannot be PASS.

---

## Combo — not-present

No file in #8–#13 has both a funding round and a repair program. Search for Combo / sim people with both: **0**. Not scored as FAIL of a missing product path. It is **not-present** this night.

---

## Inquiry path — walk

**Cite:** Specialist intended desk path (same file as repair). Phone inquiry stays on hold. Paper mail forbidden.

**Inquiries side (look, no Send):** `https://fundhub.ai/app/inquiry-remover.html`  
Ready to send **2**. Oldest: **Sim Eight-Funding, Equifax, waiting today**. Rows for Eight-Funding Equifax + TransUnion, status Ready for Review, docs complete, LETTER not due. Send buttons visible. **Did not click Send.**

**#13 no-book (inquiry-like only):** `https://fundhub.ai/app/client-control-panel.html?id=7ccbeb76-df98-4125-8c14-0d1c9f5e3042`  
Sim Thirteen-NoBook. Next: **Get Consent** — no written permission, cannot pull credit. **0** CRS rows. **0** inquiry rows. Pipeline Sales **Survey Complete**. This is a no-book file, not inquiry removal.

**Result:** inquiry desk is live and shows #8. No inquiry-only horse. Send **SKIP**. Sequence **UNVERIFIED**.

---

## Course / Academy #12 — walk

**Cite:** client intended = doors only. Editor story has course as a paid offer. Live fire for enroll / drip **SKIP**.

**CCP:** `https://fundhub.ai/app/client-control-panel.html?id=f01cc0e0-c8f6-4343-93e5-6a33f0d3112f`  
Sim Twelve-Academy · `stanbridgejchris+sim-12@gmail.com`. Next: No step applies. Blocker: Strategy session booked.

**Portal:** `https://fundhub.ai/app/client-portal.html?id=f01cc0e0-c8f6-4343-93e5-6a33f0d3112f`  
Welcome back, Sim. Funding Agreement **Signed**. Pre-qual **$212,000**. Scores 771 / 778 / 766. Checklist shows funding steps (Booked / Diagnostic Paid / later rounds open). **What You Own: Nothing to download yet.** Entitlement on file: `funding-mastery-course` (Funding Mastery course). Documents desk: **2** files (contracts only), UnderwriteIQ **0**, uploads **0**.

**Result:** person and signed agreement match. Course files are not on What You Own. Not a journey PASS.

---

## Portal / progress / agreements (look)

Staff cookie **can** open `/app/client-portal.html?id=…` for these files.

| File | Portal greeting | Agreement on screen | Pack |
|---|---|---|---|
| #8 | Welcome back, Sim. Funding file open. Pre-qual $212,000. | Funding Agreement Signed | Snapshot **NOT READY YET** |
| #9 | Welcome back, Sim. You are all set. | (repair agreement in DB signed; portal body clipped at dispute-sign) | n/a this clip |
| #11 | Welcome back, Sim. Payment in. Pre-qual $212,000. Scores 771/778/766. | Funding Agreement Signed | Roadmap + PDFs **DOWNLOAD**. Metro 2 **NOT READY YET**. |
| #12 | Welcome back, Sim. Pre-qual $212,000. | Funding Agreement Signed | **Nothing to download yet** |

`/progress.html` with staff cookie **bounces** to magic-link. Did not email a link.

---

## Send paths (do not fake PASS)

| Path | Score | Why |
|---|---|---|
| SMS | **SKIP** | Owner no-send |
| Email | **SKIP** | Owner no-send |
| Present send pay/contract | **SKIP** | Looked at Present only |
| Apply (bank / client notify) | **SKIP** | Buttons visible on #8 CCP and lenders |
| Stage repair | **SKIP** | Would notify |
| Enroll | **SKIP** | |
| slo-checkout POST | **SKIP** | Other lane / not horsemen pay |
| send-portal-link | **SKIP** | Button visible on CCP. Not clicked |
| Messaging Send | **SKIP** | |
| Paper mail / PostGrid | **SKIP** | |
| Live CRS Pull | **SKIP** | Pull buttons visible. Not clicked |
| Real card | **SKIP** | |
| ClickFunnels apply | **SKIP** | Owner-ok |
| AI Bland call | **SKIP** | |

---

## System map notes (required before any journey PASS)

- Map: `docs/workflows/system-map-2026-08-26.md`.
- `client-intended.md` and `role-funding-advisor-intended.md`: **doors only**. No talk order. No SMS order. Sequence **UNVERIFIED**. Overall journey **cannot be PASS**.
- `role-inquiry-remover-intended.md`: **has** a desk path. Walked Inquiries + Repair toggle + queue. Did not press Send (SKIP, and letters were not ready on repair).
- Opening CCP / portal / Specialist is **not** the live-fire event list.
- Voice agents not roleplayed (no-send; no talk order in intended anyway).

---

## Tally (this lane only)

| | Count |
|---|---|
| PASS (look) | health; session inject; sample CRS; signed agreements; Present look; #10 trial look; repair desk look; uploads already on file |
| FAIL | #8 funded-flag / gold pack / snapshot not ready; #9 first paint + next-step lie; inquiry not a full horse; #12 nothing to download; Metro 2 not ready; progress bounce; no `said:`; fulfillment “no bank approval” lie |
| SKIP | every send / Apply / Enroll / live CRS / AI call / live Playwright 100 suite / beta |
| not-present | Combo horse |
| UNVERIFIED | full event-order journeys (intended has no event list) |

**Overnight horsemen hash: not a Full End-To-End PASS.** Live files are there and names match. Gold pack, Metro 2, progress page, empty first paint, and funded-vs-person-row still fail. Send paths were not run, on purpose.

## Stop

Tester only. No product code changed. Did not start another hole. Did not wait on Opus hole 1.
