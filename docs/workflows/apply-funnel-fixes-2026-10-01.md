# Apply funnel fixes — 2026-10-01

Chris asked, in one chat, for four page fixes. Owner law: page edits get a marked draft first,
pushed live only when Chris says push it (`.claude/rules/page-edits-marked-draft.md`).

Heads-up: `docs/workflows/repo-restructure-2026-10-01.md` W5 will move `clickfunnels-fragments/`
once Chris says go. Nothing has moved yet. If it moves mid-work, re-read paths from that board.

## Status

| # | Work | Page | Owner | Status |
|---|---|---|---|---|
| A1 | Question 4 ("What Would This Money Change Right Now?"): no Next button. One tap moves on. | https://apply.fundhub.ai/apply | session 1 (survey chat) | done — live 2026-10-01 |
| A2 | The jump to "You're qualified" looks broken: the "Reviewing your answers" checklist crushes into circles | https://apply.fundhub.ai/apply | session 1 | done — live 2026-10-01 |
| A3 | "You're qualified" screen slides down to the calendar by itself | https://apply.fundhub.ai/apply | session 1 | done — live 2026-10-01 |
| B1 | Line under the headline → "Find out exactly what you and your businesses qualify for in one call" | https://apply.fundhub.ai/watch | session 1 | done — live 2026-10-01 |
| C1 | Thank-you page: mobile friendly, stop it looking bad | https://apply.fundhub.ai/thank-you | session 1 | done — live 2026-10-01 |

A and B/C touch different pages and different files. No dependencies — all parallel.

## Ground facts (measured 2026-10-01)

- `/apply` is a full custom HTML page: `clickfunnels-fragments/apply-survey.html`, pushed by
  `scripts/cf-push-custom-html.mjs` (manifest key `apply-survey`, page 25068989).
- `/watch` (page 25061160, fragment `clickfunnels-fragments/01-vsl.html`) and `/thank-you`
  (page 25063539, fragment `clickfunnels-fragments/05-thank-you.html`) are ClickFunnels
  **builder** pages. The API cannot replace their body; new sections ride in on footer scripts
  (`public/funnel/thankyou-sort.js`, `public/funnel/funding-paths.js`, `public/funnel/watch-proof.js`).
  Manifest: `clickfunnels-fragments/tracking-manifest.mjs` `PUSH_MANIFEST`.
- The funding-paths graphics moved from /watch to /thank-you today (commit 3b0b94b9). A thank-you
  marked draft already exists: `clickfunnels-fragments/preview/thank-you-draft-build.mjs` (commit 35858b72).

## A — findings (session 1)

- A2 cause: in `apply-survey.html` the CSS rule `.done .ok` (the big green check circle) also
  hits each finished checklist row (`.load li.ok`), because both sit inside `.q.done`. Each row
  turns into a 48px circle with 22px text. Seen live on desktop and phone.
- A3: the page already calls an auto-scroll 1.6 s after "You're qualified". It fires in Chrome
  in a test walk. Chris does not see it. Fix makes it sooner and re-checks it landed.

## A — manifest (session 1)

- Draft link (same link every round): https://claude.ai/artifact/78MTpJmEUn8qMP5Qg4Xfpo
- Builder: `clickfunnels-fragments/preview/apply-survey-draft-build.mjs` (reads `apply-survey.html`, never changes it).
  Writes `apply-survey-fixed.html` (clean, goes live on "push it"), `apply-survey-draft.html`, `apply-survey-draft-share.html`.
- Live file `clickfunnels-fragments/apply-survey.html`: NOT changed yet. Five spots change on push:
  `.done .ok` → `.done > .ok`; question 4 hint → "Pick the one that matters most."; no Next on question 4;
  one tap on question 4 saves `[choice]` (still a list, so the webhook and CRM read it the same) and moves on;
  auto-slide to the calendar at 0.9 s with a re-check at 2.4 s (was a single smooth scroll at 1.6 s).
- Proof: local walk of the fixed page, desktop 1280 and phone 390: question 4 has 0 Next buttons and moves on after one tap;
  calendar top lands 16 px from the top about 1.4 s after "You're qualified". Before/after: `apply-funnel-fixes-2026-10-01-evidence/checklist-before-after.png`.
- On push: copy `apply-survey-fixed.html` over `apply-survey.html`; update `clickfunnels-fragments/tests/apply-survey.spec.mjs`
  (walkTrunk clicks Next after the checkbox — remove that click); push with `scripts/cf-push-custom-html.mjs` (key `apply-survey`); prove live with a cache-busted URL.

- PUSHED 2026-10-01 on Chris's "push": `apply-survey.html` = `preview/apply-survey-fixed.html`; spec updated (asserts 0 Next buttons on question 4);
  `npx playwright test tests/apply-survey.spec.mjs` 6/6 pass; `cf-push-custom-html.mjs push --only=apply-survey` ok (page 25515671, ingest + attribution kept).
  Live proof (cache-busted, real Chrome, lead send and Meta blocked so no lead was created), desktop 1280 and phone 390:
  0 Next buttons on question 4, one tap moved on, checklist rows 36-37 px tall (were crushed), calendar landed 16 px from top
  about 1.1 s after "You're qualified", 0 page errors.

## B1 + C1 — manifest and live proof

- PUSHED 2026-10-01 on Chris's "push": both blocks (watch-lede, ty-fit) appended to pages 25061160 and 25063539, verified by the API.
  Live (cache-busted): new line on /watch, fit block on /thank-you. ClickFunnels pages serve the changes within 30 seconds of push.

## B1 + C1 — how they work (session 1)

- Draft link (same link every round): https://claude.ai/artifact/X24HWXafwnoyRhu1D2Tyfe
- Builder: `clickfunnels-fragments/preview/watch-thankyou-fit-draft-build.mjs` — before/after shots from the live pages,
  the block added in the test browser only; throws if desktop moves or the new line stays hidden.
- B1 block: `clickfunnels-fragments/01b-watch-lede.html` (marker `fh-watch-lede`, /watch head_code). Sets the new words on load;
  old line hidden until then, shown anyway after 1.5 s if the script never runs.
- C1 block: `clickfunnels-fragments/05b-thank-you-fit.html` (marker `fh-ty-fit`, /thank-you head_code). Under 768px the
  ClickFunnels section/row layers drop side padding and `.wrap` keeps 16px. Content 222 → 358 px of 390; page 7795 → 6144 px;
  1280px desktop identical (5585 px tall, 852 px content).
- Push entries added to `PUSH_MANIFEST`: `apply-watch-lede`, `apply-thank-you-fit` (strategy `code_block_upsert`).
  Dry runs: both "append", ok. Nothing pushed.
- On push: `node scripts/cf-push-custom-html.mjs push --only=apply-watch-lede` and `--only=apply-thank-you-fit`, then prove both live (cache-busted).

## Leftover cards (not worked)

- `src/ads/funnel-proof-scripts.test.mjs` "01-vsl.html loads watch-proof.js … and no funding-paths.js" fails at HEAD:
  committed `clickfunnels-fragments/01-vsl.html` still carries funding-paths.js (last touched e4d068f0, 17:38 merge). Not caused by this board.

## Prompt B — paste into a new chat (owns B1 + C1)

```
Fundhub repo /Users/chrisstanbridge/Developer/fundhub-platform. Read CLAUDE.md first.
Board: docs/workflows/apply-funnel-fixes-2026-10-01.md. Mark B1 and C1 "claimed" (owner: session 2) before you start.

Two page fixes. Owner law: marked draft first (.claude/rules/page-edits-marked-draft.md). Red marks with a fix under each, then green when Chris says fix it, shared as one Artifact link he opens on his phone. Push live only when he says push it.

B1. https://apply.fundhub.ai/watch — the line under the headline reads "Find out exactly what your business qualifies for in one call". Chris wants: "Find out exactly what you and your business(s) qualifies for in one call", grammar fixed → "Find out exactly what you and your businesses qualify for in one call". Change only that line.

C1. https://apply.fundhub.ai/thank-you — Chris: "make it mobile friendly and fix it please so it doesnt look like shite". Walk it at 390px and 1280px with Playwright and list every visual break on the marked draft.

Both are ClickFunnels builder pages: the API cannot replace the body; changes ride in on footer scripts or a marked head_code block. Read clickfunnels-fragments/tracking-manifest.mjs (PUSH_MANIFEST entries apply-watch and apply-thank-you), scripts/cf-push-custom-html.mjs, public/funnel/funding-paths.js, public/funnel/thankyou-sort.js, and the existing draft builder clickfunnels-fragments/preview/thank-you-draft-build.mjs (commit 35858b72). public/funnel/* is served from Netlify, so a change there ships with `npm run ship` once at the end. Chris never logs into ClickFunnels. API only.

Do not touch clickfunnels-fragments/apply-survey.html (session 1 owns it). Commit locally. Write your manifest to the board when done.
```
