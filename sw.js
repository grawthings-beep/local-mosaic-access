const CACHE_NAME = "local-mosaic-v2";
const ASSETS = [
  "./models/nudenet-320n.onnx",
  "./vendor/onnxruntime-web/ort.wasm.min.js",
  "./vendor/onnxruntime-web/ort-wasm-simd-threaded.mjs",
  "./vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS.map((asset) => new URL(asset, self.location).href)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  const isRuntimeAsset = requestUrl.pathname.includes("/models/") || requestUrl.pathname.includes("/vendor/");
  if (!isRuntimeAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
    )
  );
});
