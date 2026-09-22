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
