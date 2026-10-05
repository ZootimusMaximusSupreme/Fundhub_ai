# Animations go on last

**Owner law (2026-10-04):** Animation overlays always go on last: after the cut and after captions.

## Order

1. The cut: every take merged into one best-of master, in script order (`.claude/rules/ad-video-best-of-clips.md`).
2. Captions: Submagic adds captions to that merged master.
3. Animations: our diagrams and overlays go on top of the captioned video. They are our B-roll.

## Never

- Lay an animation over the film before Submagic adds captions
- Turn on Submagic AI B-roll (it stays off)

## Example

```text
Ask: "Finish Ad 91."

❌ Overlay the animations on the master, then send it to Submagic.
✅ Cut the master, Submagic adds captions, then lay the animations on last.
```

This replaces step 2 of the 2026-10-02 saved plan (`ops/workflows/broll-v2-2026-10-02.md`), which put overlays before Submagic. Spec: `docs/specs/marketing-machine-2026-10-04.md` §2 item 9.
