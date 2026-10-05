# The marketing machine runs on a schedule and on command

**3c. The marketing machine runs on a schedule and on command (owner rule, 2026-10-04; replaces the 2026-09-06 chat-only rule).** Chris runs marketing from the Marketing Command Center and the Teleprompter app. The machine writes ad scripts every 7 days at the day and time Chris sets, and whenever he taps Write now. It runs in Netlify scheduled and background functions and reads the rules from the repo at run time. Every machine draft passes `scripts/ads/check-script.mjs` before Chris sees it; drafts that still fail ship flagged. Every script, edit and rule change is saved back to the repo through a fine-grained GitHub token for this repository, used only by code that refuses any path outside the marketing folders. Chris's word beats any written rule. Spec: `docs/specs/marketing-machine-2026-10-04.md`.

Same law: `CLAUDE.md` §3c and `.cursor/rules/marketing-machine.mdc`.
