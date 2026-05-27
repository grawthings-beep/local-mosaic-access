from __future__ import annotations

import os
import shutil
from pathlib import Path

import requests


NUDENET_640M_URL = "https://github.com/notAI-tech/NudeNet/releases/download/v3.4-weights/640m.onnx"
ERAX_REPO_ID = "erax-ai/EraX-Anti-NSFW-V1.1"
ERAX_MODEL_FILE = "erax-anti-nsfw-yolo11s-v1.1.pt"


def download_erax_model() -> Path:
    model_path = Path(os.getenv("ERAX_MODEL_PATH", f"/workspace/models/erax/{ERAX_MODEL_FILE}"))
    if model_path.exists() and model_path.stat().st_size > 10_000_000:
        print(f"EraX model exists: {model_path}")
        return model_path

    from huggingface_hub import hf_hub_download

    model_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading EraX YOLO model to {model_path}")
    downloaded = hf_hub_download(
        repo_id=os.getenv("ERAX_REPO_ID", ERAX_REPO_ID),
        filename=os.getenv("ERAX_MODEL_FILE", ERAX_MODEL_FILE),
    )
    tmp_path = model_path.with_suffix(".pt.tmp")
    shutil.copyfile(downloaded, tmp_path)
    tmp_path.replace(model_path)
    return model_path


def download_nudenet_640m() -> None:
    model_path = Path(os.getenv("NUDENET_MODEL_PATH", "/models/nudenet/640m.onnx"))
    if model_path.exists() and model_path.stat().st_size > 50_000_000:
        print(f"NudeNet 640m exists: {model_path}")
        return

    model_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading NudeNet 640m to {model_path}")
    with requests.get(NUDENET_640M_URL, stream=True, timeout=120) as response:
        response.raise_for_status()
        tmp_path = model_path.with_suffix(".onnx.tmp")
        with tmp_path.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file.write(chunk)
        tmp_path.replace(model_path)


def warm_anime_censor_model() -> None:
    print("Warming anime censor model cache")
    from PIL import Image
    from imgutils.detect import detect_censors

    image = Image.new("RGB", (128, 128), (255, 255, 255))
    detect_censors(image, level=os.getenv("ANIME_CENSOR_LEVEL", "s"), conf_threshold=0.99)


def main() -> None:
    download_erax_model()
    if os.getenv("DOWNLOAD_NUDENET_640M", "0") == "1":
        download_nudenet_640m()
    if os.getenv("WARM_ANIME_CENSOR", "0") == "1":
        warm_anime_censor_model()


if __name__ == "__main__":
    main()
