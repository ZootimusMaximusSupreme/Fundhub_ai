# What ClickFunnels will actually tell us about a funnel page

**Written:** 2026-09-08. **Source:** ClickFunnels' own published developer docs and
OpenAPI schema, fetched and read on that date. Nothing here is from memory.

**Why this file exists.** Chris has an open decision about what "conversions" should
mean. This file lays out the whole menu so the decision is made against facts, not a
guess about what the platform offers.

---

## The short version

The question was framed as **"opt-ins or sales?"**

The real answer is that ClickFunnels hands us **thirteen numbers per funnel step**, and
our code currently keeps **two of them**. Opt-ins versus sales is a choice between two
items on a much longer menu, and there is no technical reason we cannot store both.

---

## What our code does today

`src/analytics/clickfunnels.mjs:254-257`:

```js
const views       = Number.isFinite(body.step.views_all) ? body.step.views_all : null;
const conversions = Number.isFinite(body.step.optins)    ? body.step.optins    : null;
return { available: true, views, conversions };
```

Two numbers. They land in `funnel_page_stats`
(`db/migrations/302_analytics_connections.sql:99`), which has columns for exactly those
two: `views` and `conversions`.

Everything else the platform returns is read and thrown away.

**Credit where it is due:** the module's header comment
(`src/analytics/clickfunnels.mjs:1-60`) says every path and parameter was checked
against ClickFunnels' published OpenAPI schema on 2026-09-07. I re-checked the parts
that matter and they hold up. The endpoint is right, the parameter names are right, and
the "no field called conversions" note is right.

---

## The full menu — what a funnel step actually returns

Endpoint: `GET /funnels/{funnel_id}/stats` with `expand[]=steps`.
Our code uses the per-page twin, `GET /pages/{page_id}/stats`. Both are documented and
real.

### Per step — thirteen fields

| Field | What it means, in plain words | Do we keep it? |
|---|---|---|
| `views_all` | Every time the page was loaded, including the same person twice | **Yes** → `views` |
| `views_unique` | How many different people saw it | No |
| `optins` | How many gave an email address | **Yes** → `conversions` |
| `optin_rate` | What share of viewers gave an email | No |
| `sales_count` | How many bought | No |
| `sales_rate` | What share of viewers bought | No |
| `sales_value` | How much money came in | No |
| `recurring_sales_count` | How many started a subscription | No |
| `recurring_sales_value` | Money from subscriptions | No |
| `earnings_per_view` | Money made per page load | No |
| `earnings_per_unique_view` | Money made per person | No |
| `page_id` | Which page this step is | n/a |
| `name` / `current_path` | The step's name and its URL path | No |

### Funnel summary — six more

`earnings_per_click`, `upfront_sales`, `upfront_sales_count`, `recurring_sales`,
`average_cart_value`, `pageviews`.

Money values come back as decimal strings, with an ISO currency code on the response.

---

## The decision, restated with the facts attached

Chris has to pick what the word "conversions" means on our screens.

**What each choice would show:**

- **Opt-ins** (`step.optins`) — someone handed over an email. For a funnel whose job is
  to book a call, this is the step that matters. This is what the code does today.
- **Sales** (`step.sales_count`) — someone paid. If nothing is sold on the funnel page,
  this will read zero forever, and a permanent zero on a dashboard trains people to
  ignore the dashboard.

**The third option, which the current schema does not allow:** store both, and label
them separately. `funnel_page_stats` has one `conversions` column, so this needs a
migration. It is a small one.

**Recommendation, one line, then it is Chris's call:** keep opt-ins as the headline
number and add columns for `views_unique`, `optin_rate` and `sales_count` alongside it,
so no rebuild is needed the day something is sold on a funnel page.

**Status: still blocked on Chris.** Not guessed, not changed.

---

## Two limits worth knowing

1. **Only funnel-step pages report anything.** `src/analytics/clickfunnels.mjs:250`
   handles this: if a page is not reached through a funnel step, ClickFunnels reports
   nothing for it and our code returns "nothing to show" rather than an error. That is
   correct behaviour, not a bug — but it means a standalone landing page is invisible
   to this API.
2. **No video watch data.** Nothing in the ClickFunnels stats vocabulary reports how
   long anyone watched a video on a page. If a VSL sits on a ClickFunnels page, the
   watch data has to come from the video player, not from ClickFunnels.

---

## The NULL rule holds

Both fields use `Number.isFinite(...) ? value : null`
(`src/analytics/clickfunnels.mjs:254-255`), and `funnel_page_stats` documents the same
rule in the migration itself
(`db/migrations/302_analytics_connections.sql`, comment above the `views` column):
**NULL means the platform did not answer. It never means zero.** A real zero and "we do
not know" must never look the same on a screen. Any new columns must follow it.

---

## Still blocked

- **ClickFunnels API key.** Nothing above can be pulled until it exists. Not guessed.
- **The conversions decision**, as set out above.

---

## Sources

- [ClickFunnels developer docs](https://developers.myclickfunnels.com/docs/intro)
- [Fetch Funnel Stats reference](https://developers.myclickfunnels.com/reference/getfunnelstats.md)
- [ClickFunnels OpenAPI schema](https://developers.myclickfunnels.com/openapi/clickfunnels-api.json)
- [Analytics Reporting Section Overview](https://support.myclickfunnels.com/support/solutions/articles/150000156959)
