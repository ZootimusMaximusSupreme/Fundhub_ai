# Ad video + Submagic — ready to run (2026-09-23)

**Owner assumption:** Submagic and the ad-video pipeline are **on**. Agents verify and wire; they do not default to “maybe off.”

## Strategy docs (read before filming / naming)

| Doc | Use |
|-----|-----|
| `docs/video-pipeline-plan.md` | End-to-end plan: Chris films + approves only; one ad number → one finished video in Paul’s folder |
| `docs/journeys/ad-video-flow.md` | **Code truth:** states, sweeper, env names, money guards |
| `docs/specs/video-pipeline-unknowns-settled-2026-09-22.md` | Submagic API map (upload, no public URL required) |
| `docs/workflows/slo-ads-content-map-2026-09-23.md` | What each SLO file **actually says** vs filename |
| `docs/workflows/slo-ads-drive-manifest-2026-09-23.md` | Chris Drive naming: `SLO Ad N Take M.mp4` |
| `docs/ads/fundhub-297/FundHub-LOCKED-ADS.md` | Locked ad scripts AD 1–7 |
| `docs/ads/fundhub-297/FundHub-VSL-Scripts.md` | VSL 1 / 2 scripts |

Next session: **ads vs VSLs strategy** using the table above + content map (portal welcome ≠ sales VSL, VSL 1 is four segments, etc.).

## Drive layout (must match sweeper)

| Folder | Drive id | Role |
|--------|----------|------|
| **SLO Ads (filmed — one folder)** | `13ZOjA56MNuM-PHSRK5fQK0bovRwR8raZ` | All filmed MP4s. `DRIVE_RAW_FOLDER_ID` = this id (owner-set 2026-09-24). |
| ~~Raw subfolder~~ | `12L_RH8QycTZFeaXn4rHs9AIeGq7XokWU` | Retired; consolidated 2026-09-24. |
| paul-submagic | `1E7IwPDoVZHSoj4F4_71SZRRdNoQKG0t7` | Approved finals for Paul (`DRIVE_PAUL_FOLDER_ID`). |

~~Takes sitting in **SLO Ads root** are **not** picked up. Move them:~~

```bash
node --env-file=.env scripts/ad-video-move-takes-to-raw.mjs          # dry-run
node --env-file=.env scripts/ad-video-move-takes-to-raw.mjs --apply
```

Organize / dedupe (SLO names, trash UUID dupes):

```bash
node --env-file=.env scripts/slo-ads-drive-organize.mjs --apply
```

(Run organize on the tree that includes Raw if dupes land there.)

## Submagic — do not waste minutes

From `ad-video-flow.md` and `submagic.mjs`:

- **~30 project creates / hour** (hard vendor cap).
- Sweeper **batch 10** rows per pass; **5‑minute** cron — on purpose.
- **`submagic_claimed_at` / `export_claimed_at`** — claim before paid call; no double create on retry.
- **`autoRender: false`** until export is intentional.
- Staging is **direct upload** — no public Drive link, no extra hosting bill.
- Do **not** hand-run create/export for bulk tests; one take through the pipeline when proving.

## Env (names only)

Production (Netlify): `SUBMAGIC_API_KEY`, `DRIVE_RAW_FOLDER_ID`, `DRIVE_PAUL_FOLDER_ID`, `SUBMAGIC_WEBHOOK_URL`, `ADAPTERS_DRY_RUN=0`, `MESSAGING_DRY_RUN=0`, Drive OAuth or service account, `NTFY_*`, `ANTHROPIC_API_KEY` (script match step).

Local `.env`: `DRIVE_RAW_FOLDER_ID` and `DRIVE_PAUL_FOLDER_ID` set 2026-09-23. **`SUBMAGIC_API_KEY` lives on Netlify** — copy to local `.env` only when running Submagic from the laptop (never commit).

## Prove (when ready — costs money)

1. One **new** take in **Raw** only (or move one file, mark row manually if re-processing).
2. Let sweeper advance **one** row; watch status in DB / logs.
3. Chris **approve** once on phone.
4. Final lands in **paul-submagic**.

Do not mass-create Submagic projects for the 14 library files until strategy says which are **ads** vs **VSL** vs **not Submagic** (e.g. portal welcome, segment files).
