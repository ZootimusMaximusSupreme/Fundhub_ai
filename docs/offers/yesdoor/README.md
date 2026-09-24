# Yesdoor

Second brand explored 2026-09-24, as a test case for [the 60 Minute Offer](../60min/README.md).

Concierge apartment matching across the Phoenix metro. One soft credit pull, no score damage, and
the renter is told which buildings will actually approve them. Free to the renter — the building
pays a placement fee.

Domains **yesdoor.ai** and **yesdoor.co** were both unregistered 2026-09-24. `yesdoor.com` is taken.

Modelled on the live `nestra.ai`, which does the same thing under a different name. Nestra appears
nowhere in this repo.

## Why it is nearly free to build

Approval odds is this repo's soft-pull machinery with a different label. Messaging, booking,
follow-up, the agent runtime and the funnel push are all reused. The front end is a weekend.

## Why it is not a 60-minute business

The software is the easy 10%. In order of difficulty:

1. **Getting paid.** Renters do not pay. Apartment communities do, on a signed referral agreement,
   usually a share of first month's rent. That is slow relationship sales and no agent does it.
2. **The licence.** In most states, Arizona included as far as anyone here knows, taking a fee for
   placing a renter needs a real estate licence held under a broker. Verify this before anything
   else — it has a lead time and it decides whether you are the broker of record or you partner
   with one.
3. **Keeping the data true.** Rents, availability and concessions move daily. "6 Weeks Free" is
   wrong within a week. Licence a feed, scrape, or someone updates it by hand.
4. **Renters are easy.** High intent, cheap traffic. The only easy part.

## The sequencing that works

Do not launch the paid version. Launch the demand side: free odds, free shortlist, no fee, no
licence needed to do that. Run ads for two weeks. Then walk into property managers holding a list
of pre-qualified renters who want their buildings — that is inventory they want, not a cold pitch.
Sign ten communities in a fortnight instead of six months.

Most people do this backwards and spend three months signing properties for a site nobody visits.

## Files

- [yesdoor.dc.html](yesdoor.dc.html) — the marketplace page, with a working three-question odds quiz
- Live canvas: https://claude.ai/artifact/RKPFVnkZt211zhaiBK1KBM

## Placeholders left in on purpose

`[N] BUILDINGS` on the city tiles, `[BROKER OF RECORD] · [LICENCE NO.]` in the footer, and a line
under the quiz results saying the odds come from a sample rule set. The twelve listings are demo
data and the card artwork is a generated facade pattern, because no photos exist yet.
