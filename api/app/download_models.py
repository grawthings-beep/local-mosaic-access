from __future__ import annotations

import os
from pathlib import Path

import requests
from PIL import Image


NUDENET_640M_URL = "https://github.com/notAI-tech/NudeNet/releases/download/v3.4-weights/640m.onnx"


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
    from imgutils.detect import detect_censors

    image = Image.new("RGB", (128, 128), (255, 255, 255))
    detect_censors(image, level=os.getenv("ANIME_CENSOR_LEVEL", "s"), conf_threshold=0.99)


def main() -> None:
    download_nudenet_640m()
    warm_anime_censor_model()


if __name__ == "__main__":
    main()
