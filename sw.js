const CACHE_NAME = "local-mosaic-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./models/nudenet-320n.onnx",
  "./vendor/onnxruntime-web/ort.wasm.min.js",
  "./vendor/onnxruntime-web/ort-wasm-simd-threaded.mjs",
  "./vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map((asset) => new URL(asset, self.location).href)))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
