FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production DATA_DIR=/app/state
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 bot && useradd --uid 10001 --gid 10001 --create-home bot \
    && mkdir -p /app/state && chown -R bot:bot /app
COPY --from=build --chown=bot:bot /app/node_modules ./node_modules
COPY --from=build --chown=bot:bot /app/dist ./dist
COPY --chown=bot:bot package.json ./
COPY --chown=bot:bot assets ./assets
USER bot
CMD ["node", "dist/index.js"]

FROM python:3.10-slim-bookworm AS rvc-dependencies
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && git clone https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI.git /opt/rvc \
    && cd /opt/rvc && git checkout 7ef19867780cf703841ebafb565a4e47d1ea86ff \
    && sed -i -e 's/onnxruntime-gpu/onnxruntime/' -e 's/^numpy$/numpy==1.26.4/' \
       -e 's|git+https://github.com/One-sixth/fairseq.git|git+https://github.com/One-sixth/fairseq.git@44800430a728c2216fd1cf1e8daa672f50dfacba|' requirements-py311.txt \
    && pip install --no-cache-dir pip==24.0 wheel \
    && pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu torch==2.5.1+cpu torchaudio==2.5.1+cpu \
    && pip install --no-cache-dir -r requirements-py311.txt

FROM runtime AS with-rvc
USER root
COPY --from=rvc-dependencies /usr/local /usr/local
COPY --from=rvc-dependencies --chown=bot:bot /opt/rvc /opt/rvc
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* && ldconfig
ENV RVC_PYTHON=/usr/local/bin/python RVC_ROOT=/opt/rvc RVC_ASSETS=/app/rvc-assets \
    OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
USER bot
