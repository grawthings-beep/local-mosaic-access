from __future__ import annotations

import io
import os
from functools import lru_cache
from typing import Iterable

from PIL import Image

from .mosaic import Detection, clamp_box, merge_detections


NUDENET_TARGET_CLASSES = {
    "FEMALE_GENITALIA_EXPOSED",
    "MALE_GENITALIA_EXPOSED",
    "ANUS_EXPOSED",
}

ANIME_TARGET_CLASSES = {
    "penis",
    "pussy",
}


def detect_all(
    image: Image.Image,
    engines: Iterable[str],
    confidence: float,
    tile_grid: int,
    targets: Iterable[str] | None = None,
) -> list[Detection]:
    width, height = image.size
    selected = {engine.strip().lower() for engine in engines if engine.strip()}
    target_set = _target_set(targets)
    detections: list[Detection] = []

    if "anime" in selected:
        detections.extend(detect_anime_censors(image, confidence, tile_grid, target_set))
    if "nudenet" in selected:
        detections.extend(detect_nudenet(image, confidence, tile_grid, target_set))

    return merge_detections(detections, width, height)


def detect_anime_censors(
    image: Image.Image,
    confidence: float,
    tile_grid: int,
    target_set: set[str],
) -> list[Detection]:
    detector = _load_anime_detector()
    if detector is None:
        return []

    detections: list[Detection] = []
    for crop, offset in _iter_crops(image, tile_grid):
        try:
            results = detector(crop, conf_threshold=confidence)
        except Exception:
            continue

        ox, oy = offset
        for box, label, score in results:
            label = str(label)
            if label not in target_set:
                continue
            x0, y0, x1, y1 = box
            detections.append(
                Detection(
                    box=(x0 + ox, y0 + oy, x1 + ox, y1 + oy),
                    label=label,
                    score=float(score),
                    engine="anime",
                )
            )
    return detections


def detect_nudenet(
    image: Image.Image,
    confidence: float,
    tile_grid: int,
    target_set: set[str],
) -> list[Detection]:
    detector = _load_nudenet_detector()
    if detector is None:
        return []

    detections: list[Detection] = []
    for crop, offset in _iter_crops(image, tile_grid):
        try:
            results = detector.detect(_image_to_jpeg_bytes(crop))
        except Exception:
            continue

        ox, oy = offset
        for item in results:
            label = str(item.get("class", ""))
            score = float(item.get("score", 0.0))
            if label not in target_set or score < confidence:
                continue
            x, y, w, h = item.get("box", [0, 0, 0, 0])
            detections.append(
                Detection(
                    box=(int(x) + ox, int(y) + oy, int(x + w) + ox, int(y + h) + oy),
                    label=label,
                    score=score,
                    engine="nudenet",
                )
            )
    return detections


def _iter_crops(image: Image.Image, tile_grid: int) -> Iterable[tuple[Image.Image, tuple[int, int]]]:
    width, height = image.size
    yield image, (0, 0)

    tile_grid = max(1, min(4, int(tile_grid)))
    if tile_grid <= 1 or max(width, height) < 960:
        return

    overlap = 0.18
    tile_w = width / tile_grid
    tile_h = height / tile_grid
    for ty in range(tile_grid):
        for tx in range(tile_grid):
            x0 = int(max(0, tx * tile_w - tile_w * overlap))
            y0 = int(max(0, ty * tile_h - tile_h * overlap))
            x1 = int(min(width, (tx + 1) * tile_w + tile_w * overlap))
            y1 = int(min(height, (ty + 1) * tile_h + tile_h * overlap))
            box = clamp_box((x0, y0, x1, y1), width, height)
            if box[2] - box[0] < 128 or box[3] - box[1] < 128:
                continue
            yield image.crop(box), (box[0], box[1])


@lru_cache(maxsize=1)
def _load_anime_detector():
    try:
        from imgutils.detect import detect_censors
    except Exception:
        return None

    level = os.getenv("ANIME_CENSOR_LEVEL", "s")

    def run(image: Image.Image, conf_threshold: float):
        return detect_censors(
            image,
            level=level,
            conf_threshold=conf_threshold,
            iou_threshold=float(os.getenv("ANIME_CENSOR_IOU", "0.7")),
        )

    return run


@lru_cache(maxsize=1)
def _load_nudenet_detector():
    try:
        from nudenet import NudeDetector
    except Exception:
        return None

    model_path = os.getenv("NUDENET_MODEL_PATH", "").strip()
    if model_path and os.path.exists(model_path):
        return NudeDetector(model_path=model_path, inference_resolution=640)
    return NudeDetector()


def _image_to_jpeg_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=95)
    return buffer.getvalue()


def _target_classes() -> set[str]:
    override = os.getenv("NUDENET_TARGET_CLASSES", "").strip()
    if not override:
        return NUDENET_TARGET_CLASSES
    return {item.strip() for item in override.split(",") if item.strip()}


def _target_set(targets: Iterable[str] | None) -> set[str]:
    if targets:
        parsed = {target.strip() for target in targets if target.strip()}
        if parsed:
            return parsed

    override = os.getenv("MOSAIC_TARGET_CLASSES", "").strip()
    if override:
        return {item.strip() for item in override.split(",") if item.strip()}

    return ANIME_TARGET_CLASSES | _target_classes()
