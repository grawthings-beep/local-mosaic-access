# RunPod Auto Mosaic Setup

This project can run in two parts:

1. Cloudflare Worker: authentication, static UI, and `/api/mosaic` proxy.
2. RunPod API: GPU-backed automatic detection and mosaic rendering.

## RunPod Pod

Create a GPU Pod with:

- Image: a PyTorch/CUDA image, or build this repo's `api/Dockerfile`.
- HTTP port: `8000`
- Volume: attach a Network Volume at `/workspace` if possible.

Quick start inside the Pod:

```bash
cd /workspace
git clone https://github.com/grawthings-beep/local-mosaic-access.git
cd local-mosaic-access/api
export MOSAIC_API_TOKEN="make-a-long-random-token"
bash scripts/start_runpod.sh
```

Open:

```text
https://<runpod-public-url>/health
```

It should return JSON with `ok: true`.

## Cloudflare Worker Variables

In Cloudflare Dashboard:

`Workers & Pages` > `local-mosaic-access` > `Settings` > `Variables and Secrets`

Add:

- `MOSAIC_API_URL`: RunPod public HTTP URL, for example `https://xxxx-8000.proxy.runpod.net`
- `MOSAIC_API_TOKEN`: the same token used on RunPod

Then redeploy the Worker.

## Browser Flow

1. Open the Cloudflare Access protected app.
2. Open an image.
3. Press `GPU自動`.
4. The browser sends the image to Cloudflare, Cloudflare forwards it to RunPod,
   and RunPod returns the mosaiced PNG.

Cloudflare sees the request as part of the protected Worker. The browser never
sees the RunPod token.

## Model Cache

The startup script stores models under:

```text
/workspace/models
```

If `/workspace` is a Network Volume, the next Pod start reuses the downloaded
models and avoids the long first download.
