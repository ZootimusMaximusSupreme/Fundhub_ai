# Colin Testimonial #2 — replace Colin #1 on SLO page (2026-10-01)

| Unit | Owner | Status |
|---|---|---|
| A — script analysis (hook, caption, facts) | Sonnet subagent | done |
| B — Drive find, cover (Opus), swap Colin #1 | main session (Opus) | done — live 2026-10-02 (ship 4ad9f02c, CF push) |

## A — analysis

### 1. Top 3 hooks (built only from his words)

1. **Around $225,000 in funding** (accent: `$225,000`). Source: "I got right around $225,000" and "the total in funding was around $225,000".
2. **An 840 credit score from the roadmap** (accent: `840`). Source: "I was able to attain an 840 credit score", after "the roadmap showed me the dispute letters that I needed to fix my credit".
3. **$50,000 Chase card, then five more banks** (accent: `$50,000`). Source: "a $50,000 business credit card through Chase. And then we went to about five other banks."

**Pick: #1.** It is the biggest number, he says it twice, and it is the result a stranger wants. It matches the existing cards that lead with a dollar figure (Gene: "About $420,000 over three years"; Sarah: "Set to be approved for around $80,000"). Hook #2 is the fallback if a different shape is wanted next to Gene and Sarah. "Around" is kept because he says "around"; do not turn it into an exact figure.

### 2. Caption (under the card)

Colin Schmidt, business owner. He used the roadmap's dispute letters and bank order to reach an 840 credit score, then got around $225,000 in funding for one of his companies.

### 3. Every number and fact he states, quoted exactly

- "about a year" ("It's been about a year and I got the roadmap")
- "the roadmap showed me the dispute letters that I needed to fix my credit"
- "I was able to attain an 840 credit score"
- "it laid out exactly what banks to go for, in what order to achieve the funding that I desired"
- "Now I desire to get maximum funding"
- "with one of my companies, I got right around $225,000"
- "a $50,000 business credit card through Chase"
- "about five other banks"
- "One of them had a business line of credit for $100,000"
- "I got a couple other business credit cards as well"
- "the total in funding was around $225,000"
- He names Chris Stanbridge and "the roadmap"; he introduces himself as Colin Schmidt.

### Not said, so not allowed on the card
- Not said: any dollar amount for the "couple other" cards, which banks besides Chase, his starting credit score, the business type or industry, or that the $225,000 is his total across all companies (he says it was "with one of my companies").
- "about five other banks" is not "five banks": the Chase card came first, then about five others.
- The $225,000 is not stated as a sum of the $50,000 and $100,000; the rest is "a couple other business credit cards".
- Copy rules checked: no "credit repair" (he says "fix my credit"; the card says dispute letters / credit score), no metaphors, no slogans, cause before effect, Fundhub spelled correctly.


## B — manifest

(pending)

## Blockers

none

## B — progress

- Drive file: `Colin Testimonial #2.MOV`, id `1Fn_Cvi7YrHPKDOk6yQtH9rtfB0fhqdLH`, 1.5 GB, downloaded to session scratch.
- Video: 2:02, 4K tall (2160x3840 after rotation), 60fps, HDR (HLG, 10-bit). Raw: no burned-in captions.
- HDR means the encode must tone-map to normal color, or the web copy looks washed out.
- Waiting on Chris to sign off on the hook (skill step 3) before rendering.

## B — status 2026-10-01 (blocked)

- Cover rendered: `public/testimonials/thumbnails/colin2.png` (hook "Around $225,000 in funding"), frame 0:30, record `colin2` in testimonials.json as `draft`.
- Chris: the video needs eye contact correction and captions. The raw MOV has neither.
- Blocked 1: Submagic API (docs.submagic.co upload-project) has no eye-contact field. No eye-contact tool exists in the repo.
- Blocked 2: tool permission check refused the edit to `marketing/landing-pages/slo/slo-01-sales.html` and refused reading `.env` key names.
- Uncaptioned web encode at `public/funnel/slo-testimonial-colin2.mp4` is NOT committed; it is the wrong video.

## B — status update (unblocked on video)

- Right source: Chris's Submagic export `Colin Testimonial #2.mp4` (captions + eye contact, 1440x2560, 2:02), from ~/Downloads.
- Cover re-rendered from it (frame 0:30); poster `public/funnel/slo-testimonial-colin2-poster.jpg`; web video `public/funnel/slo-testimonial-colin2.mp4` (1080x1920, 40 MB).
- `colin2` approved, `colin` marked replaced in testimonials.json.
- Still blocked: tool permission check refused editing `marketing/landing-pages/slo/slo-01-sales.html` (the card swap). Then: npm run ship → cf push slo-297-sales → prove live.

## B — status: page edited, ship blocked

- Card swap committed: f941b315 (only the Colin hunks; another session's uncommitted checkout edits in the same file were left alone).
- `npm run ship` refuses: 2,401 uncommitted files in the tree (not this workflow's). Ship also requires branch `main`, so a clean side copy cannot ship either.
- Not live yet. Needs: ship (video + poster to fundhub.ai/funnel) → `cf-push-custom-html.mjs push --only=slo-297-sales` → cache-bust proof.
