# apply.fundhub.ai → Netlify (owner-set 2026-09-21)

**Memory:** apply.fundhub.ai is **our** funnels on this Netlify site. No ClickFunnels login.

**Site:** `transcendent-wisp-888771` (same deploy as `fundhub.ai`).

**Netlify:** Domain alias `apply.fundhub.ai` on the site (API/dashboard).

**DNS (Cloudflare, zone `fundhub.ai`):** Point the subdomain at Netlify:

| Type  | Name  | Target                                      | Proxy   |
|-------|-------|---------------------------------------------|---------|
| CNAME | apply | `transcendent-wisp-888771.netlify.app`      | DNS only (grey cloud) until TLS is green |

Remove or replace the old CNAME to `*.myclickfunnels.com`.

**Prove:** `https://apply.fundhub.ai/roadmap/` shows the $297 sales page (750 headline), `server: Netlify`, not `x-clickfunnels-version`.

**Calendar:** `apply.fundhub.ai/schedule/phonecall` is Cronofy on CF today; migrate separately. `/roadmap` does not depend on it.
