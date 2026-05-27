FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/models/huggingface
ENV NUDENET_MODEL_PATH=/models/nudenet/640m.onnx
ENV ANIME_CENSOR_LEVEL=s

COPY requirements-gpu.txt /app/requirements-gpu.txt
RUN python -m pip install --upgrade pip && \
    python -m pip install --no-cache-dir -r /app/requirements-gpu.txt

COPY app /app/app
RUN python -m app.download_models

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
