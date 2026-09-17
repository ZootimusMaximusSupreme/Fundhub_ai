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
| W2 | What does the Smart Credit / ConsumerDirect API actually offer? | open | pending |
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

_pending_

## W3 findings

_pending_
