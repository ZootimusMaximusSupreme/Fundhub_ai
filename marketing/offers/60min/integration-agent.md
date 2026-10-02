# The 60 Minute Offer — the integration agent

Owner note, 2026-09-24. Private system. Not a customer-facing feature yet.

## What Chris asked for

An agent that sets up **all the integrations on the customer's own machine and accounts**, by API,
with no clicking. It wires everything together and funds what needs funding, so the customer never
opens a dashboard.

"we need to have an agent that goes and sets up all the integrations on your computer as well.
all api. so it wires it all up, loads $ and shit."

## Why it matters

The build clock is ~27 minutes. Everything that is NOT in those 27 minutes is account setup:
domain, DNS, merchant account, ad account, email sender, calendar, phone number. That is the
part that actually makes a launch take a day instead of an hour, and none of it is code.

If the agent does account setup too, the pre-warm checklist disappears and the hour is real
end to end.

## What it would wire

| Thing | What the agent does |
|---|---|
| Domain + DNS | Register, point nameservers, wait for propagation |
| Hosting | Create the site, set env vars, first deploy |
| Database | Provision, run migrations, confirm |
| Merchant account | Create, connect bank, set webhook, fund/verify |
| Email sender | Domain auth, SPF/DKIM, warm the sender |
| Phone / SMS | Buy the number, register the campaign |
| Calendar | Connect, set availability, generate the booking link |
| Ad account | Create, attach payment method, load budget, upload creative paused |
| Analytics | Pixel, conversions API, UTM plumbing |

## Open questions — decide before building

1. **Where does it run?** On Chris's machine, on the customer's machine, or in a container we own.
   "on your computer" reads as local, which changes everything about credential handling.
2. **Whose accounts and whose money?** Loading ad budget and funding a merchant account means
   moving real money. Agent-initiated or human-approved per transaction?
3. **Credential custody.** Every item above needs a key. Where do they live, who can read them,
   what happens when the job ends. This is the whole risk surface.
4. **What has no API.** Some of these cannot be done by API at all, or need a human identity check
   (merchant onboarding, phone campaign registration, ad account verification). Those become the
   new pre-warm list. Find out which before promising the hour.
5. **Failure mode.** Half-wired is worse than not started. Needs a rollback or a resume.

## Next

Nobody has measured which of the nine have a real API and which need a human. That inventory is
the first job, and it decides whether this is a one-hour promise or a two-day one.
