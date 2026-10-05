# Fundhub video worker (spec 9.5).
#
# BUILD CONTEXT IS THE REPOSITORY ROOT. The worker runs code that lives in
# src/ad-videos/ and renders the animation kit in marketing/broll/, and Docker
# cannot copy from above the context:
#
#   docker build -f video-worker/Dockerfile -t fundhub-video-worker .
#
# On Render.com: Dockerfile Path = video-worker/Dockerfile, Docker Build Context
# Directory = . (the repo root). Render approval is spec section 16 item 4.
# Nothing in this repo deploys it.
#
# What is in the image: Node 22, ffmpeg 6.1 or newer WITH libzimg (the HDR
# tonemap needs zscale), the system libraries Chrome needs, a Chrome that
# Remotion downloaded at build time, and the broll kit bundled once.

# A static ffmpeg built with libzimg and libopus. Debian bookworm's own ffmpeg is
# 5.1, below the 6.1 floor, so it is not used.
FROM mwader/static-ffmpeg:7.1.1 AS ffmpeg

FROM node:22-bookworm-slim

# Chrome's runtime libraries (Remotion's documented Linux list) and fonts.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 \
      libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
      libpango-1.0-0 libcairo2 libcups2 libxshmfence1 \
      fonts-liberation fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe
# Fail the build, not the first render, when the ffmpeg is wrong.
RUN ffmpeg -version | head -1 && ffmpeg -version | grep -q -- "--enable-libzimg" && ffmpeg -encoders 2>/dev/null | grep -q libopus

WORKDIR /app

# The worker's own dependencies.
COPY video-worker/package.json video-worker/package-lock.json /app/video-worker/
RUN cd /app/video-worker && npm ci --omit=dev

# The animation kit: install its own dependencies, then bundle it once.
COPY marketing/broll /app/marketing/broll
RUN cd /app/marketing/broll && npm ci

COPY video-worker /app/video-worker
# Exactly the shared pure modules the worker imports, and nothing else from src/.
COPY src/ad-videos/worker-protocol.mjs src/ad-videos/worker-jobs.mjs src/ad-videos/overlay-plan.mjs src/ad-videos/ffmpeg-plan.mjs /app/src/ad-videos/

# Chrome for Remotion, and the bundle (both at build time, never at render time).
RUN cd /app/video-worker && node scripts/ensure-browser.mjs \
 && node scripts/bundle.mjs /app/marketing/broll /app/bundle

ENV NODE_ENV=production \
    PORT=8080 \
    REMOTION_BUNDLE_DIR=/app/bundle

# Never run as root.
RUN useradd --create-home --uid 10001 worker && chown -R worker:worker /app
USER worker

EXPOSE 8080
WORKDIR /app/video-worker
CMD ["node", "server.mjs"]
