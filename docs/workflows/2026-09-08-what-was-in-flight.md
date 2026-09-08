# What was in flight when the laptop died — 2026-09-08

Written 2026-09-08 from the repo alone: `main` at `5cee255a`, every `origin/*` branch, and the public GitHub API. Ten agents — five read, five re-ran every cited command and struck or corrected anything that did not hold. Where the repo is silent the word is **unknown**, not a guess. All times Arizona (`-0700`) unless marked Z.

## 1. The short version

- **Last thing pushed:** the ad-script generator — PR #357, branch `feat/ad-script-generator`. Two commits Sunday 12:49–12:52 PM (right as the last main merge landed), then sixteen more Monday 4:24–6:32 AM, the morning of the loss. That is the marketing build. Open, not draft, cannot merge yet (3 conflicts with main; 2 questions for Chris; needs credentials).
- **"Moved a lot up" — yes, and it worked.** Sunday 11:00 AM, commit `eec40ef6` "Recover 82 files that existed only on the laptop" (PR #353): 82 files, +12,707 lines. Plus seven pull requests opened Saturday night and Sunday for branches that had none. Nothing that was pushed is lost.
- **The walkthrough:** Walkthrough 4 — funding + credit-repair fulfilment end to end — set for Sunday. Board written 11:41 AM; 28 defects found. **0 of 28 fixed.** Every main build failed Sunday morning until 10:48 AM, then every scheduled function was dead 10:50 AM–12:52 PM, so the walk was blocked most of the day.
- **Monday was launch + film day** per TODO.md and the day plan. **Unknown** whether either happened.

## 2. Timeline, Friday to Monday

| When | What | Evidence |
|---|---|---|
| Fri 09-04 | Round 2 / Round 3 fix batches merged straight to main, no PRs. Held: repair cleanup letters, five client documents. | `0585845e` `07dcbade` `e3785f1a`; `5c366859` |
| Fri 09-04 → Sat 09-05 | Portal rebuild waves 1–3; hiring/CSM role (PRs #335 #336 #337 #343). AI support lane + accountability layer moved to "wave 4". | `3ae63e77`; `3a9e64e0` `53fee1da` |
| Sat 09-05 7:03 PM | TODO.md 0a: "PUSH THE STRANDED WORK. Six branches, nineteen commits, zero pull requests." PRs #339–#342 opened 35 seconds later. | `050cd6f8`; PRs created 02:03Z |
| Sun 09-06 ~3:25–10:48 AM | **Every main build failed** — three hiring tables had row-level security on with no policy; `guard:rls` refused. Site served Friday's code. Fixed by PR #351 (migration 364) at 10:48 AM. | `11e8fd71`; board :8-13 |
| Sun 5:47–10:14 AM | Fulfilment-walk fix PRs merged: #344 (35 defects), #345 (waypoints), #346 (portal installable), #347 (Present outage etc.), #348 (roadmap prose). | `553082c9` `fc49a9b3` `23f23ec7` `b324ccd8` `3844128b` |
| Sun 10:24–10:58 AM | PRs #349 (HOLD letters), #350 (HOLD documents), #352 (nudges) opened. | API created_at |
| Sun 10:50 AM | **Every scheduled function died** — vendor tree not bundled into functions. A simulated $3,000 receipt sat pending 20 minutes, no alarm, deploy green. | `c36eb77e` |
| Sun 11:00 AM | The 82-file rescue committed. | `eec40ef6` |
| Sun 11:41 AM | Walkthrough 4 board + 28 defects appended to TODO.md. | `099bfd81` |
| Sun 11:42 AM | Client Control Panel / Apply door / bureau work merged (PR #354). | `a8d2b3fe` |
| Sun 12:13 PM | Rescue merged (PR #353). Both builds after it then failed on one stray `)` in migration 300. | `c5e48a48` |
| Sun 12:32 PM | PR #355 fixes the `)`. | `5839e37d` |
| Sun 12:52 PM | PR #356 restores the scheduled functions. **Last commit on main.** Whether the site then deployed green: **unknown** — no record in git. | `5cee255a` |
| Sun 12:49–12:52 PM | First two commits on `feat/ad-script-generator`. | `adf624a4` `78c77626` |
| Mon 09-07 4:24–6:32 AM | Sixteen commits on `feat/ad-script-generator`. PR #357 opened 5:10 AM, last touched 6:33 AM. **Last activity from the laptop.** | `e17d6937` … `a1697048` |
| Mon 09-07 | Planned: "Launch primary offer", "Film 14 in Sedona", "film everything — the course and the VSL". **Unknown.** | TODO.md:150-152; `day-plan-2026-09-06.md:20` |

## 3. "Moved a lot up" — what the rescue saved (PR #353, `eec40ef6`)

82 files, +12,707 / −493, committed one day before the loss.

- Hiring code: EEO self-ID, calendar free/busy, apply / booking / pipeline + tests; API routes; migrations 299, 300, 301
- The ad rules pack: `docs/ads/RULES.md` (28KB), `scripts/ads/check-script.mjs`, `docs/ads/POST-BOOKING-15.md`
- Lender + inquiry databases under `docs/legacy-strong/` — inquiry master (5,474 lines), lenders (314), bank datapoints, state funding boards
- 28 bank-logo image changes under `public/assets/lenders/`
- Seven planning docs: `day-plan-2026-09-06`, `fulfillment-walk-2026-09-05`, `chris-list-2026-09-04`, `cursor-tasks-2026-09-05`, `api-inventory-2026-09-06`, `fix-batch-2026-09-03-remaining`, `hiring-post-336-2026-09-05`
- TODO.md +383 lines: the owner-set Client Control Panel section (§1–§14) and the 30-agent walk findings (§15–§35)
- Not named in the commit message but also in the diff: sim tooling (`scripts/sim/push-credit.mjs`, `seed-fulfillment-client.mjs`, `wipe-sim-clients.mjs`), `src/underwrite/black-report-client.mjs` + test, `scripts/notion-rescrape-datapoints.mjs`, Creative Factory UI edits, `docs/journeys/hiring-actual.md`

**Deliberately left out** per the commit message: scratch files, a 132MB tar, `__pycache__`. What the tar held: **unknown**.

## 4. The walkthrough

**What a walkthrough is here:** Chris clicks every path on the live site himself; agents watch production read-only; findings are written, not fixed mid-walk; the credit file and the payment are simulated by `scripts/sim/push-credit.mjs` / `push-payment.mjs` so no bureau is called and no card charged. Source: `docs/workflows/manual-walkthrough-SOP.md`. The six product walkthroughs are kept manual by owner decision.

**Which one was next:** Walkthrough 4. Chris's Sunday order (`docs/workflows/day-plan-2026-09-06.md`, recovered in the rescue):

1. Close out Walk Through 2 and 3
2. Walk Through 4 — funding fulfilment + credit-repair fulfilment end to end
3. Outside services: Oxylabs, Zoho, Facebook, LinkedIn + inventory sweep
4. AR finished
5. Handoff to Tucker Albin (emails)
6. Second full end-to-end run
7. Accountability portal vs Capital Blueprint
— then Monday: film the course and the VSL.

**Done from that list:** waypoint seeding (#345) and the installable portal (#346) landed. Items 3–7: no commit mentions them. **Unknown.**

**The board:** `docs/workflows/walkthrough-4-2026-09-06.md` (351 lines) + TODO.md:811-844.

- Deploy root cause: above. The laptop's own `netlify deploy` also failed — it built a checkout 141 commits behind main.
- "Data that was never loaded" — built tables holding nothing: `client_waypoints` 0 rows for Walk1; `client_push_subscriptions` 0; `paid_service_requests` 0; `customer_insights` 0; `lender_bureau_observations` 0; `invoices.due_at` 0 of 1; `clients.funded_amount` 0 of 37; `lenders.bureaus_pulled` 46 of 307 (migration 365 then stamped 70 more; 237 stay empty because no source names them — a data gap, not an unfinished fix).
- Walk findings: Walk2 ($1,000, six rounds) never enrolled — events stop at `payment.received`. Walk3 only looked enrolled because someone pressed the Specialist-desk button. Code fix is on main but does not retro-fix either client — **both need enrolling by hand from the Present deck.** Walk1 has two exact duplicate tasks. None recorded as done.
- Prepared for the walk and merged (PR #354): blocker cards yellow, inquiries listed under the step, "How did you apply?" dropdown removed, Bank yes/no → Approved/Declined/Pending, bureau per bank on Apply-door rows.
- **28 rule-vs-reality defects: 11 high, 15 medium, 2 low. 0 of 28 fixed.** Six finders + an adversarial verifier; 47 candidates in, 28 survived. No commit on any branch touches them after the board (the only later touches to those files are unrelated EEO routes and CLAUDE.md text). Highs include: the two contracts stamped "DO NOT SEND THIS" are one click from a client (`src/contracts/send.mjs:312-400`); the browser check that blocks every merge is hollow (TODO.md:823); dispute letters carry no mailing address and are signed with the client-record name; a wrong-person document counts toward a complete packet.
- `4A/4B/4C` in the board header: defined nowhere. Likely the three seeded clients — Walk1 Funding / Walk2 Repair full / Walk3 Repair trial. **Unknown.**
- Evidence: `docs/workflows/*-evidence/` is gitignored. Any screenshots from the walk lived only on the laptop.

## 5. The marketing build

**On main today:** `docs/ads/` — 17 files: `RULES.md`; `CONTROLS.md` (five filmed, running ads locked at $32–36 per booked call — the voice seed); `registry.json` (24 ads, 3 titled — naming ruled optional 09-06); `ANGLE-GENERATOR`, `ASSET-BANK`, `CONCEPTS` (48 hooks), `NEXT` ("refine the 20", "10 open Sorting Hat ads"), `sms-copy-2026-09.md`, `POST-BOOKING-15.md`, `build/`. Six flywheel workflow scripts in `.claude/workflows/` (avatar-builder, ad-research, offer, copy, ad-strategy, deep-research) driven by `/flywheel`; partner-lane stages 1–2 approved, 3–5 ran 08-31 but sit as unapproved drafts. `scripts/marketing/` is a FOIA prospect-list warehouse, not ad creative. **No ad-writer skill on main.**

**PR #357 `feat/ad-script-generator`** — 18 commits, 54 files, +6,957 / −453. Adds: `.cursor/skills/fundhub-ad-writer/SKILL.md`; `docs/ads/VOICE.md`; `docs/ads/rules-data.mjs` (one machine-readable rules source — three copies of the banned-word list had already drifted); rebuilt `check-script.mjs` + tests; `docs/journeys/ad-script-flow.md`; Creative Factory text-path fixes (menu, job runner that found zero jobs forever, missing `offer_type`, copy-text column); ad-books panel in Campaign Manager; ClickFunnels + YouTube read-only analytics (credentials stored encrypted, migration 302); Clarity (gated, inert until a project ID); Company Brain self-ingest; weekly ops brief. This is the self-analysis's "Tuesday builds the generator" — delivered Monday. Body: three things "verified end to end against a real database"; suite 8,690 pass / 15 fail attributed to other sessions' hiring/white-label work (self-reported); tagged COMPLIANCE REVIEW REQUIRED.

- **Cannot merge:** conflicts in `db/expected-migrations.mjs`, `db/migrations/300_eeo_invite_template_and_submit_outcome.sql` (PR #355 also edited it), `src/pulse/registry.mjs`.
- **Two questions for Chris in the body:** (1) ClickFunnels "conversions" — opt-ins or sales? Code uses opt-ins (`src/analytics/clickfunnels.mjs:255`). (2) May `docs/COMPANY-BRAIN-BUILD-SPEC.md:39` be corrected — it still instructs Google Workspace domain-wide delegation, which Chris banned (self-analysis:194-196)?
- **Needs Chris's accounts before it does anything:** Meta ad connection, ClickFunnels API key, YouTube OAuth (client id / secret / refresh token), Clarity project ID.
- CI is red on the branch — the same three checks are red on main head. Does not discriminate.
- No generated scripts were added under `docs/ads/scripts/`.
- An assessment doc on the branch judged the recovered `RULES.md` "FIX" and the recovered `check-script.mjs` "REPLACE — fails every real ad, including the five that are live"; the branch's later commits do both.

**Next batch, branch-only** (`docs/ops/2026-09-06-self-analysis.md` "# The next batch — 2026-09-07"): 1) correct the Company Brain spec, 2) ClickFunnels API key from Chris, 3) confirm where VSLs are hosted before YouTube work, 4) marketing-analytics reporting. Filming stays manual by owner choice; image/video generation is off the list.

**Still missing per the self-analysis:** 22 of 52 standing rules not in the repo; `docs/ads/README.md:14-15` points at `20-ads.md` and `SHOOT-PLAN.md`, which do not exist; `NEXT.md` items have no follow-up; no shoot date recorded anywhere; white-label lane has zero filmed videos; Meta sync built but no `ad_platform_connections` row; Meta ad id never joined to Chris's ad number; `WORKFLOW-AUTONOMY.md` still contradicts CLAUDE.md.

## 6. The eight branches = five pieces of work

All eight have real merge conflicts against main (`git merge-tree --write-tree`). All eight have an open PR — nothing is orphaned.

| PR | Branch | What it is | State | What blocks it |
|---|---|---|---|---|
| #357 | `feat/ad-script-generator` | Ad-script generator + analytics (§5) | Open, **not draft**, 18 ahead, last Mon 6:32 AM | 3 conflicts; 2 answers from Chris; credentials |
| #352 | `fix/nudge-r4-2026-09-06` | Waypoint nudge sweeper (overdue-checklist chase that terminates) + paid-checkout link expiry sweeper, both hourly | Draft, 9 ahead, last Sun 10:14 AM | Adds migrations 365–370 + seed 025 — names already taken on main → renumber. Body asks for cron/outbound review before merge. Code carries COMPLIANCE REVIEW REQUIRED (payment rails, fee timing). |
| #350 | `lane2/r3-w10-docs-p3` | Client documents round 3 — roadmap, black report, letter pack, funding letter | **HOLD**, draft, 15 ahead | Four client-facing false statements still open; "which printer production actually uses is unproven"; 5 conflict files. Contains all of #340. |
| #349 | `letters/r3-w8b-2026-09-06` | Dispute letters round 3 — 1,890-letter sweep, no "last letter" claim, no "merged file" claim on ambiguous DOB | **HOLD**, draft, 15 ahead | Breaks the repair Generate button (throw reachable at `consumer-name.cjs:139-145` from `analyze.mjs:840`, no catch); can store/send a null letter (`inquiry-gate.mjs:124,152`). Two more letter-content defects. Contains all of #341 and #339. |
| #342 | `fix/r2-w11-notifications` | Nine rewritten customer texts as a seed | **HOLD**, draft, 1 ahead | Waiting on Chris to read `docs/ads/sms-copy-2026-09.md` (already on main). Commit says "MEANT TO BE DROPPED" unless approved. |
| #341 | `fix/r2-w8b-repair-floor` | Repair floor — personal-info cleanup even on a clean file | Draft, 6 ahead | Superseded — fully inside #349 |
| #340 | `fix/r2-w10-deliverables` | W10 deliverables round 2 | Draft, 7 ahead | Superseded — fully inside #350 |
| #339 | `feat/letters-all-rounds` | Rounds 4–6 write letters again | Draft, 1 ahead | Superseded — fully inside #349 |

Both #349 and #350 cite "round-3 verifier output for run wf_917ca6be-905" as the full findings. That id is in no file on any branch. It was on the laptop.

## 7. Waiting on Chris — only you can clear these

1. **Two contract texts** — FUNDING-AGREEMENT ($3,000 deposit) and CREDIT-REPAIR-AGREEMENT ($1,000). The live ones say "THIS IS NOT THE REAL AGREEMENT TEXT. DO NOT SEND THIS." and are one click from a client. Drop the real text into `docs/contracts/source-2026-08-28/`. (TODO.md:9-11, :75-78, :816)
2. **Read the nine texts + one email subject** — `docs/ads/sms-copy-2026-09.md`. Yes or no. SMS is off on purpose until then. (TODO.md:44; PR #342)
3. **Oxylabs login is dead (407)** — the Apply button cannot open a bank page. Oxylabs → Residential Proxies → user credentials → set `OXYLABS_USERNAME` (account id, no `customer-` prefix) and `OXYLABS_PASSWORD`. (TODO.md:485-502; `src/adapters/oxylabs.mjs:460`)
4. **UnderwriteIQ six-month strategy** — "It is not finalised and it is going out to clients right now." "We dont do DUNS" is recorded; the Month-5 decision is not. Blocks `docs/workflows/portal-accountability-spec.md`. (TODO.md:49-72)
5. **PR #357's two questions** (§5): ClickFunnels conversions = opt-ins or sales; OK to fix the Company Brain spec.
6. **PR #357's credentials:** Meta connection, ClickFunnels API key, YouTube OAuth, Clarity project ID.
7. **Two ClickFunnels fields** in the CF editor — "Annual Business Revenue" saves into nothing; "Can You Verify Revenue?" saves into the other slot. (TODO.md:79-82; `docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md` Part B)
8. **A Bland phone number** — every call dials from a shared pool line. (TODO.md:83)
9. **Zoho phone verification** — the number Zoho verifies against is decommissioned; blocks the Zoho account, which blocks job posting. (`090d7adc`)
10. **Mailgun unpaid balance** — bank-inbox → Netlify is paused on it. (TODO.md:387)
11. **Paul (DirectROAS)** owes a survey field the qualification gate is waiting on — "a one-line ask Chris can make today." (self-analysis:1015)
12. **Three of the "four questions, one line each"** (TODO.md:91-100): booking send-now vs sweeper; what counts as a confirmed booking; Academy vs Blueprint both $5,000. (Generate Apps was answered: gone.)
13. **Personal / Business / Total funding rows** — `68faf123` corrected the number but did not build the three named rows you asked for. Still open. (TODO.md:597-607)
14. **Assign advisors / fill a pod to capacity** — "Nothing exists." Build order schema → read endpoint → screen. Not started. (TODO.md:688-716)
15. **Inbound texts arrive and nobody answers** — needs an acknowledgement + STOP/HELP branches; "Wording is Chris's call." (TODO.md:673-686)
16. Turn off the Gmail "FS Auto" filter before the re-walk. (TODO.md:425)
17. Read the new Josh script before it goes near a phone. (TODO.md:89)

## 8. Lost with the laptop — as far as git can tell

- **Four marketing skills** — humanizer, copywriting, offer, get-to-the-point. Lived at `~/.claude/skills/` on the laptop, never committed, no git history anywhere. The self-analysis called them "the marketing brain … one laptop wipe from gone" and asked for them to be backed up (self-analysis:134-140, :525-533). Only the humanizer word lists survive — copied into `.claude/workflows/copy.js:34-48`, `docs/ads/RULES.md:78-84`, `scripts/ads/check-script.mjs:45-51`, and `docs/ads/rules-data.mjs` on #357.
- **The 83 ad scripts and the VSL doc** — `fundhub-scripts.md`, `fundhub-vsl.md`. Never in the repo; lived in a Claude chat (`docs/ads/scripts/README.md`). Chris said 09-06 "we dont want those" as seed, so the 83 may not matter. `fundhub-vsl.md` is still the only reference for the VSL.
- **`20-ads.md` and `SHOOT-PLAN.md`** — README points at them; never committed.
- **Walkthrough screenshots / evidence** — gitignored folder.
- **The 132MB tar** excluded from the rescue — contents unknown.
- **Verifier run `wf_917ca6be-905`** that #349/#350 cite.
- **The 17 `recover/*` branches** from `RECOVERY-2026-08-01.md` — rebuilt in August from the laptop's local object store; gone from origin again; none of those 16 commits exist in this clone or on main. Whether any of it mattered: **unknown**.
- Anything done locally on the 28 Walkthrough-4 defects after 11:41 AM Sunday — nothing on origin touches them.

## 9. Live problems found along the way — not fixed, not in scope

- `api/soft-pull-approve.mjs:319` calls `stampIncorporatedAsStaff`, defined nowhere in the repo. A POST with that action crashes. Since `b2d42090` (08-25).
- The two "DO NOT SEND THIS" contracts are one click from a client (`src/contracts/send.mjs:312-400`). Walkthrough-4 high #1.
- Scheduled functions were dead 10:50 AM–12:52 PM Sunday. #356 is the fix. No record of a green deploy after it — check Netlify.
- `src/http/crm-html.test.mjs:95` passes only because an HTML comment at `client-control-panel.html:1019` still contains "Generate Apps". Flagged for re-pointing in `8d58f71c`, never done.
- PR #347: "One is verified against the live database. Four are self-reported only — the verification agents all died on a session limit."
- Seven self-consistency tests red on clean main (measured 2026-09-08, this Mac, Node 22.23.2, no `DATABASE_URL`: 9,325 run / 9,314 pass / 7 fail / 4 skipped). One is the tenant-isolation check — audit finding C1.
- `src/ads/registry.test.mjs:91-95` `UNTITLED_ALLOW_LIST` still lists 21 ids — the 09-06 owner decision (ads by id, names optional) has not reached the test.
- `docs/workflows/flywheel-partner.md` says stages 3–5 "built, not run"; they ran 08-31. Stale.

## 10. Stale documents — do not onboard from these

- `HANDOFF.md` — last real edit 2026-07-30. Says "no production database", "nothing transmits", "six screens on sample data". All contradicted by TODO.md.
- `PRODUCT-BACKLOG.md` — 2026-07-28, never touched since.
- `VERIFICATION.md` — 2026-07-30, self-marked SUPERSEDED.
- `TODO.md` is the only current statement (09-06) — but: 0a "zero pull requests" was false within a minute of being written; item 4 (21 ad names) was closed by owner decision; §1, §2, §5, §7, §10 are done on main with boxes unticked; §12a/b done; PRs #349/#350/#352 are not listed at all.

## 11. Open questions only Chris can answer

1. Did Monday's launch and filming happen?
2. Did the site deploy green after PR #356 Sunday 12:52 PM? (Netlify → Deploys, not git.)
3. Were Walk2 and Walk3 enrolled by hand, and Walk1's duplicate tasks removed?
4. Were any of the 28 Walkthrough-4 defects started on the laptop after 11:41 AM Sunday?
5. Are the four marketing skills backed up anywhere — Notes, Drive, another chat?
6. Is the Claude chat holding the 83 scripts / VSL doc still open somewhere?
7. Identity option A (real identity, no pull) or B (sandbox identity, real pull) for the walk clients? (`fulfillment-walk-2026-09-05.md:101`)
8. Close #339 / #340 / #341 as superseded, or keep them open as visibility stubs?

## Method

Five research lanes (main this week; branches + PRs; marketing; walkthrough; repo TODO), each adversarially verified by a second agent that re-ran every cited git command, re-read every cited file:line, and re-fetched PR JSON. 136 items checked; 51 flagged unsupported or corrected; those are folded in above. The unauthenticated GitHub API rate-limited partway through verification, so a few PR bodies (#347, #351, #355, #356) were confirmed from their head commit messages instead. Old-style `git merge-tree | grep '^<<<<<<<'` gives false "no conflicts" — use `--write-tree`. Per-agent transcripts: `~/.claude/projects/-Users-chrisstanbridge-Developer-fundhub-platform/fd041f0b-1a4a-4818-b533-eb6e443959ee/subagents/workflows/wf_30e29cc9-ed8/`.
