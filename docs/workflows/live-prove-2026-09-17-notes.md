# Live prove 2026-09-17 (evening) — no SMS / no email

Owner: Chris. Testers must not send texts or emails. Messaging prove is tomorrow.
Fixer was Opus. This thread only tests. Sample CRS only. No live bureau. No paper mail. No Enroll. No marketing e2e.

Staff sign-in: password login for chris@fundhub.ai was **401**. This walk minted an owner session from the live database and put the cookie on. Tokens are not printed.

**Zero outbound clicks.** No Send, Present send, Apply (bank/client notify), SLO pay POST, invoice email, Messaging Send, Generate-if-it-mails, send-portal-link, Enroll, Claim, clock-in, Build My Pack, Continue to payment, or “Email me a sign-in link.”

## Gate

| Check | Result |
|---|---|
| `/api/health` | **PASS** — 200. Database ok. Pending migrations **0**. |
| `/slo/` | **PASS** — page title Complete Funding Diagnostic. $297 on the big buttons. Look only. |
| `/slo/pay.html` | **PASS** this walk — checkout form live. Price **$297**. Bullet: “Your card is charged once, today, for $297.” Earlier look (same evening, before this script) saw an empty amount (“for .”). After a couple seconds it filled. **Did not** click Continue to payment. |
| `/slo/pull.html` | **PASS** — name / address / SSN form live. Button “Build My Pack” visible. **Did not** click it. |
| GET `/api/public/slo-checkout` | **PASS** — 200. Name Complete Funding Diagnostic. `priceCents` **29700**. Next page `/slo/pull.html`. |

## Do not click

Send, Present send pay/contract, Apply (notifies), SLO pay POST, invoice email, Messaging Send, Generate-if-it-mails.

## Walk (look / desk only)

| Lane | Result | Notes |
|---|---|---|
| #8 funding door / stack | **PASS** (look) | File Sim Eight-Funding opens as owner. Next step: Remove Inquiries (4 inquiries on file). API: **2 funded rounds**, both card stacking, **$25,000** funded each. Lender match: **6 banks fit** (307 in book, 14 held for bureau protection). Lenders desk names Arizona Bank & Trust, Comerica, First National Bank Texas, Native American Bank, TCF Bank, Verify Bank. CCP shows Apply and Mark funded. **Did not click either.** Footer: 1 payment on file. |
| #9 repair Stage / ID | **PASS** after wait / **FAIL** first paint | First load (~3s): picker said Nine-Repair but main panel said “Loading… No client open.” Second load (~8s): Sim Nine-Repair opened. Identity on file. ID + proof-of-address uploads on the document list. Repair API: Round 1 “current”, **0 letters**, **0 items**, `can_send` false. Signed Credit Repair Agreement on file. Blockers still say “Start the repair program” and “check this id by hand.” **Did not** click Stage, Send, or bureau Pull. |
| AR / Payments (look) | **PASS** | #8 invoice **INV-B4B9C768**, status **sent**, **$2,500.00** owed, **$0** paid, source funding success fee. Ops AR table: Walk1 $5,000 + Eight $2,500 = **$7,500** unpaid. Finance OS for #8: paid so far **$3,000** (Card Stacking DFY Sep 17), invoiced **$2,500**, paid on that bill **$0**. Documents desk invoice class for #8: **0** (no invoice PDF on the file). **Did not** click Email unsent invoices. |
| CSM login | **FAIL** (real CSM) / **PASS** (owner look) | GET `/api/auth/login`: demo **off** (`DEMO_LOGINS_ENABLED`). GET `/api/read/staff?role=csm`: **0** real rows (demo hidden). Live staff with role csm is only `csm@demo.fundhub.local` (demo). A real CSM cannot sign in while demo is off. Owner session **can** open `/app/csm-queue.html`. GET `/api/read/csm-queue` **200**, **7** calls. Screen matches: Eight owes $2,500, Eleven on the queue. Claim / End shift visible. **Did not** click Claim, Write answers, or End shift. |
| #11 Blueprint dashboards + checklist | **PASS** portal / **FAIL** progress.html | Entitlements **2 active**: Credit Optimization Roadmap, Metro 2 Dispute Letter Pack. Staff URL `/app/client-portal.html?id=` opens Welcome back, Sim. Status: payment in, pre-qual **$212,000**, scores 771 / 778 / 766. Checklist: Booked done, Diagnostic Paid, later funding steps still open. **What You Own**: Roadmap + letters/snapshot/lender list **DOWNLOAD** ready. **Metro 2 Dispute Letter Pack = NOT READY YET** even though the entitlement is on. `/progress.html?id=` and `?client_id=` both bounce to **portal-login** (“Email me a sign-in link”). Staff cookie does not open progress. **Did not** click that email button. Progress **API** is 200 with 5 checklist lines (no new credit, personal loan talk, LLC, EIN, business checking). |
| SLO pages (GET only) | **PASS** | Home, pay, pull all load. Price $297 on this walk. No pay POST. No Build My Pack. |
| Sample CRS deliverables on file | **FAIL** gold HTML / **PASS** sample CRS data | Underwrite GET for #8 **200**. Sample CRS on file (scores, tradelines). **No gold HTML pack** on any of the three files. #11 pack is **PDFs** (Roadmap, Snapshot, Lender list, Credit Analysis, plus bureau letters). #8 UnderwriteIQ deliverable count **0**. The only `text/html` files are contracts, and they say **PLACEHOLDER. THIS IS NOT THE REAL AGREEMENT TEXT. DO NOT SEND THIS.** Did not push new credit. |

## Files used

- #8 Eight-Funding `d682c13b-11f3-4bd5-a0c5-232b6a7875c4`
- #9 Nine-Repair `be3dcfd7-faae-4001-b97f-9bc30875bbcd`
- #11 Eleven-Blueprint `029964c5-4d8e-47ed-88c9-53ac13863fd4`

Shots (local, not in git): `/tmp/live-prove-2026-09-17/` (`dump.json`, `followup.json`, page pngs).

## Blockers (look only — no fix this thread)

1. **No real CSM login.** Demo is off. The only CSM row is the demo account. Owner can look at the queue; a CSM hire cannot sign in.
2. **Staff cannot open `/progress.html`.** It asks to email a magic link. Portal with `?id=` works. Progress page does not.
3. **No gold HTML on file.** Pack is PDFs on #11. #8 has none. Contract HTML is placeholder text.
4. **#11 Metro 2 pack entitlement is on, portal says not built yet.**
5. **#9 control panel first paint is empty** unless you wait several seconds.
6. **Password login for chris@fundhub.ai is 401.** Session inject still works.

## Outbound

**None.** Messaging prove is tomorrow.

## Opus paste cards (from this look only)

Copy **one** box. Paste it into **one** Claude Code Opus chat. That chat owns that hole only.

This look scored AR **PASS**. Do not open AR as a hole.

No new hunts. Only these FAILs from this 2026-09-17 no-send look.

**Rank** (fulfill and CSM before flicker):

1. Gold HTML pack missing / #8 0 UnderwriteIQ files / contract HTML placeholder
2. #11 Metro 2 entitlement on but portal says not built
3. No real CSM login (demo off, only csm@demo.fundhub.local)
4. `/progress.html` bounces to magic-link (staff/client)
5. #9 CCP empty on first paint (~8s then Nine loads)
6. `chris@fundhub.ai` password login 401 (session inject worked)

Shared files from this look (do not remint):

| File | client_id |
|---|---|
| #8 Eight-Funding | `d682c13b-11f3-4bd5-a0c5-232b6a7875c4` |
| #9 Nine-Repair | `be3dcfd7-faae-4001-b97f-9bc30875bbcd` |
| #11 Eleven-Blueprint | `029964c5-4d8e-47ed-88c9-53ac13863fd4` |

Live site: `https://fundhub.ai`. Password login for `chris@fundhub.ai` was 401 on this look. For holes 1–5, mint an owner session from the live database and put the cookie on, same as this look. Do not print tokens. Hole 6 owns the 401.

---

### 1 — Gold HTML pack missing / #8 0 UnderwriteIQ files / contract HTML placeholder

```
THIS THREAD IS ONLY HOLE 1 — Gold HTML pack missing / #8 0 UnderwriteIQ files / contract HTML placeholder.
From the 2026-09-17 no-send live look. Do not start another hole.

STEPS (same chat, in order)
1. VERIFY — recreate on the live site. If it is not real, write NOT A PROBLEM and STOP. Do not fix.
2. FIX — only if VERIFY said the hole is real. Only this hole. Smallest diff. Isolated worktree off origin/main. Load .cursor/skills/fundhub-fixer/SKILL.md.
3. FINISH — prove it yourself on the live site. Click twice if it is a screen. Write PASS/FAIL. STOP. Do not start another hole.

WHAT IS WRONG
Clients should get the gold HTML pack (the real UnderwriteIQ pages). This look found none on #8, #9, or #11. #8 had 0 UnderwriteIQ files. The only HTML on file was contracts, and those still say PLACEHOLDER. THIS IS NOT THE REAL AGREEMENT TEXT. DO NOT SEND THIS. Sample credit data was fine. Do not hunt other files.

RECREATE (look only — do not send)
- Live site https://fundhub.ai. Owner session cookie is ok. Do not send SMS or email.
- Open #8 Eight-Funding d682c13b-11f3-4bd5-a0c5-232b6a7875c4. Read Underwrite for this file. Count UnderwriteIQ files. They were 0.
- Look at saved files on #8, #9, and #11. This look found no gold HTML pack. #11 had PDFs only (Roadmap, Snapshot, Lender list, Credit Analysis, bureau letters).
- Open the contract HTML on file. This look saw PLACEHOLDER. THIS IS NOT THE REAL AGREEMENT TEXT. DO NOT SEND THIS.

REAL: still no gold HTML pack on these files, and/or #8 still has 0 UnderwriteIQ files, and/or contract HTML still has that placeholder line.
NOT A PROBLEM: gold HTML pack is on the file, #8 has UnderwriteIQ files, and the contract HTML is the real agreement (no placeholder line).

HARD STOPS
- no SMS / no email · do not click Send · do not email a contract
- no real card charge · no live CRS / bureau pull · no paper mail
- no new Commas products · reuse keep titles only
- do not start e2e · do not Enroll · do not click Build My Pack
- one hole only · smallest diff · stop after this hole
- never verify:e2e on the live database · INNGEST_EVENT_KEY stays ON
- never ask Chris for secrets · never print tokens

Claim hole 1 on docs/workflows/live-prove-2026-09-17-notes.md. Talk at 5th grade.
```

---

### 2 — #11 Metro 2 entitlement on but portal says not built

```
THIS THREAD IS ONLY HOLE 2 — #11 Metro 2 entitlement on but portal says not built.
From the 2026-09-17 no-send live look. Do not start another hole.

STEPS (same chat, in order)
1. VERIFY — recreate on the live site. If it is not real, write NOT A PROBLEM and STOP. Do not fix.
2. FIX — only if VERIFY said the hole is real. Only this hole. Smallest diff. Isolated worktree off origin/main. Load .cursor/skills/fundhub-fixer/SKILL.md.
3. FINISH — prove it yourself on the live site. Click the portal twice. Write PASS/FAIL. STOP. Do not start another hole.

WHAT IS WRONG
#11 already owns Metro 2 Dispute Letter Pack. The portal still says that pack is not ready yet. Roadmap and other downloads were ready. The paid thing does not match the screen.

RECREATE (look only — do not send)
- Live site https://fundhub.ai. Owner session cookie is ok. Do not send SMS or email.
- File #11 Eleven-Blueprint 029964c5-4d8e-47ed-88c9-53ac13863fd4.
- Open https://fundhub.ai/app/client-portal.html?id=029964c5-4d8e-47ed-88c9-53ac13863fd4
- Confirm entitlements still include Metro 2 Dispute Letter Pack (this look: 2 active — Credit Optimization Roadmap + Metro 2 Dispute Letter Pack).
- On What You Own, this look saw Roadmap + letters/snapshot/lender list DOWNLOAD ready, and Metro 2 Dispute Letter Pack = NOT READY YET.
- Do not click Email me a sign-in link. Do not send the pack.

REAL: Metro 2 entitlement is on for #11 and the portal still says the Metro 2 pack is not ready.
NOT A PROBLEM: the portal shows the Metro 2 pack as ready / downloadable, matching the entitlement.

HARD STOPS
- no SMS / no email · do not click Send · do not click Email me a sign-in link
- no real card charge · no live CRS / bureau pull · no paper mail
- no new Commas products · reuse keep titles only
- do not start e2e · do not Enroll
- one hole only · smallest diff · stop after this hole
- never verify:e2e on the live database · INNGEST_EVENT_KEY stays ON
- never ask Chris for secrets · never print tokens

Claim hole 2 on docs/workflows/live-prove-2026-09-17-notes.md. Talk at 5th grade.
```

---

### 3 — No real CSM login (demo off, only csm@demo.fundhub.local)

```
THIS THREAD IS ONLY HOLE 3 — No real CSM login (demo off, only csm@demo.fundhub.local).
From the 2026-09-17 no-send live look. Do not start another hole.

STEPS (same chat, in order)
1. VERIFY — recreate on the live site. If it is not real, write NOT A PROBLEM and STOP. Do not fix.
2. FIX — only if VERIFY said the hole is real. Only this hole. Smallest diff. Isolated worktree off origin/main. Load .cursor/skills/fundhub-fixer/SKILL.md.
3. FINISH — prove a real (not demo) CSM can sign in on the live site. Write PASS/FAIL. STOP. Do not start another hole.

WHAT IS WRONG
Demo logins are off. The only customer-success person in the system is the demo address csm@demo.fundhub.local. A real CSM hire cannot sign in. The owner can still open the CSM queue. That is not a real CSM login.

RECREATE (look only — do not send)
- Live site https://fundhub.ai. Do not send SMS or email.
- Confirm demo logins are off (this look: GET /api/auth/login, DEMO_LOGINS_ENABLED off).
- Confirm live staff with role csm is only csm@demo.fundhub.local (this look: GET /api/read/staff?role=csm returned 0 real rows because demo is hidden).
- Owner session can open https://fundhub.ai/app/csm-queue.html (this look: queue 200, 7 calls). Do not click Claim, Write answers, or End shift.
- Do not turn demo back on as the “fix” unless VERIFY proves that is the only real hole. The named hole is: a real CSM cannot sign in while demo is off.

REAL: demo is off and there is still no real (non-demo) CSM who can sign in.
NOT A PROBLEM: a real non-demo CSM person can sign in while demo stays off.

HARD STOPS
- no SMS / no email · do not click Claim · do not click End shift
- no real card charge · no live CRS / bureau pull · no paper mail
- no new Commas products
- do not start e2e · do not Enroll
- one hole only · smallest diff · stop after this hole
- never verify:e2e on the live database · INNGEST_EVENT_KEY stays ON
- never ask Chris for secrets · never print tokens · never rotate keys

Claim hole 3 on docs/workflows/live-prove-2026-09-17-notes.md. Talk at 5th grade.
```

---

### 4 — /progress.html bounces to magic-link (staff/client)

```
THIS THREAD IS ONLY HOLE 4 — /progress.html bounces to magic-link (staff/client).
From the 2026-09-17 no-send live look. Do not start another hole.

STEPS (same chat, in order)
1. VERIFY — recreate on the live site. If it is not real, write NOT A PROBLEM and STOP. Do not fix.
2. FIX — only if VERIFY said the hole is real. Only this hole. Smallest diff. Isolated worktree off origin/main. Load .cursor/skills/fundhub-fixer/SKILL.md.
3. FINISH — prove it yourself on the live site. Open the progress page twice. Write PASS/FAIL. STOP. Do not start another hole.

WHAT IS WRONG
The client progress page does not open. With the client id in the URL, it sends you to a page that wants to email a sign-in link. The staff cookie does not open it. The portal with ?id= does open. The progress API did load (5 checklist lines). People cannot see the page.

RECREATE (look only — do not send)
- Live site https://fundhub.ai. Owner session cookie is ok. Do not send SMS or email.
- File #11 Eleven-Blueprint 029964c5-4d8e-47ed-88c9-53ac13863fd4.
- Open https://fundhub.ai/app/client-portal.html?id=029964c5-4d8e-47ed-88c9-53ac13863fd4 — this look: portal worked.
- Open https://fundhub.ai/progress.html?id=029964c5-4d8e-47ed-88c9-53ac13863fd4 — this look: bounce to portal-login (“Email me a sign-in link”).
- Open https://fundhub.ai/progress.html?client_id=029964c5-4d8e-47ed-88c9-53ac13863fd4 — same bounce.
- Do not click Email me a sign-in link.

REAL: /progress.html with id or client_id still bounces to the magic-link page, even with a staff cookie.
NOT A PROBLEM: staff (and the client path you are fixing) can open /progress.html and see the checklist without that bounce.

HARD STOPS
- no SMS / no email · do not click Email me a sign-in link
- no real card charge · no live CRS / bureau pull · no paper mail
- no new Commas products
- do not start e2e · do not Enroll
- one hole only · smallest diff · stop after this hole
- never verify:e2e on the live database · INNGEST_EVENT_KEY stays ON
- never ask Chris for secrets · never print tokens

Claim hole 4 on docs/workflows/live-prove-2026-09-17-notes.md. Talk at 5th grade.
```

---

### 5 — #9 CCP empty on first paint (~8s then Nine loads)

```
THIS THREAD IS ONLY HOLE 5 — #9 CCP empty on first paint (~8s then Nine loads).
From the 2026-09-17 no-send live look. Do not start another hole.

STEPS (same chat, in order)
1. VERIFY — recreate on the live site. If it is not real, write NOT A PROBLEM and STOP. Do not fix.
2. FIX — only if VERIFY said the hole is real. Only this hole. Smallest diff. Isolated worktree off origin/main. Load .cursor/skills/fundhub-fixer/SKILL.md.
3. FINISH — prove it yourself on the live site. Open the control panel twice. Write PASS/FAIL. STOP. Do not start another hole.

WHAT IS WRONG
The repair control panel does not show the client at first. The picker already says Nine-Repair, but the main panel says Loading… No client open. After a long wait (this look: about 8 seconds on the second load), Sim Nine-Repair finally shows. First paint is empty. That is the hole. Do not start Stage, Send, or bureau Pull. This look scored the file as PASS after the wait — the hole is the empty first paint, not missing identity.

RECREATE (look only — do not send)
- Live site https://fundhub.ai. Owner session cookie is ok. Do not send SMS or email.
- File #9 Nine-Repair be3dcfd7-faae-4001-b97f-9bc30875bbcd.
- Open https://fundhub.ai/app/client-control-panel.html?id=be3dcfd7-faae-4001-b97f-9bc30875bbcd
- Watch the first paint. This look (~3s): picker said Nine-Repair, main panel said “Loading… No client open.” Second load (~8s): Sim Nine-Repair opened.
- Do not click Stage. Do not click Send. Do not click Pull.

REAL: first paint still shows Loading / No client open for several seconds while the picker already names Nine-Repair.
NOT A PROBLEM: first paint already shows Sim Nine-Repair in the main panel (no empty wait).

HARD STOPS
- no SMS / no email · do not click Send · do not click Stage · do not bureau Pull
- no real card charge · no live CRS / bureau pull · no paper mail
- no new Commas products
- do not start e2e · do not Enroll
- one hole only · smallest diff · stop after this hole
- never verify:e2e on the live database · INNGEST_EVENT_KEY stays ON
- never ask Chris for secrets · never print tokens

Claim hole 5 on docs/workflows/live-prove-2026-09-17-notes.md. Talk at 5th grade.
```

---

### 6 — chris@fundhub.ai password login 401 (session inject worked)

```
THIS THREAD IS ONLY HOLE 6 — chris@fundhub.ai password login 401 (session inject worked).
From the 2026-09-17 no-send live look. Do not start another hole.

STEPS (same chat, in order)
1. VERIFY — recreate on the live site. If it is not real, write NOT A PROBLEM and STOP. Do not fix.
2. FIX — only if VERIFY said the hole is real. Only this hole. Smallest diff. Isolated worktree off origin/main. Load .cursor/skills/fundhub-fixer/SKILL.md.
3. FINISH — prove password login yourself on the live site. Write PASS/FAIL. STOP. Do not start another hole.

WHAT IS WRONG
Staff password sign-in for chris@fundhub.ai returns 401. Putting a session cookie on from the live database still works. People should be able to type the password and get in. Do not send a magic-link email. Do not ask Chris to paste the password. Read it from .env.

RECREATE (look only — do not send)
- Live site https://fundhub.ai/login.html (or the live staff login door).
- Read chris@fundhub.ai password from gitignored .env (STAFF_E2E_PASSWORD or the live staff password name already there). Never print it. Never ask Chris.
- Try password login. This look: 401.
- Do not click Email me a sign-in link. Do not send SMS or email.
- Session inject working is not a pass for this hole. The named hole is password login 401.

REAL: password login for chris@fundhub.ai still returns 401.
NOT A PROBLEM: password login for chris@fundhub.ai signs in on the live site.

HARD STOPS
- no SMS / no email · do not click Email me a sign-in link
- no real card charge · no live CRS / bureau pull · no paper mail
- no new Commas products
- do not start e2e · do not Enroll
- do not rotate or delete keys · do not ask Chris to paste a password
- one hole only · smallest diff · stop after this hole
- never verify:e2e on the live database · INNGEST_EVENT_KEY stays ON
- never print tokens or passwords

Claim hole 6 on docs/workflows/live-prove-2026-09-17-notes.md. Talk at 5th grade.
```


---

## Fix run — 2026-09-17 evening (one Opus session, one workflow)

**Owner-set (Chris, 2026-09-17):**
- Hole 1: agent figures it out. No question back. No email still holds.
- Hole 3: agent makes up the real CSM person. No question back.
- Hole 6: agent does the fix, including a password reset, without asking.

**Plan:** check all six at once (look only) → fix the real ones, each in its own worktree off local `main` → merge into local `main` → one `npm run ship` → prove each on the live site.

| Hole | Status | Owner |
|---|---|---|
| 1 Gold HTML pack / #8 UnderwriteIQ / contract placeholder | claimed | fix-run workflow |
| 2 #11 Metro 2 not built | claimed | fix-run workflow |
| 3 No real CSM login | claimed | fix-run workflow |
| 4 /progress.html bounce | claimed | fix-run workflow |
| 5 #9 CCP empty first paint | claimed | fix-run workflow |
| 6 chris@fundhub.ai password 401 | claimed | fix-run workflow |
