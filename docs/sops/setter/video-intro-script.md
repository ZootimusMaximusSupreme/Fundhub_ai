# Video intro script

A short personal video. Chris films it on his business cell and texts it to a new lead. It is the **warm-up** (step 2 in `README.md`).

**Sources:** the team board of 2026-10-07 ("He answers from his business cell with a personal video"); Jeremy Haynes' "Setter Pre Call Best Practices SOP" in Drive (selfie video texts); Chris's Drive doc "Back End Sales System" (welcome, one real detail from the application, what to do next); Spencer Vann's "Show Rate & Sales Ops Training" in Drive (the first text). The opener "Hey, how's it going? Nice to meet you" is Chris's, from the board.

## Where it fits

| Step | What happens | Where the video goes |
|---|---|---|
| 1. The call | Chris calls (`setter-call-script.md`). | Send the video after the call or after the voicemail. It does not replace the call. |
| 2. The warm-up | The system has already sent its own texts (`s-00-welcome.mjs`, `s-04b-booking-reminders.mjs`). | **This is the video.** Send it as soon as you can after the lead comes in. |
| 3. The sequence | Chris's three texts if no answer. | The video comes first. Do not stack a "following up" text on top of it. |
| 4. The 3-way text | The system texts the lead 15 minutes before the call. | The video already told the lead who you are and who Justice is. |

**When:** as soon as the lead comes in. Chris's words: "I need to be notified immediately when leads come in... I'll respond via my business cell phone with personalized video messages... Goal: Warm up leads before passing them to closers."

## Rules

1. One video per lead. Say their name. Add one real thing from their application. If the application is empty, skip that line. Never guess.
2. Say who you are in the first sentence.
3. Keep it short. The script below is about 30 seconds out loud. Haynes says "quick" and gives no number.
4. Say no price, no deposit, no approval, no score promise, no client count. Same never-say list as the call script.
5. End with one small ask: reply "yes." (Vann)
6. Send it from the business cell between 8 AM and 8 PM Arizona. (`src/messaging/gate.mjs`)
7. Write "Video sent, [date, time]" in the client file Notes, so Justice knows.
8. Film in 4K. A video that is not a paid ad is shot in 4K. (`.claude/rules/video-4k-unless-ad.md`) Texting apps may shrink it. **Not tested.**

## The script

> "Hey [Name], how's it going? Nice to meet you. I'm Chris, I run Fundhub.
>
> I saw [one real thing, like: you're looking for about [amount] for [use]]. I wanted to say hi myself.
>
> [Pick one:]
> **They booked:** Your Strategy Session with Justice is [day] at [time], [zone]. I'm going to tell him what you told me so he's ready for you. Be at a computer in a quiet spot, because he'll share his screen.
> **They did not book:** I saw you finished the application but didn't pick a time. No pressure. Text me a day that works and I'll get you a time with Justice.
>
> Text me back 'yes' so I know this got to you. Talk soon."

**The text that goes with it.** Three short texts, one line each. (Vann's first text, adapted)

> "Hey [Name]"
> "It's Chris from Fundhub"
> "I just sent you a quick video. I saw you put [their exact words from the application]. Can you reply 'yes' so I know it came through?"

## After you send it

1. Answer replies fast. Most replies are plain questions like "what's the link?" (Vann)
2. A question about money or approval goes back to the call: "Justice goes through every dollar with you on the call, before you pay anything." (Josh, Sarah's sheet)
3. Then call them. Do not pick the video or the call. Do both. (Cole: speed to lead)
4. If they reply STOP, stop.

## Open choices for Chris

1. 4K video or the phone's usual setting for texts. **Default: follow the law, film in 4K.**
2. What to call Justice on camera. The Josh prompt says "Senior Advisor."
3. Two real things to offer in the video, such as a client win or a short FAQ video. **NOT IN SOURCES.** None is named anywhere.
