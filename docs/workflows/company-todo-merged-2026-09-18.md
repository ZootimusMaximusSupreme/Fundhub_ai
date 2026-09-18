# Company to-do — merged 2026-09-18

Owner-set today: no OpenAI credit hunt. Agreements, SMS copy, and email copy wait until **Saturday**. SLO ClickFunnels paste is **PAUSED (copy)** — he said the copy sucks. Google Allow already clicked; token save failed on our side (do not ask Chris to Allow again). Saturday list unchanged.

## Access (reviewed this morning)

| Thing | Have it? | What that means |
|---|---|---|
| Gmail OAuth | **Chris-done** (walkthrough click). Token file still missing. | Google Allow already clicked. Token save failed on our side. Do not ask Chris to Allow again. Inbox still cannot be read until a token lands without another Allow. |
| Calendar | **Chris-done** (same walkthrough click). Token file still missing. | Same: Allow already clicked. Token save failed on our side. Do not ask Chris to Allow again. Free/busy still cannot run until a token lands. |
| SendGrid | **No, and we do not use it** | Outbound mail is **Mailgun** + **Resend**. Both keys are present. SendGrid is not a provider in this app. |
| ClickFunnels webhook | **Yes** | `CLICKFUNNELS_WEBHOOK_SECRET` is set. Leads can post in. |
| ClickFunnels API write | **No** | No CF API key in env. I cannot paste page code for you. You paste in the CF editor. |

## Your clicks (today)

1. **Google Gmail + Calendar** — **Chris-done**. Do not ask Allow again.
2. **Regular funnel codes** — watch counter.
   - Open https://apply.fundhub.ai/watch
   - In ClickFunnels, edit that page.
   - Workspace: https://chrisstanbridgestea3f77f.myclickfunnels.com/
   - Paste `clickfunnels-fragments/06-utm-hidden-fields.html` at the top.
   - Paste `clickfunnels-fragments/07-vsl-watch-beacon.html` at the bottom.
   - Save and Publish.
3. **SLO funnel codes** — **PAUSED (copy)**. He said the copy sucks. Do not paste today.
   - Live pages already on https://fundhub.ai/slo/ (pay + pull work).
   - CF paste paused (copy). Fragments stay in `clickfunnels-fragments/slo/`
     - Sales: `slo-01-sales.html`
     - Order: `slo-02-order.html`
     - Thank-you: `slo-03-thank-you.html`
   - Same workspace: https://chrisstanbridgestea3f77f.myclickfunnels.com/

## Saturday (paused)

- Real Funding + Credit Repair agreement words
- SMS / email copy
- #11 Blueprint contract send
- Hole 21 no-book chase send

## Still-open product holes (Opus pack)

File: `docs/workflows/open-holes-2026-09-18.md`

7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 20, 22, 23, 24.

Not in that pack: **15** Apply (Oxylabs password is in local `.env`; Netlify set was cut off). **1** agreements Saturday. **2–6** proved. **10** closed.

## Other company lists pulled in

From `TODO.md` and marketing boards (still relevant):

- Paste watch counter in CF (same as click 2 above)
- Social Studio “Write 3 posts” still writes 0 on live
- 237 lenders missing bureau
- No minimum credit score on lender rows
- 191 banks missing apply links
- CF survey attribute map: https://apply.fundhub.ai/apply — Part B of `docs/clickfunnels/OWNER-CF-SETUP-CHECKLIST.md`
- Bland: account has no owned number
- Gmail “FS Auto” filter hides Fundhub mail
- UnderwriteIQ Month-5 / DUNS — you said we don’t do DUNS; strategy still not final
- Booking confirm rule (calendar Yes vs YES text) still unset

## SLO today — what “done” means

Stranger can: land sales → pay $297 → pull form → pack → book.

Already live: https://fundhub.ai/slo/ · https://fundhub.ai/slo/pay.html · https://fundhub.ai/slo/pull.html · GET checkout $297.

SLO CF paste paused (copy). Pull submit / live CRS stays off unless you pick live later.
