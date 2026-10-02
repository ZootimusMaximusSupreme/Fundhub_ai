# fhconsulting.online → Netlify (owner-set 2026-09-28)

**Site:** `transcendent-wisp-888771` (same deploy as `fundhub.ai`).

**Netlify:** Domain aliases `fhconsulting.online` and `www.fhconsulting.online` on the site.

**Live pages:** `public/consulting/` — home, Terms, Privacy, Refund.

**Routing:** On this host only, `/` redirects to `/consulting/` (`netlify.toml`).

## DNS (GoDaddy — zone `fhconsulting.online`)

Registrar nameservers today: `NS39.DOMAINCONTROL.COM`, `NS40.DOMAINCONTROL.COM`.

| Type  | Name | Value                                   |
|-------|------|-----------------------------------------|
| A     | @    | `75.2.60.5`                             |
| CNAME | www  | `transcendent-wisp-888771.netlify.app`  |

Remove any other **A** or **AAAA** records on `@`. Netlify’s load balancer is IPv4-only.

After DNS propagates, Netlify provisions HTTPS (can take up to 24 hours).

**Prove:** `https://fhconsulting.online/` redirects to `/consulting/`, title “FH Consulting”, `server: Netlify`.

**Also works:** `https://fundhub.ai/consulting/` (same files).
