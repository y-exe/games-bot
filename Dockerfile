FROM oven/bun:1.3.14-debian AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml tsconfig.json ./
RUN bun install --frozen-lockfile
COPY src ./src
RUN bun run build

FROM oven/bun:1.3.14-debian AS runtime
ENV NODE_ENV=production DATA_DIR=/app/state
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 bot && useradd --uid 10001 --gid 10001 --create-home bot \
    && mkdir -p /app/state && chown -R bot:bot /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production
COPY --from=build --chown=bot:bot /app/dist ./dist
COPY --chown=bot:bot assets ./assets
USER bot
RUN bun --no-env-file -e 'import {MediaWorker} from "./dist/services/media.js"; import sharp from "sharp"; const worker=new MediaWorker(); try {const bytes=await worker.run({kind:"text",text:"Bun",square:true}); if((await sharp(bytes).metadata()).format!=="png")throw new Error("画像Workerの起動検証に失敗しました。");} finally {await worker.close();}'
CMD ["bun", "--no-env-file", "dist/index.js"]

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
