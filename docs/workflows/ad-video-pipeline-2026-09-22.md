# Ad video pipeline — shared board (2026-09-22)

> Merged board. Unit A's section first, then Unit B's, then the merge notes at the bottom.

---

## Unit A
# Ad video pipeline — shared board (2026-09-22)

Branch: `feat/ad-video-pipeline`. Ground truth: `docs/video-pipeline-plan.md`,
`docs/specs/video-pipeline-api-verification-2026-09-22.md`, `.claude/rules/video-4k-unless-ad.md`.

**No Postgres on this Mac. Every `.pg.test.mjs` in this batch SKIPPED. A skipped test is not green.**

---

## Task list

| Unit | Owner | Status |
|---|---|---|
| A — the record, the state machine, the naming, the two doors | this session | **done** |
| B — providers, workers, the sweeper, the flow doc | Builder B | pending |

---

## A is done. What B needs to know.

### The one dependency: `src/ad-videos/store.mjs`

B imports this. Every export it offers, so B can code against the list without
reading the file:

**Moving a row**

| Export | What it does |
|---|---|
| `createTake(tx, {orgId, partnerId, adId, takeNo, status?, videoKind?, ...patch})` | a new take at a number you choose |
| `nextTake(tx, {orgId, partnerId, adId, status?, videoKind?, ...patch})` | the next free take number, chosen inside the INSERT so two workers cannot both take 2. **This is the re-film after a rejection.** |
| `claimTake(tx, {orgId, partnerId, adId, takeNo, driveFileId, driveName?, ...})` | the Drive poll's write. Returns `{row, created}`. Seeing one file twice makes ONE row and never drags a row that has moved on back to `raw_landed`. |
| `advance(tx, {orgId, id, from, to, by?, patch?})` | one state forward. **Returns `null`** when the row was not in `from` any more — read that as "somebody already did this" and stop, not as an error. |
| `markFailed(tx, {orgId, id, from, reason})` | reason is required |
| `retryFailed(tx, {orgId, id})` | `failed` → `staged` |
| `armForApproval(tx, {orgId, id, from?, token, expiresAt, patch?})` | saves the token and moves to `awaiting_approval`. **Call this before sending the notification** — a notification carrying a token the row does not hold yet is a link that 404s on the one tap that matters. |
| `approve(tx, {orgId, id, approvedBy})` / `reject(tx, {orgId, id, reason})` | the screen's doors. The phone tap uses `token.mjs` instead. |
| `markDelivered(tx, {orgId, id, paulFolderId, driveFinalFileId})` | the end of the line |

**Reading**

`findById`, `findByDriveFileId`, `findBySubmagicProjectId({projectId})`,
`listByAdId`, `listByStatus({orgId, status?, limit, offset})`, `lastTakeNo`,
`finishedTake({orgId, adId})`.

Reads take `withTranscript: true` when a step actually needs `transcript` and
`source_url`; they are left out of the default shape on purpose.

**Re-exported from `states.mjs` so B needs one import:** `STATES`, `TRANSITIONS`,
`TERMINAL_STATES`, `WORKING_STATES`, `HUMAN_ONLY`, `STATE_MEANING`, `isState`,
`isTerminal`, `isHumanOnly`, `canTransition`, `nextStates`, `transition`,
`AdVideoStateError`, and `asStaff`.

Also exports `AdVideoStoreError` (codes: `unknown_state`, `unpatchable_column`,
`drive_file_required`, `reason_required`, `approver_required`, `bad_ad_id`).

### Three things that will bite B if it does not read them

1. **Every call needs a `tx` from `asStaff()`.** `ad_videos` has FORCEd
   row-level security. A bare `db.query()` against it matches **zero rows and
   does not error** — the worker looks like it ran and did nothing.
2. **`advance()` refuses an illegal move by throwing, before any SQL runs.** It
   also refuses a worker moving a row to `approved` or `rejected`
   (`by: "human"` is required, and the workers must never pass it).
3. **`patch` only accepts the columns a worker may set.** `status`,
   `approved_at`, `approved_by` and the token fields are moved by their own
   named functions. Passing one in a patch throws `unpatchable_column`.

### `src/ad-videos/naming.mjs` — the rule B must not break

**The folder pads. The link does not.** `folderNumber("43") → "043"` for file and
folder names only; `linkNumber("43") → "43"` and `utmContent(adId, slug?)` for
anything that reaches a URL. A padded value handed to either is **refused**, not
trimmed. `043` and `43` are two different ads to `fundhub_ad_id()`, and mixing
them splits one ad's results in half forever.

Also: `paulFolderName`, `finalFileName(adId, takeNo, version, ext?)`,
`briefFileName`, `rawFileName(adId, takeNo, takeDate, ext?)`, `storageRawKey`,
`storageFinalKey`, `landingLink(baseUrl, adId, {slug, extra})`,
`parseVideoName(name)` (returns `null` for a name we did not make — that is
information, not a problem to paper over), `AD_ID_RE`, `AdVideoNamingError`.

### `src/ad-videos/token.mjs` — for the notifier

`mintApprovalToken({now?, ttlHours?}) → {token, expiresAt}` (48 hex chars, 72h).
Hand the token to `armForApproval()` and put it in the notification link.
The door itself is `api/public/ad-video-approve.mjs`:
`GET  /api/public/ad-video-approve?token=…` shows the take,
`POST /api/public/ad-video-approve` with `{token, decision: "approve"|"reject", reason?}` decides.

**B does not need `withApprovalToken`/`approveByToken`/`rejectByToken`** — those
are the door's own internals and must never be called from a worker.

### Column names that differ from the plan's table

The plan's `raw_signed_url` → **`source_url`**; `submagic_download_url` →
**`finished_url`**; `drive_final_folder_id` → **`paul_folder_id`**. Everything
else keeps the plan's name. Do not add a second column under the old name.

---

## A's change manifest

**New**
- `db/migrations/389_ad_videos.sql`
- `src/ad-videos/states.mjs`, `naming.mjs`, `token.mjs`, `store.mjs`
- `src/ad-videos/states.test.mjs` (46), `naming.test.mjs` (29), `token.test.mjs` (15) — **all run, all pass**
- `api/ad-videos.mjs`, `api/public/ad-video-approve.mjs`
- `src/http/ad-videos.pg.test.mjs`, `src/http/ad-video-approve.pg.test.mjs` — **NOT RUN, no Postgres**

**Edited**
- `netlify/functions/api.mjs` — two ROUTES keys: `ad-videos`, `public/ad-video-approve`
- `src/pulse/registry.mjs` — `ad-videos` monitored; `public/ad-video-approve` in `ALLOWED_UNMONITORED` with its reason
- `db/expected-migrations.mjs` — regenerated (`npm run migrations:manifest`)
- `docs/journeys/*-actual.md` + `README.md` — regenerated (`npm run journeys`), because two new routes made them stale
- `docs/journeys/CHANGELOG.md` — one line appended

> **Note for B:** the brief put `docs/journeys/CHANGELOG.md` in B's column, but
> A's two routes made the generated journeys stale and CLAUDE.md §4 says they
> update in the same commit. A appended **one line at the top**. Append yours
> above it; it is not a conflict, just two entries.

**Routes added:** `GET /api/ad-videos` (owner, admin) and
`GET|POST /api/public/ad-video-approve` (open, token is the credential).

**Env var names referenced:** none. Unit A reads no environment variable and
holds no credential. (`DATABASE_URL` and `APP_DATABASE_URL` are read by the test
harness only.) The Submagic, Drive, Anthropic and ntfy names belong to B.

---

## Open questions and blockers

**None blocking B.** Two things A decided rather than asked, both written up in
the code:

1. **`failed` is reachable from every working state**, not only the two the
   plan's diagram draws. The plan's state *table* says "any worker error", and
   six states have a worker that can throw. `src/ad-videos/states.mjs` header,
   note 1.
2. **`rejected` is a dead end on its own row.** The diagram draws
   `rejected → filming`; that arrow is `nextTake()` making a NEW row, because
   one row is one take and `take_no` is never renumbered. Note 2 in the same
   header, and a test that argues back if somebody "fixes" it.

## Leftover card — not A's, not touched

`src/pulse/registry.test.mjs` was already red before this branch, on four paths
that have nothing to do with video: `public/eeo-survey`, `read/eeo-aggregate`,
`scripts/list`, `waypoint-tick`. A registered its own two and left those four
exactly as they were.

---

## Unit B
# Ad video pipeline — shared board, 2026-09-22

Two builders, one feature. This file is how they coordinate (CLAUDE.md §5).

| Unit | Owner | Status |
|---|---|---|
| A — data + doors (migration, store, naming, token, `/api/ad-videos`, the public approve door, ROUTES) | Builder A | *A writes here* |
| B — providers + workers (Submagic, Drive write, ntfy, the state machine, the 5-minute sweeper, the Submagic webhook branch) | Builder B | **done** |

Ground truth: `docs/video-pipeline-plan.md`,
`docs/specs/video-pipeline-api-verification-2026-09-22.md`,
`.claude/rules/video-4k-unless-ad.md`.
The built flow: `docs/journeys/ad-video-flow.md`.

---

## Builder B — change manifest (done)

Branch: `feat/ad-video-pipeline-workers`. Builder A holds `feat/ad-video-pipeline`
in another worktree; two worktrees cannot check out one branch, so B's work is on
its own branch for A (or Chris) to merge. No file below is in A's column.

**New — providers.** All three ship `ENABLED = false` and are deliberately NOT in
`src/messaging/providers/index.mjs`, exactly like `web-push.mjs`. Nothing in the
message queue can reach them.

* `src/messaging/providers/submagic.mjs` — create (autoRender off, AI b-roll
  refused outright), get project (`words[]`), upload our clip, update items,
  export, read the webhook payload. Fence: **ADAPTERS**.
* `src/messaging/providers/google-drive-write.mjs` — list new takes, read the real
  width/height, rename, make a folder, upload the brief. Fence: **ADAPTERS**.
* `src/messaging/providers/ntfy.mjs` — the buzz on Chris's phone. Fence:
  **MESSAGING**.

**New — the work.**

* `src/ad-videos/pipeline.mjs` — the state machine. Pure; every port injected.
* `src/ad-videos/match.mjs` — Claude reads the take and picks the script.
* `src/ad-videos/broll.mjs` — where our clips go, and when.
* `src/workflows/ad-video-sweeper.mjs` — every 5 minutes.

**Changed.**

* `src/workflows/index.mjs` — import + one array entry (`adVideoSweeper`).
* `src/http/router.mjs` — a `submagic` branch in `dispatchWebhook`. **No ROUTES
  entry**: `netlify/functions/api.mjs` routes `webhooks/` by prefix and
  `src/http/routes.test.mjs` fails if anybody adds a `webhooks/…` key. So A has
  nothing to add for this door.

**Tests added** (unit, no network, no database): `submagic.test.mjs`,
`google-drive-write.test.mjs`, `ntfy.test.mjs`, `broll.test.mjs`,
`match.test.mjs`, `pipeline.test.mjs`, `ad-video-sweeper.test.mjs`,
`src/http/submagic-webhook.test.mjs`.

**Not touched:** the migration, `src/ad-videos/store.mjs`,
`src/ad-videos/naming.mjs`, `src/ad-videos/token.mjs`, anything under `api/`,
`netlify/functions/api.mjs`.

---

## WHAT BUILDER B NEEDS FROM BUILDER A

B does not import A's modules at the top of any file. `ad-video-sweeper.mjs` and
the `submagic` webhook branch load them **at run time** and report "not built
yet" if they are missing, so B's half deploys and passes on its own. When both
are in, the try/catch in `loadStore()` can become a plain import.

### `src/ad-videos/store.mjs` — six functions

```js
lastRawSeenAt(db)                    // → ISO string | null. The newest createdTime already recorded.
recordRawTake(db, take)              // → { created: boolean, id }. Idempotent on take.driveFileId.
                                     //   take = { driveFileId, name, createdTime, sizeBytes,
                                     //            width, height, durationSeconds }
listPending(db, { limit })           // → rows whose status is raw_landed | staged | editing |
                                     //   transcribed | matched | rendered | approved
patch(db, id, fields)                // → updates exactly the columns given, nothing else
candidateScripts(db)                 // → [{ id, adId, title, body }] — locked scripts that carry an
                                     //   ad number and have no finished video yet
findBySubmagicProjectId(db, id)      // → the row, or null
```

### `src/ad-videos/naming.mjs` — four functions

```js
rawName({ adId, takeNo, date })            // "043_t02_raw_2026-09-23.mp4"
finalName({ adId, takeNo, version })       // "043_t02_final_v1.mp4"
adFolderName(adId)                         // "043"
briefName(adId)                            // "043_brief.txt"   (B writes text, not PDF — see the flow doc)
```

**Pad the file and folder names. NEVER pad the link.** `fundhub_ad_id()` returns
text, so `utm_content=043` and `utm_content=43` are two different ads and one
ad's results split in half. `buildBrief()` in `pipeline.mjs` reads the ad number
off the row and writes it unpadded.

### Columns B writes through `patch()`

Every one is a field `docs/video-pipeline-plan.md` §3 already names, plus the
idempotency stamps the workers need. If A's migration spells any of these
differently, **the spelling in A's migration wins** — tell B's half by editing
this list.

`status`, `raw_public_url`, `staged_at`, `submagic_project_id`, `transcript`,
`transcript_words`, `duration_seconds`, `script_id`, `ad_id`, `match_confidence`,
`renamed_at`, `broll_placed_at`, `broll_count`, `broll_notes`, `exported_at`,
`submagic_download_url`, `rendered_at`, `storage_final_key`, `save_note`,
`notified_at`, `notify_error`, `drive_final_folder_id`, `drive_brief_file_id`,
`drive_final_file_id`, `delivered_at`, `delivery_note`, `failure_reason`.

### One thing A should know about the approve door

The phone notification's Approve and Reject buttons are **view** actions: they
open a link in the browser rather than firing an unauthenticated POST from the
phone. So `api/public/ad-video-approve.mjs` should answer a **GET** with the
signed token in the path, and show a plain page. `ntfy.mjs` drops any action
link that is not `https://`.

`ad-video-sweeper.mjs` passes `approveUrl` and `rejectUrl` into the pipeline and
currently sets both to `null` — B has no token minter. When A's `token.mjs`
lands, build them in `portsFor()`.

---

## Leftovers Builder B is NOT touching

Three gaps, all named in `docs/journeys/ad-video-flow.md` with the reason:

1. **Staging a take behind a public link.** Nothing in this repo can put a
   several-hundred-megabyte MP4 behind a URL. The draft-deploy trick shells out
   to the `netlify` command line, so it cannot run in a worker, and it was built
   for small images. No storage vendor was invented. Rows wait at `raw_landed`.
2. **Moving video bytes.** `src/lib/outbound-fetch.mjs` reads every response as
   text, so an MP4 cannot pass through the fence. Paul's folder and the brief do
   land; the video file does not.
3. **Drive write scope.** The stored Google token asks for `drive.readonly`. A
   write needs the full `drive` scope, which is a change on the Google side.

**pg tests were NOT RUN.** There is no local Postgres on this Mac. Nothing in
this batch is proved against a real database.
