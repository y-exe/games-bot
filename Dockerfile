FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/app/state

WORKDIR /app

COPY requirements.txt ./
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -r requirements.txt

# RVCは音声変換時の子プロセスとしてのみ起動する。常駐時にTorchやモデルはロードしない。
RUN git clone https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI.git /opt/rvc \
    && cd /opt/rvc && git checkout 7ef19867780cf703841ebafb565a4e47d1ea86ff \
    && sed -i 's/onnxruntime-gpu/onnxruntime/' requirements-py311.txt \
    && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.5.1+cpu torchaudio==2.5.1+cpu \
    && pip install --no-cache-dir -r requirements-py311.txt

COPY . ./
RUN useradd --create-home --uid 10001 bot \
    && mkdir -p /app/state \
    && chown -R bot:bot /app

USER bot

CMD ["python", "main.py"]
