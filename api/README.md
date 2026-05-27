# Auto Mosaic API

FastAPI service for server-side automatic mosaic processing.

## Engines

- `anime`: `dghs-imgutils` censor detector for anime/AI illustration censor points.
- `nudenet`: NudeNet detector, preferably with the external `640m.onnx` model.
- `erax`: EraX YOLO11 detector. This is the default engine and is filtered to
  genital classes only.

The service receives one image, detects target regions, expands bounding boxes,
burns pixel mosaic into the image, and returns a PNG. Uploaded bytes are kept in
memory only.

## Endpoints

- `GET /health`
- `POST /mosaic`

Multipart fields:

- `file`: input image
- `engines`: default `anime,nudenet`
- `confidence`: default `0.24`
- `tile_grid`: default `2`
- `block_size`: default `24`
- `padding`: default `0.45`

If `MOSAIC_API_TOKEN` is set, send `Authorization: Bearer <token>`.

## RunPod quick start

Use a GPU pod with an HTTP port exposed on `8000`.

```bash
cd /workspace
git clone https://github.com/grawthings-beep/local-mosaic-access.git
cd local-mosaic-access/api
bash scripts/start_runpod.sh
```

For faster future starts, attach a RunPod Network Volume and keep `/workspace`.
The model cache under `/workspace/models` will be reused.

The startup script creates a virtual environment at `/workspace/local-mosaic-venv`
to avoid conflicts with Debian-managed Python packages in RunPod templates.

## Docker

```bash
cd api
docker build -t local-mosaic-api .
docker run --rm -p 8000:8000 -e MOSAIC_API_TOKEN=change-me local-mosaic-api
```
