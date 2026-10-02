# SLO booking + CRM fields — 2026-09-21

## Cal.com

- Live booking for SLO post-purchase: `clickfunnels-fragments/slo/slo-02-booking.html` iframes **https://apply.fundhub.ai/funding-book-call** (ClickFunnels native calendar / Cronofy — not Cal.com).
- No Cal.com booking URL exists in repo env or code paths for this funnel.
- **Missing env (Cal.com webhooks only):** `CALCOM_WEBHOOK_SECRET` — not set in local `.env`. Live books today come from ClickFunnels (`booking.created`), not Cal.com.
- **Action taken:** none on booking HTML; iframe kept.

**Proof:** `curl -sI https://apply.fundhub.ai/funding-book-call` → HTTP 200.

## CRM custom fields (existing code)

| Field | Where stored | Set by |
|-------|----------------|--------|
| `utm_source` … `utm_term`, `landing_path`, `referrer_domain` | Client attribution + `mergeCustomFields` | `fh-attribution.js` / CF hidden inputs → webhook (`clickfunnels.mjs` `pickVisitAttribution`) |
| `slo_ref`, `slo_source` | `clients.custom_fields` | `stampSloRef` (`src/slo/buyer.mjs`); Commas checkout via `api/public/slo-checkout.mjs`; paid webhook via `src/slo/purchase.mjs` |
| `slo_pack_status` | `clients.custom_fields` | `src/slo/deliver.mjs` after pack delivery |
| `fundhub_client_id` | ClickFunnels contact `custom_attributes` on **paid webhook** | Expected by `src/slo/purchase.mjs` — **not stamped in repo funnel HTML yet**; CF workspace must map hidden input `fundhub_client_id` on the native order form or paid path will not attach sales (see `docs/journeys/slo-connections-intended.md`) |

**Proof:** `node --test src/slo/purchase.test.mjs` → 0 failures (stamps `slo_ref` / `slo_source` on paid webhook).
