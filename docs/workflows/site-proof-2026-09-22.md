# Site proof: 2026-09-22

**Overall result: FAIL.** Every step that was walked works, except three:

1. **Funnel A, approvals cards, fast flick (computer and phone).** Right after a fast flick, the new card is see-through for about half a second. Two dollar amounts show on top of each other.
2. **Funnel A, approvals cards, normal scroll (phone).** The phone picture shows the same see-through stack: $24,000, $30,000 and $41,000 cards blended together. The walker marked this PASS. The picture does not back that up.
3. **Funnel B, booking calendar on /funding-book-call (phone).** The calendar is squeezed. Day names break in half ("Su / n"). The logo runs past the edge of the card. Picking a day and time still works.

Every picture was opened and checked by the reviewer. Every picture has red numbered boxes and a key at the bottom.
Pictures live in `site-proof-2026-09-22-evidence/`. Computer = 1280 wide. Phone = 390 wide.

Test data only: Demo Tester, demo emails, SSN 666-12-3456. No card was charged. No soft pull ran. No call was booked. The /apply survey was never filled in.

---

## Funnel A: $297 roadmap (/roadmap → checkout → /roadmap-book → /roadmap-thank-you)

| # | Step | Computer | Phone | Result | Pictures |
|---|---|---|---|---|---|
| 1 | Page opens: headline, video box, first button | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/01-hero-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/01-hero-390-MARKED.png) |
| 2 | Approvals cards, normal scroll: top card clear | PASS | **FAIL** | **FAIL** | [computer](site-proof-2026-09-22-evidence/funnel-a/01b-approvals-shuffle-scrolling-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/01b-approvals-shuffle-scrolling-390-MARKED.png) |
| 3 | Approvals cards, fast flick: new card readable | **FAIL** | **FAIL** | **FAIL** | [computer](site-proof-2026-09-22-evidence/funnel-a/01b2-approvals-shuffle-fast-flick-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/01b2-approvals-shuffle-fast-flick-390-MARKED.png) |
| 4 | Industry pills light up as you scroll | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/01c-industry-pills-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/01c-industry-pills-390-MARKED.png) |
| 5 | Tapping a cover opens the sample | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/01d-cover-lightbox-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/01d-cover-lightbox-390-MARKED.png) |
| 6 | Letter pack: tapping a tab shows that page | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/01e-letter-pack-tab-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/01e-letter-pack-tab-390-MARKED.png) |
| 7 | "Get My Roadmap" scrolls down to checkout | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/02-cta-scrolls-to-widget-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/02-cta-scrolls-to-widget-390-MARKED.png) |
| 8 | Step 1 left empty: a red note under each box | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/03a-step1-empty-errors-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/03a-step1-empty-errors-390-MARKED.png) |
| 9 | Step 1 filled: step 2 opens with the name carried over | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/03b-step2-shown-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/03b-step2-shown-390-MARKED.png) |
| 10 | Step 2 left empty: 9 red notes, nothing sent | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/04a-step2-empty-errors-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/04a-step2-empty-errors-390-MARKED.png) |
| 11 | Add a business: price goes to $312 | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/04b-add-business-312-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/04b-add-business-312-390-MARKED.png) |
| 12 | Remove it: price back to $297 | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/04c-remove-business-297-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/04c-remove-business-297-390-MARKED.png) |
| 13 | Fake address: "We couldn't find that address" | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/05-fake-address-warning-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/05-fake-address-warning-390-MARKED.png) |
| 14 | Ready to pay: demo note, box checked, $297 | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/06a-pay-ready-demo-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/06a-pay-ready-demo-390-MARKED.png) |
| 15 | Pay: lands on /roadmap-book with the order in the web address | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/06b-landed-roadmap-book-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/06b-landed-roadmap-book-390-MARKED.png) |
| 16 | Booking card: one card, calendar not cut off | PASS | PASS (boxes off target) | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/07a-book-card-calendar-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/07a-book-card-calendar-390-MARKED.png) |
| 17 | Pick a day and time: Confirm on screen | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/07c-date-time-confirm-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/07c-date-time-confirm-390-MARKED.png) |
| 18 | Press Confirm: name and email form shows (stopped there) | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/07d-confirm-form-shows-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/07d-confirm-form-shows-390-MARKED.png) |
| 19 | /roadmap-thank-you shows "We've Got Your Request." | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-a/08-thank-you-not-booked-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-a/08-thank-you-not-booked-390-MARKED.png) |
| 20 | Database: both orders are demo, not paid, $297, 1 business, no pull | PASS | PASS | PASS | No picture. The reviewer checked the database again, read only. Both orders match. |

**Reviewer notes on Funnel A pictures**

- Row 2, computer: the walker's **first** try on the computer failed this check. A changed second try passed. The walker's report leaves out the first failure. The computer picture does show a clear top card.
- Row 2, phone: the picture shows three cards blended together. That is the same problem as row 3.
- Row 3: the walker wrote "28–40% visible". The pictures say 28–35%.
- Row 1, computer: the first button sits just below the bottom of the picture. The phone picture shows it.
- Row 16, phone: the red boxes miss their targets. Box 1 ("event details") sits on the month name. Box 2 ("month grid") sits on the last week and the times. The calendar in the picture still looks right.

## Funnel B: call funnel (/watch → /apply → /funding-book-call → /thank-you)

| # | Step | Computer | Phone | Result | Pictures |
|---|---|---|---|---|---|
| 1 | /watch top: headline, video plays, Get Started | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-b/01-watch-top-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-b/01-watch-top-390-MARKED.png) |
| 2 | Proof block: 6 approvals, 3 texts, "One call. Three roads.", second Get Started | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-b/02-watch-proof-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-b/02-watch-proof-390-MARKED.png) |
| 3 | Tap a screenshot: it opens big, then closes | PASS | PASS | PASS | open: [computer](site-proof-2026-09-22-evidence/funnel-b/03-watch-zoom-open-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-b/03-watch-zoom-open-390-MARKED.png) — closed: [computer](site-proof-2026-09-22-evidence/funnel-b/04-watch-zoom-closed-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-b/04-watch-zoom-closed-390-MARKED.png) |
| 4 | Get Started: /apply shows the first question | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-b/05-apply-q1-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-b/05-apply-q1-390-MARKED.png) |
| 5 | /funding-book-call: page and calendar look normal | PASS (big logo sits on the grey band) | **FAIL** (calendar squeezed) | **FAIL** | [computer](site-proof-2026-09-22-evidence/funnel-b/06-book-hero-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-b/06-book-hero-390-MARKED.png) |
| 6 | Pick a day and time: Confirm shows (not pressed) | PASS | PASS | PASS | [computer](site-proof-2026-09-22-evidence/funnel-b/07-book-confirm-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-b/07-book-confirm-390-MARKED.png) |
| 7 | /thank-you, no booking: "Pick your call time" goes to /funding-book-call | PASS | PASS | PASS | page: [computer](site-proof-2026-09-22-evidence/funnel-b/08-ty-no-booking-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-b/08-ty-no-booking-390-MARKED.png) — after tap: [computer](site-proof-2026-09-22-evidence/funnel-b/09-ty-button-lands-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-b/09-ty-button-lands-390-MARKED.png) |
| 8 | /thank-you, booked (fake booking): "Your Call Is Booked.", call time, proof before the questions | PASS | PASS | PASS | top: [computer](site-proof-2026-09-22-evidence/funnel-b/10-ty-booked-top-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-b/10-ty-booked-top-390-MARKED.png) — proof: [computer](site-proof-2026-09-22-evidence/funnel-b/11-ty-booked-proof-1280-MARKED.png) · [phone](site-proof-2026-09-22-evidence/funnel-b/11-ty-booked-proof-390-MARKED.png) |

## Errors on the page

- **Our code:** one planned error. The fake-address check (Funnel A row 13) answers "422", which means "address not found". It happened once per width. Nothing else from our code.
- **Other companies' code:** the ad tracker at app.directroas.com said "400" (it refused the request): 8 times on Funnel A, once per width on Funnel B. The ClickFunnels script logged a header warning. A New Relic report on /watch held only timing data.

## Not proved

- A real card charge. Checkout ran in demo mode.
- A real soft pull.
- A real booking. "Book Appointment" was never pressed on either funnel.
- The /apply survey after question 1. Nothing was typed.
- The "Your Call Is Booked." page after a real booking. The walk used a fake booking saved in the test browser.
- Pressing Confirm on /funding-book-call (Funnel B). The name and email form there was not opened.
- The sales video playing on /roadmap and /roadmap-book. Both video boxes are black in the pictures. The /watch video did play.
- Closing the big screenshot on a phone by tapping the X. The walk used the Escape key, which phones do not have.
- The "Add to Google Calendar" and "Apple / Outlook" buttons on /thank-you.
- 4 of the 5 sample covers in Funnel A row 5. Only one has a picture. The other four are from the walk script's log.
- Funnel A row 19: the test browser held a saved booking even though nobody booked. The page still showed the right view. Why the booking was saved is not proved.

## Leftover card: seen in the pictures, not checked, not fixed

- The checkout shows "[SUPPORT EMAIL] · [SUPPORT PHONE]" instead of real contact details.
- A "TEST MODE" badge sits on every /roadmap picture. On the phone it covers part of the bottom button and the calendar's day names.
- The "From people who bought it" tiles under the checkout are plain black boxes.
- The letter pack tabs jump from 06 to 08.
