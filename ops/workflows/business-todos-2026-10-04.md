# Business to-dos — work board (2026-10-04)

Source: Chris's "Now — 2026-10-04" business list, pasted 2026-10-04. Every agent-checkable item was
re-checked against the repo and the live site on 2026-10-05 (four read-only checkers, results below).
Rules: read `CLAUDE.md` first. Claim your row before you start. Write your manifest here when done.

## Checked 2026-10-05 — cross these off (done, or the claim was wrong)

| Item on the list | What is true |
|---|---|
| Push main to GitHub | Done. GitHub `main` = `1fbc0fa`, same files as GitLab `main` (`bb7612f`), history rewritten. |
| Take the 155MB video out | Done. No file over 100MB in the history GitHub has. `slo-testimonial-colin.mp4` is 34.7MB. |
| Network: allow the domains | Done. The cloud reaches api.netlify.com, api.supabase.com, api.myclickfunnels.com, api.inngest.com. |
| Turn on Meta server events (CAPI) | Wrong. It went live 2026-10-02 (`docs/tracking/meta-events.md:1-3`). It needs `META_CAPI_ENABLED=1` only; the token is optional (`src/meta/token.mjs`). Left: confirm Lead + Schedule show in Test Events. |
| Refund window 7 vs 30 days | Wrong. Every live refund line says 7 days. Only /roadmap has refund text. |
| Edit pipeline "designed, not built" | Wrong. It is built (`src/ad-videos/pipeline.mjs`), runs every 5 min. Submagic's transcript replaced Deepgram; R2 was dropped on purpose. |
| Keep the "type yes" check before deploy | Wrong. `scripts/ship.mjs` has no such check. Only the old one-off `scripts/ship-slo-197.sh` has it. |
| "12 funding rounds" on /apply and /book | Wrong. /apply has no marquee. /book is a 404; the booking page is /funding-book-call. |
| VOICE.md, reference ad, teleprompter, climate pack, company brain | All exist on main. |

## Done 2026-10-05 — merged to `main` on GitHub (live on the next `npm run ship`)

- PR #1: GitHub is the remote. Rules, push script, this board.
- PR #2 + #3: B-roll animation kit (tool animations + approvals carousel + batch 3), moved from GitLab. The two forks were merged together, keeping both.
- PR #4: book-a-call scripts + green-screen talking points (sections 7 and 8).
- PR #5: every follow-up says $147: no-reply text, after-reply coupon, all 21 drip emails (seeds 035, 036).
- PR #6: the browser sends $147 to Meta, same as the server.
- Server events on both funnels checked (W4 manifest below).
- Owner-set 2026-10-05: proof cards are done. Repo visibility is not raised. Ship later (the cloud's Netlify login is expired).

## Plan for the rest — 5 workflows, all at once, no dependencies

| ID | Owns | Needs from Chris | Status |
|---|---|---|---|
| W2 | Rule conflicts across CLAUDE.md, `.claude/rules`, `.cursor/rules`; add the 26 missing Claude twins | Only a conflict with no clear winner by date | pending |
| W5 | UnderwriteIQ math: one sample file, engine vs Chris's math, then fix after his answers | 2 answers (below) | pending |
| W6 | Page drafts: /roadmap How It Works → the 7-step note; "Up to 12 funding rounds" → 3–6 on 5 pages. Marked draft first | OK on the draft before it goes live | pending |
| W7 | Tracking: the ShowedCall event, and Lead/Schedule fire only on qualified survey answers | What counts as qualified | pending |
| W8 | Credit-optimization doc reminders: texts on day 1, 3 and 5 until documents are uploaded | OK on the 3 texts | pending |

**Next in line (when a slot frees):** AI-crawler block on every ClickFunnels page. Capital Blueprint promo alerts (60/30/7 days), payment reserve, payment timing. The teleprompter loads scripts straight from the repo.

**Blocked on something only Chris has:** the 7-lesson lead magnet outline (where is it?), the /thank-you video file, where the VSL should move to, the monthly member fee amount, the per-letter upsell product, Climate map vs globe.

**Chris can kill:** the old /order page (hidden from Google, nothing links to it). "Turn off the free-access system": no code has that name; the nearest thing is "first five get the roadmap free", which shuts itself off after 5.

## Open questions for Chris (one at a time, in this order)

1. W7: What makes a survey answer "qualified" for Lead and Schedule? (The lookalike item says 760+ credit, $100K–$200K revenue.)
2. ~~W5: once or per bureau?~~ Owner-set 2026-10-05: **per bureau**. Each bureau approves on its own. Do not change it to once.
3. W5: Is business ≈ 2× personal, or tied to business age?

## Chris only (no agent can do these)

Delete the GitLab project: https://gitlab.com/fundhub-llc-group/fundhub-llc-project/edit. Financing approval. Filming and editing. Mastermind the offer. Apple developer account ($99/yr). Sales manager hand-offs. ClarityPay and Plaid calls. Old-client texts. Submagic Business + API plan. Meta / Google / Partner API applications.

---

## Prompts (the lead session starts these as helpers; each also works pasted into a new session)

### W2 — one set of rules

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai, branch off origin/main. Read CLAUDE.md first.
Board: ops/workflows/business-todos-2026-10-04.md. Mark W2 "claimed" there before you start.

GitHub is already the remote (done 2026-10-05). Do not touch the GitHub/GitLab rules.

1. List every rule that contradicts another across CLAUDE.md, .claude/rules and .cursor/rules. One line
   each: the two rules, and which wins (the newer owner-set date wins). Known: commit-every-session vs
   "commit only if he asked" (.cursor/rules/repo-hygiene-vc-router.mdc:15 and
   .cursor/skills/fundhub-version-control/SKILL.md); "read .env" rules vs the .env read deny in
   .claude/settings.json. Write the list on the board.
2. Fix the losing side only where the winner is clear by date. Ask Chris about the rest, one at a time.
3. 26 .cursor/rules/*.mdc files have no .claude/rules twin. Add each twin with the same words.
Do not renumber CLAUDE.md. No app code. Run npm run lint. Commit, push the branch, open a PR.
```

### W5 — UnderwriteIQ math

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai, branch off origin/main. Read CLAUDE.md first.
Board: ops/workflows/business-todos-2026-10-04.md. Mark W5 "claimed" there before you start.

Read-only until Chris answers.

Chris's math: highest card limit × 5.5 = personal. Business ≈ 2× personal. Personal loans on top.
A $20K card ≈ $110K personal, ≈ $220K business.

Code (checked 2026-10-05): src/underwrite/vendor/underwriter.cjs L196-197 = highest revolving × 5.5 per
bureau; L260-263 sums every available bureau; L270-271 drops to 1/3 only when exactly 1 bureau is
fundable; loans ×3.0 added at L275; business L277-285 = 0.5×/1×/2× by age, applied to the primary
bureau's card number.

Run one sample credit file through the engine. Report: which file, what the engine prints, Chris's math
by hand, the gap. Then the lead session asks Chris (a) 5.5× once or per bureau, (b) business ≈2× or tied
to age. After his answers: smallest fix, tests, lint, tsc, unit suite with the database off. PR.
```

### W6 — funnel copy, marked drafts only

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai, branch off origin/main. Read CLAUDE.md first.
Board: ops/workflows/business-todos-2026-10-04.md. Mark W6 "claimed" there before you start.

Follow .claude/rules/page-edits-marked-draft.md exactly. Marked draft first. Nothing goes live.
Model the build on marketing/landing-pages/slo/preview/reorg-draft-build.mjs. Page HTML is under
marketing/landing-pages/.

1. /roadmap "How It Works" has 5 steps. The 7-step note is marketing/ads/notes-green-screen.md:54-67.
   Red-box draft that reorders it to match the note.
2. "Up to 12 funding rounds" is live on /watch, /thank-you, /funding-book-call, /roadmap-book,
   /roadmap-thank-you. The model is 3–6 rounds. Red-box each one with the fix.

Share as one Artifact link. Push nothing to ClickFunnels until Chris says push it.
```

### W7 — ShowedCall + qualified-only Lead and Schedule

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai, branch off origin/main. Read CLAUDE.md first
(§3a build order: workflow questions before schema). Board: ops/workflows/business-todos-2026-10-04.md.
Mark W7 "claimed" there before you start.

Today (checked 2026-10-05): Lead fires for everyone who finishes the /apply survey
(marketing/landing-pages/apply-survey.html:441, src/meta/map.mjs survey_answer→Lead,
public/funnel/fh-events.js:284). Schedule fires on every booking (map.mjs booking_confirmed, match () => true).
ShowedCall is planned in marketing/ads/apply-survey-meta-tracking-2026-09-30.md and not built.

1. List the survey questions and answers that exist today. Propose one rule for "qualified" built only
   from those answers. The lead session asks Chris to confirm it.
2. After he confirms: Lead and Schedule fire only for qualified answers, in both the browser and the
   server copy (same rule, one source). Add ShowedCall: find where a call is marked showed in the code
   and send it server-side from there.
3. Tests for every path. Lint, tsc, unit suite with the database off (never against DATABASE_URL, it is
   live). No deploy. Commit, push, PR.
```

### W8 — doc reminder texts, day 1 / 3 / 5

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai, branch off origin/main. Read CLAUDE.md first
(§3a build order, §12 outbound rules). Board: ops/workflows/business-todos-2026-10-04.md.
Mark W8 "claimed" there before you start.

Credit-optimization clients get one document request (src/workflows/s-doc-collection.mjs:56-68, one-shot
lock doc_01_request_sent_at). doc-check runs only after an upload (src/workflows/doc-check.mjs).
Nothing chases them before that.

Build: texts on day 1, 3 and 5 after the request until their documents are uploaded; stop as soon as an
upload lands. Reuse the existing patterns: Inngest sleeps like src/workflows/f-02-portal-id-missing.mjs,
templates as a new db/seed file, sendTemplated only queues. Draft the 3 texts in the existing SMS voice;
the lead session shows them to Chris before merge. Tests, lint, tsc, unit suite with the database off.
No deploy. Commit, push, PR.
```

## Manifests

### W4 — server events, both funnels (2026-10-05, read-only, no code changed)
- Every server event a real person triggered reached Meta and was accepted: 146 sends, 229 events, 2026-10-02 17:59 → 2026-10-05 00:50 UTC. 0 errors, 0 skips. Proof is Meta's reply stored on each event row (`payload.meta`).
- Roadmap funnel fired: PageView 72, ViewContent 71, ReachedBuyBox 18, VideoProgress 36, Lead 1, InitiateCheckout 1.
- Zero because nothing triggered them: Purchase and SoftPullSubmitted (0 paid orders since go-live), Schedule (no booking ever recorded), every book-a-call event (0 real visitors on /watch since 10-02 17:19; all 4 live ads point to /roadmap).
- Not proven: the zero-count events (needs a real payment or booking, or a test fire with the stored Meta token, which this container cannot read). Whether `META_TEST_EVENT_CODE` is unset on Netlify production (Netlify login expired here).

### $297 browser value — fixed 2026-10-05 (Chris: "fix mismatch")
- `public/funnel/fh-events.js` now sends $147 for InitiateCheckout and Purchase, same as the server. Tests pin both copies to `SLO_VALUE`. Branch `fix-meta-value-147-2026-10-05`, PR #6. Live on next ship.

### Leftover card
- CI `suite (real Postgres)` dies before any test: `fundhub_app` has no password in `.github/workflows/tests.yml`. Red on `main` too.

### W1 (lead session) — 2026-10-05
- Re-checked the whole list (four read-only checkers). Results above.
- Owner-set 2026-10-05: repo visibility is Chris's call, never raise it. Proof cards are done. The $197 follow-up text stays on at $147. Live push can wait; repo commits are enough.

### GitLab → GitHub move — 2026-10-05 (done)

GitLab held 5 branches, 3 merge requests, 1 tag. Every one checked against GitHub:

| GitLab ref | Result on GitHub |
|---|---|
| `main` (`3f1b2f68`) | Same files as GitHub `main` (`1fbc0fa`). GitHub history is a 2026-10-04 rewrite: 2959 commits on both. |
| `ad-scripts-2026-10-02` (MR 1) | Moved. 38 commits replayed onto the GitHub twin of its starting point → `1a836fd579`. Files identical to GitLab. |
| `approval-carousel-2026-10-03` (MR 3) | Moved → `b397fb69e3`, 38 commits. Files identical. |
| `all-scripts-2026-10-03` | Moved → `d8665631fc`, 54 commits. Files identical. |
| `slo-197` | Nothing to move: every change is already in `main`. |
| MR 2 head (`0385946d`) | Nothing to move: every change is already in `main`. |
| tag `checkpoint/pre-fix-pass-2026-09-17` | Its commit is in GitHub `main` history as `2b3a64b4877f` (same files). The tag name itself could not be created: the cloud proxy blocks tag writes. From the Mac: `git tag checkpoint/pre-fix-pass-2026-09-17 2b3a64b4877f && git push origin --tags`. |

Not moved: GitLab merge-request text and comments (the token has no API read scope). The code in them is moved.

Rules: CLAUDE.md GitLab section → "GitHub is the remote". `.claude/rules/gitlab-push.md` → `github-push.md`, `.cursor/rules/gitlab-push.mdc` → `github-push.mdc`, `scripts/gitlab-push-whole-repo.mjs` → `scripts/github-push-whole-repo.mjs` (never forces, removes GitLab remotes). `scripts/ship.mjs` header comment. Lint clean, tsc clean, unit suite (database off) 35 fail vs 36 before, no new failures.

Delete GitLab: the token is repository-only (`read_repository`, `write_repository`), so no agent can delete the project. Chris: https://gitlab.com/fundhub-llc-group/fundhub-llc-project/edit
