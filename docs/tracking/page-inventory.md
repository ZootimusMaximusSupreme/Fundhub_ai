# Funnel page inventory (Phase 2, 2026-10-02)

Every page a visitor can land on in a Fundhub funnel, survey, booking, checkout, order, or thank-you flow. Built for the tracking batch (`ops/workflows/tracking-everything-2026-10-02.md`).

How this was measured, 2026-10-02:

- **ClickFunnels, read only.** API v2, workspace 481896: every funnel (`/workspaces/481896/funnels`), every funnel's steps (`/funnels/{id}/structure`), all 35 workspace pages (`/workspaces/481896/pages`), each live page's `head_code` / `footer_code` / `custom_html`, the site code, the domains, the forms, and 30-day page stats. Nothing was written.
- **Live pages.** Each URL fetched once with a cache-bust query. The edge cache now ignores query strings (board, P1-C), so for ClickFunnels pages the tracking columns were also checked against the code the API returns. They match.
- **Database, read only** (`BEGIN READ ONLY`): `events` (`funnel.page`, `survey.submitted`), `payment_links`, `partner_pages`.
- **Repo:** `marketing/landing-pages/**`, `public/**` (not `public/app/`), `api/`, `src/`, `netlify.toml`, `docs/`.

Words used below:

- **Pixel** = Meta pixel `2403674420141513` with `PageView`.
- **Clarity** = our Microsoft Clarity loader `https://fundhub.ai/js/clarity.js` (project `tscu15s674`). ClickFunnels runs its own Clarity project on some of its pages. That one is not ours and is not counted.
- **Attr** = `https://fundhub.ai/funnel/fh-attribution.js`.
- **Events** = `https://fundhub.ai/funnel/fh-events.js`.
- **Builder page** = a page made in the ClickFunnels editor. The push can change only its head and footer code.
- **Custom HTML** = a ClickFunnels Custom HTML Page. The push replaces the whole page.

## 1. Every page

The manifest is `marketing/landing-pages/tracking-manifest.mjs`. **No rows were added in Phase 2.** Every live ClickFunnels funnel step is already in it. Section 4 explains the two ClickFunnels pages that are not.

| # | Page | Live URL | Funnel / step | Source file(s) | Type | In manifest (before → after) | Tracking loaded today (pixel / Clarity / attr / events) | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Watch (VSL) | https://apply.fundhub.ai/watch | Fundhub Funnel `968281`, step 1 `VSL` (step `RNMBPL`), page `25061160` | `01-vsl.html` (reference only, the body is builder), `01b-watch-lede.html` (head block) | ClickFunnels builder | yes → yes (`apply-watch`, `apply-watch-lede`) | yes / yes / yes / yes | live | Also loads the video beacon, `watch-proof.js`, and Direct ROAS. The pixel and Direct ROAS come from the funnel head code. `/vsl` redirects here. 349 views in 30 days. |
| 2 | Apply survey | https://apply.fundhub.ai/apply | Fundhub Funnel `968281`, step 2 `Apply` (step `KmKBGB`), page `25515671` | `apply-survey.html` | ClickFunnels custom HTML | yes → yes (`apply-survey`) | yes / yes / yes / yes | live | Screens are listed in section 2. After the last question, the same page shows the `/funding-book-call` calendar in a frame and fires Meta `Lead`. The manifest row names page `25068989`, which is the old, dead `/apply-page`. The push finds the page by its step path (`pageOnApplyStep`), so it still reaches `25515671`. |
| 3 | Funding Book Call | https://apply.fundhub.ai/funding-book-call | Fundhub Funnel `968281`, step 3 (step `oyQkxn`), page `25062844` | `04a-book-top.html` + `04b-book-bottom.html` (body, not written by the push), `04c-book-framed.html` + `04d-book-fit.html` (head blocks) | ClickFunnels builder + native calendar | yes → yes (`apply-book`, `apply-book-framed`, `apply-book-fit`) | yes / yes / yes / yes | live | Also loads Direct ROAS. After booking, the calendar sends the visitor to the next step, `/thank-you`. This page is also shown in a frame inside `/apply` and `/roadmap-book`. When framed, events and Clarity stay quiet. |
| 4 | Thank You | https://apply.fundhub.ai/thank-you | Fundhub Funnel `968281`, step 4 (step `pyOryn`), page `25063539` | `05-thank-you.html` (reference), `05b-thank-you-fit.html` (head block) | ClickFunnels builder | yes → yes (`apply-thank-you`, `apply-thank-you-fit`) | yes / yes / yes / yes | live | Also loads `thankyou-sort.js`, `funding-paths.js`, and Direct ROAS. No button goes on to a next step. |
| 5 | $297 Roadmap sales page and checkout | https://apply.fundhub.ai/roadmap | Fundhub $297 Roadmap `984178`, step 1 (step `oyEOAN`), page `25516164` | `slo/slo-01-sales.html` | ClickFunnels custom HTML | yes → yes (`slo-297-sales`) | yes / yes / yes / yes | live | The checkout is part of this page: 1 Info, 2 Card, 3 Soft pull. The card form is Commas' own form, shown inside this page. Also loads the video beacon. `/fundhub-297-roadmap` redirects here. Ads land here with `landing_path=/roadmap/`. |
| 6 | Roadmap booking | https://apply.fundhub.ai/roadmap-book | Fundhub $297 Roadmap `984178`, step 2 (step `gVOBpl`), page `25516165` | `slo/slo-02-booking.html` | ClickFunnels custom HTML | yes → yes (`slo-297-booking`) | yes / yes / yes / yes | live | Shows the `/funding-book-call` calendar in a frame. Also loads the video beacon. |
| 7 | Roadmap thank you | https://apply.fundhub.ai/roadmap-thank-you | Fundhub $297 Roadmap `984178`, step 3 (step `ngQEAo`), page `25516166` | `slo/slo-03-thank-you.html` | ClickFunnels custom HTML | yes → yes (`slo-297-thank-you`) | yes / yes / yes / yes | live | |
| 8 | ClickFunnels calendar "Meeting with Chris" | https://apply.fundhub.ai/schedule/phonecall | ClickFunnels appointment page. Not in any funnel, has no page id. | none | ClickFunnels appointment page | no → no (the manifest cannot reach it) | no / no / no / no | live | Linked from every funding pack (`src/deliverables/chrome.mjs` `BOOK_CALL_URL`), the `/optimize` roadmap (`src/optimize-page/roadmap.mjs`, `api/public/optimize.mjs`), and the `bookUrl` that `GET /api/public/slo-checkout` returns. The ClickFunnels API has no way to read or write this page's code: the only appointment endpoint is `scheduled_events`, and the workspace site code is empty. Today it carries none of our tracking, only ClickFunnels' own Clarity. |
| 9 | ClickFunnels $297 order page | https://apply.fundhub.ai/order | Fundhub Funnel `968281`, step 5 `Fundhub $297 Roadmap Order` (step `zWDKbb`), page `25426768`, product "Complete Funding Diagnostic" | none. `slo/slo-02-order.html` is **not** on it: 0 of its 25 text lines appear on the live page. | ClickFunnels builder + native checkout | no → no | yes / **no** / yes / **no** | **unsure** | Serves 200 in a live funnel and can take a real $297 payment. Nothing links to it: `/roadmap` keeps its checkout on the page, the calendar's next step is `/thank-you`, and `/thank-you` has no next button. 3 views (2 people), 0 sales in 30 days. Not added. See section 4. |
| 10 | fundhub.ai homepage + homepage survey | https://fundhub.ai/ | Website. Survey source `website:home`. | `public/index.html`, `public/js/homepage-survey.js` | Our Netlify site | not a ClickFunnels page | **no** / yes / **no** / **no** | live | Also loads RB2B. Survey screens are in section 2. It posts to `/api/public/survey-submit`. Last real submit was 2026-08-18 (3 in the last 45 days). |
| 11 | Affiliate referral hop | https://fundhub.ai/start?ref=CODE | Affiliate | `public/start.html` | Our Netlify site | not a ClickFunnels page | no / yes / no / no | live | Also loads RB2B. Referral links come from the portal affiliate screen (`public/app/affiliate.html:651`). Records the click, then sends the visitor to `/watch` with `a1` and `ref`. |
| 12 | Education home | https://fundhub.ai/education/ | Education | `public/education/index.html` | Our Netlify site | not a ClickFunnels page | no / no / no / no | live | Also loads RB2B. Linked from the homepage. |
| 13 | Education enroll (checkout) | https://fundhub.ai/education/enroll/ | Education | `public/education/enroll/index.html` → `POST /api/public/education-enroll` | Our Netlify site | not a ClickFunnels page | no / yes / no / no | live | Also loads RB2B. No enrollments in 60 days. |
| 14 | Education course access (after purchase) | https://fundhub.ai/education/learn/ | Education | `public/education/learn/index.html` | Our Netlify site | not a ClickFunnels page | no / no / no / no | live | Also loads RB2B. |
| 15 | Affiliate / white-label apply | https://fundhub.ai/affiliates/ | Affiliate | `public/affiliates/index.html` → `POST /api/public/partner-apply` | Our Netlify site | not a ClickFunnels page | no / yes / no / no | live | Also loads RB2B. Linked from the homepage. No applications in 60 days. |
| 16 | Partner (Ascension) sales | https://fundhub.ai/partner/ | Ascension | `public/partner/index.html` + `public/partner/funnel.js` → `/api/public/funnel-checkout` | Our Netlify site | not a ClickFunnels page | no / no / no / no | live | Also loads RB2B. Linked from `/affiliates/`. No checkouts in 60 days. |
| 17 | Partner price menu | https://fundhub.ai/partner/menu/ | Ascension | `public/partner/menu/index.html` + `funnel.js` | Our Netlify site | not a ClickFunnels page | no / no / no / no | live | Also loads RB2B. `/partner/autopsy/` redirects here. |
| 18 | Partner live trial (sales) | https://fundhub.ai/partner/trial/ | Ascension | `public/partner/trial/index.html` + `funnel.js` | Our Netlify site | not a ClickFunnels page | no / no / no / no | live | Also loads RB2B. |
| 19 | Partner trial dashboard (after purchase) | https://fundhub.ai/partner/trial/live/ | Ascension | `public/partner/trial/live/index.html` | Our Netlify site | not a ClickFunnels page | no / no / no / no | live | The link is sent after a trial is set up (`src/trials/provision.mjs:319`). |
| 20 | Winner's Board | https://fundhub.ai/partner/board/ | Ascension | `public/partner/board/index.html` + `funnel.js` | Our Netlify site | not a ClickFunnels page | no / no / no / no | live | No RB2B. |
| 21 | Old $297 sales page | https://fundhub.ai/roadmap/ | $297 (old) | `public/roadmap/index.html` | Our Netlify site | not a ClickFunnels page | no / no / yes / no | **unsure** | Serves 200, noindex. The only ways in are the `/slo` redirect and its own checkout page. Live $297 traffic uses https://apply.fundhub.ai/roadmap. |
| 22 | Old $297 checkout | https://fundhub.ai/roadmap/pay.html | $297 (old) | `public/roadmap/pay.html` | Our Netlify site | not a ClickFunnels page | no / no / yes / no | **unsure** | Sends the buyer to a Commas card page. `docs/journeys/slo-offer-actual.md` still draws it. The live `/roadmap` no longer links to it. |
| 23 | Old $297 soft-pull form | https://fundhub.ai/roadmap/pull.html | $297 (old) | `public/roadmap/pull.html` | Our Netlify site | not a ClickFunnels page | no / no / no / no | **unsure** | Also loads RB2B. It is still the server's default place to send a buyer after Commas when no return address is sent (`src/slo/offer.mjs` `SLO_PULL_PATH`). The live `/roadmap` does send one, so only buyers from `pay.html` land here. |
| 24 | Credit audit referral page | https://fundhub.ai/optimize, then https://fundhub.ai/optimize-plan | Optimize | `public/optimize.html`, `public/optimize-plan.html` → `/api/public/optimize` | Our Netlify site | not a ClickFunnels page | no / yes / no / no | **unsure** | Also loads RB2B. Hidden on purpose: referrals only, nothing links to it (`docs/journeys/optimize-intended.md`). No audit checkouts in 60 days. |

**Pages on our own Netlify site (rows 10–24).** The manifest pushes to ClickFunnels only, so it cannot reach these. Their tracking is the `<script>` tags in each `public/**/*.html` file. Those go live through `npm run ship`.

**Payment pages run by Commas.** These are the repair-plan checkout opened from the `/roadmap` result screen, the partner checkouts, the education checkout, and `pay.html`. They are Commas' own pages, so we cannot add tracking to them. The $297 card form on `/roadmap` is the exception: it sits inside our page, so `/roadmap`'s tracking covers it.

**Not funnel pages.** Listed so they are not missed. None takes an order or a funnel lead:

- `/consulting/` (FH Consulting info site, email link only)
- `/careers`
- `/climate/` (dashboard, no form, no links out)
- `/progress`, `/contract`
- `/portal-login`, `/login`, `/reset-password`
- `/unsubscribe`, `/crm`, `/app/`, `/leads/<hash>/`
- `/privacy/`, `/terms/`

## 2. Survey steps

The step ids are the keys in the code.

| Survey | Step # | Screen id | Question | URL |
|---|---|---|---|---|
| /apply survey (custom HTML) | 1 | `contact` | Let's Start With Your Info | https://apply.fundhub.ai/apply |
| /apply survey | 2 | `cf_svy_funding_target_amount` | Set Your Target Amount | https://apply.fundhub.ai/apply |
| /apply survey | 3 | `cf_svy_planned_use` | Planned Use | https://apply.fundhub.ai/apply |
| /apply survey | 4 | `cf_svy_money_change_now` | What Would This Money Change Right Now? | https://apply.fundhub.ai/apply |
| /apply survey | 5 | `cf_svy_self_reported_fico` | Your Current Score | https://apply.fundhub.ai/apply |
| /apply survey | 6 | `cf_svy_has_business` | Do You Have a Business? | https://apply.fundhub.ai/apply |
| /apply survey | 7 (business) | `cf_svy_business_revenue` | Annual Business Revenue | https://apply.fundhub.ai/apply |
| /apply survey | 8 (business) | `cf_svy_revenue_verifiable` | Can You Verify Revenue? | https://apply.fundhub.ai/apply |
| /apply survey | 7 (personal) | `cf_svy_annual_income_range` | Annual Personal Income | https://apply.fundhub.ai/apply |
| /apply survey | 8 (personal) | `cf_svy_income_verifiable` | Can You Verify Income? | https://apply.fundhub.ai/apply |
| /apply survey | 9 | `cf_svy_available_capital` | Available Capital | https://apply.fundhub.ai/apply |
| /apply survey | 10 | (review, no id; `finish()`) | "Reviewing your answers" loading screen | https://apply.fundhub.ai/apply |
| /apply survey | 11 | (result; `result()` + section `#cal`) | "You're qualified. Pick a time below." + framed calendar. Meta `Lead` fires here. | https://apply.fundhub.ai/apply |
| fundhub.ai homepage survey | 1 | `funding_target_amount` | Set Your Target Amount | https://fundhub.ai/ |
| fundhub.ai homepage survey | 2 | `planned_use` | Planned Use | https://fundhub.ai/ |
| fundhub.ai homepage survey | 3 | `money_change_now` | What Would This Money Change Right Now? | https://fundhub.ai/ |
| fundhub.ai homepage survey | 4 | `current_score` | Your Current Score | https://fundhub.ai/ |
| fundhub.ai homepage survey | 5 | `has_negatives` | Any negatives on your credit report? | https://fundhub.ai/ |
| fundhub.ai homepage survey | 6 | `has_business` | Do You Have a Business? | https://fundhub.ai/ |
| fundhub.ai homepage survey | 7 (business) | `annual_business_revenue` | Annual Business Revenue | https://fundhub.ai/ |
| fundhub.ai homepage survey | 8 (business) | `verify_revenue` | Can You Verify Revenue? | https://fundhub.ai/ |
| fundhub.ai homepage survey | 7 (personal) | `annual_personal_income` | Annual Personal Income | https://fundhub.ai/ |
| fundhub.ai homepage survey | 8 (personal) | `verify_income` | Can You Verify Income? | https://fundhub.ai/ |
| fundhub.ai homepage survey | 9 | `available_capital` | Available Capital | https://fundhub.ai/ |
| fundhub.ai homepage survey | 10 | `contact` | Let's Start With Your Info. Posts to `/api/public/survey-submit`. | https://fundhub.ai/ |
| /roadmap checkout (steps, not a survey) | 1 | `s1` / tab `1` | Info | https://apply.fundhub.ai/roadmap |
| /roadmap checkout | 2 | `s2` / tab `2` | Card (Commas form inside the page) | https://apply.fundhub.ai/roadmap |
| /roadmap checkout | 3 | `s3` / tab `3` | Soft pull. Opens only after the card is paid. | https://apply.fundhub.ai/roadmap |
| /roadmap checkout | after 3 | panes `reading`, `slow`, `done`, `failed`, `repair`, `repair-done` | Reading the file. Then: done → `/roadmap-book`, failed → book a call, repair → pick a plan → Commas card page. | https://apply.fundhub.ai/roadmap |

Each survey path shows 9 question screens: both business questions or both personal questions, never all four. On `/apply` the contact screen comes first. On the homepage it comes last.

**No other live survey exists:**

- **ClickFunnels native survey.** The "Survey Form" (form `492193`, 10 questions + first name, last name, email, phone) sits only on the dead `/apply-page` (section 3).
- **Climate survey.** Not built (section 3).

## 3. Dead or old pages

| Page | Why it is dead |
|---|---|
| https://apply.fundhub.ai/apply-page (ClickFunnels page `25068989` "Apply", landing page) | Not in any funnel, no step, no inbound link. It is the old native survey (`Survey/V1`) + calendar. It still has pixel, attr, and Direct ROAS. The manifest's `apply-survey` row still names this page id. |
| https://apply.fundhub.ai/ (bare domain) | Redirects (302) to the workspace homepage. That page is the ClickFunnels "Hero Theme - Home Page" template, with a sample sign-up form. Nothing links to it. `public/start.html` notes the bare domain goes to the wrong theme. |
| `/my-example-page` (site page `25029807`) | ClickFunnels example page. The site has no homepage set. |
| 21 "Hero Theme - …" pages (`25029808`–`25029828`) | ClickFunnels theme templates (store, blog, course, checkout, order confirmation, and more). Not in any funnel, not linked. |
| Hero Funnel 1 ×2 (funnels `967259`, `967260`; pages `25029835`–`25029838`) | Archived, live mode off, tagged "Imported". `/hero-funnel-2` returns 404. |
| Fundhub Funnel 2 (funnel `984159`) | No steps, live mode off, no domain. `/fundhub-funnel-2` returns 404. |
| `marketing/landing-pages/slo/slo-02-order.html` | Not on any live page. None of its text is on `/order`. The archived copy is `slo/archived/slo-02-order-pre-297-2026-09-20.html`. |
| Old roadmap redirect stubs (`25426320`, `25426722`, `25428615`) | Already deleted: API 404, public 404 (`docs/sops/clickfunnels-custom-html-push.md`). Not in today's page list. |
| https://fundhub.ai/partner/autopsy/ | Redirects (302) to `/partner/menu/`. Shelved by the owner 2026-08-31 (`netlify.toml`). |
| `/sites/<partner>/<slug>` partner pages | 8 published "apply" pages. All belong to test partners (5 named "Sim…", 3 named "E2E…"). No real partner page exists. |
| Climate front door + match list (`marketing/landing-pages/climate-front-door-2026-09-18/`) | Spec and mock only. Not deployed. The live `/climate/` is the old dashboard with no form. `/api/public/climate-match` exists, but no public page calls it. |
| Second URLs for live pages: `/vsl-page`, `/funding-book-call-page`, `/thank-you-page`, `/order--53172`, and the other page paths | Each redirects to `chrisstanbridgestea3f77f.myclickfunnels.com/<page path>` and serves the same page **without** the funnel head code, so no pixel and no Direct ROAS. Not separate pages. Nothing links to them. |

## 4. Why no manifest rows were added

- **All live ClickFunnels funnel steps (rows 1–7) were already in the manifest.**
- **`/schedule/phonecall` (row 8) is live, but the manifest cannot carry it.** It is a ClickFunnels appointment page with no page id. The API has no endpoint for its code.
- **`/order` (row 9) is unsure, not live-in-funnel.** It serves 200 and can take a real $297 payment, but nothing sends anyone to it. If Chris calls it live, this row would give it Clarity and events through the safe whole-footer push. The checkout itself is never touched. The row (same shape as `apply-book`):

  ```js
  {
    key: "apply-order",
    funnelId: "968281",
    liveUrl: "https://apply.fundhub.ai/order",
    path: "/order--53172",
    pageId: "25426768",
    vslBeacon: false,
    extraFooterScripts: [FH_EVENTS_SRC, CLARITY_SRC],
    strategy: "head_footer_append_only",
    note: "Native ClickFunnels $297 checkout (Complete Funding Diagnostic) — footer scripts only, never full replace",
  },
  ```

  Adding it also needs one line in `src/ads/funnel-proof-scripts.test.mjs`. Its test "only the /watch path's builder steps get footer scripts, and only these" pins the exact list of rows that have footer scripts.
- **Our Netlify pages (rows 10–24) are not ClickFunnels pages.** Their tracking is the script tags in `public/**`.
