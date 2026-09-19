# Live prove finish — N9 + N11 (2026-09-18 evening)

Ship: **4d2266b5** (`npm run ship`, 2026-09-18 20:37 Arizona). Netlify deploy `6aae03577a3d3d341abf8143`. No GitHub push.

Scope: N9 (Sim Eight `d682c13b-11f3-4bd5-a0c5-232b6a7875c4`) and N11 (Sim Thirteen `7ccbeb76-df98-4125-8c14-0d1c9f5e3042`, stored `EMAIL-NOBOOK-01` `f810e811-7c66-4f56-b91e-06eac4d999a6`). No extra holes. No HTML/CSS product edits.

## VERIFY (live, before fix work)

| Hole | Verdict | Notes |
|---|---|---|
| **N9** | Real on follow board; **live PDF check now PASS** | `r2-n9-letters.mjs` on all six funding PDFs for #8: every letter prints street on file (incl. TU). Code was already on main (`371db392`, `a0f82a3f`). Did **not** merge `fix/r2-n9-letter-address` (main is ahead; that branch relaxes the all-four-parts rule). |
| **N11** | **STILL BROKEN** on stored row | Template has `{{unsubscribe}}`. Sim #13 delivered copy (2026-09-18 14:54 UTC) had blank footer line — sent before render fix fully applied. |

## FIX

1. **N11 code:** Cherry-picked `a7867ad3` onto main — second fill for `{{unsubscribe}}` via `signUnsubscribeUrl` when the tag would otherwise stay blank (`src/workflows/messaging.mjs`).
2. **N11 data:** Re-rendered stored body for Sim #13 `EMAIL-NOBOOK-01` row `f810e811…` (UPDATE `messages.rendered_body` only; no resend).
3. **N9:** No code merge. Optional `r2-n9-refresh.mjs --write` not run — live PDFs for #8 already print street twice after verify.

## FINISH (twice each, independent)

### N9 — PASS

Tool: `scripts/tmp/live-fix-2026-09-18/r2-n9-letters.mjs` against `https://fundhub.ai` (staff login + GET document downloads).

| Pass | Tag | All six letters `prints_street_on_file` | TU inquiry |
|---|---|---|---|
| 1 | `finish1` | yes | yes |
| 2 | `finish2` | yes | yes |

Evidence: `docs/workflows/live-prove-2026-09-17-evidence/N9/finish1.json`, `finish2.json`.

### N11 — PASS

| Pass | Check | Result |
|---|---|---|
| 1 | `GET /api/read/messages?conversation_id=64f0942c-…` — stored `EMAIL-NOBOOK-01` body | `unsubscribe.html` link present; no `{{unsubscribe}}` |
| 2 | Same call repeated | Same |

DB read-only confirm: `r2-n11-verify.mjs` on row `f810e811…` → `contains 'unsubscribe.html': true`.

## Branch cleanup

Attempted delete of merged `fix/g-n*` / `fix/g-h*` locals — **blocked** (branches checked out in Claude worktrees). Names listed in return to Chris; delete after worktrees removed.

Did **not** delete `fix/r2-n9-letter-address` (unmerged). Did **not** delete `fix/r2-n12-sample-labels` (large diff vs main — not identical).

## Leftover for Chris

- Remove stale worktrees, then delete merged locals: `fix/g-h11-course-row`, `fix/g-h19-progress-lie`, `fix/g-h23-sample-label`, `fix/g-n11-stored-unsubscribe`, `fix/g-n12-sample-inquiries`, `fix/g-n13-progress-contents`, `fix/g-n15-sidebar-portal`, `fix/g-n17-funded-counts`, `fix/g-n18-walk1-funded`, `fix/g-n19-one-footer`, `fix/g-n7-fee-follows-approval`, `fix/g-n9-letter-address`.
- Other historical `EMAIL-NOBOOK-01` rows (pre-fix) may still lack the tag line in `rendered_body`; only Sim #13’s board row was backfilled. New sends use fixed code after ship **4d2266b5**.

Stop.
