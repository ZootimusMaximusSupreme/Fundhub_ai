# Funnel cutover inventory — 2026-09-21

Chris asked which funnels exist, where they live, and what blocks moving off ClickFunnels. **Do not delete `/roadmap`.** No custom-coded replacement serves the same paths yet except partial Fundhub API paths (Commas checkout, pull) that are not a full funnel swap.

## Original apply funnel (ClickFunnels)

| Name | Live URLs | Host |
|------|-----------|------|
| Fundhub apply / VSL funnel | https://apply.fundhub.ai/watch · https://apply.fundhub.ai/apply · https://apply.fundhub.ai/funding-book-call · https://apply.fundhub.ai/thank-you | ClickFunnels (native survey + **native calendar** on `/funding-book-call`) |
| Manifest keys | `apply-watch`, `apply-survey`, `apply-book`, `apply-thank-you` in `clickfunnels-fragments/tracking-manifest.mjs` | |

**Cutover blocked:** `/funding-book-call` must stay native CF (AppointmentScheduler / Cronofy). Full custom HTML replace is forbidden in manifest. No repo route serves `/apply` or `/watch` as a full custom-coded funnel.

## $297 SLO / roadmap funnel (ClickFunnels + Fundhub APIs)

| Step | Live URL | Host | Repo fragment |
|------|----------|------|----------------|
| Sales | https://apply.fundhub.ai/roadmap | ClickFunnels custom HTML (`pageId` 25426320, `custom_html_put`) | `clickfunnels-fragments/slo/slo-01-sales.html` |
| Booking | https://apply.fundhub.ai/fundhub-297-roadmap-book--c8e0b (alias may vary) | ClickFunnels custom HTML | `clickfunnels-fragments/slo/slo-02-booking.html` (iframes `/funding-book-call`) |
| Thank you | Not listed as live in manifest (`liveUrl: null`) | ClickFunnels when published | `clickfunnels-fragments/slo/slo-03-thank-you.html` |
| Post-pay pull | https://fundhub.ai/roadmap/pull.html | Fundhub (Netlify) | `public/roadmap/pull.html` (when deployed) |

**Cutover blocked:** Sales page embeds **native CF two-step order** in the widget slot; deleting the CF step removes checkout. Commas path exists at `/api/public/slo-checkout` but is not the live `/roadmap` checkout today. **Keep `/roadmap` on CF until a custom page proves the same checkout + webhook + `fundhub_client_id` path.**

## Third funnel (not fully live)

Manifest and journeys note a **third funnel** is planned; no third complete funnel HTML push is in `PUSH_MANIFEST` besides apply + SLO $297 trio. Do not invent URLs.

## Summary

| Funnel | Still ClickFunnels? | Safe to delete CF page? |
|--------|---------------------|-------------------------|
| Original apply | Yes | **No** — no custom replacement for `/apply`, `/watch`, `/funding-book-call` |
| $297 roadmap | Yes (sales + booking) | **No** — `/roadmap` is live custom HTML on CF; pull is Fundhub but not a full funnel |
| Third | Not proven live | **No** |
