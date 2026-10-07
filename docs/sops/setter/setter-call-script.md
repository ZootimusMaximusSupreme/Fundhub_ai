# Setter call script

**For:** Chris, setting for now. Calls and texts go from the business cell.
**Books onto:** Justice's calendar (High Ticket Closer). Sarah is the Sales Manager.
**Built from:** Cole Gordon's setter "Triage Call" method in Chris's Google Drive, fitted to Fundhub's real offers and rules. Nothing here is invented.
**Every source:** `ops/workflows/team-setup-sarah-justice-2026-10-07/w3-setter-sources.md`

## How to read the tags

Each block ends with where it came from.

- **Cole** = Cole Gordon training in Drive (Setter Crash Course, Group Funnel setter doc, Follow-Up doc, objection docs)
- **Haynes** = Jeremy Haynes, "Setter Pre Call Best Practices SOP" in Drive
- **Vann** = Spencer Vann, "Show Rate & Sales Ops Training" in Cole's ops folder
- **Fundhub** = Chris's own Fundhub documents, in Drive or in this repo
- **adapted** = Cole (or another source) gave the step. The Fundhub words were written here.
- **MISSING FROM SOURCES** = no source has it. It is left blank on purpose.

Say it in your own voice. The words are a guide. Keep the questions and the order.

---

## 1. The job in one minute

A setter does three things:

1. Gets the lead onto Justice's calendar.
2. Gets the lead to show up.
3. Tells Justice what the lead said (see `closer-handoff.md`).

A setter does not sell. A setter does not quote a fee, an approval, or a score. Justice does the money talk on the call. (Fundhub: Josh setter prompt, owner law 2026-08-15. Cole: "sell the consult first.")

The call has five parts. This is Cole's Triage Call:

| # | Part | What it does |
|---|---|---|
| 1 | Rapport and frame | Warm hello. Agree on how the call will go. |
| 2 | Mini-discovery | Learn the goal, the problem, and the numbers. |
| 3 | Transition | Sell the call with Justice. Not the offer. |
| 4 | Book and confirm | Lock a time. Get them to accept the invite. |
| 5 | Qualify | Fill in the short note Justice will read. |

Cole keeps parts 1 and 2 to 5 to 10 minutes at most. (Cole)

---

## 2. Before you dial

### Speed

- Call within 5 to 10 minutes of the lead coming in. Cole says answer rates are 2 to 3 times higher when you dial inside 10 minutes. That is his number, not Fundhub's. (Cole)
- Double dial. Call. If no answer, put the phone down and call again right away. Only after the second miss do you leave a voicemail, then text, then email. (Cole)
- Cole says to make 2 to 3 calls in the first 2 hours. (Cole)

### Hours

Fundhub's own system holds texts between 8:00 PM and 8:00 AM Arizona time. Do the same by hand. If a lead comes in at night, reach out first thing at 8:00 AM. Cole says the same: "first thing in the AM." (Fundhub: `src/messaging/gate.mjs`. Cole.)

Say the time with the time zone every time. Arizona time is the Fundhub clock. (Fundhub: owner-set 2026-08-28.)

### Read what they already told us

Do not ask again what the lead already answered. Use two or three of these as your opener. Do not read the whole list back. Skip any that are empty. Never fill in a blank by guessing. (Fundhub: Josh setter prompt.)

**Apply funnel (the survey).** These are the survey questions. (Fundhub: `src/survey/cf-question-map.mjs`)

| They answered | What it tells you |
|---|---|
| Target amount | The size of what they want. It is what THEY want, not what they will get. |
| Planned use | What it is for |
| What the money would change | Their "why" |
| Score band | A guess. Not a pull. |
| Negatives on the file | Yes or no |
| Business, and how old (or personal only) | Business age, or "personal" |
| Revenue or income, and can they show it | A claim. Justice checks. |
| Cash available | A band, not a number |

Vann found that about 47 percent of multiple-choice answers were false when checked against real financial data. Treat every answer as a claim. Ask the one question that lets them say it in their own words. (Vann. His number, not Fundhub's.)

**$297 roadmap buyers.** They answered six questions: score range, recent bad marks, business and how old, how much funding they want, how fast they need it, and whether they can start this week. (Fundhub: `docs/sops/company-resources/closer-slo-pipeline-2026-09-18.md`)

### Know where the lead came from

The apply funnel, the $297 roadmap, or something else. It changes the opener. See section 4.

### The money rule

You do not say a fee, a deposit, an approval, or a dollar amount a lender will give. If they ask, use the lines in section 7. Justice goes through every dollar on the call. (Fundhub: Josh setter prompt. Vann: "answer by tying down to the call.")

### Never say

These are Chris's own rules from the closer playbook and Sarah's objection sheet. They bind the setter too. (Fundhub: `closer-playbook-2026-08-24.md` section 10, `sales-manager-objections-and-funding-2026-09-01.md`)

- "Your score will go up."
- "We will get you funded."
- A dollar amount a bank "will" give them.
- A bad item "will" come off.
- "0% interest," "no damage to credit," "we protect your score," "1 to 2 inquiries max."
- "No denials." Any guarantee.
- A made-up win, client count, or story.
- "Just checking in." Say something real.
- Anything about the deposit. That is Justice's.

Also: never ask for a Social Security number, full account numbers, or passwords. Never take a payment. (Fundhub: closer agreement section 2.8, in `sarah-final-gate-2026-08-24.md`)

Proof you may use is only what Chris has set: a decade in the industry, hundreds of files, thousands of data points, and a little over a million dollars funded for himself. No $25 million. No client counts. (Fundhub: `marketing/ads/RULES.md`, owner rules 2026-10-02)

---

## 3. The call, line by line

### Part 1. Rapport

Say:

> "Hey, is this [First name]?"
>
> *(wait)*
>
> "Hey [First name], it's Chris over at Fundhub. How's your week been so far?"

Match their energy. If they sound rushed, ask: "Is now still a good time to connect?"

Keep it short. Rapport is not a life story. It has three jobs: you sound like a normal person, they are in a good time and place, and you get in rhythm with them. (Source: Cole, Triage Call and "Call Introduction" doc. Fundhub, closer script phase 1. The Fundhub opening line is the same one the closer uses.)

### Part 1. Frame

The frame is an agreement on how the call will go. It keeps you leading the call.

**If they have NOT booked yet, say:**

> "Awesome. So I can get you set up the right way, I'd like to get a quick idea of where you're at, what you're after, and where you need the most help. It shouldn't take long. Then I'll get you a time with Justice and make sure he's ready for you. Sound good?"

**If they HAVE booked, say:**

> "I saw you booked a Strategy Session for [day, time, zone]. I'm calling to make sure that time still works, and so Justice knows what to focus on for you. Got a couple of minutes?"

(Source: Cole's frame, adapted. Cole's version ends with a piece of content for their business. Fundhub's ends with Justice's call. For booked leads: Fundhub, Josh setter prompt "open / confirm.")

### Part 2. Mini-discovery

Cole uses four kinds of questions: **probing**, **background**, **chunking down**, and **need pay-off**. Ask one question at a time. Listen. Use their own words in the next question.

**First question.** Ask it every time:

> "So what's the biggest thing standing between you and the funding you want right now?"

Add, if it is a business: "What's going on in the business?" (Source: Cole's "biggest challenge" question, adapted. Fundhub, closer script phase 2.)

**Background.** Use what is on file. Ask only what is missing.

> "From your application, you're looking for about [amount] for [use]. Is that still right?"
>
> "Is this for a business, or personal?"

If personal: "That's fine. You don't need a business to talk to us." (Fundhub: playbook.)

(Source: Cole's background questions, adapted. Fundhub: Josh prompt, playbook question 6.)

**Probing.** Use these exactly. (Cole)

> "Tell me more about that."
>
> "When you say [their words], what do you mean?"
>
> "Why do you say that's the biggest challenge?"
>
> "How has that affected you, specifically?"
>
> "How else has it affected you?"

**Chunking down.** This turns a story into numbers.

> "How much are you trying to get?"
>
> "What would you use it for first?"
>
> "By when would you want it done?"
>
> "Have you applied anywhere for this already? What happened?"
>
> "How long has this been holding you back?"

(Source: Cole's chunking, adapted. Fundhub: closer script phase 2 asks the same current-situation questions.)

**Need pay-off.**

> "So if you got the funding sorted, what would that change for you? What's the goal?"
>
> "You said this would help with [what the money would change]. Is that still the main thing?"

(Source: Cole's need pay-off, adapted. Fundhub: Josh prompt.)

**Do not move on until you have:** what they want, why they want it, about how much, and by when. This is Cole's stop rule, adapted. His version is: the full context, why it is a problem, numbers on it, and their goal. (Cole)

**Tone.** Ask in a way that helps you serve them. Do not interrogate. "What's driving this right now?" gets the same answer as "What's your budget?" and does not feel like a quiz. (Haynes: "avoid the selfish qualification trap.")

**Do not judge by energy.** A lead who sounds less excited than the last one is not less qualified. Interest and fit are different things. Treat every lead as a fit until there is a clear sign they are not. (Haynes: "comparison bias," "contact everyone.")

**Sound calm, not hyped.** Warm. Slow. Sure. (Cole, "resolve over pumped-up certainty." Fundhub, closer script tonality notes.)

### Part 3. Transition: sell the call with Justice

Do not pitch. Do not say a price. Sell the call.

> "Okay, that makes sense. Based on what you told me, the best next step is a Strategy Session with Justice. He'll go through your file with you, tell you what's possible and what's not, and if we're not the right fit, he'll say so. Either way, you'll know where you stand. Would you be open to that?"

(wait for yes)

> "On the call, Justice does a soft look at your credit, with your OK. It's a soft pull only, zero impact on your score, and nothing runs until you say yes."

Source: Cole's transition ("sell the consult FIRST"), adapted. The soft pull line is Chris's own: closer FAQ, "soft pull only, zero score impact, no hard inquiry ever runs without your approval." Where the call does the pull: Fundhub, Josh prompt and the June 2026 Voice Agents SOT: the pull happens live on the Advisor call, not before.

Do not say "you're approved," "you'll get," or any dollar amount. If they push, use the lines in section 7.

### Part 4. Book and confirm

Offer two times. Keep them inside the next two or three days if you can. Vann found that calls booked four or more days out show up much less often. (Vann, "Gold Standard 1: booking window.")

> "I have Justice's calendar open right now. Does [day, time, zone] or [day, time, zone] work better?"

When they pick, get one more "yes" before you send anything. (Haynes: micro-commitments.)

> "Perfect. I'll send you the booking link now, okay?"

Send it. **Stay on the line until the invite shows up.**

> "Can you accept the invite while we're on the phone?"

Also tell them to add it to their calendar from the invite. Vann says Google changed its calendar in 2023, and invites often do not land on a calendar by themselves. (Cole: "lock in the consult, get them to accept the calendar invite." Vann.)

**MISSING FROM SOURCES:** how a booking is made for a lead (the lead picks a time on a link, or you book it for them). Workflow W1 decides this with the calendar plan. Until then, send the link and stay on the line while they pick.

### Part 5. Qualify: the short note for Justice

This is the last part of Cole's call. You are filling in the short note Justice reads before his call. Ask for help. It is easier for them to say yes.

> "Oh, and one more thing. I send Justice a short note on everyone I put on his calendar, so he's up to speed and doesn't waste your time asking the same things twice. I can fill most of it in myself. Can you give me a minute or two to get it right?"

Then ask these. Skip any you already know.

1. **How they found us.**
   > "How did you first hear about Fundhub?"
2. **Their problem, in their words.**
   > "You said the biggest thing in the way is [their words], right?"
3. **Their goal.**
   > "And your goal is [their words]?"
4. **Who decides.**
   > "Is anyone else part of this decision, like a partner or spouse? Would you want them on the call?"

   If you get a "maybe," move the call so they can both be there. Cole's line for this: "The biggest thing to us is alignment. I have my calendar open now. When works this week where we can all three get on a call?" (Cole, "Support Questions" and "Support Objections")
5. **The file, softly.** These are not a quiz. Say them like a person.
   > "Last time you looked, roughly where was your score? Is that a guess, or did you check?"
   >
   > "Anything on the file that worries you, like lates, collections, or a lot of applications?"
   >
   > "If it's a business, what's it called, and about when was it set up?"

   Write down the date they give. It is a claim. Justice checks it. (Fundhub: playbook questions 3, 4 and 7)
6. **The money picture.** No fee talk.
   > "On a scale of 1 to 10, with 1 being things are really tight right now, and 10 being 'I have the resources to do whatever I want,' where would you say you are financially?"

   (Cole's exact question.)
7. **The timeline.**
   > "By when would you want this handled?"

   (Haynes: timeline. Fundhub: the roadmap buyers' "how fast" question.)

**Close the call.**

> "Justice will share his screen, so be at a computer in a quiet spot. Is there anything that would stop you from making [day, time, zone]?"
>
> *(wait)*
>
> "Awesome. I'll text you the details now. Reply 'yes' so I know you got them. See you then."

(Fundhub: Josh prompt "show-up close." Vann: ask for a reply "so I know you saw this and will be on the call.")

*Optional, Chris decides:* add "And have a card handy in case you want to run the soft look right then." The Drive closer script and AI Setter SOP say this. Josh's owner rule says never discuss any upfront fee. See open item 1.

Cole's outline also has "can cancel" after the Qualify step. The source gives only those two words. **Do not cancel.** Fundhub's closer playbook says not to auto-cancel people for a smaller ask, or for a bankruptcy unless a manager gives that rule in writing. Flag it in the note. Justice decides. (Fundhub: closer playbook section 12)

---

## 4. The call, by where the lead came from

Use the same five parts. Only the opener changes.

### 4A. They booked a Strategy Session (apply funnel)

Use the "booked" frame in section 3. Then:

> "I saw you're looking for [amount] to [use]. Tell me a bit more about what you're trying to do."

(Fundhub: June 2026 Voice Agents SOT, the Josh setter prompt, adapted. Keep this call short. They already said yes to a call.)

### 4B. They filled out the application but did not book

This is Cole's "free opt-in" call. The lead raised a hand but did not book.

> "Hey, is this [First name]? ... It's Chris over at Fundhub. I saw you filled out our funding application a little while ago. I just wanted to make sure it went through okay, and see if I can point you in the right direction."
>
> "What's the biggest thing standing between you and the funding you want right now?"

Then go to part 2. At the transition, book the call.

(Source: Cole's "Outbound Calls, Free Opt Ins" script, adapted. Cole's real script checks that they got the free guide, then asks the biggest-challenge question. Cole: speed matters most for non-buyers.)

### 4C. They bought the $297 roadmap

This is Cole's "buyer" call. Cole says buyers are friendlier because it is a "customer service" call.

> "Hey, is this [First name]? ... It's Chris over at Fundhub. I'm calling about the roadmap you just picked up. I wanted to make sure you could get into your portal and that everything looks right to you."

*(Answer what they ask. Then:)*

> "Now that you have it, what's the biggest thing you want to get done next?"

Then go to part 2.

Source: Cole's "Outbound Calls, Buyers" script, adapted. Fundhub: `closer-slo-pipeline-2026-09-18.md` says every roadmap buyer gets called, whether they booked or not, and they keep portal access.

**Hot rule for roadmap buyers only.** If they have a score of 680 or better, have a business, and need it this month, send them straight to Justice. Text him right away. Everyone else you work first. (Fundhub: same doc.) **MISSING FROM SOURCES:** a hot rule for apply-funnel leads. There is none.

---

## 5. If they do not answer

Double dial first (section 2). Then:

**Voicemail**

> "Hey [First name], it's Chris from Fundhub about your Strategy Session. Just making sure you're all set for it. Shoot me a text, or I'll catch you before your call. Talk soon."

For a lead who has not booked, change the middle: "...about the funding application you filled out. I'd love to get you pointed in the right direction. Shoot me a text, or I'll try you again."

(Source: Fundhub, June 2026 Voice Agents SOT, voicemail. Persona changed to Chris.)

**Text, right after the second missed call.** (Cole's text, written for Fundhub in the Drive "AI Setter SOP." Persona changed to Chris.)

> "Hey [First name] - Chris here from Fundhub. I just tried to give you a shout but might have caught you at a bad time. Saw you booked a Strategy Session. You open to a quick 2-min chat to make sure we get you pointed in the right direction?"

**About 4 hours later, if no reply:**

> "Hey [First name], Chris here again. I never heard from you earlier and just tried to give you another shout, but we might just be missing each other. Will you shoot me a text when you have a few quick minutes?"

**The next day, if still no reply. This is the last one.**

> "[First name], Chris here again from Fundhub. You booked a call with us about getting funding for your business. Is securing capital still top of mind? If not, no worries, I just don't want to blow up your phone. Will you shoot me a text and let me know?"

For personal funding, drop "for your business." (Source: Cole's STA texts. Fundhub: AI Setter SOP, section 2. Timing: minute 5 double dial, minute 6 voicemail, minute 7 text, hour 4, next day.)

**If they still say nothing, change how you talk to them.** Do not just repeat yourself. (Haynes)

- Send the personal video. See `video-intro-script.md`.
- Look them up on Instagram by first and last name. Haynes says this made a big difference in reaching quiet leads. That is his claim.
- Do not send "Following up," "Want to jump on a quick call?" or "Haven't heard from you, are you still interested?" These only help you. Give them something useful or something easy to answer. (Haynes: "selfish follow-up.")
- Never write "just checking in." (Fundhub)

**If they reply STOP, stop.** The survey's own text consent says "Reply STOP to opt out." (Fundhub: `public/js/homepage-survey.js`)

---

## 6. After you book: the texts

Send these. Vann says people who reply are far more likely to show, and manual texts get replies that automated ones do not. (Vann, Haynes.)

**Right away** (send as three short texts, one line each, like a person):

> "Hey [First name]"
>
> "It's Chris from Fundhub"
>
> "I just read your info and saw you put [their exact words from the application]. Justice will go through it with you on [day, time, zone]. Can you reply 'yes' so I know you saw this?"

(Source: Vann's "immediate" confirmation text, adapted. Fundhub: persona and offer.)

**The night before** (Fundhub: closer playbook section 12, written by Chris)

> "Hey [First name], Chris at Fundhub. We're on tomorrow at [time]. Justice will ask what you want and which path fits, whether that is funding, a course, a small file read, or none. Reply YES if that time still works. If you need a new time, say so."

The playbook's original says "I'll ask what you want." It was changed to "Justice will ask" because Justice runs the call.

**The morning of.** Phone first, even for 60 seconds. If no pickup, text:

> "Hey [First name], looking forward to [time] today. Reply if you're set or if you need to move it."

(Fundhub: closer playbook section 12: "phone first, text second.")

**Optional extra touches** if show rate is weak (Vann): 1 hour before: "Just finishing up our pre-call prep! See ya in an hour." Then 15 minutes before: "Also, here's the link for the meeting [link]."

**Handoff text to the lead,** 15 minutes before, only after you have sent Justice the note:

> "Hey [First name], it's Chris. Your Strategy Session is starting in 15 minutes. I've briefed Justice on what you told me. Here's the link: [link]. He'll take it from here."

(Source: Fundhub AI Setter SOP, the "3-way text handoff," adapted. The original said the advisor "reviewed your file." That is not true yet, so it was changed.)

**If they no-show.** Text within about 5 minutes:

> "Hey [First name], it's Chris from Fundhub. Looks like we might have missed each other for your Strategy Session. No worries at all. Want me to get you rebooked for later today or tomorrow? Just let me know what works."

Next day, call them. Say:

> "Hey [First name], it's Chris from Fundhub. I know things come up, so no worries about missing the call yesterday. I'd love to get you rebooked with Justice. Does later today or tomorrow work better?"

(Source: Fundhub AI Setter SOP, section 4. One sentence was removed: it said "really strong pre-approval numbers." No one has any numbers before the call, and Fundhub does not talk about approvals.)

**MISSING FROM SOURCES:** Cole's own "rebooking no-apps and no-shows" script. It is linked from his Follow-Up doc but is not in Chris's Drive.

---

## 7. Objections the setter will hear

Cole's pace: do not argue. Ask what they mean. Find the real worry. Then bring it back to the call. For anything about money or approvals, the answer is always the call with Justice.

Fundhub's own shape is Align, Educate, Close. Say what is true. Never promise. (Fundhub: Sarah's objection sheet)

| They say | You say | Source |
|---|---|---|
| "How much does it cost?" | "Justice goes through every dollar with you on the call, before you pay anything. I don't want to guess and get it wrong." | Fundhub, Josh prompt answer. Vann: "tie down to the call." Adapted. |
| "How much can I get?" or "Am I approved?" | "That's exactly what the soft look on your call is for. Justice pulls your credit live and walks you through what the file supports. That's where the real numbers come from." | Fundhub, June 2026 Voice Agents SOT. Adapted. |
| "Did you already pull my credit?" | "Not yet. That happens live on the call with Justice, with your OK." | Fundhub, Josh prompt answer. Adapted. |
| "Is this legit?" or "Is this a scam?" | "Fair question. I've been in business funding for about a decade and worked hundreds of files. Justice shows you exactly how it works on the call, and you decide from there." | Fundhub: Josh answer plus Chris's proof lines (RULES.md). Adapted. |
| "Can I just do this myself?" | "You could. The call with Justice is about which lenders and in what order, so it's a plan and not a spray of applications." | Fundhub: Josh answer plus the playbook's "apps come later, on a plan, not as a spray." Adapted. |
| "I already applied and got told no." | "That's frustrating. A no stays in your head. A past no is a fact. It doesn't tell me this file can or can't get a yes later, and I won't promise it flips. Justice can look at the real file on the call. Want me to get you a time?" | Fundhub: Sarah's objection sheet, setter version |
| "I've been burned before." | "That's a fair reason to go slow. I'm not promising a result. On the call, Justice shows you the fee in dollars before you pay anything." | Fundhub: Sarah's sheet, adapted |
| "Sounds too good to be true." | "If someone promised you a huge number and no risk, you should doubt it. I'm not promising a fund. Lenders decide. Justice walks you through what's real for your file." | Fundhub: Sarah's sheet, adapted |
| "I don't have a business." | "You don't need a business to work with us." | Fundhub: playbook |
| "I don't want more debt." | "Then I won't talk you into funding. Justice will tell you straight whether it even makes sense for you. If it doesn't, he'll say so." | Fundhub: Sarah's sheet, adapted |
| "What if you can't get me funded?" | "I can't promise a fund. Lenders decide. That's why the call comes first: Justice looks at the real file and tells you where you stand." | Fundhub: playbook |
| "Is there a guarantee?" | "I can't promise a lender will say yes, or that your score will move. I can get you a call where Justice shows you what's real." | Fundhub: playbook never-say list |
| "I need to talk to my spouse or partner." | Ask: "Would you want them on the call?" If yes or maybe, book a time when both can be there. Use Cole's "alignment" line from section 3, part 5. | Cole, "Support Objections," adapted |
| "Send me info" or "email me." | Ask: "Is there something specific you want to know?" Then: "What I'd put in an email depends on your file, and I haven't seen it yet. The call is where Justice looks at it. Want me to hold a time while you decide?" | Cole, "It sounds good but I need more information," first step only. Adapted. |
| "I'm busy" or "Not now." | "Totally get it. You don't have to decide anything today. It only takes a few minutes to show you how this works, and what you do with it is totally up to you. Which is easier, [time A] or [time B]?" | The low-pressure line is from `objection_handling_report.md`. Adapted. |
| "I need to think about it." | See the 1-to-10 steps just below. | Cole, "Pacing the First Objection" |

**When it is a real stall, pace it.** These three steps are Cole's. Use them once, gently.

1. "No problem. Money and time aside for a second, how do you feel about the idea of getting your file looked at?"
2. "On a scale of 1 to 10, where 1 is 'I want to get off the phone' and 10 is 'this is exactly what I need,' where are you?"
   - 10: "So is it just timing then?"
   - 8 or 9: "That's pretty high. When you say 8, what does that mean to you? What's keeping it from a 10?"
   - 7 or below: "What's keeping you from an 8, 9, or 10?"
3. If they stay vague, ask: "Can I be honest with you? Is it just nerves, or is it something about us?" Cole also offers three choices: they are not sure it will work for them, they do not trust the company, or they know it will work and it is just a matter of timing. "Which are you at?"

(Source: Cole, "Pacing the First Objection," steps 1 and 2.5 and "Option 3: Three Choices." Adapted. Cole's follow-on lines like "which one of those two people do you want to be?" are closer lines. They are not used here.)

**Not used:** Haynes' "red flags" text. It was written for multi-million-dollar deals and is too hard for this audience. Chris can add it back.

---

## 8. If they say no, or not now

Do not hang up cold. Cole says people who rush off the phone burn the bridge. (Cole, Follow-Up doc)

1. Stay on for 2 to 3 minutes. Small talk. Thank them.
2. Set a follow-up. Always, unless they are months out.
3. Give a specific date if they gave one (the "hot list"). Otherwise, put them on a general list to touch every few weeks (the "general list").

(Source: Cole, "Follow-Up and Pipeline Management." Adapted.)

Do not cancel anyone because they want a small amount. That rule belonged to another shop with a much bigger fee. It is not Fundhub's. (Fundhub: closer playbook)

---

## 9. Track it, and get better

**Set for yourself first.** Cole says to set yourself for a week before you bring a setter on. Sometimes 3 to 4 days is enough. That gives you the script, the numbers, and the experience to teach. Chris is doing that now. Save everything. (Cole, Group Funnel setter doc, "Reason 1: no baseline.")

**What to write down for each lead** (Cole's Setter Tracking Sheet columns, trimmed, plus "confirmed" from Vann):

- Lead came in (date, time, source)
- Dials, and when you reached them
- Real conversations (a "triage")
- Sets (booked on Justice's calendar)
- Sets that confirmed
- Sets that showed
- Sets Justice made an offer to
- Sets that closed

**Benchmarks from the sources. These are not Fundhub results.**

- Setter show rate: the best setters are above 80 percent. Below 70 percent can be fixed. (Vann)
- Fundhub's own AI Setter SOP uses 80 percent or better as the show target. (Fundhub)
- Cole's setter numbers (a minimum of 3 sets a day) are for a full-time team on cold traffic. They do not fit one person. Do not use them.

**After every call,** write: 3 things to keep, 3 things to change, and the real reason they said yes or no, in their words. Also mark: did I promise a score or a fund? If yes, that is a miss. (Fundhub: closer playbook section 13)

**Ask Justice for the result.** After his call he logs one of five outcomes: deposit, downsell, callback, no show, or not a fit. Ask him which one, and write it next to your set. (Fundhub: `src/sales/call-outcomes.mjs`)

---

## 10. Open items for Chris

These are choices only Chris can make. A default is used until he does.

1. **Say the $32 out loud?** Sources disagree. The Drive AI Setter SOP says to pre-frame the soft-pull fee. The Josh owner rule says never discuss any upfront fee. **Default here:** do not say a number. Justice covers it. If Chris wants to say it, the soft pull is $32 in `src/config/offers.mjs`. The Drive docs that say $50 are out of date.
2. **What to call Justice out loud.** The Josh prompts call the closer a "Senior Advisor." This script says "Justice." Chris says what Justice's title is on the call.
3. **Two real things to offer as a hook** (Haynes calls these "engagement bait"): for example a client win or a short FAQ video. **MISSING FROM SOURCES.** None is named anywhere. Do not invent one.
4. **Is the $297 roadmap path live for calls?** The script includes it because `closer-slo-pipeline-2026-09-18.md` says every buyer gets called.
5. **How a booking is made for a lead.** W1 decides this.

**Also MISSING FROM SOURCES:** Cole's messenger/DM scripts (intent and non-intent), his "basic follow-ups for when you get ghosted," and his setter scorecard template. They are linked from his docs but are not in Chris's Drive. Cole's call-breakdown videos are not there either. This script uses only the phone and text parts of his method.
