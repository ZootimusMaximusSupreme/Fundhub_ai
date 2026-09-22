# Switch plan: Fundhub bookings on the ClickFunnels calendar

Two words used below:
- **API** is the door our code uses to talk to ClickFunnels.
- **Webhook** is a message ClickFunnels sends us the moment something happens.

## 1. The answer in 3 lines

- **Partly yes.** You are already on the ClickFunnels calendar. Cal.com was taken out on Aug 23 and never booked a single call. Nothing of ours uses it, so you can cancel it.
- ClickFunnels tells us when a call is booked, moved or cancelled. We can also read the list of calls.
- **Biggest limit:** we can only listen and read. The API has no way to book, move or cancel a call.

## 2. What the ClickFunnels API lets us do

**Can do:**
- Read all booked calls: the time, time zone, status, who booked and their notes. We cannot search by date or by person. https://developers.myclickfunnels.com/reference/listappointmentsscheduledevents.md
- Get a webhook when a call is booked, cancelled or moved. https://developers.myclickfunnels.com/docs/webhook-event-types.md
- Set up that webhook ourselves. https://developers.myclickfunnels.com/reference/createwebhooksoutgoingendpoints.md
- Read again any webhooks we missed. https://developers.myclickfunnels.com/reference/listwebhooksoutgoingevents.md
- Read the person who booked. This includes their ad tags and any booking answers saved to their contact. https://developers.myclickfunnels.com/reference/getcontacts.md
- Start a ClickFunnels workflow when a call is booked. It can add a tag, send an email or send us a message. It fires on a new booking only, not on a move or a cancel. https://developers.myclickfunnels.com/reference/createworkflowtrigger.md

**Cannot do:**
- Book, move or cancel a call.
- Look up one call on its own.
- Read or change meeting types, calendars, open hours or hosts.
- Get a meeting link or the host's name.
- Put the calendar on our own HTML pages. It only works inside the ClickFunnels page builder. So we show a calendar page inside a frame instead.

## 3. What breaks if we swap today

**Nothing from Cal.com.** The swap already happened. The Cal.com code, its webhook doors and its keys are gone. Only old notes and tests still mention it.

The ClickFunnels path has weak spots that hurt the CRM and the reminders:
1. **Moved or cancelled calls may not find their booking.** We may save each booking under the message's id instead of the call's own id. If so, a move makes a second "rescheduled" task, and a cancel leaves the old task open. Reminder texts still stop, because they match on email.
2. **A moved call still gets the old 15-minute text.** That text only stops when a call is cancelled.
3. **A cancelled or moved call can get marked as a no-show** at the old end time. Its sales card then moves to lost.
4. **Wrong time zone in texts.** ClickFunnels sends the booking's time zone, but we throw it away. Texts use the client's saved zone, or Arizona time if none is saved.
5. **No meeting link.** ClickFunnels never sends one. The 15-minute text uses the portal link instead.
6. **The $297 page** (https://apply.fundhub.ai/fundhub-297-roadmap-book--c8e0b) shows the calendar inside a frame. Two things are not proven: where the buyer lands after booking, and whether the add-to-calendar button still gets the call time.

Also not proven: that live webhooks are getting through right now. The last check was on Sep 19. It was a test message, and it failed because the secret codes did not match.

## 4. Build order, back end first

**(a) Webhook to our booking record**
- Step 0: read one real call and one real past webhook through the API. This settles which id is the call's own id.
- Save each booking under the call's own id. Skip repeat messages using ClickFunnels' `event_id`. Keep the time zone and the meeting type name.
- Add three read-only API calls: list calls, list webhook subscriptions and list past webhooks. Use them to confirm all three booking webhooks are on, and to catch any messages we missed.
- Files: `src/adapters/clickfunnels.mjs`, `src/analytics/clickfunnels.mjs`.
- Tests: update `src/adapters/clickfunnels.test.mjs` to use the real message shape. Add a new test, `src/http/webhooks-clickfunnels.pg.test.mjs`, that runs on a real database. It proves that a booking, then a move, then a cancel all land on one booking row.

**(b) CRM and reminders on that record**
- Moves and cancels find the right task and booking: `src/handlers/comms.mjs`.
- The 15-minute text also stops when a call is moved: `src/workflows/ai-set-04-3way-handoff.mjs`.
- The no-show check stops on a cancel or a move: `src/workflows/dpc-02-call-outcome-enforcement.mjs`.
- Texts use the booking's time zone: `src/workflows/messaging.mjs`.
- Add tests next to each file. Update `docs/journeys/booking-notifications-flow.md` and `docs/journeys/CHANGELOG.md`.

**(c) Booking page last**
- `clickfunnels-fragments/slo/slo-02-booking.html` (page 25426722): point the frame at the calendar you pick, fix the old comments, and make the booking-time capture work through the frame.
- `clickfunnels-fragments/tracking-manifest.mjs`: save the page id change to git.
- Push the page with `scripts/cf-push-custom-html.mjs`. Both calendar pages stay locked so they are never fully replaced.
- Prove it live on apply.fundhub.ai with a real test booking, then cancel that booking.

## 5. What Chris must do himself

**Nothing for the switch.** It is already live.

A few settings only exist in the ClickFunnels screens, and the API cannot reach them:
- where the buyer goes after booking
- ClickFunnels' own reminder emails
- which host calendar (Google or Outlook) the calls sync to

If one of these needs a change, an agent makes it in the ClickFunnels screen. The only step an agent cannot do is type your ClickFunnels password.

## 6. Open questions

1. Which calendar should $297 buyers use: https://apply.fundhub.ai/funding-book-call or https://apply.fundhub.ai/schedule/phonecall? The $297 page uses the first one. The $297 pack links to the second one.
2. After a $297 buyer books, should they land on the $297 thank-you page or on the apply funnel's thank-you page?
3. Should reminders come only from our system, or should ClickFunnels reminder emails go out too? Using both means people get double messages.
## Checker corrections (independent re-check, 2026-09-22)

- The six doc links in §2 were re-opened and are real. `GET /workspaces/{id}/webhooks/outgoing/endpoints` (list webhook subscriptions) also exists.
- **Ad tags:** a booking does not carry ad tags (UTMs). They are only on the contact's visits, and only if ClickFunnels logged a visit. Whether a booking made inside the frame logs one is not proven.
- **Our key's reach is not measured.** No live call has been made to prove the stored ClickFunnels key can read `/appointments/scheduled_events` and `/webhooks/outgoing/*`. Step 0 is that measurement.
- **Test booking cancel:** the API cannot cancel. A test booking has to be cancelled from the confirmation email link or in the ClickFunnels screens.
- **Booking-time capture through the frame** may already work, because the framed page is on the same site. It is untested, not broken.
- **§5 is wrong where it says an agent changes ClickFunnels screen settings.** Those settings need a logged-in ClickFunnels admin session. Under `.claude/rules/chris-never-clickfunnels.md`, Chris does not log in, so those three settings stay as they are unless another way is found.
- How long ClickFunnels keeps past webhooks is not documented, so Step 0 may not find an old booking message.

## Owner decisions

- 2026-09-22: $297 buyers book on https://apply.fundhub.ai/funding-book-call "for now" (owner-set).
