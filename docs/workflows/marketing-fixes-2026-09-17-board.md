# Marketing walkthrough fixes board — 2026-09-17

**Source of the defects:** `marketing-walkthrough-2026-09-17-board.md` (walker) and
`-validate.md` (second agent, 6 CONFIRMED / 0 contradicted).

**Owner order, 2026-09-17:** "acknowledge not to fix anything that wasnt scoped out. then run
them all." Three fixes authorised. Nothing else. A correct fix to an unscoped defect is still a
failed task.

## Result

| Unit | What | Status |
|---|---|---|
| F1 | Creative Factory script drop-down reads "— none —" after a script saves | **done** — fixed, tested, committed `6e93c3e7` |
| F2 | The /watch page records no views | **needs Chris** — no code can fix it |
| F3 | Social Studio "Write 3 posts for me" writes 0 drafts | **needs one permission** — no code fixes it either |

Run as one Workflow: diagnose (3 parallel, read-only) → fix (serialised, one shared tree) →
verify (2 lenses per fix: does it work, did it stay in scope) → whole-diff scope audit.
7 agents, 0 errors.

## F1 — fixed. Commit `6e93c3e7`.

The save half of "save this script" shipped on 2026-09-08. The read half was never built.
Nothing on the server would hand saved scripts back, so the drop-down was filled only in browser
memory at the moment of saving. A reload wiped it back to "— none —", and a script written
yesterday could never be attached to anything.

Files: `api/scripts/list.mjs` (new), `src/http/scripts-list.pg.test.mjs` (new),
`public/app/creative-factory.html`. The route registration in `netlify/functions/api.mjs` and
the guard in `src/ui/label-chain-reachable.test.mjs` were swept into `bf24b6c8` by another lane
before this commit landed — see "main was broken" below.

Proof: 9/9 pass, **0 skipped**, against a real `DATABASE_URL`. The test writes through
`api/scripts/write.mjs` and reads through `api/scripts/list.mjs`, and asserts partner isolation
in both directions, so an endpoint returning nothing could not pass it. Routes + label-chain
guard 35/35. An independent verifier re-ran it and drove a real browser against the real handler
and the live database: after a full reload the drop-down held the exact script the 2026-09-17
walk saved and could never see again. Both verify lenses returned holds=true.

## F2 — no code fixes this. A person has to paste.

`apply.fundhub.ai/watch` is a ClickFunnels page. This repo cannot reach it, so no deploy from
here can ever change it. Everything on our side is already finished and live: the beacon
endpoint answers on fundhub.ai, the migration is applied, both tables exist and are empty.

The step: open the ClickFunnels page editor and paste
`clickfunnels-fragments/06-utm-hidden-fields.html` at the top and
`clickfunnels-fragments/07-vsl-watch-beacon.html` at the bottom, then Save and Publish.
Connecting to ClickFunnels is on the red list and was not attempted.

## F3 — not a missing social account. A fake password.

The walker's guess was wrong, disproved two ways: the drafts table has no account column at all,
and its own comment says it exists for "generated posts before a social channel exists." A draft
needs no connected account.

Real cause: the `OPENAI_API_KEY` stored on the live site is the **blanked-out** form of a key —
sixteen asterisks and four characters, what you see on screen when a password is hidden. Someone
copied the mask instead of the value. OpenAI refuses it with a 401. Because *a* key is present,
the code never falls through to Anthropic — and the Anthropic key on the site is valid (measured
200). So the button asks a locked door and gives up. The screen does print "The writer is not
switched on, so nothing was written"; nobody captured that line on the walk, which is why it was
recorded as nothing happening.

The fix is deleting one bad setting. No new secret needed:

    netlify env:unset OPENAI_API_KEY --context production
    netlify env:unset OPENAI_API_KEY --context deploy-preview
    netlify env:unset OPENAI_API_KEY --context branch-deploy

**Not applied.** The harness permission guard refused `netlify env:unset` with
`[Secret-Store Writes]`, and refused every attempt to inspect the key's shape with
`[Credential Materialization]`. Not routed around.

Blast radius when applied, flagged so nobody is surprised: `src/company-brain/answer.mjs` and
`src/company-brain/classify.mjs` pick the provider the same way, so Company Brain is quietly
taking the same 401s. Removing the bad variable fixes those too. No repo file should be edited
to work around this.

## main was broken, and it was not this work

`bf24b6c8` ("five lanes applied (UNVERIFIED — tests not yet run)", 15:41) committed the new
route — `netlify/functions/api.mjs` importing `../../api/scripts/list.mjs` — **without** the
handler file, which was left untracked. main therefore imported a file that was not in git. A
build from a clean checkout would have failed to load the API function and taken every route
down with it. It only worked because the file happened to exist on this laptop. The same commit
took a guard asserting the screen calls `/api/scripts/list` while leaving that screen
uncommitted, so HEAD's own suite would have failed too.

`6e93c3e7` commits both halves together and repairs it.

## Not shipped, on purpose

`npm run ship` refuses an uncommitted tree by design (`scripts/ship.mjs:60`). A second session
was editing this repo throughout this run — about 50 tracked files modified, still changing at
15:52, and it deleted this board's first draft as an untracked file. Shipping would mean
committing another lane's in-flight, self-declared UNVERIFIED work. Held.

## Out of scope — found, written down, deliberately not touched

- The angle / hook / offer suggestion lists on the same screen have the **identical**
  missing-read bug as F1. `public/app/creative-factory.html` says so in its own comment: nothing
  reads the label dictionary back and there is no endpoint for it. One endpoint could serve both.
- `clickfunnels-fragments/harness/build.mjs` never sandwiches fragment 07 into
  `harness/watch.html`, so there is no local browser proof of the beacon script anywhere — the
  only proof is a fake-browser test.
- The local `.env` carries the same fake OpenAI placeholder, so a local run fails identically.
- `src/funding/approval-amount-guard.pg.test.mjs` has an existing test whose assertions were
  inverted by another lane.
- Three pre-existing failures in `src/http/crm-html.test.mjs`, matching the recorded baseline at
  `2aae7dc2`.

Also named as broken on the walk and left alone from the start: no picture/video maker switched
on, house partner has no Meta ad account, YouTube not connected, `docs/ads/scripts/` holds only a
README. 21 of 24 ads untitled is not a defect (CLAUDE.md §3c — ads are identified by id).
