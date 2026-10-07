# Closer handoff: what Chris passes to Justice

**For:** Chris (setter, for now) to Justice (High Ticket Closer).
**When:** As soon as a call is booked. For a hot lead, right away (see "Hot flag").
**Why:** Cole's last step is "Qualify": fill in a short note so the closer is "brought up to speed on what we talked about" and does not ask the same things twice. (Cole, Setter Crash Course)

**Every source:** `ops/workflows/team-setup-sarah-justice-2026-10-07/w3-setter-sources.md`

Tags: **Cole** = Cole Gordon training in Drive. **Haynes** = Jeremy Haynes' setter SOP. **Vann** = Spencer Vann's show-rate course. **Fundhub** = Chris's own documents. **adapted** = a source gave the step and the Fundhub words were written here.

---

## What Justice already sees (so you do not repeat it)

On his pre-call screen, Justice can already see: how many messages are on file, a short summary, what they want, what for, a guessed score, when the last message was, and the lead source and setter. His context pack also holds the application answers, every message, and earlier call transcripts. (Fundhub: `src/sales/cockpit.mjs` `buildPrecall`, `src/agents/context.mjs`, `public/app/closer-call.js`)

So the note holds what the form cannot show: **their own words, what they pushed back on, who decides, and whether they will show up.**

## Where to put it

1. **The client file's Notes box.** Open the client file. Add your note at the top. Keep what is already there. Press "Save notes." The box is one block of text. Saving replaces the whole block with what is on screen. It is staff-only. (Fundhub: `public/app/client-control-panel.html`, `api/client-notes.mjs`)
2. **Text Justice the one-line version** (the last section below).

**MISSING FROM SOURCES:** nothing in Fundhub shows the Notes box on Justice's closer-call screen. I only found it on the client control panel. Chris or W2 can decide where a setter note should live. Until then, use both steps above.

---

## The note, in the order Justice needs it

Justice's own routine before a call is: open their card, read the score they typed, the cash they said they have, what they want the money for, whether they have negatives, and the time. Then write one line: "I think this is a funding / course / downsell call because ___." (Fundhub: closer playbook, "Minute 0, before you join.") The note follows that order.

Copy this and fill it in. Leave a line blank if you do not know it. **Never guess.**

```
SETTER NOTE  -  [First Last]  -  sent [date, time, Arizona]

1. WHO AND WHEN
   Name / phone / email:
   Call: [day, time, zone]     Booked how: [self-booked / I booked]
   Came from: [apply funnel / $297 roadmap / other]
   Confirmed: [yes / no]   How and when:

2. MY ONE LINE
   I think this is a [funding / course / downsell / look-first] call because ___.

3. WHAT THEY WANT (their words)
   Amount:        For:        By when:
   Why now / the goal in their words:

4. WHERE THEY ARE NOW
   What they tried, and what happened:
   How long it has held them back:

5. THE FILE (their claims, not facts)
   Score they said: [band]   Guess or checked:
   Negatives: [yes / no / what they said]
   Business or personal:    Business name:    How old:
   Incorporation date they gave: ___   (UNVERIFIED. Justice checks it.)
   Revenue or income they said:   Can they show it:

6. MONEY FEEL (no fees were discussed)
   1-to-10 answer:    Cash band from the application:
   Anything they said about paying or being tight:

7. WHO DECIDES
   Alone / partner / spouse:     On the call: [yes / no / maybe]

8. WHAT THEY PUSHED ON, AND WHAT I SAID
   Their worry:
   My exact answer:
   Sent to the call (price, approval, guarantee, other):

9. SHOW-UP
   Told: computer + quiet spot [yes / no]
   Anything that could stop them:
   Video sent: [yes, time / no]

10. PROMISE CHECK
   I did not promise a score, an approval, a dollar amount, a fee, or a result:  [yes]
   If I said anything close to those, copy it here:

11. NEXT
   Texts set: night before [ ]  morning of [ ]
   My next touch and when:
```

### Why each part is there

| Part | Why Justice needs it | Source |
|---|---|---|
| 1 Who and when | He has to be on time, and knows if they confirmed | Vann: confirmed calls show up far more often |
| 2 My one line | It is the line Justice writes himself before a call | Fundhub: playbook "Minute 0" |
| 3 What they want | It is the goal he anchors the whole call to | Cole, "need pay-off." Fundhub: closer script phase 2 |
| 4 Where they are now | The "tried and failed" story sets up trust | Cole, "solution questions." Fundhub: closer script phase 2 |
| 5 The file | He needs it to pick the lane. It is a claim until he looks. | Fundhub: playbook section 5. Vann: many answers are false |
| 6 Money feel | A soft read on cash. No fees came up. | Cole, the 1-to-10 financial question |
| 7 Who decides | A spouse who is not on the call is a hidden objection | Cole, "Support Questions" |
| 8 What they pushed on | So Justice does not contradict you, and knows the worry | Haynes: gather what helps the closer tailor the call |
| 9 Show-up | The call only works if they are there | Fundhub: Josh prompt. Vann |
| 10 Promise check | One slip on a score or a fund is a miss | Fundhub: closer playbook section 13 |
| 11 Next | So nothing falls through | Cole, Follow-Up doc |

(The table's source column mixes the original sources. The note format itself is adapted from Cole's "Qualify" short form and Fundhub's Minute 0 routine.)

---

## What goes in the note: the rules

- **Their words, not yours.** Quote them. Justice uses their words to build trust. (Cole, Vann)
- **Keep it short.** If it will not fit on one screen, it is too long. This is my advice. It is not from a source.
- **Never put in the note:** a Social Security number, a date of birth, full account numbers, or a password. And never take a payment. (Fundhub: closer agreement section 2.8, in `sarah-final-gate-2026-08-24.md`)
- **Do not label anyone "unqualified."** Haynes says interest and fit are different. A quiet lead can be a good one. State what they said. Justice decides. (Haynes)
- **Do not cancel the call for them.** Fundhub's playbook says not to auto-cancel for a smaller ask, or for a bankruptcy unless a manager gives that rule in writing. Flag it in part 8 or 5. (Fundhub: closer playbook section 12)
- **Flags to write in part 5 or 8 when you hear them.** These come from Chris's Closer Avatar (a Drive doc) and playbook. They are things Justice wants to know early:
  - Negatives on the file (the playbook says "look first"; the $32 read is the honest step).
  - A young business. The playbook says personal funding still works, and "no business required."
  - Very little cash. The playbook says that is not an automatic no. Justice decides.
  - They want a guaranteed number or approval before anything runs. The Closer Avatar says to reset once. Tell Justice.
  - They only want to learn, not have it done for them.

---

## Hot flag

If a **$297 roadmap buyer** has a score of **680 or better**, **has a business**, and **needs it this month**, text Justice right away. Do not wait to finish the note. He takes those straight, and "the rest get worked first." (Fundhub: `closer-slo-pipeline-2026-09-18.md`, 2026-09-18)

**MISSING FROM SOURCES:** a hot rule for apply-funnel leads. None exists. The Drive "AI SETTERS IDEA" doc has a scoring scheme, but it is an old brainstorm with made-up numbers and was not used. Chris can set one.

---

## The one-line text to Justice

Send this after you book, and again if something changes.

> "[First name] [Last], [day, time, zone]. [Funding / course / downsell / look-first]. Wants about [amount] for [use]. Flag: [one thing]. Confirmed: [yes / no]. Note is in their file."

(Source: Fundhub, adapted from the AI Setter SOP's "3-way text handoff," which told the closer by name. Chris is texting Justice, so there is no group text.)

---

## Close the loop

After Justice's call he logs one of five outcomes: **deposit, downsell, callback, no show,** or **not a fit.** Ask him which one and write it next to your set. That is how you learn what your sets turn into. (Fundhub: `src/sales/call-outcomes.mjs`. Cole: the setter tracker's "sets offered" and "sets closed.")

If it was a no show, go to `setter-call-script.md`, section 6, "If they no-show."

Sarah (Sales Manager) can read the notes to coach. Her job includes scoring calls and keeping the team on the approved script. (Fundhub: `sarah-final-gate-2026-08-24.md`)
