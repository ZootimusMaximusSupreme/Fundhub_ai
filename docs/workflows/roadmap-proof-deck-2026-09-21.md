# Roadmap proof deck — 2026-09-21

Live page: https://apply.fundhub.ai/roadmap (ClickFunnels custom HTML page 25426320, manifest key `slo-297-sales`)
File: `clickfunnels-fragments/slo/slo-01-sales.html`
Headline that stays: "Your Credit File Could Be Worth $100K to $1M in Funding, and We'll Show You How to Get There."

## Tasks

| Unit | Owner | Status |
|------|-------|--------|
| W1 Images and amounts: high-res slides from Canva, crops, amounts, real quotes | this session (workflow agents) | done |
| W2 Design and build: cards, sticky shuffle, blue pills, checkout box, mobile pass | this session | done |
| W3 Push only the sales page, live scroll proof | this session | done |

Chris said "go on all of them" (2026-09-21), so one session runs all three.

## Shared brief

- Brand: monochrome (Paper #FFFFFF, Ink #0C0C0D, Graphite #56565C, Steel #8A8A90, Hairline #E4E4E7, Surface #F6F6F7). Inter for words, JetBrains Mono for labels and numbers. No em-dashes in copy. Company name "Fundhub".
- Owner-set accent for the course pills: #2563EB with a light blue fill, 300ms.
- Card template: `clickfunnels-fragments/slo/fundhub-proof-cards.html` (do not edit). Rule: `.cursor/rules/proof-cards-from-source.mdc`.
- Source: Canva "Client Wins - Funding - Your Story", 38 pages (page 38 blank). The view link opens without a login. Slides were rendered at 3x (2741x4699) for crisp crops.
- The amount on a card is read off the approval screenshot or the client's own chat text. It never comes from the yellow "APPROVED FOR $X" headline.
- First names visible inside screenshots get blurred. There are no faces on cards and no names on cards.
- Image host: ClickFunnels image library (statics.myclickfunnels.com) through the Images API. It needs a public source URL, and `data:` URIs are rejected (measured: 422).

## Owner changes mid-run (2026-09-21)

- The wins sit in the small Community box in What You Get, not a big section at the bottom. The row of three boxes pins while the Community cards flip.
- The whole page must be mobile friendly.
- Every CTA goes to the checkout part of the page, and that part is the checkout already built: pay page, then Commas card page, then pull form, then the next page.

## Change manifest

W1 (20 workflow agents: 10 extract, 10 adversarial verify, max 5 at once)
- 38 Canva pages rendered at 3x from the public view link. 37 slides cut into approvals, stacks and client quotes. Names, avatars, faces, card numbers, QR codes and barcodes blurred.
- Amounts come from the screenshot or the client's own message only. The yellow headline never counts.
- Picked 18 credit card approvals, every one verified ok and privacy clean, total **$483,500**. 4 real client quotes.
- Dropped as not proven credit card: $14K (s28), $25K (s34), $45K (s35). The $25K and $45K messages are used as quotes with no amount. Dropped: KeyBank $49,764 (line of credit), s32 stack (two posts, no proof it is one client), duplicates s07-b = s25-a and s05-a = s26-a.
- Files: `clickfunnels-fragments/slo/client-wins/deck/*.jpg` (22 crops), `deck.json` (amount, where it was read, lender, alt, ClickFunnels URL).
- Hosting: `upload-deck-images.mjs` puts the crops on a Netlify DRAFT deploy (never production) as a pickup point, then the ClickFunnels Images API copies them to statics.myclickfunnels.com (public, cached 6 months). All 18 URLs answered 200 image/jpeg.

W2
- `clickfunnels-fragments/slo/slo-01-sales.html`
  - Deck lives in the Community box (`#fh-community-proof`). `.slimrow` is sticky inside `#fh-deck-runway`. The runway spacer is one 30vh step per card. Desktop is 2 columns (course and Advisors left, Community right). Phone is 1 column, pinned so the Community box sits above the bottom CTA bar.
  - Cards use the proof-card template markup and switches (win: photo off, name off; quote: photo off, name blur). The template CSS is copied unchanged. Deck styling is scoped under `.proof-shuffle-deck`.
  - One passive scroll listener, requestAnimationFrame throttled. The front card tosses up and goes to the back, and scrolling up reverses it. The counter, running total and progress bar follow. Reduced motion gives a horizontal scroll-snap row with no pin.
  - Pills: an IntersectionObserver with rootMargin "0px 0px -35% 0px" lights a pill #2563EB on #EFF6FF over 300ms, and turns it off when it goes back below the line. Reduced motion: instant, no glow.
  - Checkout box (`#fh-cf-form`) was a placeholder for a ClickFunnels order form a custom HTML page cannot hold. It is now three step chips, $297 total and a "Get My Roadmap · $297" link to https://fundhub.ai/roadmap/pay.html carrying the first-touch utm_* tags. Two checkout lines now describe that flow.
  - `overflow-x:hidden` on html, body and .fh-root now also sets `overflow-x:clip` (hidden breaks sticky).
  - Mobile: the "From people who bought it" grid overflowed the screen at 360 to 430px. It now fits.
  - Removed: the 4 old cards with 1.7 MB of inline images. Simulated sample results turned off (`FH_SIM = false`). Page went from 1.8 MB to 140 KB.
  - Restored the `fh-attribution.js` tag the fragment had at HEAD.
- `clickfunnels-fragments/slo/client-wins/build-deck.mjs` fills the cards and totals from deck.json.
- Journeys: `docs/journeys/slo-offer-actual.md` (CF sales page -> pay.html), CHANGELOG line.
- Proof so far (local copy of the exact push wrapper, Playwright): all 22 cards step through at 390x844 and 1280x800 and reverse on scroll up. All images load, no script errors, no horizontal overflow at 360/390/430, and the pay link carries utm_source and utm_content.
- Suite: 13 fail now vs 11 at HEAD in a clean worktree. The 2 extra read `public/roadmap/index.html`, which is deleted in the working tree by another session. With that file present, the sales page passes the UTM test.

W3
- Pushed `slo-297-sales` only (page 25426320) via `node scripts/cf-push-custom-html.mjs push --only=slo-297-sales`. No other funnel page touched.
- `scripts/cf-push-custom-html.mjs`: the custom_html_put push now adds the page's own SDK token (`<meta name="cf-page-token">`, from GET /pages/{id} `sdk.token`). Without it the live page showed a "NO_PAGE_META ERROR" badge over the phone CTA. It had been there since the first custom HTML push.
- Live proof on https://apply.fundhub.ai/roadmap (Playwright, 390x844 and 1280x800): the $100K headline is there. All 22 cards flip one per 30vh and reverse on scroll up, all 18 images load from statics.myclickfunnels.com, and there are 0 script errors. Pills are gray below the 65% line, #2563EB above it, and gray again on the way back up. Tapping the hero CTA scrolls to #fh-order. Tapping "Get My Roadmap" opens https://fundhub.ai/roadmap/pay.html?utm_source=facebook&utm_content=43 and its hidden fields hold utm_source=facebook and utm_content=43. Nothing was submitted.
- Marked-up screenshots: `docs/workflows/roadmap-proof-deck-2026-09-21-evidence/`.

## Findings

- The live page shows a ClickFunnels "TEST MODE" badge bottom right. It covers the right end of the phone CTA bar. The badge shows because the $297 funnel is in test mode in ClickFunnels. Per the ClickFunnels SDK guide it goes away when the funnel is set live, which is Chris's call.

- The $1,000,000 target cannot be met from real screenshots. Readable, de-duplicated credit card approvals total $483,500. The yellow headlines add up to about $1.27M, but the screenshots under them do not show those amounts.
- The zip Chris sent (`shitforclaude.zip`) holds preview pages whose checkout box is a mock. It takes a social and card number and sends them nowhere. It was not used.

## Blockers and open questions

- `npm run ship` refuses to run while the tree has other sessions' uncommitted files, so images do not go through fundhub.ai/public.

## Leftovers (not fixed here)

- The bottom fragment still shows placeholders on the live page: "[ VIDEO TESTIMONIAL 1-3 ]", "[ PHOTO 1-3 · NAME · ONE LINE ]", "[SUPPORT EMAIL]", "[SUPPORT PHONE]", "[CHRIS FILLS BUMP PRICE]". The add-on card says "tick the box on the form", and the pay flow has no such box.

## 2026-09-21 late: approvals redo (Community box)

- Source: Chris's Drive folder `13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ` → `broll/approvals` (22 screenshots) + the best Canva crops.
- 17 cards, biggest first, all one template (1200x900 crop, amount on top). Total $2,156,300.
  $500K, $469.8K, $400K, $250K lines of credit · $74K Chase Ink · $70K LOC · $54.5K Chase Ink · $50K LOC · $50K KeyBank · $50K Chase · $41K Chase Ink · $30K Navy Federal · $25K Navy Federal · $25K Highland · $24K Navy Federal · $23K Chase Freedom · $20K Truist.
- Left out: $39K personal loan (not a card or line of credit); both $40K GM cards and the $25K KeyPoint (offers / pre-quals, not approvals); all quote cards; chat-text and collage cards.
- Every amount read off its crop by one agent, re-read by an independent checker. Names, account numbers, and envelope IDs are blurred.
- Shuffle no longer pins the page. Cards flip while the deck moves from 90% to 5% of the screen, and the page keeps scrolling.
- Fixed: the footer total had leftover junk text ("$250,000<50,000"). The build script's replace treated `$2` as a regex group.
- Proof: live 1280 and 390 wide, 17/17 images load, no sideways scroll. Marked shots in `roadmap-approvals-2026-09-21-evidence/`.
