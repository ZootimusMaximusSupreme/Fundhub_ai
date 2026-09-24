# Ad video — best of all clips

**Owner law (2026-09-24):** Merging takes is part of the rules. One take shipped alone, when other clips or takes exist for that ad, is wrong.

## Law

For each ad, the pipeline looks at **every clip and every take** that belongs to that ad.

The AI or Submagic ships **one finished video** made from the **best** of those clips — not the first file that showed up, not a single take in isolation.

Chris never opens Submagic. Agents run merge, upload, captions, and B-roll in the pipeline.

Joining happens **before** Submagic sees the film (Submagic takes one upload per project). Submagic's job is captions and our B-roll on top of the already-merged master.

## Never

- Ship the first take by itself when other clips or takes exist for that same ad
- Ask Chris to pick takes, name takes, or open Submagic to merge or export
- Invent a new take file or start a new naming sequence (for example "SLO Ad 3 Take 1") when takes already exist elsewhere for that ad
- Move, rename, or reorganize the raw Drive folder to "help" — leave the raw library alone; the pipeline reads it

## Always

- Gather every take and clip tied to that ad before calling a cut done
- Build one master MP4 from the best moments across those sources, then send that single file through Submagic
- If merge logic is missing or stubbed, treat that as a gap — the law still applies; do not ship a lone take as a workaround

## Example

```text
Ask: "Run the ad video pipeline on SLO Ad 3."

❌ Poll Raw, grab Take 1 alone, export, and ship while Take 2 and extra clips sit in Drive.
✅ Find every take and clip for Ad 3, merge the best into one master, then Submagic once — Chris never touches Submagic.
```
