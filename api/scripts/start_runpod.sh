#!/usr/bin/env bash
set -euo pipefail

cd /workspace/local-mosaic-access/api

export HF_HOME="${HF_HOME:-/workspace/models/huggingface}"
export NUDENET_MODEL_PATH="${NUDENET_MODEL_PATH:-/workspace/models/nudenet/640m.onnx}"
export ANIME_CENSOR_LEVEL="${ANIME_CENSOR_LEVEL:-s}"
export MAX_UPLOAD_BYTES="${MAX_UPLOAD_BYTES:-25165824}"
export VENV_DIR="${VENV_DIR:-/workspace/local-mosaic-venv}"
export ERAX_MODEL_PATH="${ERAX_MODEL_PATH:-/workspace/models/erax/erax-anti-nsfw-yolo11s-v1.1.pt}"

python -m venv --system-site-packages "$VENV_DIR"
source "$VENV_DIR/bin/activate"

python -m pip install --upgrade pip setuptools wheel
python -m pip install --ignore-installed "pyparsing>=3.2.1"
python -m pip install -r requirements-gpu.txt
python -m app.download_models

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers
