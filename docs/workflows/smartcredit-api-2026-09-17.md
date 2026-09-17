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
| W3 | What shape does our roadmap engine need a report in? | open | pending |

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

_pending_
