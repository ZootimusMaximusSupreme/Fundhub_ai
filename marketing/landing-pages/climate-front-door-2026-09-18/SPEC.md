# Climate front door — design + build spec

Route: `/climate/` · redirect `/lender-climate` → `/climate/`
Owner: Chris · Date: 2026-09-18

Flow: ad → `/climate/` → address → 5 lenders visible, rest frosted → identity + SSN + soft-pull consent → Commas checkout ($49.99 + $15 × extra business) → full **Bank and Lender Match List** in the customer portal.

---

## 1. Files in this pack

| File | What it is |
|---|---|
| `climate-front-door-mock.html` | Standalone interactive mock. Open in a browser. Step buttons across the top walk all 5 states; Desktop / Mobile 390 toggles width in the same file. |
| `ClimateFrontDoor.jsx` | Production React wrapper. Drop at `app/lender-climate/_components/ClimateFrontDoor.jsx`. |
| `front-door.css` | Drop at `app/lender-climate/_styles/front-door.css`. Every selector namespaced `.fd-`. |
| `SPEC.md` | This file. |

---

## 2. Component map

### Reused from the Darwin pack — not modified
| File | Used for |
|---|---|
| `_components/MapHero.jsx` | The whole map layer. Rendered as-is. |
| `_components/USAMapSVG.jsx` | State paths, heat fill, zoom-to-state transform. |
| `_components/AddressSearch.jsx` | Google geocode via `/api/proxy/geocode`. Location triangulation kept. |
| `_components/BankPin.jsx` | Lender pins. |
| `_components/StateTooltip.jsx` | Hover readout. |
| `lib/projection.js` | `projectPoint()` lat/lng → px. Used verbatim in the mock too. |
| `lib/colors.js`, `lib/format.js` | Band colours and number formatting. |
| `lib/climateClient.js` | `getClimate()` against `/api/climate`. |
| `_styles/map.css` | Map styling. |

### Added
| File | What it adds |
|---|---|
| `ClimateFrontDoor.jsx` | Step state machine, lender list, gate, identity form, checkout handoff. |
| `front-door.css` | Layout and styling for the above only. |

### Not rendered on this route
`ClimateShell.jsx`, `NationalMetrics.jsx`, `StateTable.jsx`, `BankMetrics.jsx`, `SlidePanel.jsx`, `CTASection.jsx` — those stay on the internal dashboard. `page.jsx` renders `ClimateFrontDoor` instead of `ClimateShell`.

### One change needed in MapHero
`MapHero` already owns `handleGeocode`. Add a single pass-through so the wrapper learns the resolved state:

```js
// MapHero.jsx — inside handleGeocode, after setActiveState/setUserPoint
onResolved?.(result);
```
Add `onResolved` to the props signature. Nothing else in the file changes, and the geospatial logic is untouched.

---

## 3. Layout

**Desktop (≥900px container).** The map is a **100vh layer pinned to the top of the stage**, not the full stage height. That distinction matters: sized to the stage it stretches to the scroll height, the US silhouette is destroyed and the pins land on top of the lender cards. Content floats on top in a two-column grid: a sticky 360–420px column on the left holding the headline, the lede and the address field; a fluid column on the right holding the lender list, the identity form and checkout. The right column is `display:none` when empty, so on first load the map is fully visible across two thirds of the screen.

Two supporting rules make the overlay readable:
- A left scrim (`.fd::before`) fades the map out under the form column. Once a location resolves the wrapper sets `data-loc="1"` and the scrim switches to a top band, because the map has moved down by then.
- Lender cards sit on opaque glass (`rgba(12,14,18,.80)` + `blur(10px)`), so the map never bleeds through the list.

**The map is a 3-D dot globe.** Static, centred on the United States, sitting behind everything. When a location resolves the camera eases to it over 1.5s (rotate + zoom + reposition) and stays there while the content glasses over the top. The globe never moves out of the way; the content floats on it.

Built as a `<canvas>`, orthographic projection, no library and no network call:
- `cos c = sin φ0 sin φ + cos φ0 cos φ cos(λ − λ0)` decides visibility and depth; depth drives dot size and opacity, which is what makes it read as a sphere rather than a disc.
- Land comes from a 1.25° land/ocean bitmask rasterised from Natural Earth `ne_110m_land`, base64-packed into the file at 6.9 KB.
- Dot spacing scales with `cos(lat)` so the poles do not clump the way an equirectangular grid makes them.
- Two levels of detail: a coarse whole-globe field, plus a finer North America field that fades in past zoom 1.2 so close-ups keep their density instead of thinning into noise.
- Camera carries `fx`/`fy` (its screen anchor as a fraction of the container) as well as `lat`/`lng`/`zoom`. Wide sits right of the form. Close sits low-left, the one region the lender list leaves free, so the person's own state stays visible.
- `prefers-reduced-motion` snaps the camera instead of flying and drops the marker pulse.

**Open decision — the Darwin pack has no globe.** `MapHero` and `USAMapSVG` in the attached pack render a flat SVG state map, and `us-states-paths.json` in the pack is five placeholder rectangles. The globe is new work. Either keep the flat Darwin map, or adopt the canvas globe and give it a `{ lat, lng, zoom, fx, fy }` camera contract. Nothing outside the map layer changes either way.

**Map behaviour across steps.** Before a search, the national lender field sits on the globe — the 1,106 is something the person sees rather than a number they are told. Once a location resolves, the camera flies to them, their state lights up in the `neutral` band colour and their marker pulses on it, while the rest of the globe sweeps behind the lender list as background texture.

**Mobile (<900px).** Single column. Map becomes a 42vh band at the top, everything stacks under it. Inputs are `min-height:44px` and `font-size:15px` — 15px is the threshold below which iOS Safari zooms on focus. The unlock button and the pay button are full-width and thumb-reachable.

The switch uses a container query on `.fd`, with a `@supports not` media-query fallback. That is what lets the mock's width toggle work in one file.

---

## 4. Field list

Mirrors `reference-soft-pull-approve.html` exactly, so the same `POST /api/soft-pull-approve` body works.

### Personal — required before unlock
| Field id / name | Type | Notes |
|---|---|---|
| `granted_name` | text, `autocomplete="name"` | Full legal name |
| `ssn` | text, `inputmode="numeric"`, `autocomplete="off"` | Trust line below the field |
| `dob` | `type="date"` | |
| `address_line1` | text, `autocomplete="street-address"` | |
| `city` | text | Prefilled from geocode |
| `state` | text, `maxlength="2"` | Prefilled from geocode `stateCode` |
| `postal_code` | text, `inputmode="numeric"` | |

### Soft-pull authorization
| Element | Source |
|---|---|
| Disclosure body | `disclosure.text` from `GET /api/soft-pull-approve` |
| Version line | `disclosure.version` |
| Agree checkbox | Blocks the continue button until checked |

### Businesses — optional, repeatable, max 20
| Field id / name | Type |
|---|---|
| `biz_name_{i}` | text |
| `biz_line1_{i}` | text |
| `biz_city_{i}` | text |
| `biz_state_{i}` | text, `maxlength="2"` |
| `biz_zip_{i}` | text, `inputmode="numeric"` |
| `biz_ein_{i}` | text, `inputmode="numeric"`, normalized to `12-3456789`, rejected unless 9 digits |
| `biz_inc_{i}` | `type="month"` |
| `biz_owner_{i}` | text, optional |

Running total updates on every add and remove, same as the soft-pull page.

---

## 5. Pricing on this funnel

| Line | Amount |
|---|---|
| Base | $49.99 |
| Each additional business | +$15.00 |

Legacy main-funnel soft pull stays at $32.00 + $10.00 (`src/config/offers.mjs`, `SOFT_PULL` = 3200 cents). This page does not touch those constants — pass `4999` / `1500` from the climate route's own config.

---

## 6. Commas checkout

| Role | Value — keep, do not change |
|---|---|
| Commas checkout title | **Consulting Services Assessment** |
| CRM / affiliate product name | **Business Financial Assessment** |
| Repo offer key | `SOFT_PULL` / `productCode: diagnostic` |

Mint a **variable-amount session on the existing product**, same pattern as the payment-link and optimize checkouts. Never call `POST /public-api/products/create`. No new SKU.

In the mock, this is a placeholder `Pay $49.99` button with the add-on math stated beneath it. Swap it for the Commas iframe or redirect once the session endpoint exists.

---

## 7. After payment

- The full list is **not emailed**.
- Deliver **Bank and Lender Match List** in the customer portal: `https://fundhub.ai/app/client-portal.html`
- Entitlement / document code: `bank-lender-match-list` (`bank_lender_match_list` PDF deliverable today).
- Staff matcher API, engineering only: `GET /api/read/lender-matches?client_id=` — same data family as the UnderwriteIQ list.

---

## 8. Microcopy — copy/paste ready

**Headline (locate)**
> Where you live decides which banks will lend to your business.

**Lede (locate)**
> Enter your address. UnderwriteIQ matches your location against 1,106 active lenders and returns the ones that fund businesses in your state.

Bind `1,106` to `banks.length` from `/api/climate`. Show the live count, never a rounded guess.

**Field label** — Your address, or city and state
**Button** — Show my lenders
**Under the button** — No hard inquiry — soft pull only for the assessment. Five lenders are free to view.

---

**Headline (matches)**
> {n} lenders fund businesses in {State}.

**Lede (matches)**
> These come from the Fundhub lender database, filtered to {State} eligibility and business card programs. Five are shown. The rest open in your portal after checkout.

**List header** — Your {State} list · `5 SHOWN · {n} LOCKED`

**Gate overlay**
> Enter your info to see the rest of your matches.
> {n} more lenders, with products and application links.

**Unlock button** — Unlock all {n} — $49.99

---

**Headline (identity)**
> Your details unlock the full {State} list.

**Lede** — We run one soft inquiry to confirm who you are and finish the match. Your score is not affected.

**SSN trust line, under the field**
> Encrypted in transit with 256-bit TLS and used only for this soft inquiry.

**Trust bullets in the left column**
> 256-bit encryption in transit and at rest.
> Your advisor never sees your Social Security number on their screen.
> Soft inquiry only. It is visible to you and no one else.

**Consent checkbox**
> I authorize Fundhub to obtain my credit report as a soft inquiry for this assessment.

**Business block intro**
> Add each business you want funded. Each one adds $15.00 and its own lender matches. Leave this empty if you only want your personal list.

**Continue button** — Agree and continue to checkout
**Portal tease under it** — Complete checkout and your full list opens in your portal.

---

**Headline (checkout)**
> One payment opens your full list.

**Lede** — Your authorization is saved. Pay below and the soft pull runs, then your {State} list is written to your portal.

**Pay button** — Pay $49.99
**After-pay list**
> The soft pull runs. Nothing else is needed from you.
> Your Bank and Lender Match List is written to your portal.
> You apply directly with each lender on your own schedule.

---

**Headline (paid)**
> Your list is in your portal.

**Confirmation** — Payment received — $49.99. Your Bank and Lender Match List is ready. The soft pull runs automatically and the list updates in place as matches change.

**Button** — Open your portal

---

**Footer disclaimer, every step**
> Fundhub is not a direct lender and does not approve credit. Matches are based on state eligibility and product criteria held in the Fundhub lender database. Approval, amounts, rates and terms are decided by each lender.
>
> No hard inquiry — soft pull only for the assessment.

---

## 9. Compliance boundaries

Allowed on this page:
- Lender names, product names, eligibility route, bureaus pulled, application links.
- The live lender count, labelled as coming from the Fundhub database.
- `No hard inquiry — soft pull only for the assessment.`

Not on this page:
- Approval amounts, "you will get funded", approval percentages, guaranteed dollar figures from a named bank.
- Approval odds on the map. The `/api/climate` payload carries score bands, not odds — render bands only.
- Any hard-inquiry claim outside the scoped soft-pull line above.

Optional, only if the number comes from the conservative fundability math and is labelled an estimate:
> Estimated fundability range: $X–$Y. This is an estimate from your profile, not an approval.

The mock ships without it. Add it only once the math is sourced.

Follows `docs/ads/RULES.md` Part 1 — no outcome guarantees.

---

## 10. Data notes

- `GET /api/climate` returns `{ national, states[], banks[], as_of, stale }`. Verified live 2026-09-18: national score 54.3, band `neutral`; state bands are `neutral` `#F2E39B` and `favorable` `#A9C6E8`. The front door uses those two hex values as its accent palette rather than inventing colours.
- `banks[]` rows carry `name`, `product_name`, `lender_table`, `eligible_states`, `application_url`, `logo_path`, `priority_tier`, `bureaus_pulled`. All six are rendered.
- Lender table → label shown to the customer:
  - `OnlineBizCC` → Business card · apply online
  - `InBranchBizCC` → Business card · apply in branch
  - `PersonalCC` → Personal card
  - `PersonalLoans` → Personal loan
- `logo_path` resolves to `/assets/lenders/*.png`, with `/assets/lenders/placeholder.svg` for rows with no logo. Both the mock and the component fall back to an initials tile on a broken image.
- The mock's eligibility filter (`All States` OR state code present in `eligible_states`) is a stand-in. Production calls `src/lenders/match.mjs` — same row shape, so the components need no change.
- The mock bakes 46 real Arizona-eligible rows sampled from the live payload. The live AZ match count will be higher; the UI reads `matches.length`, so it self-corrects the moment it is wired.
- The globe is self-contained: `LAND_B64`, `isLand`, `dotField`, `project`, `camCtx`, `paintGlobe`, `tick` and `drawMap`. Lift that block as-is, or delete it and render `MapHero` in the slot.

---

## 11. Out of scope for this pack

- No implementation in the FundHub repo from this session.
- No new Commas products.
- No rewrite of MapHero geospatial logic.
- No production deploy.
