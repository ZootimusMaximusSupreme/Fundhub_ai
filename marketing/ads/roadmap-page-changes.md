# /roadmap page changes — before and after

Chris, 2026-09-29: "Write down today's change time so you can compare results before and after it."

Every time the $297 sales page at https://apply.fundhub.ai/roadmap changes, add a row. Newest at top. Times are Arizona time; UTC is beside it.

| Went live (Arizona) | UTC | What changed | Commit | ClickFunnels page |
|---|---|---|---|---|
| 2026-10-01 14:45 | 2026-10-01 21:45 | Page cut to Headline, Subheadline, VSL, How It Works, Testimonials, FAQ, then checkout. New headline "I'll Show You How to Get Funding Forever!" and subheadline "You'll never need anyone to fund you again." New five-step How It Works (13 hidden data points, $100,000 to $300,000 gap in red). Cut: What You Get, Your fastest first win, Already have good credit?, Why this works, Approvals, What Happens Next, Who this is for, The guarantee section, and the Gene and $297 lines under the headline. Testimonial captions and FAQ rewritten plainer. Checkout untouched. | (this commit) | 25516164 |
| 2026-09-29 13:30 | 2026-09-29 20:30 | Reorder and rewrite. Testimonials right under screen one, a section for buyers who already have good credit, Funding Snapshot first, the free Business Duplication Map bonus, the /watch scrolling bar above the footer, and every button reads "Get My $297 Funding Roadmap" (was "Show Me How Much I Qualify For"). Checkout untouched. | `8b8995c8` | 25426320 |

The 13:30 time is when the push saved its copy of the old page (13:30:23) and replaced it. Plain `/roadmap` served the old page for about two more minutes; count from 13:30.

## How to compare

Take the same number of days on each side of the time above. Compare:

- Visitors who scroll past screen one, and how many press play on the video: Microsoft Clarity, project `tscu15s674`.
- People who fill in step 1 of the checkout (`slo.contact_started`; saved by `POST /api/public/slo-interest`).
- Paid $297 orders.

Ad spend changes on the same days skew the numbers. Note any in the row.
