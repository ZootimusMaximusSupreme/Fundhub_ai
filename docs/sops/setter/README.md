# Setter SOP

**Written:** 2026-10-07. **Team:** Chris sets, by hand, from his business cell. Justice is the High Ticket Closer. Sarah is the Sales Manager.

Setting is the logic Josh was programmed with (`vendor/inquiry-remover/src/agents/setter-prompt.js`). Chris runs that same logic by hand. There is no AI setter in this SOP (owner-set 2026-10-07: "We're not doing Josh Setter... I'm just manually doing it.").

## The four steps, in order

| # | Step | What Chris does | Where the words are |
|---|---|---|---|
| 1 | **The call** | Calls the lead right after they book. Uses Josh's call flow: open and confirm the time, frame (credit is pulled live on the call), light set from 2 or 3 application answers, show-up close. Under 5 minutes. | `setter-call-script.md` |
| 2 | **The warm-up** | Films and texts a short personal video from his business cell ("Hey, how's it going? Nice to meet you..."). This warms the lead up before Justice gets them. | `video-intro-script.md` |
| 3 | **The sequence** | No answer: leave Josh's voicemail, then send the three follow-up texts. Text 1 goes right away, text 2 thirty minutes later, text 3 two hours after that. Stop when they reply or book. | `setter-call-script.md` |
| 4 | **The 3-way text** | Briefs Justice before the call. Fifteen minutes before the call, the lead gets the handoff text that introduces their advisor and the meeting link. | `closer-handoff.md` |

Booking link for any lead who has not booked yet: https://apply.fundhub.ai/funding-book-call

## What the system already sends by itself

You don't send these. They go out on their own, so don't repeat them:
- **Welcome text and email** when the application comes in (`src/workflows/s-00-welcome.mjs`).
- **Booking confirmation, then reminders** 24 hours and 2 hours before the call (`src/workflows/s-04b-booking-reminders.mjs`).
- **The 3-way handoff text** 15 minutes before the call, plus a task for the closer (`src/workflows/ai-set-04-3way-handoff.mjs`). It is one text to the lead, not a group chat, and it is signed "Josh at Fundhub" (live `message_templates` row `SMS-AISET04-HANDOFF`).

## The four files

| File | What it is |
|---|---|
| `setter-call-script.md` | Josh's call flow, the voicemail, the three follow-up texts, the top objections. About one page. |
| `video-intro-script.md` | The warm-up video. |
| `closer-handoff.md` | The 3-way text, and what Chris tells Justice. |

## Where it came from

- **The setting logic:** Josh's prompt, `vendor/inquiry-remover/src/agents/setter-prompt.js` (call flow, rules, guardrails, voicemail, and the post-call questions).
- **The follow-up texts and handoff text:** the live `message_templates` rows `SMS-AISET03-MSG1` to `MSG3` and `SMS-AISET04-HANDOFF` (`db/seed/015_live_template_backfill.sql`, `db/seed/295_sms_copy_2026_09.sql`). The words are kept; the name changes from Josh to Chris.
- **Cole Gordon:** the Triage Call in "4. Setter Crash Course doc.docx" in Chris's Drive, and the seven-belief model in `src/sales/beliefs.mjs`. All Drive sources are listed in `ops/workflows/team-setup-sarah-justice-2026-10-07/w3-setter-sources.md`.
- **Fundhub rules:** `docs/sops/company-resources/sales-manager-objections-and-funding-2026-09-01.md`, `marketing/ads/RULES.md`, `src/config/offers.mjs`.

## Not in any source

- A place where Justice sees the setter note on his closer-call screen. The Notes box is on the client control panel only.
