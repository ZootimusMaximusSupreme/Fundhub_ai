# Roadmap run mode — 2026-09-27

Chris is running the $297 ads. Four jobs. Do not touch testimonials.

Shared rules for every job:

- Company name is **Fundhub**. Never FunHub.
- Do not edit HTML, CSS, or the look of a page. Grok does not design screens.
- Do not `npm run ship`. Do not commit files you did not change. The tree has other people's unfinished work. Commit only your own files.
- Do not text or email a real customer while building. Skip `actor=agent`, `@fundhub.ai`, and test emails.
- Write your result at the bottom of this file when done.

| Job | Owns | Status |
|---|---|---|
| Time on the roadmap page | `public/funnel/fh-attribution.js`, `api/public/slo-interest.mjs` | done |
| The genuine text and email | messaging only. Do not edit `fh-attribution.js` | claimed |
| Ad watch curve, rule, and a ping | Meta data, a rule, a text to Chris. No dashboard HTML | claimed |
| RB2B pixel | `public/funnel/rb2b.js` only. Stays off with no account id | claimed |

## RB2B

- Loader: `public/funnel/rb2b.js` (no-ops until an id is present).
- Snippet source: https://support.rb2b.com/en/articles/9117086-rb2b-install-guide-for-react-js
- Script URL pattern (from that page): `https://s3-us-west-2.amazonaws.com/b2bjsstore/b/<RB2B_ID>/reb2b.js.gz`
- Env: `RB2B_ID` — public pixel/account id from the RB2B dashboard Script section. **Unset. Pixel is off.**
- Before anyone is identified: Chris creates an RB2B account at https://www.rb2b.com/ (do not sign him up from here; no card from agents), copies the unique id from Script in the dashboard, sets `RB2B_ID` in Netlify + local `.env`, and exposes it as `window.RB2B_ID` (or `data-rb2b-id` on the script tag) when `/funnel/rb2b.js` loads. Do not use ClickFunnels admin for this.

## Time on page

**Event:** `slo.engagement` via `POST /api/public/slo-interest` with `kind: "engage"`.

**Stored (one `events` row per browser session, key `slo-engage:<session_id>`):**
- `seconds_on_page` — visible-tab seconds (hidden time does not count). Monotonic on update (max wins).
- `reached_form` — true once `#fhw` entered the viewport. Stays true once set.
- `actor` / `actor_reason` — same `classifyVisitor` rules as visit (webdriver / bot UA → agent).
- `session_id`, `landing_path`, `attribution` (UTMs).

**Client:** only when `#fhw` exists. Heartbeat every 30s while the tab is visible; also on hide / `pagehide`. Does not create a client, charge a card, or send email (`skipInngest`).

**Why not a new row every 30s:** the events table is append-only for inserts, but engage **updates the same row’s payload** after the first insert. One session → one row.

**How to read:**
- Reached the form: `payload.reached_form = true`.
- Left in a few seconds: `payload.seconds_on_page` is small (e.g. under ~10) and usually `reached_form = false`.
- Sat and scrolled to checkout: high `seconds_on_page` and `reached_form = true`.

**Files:** `public/funnel/fh-attribution.js` (+ synced `06-utm-hidden-fields.html`), `api/public/slo-interest.mjs`, `src/http/slo-interest.test.mjs`. Also loads `/funnel/rb2b.js` (404 ignored). Not shipped — needs deploy for live `/roadmap`.
