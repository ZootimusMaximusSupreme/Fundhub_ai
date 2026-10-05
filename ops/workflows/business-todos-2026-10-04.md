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

## Moved back to open (the list said done, it is not)

- **Proof cards on /roadmap.** Not on the live page. The card CSS ships, but there are 0 cards in the HTML and no proof script. Same in `marketing/landing-pages/slo/slo-01-sales.html`.

## Urgent

| # | Item | Who | Status |
|---|---|---|---|
| U1 | The no-reply text (`src/workflows/slo-no-reply-197.mjs`, live) says "30% off… It's $197". The page price is $147. | Chris decides: off, or $147 | blocked on Chris |
| U2 | Repo is public. The cloud proxy refuses repo-settings changes ("Repository settings writes are not permitted through this proxy"). | Chris: https://github.com/ZootimusMaximusSupreme/Fundhub_ai/settings → Change visibility | blocked on Chris |
| U3 | Cloud cannot ship. `netlify status`: "Your session has expired." The Netlify token in the cloud env is rejected. Every live change from the cloud waits on this. | Chris: new token at https://app.netlify.com/user/applications#personal-access-tokens, then put it in the cloud environment as `NETLIFY_AUTH_TOKEN` | blocked on Chris |
| U4 | Two branches with unmerged work exist only on GitLab: `ad-scripts-2026-10-02` (38 commits, 259 files: B-roll templates, scripts) and `all-scripts-2026-10-03` (2 files: book-a-call scripts, green-screen talking points). The teleprompter README points at a file on that second branch. | W1 (agent): replay onto GitHub main, push | pending |

## Still real — agents can do these

| ID | Item | Evidence | Model |
|---|---|---|---|
| W2 | Rules say GitLab is the remote and GitHub is banned (4 files + `scripts/ship.mjs:7`). About 6–8 rule conflicts. 26 of 47 Cursor rules have no Claude twin. | checker 4 | Opus |
| W4 | Prove Lead + Schedule show in Meta Test Events (CAPI is already on). | `src/messaging/providers/meta-capi.mjs:43` | Opus |
| W5 | UnderwriteIQ: confirmed 5.5× per bureau, summed over every available bureau. $20K card on 3 bureaus = $330K. Your math = $110K. Business = 2× primary bureau at 24+ months. | `src/underwrite/vendor/underwriter.cjs:196-285` | Opus |
| W6 | "Up to 12 funding rounds" is on /watch, /thank-you, /funding-book-call, /roadmap-book, /roadmap-thank-you. How It Works has 5 steps; the 7-step note (`marketing/ads/notes-green-screen.md:54-67`) has businesses at step 2 and adds "remove inquiries and repeat". | live pages | Opus |
| W7 | Pixel: Lead fires for everyone who finishes the survey, Schedule fires for every booking. Nothing checks answers. ShowedCall is in docs only. | `apply-survey.html:441`, `src/meta/map.mjs` | Opus |
| W8 | Doc reminders: nothing texts on day 1/3/5 before upload. One request is sent once. | `src/workflows/s-doc-collection.mjs:56-68` | Opus |
| — | AI crawlers allowed: robots.txt is `User-agent: * / Disallow:`. | https://apply.fundhub.ai/robots.txt | later |
| — | /thank-you has no video. /watch VSL still plays from Netlify (22MB). | live pages | later |
| — | Capital Blueprint: promo alerts, payment reserve, payment timing, per-letter upsell, monthly fee — none built. Last two blocked on Chris (no product title, no amount). | `src/workflows/blueprint-finance-os-alerts.mjs:17` | later |
| — | Bank list: 237 banks have no bureau (`db/migrations/365_…sql:23`). | | later |
| — | Lead magnet 7-lesson outline: not saved anywhere. | | later |

## Low value — Chris can kill these

- **/order page.** Still live ($297), but hidden from Google (`noindex`), not in the sitemap, and no live page links to it.
- **"Turn off the free-access system".** No code is called that. The nearest thing is "first five get the roadmap free" (`src/slo/discount-197.mjs`), which shuts itself off after 5.

## Open questions for Chris (one at a time, in this order)

1. U1: The $197 follow-up text. Turn it off, or change it to $147?
2. W5: Does the 5.5× apply once, or once per bureau?
3. W5: Is business ≈ 2× personal, or tied to business age?

## Chris only (no agent can do these)

U2 and U3 above. Financing approval. Filming. Mastermind the offer. Apple developer account ($99/yr).
Sales manager hand-offs. ClarityPay and Plaid calls. Old-client texts.

---

## Prompts (paste one into a new session, or the lead session starts them)

### W2 — rules: GitHub is home, then one set of rules

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai. Read CLAUDE.md first.
Board: ops/workflows/business-todos-2026-10-04.md. Mark W2 "claimed" there before you start.

Owner call 2026-10-04: "we quit gitlabs." GitHub is the repo's home now. This replaces the
CLAUDE.md section "GitHub is banned. GitLab is the remote".

Part 1. Rewrite every rule, script and note that says GitLab is the remote or GitHub is banned,
so they say GitHub is the remote:
- CLAUDE.md, that section and line 127 ("compare against gitlab/main") (keep it unnumbered; do not renumber any section)
- .claude/rules/gitlab-push.md and .cursor/rules/gitlab-push.mdc (same words in both)
- scripts/gitlab-push-whole-repo.mjs (rewrite for GitHub or retire it; say which)
- scripts/ship.mjs line 7 ("There is no GitHub")
Do not remove any key or env var.

Part 2. List every rule that contradicts another across CLAUDE.md, .claude/rules and
.cursor/rules. One line each: the two rules, and which wins (the newer owner-set date wins).
Known: commit-every-session vs "commit only if he asked" (.cursor/rules/repo-hygiene-vc-router.mdc:15);
"read .env" rules vs the .env read deny in .claude/settings.json. Write the list on the board.
Fix the losing side only where the winner is clear by date. Ask Chris about the rest, one at a time.
26 .cursor/rules/*.mdc files have no .claude/rules twin — add the twins (same words).

Run npm run lint. Commit, push to origin. Write your manifest on the board. Do not ship.
```

### W4 — prove Meta Lead + Schedule

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai. Read CLAUDE.md first.
Board: ops/workflows/business-todos-2026-10-04.md. Mark W4 "claimed" there before you start.

Server-side Meta CAPI went live 2026-10-02 (docs/tracking/meta-events.md). Gate is META_CAPI_ENABLED=1
(src/messaging/providers/meta-capi.mjs:43). Token comes from ad_platform_connections if
META_CAPI_ACCESS_TOKEN is unset (src/meta/token.mjs).

Prove Lead and Schedule reach Meta: fire one of each through the real path with a Meta test event
code, and read them back from Events Manager Test Events by API. Paste the proof on the board.
If something blocks you, write the exact error on the board and stop. Change no code.
Do not touch pixel conditioning or ShowedCall (W7).
```

### W5 — UnderwriteIQ math

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai. Read CLAUDE.md first.
Board: ops/workflows/business-todos-2026-10-04.md. Mark W5 "claimed" there before you start.

Read-only until Chris answers. Change no code.

Chris's math: highest card limit × 5.5 = personal. Business ≈ 2× personal. Personal loans on top.
A $20K card ≈ $110K personal, ≈ $220K business.

Code (checked 2026-10-05): src/underwrite/vendor/underwriter.cjs L196-197 = highest revolving × 5.5 per
bureau; L260-263 sums every available bureau; L270-271 drops to 1/3 only when exactly 1 bureau is
fundable; loans ×3.0 added at L275; business L277-285 = 0.5×/1×/2× by age, applied to the primary
bureau's card number.

Run one sample credit file through the engine. Report on the board: which file, what the engine
prints, Chris's math by hand, the gap. Then ask Chris, one at a time, and wait:
  a. Does the 5.5× apply once, or once per bureau?
  b. Is business ≈ 2× personal, or tied to business age?
```

### W6 — funnel copy, marked drafts only

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai. Read CLAUDE.md first.
Board: ops/workflows/business-todos-2026-10-04.md. Mark W6 "claimed" there before you start.

Follow .claude/rules/page-edits-marked-draft.md exactly. Marked draft first. Nothing goes live.
Model the build on marketing/landing-pages/slo/preview/reorg-draft-build.mjs. Page HTML is under
marketing/landing-pages/.

1. /roadmap "How It Works" has 5 steps. The 7-step note is marketing/ads/notes-green-screen.md:54-67.
   Red-box draft that reorders it to match the note.
2. "Up to 12 funding rounds" is live on /watch, /thank-you, /funding-book-call, /roadmap-book,
   /roadmap-thank-you. The model is 3–6 rounds. Red-box each one with the fix.

Share as one Artifact link and put it on the board. Push nothing to ClickFunnels.
```

---

## Manifests

### W1 (lead session) — 2026-10-05
- Re-checked the whole list (four read-only checkers). Results above.
- Tried to make the repo private: refused by the cloud proxy (policy, not retried). Moved to Chris (U2).
- Fetched GitLab `main`, `ad-scripts-2026-10-02`, `all-scripts-2026-10-03` into local refs `refs/gl/*` for U4.
