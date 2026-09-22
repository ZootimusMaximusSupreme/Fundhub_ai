# ClickFunnels Custom HTML push (operator)

**API ground truth:** https://developers.myclickfunnels.com/

Custom HTML Pages + SDK went **GA 2026-09-18**:
https://changelog.myclickfunnels.com/2026-09-18-the-clickfunnels-sdk-and-custom-html-pages-are-here

Agents push FundHub HTML and tracking with **`scripts/cf-push-custom-html.mjs`**. Manual paste is fallback only if API auth is truly missing.

## Env names (values in `.env` / Netlify only)

| Name | Purpose |
|------|---------|
| `CLICKFUNNELS_API_KEY` | Bearer token for CF API v2 (**required to push**) |
| `CLICKFUNNELS_SUBDOMAIN` | Workspace subdomain (`chrisstanbridgestea3f77f`) |
| `CLICKFUNNELS_WORKSPACE_ID` | Optional — skip team/workspace walk |
| `META_PIXEL_ID` | Optional override for Meta pixel (aliases: `FACEBOOK_PIXEL_ID`, `FB_PIXEL_ID`, `PIXEL_ID`) |
| `CLARITY_PROJECT_ID` | Optional — omit if empty |

Webhook ingress uses **`CLICKFUNNELS_WEBHOOK_SECRET`** — that is **not** the HTML push API key.

DB fallback: `analytics_connections` where `platform = 'clickfunnels'`.

## Commands

```bash
node scripts/cf-push-custom-html.mjs list
node scripts/cf-push-custom-html.mjs push --dry-run
node scripts/cf-push-custom-html.mjs push
node scripts/cf-push-custom-html.mjs push --only=apply-book
```

## Live apply funnel (do not break)

| URL | Headline (2026-09-20) | Push mode |
|-----|------------------------|-----------|
| https://apply.fundhub.ai/watch | Get $50,000 to $1,000,000… | Tracking inject or custom HTML if page type allows |
| https://apply.fundhub.ai/apply | Let's See What You Qualify For | Inject tracking — keep native survey |
| https://apply.fundhub.ai/funding-book-call | You Are Qualified | **Inject only** — native calendar |
| https://apply.fundhub.ai/thank-you | You're All Set | Custom HTML or inject |

$297 slo fragments (`clickfunnels-fragments/slo/slo-01-sales.html`, etc.) target the **297 funnel**, not the apply calendar step.

## Tracking (must be on pushed pages)

- `https://fundhub.ai/funnel/fh-attribution.js` — UTM catcher (Creative Factory)
- `https://fundhub.ai/funnel/vsl-watch-beacon.js` — **watch only**
- Meta pixel base + PageView (custom HTML head, or already on apply via CF site code — verify view-source)
- `clickfunnels-fragments/06-utm-hidden-fields.html` — **do not** duplicate if `fh-attribution.js` is loaded
- `07-vsl-watch-beacon.html` — same as beacon script on watch

Meta pixel ground truth (if env empty): `docs/workflows/archive/ads-revenue-model-2026-08-24.md`.

## Calendar rule

Full custom HTML **replaces the step**. Native booking calendar **does not** survive. Never full-replace `/funding-book-call`.

The $297 booking page (`/roadmap-book`) shows this same calendar in a frame. Its frame-only look lives in
`clickfunnels-fragments/04c-book-framed.html`, pushed as one marked block into the calendar page's
`head_code` (manifest key `apply-book-framed`, strategy `code_block_upsert`: reads the live head code with
`expand[]=head_code`, snapshots it, appends the block or swaps only that block, then re-reads to verify). It
does nothing when the page is not in a frame, so `/funding-book-call` itself looks the same.

```bash
node scripts/cf-push-custom-html.mjs push --dry-run --only=apply-book-framed
node scripts/cf-push-custom-html.mjs push --only=apply-book-framed
```

The standalone page's own fit lives in `clickfunnels-fragments/04d-book-fit.html` (manifest key
`apply-book-fit`, marker `fh-book-fit`, same page, same `head_code`, same upsert). Every rule is
`html:not(.fh-framed)`: the scheduler's big logo stays inside its panel at every width, and on phones
(under 640px) the card runs full width minus 16px gutters. It never matches inside the frame.

```bash
node scripts/cf-push-custom-html.mjs push --dry-run --only=apply-book-fit
node scripts/cf-push-custom-html.mjs push --only=apply-book-fit
```

## Skills / rules

- Cursor: `.cursor/skills/fundhub-clickfunnels-html-push/SKILL.md`
- Cursor rule: `.cursor/rules/clickfunnels-html-api-push.mdc`
- Claude Code: `.claude/skills/fundhub-clickfunnels-html-push/SKILL.md`

## Prove

View-source each live URL for `fbq('init'` and `fh-attribution.js`. Click calendar on book page (look only). No pay, no SSN.
