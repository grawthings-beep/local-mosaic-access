#!/usr/bin/env bash
set -euo pipefail

cd /workspace/local-mosaic-access/api

export HF_HOME="${HF_HOME:-/workspace/models/huggingface}"
export NUDENET_MODEL_PATH="${NUDENET_MODEL_PATH:-/workspace/models/nudenet/640m.onnx}"
export ANIME_CENSOR_LEVEL="${ANIME_CENSOR_LEVEL:-s}"
export MAX_UPLOAD_BYTES="${MAX_UPLOAD_BYTES:-25165824}"

python -m pip install --upgrade pip
python -m pip install -r requirements-gpu.txt
python -m app.download_models

uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers
