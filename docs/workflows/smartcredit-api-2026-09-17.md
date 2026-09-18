# Smart Credit — can we pull a real report?

**Opened 2026-09-17.** Owner asked whether we can use Smart Credit's API to pull a
person's real credit report, so `/roadmap` stops showing an example file.

## What this is actually about

`/roadmap` shipped 2026-09-17 and works. It draws the plan our own engine builds.
The engine takes a credit file (`crsResult`) and returns the plan. The public
referral door passes no file, so the engine falls back to `SAMPLE_STORED_FILE` and
the page says so on screen.

**Correction to the owner's framing:** Smart Credit does not make the roadmap. Smart
Credit supplies the REPORT. `src/optimize-page/roadmap.mjs` makes the roadmap. The
only missing piece is getting a real report into `crsResult`.

So the question for all three workflows is narrow: **what does it take to put a real
credit file into `buildOptimizeRoadmap({ crsResult })`?**

## Rules for every workflow here

- **Never invent.** If a credential, endpoint or field is not found, that absence IS
  the finding. Write "NOT FOUND" and where you looked. Do not guess a URL or a field
  name. (CLAUDE.md §2)
- **Look everywhere before calling something missing.** `src/`, `api/`, `scripts/`,
  `db/`, `docs/`, `netlify env:list`, and the local gitignored `.env`. One grep is
  not a finding.
- **Never print a secret value.** Confirm a key by NAME only. (CLAUDE.md §11)
- **Never remove, unset or overwrite a stored key.** Not even a broken one.
  (CLAUDE.md, owner-set 2026-09-17)
- Read-only. No product code changes from these three. We decide what to build after.

## Tasks

| # | Task | Owner | Status |
|---|------|-------|--------|
| W1 | What Smart Credit access do we already hold? | this session | **done** |
| W2 | What does the Smart Credit / ConsumerDirect API actually offer? | W2 | **done** |
| W3 | What shape does our roadmap engine need a report in? | W3 | **done** |

No dependencies. All three are "go and look". Nothing waits.

---

## Copy-paste prompts

### W2 — What does their API actually offer?

```
Read-only research. Do not change any product code.

Context: fundhub-platform. Our page /roadmap draws a credit-repair plan that our own
code builds from a credit report. Today it runs on a stored sample file because we
have no real report. We want to know whether ConsumerDirect / Smart Credit's API can
give us one.

Find out, from ConsumerDirect's own developer documentation (developer.consumerdirect.io
and anything it links to):

1. Is there an API that returns a consumer's credit REPORT DATA (tradelines, inquiries,
   balances, dates) — not just an enrollment widget, and not just a score?
2. What is the endpoint, and what does a response look like? Capture the actual field
   names if the docs publish them.
3. What authentication does it need? Name the credential types (client key, secret,
   OAuth, partner id). Say which ones we would have to ask ConsumerDirect for.
4. What consent or authorization does the CONSUMER have to give before we may pull
   their file, and does their API expect proof of it?
5. Is report data available on the affiliate/referral relationship we have now
   (PID 29056), or does it need a different, higher tier of partnership?

HARD RULE — never invent. If the docs do not say, write "NOT PUBLISHED" and give the
page you read. Do not guess an endpoint, a field name, or a credential name. A wrong
guess here costs a build.

Write your findings to docs/workflows/smartcredit-api-2026-09-17.md under "## W2
findings", then mark W2 done in the task table. Commit locally.
```

### W3 — What shape does our roadmap engine need?

```
Read-only research. Do not change any product code.

Context: fundhub-platform. src/optimize-page/roadmap.mjs exports buildOptimizeRoadmap
({ crsResult, personal, onRepairPath }). When crsResult is null it falls back to
SAMPLE_STORED_FILE. We want to feed it a REAL credit report and need to know exactly
what shape that report must be in.

Trace and report:

1. The exact shape of crsResult. Read SAMPLE_STORED_FILE, then read every consumer of
   it downstream — violationsByBureauFromMergedCrs, buildBlackReportClient,
   derogatoryClaimsByBureau, buildRoundPlan. List every field each one actually reads,
   and say which are required vs optional.
2. Does anything ELSE in this repo already produce a crsResult-shaped object? Search
   src/, scripts/, db/ and docs/ — data in this repo loads from CSVs and scripts, not
   only from code. If a real pull already exists somewhere for logged-in clients, that
   is the single most valuable thing you can find. Name the file.
3. What does `personal` need, and what does onRepairPath change? Note that the public
   referral door passes onRepairPath false on purpose — say what that suppresses.
4. If we got raw report data from a third party, what would have to be written to
   convert it into crsResult? Describe the gap, do not build it.

HARD RULE — never invent. If you cannot trace a field to code that reads it, say so.
Do not describe a shape you assume.

Write your findings to docs/workflows/smartcredit-api-2026-09-17.md under "## W3
findings", then mark W3 done in the task table. Commit locally.
```

---

## W1 findings

**Owner: this session. Status: done. Measured 2026-09-17 against Netlify production.**

### 1. We DO hold ConsumerDirect credentials. My earlier "they never gave us a key" was wrong.

Set on Netlify production, confirmed by name:

```
CONSUMERDIRECT_PID
CONSUMERDIRECT_STAGE_CLIENT_KEY   (secret)
```

### 2. The code cannot see them. The names do not match, by one underscore.

`smartCreditFromEnv()` in `api/public/optimize.mjs` reads:

```
CONSUMER_DIRECT_CLIENT_KEY   or   SMART_CREDIT_CLIENT_KEY
CONSUMER_DIRECT_PID          or   SMART_CREDIT_PID
CONSUMER_DIRECT_ENV          or   SMART_CREDIT_ENV
```

`CONSUMERDIRECT_PID` and `CONSUMER_DIRECT_PID` are different names. Nothing matches, so
the gate `if (clientKey && pid)` never opens, the sign-up widget never mounts, and
`/optimize` falls back to the plain affiliate link for everyone.

**This is not new.** `docs/workflows/consumerdirect-widget-2026-08-28.md` found it on
2026-08-28, wrote it up as workflow 1 with a full task spec (lines 575-610), and it was
never done. It has been sitting broken for 20 days.

### 3. The key we hold is a PRACTICE key, not a live one.

`CONSUMERDIRECT_STAGE_CLIENT_KEY` is a stage key — their test system. Fixing the names
alone is not enough: `smartCreditFromEnv()` only points at the practice system when
`CONSUMER_DIRECT_ENV` equals `stage`, and that variable is not set at all. A practice key
sent to the live system fails.

### 4. A SEPARATE credit-report pull system already exists in this repo: CRS.

This is the big one for the roadmap question. `src/finance/crs-identities.mjs` is a real
soft-pull gate with real credentials on Netlify production:

```
CRS_API_HOST            CRS_LIVE_API_HOST        (secret)
CRS_API_USERNAME        CRS_LIVE_API_USERNAME    (secret)
CRS_API_PASSWORD        CRS_LIVE_API_PASSWORD    (secret)
CRS_ALLOW_LIVE          CRS_ACTIVE_BUREAUS
```

Measured state of the gate, production, 2026-09-17:

| Setting | Value | Meaning |
|---|---|---|
| `CRS_API_HOST` | the sandbox host | pointed at the practice system |
| `CRS_ALLOW_LIVE` | `0` | live pulls are OFF |
| `CRS_ACTIVE_BUREAUS` | `TU,EX,EQ` | all three bureaus would be ordered |

The gate needs BOTH the production host AND `CRS_ALLOW_LIVE` on. Today neither is set that
way, so it fails closed. That is the fence working as designed, not a fault.

The sandbox accepts only three synthetic identities from the vendor's fixtures, whose
Social Security numbers are in the never-issued 666-xx-xxxx range. A real person cannot
be pulled against the sandbox.

**W3 is tracing whether CRS output already matches the `crsResult` shape the roadmap
engine wants. That is the question that decides everything. Do not duplicate it here.**

### 5. What I could NOT check, and did not guess

`CRS_LIVE_API_HOST`, `CRS_LIVE_API_USERNAME` and `CRS_LIVE_API_PASSWORD` are stored with
`--secret`. Reading them back returns a mask of asterisks, not the value. **A masked read
is expected and proves nothing about whether the stored value is right.** I did not treat
the mask as a broken value and nobody else should either — that exact mistake is what the
"never remove a key" rule (CLAUDE.md, owner-set 2026-09-17) was written after.

### What W1 concludes

Two separate doors to a real credit report exist, and both are shut:

1. **ConsumerDirect / SmartCredit** — we hold a practice key that the code cannot see
   because of a name typo. Fixable in code. Whether their API even returns report DATA
   (rather than just a sign-up widget) is W2's question.
2. **CRS** — a full pull system already built, already credentialled, deliberately fenced
   to the sandbox. Whether it feeds the roadmap engine is W3's question.

Nothing here needs Chris to ask ConsumerDirect for anything yet. That was my earlier
advice and it was premature.

## W2 findings

**Owner: W2. Status: done. Read 2026-09-17 from ConsumerDirect's own published docs.**

### Short answer

**No.** ConsumerDirect's published partner API does not have any endpoint that hands us
back a person's credit report data. Every credit endpoint they publish either ORDERS a
report or tells us HOW MANY reports are left. None of them returns the report itself.

The report data does exist inside their platform — their internal service docs show the
tradelines and inquiries — but there is no partner-facing door to it in the documentation.

### 1. Is there an API that returns report DATA?

Not in the published partner documentation. I listed every page they publish two ways and
got the same answer both times:

- `https://developer.consumerdirect.io/llms.txt` — their own "complete page list"
- the full sidebar of `https://developer.consumerdirect.io/reference/login` (62 reference pages)

Everything they publish about credit is these four, all on the Platform Web Service (PWS):

| Page | Call | What it returns |
|---|---|---|
| `reference/pullcreditreport` | `POST /customer/credit/update` | `{ customerToken, success, error }` — a yes/no, no report |
| `reference/order3b` | `POST /customer/credit/3bs` | `201 Created`, empty body |
| `reference/getissue3b` | `PUT /customer/credit/3bs/issued` | `200`, empty body |
| `reference/get3bsdetails` | `GET /customer/credit/3bs/details` | counters only (see below) |

`GET /customer/credit/3bs/details` returns schema `Credit3BDetailsResponse`, whose fields
are `plan3BIncluded`, `statement3BIssued`, `statement3BOrdered`, `statement3BAvailable`,
`last3bOrderDate`, `has3B`. Those are "how many 3-bureau reports you have left". Not a report.

Base addresses, from those same specs: production `https://pws.consumerdirect.app`,
stage `https://stage-pws.consumerdirect.app`.

**Two doors that might exist but are NOT PUBLISHED:**

- **CAPI (Customer API).** Their guide page `docs/caas-non-hosted-integration-options` says
  CAPI gives customers "access to our credit and privacy features" and shows a sample call
  to `https://stage-api.consumerdirect.io/v1/password`. The link that page gives for CAPI's
  own documentation — `docs/credit-as-a-service-customer-services-api-capi` — returns **404**.
  CAPI is not in `llms.txt` and not in the reference sidebar. So: a Customer API exists by
  name, and its documentation is NOT PUBLISHED. Ask ConsumerDirect for it.
- **Widgets.** The same page offers credit-report-and-score widgets and says
  "For more information regarding available widgets please reach out to your ConsumerDirect®
  Sales Representative" (developer.consumerdirect.io, CAAS: Non-Hosted Integration). A widget
  draws their screen inside ours. It does not give our roadmap engine data.

### 2. What a response looks like, and real field names

For the partner endpoints, the shapes are above. For the actual report content, the only
published field names I found are on ConsumerDirect's **internal** microservice site,
`https://microservice.consumerdirect.io` — which describes itself as the docs for their own
internal services, not a partner contract. Treat this as evidence the data exists in a known
shape, not as an API we may call.

In `credit-microservice/open-api/credit-microservice-openapi.yaml`, the response example for
`POST /credit/3bs/current` is a three-bureau bundle: `BundleComponents.BundleComponent[]`
with types `TUCReportV6`, `EQFReportV6`, `EXPReportV6`, plus score components such as
`TUCVantageScoreV6` (example values include `riskScore`, `scoreName`, `populationRank`).

Field names that appear on each account in that example (counted 32 accounts):
`Tradeline`, `GrantedTrade`, `creditorName`, `accountNumber`, `accountTypeDescription`,
`AccountType`, `AccountCondition`, `AccountDesignator`, `OpenClosed`, `CreditLimit`,
`currentBalance`, `highBalance`, `amountPastDue`, `monthlyPayment`, `termMonths`,
`dateOpened`, `dateReported`, `dateLastPayment`, `dateAccountStatus`, `PayStatus`,
`WorstPayStatus`, `PayStatusHistory`, `MonthlyPayStatus`, `late30Count`, `late60Count`,
`late90Count`, `monthsReviewed`, `DisputeFlag`, `VerificationIndicator`, `Remark`,
`RemarkCode`, `customRemark`, `subscriberCode`, `subscriberName`, `IndustryCode`.
Inquiries: `InquiryDate`, `inquiryDate`, `inquiryType`, `Bureau`, `bureauCode`, `Source`.
Addresses: `CreditAddress`, `unparsedStreet`, `city`, `stateCode`, `postalCode`.

This is the same family of shape as a merged three-bureau file. Whether it maps onto our
`crsResult` is W3's question, not mine.

### 3. Authentication

Two different systems, two different credential styles. Both are published.

**PWS (Legacy Platform Web Services)** — this is where the 3B and pull-credit endpoints live.

- `POST /login` with form fields `clientKey` and `clientSecret`. Returns a JSON Web Token in
  the `Authorization` header. Their spec says the token is good for 5 minutes.
- Every other call is `Bearer` + that token (`securitySchemes.BearerAuth`).
- Their guide `docs/legacy-platform-web-services` also requires **IP whitelisting**: our
  server's outbound address must be static and in the United States.

**PAPI (Partner Services API)** — OAuth 2.0 client credentials.

- `POST https://auth.consumerdirect.io/oauth2/token` (stage `https://stage-auth.consumerdirect.io`)
  with HTTP basic `<client_id>:<client_secret>`, `grant_type=client_credentials`, and a
  `scope=target-entity:<id>` value. Their docs print the two entity ids (stage
  `47ea6b4e-e624-4e94-a9b5-2eb69e8e4d08`, production `e6c9113e-48b8-41ef-a87e-87a3c51a5e83`).
- Partner API base: production `https://papi.consumerdirect.io`, stage `https://stage-papi.consumerdirect.app`.
- IP whitelisting required here too.

**SAPI (Signup API, legacy)** — a separate `clientKey` passed as a form field on every call.
Base `https://api.consumerdirect.io` (stage `https://stage-api.consumerdirect.io`).

**What we would have to ask ConsumerDirect for**, by their own instruction — their docs name
`partnerintergration@consumerdirect.com` (their spelling) as the source for all of it:

1. PWS `clientKey` + `clientSecret`, stage set and production set (two pairs).
2. PAPI `client_id` + `client_secret`, stage and production.
3. Our static US outbound IP address added to their whitelist.
4. The CAPI documentation, which is 404 on their site.

We already hold `CONSUMERDIRECT_PID` and `CONSUMERDIRECT_STAGE_CLIENT_KEY` (W1). A PID is a
tracking id, not an API credential. A stage client key is a practice-system key.

### 4. Consumer consent

Published, and it is strict.

`docs/caas-non-hosted-integration-options` carries a red callout saying partners and third
parties are "prohibited from accessing, viewing, sharing, processing, or storing credit report
information" without approval from ConsumerDirect and consent from the customer
(developer.consumerdirect.io, CAAS: Non-Hosted Integration). Approval from THEM is a separate
thing from consent from the CONSUMER. We would need both.

The consumer's consent is captured at enrollment, and their API does expect proof of it. On
`POST /v1/signup/customer/update/identity` (Set Identity WITH SSN), `isConfirmedTerms` is a
**required** field — "acknowledgement that customer has received and accepted the terms of
membership" — and the optional companion `confirmTermsBrowserIpAddress` records "the IP
address of the browser where the customer was shown the terms of membership". So: a boolean
plus the IP address of the screen where they agreed.

Their Compliance Review page also requires the four policy documents to be clickable next to a
checkbox the consumer must tick, close to the submit button, before any payment is processed.
That page now prints the four addresses in the text, and a fifth requirement: the consumer must
understand that cancelling one product does not cancel the other.

**NOT PUBLISHED:** any separate, machine-readable "permission to pull" record, any document
upload, or any consent field on the credit endpoints themselves. `POST /customer/credit/update`
takes exactly one parameter, `customerToken`. The consent is assumed to have happened at
enrollment; the credit call does not re-check it.

### 5. Does PID 29056 get us report data?

**No, and it was never going to.** The PID is the referral tier.

Their glossary defines Publisher IDN (PID) as the id that marks "type of product, feature set,
and pricing". The Affiliate URL guide treats PID as a link-tracking parameter alongside AID,
ADID, SID and TID. That is the **hosted** integration — their website, their login, our logo
on it. Under a hosted integration, by their own definition, they handle the consumer's
authentication and show the credit data on a site they host. Nothing flows back to us.

API access sits on the other side of a different door: client key and secret issued per
environment by `partnerintergration@consumerdirect.com`, plus IP whitelisting. That is a
partnership step, not a PID setting.

**NOT PUBLISHED:** ConsumerDirect does not publish a tier chart, a price, or a named
partnership level that unlocks report data. There is no page saying "tier X gets report
JSON". The only published route to ask is their Help Request Form and their partner
integration email.

### Side note, one line, factual

The four SmartCredit policy addresses that `api/public/optimize.mjs` records as "NOT KNOWN"
are now printed in the text of `developer.consumerdirect.io/docs/support-compliance-review`.
Recording it here because I read that page for question 4. Not acting on it.

### Pages I read

- `https://developer.consumerdirect.io/llms.txt`
- `https://developer.consumerdirect.io/reference/pullcreditreport.md`
- `https://developer.consumerdirect.io/reference/order3b.md`
- `https://developer.consumerdirect.io/reference/getissue3b.md`
- `https://developer.consumerdirect.io/reference/get3bsdetails.md`
- `https://developer.consumerdirect.io/reference/login.md`
- `https://developer.consumerdirect.io/reference/postcustomerupdateidentity-4.md`
- `https://developer.consumerdirect.io/docs/legacy-platform-web-services.md`
- `https://developer.consumerdirect.io/docs/partner-services-api-papi.md`
- `https://developer.consumerdirect.io/docs/caas-non-hosted-integration-options.md`
- `https://developer.consumerdirect.io/docs/caas-hosted-integration-options.md`
- `https://developer.consumerdirect.io/docs/credit-as-a-service-overview.md`
- `https://developer.consumerdirect.io/docs/credit-as-a-service-hosted-affiliate-url.md`
- `https://developer.consumerdirect.io/docs/customer-management.md`
- `https://developer.consumerdirect.io/docs/sandbox-testing.md`
- `https://developer.consumerdirect.io/docs/support-compliance-review.md`
- `https://developer.consumerdirect.io/docs/glossary.md`
- `https://developer.consumerdirect.io/docs/credit-as-a-service-customer-services-api-capi` — **404**
- `https://microservice.consumerdirect.io/` and `credit-microservice/open-api/credit-microservice-openapi.yaml` (their internal service docs, not a partner contract)

## W3 findings

**Owner: W3. Status: done. Traced 2026-09-17 by reading code, plus one read-only count
against the production database and one local run of the engine over the vendor's own
sandbox payloads.**

### The headline

**A real credit pull already exists in this repo, it already stores the exact shape the
roadmap wants, and two real reports are sitting in the production database right now.**

`crs_results` holds 21 rows. Two of them are real pulls from the live bureau system
(`provider = 'crs_softview'`, `result.environment = 'production'`), both dated
**2026-08-24**. One of those two carries **13 real tradelines from Experian** and an
Experian score of 811. The other returned a file with no tradelines and was held for
fraud review. The remaining 19 rows are simulated (`result.simulated = true`).

So the answer to "can we feed the roadmap a real report" is not "build an integration".
It is "point the roadmap at a row we already have".

---

### 1. The exact shape of `crsResult`

`crsResult` is **two shapes in one object**, because the roadmap runs it through two
unrelated engines. Nothing requires both halves. Each half quietly does nothing when its
fields are missing.

#### Half A — the raw bureau file (drives `findings` and `rounds`)

Read by `violationsByBureauFromMergedCrs` and `derogatoryClaimsByBureau`, both of which
call `bureauReportsFromMergedCrs` in `src/metro2/diy/from-crs.mjs` and then
`normalizeFromCrs` in `src/metro2/normalize.mjs`.

Top level:

| Field | Required? | Read by |
|---|---|---|
| `bureaus.TU` / `.EX` / `.EQ` | one of the three, or the object is the bureau body itself | `bureauReportsFromMergedCrs` |
| `bureausPulled` | **not read by the roadmap at all** | only `src/finance/crs-tier.mjs` |

A bureau body counts as a report only if it has at least one of `tradelines`,
`creditFiles` or `inquiries` as an array (`isBureauReport`). If `bureaus` is absent, the
whole object is treated as ONE bureau and the code is worked out from
`creditFiles[0].creditFileDetail.sourceType` or `tradelines[0].sourceType` —
`"TransUnion"`/`"TU"`, `"Experian"`/`"EX"`, `"Equifax"`/`"EQ"`. Anything else and the
file is silently skipped.

Inside a bureau body:

| Field | Required? | What it does |
|---|---|---|
| `tradelines[]` | **required** — no tradelines, no findings | every Metro 2 check and every derogatory claim |
| `creditFiles[0].creditFileDetail.creditFileInfileDate` | optional | the report's as-of date (`reportAsOf`) |
| `responseDetail.dateRequested` | optional | fallback as-of date |
| `creditFiles[].aliases[] / dobs[] / addresses[] / employments[]` | optional | personal-information checks; missing means those checks stay silent |
| `inquiries[]` | optional | inquiry checks |
| `scores` | not read on this half | — |

Per tradeline record — these are the **exact vendor key names**, read in
`normalizeTradeline` (`src/metro2/normalize.mjs`) and `classifyDerogatory`
(`src/metro2/diy/derogatory.mjs`). Nothing else on a tradeline is read:

| Key | Required? | Used for |
|---|---|---|
| `creditorName` | one of these two, or the record is dropped | who the letter names |
| `accountIdentifier` | (same) | last four digits |
| `sourceType` | optional | which bureau |
| `accountType` | optional | Metro 2 Field 8. Only `Revolving` / `Installment` / `Mortgage` / `Open` translate |
| `accountOwnershipType` | optional | Metro 2 Field 37. Only 6 values translate |
| `accountOpenedDate` | optional | Field 10, strict `YYYY-MM-DD` |
| `accountReportedDate` | optional | Field 24 |
| `accountClosedDate` | optional | Field 26 |
| `currentBalanceAmount` | optional | Field 21 |
| `pastDueAmount` | optional | Field 22, and the late-payment claim |
| `chargeOffAmount` | optional | Field 23 |
| `currentRatingType` | optional | the bureau's own words, quoted in the letter |
| `paymentStatus` | optional | fallback for the above |
| `businessType` | optional | marks a collection agency |
| `loanType` | optional | marks a collection agency |
| `_30DayLates` / `_60DayLates` / `_90DayLates` | optional | the late-payment claim |

**Twenty-six of the thirty-eight Metro 2 checks can never fire on this data**, and that
is deliberate, not broken. `docs/metro2/CRS-FIELD-COVERAGE.md` lists every refused field
with its evidence. Field 17A (Account Status) alone is read by fifteen checks and is not
in a consumer soft pull.

#### Half B — the underwriting engine result (drives `accounts`, `today`, `later`)

Read by `buildBlackReportClient` in `src/underwrite/black-report-client.mjs`. The roadmap
uses only four things off the returned client dict: `revolving`, `preapproval_now`,
`preapproval_after`, `util_pct`.

| Field | Required? | Effect when missing |
|---|---|---|
| `normalized.tradelines[]`, else top-level `tradelines[]` | needed for the `accounts` table | `accounts` comes back `[]` |
| `preapprovals.totalCombined` | needed for `today.preapproval` | **forced to 0**, and `today.preapprovalKnown` reports `false` |
| `projectedPreapproval.totalCombined` | needed for `later.preapproval` | falls back to `preapproval_now` |
| `consumerSignals.utilization.{pct,totalBalance,totalLimit}` | fallback only | re-summed from the tradelines when they carry limits |
| `consumerSignals.scores.perBureau.{ex,eq,tu}`, `scores`, `outcome`, `findings`, `consumerSignals.bureauNegatives`, `normalized.identity`, `normalized.publicRecords`, `businessSignals`, `pulledAt` | **not used by the roadmap** | nothing |

`buildBlackReportClient` happily reads **raw vendor spellings** on a tradeline, not just
the engine's own: `currentBalanceAmount`, `creditLimitAmount`, `accountOpenedDate`,
`accountStatusType`. This matters — it means a raw pull feeds the accounts table with no
conversion at all.

An account only reaches the `accounts` table if `accountType` is `revolving` (case
ignored), `isAU` is not true, and it has a creditor name. `effectiveLimit` /
`creditLimitAmount` is what produces the pay-down target; with no limit the row still
prints but the target is blank.

#### `buildRoundPlan` reads nothing off `crsResult`

It takes only the flattened items the roadmap hands it — `bureau`, `round`, `creditor`,
`account_last4`, `rule_id` — and the round ladder from
`src/metro2/letters/catalog.mjs`. Every finding is stamped `round: "R1"`, so all attacks
land on Round 1 and R2–R6 are always empty. Six rounds always come back.

---

### 2. What already produces this shape

| File | Real or simulated | How it gets its data |
|---|---|---|
| `src/finance/crs-map.mjs` → `mergeBureauReports()` | **REAL** | Merges the live bureau responses into `crs_results.result`. This is the producer. |
| `src/finance/crs-pull.mjs` → `runCrsPull()` | **REAL** | Orders each bureau through `src/finance/crs-client.mjs` → `src/messaging/providers/crs-softview.mjs`, then stores through `coordinateCrsResult()` in `src/finance/soft-pulls.mjs`. |
| `src/workflows/c-00-crs-soft-pull-request.mjs` | **REAL** | Fires `runCrsPull` automatically on the `diagnostic.paid` event. |
| `src/waypoints/seed.mjs` → `latestCreditFile()` | **REAL (reader)** | The existing one-line way to fetch a logged-in client's newest stored file: `SELECT id, created_at, result FROM crs_results WHERE client_id=$1 AND org_id=$2 AND is_demo IS NOT TRUE ORDER BY created_at DESC LIMIT 1`. **This is the hook the roadmap needs.** |
| `src/demo/simulate-client.mjs` | simulated | Hardcoded scores and tradelines, written with `is_demo = true`. |
| `scripts/sim/push-credit.mjs` | simulated | Hand-built `bureaus.{TU,EX,EQ}`, stamped `simulated: true`. |
| `src/demo/platform-seed.mjs` | simulated | Invented creditor names, older shape with no `bureaus` key. |
| `src/optimize-page/roadmap.mjs` → `SAMPLE_STORED_FILE` | sample | The placeholder the public page falls back to. |
| `vendor/underwriteiq-full/api/lite/crs/sandbox/{tu,exp,efx}.json` | real vendor payloads, fake people | The vendor's own sandbox responses. Used by tests. |

**No CSV holds credit data.** Checked `db/`, `scripts/` and `docs/`.

**`src/adapters/crs.mjs` is not a producer** — it only reshapes an engine result into
events. **`src/workflows/u-03-crs-snapshot-sync.mjs` is not a producer either** — it
reads an already-stored result.

#### What is actually in the database, measured 2026-09-17

| | rows |
|---|---|
| Total `crs_results` | 21 |
| Real production pulls (`provider = 'crs_softview'`) | **2** |
| Simulated (`result.simulated = true`) | 19 |
| Carrying a `bureaus` object | 21 |
| Carrying `preapprovals` | 19 — **all of them simulated** |

The two real rows, both 2026-08-24:

| Bureau | Tradelines | Score | Outcome |
|---|---|---|---|
| EX | **13** | 811 | PREMIUM_STACK |
| EQ | 0 | none | FRAUD_HOLD |

**The real rows do NOT carry `preapprovals`, `projectedPreapproval` or `consumerSignals`.**
`mergeBureauReports()` never writes them. The underwriting engine runs at pull time
(`src/finance/crs-tier.mjs`) but only its tier and one funding number are kept — the tier
goes to `clients.outcome_tier` and `crs_results.outcome_tier`, and the rest is thrown
away. The simulated rows carry those fields because the simulator writes them by hand.

Note for W1: the two production rows prove the live fence was OPEN on 2026-08-24. W1
measured it CLOSED today. Both are facts about different days; neither contradicts
the other.

#### Proof the shape works end to end

Ran `buildOptimizeRoadmap` locally over the vendor's three real sandbox payloads wrapped
as `{ bureausPulled, bureaus: { TU, EX, EQ }, tradelines }` — the exact output of
`mergeBureauReports()`:

```
onRepairPath=false  source=file  findings=41  rules=M2-005,M2-031,M2-036
                    accounts=8  util="23%"  preapprovalKnown=false  preapproval=0
onRepairPath=true   source=file  findings=46  rules=+DEROG-CHARGEOFF,DEROG-LATE
                    accounts=8  util="23%"  preapprovalKnown=false  preapproval=0
```

41 real findings, 8 real card rows, a real 23% utilisation figure. **Zero conversion
code was written.** The only thing that came out wrong is the pre-approval, and the page
already knows to hide it because `preapprovalKnown` is `false`.

---

### 3. `personal` and `onRepairPath`

#### `personal` changes nothing in the roadmap's output today

`buildBlackReportClient` uses `personal` for `applicant`, `address`, `state` and
`booking_url`, reading `name`, `address`, `state`, and `bookingUrl` / `booking_link`.
The roadmap returns **none of those four**. It reads only `revolving`,
`preapproval_now`, `preapproval_after` and `util_pct`, and it uses its own hardcoded
`BOOK_URL`. So `personal` is currently dead weight — passing a real name changes no
byte of the answer. It would only start to matter if the page began printing the
client's name or address.

#### `onRepairPath` is the dispute-claim switch

`true` merges the derogatory claims (`DEROG-COLLECTION`, `DEROG-CHARGEOFF`,
`DEROG-LATE`) into the Metro 2 findings, one per derogatory account, skipping any
account the Metro 2 engine already flagged.

`false` — what the public referral door at `api/public/optimize.mjs:226` passes —
**suppresses every derogatory claim**. A file that is nothing but collections and
charge-offs, reported cleanly, produces **zero findings and zero attacks**: a wrecked
report reads as a clean one. The measurement above shows the size of it — 41 findings
off the flag, 46 on, and the 5 extra are exactly the ones a repair client is paying for.

This is deliberate. The owner rule of 2026-09-03 is "any derogatory deserves a letter,
but only if they are in the correct offer path", and a stranger on a no-auth referral
page is on no offer path. A caller that knows the client answers it from
`clients.outcome_tier`, or from `src/repair/on-repair-path.mjs` when it also has the
org id.

---

### 4. What would have to be written

Two very different sizes of job, depending on which vendor.

#### If the report comes from CRS — almost nothing

The shape already matches. What is missing is only the plumbing:

1. **A way in.** `buildOptimizeRoadmap` has exactly one caller today —
   `api/public/optimize.mjs:226` — and it calls it with no arguments at all. There is no
   logged-in door. Something has to read the client's newest row and pass it in.
   `latestCreditFile()` in `src/waypoints/seed.mjs` already does the read.
2. **The offer-path answer.** That same caller has to work out `onRepairPath`, or every
   derogatory claim stays hidden.
3. **The pre-approval, if it is wanted on screen.** The real rows do not carry it, so
   `today.preapproval` will be 0 and `preapprovalKnown` will be `false`. Either re-run
   the tier engine over the stored row (`runTierEngineFromCrsResult` in
   `src/finance/crs-tier.mjs` already does exactly this and needs nothing new) and merge
   with `mergeStoredUnderwrite`, or leave the figure hidden.
4. **The live fence.** W1 measured `CRS_ALLOW_LIVE = 0` and the sandbox host today, so a
   NEW real pull cannot happen until the owner opens it. The two rows from 2026-08-24
   are readable regardless.

#### If the report comes from a new third party — a translator has to be written

There is no generic importer in this repo. Whatever arrives would have to be turned into
the CRS vendor's own field names, listed in section 1 above, before either engine reads a
thing. Specifically:

- **Per bureau, not merged.** The engine runs once per bureau file and writes one letter
  per bureau. A single flattened list loses that.
- **Exact key names.** `creditorName`, `accountIdentifier`, `currentBalanceAmount`,
  `accountOpenedDate`, and the rest of the table above. A close-enough name reads as
  missing and the check stays silent — it does not error.
- **Exact enumeration values.** `accountType` must be the literal words `Revolving` /
  `Installment` / `Mortgage` / `Open`. `accountOwnershipType` must be one of six exact
  strings. `sourceType` must be `TransUnion` / `Experian` / `Equifax`. Anything else is
  refused on purpose — `src/metro2/normalize.mjs` has the reasoning written out, and the
  refusals are the safety feature, not a bug to route around.
- **Dates strictly `YYYY-MM-DD`.** Any other format is dropped.
- **Money as dollars.** A string or a number; converted to cents internally. Empty stays
  unknown and must not become zero.

That translator is roughly the same job as `src/metro2/normalize.mjs`'s input contract,
written in reverse, and it is only worth writing if the new vendor gives us something CRS
does not.

---

### What W3 concludes

Nothing needs to be built to put a real report on the roadmap. One row already in the
database has thirteen real tradelines in exactly the right shape. What is missing is a
logged-in door that reads it, and an answer to whether that client is on a repair path.

---

## W1 verification of W3 (this session, 2026-09-17)

W3's headline holds: **the roadmap engine reads a real bureau file with no new engine code.**
Two of its specific numbers do not, and one is stated more strongly than the evidence.

### What I re-measured myself

Ran `buildOptimizeRoadmap()` over `vendor/underwriteiq-crs/sandbox/exp.json` — a real-shaped
Experian file already in this repo, 13 tradelines, 23 inquiries. No production data touched.

| Fed as | `source` | findings | accounts | card use |
|---|---|---|---|---|
| bureau block only (`bureaus.EX`) | `file` | **16** | **0** | `""` |
| bureau block **plus top-level `tradelines`** | `file` | **16** | **4** | **93%** |

Real creditor names came through both times — SIGNET BANK/VIRGINIA, CAPITAL ONE, SYNCB/LEVITZ.

### The correction that matters

**The engine has two halves and they read from two different places.**

- The **findings** half (`violationsByBureauFromMergedCrs`) reads `crsResult.bureaus.<BUREAU>`.
- The **money** half (`buildBlackReportClient` → `tradelinesOf`, `black-report-client.mjs:230`)
  reads `crsResult.normalized.tradelines` **or** top-level `crsResult.tradelines` — and does
  NOT look inside `bureaus`.

Feed a stored file that only has the `bureaus` block and you get findings with an empty account
table and no card-use figure. That is a real gap and it is the actual work item. W3 reported
"8 real card rows and 23% credit usage" from its own run; I could not reproduce those figures
and got 4 rows and 93% from the repo's own Experian fixture. Neither run is production data,
so treat both as shape proof, not as anyone's numbers.

`preapprovalKnown` stayed **false** in every run. W3 is right that the pre-approval figure is
never stored. `/roadmap` already prints "Not known yet" rather than a false $0.

### What I could NOT verify

**Production reads are blocked for this session** by the permission classifier. I confirmed by
count only:

- `crs_results` holds **21 rows**, and **`is_demo` is TRUE on none of them** — so the flag
  `latestCreditFile` filters on does not separate them.

W3 reported "19 fake, 2 real, both from 24 August" and a 13-tradeline Experian row with a score
of 811. **I could not confirm any of that**, and the `is_demo` count contradicts the 19/2 split,
so W3 was likely judging by content rather than by the flag. The five newest rows are dated
2026-09-17, not 24 August. **Do not build on those specifics until someone with read access
checks them.**

### Confirmed with no caveat

- `latestCreditFile` exists — `src/waypoints/seed.mjs:49`, one query, already written.
- `buildOptimizeRoadmap` has exactly **one** non-test caller: the public referral door, which
  passes nothing. No logged-in version was ever written. That is why everyone sees the example.
