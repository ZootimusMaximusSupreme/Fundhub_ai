# Apply / Oxylabs — sandbox and cheap prove options

Read-only inventory **2026-09-19**. Goal: prove or develop Apply without burning Oxylabs residential traffic ($).

---

## What exists today (paths, env flags)

### Live Apply stack (staff CRM only)

| Piece | Path / route | Role |
|---|---|---|
| Desk UI | `public/app/proxy-apply.js` (`window.FHProxyApply`) | Loaded from `client-control-panel.html`, `lenders.html`, `pipeline.html` |
| Launch API | `POST /api/proxy/launch` → `api/proxy/launch.mjs` → `src/proxy/launch.mjs` | `owner`, `funding_advisor` only (`PROXY_ROLES`) |
| End session | `POST /api/proxy/end` → `api/proxy/end.mjs` | Same roles |
| Audit read | `GET /api/read/proxy-sessions` | Session history |
| Oxylabs adapter | `src/adapters/oxylabs.mjs` | Real residential proxy only |
| Pulse | `src/pulse/registry.mjs` → `"proxy/launch"` | Monitored |

### Env (only these two names)

From `.env.example` and `oxylabsConfigFromEnv()`:

- `OXYLABS_USERNAME` — account id **without** `customer-` prefix (code adds it in the username string).
- `OXYLABS_PASSWORD`

No other `OXYLABS_*`, `PROXY_*`, or Apply-specific bypass flags exist in repo.

### What each launch does to Oxylabs

1. Inserts `proxy_sessions` row (`status: verifying`).
2. Calls `launchCredentials()` → builds geo username → one or two **`verify()`** calls through the proxy to `https://ip.oxylabs.io/location` (city try, then state fallback).
3. On success, returns connection username/password + verification to the browser.

Every **successful** live `POST /api/proxy/launch` consumes residential traffic for those verification requests (and any browser use after). Failed auth (401/403/407) may still cost depending on Oxylabs billing; repo treats 407 as `oxylabs_auth_failed` (quota exhausted is a known dashboard case — see launch prove Lane A).

### Dry-run / fence flags — **not wired to Apply**

| Flag | Scope | Apply? |
|---|---|---|
| `ADAPTERS_DRY_RUN` | `src/lib/outbound-fetch.mjs` — CRM/adapters that use the outbound fetch chokepoint | **No** — Oxylabs uses raw `node:http`/`https` in `fetchThroughProxy`, not `ADAPTERS_DRY_RUN` |
| `MESSAGING_DRY_RUN` | SMS/email/voice dispatch | **No** |
| Scratch harness | `src/verification/fixtures.mjs` sets both dry-run flags | Verify/e2e harness only; **not** proxy launch |

There is **no** `OXYLABS_DRY_RUN`, mock env, or “skip verify” switch in production code.

### Oxylabs “sandbox” in docs / code

- **Code comment** (`src/adapters/oxylabs.mjs`): Oxylabs **Public API** is only for sub-user management and usage stats — **not** for opening a geo session. Sessions are username-string targeting on `pr.oxylabs.io:7777` only.
- **No** Oxylabs sandbox host, mock server, or trial endpoint referenced anywhere in the repo.
- **Audit rule** (`docs/workflows/archive/audit-untested-2026-08-18.md`): “Do not put Oxylabs in sandbox” (meaning do not pretend live Apply works without real proxy).
- **Stale doc**: `docs/STILL-MISSING.md` still lists Oxylabs as “skipped / login page” (2026-08-06). Launch prove **2026-09-19** shows creds on Netlify but **407 / quota 100%** — see `docs/workflows/launch-prove-2026-09-19.md` Lane A.

### Hole 15 (Apply context for launch prove)

On **`docs/workflows/launch-prove-2026-09-19.md`**, **Lane A — Oxylabs + Apply (hole 15)** = live `POST /api/proxy/launch` → **FAIL** (`oxylabs_auth_failed`, dashboard **5 GB / 5 GB** used).

Other boards reuse “hole 15” for different fixes (e.g. Messaging thread backfill). For **Apply/Oxylabs**, treat launch-prove Lane A + `scripts/tmp/live-fix-2026-09-18/h15-*.mjs` as the relevant evidence scripts.

### `api/proxy/launch` alternatives

There is **no** second launch route. Staff Apply is only:

- CRM **Apply** → `FHProxyApply.applyToLender()` → `POST /api/proxy/launch`.

After a successful launch:

- **With Chrome extension**: extension PAC-routes lender host; credentials come from API response.
- **Without extension**: modal shows verified exit + manual proxy string; UI **does not** offer “open bank URL” on the unsafe path.

Consumer funnel **`https://apply.fundhub.ai`** (ClickFunnels survey/booking) is **unrelated** to Oxylabs — no proxy launch on that path in this repo.

---

## Can we use sandbox for launch prove?

### **NO** (for real Oxylabs sandbox)

The product has **no** Oxylabs sandbox integration. Launch prove on **live** `fundhub.ai` always hits real `pr.oxylabs.io` when credentials are present and verification runs.

### **YES** (prove without spending) — how

Use mocks already in the repo; do **not** click live Apply on a sim client if quota is exhausted.

| Method | Cost | What it proves |
|---|---|---|
| Unit tests | $0 | `node --test src/adapters/oxylabs.test.mjs`, `src/proxy/launch.test.mjs`, `src/http/proxy-endpoints.test.mjs` — inject **`fetchFn`** mock instead of `fetchThroughProxy` |
| Playwright (local harness) | $0 | `e2e/proxy-apply.spec.mjs` — mocks `POST /api/proxy/launch` with `LAUNCH_OK`; proves UI/modal/extension-off copy |
| Integration harness | $0 | `e2e/integration-round.spec.mjs` — stub launch as `not_configured` |
| Live API probe scripts | **Burns traffic** if creds work | `scripts/tmp/comms-run-all-2026-09-19.mjs`, `lane-f-*.mjs`, `launch-prove-2026-09-19-lane-f.mjs`, `h15-local-creds.mjs` (direct `verify()`), `h15-verify.mjs` (one live launch click) |

**Launch prove scorecard without Oxylabs spend:** run unit + `e2e/proxy-apply.spec.mjs` (and role gates in `proxy-endpoints.test.mjs`). For “live” launch PASS, you must either restore Oxylabs traffic (add GB / wait for period reset **Sep 22**) or accept **BLOCKED** on Apply until then.

Optional dev-only path ( **not in repo today** — would need a named Fixer change): dependency-inject mock `fetchFn` on `launchProxySession` via Netlify handler `deps.fetchFn` (handler already supports it; production never passes a mock).

---

## Chrome extension / “widget”

### Staff Apply — Chrome extension (not Web Store)

| Item | Detail |
|---|---|
| **Paths** | `extension/manifest.json`, `extension/background.js`, `extension/content.js`, `extension/README.md` |
| **Install** | Unpacked only: Chrome → Developer mode → Load unpacked → `extension/` folder |
| **Live on fundhub.ai?** | **Yes** — `content_scripts.matches` includes `https://fundhub.ai/*` and `https://www.fundhub.ai/*` (added PR #159 / journey CHANGELOG 2026-08-25) |
| **Published Web Store?** | **No** — README “Packaging for Chrome Web Store (later)” |
| **Icons** | Manifest references `icons/icon16.png` etc.; **icon files are not in the tracked `extension/` tree** (only 4 files) — unpack may warn until icons are added locally |
| **Consumer / apply.fundhub.ai widget?** | **None** in repo for Oxylabs. “Widget” on apply funnel = ClickFunnels native survey/calendar (`clickfunnels-fragments/`, `docs/clickfunnels/`) — lead capture, not bank proxy |

### Does the extension replace Oxylabs for staff Apply?

**No.**

- The **server** must still call Oxylabs to geo-verify and mint the session username/password (`launchCredentials` → `verify()`).
- The extension only **applies** those credentials in Chrome (PAC + `webRequest.onAuthRequired`) and opens the lender URL.
- Without Oxylabs traffic/creds, launch fails before the extension gets usable credentials.
- Extension **reduces** wrong-IP risk and manual copy-paste; it does **not** remove Oxylabs billing.

Flow (from `extension/README.md` + `proxy-apply.js`):

1. CRM `POST /api/proxy/launch` (Oxylabs verify on server).
2. Page `postMessage` → content script → service worker sets proxy + opens bank tab.

---

## Recommendation (cheapest path until live Apply works)

Until Oxylabs residential quota is back (add traffic or wait for the **Aug 23–Sep 22** period to reset), **do not** use live Apply clicks or `h15-local-creds.mjs` for prove — they hit real proxy and may fail with 407 anyway. Treat Apply as **BLOCKED** on launch scorecards (`docs/workflows/launch-prove-2026-09-19.md`, `comms-map-2026-09-19.md`). For zero-cost confidence, run **`npm test`** on `src/adapters/oxylabs.test.mjs`, `src/proxy/launch.test.mjs`, and **`e2e/proxy-apply.spec.mjs`** (mocked launch). When quota returns, fix Netlify `OXYLABS_*` if needed (one batch deploy), then one live Apply on a sim client **without submitting the bank form**, with the **unpacked extension** installed on the advisor machine so the bank tab opens safely — that is the minimum paid path to a real PASS. There is no sandbox shortcut in code; the only way to avoid Oxylabs spend entirely is mocks/tests, not live launch.

---

## Quick reference — key files

```
src/adapters/oxylabs.mjs          # credentials, verify, launchCredentials, 407 → auth
src/proxy/launch.mjs              # proxy_sessions + launch orchestration
api/proxy/launch.mjs              # HTTP handler, next_step copy
public/app/proxy-apply.js         # FHProxyApply + extension bridge
extension/*                       # Chrome MV3 add-on (staff)
e2e/proxy-apply.spec.mjs          # mocked launch UI prove
docs/STILL-MISSING.md             # OXYLABS_* (stale status text)
docs/workflows/launch-prove-2026-09-19.md  # Lane A FAIL + quota evidence
```

---

## Residential API v1 (2026-09-19)

**Source:** [Oxylabs Residential Proxy — Public API](https://residential-api.oxylabs.io/v1/docs) (OpenAPI at `https://residential-api.oxylabs.io/swagger-ui/v1/spec.yaml`). Same story as the comment at the top of `src/adapters/oxylabs.mjs`.

### What this API is

It is a **management and reporting** API, not a second way to browse the web.

| You can | You cannot |
|---|---|
| `POST /v1/login` — get a JWT (1 hour) with the same account username/password | Open a geo session or pick an exit IP |
| List / create / update / delete **sub-users** | Route lender traffic without `pr.oxylabs.io:7777` |
| Set per sub-user **`traffic_limit`** (GB cap, `0` = block, `null` = unlimited) and **`auto_disable`** | Get a free or sandbox residential pool |
| Read **traffic stats** (24h, week, month, custom, etc.) and **client stats** | Replace FundHub’s username-string targeting (`customer-…-cc-US-city-…-sessid-…`) |

Real Apply traffic still goes through the **residential proxy endpoint** `pr.oxylabs.io:7777` (HTTP CONNECT / HTTPS / SOCKS5). Sub-users get their own proxy login; geo targeting is still encoded in the **proxy username string**, same rules as the main account.

### Does the API replace or cut cost for Apply?

**No — not for the product path FundHub uses today.**

- Every live `launchCredentials()` → `verify()` call still hits the proxy and **counts toward residential GB** on the account (or sub-user) that owns those credentials.
- The Public API does **not** remove verification requests or advisor browser use through the proxy.
- Where it **can** help cost/control (optional ops, not wired in repo):
  - Mint a **sub-user** with a small `traffic_limit` for prove scripts so a bad loop cannot drain the whole 5 GB plan.
  - Poll **`/users/{userId}/client-stats`** or sub-user stats **before** clicking live Apply — see remaining quota without opening another geo session (the API HTTP itself is not the same billing bucket as proxy GB; it is management traffic).

It does **not** substitute mocks: you still need either real proxy GB or test `fetchFn` mocks for a full launch prove.

### Launch prove without burning residential GB?

| Approach | Uses proxy GB? |
|---|---|
| Unit tests + `e2e/proxy-apply.spec.mjs` (mock launch) | **No** |
| Residential API — login + read stats only | **No** (for proxy data; normal API use) |
| Residential API — create sub-user | **No** until someone connects through `pr.oxylabs.io:7777` with that sub-user |
| Live `POST /api/proxy/launch` or `verify()` | **Yes** |

There is **no** official **sandbox**, **test mode**, or **free tier** in the v1 spec for residential proxy traffic. Oxylabs docs call Swagger UI “sandbox” only in the sense of **Try it out** on the docs page (lock icon for Basic auth on `/login`) — not a non-billing proxy environment.

### Traffic limits: API vs dashboard vs proxy

- **Plan quota** (e.g. 5 GB / billing period) is what blocks Apply with **407** when exhausted — that is enforced on **`pr.oxylabs.io:7777`**, not via a separate API launch step.
- **Sub-user `traffic_limit`** is an extra cap Oxylabs applies to that sub-user’s proxy usage; managing it is what the API is for.
- FundHub env today is only **`OXYLABS_USERNAME`** + **`OXYLABS_PASSWORD`** for the main customer id; no sub-user id or JWT flow in code.

### Bottom line for launch scorecards

Use **Residential API v1** to watch quota and optionally fence prove with sub-users. Use **mocks/tests** to prove Apply without any proxy GB. Use **live launch** only when quota is available — the API cannot fake a residential exit for hole 15 / Lane A PASS.
