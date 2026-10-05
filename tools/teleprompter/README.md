# Fundhub Teleprompter (v1, 2026-10-04)

Private teleprompter Chris films with. Words only, no camera. Live copy is published as a
private Claude artifact ("Fundhub Teleprompter").

- `template.html`: the page, with `__SCRIPTS__` where the script list goes
- `scripts.json`: the scripts loaded into it (pulled from
  `marketing/ads/scripts/book-a-call-final-2026-10-03.md`, green screen bullets left out)
- `index.html`: template + scripts, the file that gets published

What it does: steady words-per-minute scroll driven by the clock (no drift), pause and resume in
place, tap a word to start the take there, drag to move through the script, one-tap restart with a
3-2-1 countdown, mirror toggle, text size, reading line position, a real pause at every blank line,
CAPS words bold, ↑ shown in amber. Bluetooth remote / keyboard: Space plays and pauses, arrows change
speed, Page Up restarts. Edits made on the phone save on that phone only.

Next (see TODO.md): load scripts straight from the repo, and host it behind the staff login.
