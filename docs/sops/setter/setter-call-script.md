# Setter call script

For Chris, calling from the business cell. About 5 minutes. Say it your way. Keep the order.

**Sources:** the Josh prompt (`vendor/inquiry-remover/src/agents/setter-prompt.js`, same words as live row AG-04) and Cole Gordon's Triage Call (Drive: "4. Setter Crash Course doc.docx"). Each block says which one.

## Before you dial

- Open the lead's application. Pick 2 or 3 answers: how much they want, what it is for, why. Skip any that are empty. Never guess. (Josh)
- Call between 8 AM and 8 PM Arizona. (`src/messaging/gate.mjs`)
- No answer? Hang up and call again right away. Then leave the voicemail. (Cole: double dial)

## Never say

- A price, a deposit, or a fee. Justice covers it. (Josh)
- "You're approved," or any dollar a lender will give. (Josh)
- That you looked at their credit. Nobody has. (Josh)
- "Your score will go up." "We will get you funded." Any guarantee. (Sarah's objection sheet)
- A made-up win or client count. The only proof you may use: about a decade in the industry, hundreds of files. (`marketing/ads/RULES.md` #35)
- Never ask for a Social Security number or full account numbers. (`sarah-final-gate-2026-08-24.md` 2.8)

## The call

**1. Open and confirm.** (Josh)

> "Hey, is this [Name]?" *(wait)*
> "Hey [Name], it's Chris with Fundhub. You just booked your Strategy Session for [day, time, Arizona]. Calling real quick to make sure that time still works."

No: move the time and end the call. Yes: go on.
They only filled out the application and did not book: "I saw you filled out our application. Wanted to make sure it went through okay." Then do steps 2 and 3, and book in step 4. (Cole: opt-in call, adapted)

**2. Frame.** (Josh)

> "Quick heads up: on the call, Justice pulls your credit live and maps your funding options from what's actually on your report. We haven't run a pull yet. That happens with you on the line."

**3. Light set. Pick 2 or 3.** (Josh, then Cole)

> "From your application you're looking for about [amount] for [use]. Still right?"
> "You said this would help with [why]. Still the main thing?"
> "What's the biggest thing standing between you and the funding you want right now?" *(Cole's first question)*
> "Tell me more. What do you mean when you say [their words]?" *(Cole: probing)*
> "Is anyone else part of this decision?" *(Cole: ask partners on the front end, and get them on the same call)*

Know what they want, why, and about how much before you move on. (Cole's stop rule, adapted.)
Do not dig into their credit score. If they bring it up: "Got it. That's what you put down. Justice will check it live on the call." (Josh)

**4. Show-up close.** (Josh)

> "Justice will share his screen, so be at a computer in a quiet spot."
> "Anything that would stop you from making [day, time]?"
> "Awesome. See you then."

Not booked yet: "I have Justice's calendar open. Does [time A] or [time B] work?" Then get them to accept the invite. (Cole: book and confirm.) **NOT IN SOURCES:** how Chris books the time for them.

**Voicemail.** (Josh, name changed)

> "Hey [Name], it's Chris with Fundhub. You booked a Strategy Session for [day, time]. Calling to confirm you're set. On the call Justice pulls your credit live and maps your funding path. Text or call back if you need to move the time."

## If they do not answer: the three texts

Live rows `SMS-AISET03-MSG1` to `MSG3`, name changed from Josh to Chris. Stop when they reply or book. If they reply STOP, stop.

1. Right away: "Hey [Name], it's Chris from Fundhub. Just tried you. Still good for your call? Reply YES or grab a new time: [booking link]"
2. 30 minutes later: "Hey [Name], Chris again from Fundhub. Wanted to make sure we connect. Reply YES or reschedule here: [booking link]"
3. 2 hours after that: "Last try from Chris at Fundhub, [Name]. Happy to hold a spot when you're ready: [booking link]"

## Top objections

| They say | You say | Source |
|---|---|---|
| "Did you already pull my credit?" | "Not yet. That happens live on the Strategy Session with Justice." | Josh |
| "How much am I approved for?" | "We don't know until Justice pulls and reads your file on the call. That's what the session is for." | Josh |
| "How much does it cost?" | "Justice covers pricing on the call. I'm just making sure you're set to show up." | Josh |
| "Is this a scam?" | "Fair question. I've been in this industry about a decade and worked hundreds of files. Justice shows you how it works on the call, and you decide from there." | Josh, with the allowed proof line in place of "helped a lot of founders" |
| "Can I just do this myself?" | "You could apply bank by bank. Justice's job is knowing which lenders to hit, in what order. It's a plan, not a spray of applications." | Josh + Sarah's sheet |
| "I already applied and got told no." | "That's frustrating. A past no is a fact. It doesn't tell me this file can't get a yes later, and I won't promise we flip it. Justice can look at the real file on the call." | Sarah's sheet |
| "I've been burned before." | "That's a fair reason to go slow. I'm not promising a result. Justice shows you the fee in dollars before you pay anything." | Sarah's sheet |
| "I don't have a business." | "You do not need a business to work with us." | Sarah's sheet |
| "I need to think about it." | "No problem. What's the one piece that's unclear?" Listen. Then tie it back to the call. | Sarah's sheet |
| "I need to ask my partner." | "Would you want them on the call?" If yes or maybe, move the call to a time when both can be on. | Cole, Support Objections doc |

## Open choices for Chris

1. Say the soft pull price out loud? **Default: no.** Justice covers it. If you decide to, the price is $32 (`src/config/offers.mjs`, `SOFT_PULL`).
2. What to call Justice. The Josh prompt says "Senior Advisor." This script says "Justice."
3. $297 roadmap buyers are not in the built setter flow. See `docs/sops/company-resources/closer-slo-pipeline-2026-09-18.md`.
