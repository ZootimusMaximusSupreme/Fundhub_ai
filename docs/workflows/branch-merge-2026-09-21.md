# Branch merge — 2026-09-21

Main before merges: `38477b32`. Tracked step-1 sales work stashed as `step1-slo-sales-before-branch-merge`, then restored after merges.

## Already on main (branch deleted, no merge)

| Branch | Why skipped |
|--------|-------------|
| `fix/r2-n9-letter-address` | N9 letter address fix already on main (`371db392`, `a0f82a3f`, `c4c25d69`). Branch tip `6ec77d8f` — zero diff on letter paths vs main. |
| `fix/r2-n10-sim-push-credit` | N10 push-credit patch identical to `f1a19c82`; main has round-b wording (`0110f27e`). |
| `fix/r2-n12-sample-labels` | N12 sample labels on main (`2ce0a652`, `f86ff4fc`). Branch only differed on unrelated `outboxStatus` removal main already has. |
| `merge/claude-payout-2026-09-21` | No commits on branch that main lacked (`git log main..branch` empty). |

Worktrees under `.claude/worktrees/` removed before branch delete.

## Merged (cherry-pick, not full merge)

| Branch | Action |
|--------|--------|
| `claude/slo-offer-financial-model-fo8uy1` | **Full merge refused** — branch is a stale fork (~1,500 files behind main; would delete most of the product). Unique functional commit `e452e139` (**SLO post-purchase kill switch** `SLO_POST_PURCHASE_ENABLED`) cherry-picked onto main as `b75cf7f5`. Conflicts: `TODO.md` (kept main), `src/slo/offer.mjs` (kept main `/roadmap/pull.html`, not branch `/slo/pull.html`). Other branch commits (N9/N11 duplicates, lender CSV, climate docs) already on main under different SHAs. Branch deleted. |

## Conflicts / what went wrong

1. **fo8uy1 is not mergeable as a branch** — treating it like a feature branch would revert ClickFunnels push tooling, SLO HTML, migrations, and hundreds of live paths. Only the post-purchase flag commit was safe to land.
2. **Cherry-pick `e452e139`** — `TODO.md` and `src/slo/offer.mjs` conflicted; resolved by keeping main’s roadmap pull path and current TODO.
3. **Fix branches (N9/N10/N12)** — tips were not git ancestors of main but **content-equivalent** to fixes already merged via `fix/r2-*-b` round-b merges.

## Result

Local branches after step 2: **`main` only**.
