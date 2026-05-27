from __future__ import annotations

import io
import json
import os
import time
import base64
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, ImageOps

from .detectors import detect_all
from .mosaic import apply_mosaic, detections_to_json


MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(24 * 1024 * 1024)))

app = FastAPI(title="Local Mosaic Auto API", version="0.1.0")

cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    )


def require_token(
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
) -> None:
    expected = os.getenv("MOSAIC_API_TOKEN", "").strip()
    if not expected:
        return

    bearer = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()
    provided = bearer or (x_api_key or "").strip()
    if provided != expected:
        raise HTTPException(status_code=401, detail="Invalid API token")


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "engines": ["anime", "nudenet"],
        "max_upload_mb": round(MAX_UPLOAD_BYTES / 1024 / 1024, 2),
    }


@app.post("/mosaic", response_model=None)
async def mosaic_endpoint(
    _: Annotated[None, Depends(require_token)],
    file: Annotated[UploadFile, File()],
    engines: Annotated[str, Form()] = "anime,nudenet",
    confidence: Annotated[float, Form()] = 0.24,
    tile_grid: Annotated[int, Form()] = 2,
    block_size: Annotated[int, Form()] = 24,
    padding: Annotated[float, Form()] = 0.45,
    response_format: Annotated[str, Form()] = "image",
):
    started = time.perf_counter()
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload too large")

    try:
        image = Image.open(io.BytesIO(raw))
        image = ImageOps.exif_transpose(image).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unsupported image") from exc

    selected_engines = engines.split(",")
    detections = detect_all(
        image=image,
        engines=selected_engines,
        confidence=max(0.01, min(0.95, float(confidence))),
        tile_grid=max(1, min(4, int(tile_grid))),
    )
    output = apply_mosaic(
        image=image,
        detections=detections,
        block_size=block_size,
        padding=max(0.0, min(2.5, float(padding))),
    )
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    detection_json = detections_to_json(detections)

    if response_format == "json":
        buffer = io.BytesIO()
        output.save(buffer, format="PNG", optimize=True)
        return {
            "ok": True,
            "elapsed_ms": elapsed_ms,
            "detections": detection_json,
            "image_png_base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
        }

    buffer = io.BytesIO()
    output.save(buffer, format="PNG", optimize=True)
    headers = {
        "Cache-Control": "no-store",
        "X-Mosaic-Detections": json.dumps(detection_json, ensure_ascii=True),
        "X-Mosaic-Elapsed-Ms": str(elapsed_ms),
    }
    return Response(content=buffer.getvalue(), media_type="image/png", headers=headers)
