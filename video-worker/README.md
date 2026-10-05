# The video worker

A small separate service that does the heavy video work for the ad pipeline
(spec section 9.5). Netlify cannot run ffmpeg or Chrome. This can.

**Status: built, not deployed.** Putting it on Render is spec section 16 item 4
(Chris approves it on the Mac). Nothing in this repo deploys it, and this folder
never runs in a Netlify build.

## What it is

A thin shell. It holds the parts that cannot be unit-tested: the HTTP server, a
child process for ffmpeg, R2, and Remotion's Chrome. Every decision lives in
`src/ad-videos/` and is tested there (CLAUDE.md section 12 trap 22):

| File | Decides |
|---|---|
| `src/ad-videos/worker-protocol.mjs` | job ids, the key header, the signed callback, R2 key names, the claim SQL |
| `src/ad-videos/worker-jobs.mjs` | the four jobs, step by step |
| `src/ad-videos/overlay-plan.mjs` | which animations go on, the overlay command, the finalize checks |
| `src/ad-videos/ffmpeg-plan.mjs` | every ffmpeg argument for the master (9.3) |

Netlify's side: `src/messaging/providers/video-worker.mjs` (calls the worker),
`src/ad-videos/worker-dispatch.mjs` (claim and reclaim), and
`src/ad-videos/worker-callback.mjs` (the callback door, wired in
`src/http/router.mjs` as `provider === 'video-worker'`).

## Endpoints

Every call needs the header `X-Fundhub-Video-Key`.

- `GET /health` the ffmpeg build check and the queue depth
- `POST /jobs` with `{type, ad_video_id, org_id, cut_version, payload}`, answers 202
- `GET /jobs/:id` the job's state, or 404 when this process does not know it

Job types: `prepare`, `build_cut`, `copy_export`, `render_and_overlay`. One job
runs at a time. Jobs live in memory, so after a restart `GET /jobs/:id` is 404
and Netlify reclaims the row and sends the job again.

The order never changes: cut, then Submagic captions, then animation overlays,
then finalize. `build_cut` never draws an animation.

## It holds no Google credential

A job that touches Drive carries a one-hour Drive token from Netlify. The worker
uses it, never logs it, and drops it when the job ends. It never uploads a raw
take anywhere (Render bills outbound bandwidth); it uploads the audio, the cut
and the finished video to R2.

## Env names

Set on the Render service by Chris (never in this repo). Names are also in
`.env.example`.

| Name | What for |
|---|---|
| `VIDEO_WORKER_KEY` | the key Netlify sends in `X-Fundhub-Video-Key` |
| `VIDEO_WORKER_CALLBACK_SECRET` | signs the callback (HMAC over timestamp + body) |
| `VIDEO_WORKER_CALLBACK_URL` | where the callback goes: `https://fundhub.ai/api/webhooks/video-worker` |
| `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_AD_VIDEO` | the private R2 bucket `fundhub-ad-video` |
| `PORT` | defaults to 8080 |

## Build (not run by CI)

```
docker build -f video-worker/Dockerfile -t fundhub-video-worker .
```

The build context is the repo root. The image is Node 22, a static ffmpeg 7.1
with libzimg and libopus (the build fails if either is missing), Chrome for
Remotion (`remotion browser ensure` equivalent), and `marketing/broll` bundled
once. Rendering uses `gl: 'swangle'` and a concurrency of 1.

## Left for the first real run

- A signed GET link answers 403 to HEAD. `npm run sign -- <key>` mints a 24-hour
  link; prove Submagic and Meta can both fetch it. If either cannot, serve the
  file from the public media bucket under an unguessable key that expires in 7
  days (spec 9.5).
- See-through renders need each kit template to honor `transparent: true`
  (the 10/2 plan's step 1). Until then run with `animation_mode: 'fullframe'`.
- Hosting size: Render Standard (about $25 a month) takes about 3 hours for 10
  ads; Pro (about $85) about 1.5 hours (spec 17 decision 5).
