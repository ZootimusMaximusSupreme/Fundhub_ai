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
| Time on the roadmap page | `public/funnel/fh-attribution.js`, `api/public/slo-interest.mjs` | claimed |
| The genuine text and email | messaging only. Do not edit `fh-attribution.js` | claimed |
| Ad watch curve, rule, and a ping | Meta data, a rule, a text to Chris. No dashboard HTML | claimed |
| RB2B pixel | `public/funnel/rb2b.js` only. Stays off with no account id | claimed |

## RB2B

- Loader: `public/funnel/rb2b.js` (no-ops until an id is present).
- Snippet source: https://support.rb2b.com/en/articles/9117086-rb2b-install-guide-for-react-js
- Script URL pattern (from that page): `https://s3-us-west-2.amazonaws.com/b2bjsstore/b/<RB2B_ID>/reb2b.js.gz`
- Env: `RB2B_ID` — public pixel/account id from the RB2B dashboard Script section. **Unset. Pixel is off.**
- Before anyone is identified: Chris creates an RB2B account at https://www.rb2b.com/ (do not sign him up from here; no card from agents), copies the unique id from Script in the dashboard, sets `RB2B_ID` in Netlify + local `.env`, and exposes it as `window.RB2B_ID` (or `data-rb2b-id` on the script tag) when `/funnel/rb2b.js` loads. Do not use ClickFunnels admin for this.
