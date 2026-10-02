# Marketing data pipeline — pull + push (2026-09-22)

Chris: ad CTR and funnel stats must never depend on “some agent remembered to click.” This board is the fix.

## What pulls what

| Source | Stored in | Trigger |
|--------|-----------|---------|
| Meta ads (CTR, spend, clicks, impressions) | `ad_metrics_daily`, `ads`, … | `syncPartnerConnections()` — button **Sync Meta now** or **daily 7:00** `meta-campaign-sync-sweeper` |
| ClickFunnels pages (views, opt-ins) | `funnel_page_stats` | **Sync now** on Funnel Pages card or **daily 7:15** `clickfunnels-analytics-sweeper` |
| ClickFunnels HTML deploy | Live `apply.fundhub.ai` | `scripts/cf-push-custom-html.mjs` (unchanged) |

## Why it was empty (root cause)

1. **`analytics_connections`** had no ClickFunnels row — API key lived only in `.env`, never saved for sync.
2. **`ad_platform_connections`** had no Meta row — `META_ACCESS_TOKEN` dropped from `.env` / Netlify.
3. **Meta sweeper** existed but had **nothing to sync** without (2).
4. **No ClickFunnels sweeper** until 2026-09-22.

## One-time wire + first pull (agents)

```bash
# From repo root — reads gitignored .env (DATABASE_URL, AD_TOKEN_ENC_KEY, CLICKFUNNELS_*, META_*)
npm run marketing:data:bootstrap
npm run marketing:data:health
```

**`META_ACCESS_TOKEN`:** Business Manager system user (Conversions API / ads_read).  
https://business.facebook.com/latest/settings/system_users?business_id=1475597360226485

After token is in local `.env`, re-run bootstrap, then:

```bash
netlify env:set META_ACCESS_TOKEN "…" --context production --context deploy-preview --context branch-deploy --secret
```

(Ship once when other code changed — not per var.)

## Where Chris sees numbers

| What | URL |
|------|-----|
| Ad CTR (source of truth until CRM sync works) | https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=982103620742368&business_id=1475597360226485 |
| CRM campaigns (after Meta sync) | https://fundhub.ai/app/campaign-manager.html?partner_id=c889dd9a-6b19-421b-a4b3-43feaf9e89a7 |
| Funnel page stats (after CF sync) | Campaigns → Funnel Pages card |

## Assumed CTR doc (Gemini)

`docs/workflows/assumed-funnel-ctr-2026-09-22.md` — CF + Aug 15 spend facts; CTR bands labeled **ASSUMED**.

Raw CF API snapshot: `docs/workflows/cf-page-stats-pull-2026-09-22.json`.

## Still not automatic

- **Pixel event export** — Events Manager only unless CAPI/API added later.
- **On-page button CTR** on `/roadmap` — not in ClickFunnels step stats; needs custom events or checkout analytics.
