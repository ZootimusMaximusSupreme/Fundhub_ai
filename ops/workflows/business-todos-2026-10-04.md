# Business to-dos — work board (2026-10-04)

Source: Chris's "Now — 2026-10-04" business list, pasted 2026-10-04.
Rules: read `CLAUDE.md` first. Claim your row before you start. Write your manifest here when done.
Only W4 runs `npm run ship`. Everyone else commits and pushes to `origin` (GitHub) only.

## Facts checked 2026-10-04 (so nobody re-checks them)

- GitHub `ZootimusMaximusSupreme/Fundhub_ai` is **not empty**: `main` is there at `1fbc0fa`. It is **public**.
- `public/funnel/slo-testimonial-colin.mp4` is **34.7 MB** in the tree now, under GitHub's 100 MB cap. `main` already pushed fine.
- From the cloud, `api.netlify.com`, `api.supabase.com`, `api.myclickfunnels.com` and `api.inngest.com` all answer (no proxy 403).
- Live `https://fundhub.ai/api/health`: ok, db up, pending 0.

## Task list

| ID | Owns | Status | Model |
|---|---|---|---|
| W1 | Make GitHub repo private; save the new list into `TODO.md`; follow-up text fix | claimed (this session) | Opus |
| W2 | GitLab → GitHub in rules and scripts; then consolidate conflicting rules | pending | Opus |
| W4 | Turn on Meta server-side events (CAPI) and prove Lead + Schedule | pending | Opus |
| W5 | UnderwriteIQ math check against Chris's math (read-only until he decides) | pending | Opus |
| W6 | Marked drafts: /roadmap How It Works order, "12 funding rounds", refund-window spots | pending | Opus |

No dependencies. All run at once. (W3 was folded into W1.)

## Open questions for Chris (one at a time, in this order)

1. W1: The no-reply follow-up text (`src/workflows/slo-no-reply-197.mjs`) offers $197. Lower it to $147, or turn that text off?
2. W5: Does the 5.5× apply once, or once per bureau?
3. W5: Is business ≈ 2× personal, or does it stay tied to business age?
4. W6: Refund window: 7 days or 30 days?

## Chris only (no agent can do these)

Financing approval. Filming. Mastermind the offer. Apple developer account ($99/yr). Sales manager hand-offs. ClarityPay and Plaid calls. Old-client texts.

---

## Prompts (paste one into a new session)

### W2 — rules: GitHub is home, then one set of rules

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai. Read CLAUDE.md first.
Board: ops/workflows/business-todos-2026-10-04.md. Mark W2 "claimed" there before you start.

Owner call 2026-10-04: "we quit gitlabs." GitHub is the repo's home now. This replaces the
CLAUDE.md section "GitHub is banned. GitLab is the remote".

Part 1. Rewrite every rule, script and note that says GitLab is the remote or GitHub is banned,
so they say GitHub is the remote:
- CLAUDE.md, that section (keep it unnumbered; do not renumber any section)
- .claude/rules/gitlab-push.md and .cursor/rules/gitlab-push.mdc (same words in both)
- scripts/gitlab-push-whole-repo.mjs (rewrite for GitHub or retire it; say which)
- the comment at the top of scripts/ship.mjs
- every other hit from: grep -ril gitlab CLAUDE.md .claude .cursor scripts docs/sops
Do not remove any key or env var.

Part 2. List every rule that contradicts another across CLAUDE.md, .claude/rules and
.cursor/rules. One line each: the two rules, and which wins (the newer owner-set date wins).
Fix the losing side so Claude and Cursor say the same words. No app code.

Run npm run lint. Commit, push to origin. Write your manifest on the board. Do not ship.
```

### W4 — Meta server-side events on

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai. Read CLAUDE.md first.
Board: ops/workflows/business-todos-2026-10-04.md. Mark W4 "claimed" there before you start.

Server-side Meta Conversions API (CAPI) was built 2026-10-02 and stays off until
META_CAPI_ENABLED and META_CAPI_ACCESS_TOKEN are set. Find the code with: grep -rn META_CAPI src api netlify.

1. Read .env (gitignored) and Netlify env for a Meta access token that can send events for the pixel.
2. If one exists: set META_CAPI_ENABLED and META_CAPI_ACCESS_TOKEN on Netlify production, deploy-preview
   and branch-deploy per CLAUDE.md section 11 (--secret on the token). Never unset or overwrite an existing key.
3. Ship once with npm run ship.
4. Fire one Lead and one Schedule through the real path with a Meta test event code, and prove both
   show in Events Manager Test Events (read it back by API). Paste the proof on the board.
5. If no token exists anywhere: write the env name on the board as blocked and stop.

Do not touch pixel conditioning or the ShowedCall event. Those are separate items.
```

### W5 — UnderwriteIQ math check

```
Fundhub repo, GitHub ZootimusMaximusSupreme/Fundhub_ai. Read CLAUDE.md first.
Board: ops/workflows/business-todos-2026-10-04.md. Mark W5 "claimed" there before you start.

Read-only until Chris answers. Change no code.

Chris's math: highest card limit × 5.5 = personal. Business ≈ 2× personal. Personal loans on top.
A $20K card ≈ $110K personal, ≈ $220K business.

What the code seems to do: src/underwrite/vendor/underwriter.cjs lines 196–286 applies 5.5× on each
clean bureau and adds all three ($20K card → $330K personal). Business doubles only at 2+ years
(1× at 1–2 years, 0.5× under 1 year). See TODO.md around line 1038 for the earlier note.

1. Read the code and confirm or correct both claims, with line numbers.
2. Run one sample credit file through the engine (find fixtures under src/underwrite, docs/underwriteiq,
   or tests). Report: which file, what the engine prints, Chris's math by hand, and the gap.
3. Write it on the board. Then ask Chris these, one at a time, and wait:
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

1. /roadmap "How It Works" has 5 steps in a different order than the 7-step note
   (find it: grep -ril "7-step" marketing/). Red-box draft that reorders it to match the note.
2. The marquee on /watch, /apply, /book and /thank-you says "Up to 12 funding rounds." The model is
   3–6 rounds. Red-box each one with the fix.
3. Refund window: most pages say 7 days, about 12 spots say 30 days. Red-box every spot. Do not pick
   the number. That is Chris's call.

Share as one Artifact link and put it on the board. Push nothing to ClickFunnels.
```

---

## Manifests

(Each workflow writes its own here when done.)
