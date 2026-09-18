<!-- Hand-authored from the code in src/handlers/doc-check.mjs and
     src/identity/verified.mjs, 2026-09-04. Traced line by line, not from a spec.
     Updated 2026-09-17 with the "the reader had no credit" branch and the retry
     sweeper (src/workflows/doc-check-retry-sweeper.mjs), traced the same way. -->

# The identity chain — from a photo of an ID to the name on a dispute letter

## The problem this closes

The client photographs their government ID and a utility bill. The DOC-CHECK
agent reads both images and decides whether the two addresses match. It is the
only thing in the whole system that ever sees those pictures.

Until 2026-09-04 it never said what it read. Its answer was only accept /
request_more / hold. So the dispute letters had nothing verified to quote and
fell back to two values nobody had ever checked against a document:

* `clients.first_name` + `clients.last_name`, typed by a closer during a sales
  call, which has never carried a middle name.
* `pii_identity.addresses[0]`, the first item of a list nothing validates. That
  is how a letter once told a credit bureau a client's **business** address was
  their home address.

The agent now returns the name, the address and the date of birth it read, and
those land on the client with the exact file version they came from.

## The states a record moves through

```mermaid
flowchart TD
    UP[Client uploads a photo, or texts one in] --> EV[docs.received event]
    EV --> W[Workflow doc-check]
    W --> K{Is it a client document?}
    K -->|inquiry_doc or bureau_response| SKIP[Not this agent's job — stop]
    K -->|Yes| ST{Is the DOC-CHECK agent switched on?}
    ST -->|retired or draft| LOG[Write an honest agent_runs row — stop, send nothing]
    ST -->|live| BY[Load the exact file version's bytes]
    BY -->|no bytes| MISS[agent_runs: document_bytes_missing — stop]
    BY --> MODEL[The agent reads the image]
    MODEL --> ANS{Did it come back with a verdict?}

    ANS -->|No, and waiting will not help| HAND[Open a task — a person has to read it]
    ANS -->|No, the AI account has no credit<br/>or the vendor was unreachable| QUEUE[Queue it on failed_events,<br/>pending, with a next_attempt_at]
    QUEUE --> WAIT[Task: waiting on the document reader]
    QUEUE -.->|every 20 minutes| SWEEP[doc-check retry sweeper]
    SWEEP --> MODEL
    SWEEP -->|12 tries, about 9 days| GIVEUP[Row exhausted — task: check it by hand]

    ANS -->|Yes| OUT{What did it decide?}

    OUT -->|accept| REC[Record ONLY the fields it actually read]
    REC --> DB[(pii_identity.verified_legal_name,<br/>verified_address, verified_dob,<br/>+ which file version proved each one)]
    DB --> MSG[Tell the client their documents passed]

    OUT -->|request_more| NOTHING[Record NOTHING, whatever the model wrote]
    NOTHING --> ASK[Text the client what to fix — gate stays shut]

    OUT -->|hold| TASK[Open a task for a person — gate stays shut]

    DB --> READ[verifiedIdentity - the one call other code makes]
    READ --> LETTER[Dispute letters quote a value a document proved]
```

## The rules the code enforces

| Rule | Where |
|---|---|
| An empty AI account is **not a verdict**. A 429, a vendor 5xx or a call that never landed queues the document for another read; the client's verified identity is left exactly as it was. | `classifyModelFailure` in `src/agents/model.mjs`, `queueReaderRetry` in `src/handlers/doc-check.mjs` |
| A queued document is read again **without anybody doing anything** — no re-upload, no button. Twelve tries, backing off to daily, then it stops and asks a person. | `src/workflows/doc-check-retry-sweeper.mjs` |
| The retry sweeper claims **only** rows whose handler is `doc-check`. It cannot replay another handler's queued failure. | `due(db, { handler })`, `src/events/dead-letter.mjs` |
| A document that is still unread **never** gets a stand-in identity — not a placeholder, not a value off the credit report. Late beats wrong. | the `!json` branch, `src/handlers/doc-check.mjs` |
| Only an **accept** records anything. A document the agent refused has proved nothing, however much of it the model managed to read. | `routeDocCheckOutcome`, `src/handlers/doc-check.mjs` |
| A field the agent did not report is **NULL**. Never blank, never zero, never a value borrowed from the client record. | `recordVerifiedIdentity`, `src/identity/verified.mjs` |
| A word standing in for a missing value — "N/A", "none", "not legible" — reads as NULL, not as a name. | `cleanString`, same file |
| A date of birth is stored only when it is unambiguous. `02-04-85` could be 4 February or 2 April, so it stays NULL. | `normalizeDateOfBirth`, same file |
| A new upload adds what it proved and does not erase what an earlier one proved. A licence gives the name and birthday; a utility bill gives the current address. | the upsert's `COALESCE`, same file |
| Every field carries the document **version** that proved it, so the claim can be re-checked later. | `verified_field_sources` |
| `verifiedIdentity()` returns nulls for a client nothing has proved. A null is never a reason to fall back to the closer-typed name. | `verifiedIdentity`, same file |

## The one function everything else calls

```
import { verifiedIdentity } from "../identity/verified.mjs";

const id = await verifiedIdentity(db, { orgId, clientId });
// { legalName, address, dateOfBirth, source, verifiedAt, fieldSources }
// every field null until a document proved it
```

## When the reader has no credit

Measured on production, 2026-09-17: twelve DOC-CHECK runs, every one of them
`openai 429 — You have no credits remaining`. Every one was recorded as a
finished run. Nothing held a note to come back, so topping the account up would
not have unstuck a single one of those documents: with no new upload there is no
`docs.received`, and with no event there is no reader.

Dispute letters cannot be staged until a client's ID has been read — the letters
quote what a DOCUMENT proved. So an empty wallet on one afternoon froze credit
repair for every client who uploaded during it, with no way back except a person
finding each file and asking for it again.

That branch is now a queue with a clock on it. The document is parked on
`failed_events` as pending; the sweeper picks it up on the next tick; the first
read after the account has credit finishes the job and the client's record moves
on by itself. The reason stays on the client's file the whole time — an
`agent_runs` row saying `openai 429 …` and an open task saying what is being
waited on.

## Still open

Nothing consumes `verifiedIdentity()` yet. The dispute-letter builders still
read `clients.first_name` and `pii_identity.addresses[0]`. Swapping them over is
a separate change in files this one does not own.
