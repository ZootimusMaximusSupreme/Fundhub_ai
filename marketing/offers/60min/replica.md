# The 60 Minute Offer — the Replica skill

Owner note, 2026-10-05. Chris saw the Replica skill on Instagram and said: "Add this to the 60 minute offer."

## What it is

Eleven free Claude skills by Jake Schincariol (MIT license). Together they take an app or offer somebody else already sells, map how it works, rebuild it, score the rebuild against the original, and read the original's real reviews to find what its buyers hate. The rebuild then fixes those complaints and gets a new name, so the result can be sold.

A copy lives in [`replica-skill/`](replica-skill/). Where it came from: [`replica-skill/UPSTREAM.md`](replica-skill/UPSTREAM.md). Upstream: https://github.com/Jakeschincariol/replica-skill

## What it adds to the offer

Chris's offer strategy is to take a competitor's proven offer, recreate it, and out-deliver it (owner-set 2026-10-05). The 60 Minute Offer starts with "you bring an offer." Replica lets the starting point be a competitor's offer instead: it maps what the competitor sells and finds what their buyers complain about, and the hour builds the version that fixes those complaints.

## Where each skill goes

Replica's own author sizes a simple booking-app clone at a few weeks, so none of it makes the 27-minute build faster. Its value is in two places: the research before the clock starts, and three quick checks added to the launch gate.

| Skill | Use it? | Where it goes |
|---|---|---|
| `replica-recon` | Yes | Before the clock. Maps the competitor's pages, steps, and features into `replica/recon.md` and `replica/features.csv`. That map becomes the spec the build agents work from. It also counts the clicks on the competitor's main path, which gives the hour a number to beat. |
| `replica-entrepreneur` | Yes | Before the clock. Reads 100+ real reviews of the competitor and ranks what buyers hate, what is missing, and what nobody solves. Every quote has a link, and its tool drops any review without one. Out comes a fix list and a positioning angle. This is the out-deliver part. |
| `replica-brand` | Yes | Before the clock, plus one gate check. Names the new version with the trademark and domain checks to run, which feeds the domain item on the pre-warm list. Its `sweep.py` finds the competitor's name, domain, or colors anywhere in the build. |
| `replica-diff` | Yes, as gate checks | Minute 20–27. `parity.py` scores the build against the competitor's feature list and fails when a must-have feature is missing. `imgdiff.py` compares page layout against the competitor's screenshots and ignores color. |
| `replica-design` | One tool | Minute 0–2. `contrast.py` checks that every text color can be read on its background. |
| `replica-launch` | Pricing step only | Before the clock. Its pricing step builds a table of the competitor's public prices with the date each was read. That helps fill the `[PRICE]` gap in the three tiers. The App Store listing parts do not apply. |
| `replica-test` | Its edge-case list only | Minute 2–10 and 17–19. Its list of edge cases (two tabs, double click, back button, emoji, time zones) and its S1–S4 bug scale are good. As written, the same agent builds the code and writes the tests, which is the exact hole proof stack item 1 closes. The 60 Minute proof stack stays in charge of testing. |
| `replica-architect` | No | This repo already has its stack chosen and built. |
| `replica-build` | No | The 1,000 build agents do this, from the recon map. |
| `replica-backend` | No | Login, payments (Commas), and messaging already run in this repo. |
| `replica-deploy` | No | It defaults to Vercel and Stripe and has the customer do every account step by hand. The integration agent plan does account setup by API. |

## Changes to the clock

- **Pre-warm list, new item:** competitor recon and review research (`replica-recon`, `replica-entrepreneur`). This only applies when the offer is a rebuild of a competitor's. Collecting 100+ reviews takes hours, so it can never fit inside the hour.
- **Launch gate, three new checks:** `parity.py` (no must-have missing), `sweep.py` (nothing of the competitor left), and `contrast.py` (text can be read). All three are plain Python with nothing to install and run in seconds, so the 27-minute clock does not move.

## The rules the pack enforces

These are built into the skills, and its checks block a launch that breaks them:

- It rebuilds what an offer does. It never copies the competitor's code, logo, copy, images, or private systems.
- It reads public pages and Chris's own accounts only.
- It always renames and recolors before launch. `sweep.py` blocks the deploy until nothing of the competitor is left.
- Review quotes are research. They never go on the sales page as testimonials.

## How to run it

The skills write into a `replica/` folder in whatever project they run in. To use them on a 60 Minute build, copy the `replica-*` folders into that build's `.claude/skills/` folder.

They are left out of this repo's own `.claude/skills/` on purpose. Their trigger phrases include "ship it", "landing page", "pricing", and "find bugs", so loaded here they would take over Fundhub's normal work (for example `npm run ship`).

The tools run straight from this folder:

```bash
python3 marketing/offers/60min/replica-skill/replica-diff/parity.py replica/features.csv
python3 marketing/offers/60min/replica-skill/replica-brand/sweep.py . --config replica/brand.json
python3 marketing/offers/60min/replica-skill/replica-design/contrast.py replica/design/tokens.json
python3 -m unittest discover -s marketing/offers/60min/replica-skill/tests
```
