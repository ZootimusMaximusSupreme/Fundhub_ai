# Closer handoff

What the system sends at the 3-way step, and what Chris tells Justice before the call. This is step 4 in `README.md`.

## What the system does

`src/workflows/ai-set-04-3way-handoff.mjs`. When a lead books, it waits until 15 minutes before the call. Then it does two things:

1. **Texts the lead.** The live row `SMS-AISET04-HANDOFF` (updated 2026-09-11, matches `db/seed/295_sms_copy_2026_09.sql`) says:

   > "{{first_name}}, it's Josh at Fundhub. Your call starts in 15 minutes, and I've briefed your advisor so you're not starting from scratch. Everything you need is here: {{meeting link}} Reply STOP to opt out."

2. **Opens a task for the closer.** Title: "3-way handoff — advisor follow-up on UnderwriteIQ results." Role: closer.

Plain facts about it:

- It is one text to the lead. There is no group thread with Justice.
- The link is the booking's meeting link. If the booking has none, the code sends the portal sign-in page. ClickFunnels bookings often carry no meeting link. (`meetingLinkFor` in the workflow file)
- It does not need AG-04. It runs while AG-04 is retired.
- It is signed Josh.

## What Chris does by hand

The text says "I've briefed your advisor." So brief Justice **before** the text goes, 15 minutes before the call. Two steps:

1. **Put the note in the client file.** Open the client control panel (`public/app/client-control-panel.html`). Add the note at the top of the Notes box. Keep what is already there. Save. The box is staff-only. (`api/client-notes.mjs`)
2. **Text Justice the one-liner.**

   > "[First] [Last], [day, time, Arizona]. Wants about [amount] for [use]. Flag: [one thing]. Confirmed: [yes / no]. Note is in their file."

**NOT IN SOURCES:** a place where Justice sees the Notes box on his closer-call screen. It is on the client control panel only. That is why you also text him.

## The note

Copy it, fill it in. Leave a line blank if you do not know it. Never guess.

```
[Name] - [day, time, Arizona] - confirmed: [yes / no]
Wants: about [amount] for [use], by [when]
Why, in their words:
Biggest thing in the way, in their words:
Who decides: [alone / partner]. Partner on the call: [yes / no]
What they said about their file (not checked): score band, negatives,
  business or personal, how old, cash they have
What they pushed on, and what I said:
Could stop them showing up:
Video sent: [yes, time / no]
I did not promise a score, an approval, a dollar amount, or a fee: [yes]
```

Where each line comes from:

- Amount, use, why, business, score band, cash: the application questions in the Josh prompt (`setter-prompt.js`).
- Biggest thing in the way, who decides: Cole's Triage Call, "Qualify" step (Drive: "4. Setter Crash Course doc.docx").
- Score, cash, use, negatives, time: what Justice reads in his own "Minute 0" routine (`docs/sops/company-resources/closer-playbook-2026-08-24.md`).

## Rules for the note

- Their words, not yours.
- Everything they said about their file is a claim. Justice checks it live.
- Never write a Social Security number, full account number, or password. (`sarah-final-gate-2026-08-24.md` 2.8)
- Do not cancel a call because of the note. Write it down. Justice decides. (`closer-playbook-2026-08-24.md`: no auto-cancel)

## After the call

Justice logs one of five outcomes: deposit, downsell, callback, no show, not a fit. (`src/sales/beliefs.mjs`, used by `src/sales/call-outcomes.mjs`) Ask him which one and write it next to your set.
