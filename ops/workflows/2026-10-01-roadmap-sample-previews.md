# /roadmap order summary — sample previews (2026-10-01)

Chris: tap-to-preview "See a sample" (eye icon) under each deliverable line in the order summary; reuse old preview code + sample images from git history of slo-01-sales.html; open in the existing preview viewer; keep mobile height close to today. Track each open (deliverable) in our DB + Meta custom event PreviewOpened, plus how long it stayed open and whether the same visitor pressed the step-1 button afterward (compare Continue rate, opened vs not). Remove the "$15 per extra business" line. Then commit everything, merge to main, ship.

| Unit | Owner | Status |
|---|---|---|
| W1 — old previews from git history | Sonnet agent | done |
| W2 — tracking back end | Sonnet agent | done |
| W3 — page change + ship | main session (Opus) | claimed |

## W1 — old previews

**Key finding: there are NO sample images anywhere. Every old sample was HTML/CSS text drawn in a lightbox, not a picture.** No png/jpg/pdf of any deliverable sample exists in git, `public/`, or `public/funnel/` (only testimonial posters/videos, VSL, proof jpgs). Nothing to curl. The only "images" are CSS-drawn cover thumbnails.

**Where the old code lives.** Added in `0b0102b6` (2026-09-22, "What You Get: full sample covers + tabbed letter-pack lightbox", Alex Rivera made-up client) in `clickfunnels-fragments/slo/slo-01-sales.html` (this is the same file now at `marketing/landing-pages/slo/slo-01-sales.html`; moved in `2019c1b5`). Removed from the page body by `4be7a35a` (2026-09-29, "Push the new /roadmap page live"). **Last commit that still has the full markup + JS: `07b7308b`** (parent of 4be7a35a is 18930ea8). Get it with:
`git show 07b7308b:clickfunnels-fragments/slo/slo-01-sales.html` — srow thumbs at lines 906-911, lightbox div line 920, JS dict + opener lines 921-~975. Also the whole old page is saved in `4be7a35a` as `clickfunnels-fragments/slo/slo-01-sales.before-2026-10-01-copy.html`.

**Old markup (per deliverable row, a CSS cover on the right):**
`<a class="thumb" href="#" data-page="snapshot" aria-label="Sample page"><div class="cover"><div class="cv-wm">fundhub.</div><div class="cv-kick">underwrite iq / client deliverable</div><div class="cv-doc">how much you qualify for</div><div class="cv-title">How Much You Qualify For</div><div class="cv-foot"><span>Alex Rivera</span><span>Sep 2026</span></div><div class="wm">CLICK HERE</div></div></a>`
Lightbox: `<div class="lb" id="fh-lb" hidden><div class="lb-bg"></div><div class="lb-card"><button class="lb-x" ...>&times;</button><div class="lb-body" id="fh-lb-body"></div><div class="lb-note">Sample file for a made-up client...</div></div></div>`

**Old JS (one IIFE):** `var P={key:'<div class="sp">...html...</div>', ...}`; `render(k,tab)` sets `#fh-lb-body.innerHTML = P[k] + '<div class="wm wm-lb">SAMPLE</div>'`, then `lock()` adds a glass `.sp-lock` over everything below ~190px with "Unlock yours for $297" + `a.btn.sp-go href="#fh-order"`; `open(k)` unhides `#fh-lb` and sets body overflow hidden; one document click handler on `[data-page]` opens, `.lb-x` / `.sp-go` / `.lb-bg` closes; Escape closes. The pack has 8 tabs (`PACK` array, `.ptab` buttons).

**Per deliverable (sample = HTML string in dict P, commit 07b7308b, key / old thumb data-page):**
| Deliverable | Key | Sample | Reachable today |
|---|---|---|---|
| How Much You Qualify For | `snapshot` (thumb 1) | HTML table: middle score 672 -> 700+, qualifies $84,500 -> $146,000, value $61,500 | git history only (text in 07b7308b line 935). Same table is live today in the "first win" `.fh-snapfig` block (current file, ~2300 css). |
| Credit Analysis Report | `analysis` (thumb 2) | HTML: bureau health table (Experian/Equifax/TransUnion) + items | git history only (line 924) |
| Credit Optimization Roadmap | `roadmap` (thumb 3) | HTML month-by-month | git history only (line 930) |
| Dispute Letter Pack | `pack` (thumb 4) -> tabs `startHere, tree, round1, cond(R2), cond(R3), complaints, final, tracker` | HTML, 8 tabs | git history only (lines 945-955) |
| Bank and Lender Match List | `lenders` (thumb 5) | HTML: 15 lenders matched KPIs, available-now table, score ladder, application order | git history only (line 940) |
| Business Duplication Map (bonus) | `duplication` (thumb 6) | HTML: Experian Business check table, aging table, quarterly plan (Rivera Supply LLC) | git history only (line 951) |

So: all six HAVE a sample, all six are HTML text (no image file); NONE has an image/PDF. If W3 wants real pictures, they must be rendered new (screenshot the HTML, or use the real portal docs); there is nothing to host or link today.

**CURRENT working-tree page** `marketing/landing-pages/slo/slo-01-sales.html` (2334 lines):
- There is NO sample-preview viewer in the body now: no `#fh-lb`, no `data-page`, no `var P=`, no thumbs. Only orphan CSS survives: `.lb`, `.lb-bg`, `.lb-card`, `.lb-x`, `.lb-body`, `.lb-note`, `.wm-lb`, `.sp*`, `.thumb`, `.cover`, `.ptab`, `.sp-lock`, `.sp-go` (lines ~117-215, block `FH-PEEK-CSS` 707-768, `.lb-body .sp` / `.sp-lock` at ~2320-2325). So reusing the old `07b7308b` lightbox div + JS would work with the CSS already in place.
- Closest existing "viewer": only the testimonial `.tplay` click-to-play (lines ~839-905); no image viewer. Nothing opens an image.
- Order summary section `#fh-order` starts line 937; `<div class="sum">` ~944. The six deliverable lines: **946** How Much You Qualify For, **947** Credit Analysis Report, **948** Credit Optimization Roadmap, **949** Dispute Letter Pack, **950** Bank and Lender Match List, **951** FREE BONUS Business Duplication Map. Total line right after (~954).
- "$15" lines: **953** `<p class="fh-sumnote" data-extra hidden>... Each extra business is $15 ...` (the one under the order summary; hidden already); **992** header comment text; **1091** `cfw-addline` span with `$15`; **1093** `+ Add a business ($15)` button (`hidden`); **1171-1172** comment + `EXTRA_BIZ` flag that controls `[data-extra]`; **~1492-1496** `paintExtras()` text. All `[data-extra]` / add button are already hidden by the `EXTRA_BIZ=false` switch from bf563492, so removing line 953 (and 1091 span, 1093 button) is the visible cleanup.


## W2 — tracking

Done. Nothing committed, nothing shipped, slo-01-sales.html untouched.

**Browser calls the page makes** (the same `fht` helper already in slo-01-sales.html works; it queues in `window.fhq` until fh-events.js loads, and the tracker sends with sendBeacon, so a tab close still records):

- Open (preview shown), d = one of the six allow-listed slugs:
  `fht('preview_opened', { deliverable: d });`
  `try { if (typeof fbq !== 'undefined') fbq('trackCustom', 'PreviewOpened', { content_name: d }); } catch (e) {}`
  and remember `openedAt = Date.now()` and `openDeliverable = d`.
- Close (close button, backdrop, Esc, or opening a different preview):
  `fht('preview_closed', { deliverable: d, open_ms: Date.now() - openedAt });`
  then clear `openDeliverable`. Send it once per open.
- Tab close / hide while a preview is still open: on `pagehide` and on `visibilitychange` when `document.visibilityState === 'hidden'`, if `openDeliverable` is set, send the same `preview_closed` call and clear it.
- Allow-list, exactly: `how_much_you_qualify_for`, `credit_analysis_report`, `credit_optimization_roadmap`, `dispute_letter_pack`, `bank_lender_match_list`, `business_duplication_map`. Any other value is refused by the server (HTTP 400 `deliverable_invalid`, nothing saved). `open_ms` is clamped 0..600000 by the server; a missing one is stored as 0.
- No tracker change was needed: fh-events.js already exposes `window.fhTrack` and `window.fhq`. The Meta call is the page's own `fbq('trackCustom', ...)`, same pixel and same style the thank-you pages use.

**Join with Continue:** the step-1 button already sends `fht('continue', {step:1})` (slo-01-sales.html `onContinue`). Opens, closes and Continue all carry the same `session_id` (sessionStorage `fh_sid`) and all are `page: /roadmap`, so they join.

**Files changed:**
- `src/funnel/track.mjs` — events `preview_opened` / `preview_closed` on the allow-list, `PREVIEW_DELIVERABLES`, refusal of a bad deliverable.
- `src/funnel/track.test.mjs` — event count 22 to 24 (spec table check).
- `docs/tracking/tracking-spec.md` — two Events rows and a "Sample previews" section.
- `db/migrations/405_roadmap_preview_views.sql` — new, read-only.
- `src/http/roadmap-preview-tracking.pg.test.mjs` — new.

**Views (migration 405, security_invoker, UTC days, people only, `actor = 'person'`):**
- `v_roadmap_preview_continue_daily` — per org and day: `opened_visitors`, `opened_continued` (Continue at or after the first open), `opened_continue_rate`, `unopened_visitors`, `unopened_continued`, `unopened_continue_rate` (NULL when a group is empty). "Saw the page" = any `funnel.*` row on `/roadmap` for that session.
- `v_roadmap_preview_open_ms_daily` — per org, day, deliverable: `closes`, `avg_open_ms`.
- Read: `SELECT * FROM v_roadmap_preview_continue_daily ORDER BY day DESC;`

**Test results:**
- `src/http/roadmap-preview-tracking.pg.test.mjs`: 3/3 pass, 0 skipped (handler saves open and close; non-allow-listed, missing and SQL-injection deliverables refused with 400 and nothing saved; clamp; both views correct on seeded rows including a Continue-before-open visitor and an agent excluded). Existing `slo-interest-track.pg.test.mjs` 6/6 also pass on the same database. `track.test.mjs` and `slo-interest.test.mjs` pass (54 total with those).
- WHERE it ran: no local Postgres exists on this Mac and the test refuses the hosted Supabase address by design, so I ran it against an in-memory real Postgres engine (PGlite, installed only in the scratchpad, not added to the repo) with `orgs`, `events` (001_init shape), migration 404 and 405 applied, over the Postgres wire protocol via `DATABASE_URL`. It was not run against the full 400-migration schema or the live database.
- `npm run lint`: clean. `npx tsc --noEmit`: clean, no output.

**For the main session:** migration 405 is not live until `npm run ship` applies it (check `/api/health` pending 0). Journey docs untouched (no journey flow changed; page change is yours). Meta custom event is not documented in a meta-events file because `docs/tracking/meta-events.md` does not exist in the repo.

## W3 — manifest

(pending)

## W3 — manifest

- Page: `marketing/landing-pages/slo/slo-01-sales.html` — six "See a sample" links (eye icon, `data-sample`) under each order-summary line; sample viewer `#fh-lb` restored from 07b7308b (same Alex Rivera samples, SAMPLE watermark, made-up-client note); tracking `preview_opened` / `preview_closed` (open_ms, also on pagehide / tab hidden) + Meta `fbq('trackCustom','PreviewOpened',{content_name})`; order-summary "$15 per extra business" line removed. CSS: `.sum .fh-peek`, `.sum li:has(.fh-peek)` margin 8px.
- Mobile (390px) order summary height: 638px before, 729px after (+91).
- Proof (local Chromium, 390px): all six open the right sample and close; fhq got 6 opens + 6 closes with open_ms; fbq got 6 PreviewOpened; no visible $15 text in #fh-order.
- lint clean, tsc clean, track.test + routes.test 47/47.

## Shipped 2026-10-02

- Ship 4ad9f02c: live, 330 db changes applied, 0 pending (405 views live; 114/168/255/371/372 rename copies were already applied on prod — confirmed in schema_migrations before ship).
- ClickFunnels API push slo-297-sales (page 25516164) OK. https://apply.fundhub.ai/roadmap serves 6 data-sample links, colin2 video, no $15 order-summary line.
- Live proof (390px Chromium): Bank & Lender sample opened/closed; DB rows funnel.preview_opened + funnel.preview_closed (deliverable bank_lender_match_list, open_ms 1630, same session_id); marked actor=agent so the views leave it out. Both views query live.
