# /watch and /thank-you — the Sorting Hat pages (actual)

Generated from code on 2026-09-22 (branch `feat/watch-proof`; /watch section and
/thank-you proof row regenerated on branch `feat/watch-organize`). Both pages are
ClickFunnels builder pages on apply.fundhub.ai. Their body cannot be replaced by
API, so everything new is added by a footer script served from fundhub.ai:

| Page | ClickFunnels page | Footer script |
|---|---|---|
| https://apply.fundhub.ai/watch | 25061160 | `public/funnel/watch-proof.js` |
| https://apply.fundhub.ai/thank-you | 25063539 | `public/funnel/thankyou-sort.js` |

The Sorting Hat: one call, three roads (get funded now, fix the file first, learn
to do it yourself). Nobody gets turned away.

## /watch

```mermaid
flowchart TD
    A["Visitor opens /watch"] --> B["H1, video, Get Started, note<br/>(builder page; words unchanged)"]
    B --> C["watch-proof.js runs<br/>run() — public/funnel/watch-proof.js"]
    C --> D{".fh-root .cta-note found?"}
    D -->|no| E["Falls back to the first a.btn to /apply.<br/>Neither found: adds nothing"]
    D -->|yes| K["html.fhw set; flushGutters(): the builder boxes around .fh-root<br/>lose their side padding (column 24px from the edge, as /roadmap);<br/>H1 takes the /roadmap H1 rule, amounts in the H1 font"]
    K --> F["Real approvals. Real screenshots.<br/>all 16 deck.json win cards in one row;<br/>motion(): the row slides right as the page scrolls down<br/>(fhxShift; reduced motion: a swipe row)"]
    F --> G["From our clients<br/>3 vertical video placeholders<br/>[ VIDEO TESTIMONIAL 1-3 ] (the /roadmap slot)"]
    G --> H["One call. Three roads. Nobody gets turned away."]
    H --> I["Second Get Started → /apply"]
    B -->|first button| J["/apply"]
    I --> J
```

One column at every width, same heading and the same space between the three
blocks. The approvals row starts to slide once the whole row is on screen (its
bottom edge 90% down) and shows the last card while the whole row is still on
screen (its top edge 10% down); the page itself is never held. No client-text
cards (owner, 2026-09-22). Tap, click, Enter or Space on any screenshot opens it
full size; a click or Escape closes it.

## /thank-you

```mermaid
flowchart TD
    A["Visitor lands on /thank-you<br/>(after booking, or sent here by the homepage survey)"] --> B["thankyou-sort.js runs<br/>run() — public/funnel/thankyou-sort.js"]
    B --> C{"fhIsBooked(fh_booking_v1, referrer)?<br/>came straight from /funding-book-call,<br/>start/end, name + email,<br/>submittedAt or capturedAt under 6h,<br/>start still in the future"}
    C -->|yes| D["Confirmed · Your Call Is Booked.<br/>Call steps, prep list, calendar buttons shown"]
    C -->|no| E["Received · We've Got Your Application.<br/>One step left: pick a time for your call.<br/>Call steps, prep list, calendar hidden"]
    E --> F["Pick your call time → /funding-book-call"]
    D --> G["What the call decides<br/>(three roads, nobody turned away)"]
    F --> G
    G --> H["Step 03 reads: You get one of three roads<br/>(booked view only — steps are hidden otherwise)"]
    H --> I["Real approvals, real screenshots<br/>$74,000 · $50,000 KeyBank · $25,000 Highland<br/>(no client texts) — any screenshot opens full size"]
    I --> J["FAQ (unchanged)"]
```

`capturedAt` counts because the live /funding-book-call page still runs the older
booking writer, which never stamps `submittedAt`. The repo writer
(`clickfunnels-fragments/04a-book-top.html`) stamps both.

The live writer saves the record every time the slot, name or email changes,
before Book is pressed. So a record alone is not a booking: the visitor must also
arrive straight from /funding-book-call (`document.referrer`). ClickFunnels sends a
real booker on with `window.location` from that page (`user_pages` bundle, form
submit). Filling the form and pressing Back keeps /thank-you's first referrer, so
that visitor sees "Pick your call time". A booker who comes back later from another
link also sees "Pick your call time"; their confirmation email still holds the time.

Who sees "Pick your call time": everyone without a booking, including the homepage
survey's DOWNSELL and MANUAL_REVIEW leads (`SURVEY_REDIRECTS` in
`src/config/homepage-survey-steps.mjs` still sends them here, not to the calendar).
Decided 2026-09-22 under the owner's "no questions, decide and ship": the Sorting
Hat call is where every lead gets sorted (fund now, fix the file first, or do it
yourself), /watch promises "Nobody gets turned away", and this page's own FAQ
already tells a low-score reader "Still take the call." The survey routing itself
is unchanged.

## Push

`node scripts/cf-push-custom-html.mjs push --only=apply-watch` and
`--only=apply-thank-you`. Mode `builder_page_tracking_inject_only`: appends the
footer script only; any src already on the live page is skipped
(`trackingFooterScripts`, `clickfunnels-fragments/tracking-manifest.mjs`).
If the public page cannot be read, or what comes back is not a ClickFunnels page
(`isClickFunnelsPageHtml`), the push appends nothing, reports
`live_page_unreadable` and exits 1. Footer code cannot be read back or removed by
API, so a blind append would stack the tags for good.
