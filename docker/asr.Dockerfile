# Custom asr image that runs the onerahmet base with multiple uvicorn
# workers. The upstream CLI (`whisper-asr-webservice`) doesn't expose
# `--workers`, so we replace the entrypoint to call uvicorn directly.
#
# Notes:
# - The Whisper model is NOT pre-baked. It still downloads on first
#   container start, into the asr_models volume.
# - Each worker process loads the model into RAM independently. With
#   `small` (~1 GB FP32) and 2 workers, peak is ~3 GB; with `large-v3`
#   (~6 GB FP32) and 2 workers, ~14 GB. Tune `ASR_MEMORY_LIMIT` to match.
# - Set UVICORN_WORKERS at container runtime (defaults to 2).
FROM onerahmet/openai-whisper-asr-webservice:latest

USER root

# Pre-create writable dirs for the unprivileged user (uid 1000) so
# matplotlib / huggingface_hub can write their caches / config.
RUN mkdir -p /home/app/.cache /home/app/.config/matplotlib \
    && chown -R 1000:1000 /home/app
ENV HOME=/home/app
ENV MPLCONFIGDIR=/home/app/.config/matplotlib
ENV XDG_CACHE_HOME=/home/app/.cache

RUN cat > /app/start.sh <<'EOF'
#!/bin/sh
set -e
WORKERS="${UVICORN_WORKERS:-2}"
HOST="${ASR_HOST:-0.0.0.0}"
PORT="${ASR_PORT:-9000}"
echo "[asr] starting $WORKERS uvicorn workers on $HOST:$PORT"
exec uvicorn app.webservice:app \
  --host "$HOST" \
  --port "$PORT" \
  --workers "$WORKERS" \
  --proxy-headers \
  --forwarded-allow-ips="*" \
  --log-level info
EOF
RUN chmod +x /app/start.sh

USER 1000

ENTRYPOINT ["/app/start.sh"]
CMD []
