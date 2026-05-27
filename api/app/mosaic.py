from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from PIL import Image, ImageFilter


@dataclass(frozen=True)
class Detection:
    box: tuple[int, int, int, int]
    label: str
    score: float
    engine: str


def clamp_box(box: tuple[int, int, int, int], width: int, height: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = box
    x0 = max(0, min(width, int(round(x0))))
    y0 = max(0, min(height, int(round(y0))))
    x1 = max(0, min(width, int(round(x1))))
    y1 = max(0, min(height, int(round(y1))))
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    return x0, y0, x1, y1


def expand_box(
    box: tuple[int, int, int, int],
    width: int,
    height: int,
    padding: float,
) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = box
    bw = max(1, x1 - x0)
    bh = max(1, y1 - y0)
    dx = bw * padding
    dy = bh * padding
    return clamp_box((x0 - dx, y0 - dy, x1 + dx, y1 + dy), width, height)


def box_iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0 = max(ax0, bx0)
    iy0 = max(ay0, by0)
    ix1 = min(ax1, bx1)
    iy1 = min(ay1, by1)
    inter = max(0, ix1 - ix0) * max(0, iy1 - iy0)
    area_a = max(0, ax1 - ax0) * max(0, ay1 - ay0)
    area_b = max(0, bx1 - bx0) * max(0, by1 - by0)
    union = area_a + area_b - inter
    return 0.0 if union <= 0 else inter / union


def merge_detections(
    detections: Iterable[Detection],
    width: int,
    height: int,
    iou_threshold: float = 0.45,
) -> list[Detection]:
    normalized = [
        Detection(clamp_box(det.box, width, height), det.label, float(det.score), det.engine)
        for det in detections
    ]
    normalized = [
        det for det in normalized if det.box[2] - det.box[0] >= 4 and det.box[3] - det.box[1] >= 4
    ]
    normalized.sort(key=lambda det: det.score, reverse=True)

    kept: list[Detection] = []
    for det in normalized:
        if any(box_iou(det.box, existing.box) > iou_threshold for existing in kept):
            continue
        kept.append(det)
    return kept


def apply_mosaic(
    image: Image.Image,
    detections: Iterable[Detection],
    block_size: int,
    padding: float,
    blur_edges: bool = True,
) -> Image.Image:
    width, height = image.size
    output = image.convert("RGBA") if image.mode == "RGBA" else image.convert("RGB")
    block_size = max(4, min(96, int(block_size)))

    for det in detections:
        x0, y0, x1, y1 = expand_box(det.box, width, height, padding)
        if x1 - x0 < 2 or y1 - y0 < 2:
            continue

        crop = output.crop((x0, y0, x1, y1))
        tiny_size = (
            max(1, (x1 - x0) // block_size),
            max(1, (y1 - y0) // block_size),
        )
        tiny = crop.resize(tiny_size, Image.Resampling.BILINEAR)
        mosaic = tiny.resize(crop.size, Image.Resampling.NEAREST)

        if blur_edges and crop.size[0] > 8 and crop.size[1] > 8:
            mask = Image.new("L", crop.size, 255)
            mask = mask.filter(ImageFilter.GaussianBlur(radius=max(1, block_size // 8)))
            output.paste(mosaic, (x0, y0), mask)
        else:
            output.paste(mosaic, (x0, y0))

    return output


def detections_to_json(detections: Iterable[Detection]) -> list[dict[str, object]]:
    return [
        {
            "box": list(det.box),
            "label": det.label,
            "score": round(float(det.score), 5),
            "engine": det.engine,
        }
        for det in detections
    ]
