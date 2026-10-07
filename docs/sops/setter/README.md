# Setter SOP

**Written:** 2026-10-07. **Team:** Chris sets for now, by hand, from his business cell. Justice is the High Ticket Closer. Sarah is the Sales Manager.

Setting is four steps. Fundhub already built them. This SOP starts from what the code does. Then it says what Chris does by hand.

**AG-04 "Setter Josh" (the AI setter call) is retired today.** Read from the live database on 2026-10-07. While it is retired, step 1 does not dial. Step 1 is Chris's by hand until AG-04 is turned back on.

## The four steps, in order

| # | Step | What the system does by itself | What Chris does by hand today |
|---|---|---|---|
| 1 | **The call** | `src/workflows/ai-set-01-josh-setter.mjs`. A booking (`booking.created`) dials the lead to confirm the Strategy Session. It uses AG-04. It waits for 8 AM Arizona if the lead books at night. **AG-04 is retired, so the code returns `agent_not_ready` and no phone rings.** | Calls the lead from his business cell, same flow as Josh. See `setter-call-script.md`. |
| 2 | **The warm-up** | **No step in the code has this name.** Nearest built steps: `s-00-welcome.mjs` (application in: welcome text + email), `s-04b-booking-reminders.mjs` (booking: confirm text + email right away, reminder texts 24 hours and 2 hours before), `s-04c-staff-booked-alert.mjs` (booking: text to staff; Staff & Teams switch, default off). | Sends his personal video and three short texts. See `video-intro-script.md`. |
| 3 | **The sequence** | `src/workflows/ai-set-03-no-answer-cadence.mjs`. When a call ends as no answer or voicemail (`call.completed`): text 1 right away, text 2 after 30 minutes, text 3 after 2 more hours. Stops if the lead books again. Texts go only 8 AM to 8 PM Arizona (`src/messaging/gate.mjs`). **It starts from a finished Bland call, so it does not start while AG-04 is retired.** | Sends the same three texts himself, same spacing, under his own name. The words are in `setter-call-script.md`. |
| 4 | **The 3-way text** | `src/workflows/ai-set-04-3way-handoff.mjs`. A booking starts a timer. 15 minutes before the call it texts the lead and opens a task for the closer. It does not need AG-04. It sends nothing if the call has no start time or was booked less than 15 minutes ahead. | Briefs Justice before the text goes. The text says "I've briefed your advisor." See `closer-handoff.md`. |

## Three things to know

1. **The 3-way text is one text.** The code sends one message to the lead. It does not start a group chat with Justice. (`ai-set-04-3way-handoff.mjs`, `sendTemplated`)
2. **The built texts are signed Josh.** Welcome, booking, sequence and 3-way texts all say "it's Josh at Fundhub." Chris's own texts say Chris. (Live rows in `message_templates`, read 2026-10-07.)
3. **The live text copy is in the database, not in `templates-seed.mjs`.** `src/workflows/templates-seed.mjs` holds older copy for the same keys (its text 1 says "pre-approved"). The live rows match `db/seed/015_live_template_backfill.sql` and `db/seed/295_sms_copy_2026_09.sql`. This SOP quotes the live rows.

## The four files

| File | What it is |
|---|---|
| `setter-call-script.md` | The call, the voicemail, the three texts, the top objections. About one page. |
| `video-intro-script.md` | The personal video and where it fits. |
| `closer-handoff.md` | The 3-way text, and what Chris tells Justice. |

## Where it came from

- **The built flow:** the four workflow files named above, plus `src/messaging/providers/bland-voice.mjs` (`agentReadiness`) and the live `agents` row AG-04.
- **The Josh prompt:** `vendor/inquiry-remover/src/agents/setter-prompt.js`. The live AG-04 row holds the same words.
- **Cole Gordon:** the Triage Call in "4. Setter Crash Course doc.docx" in Chris's Drive. The seven-belief model is already in `src/sales/beliefs.mjs`. All Drive sources are listed in `ops/workflows/team-setup-sarah-justice-2026-10-07/w3-setter-sources.md`.
- **Fundhub rules:** `docs/sops/company-resources/sales-manager-objections-and-funding-2026-09-01.md`, `marketing/ads/RULES.md`, `src/config/offers.mjs`.

## NOT IN SOURCES

- What "warm-up" means to Chris. No file, doc or Drive source uses the word for a setter step. Step 2 uses the nearest built steps.
- How Chris books a time for a lead who has not booked.
- A place where Justice sees the setter note on his closer-call screen. The Notes box is on the client control panel only.
