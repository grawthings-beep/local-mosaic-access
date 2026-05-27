const BASE_URL = new URL("./", document.baseURI);
const DEFAULT_MODEL_PATH = new URL("models/nudenet-320n.onnx", BASE_URL).href;
const DEFAULT_MODEL_NAME = "NudeNet 320n";
const TARGET_CLASS_IDS = [2, 3, 4, 6, 14];

const state = {
  sourceCanvas: document.createElement("canvas"),
  sourceCtx: null,
  fileName: "local-mosaic.png",
  masks: [],
  selectedId: null,
  drag: null,
  nextId: 1,
  detecting: false,
  serverProcessing: false,
  onnx: {
    runtimeReady: false,
    session: null,
    modelName: "",
  },
};

state.sourceCtx = state.sourceCanvas.getContext("2d", { willReadFrequently: true });

const els = {
  fileInput: document.getElementById("fileInput"),
  modelInput: document.getElementById("modelInput"),
  openButton: document.getElementById("openButton"),
  demoButton: document.getElementById("demoButton"),
  modelButton: document.getElementById("modelButton"),
  autoButton: document.getElementById("autoButton"),
  serverButton: document.getElementById("serverButton"),
  deleteButton: document.getElementById("deleteButton"),
  clearButton: document.getElementById("clearButton"),
  downloadButton: document.getElementById("downloadButton"),
  presetSelect: document.getElementById("presetSelect"),
  modelFormatSelect: document.getElementById("modelFormatSelect"),
  onnxSizeSelect: document.getElementById("onnxSizeSelect"),
  thresholdRange: document.getElementById("thresholdRange"),
  thresholdValue: document.getElementById("thresholdValue"),
  blockRange: document.getElementById("blockRange"),
  autoAfterLoad: document.getElementById("autoAfterLoad"),
  widePadding: document.getElementById("widePadding"),
  statusText: document.getElementById("statusText"),
  onnxStatus: document.getElementById("onnxStatus"),
  dropZone: document.getElementById("dropZone"),
  emptyState: document.getElementById("emptyState"),
  maskList: document.getElementById("maskList"),
  imageCanvas: document.getElementById("imageCanvas"),
  overlayCanvas: document.getElementById("overlayCanvas"),
};

const imageCtx = els.imageCanvas.getContext("2d", { willReadFrequently: true });
const overlayCtx = els.overlayCanvas.getContext("2d");

setupOnnxRuntime();
updateThresholdValue();
updateOnnxStatus();
autoLoadDefaultModel();
cleanupServiceWorker();

els.openButton.addEventListener("click", () => els.fileInput.click());
els.demoButton.addEventListener("click", loadDemoImage);
els.modelButton.addEventListener("click", () => {
  if (!state.onnx.runtimeReady) {
    setStatus("ONNX Runtimeを読み込めません");
    return;
  }
  els.modelInput.value = "";
  els.modelInput.click();
});
els.fileInput.addEventListener("change", () => {
  const file = els.fileInput.files?.[0];
  if (file) loadFile(file);
});
els.modelInput.addEventListener("change", () => {
  const file = els.modelInput.files?.[0];
  if (file) loadOnnxModel(file);
});
els.autoButton.addEventListener("click", runAutoDetect);
els.serverButton.addEventListener("click", runServerMosaic);
els.deleteButton.addEventListener("click", deleteSelectedMask);
els.clearButton.addEventListener("click", clearMasks);
els.downloadButton.addEventListener("click", downloadImage);
els.blockRange.addEventListener("input", drawAll);
els.thresholdRange.addEventListener("input", () => {
  updateThresholdValue();
  if (hasImage() && state.onnx.session) runAutoDetect();
});
els.modelFormatSelect.addEventListener("change", () => {
  if (hasImage() && state.onnx.session) runAutoDetect();
});
els.onnxSizeSelect.addEventListener("change", () => {
  if (hasImage() && state.onnx.session) runAutoDetect();
});
els.widePadding.addEventListener("change", () => {
  if (hasImage()) runAutoDetect();
});
els.presetSelect.addEventListener("change", () => {
  if (hasImage()) runAutoDetect();
});

els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("dragging");
});
els.dropZone.addEventListener("dragleave", () => {
  els.dropZone.classList.remove("dragging");
});
els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("dragging");
  const file = event.dataTransfer?.files?.[0];
  if (file?.type.startsWith("image/")) loadFile(file);
});

els.overlayCanvas.addEventListener("pointerdown", onPointerDown);
els.overlayCanvas.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("keydown", (event) => {
  if (event.key === "Delete" || event.key === "Backspace") {
    if (state.selectedId) {
      event.preventDefault();
      deleteSelectedMask();
    }
  }
});

function setupOnnxRuntime() {
  if (!window.ort) return;
  if (window.ort.env?.wasm) {
    window.ort.env.wasm.wasmPaths = new URL("vendor/onnxruntime-web/", BASE_URL).href;
    window.ort.env.wasm.numThreads = 1;
  }
  state.onnx.runtimeReady = true;
}

function cleanupServiceWorker() {
  window.addEventListener("load", () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch((error) => console.warn(error));
    }
    if ("caches" in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith("local-mosaic")).map((key) => caches.delete(key))))
        .catch((error) => console.warn(error));
    }
  });
}

function updateOnnxStatus() {
  if (!els.onnxStatus) return;
  if (!state.onnx.runtimeReady) {
    els.onnxStatus.textContent = "ONNX Runtimeなし";
    els.modelButton.disabled = true;
    return;
  }
  els.modelButton.disabled = false;
  els.onnxStatus.textContent = state.onnx.session
    ? `ONNX: ${state.onnx.modelName}`
    : "ONNX未読込";
}

function updateThresholdValue() {
  els.thresholdValue.textContent = getThreshold().toFixed(2);
}

function hasImage() {
  return state.sourceCanvas.width > 0 && state.sourceCanvas.height > 0;
}

async function loadFile(file) {
  setStatus("画像を読み込み中");
  const bitmap = await createImageBitmap(file);
  loadBitmap(bitmap, file.name.replace(/\.[^.]+$/, "") || "local-mosaic");
}

async function loadOnnxModel(file) {
  if (!state.onnx.runtimeReady) return;
  setStatus("ONNXモデルを読み込み中");
  setEnabled(false);
  try {
    const buffer = await file.arrayBuffer();
    await installOnnxSession(buffer, file.name);
    setStatus("ONNXモデル読込完了");
    if (hasImage()) await runAutoDetect();
  } catch (error) {
    console.error(error);
    state.onnx.session = null;
    state.onnx.modelName = "";
    updateOnnxStatus();
    setStatus("ONNXモデル読込失敗");
  } finally {
    setEnabled(hasImage());
  }
}

async function autoLoadDefaultModel() {
  if (!state.onnx.runtimeReady || state.onnx.session) return;
  try {
    setStatus("内蔵ONNXモデルを読み込み中");
    const buffer = await loadArrayBuffer(DEFAULT_MODEL_PATH);
    await installOnnxSession(buffer, DEFAULT_MODEL_NAME);
    setStatus("ONNXモデル読込完了");
  } catch (error) {
    console.warn(error);
    state.onnx.session = null;
    state.onnx.modelName = "";
    updateOnnxStatus();
    setStatus(`ONNX自動読込失敗: ${error.message || error}`);
  }
}

function loadArrayBuffer(url) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.response);
      } else {
        reject(new Error(`Model request failed: ${request.status}`));
      }
    };
    request.onerror = () => reject(new Error("Model request failed"));
    request.send();
  });
}

async function installOnnxSession(buffer, name) {
  const session = await window.ort.InferenceSession.create(buffer, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  state.onnx.session = session;
  state.onnx.modelName = name;
  updateOnnxStatus();
}

function loadBitmap(bitmap, name, options = {}) {
  const maxSide = 4200;
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));

  state.sourceCanvas.width = width;
  state.sourceCanvas.height = height;
  state.sourceCtx.clearRect(0, 0, width, height);
  state.sourceCtx.drawImage(bitmap, 0, 0, width, height);

  els.imageCanvas.width = width;
  els.imageCanvas.height = height;
  els.overlayCanvas.width = width;
  els.overlayCanvas.height = height;
  state.fileName = `${name}_mosaic.png`;
  state.masks = [];
  state.selectedId = null;

  els.dropZone.classList.add("has-image");
  els.emptyState.style.display = "none";
  setEnabled(true);
  if (els.autoAfterLoad.checked && !options.skipAutoDetect) {
    runAutoDetect();
  } else {
    drawAll();
    setStatus(`${width} x ${height}`);
  }
}

function setEnabled(enabled) {
  const busy = state.detecting || state.serverProcessing;
  els.autoButton.disabled = !enabled || busy;
  els.serverButton.disabled = !enabled || busy;
  els.downloadButton.disabled = !enabled || busy;
  els.clearButton.disabled = !enabled || state.masks.length === 0 || busy;
  els.deleteButton.disabled = !enabled || !state.selectedId || busy;
}

function setStatus(text) {
  els.statusText.textContent = text;
}

async function runAutoDetect() {
  if (!hasImage() || state.detecting) return;
  state.detecting = true;
  setEnabled(false);
  setStatus(state.onnx.session ? "ONNX検出中" : "自動検出中");

  try {
    await nextFrame();
    let candidates;
    if (state.onnx.session) {
      const onnxBoxes = await detectWithOnnx();
      const fallbackBoxes = detectSensitiveCandidates();
      candidates = mergeCandidateSources(
        onnxBoxes.map((box) => ({ box, source: "onnx" })),
        fallbackBoxes.map((box) => ({ box, source: "auto" })),
        onnxBoxes.length === 0 ? 0.1 : 0.35,
      );
    } else {
      candidates = detectSensitiveCandidates().map((box) => ({ box, source: "auto" }));
    }
    state.masks = candidates.map((candidate) => createMask(candidate.box, candidate.source));
    state.selectedId = state.masks[0]?.id ?? null;
    drawAll();
    setStatus(`${state.masks.length} 件の候補`);
  } catch (error) {
    console.error(error);
    const boxes = detectSensitiveCandidates();
    state.masks = boxes.map((box) => createMask(box, "auto"));
    state.selectedId = state.masks[0]?.id ?? null;
    drawAll();
    setStatus(`ONNX失敗: ${state.masks.length} 件の簡易候補`);
  } finally {
    state.detecting = false;
    setEnabled(true);
  }
}

async function runServerMosaic() {
  if (!hasImage() || state.serverProcessing) return;
  state.serverProcessing = true;
  setEnabled(false);
  setStatus("GPU自動モザイク中");

  try {
    const inputBlob = await canvasToBlob(state.sourceCanvas, "image/png");
    const form = new FormData();
    form.append("file", inputBlob, state.fileName || "local-mosaic.png");
    form.append("engines", "anime,nudenet");
    form.append("confidence", String(Math.max(0.12, getThreshold())));
    form.append("tile_grid", "2");
    form.append("block_size", String(Math.max(16, Number(els.blockRange.value) || 28)));
    form.append("padding", els.presetSelect.value === "wide" ? "0.72" : els.presetSelect.value === "strict" ? "0.56" : "0.45");

    const response = await fetch(new URL("api/mosaic", BASE_URL), {
      method: "POST",
      body: form,
      cache: "no-store",
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `HTTP ${response.status}`);
    }

    const detections = parseDetectionsHeader(response.headers.get("X-Mosaic-Detections"));
    const outputBlob = await response.blob();
    const bitmap = await createImageBitmap(outputBlob);
    const baseName = (state.fileName || "local-mosaic.png")
      .replace(/_mosaic\.png$/i, "")
      .replace(/\.[^.]+$/i, "");
    loadBitmap(bitmap, baseName || "local-mosaic", { skipAutoDetect: true });
    setStatus(`GPU自動モザイク完了: ${detections.length} 件`);
  } catch (error) {
    console.error(error);
    setStatus(`GPU自動モザイク失敗: ${error.message || error}`);
  } finally {
    state.serverProcessing = false;
    setEnabled(hasImage());
  }
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("画像変換失敗"));
    }, type);
  });
}

function parseDetectionsHeader(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function mergeCandidateSources(primary, fallback, maxOverlap) {
  const candidates = [...primary];
  for (const candidate of fallback) {
    const overlaps = candidates.some((existing) => boxIou(existing.box, candidate.box) > maxOverlap);
    if (!overlaps) candidates.push(candidate);
  }
  return candidates
    .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)
    .slice(0, 64);
}

function createMask(box, source = "manual") {
  return {
    id: state.nextId++,
    source,
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.round(box.w),
    h: Math.round(box.h),
  };
}

function drawAll() {
  if (!hasImage()) return;
  const { width, height } = state.sourceCanvas;
  imageCtx.clearRect(0, 0, width, height);
  imageCtx.drawImage(state.sourceCanvas, 0, 0);
  for (const mask of state.masks) {
    applyMosaic(imageCtx, mask, Number(els.blockRange.value));
  }
  drawOverlay();
  renderMaskList();
  setEnabled(true);
}

function applyMosaic(ctx, mask, blockSize) {
  const rect = clampRect(mask);
  if (rect.w < 2 || rect.h < 2) return;
  const step = Math.max(6, Math.min(blockSize, Math.floor(Math.min(rect.w, rect.h) / 2) || blockSize));
  const tiny = document.createElement("canvas");
  tiny.width = Math.max(1, Math.ceil(rect.w / step));
  tiny.height = Math.max(1, Math.ceil(rect.h / step));
  const tinyCtx = tiny.getContext("2d");
  tinyCtx.imageSmoothingEnabled = true;
  tinyCtx.drawImage(
    state.sourceCanvas,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    0,
    0,
    tiny.width,
    tiny.height,
  );
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

function drawOverlay() {
  const { width, height } = els.overlayCanvas;
  overlayCtx.clearRect(0, 0, width, height);

  for (const mask of state.masks) {
    const active = mask.id === state.selectedId;
    overlayCtx.save();
    overlayCtx.lineWidth = active ? 3 : 2;
    overlayCtx.strokeStyle = active ? "#0f766e" : "rgba(15, 118, 110, 0.75)";
    overlayCtx.fillStyle = active ? "rgba(15, 118, 110, 0.13)" : "rgba(15, 118, 110, 0.08)";
    overlayCtx.fillRect(mask.x, mask.y, mask.w, mask.h);
    overlayCtx.strokeRect(mask.x, mask.y, mask.w, mask.h);
    if (active) drawHandles(mask);
    overlayCtx.restore();
  }
}

function drawHandles(mask) {
  const handles = getHandles(mask);
  overlayCtx.fillStyle = "#ffffff";
  overlayCtx.strokeStyle = "#0f766e";
  overlayCtx.lineWidth = 2;
  for (const handle of handles) {
    overlayCtx.beginPath();
    overlayCtx.rect(handle.x - 5, handle.y - 5, 10, 10);
    overlayCtx.fill();
    overlayCtx.stroke();
  }
}

function renderMaskList() {
  els.maskList.innerHTML = "";
  if (state.masks.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "マスクなし";
    els.maskList.appendChild(empty);
    return;
  }
  for (const [index, mask] of state.masks.entries()) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `mask-item${mask.id === state.selectedId ? " active" : ""}`;
    item.innerHTML = `<span>${index + 1}. ${maskLabel(mask.source)}</span><small>${mask.w} x ${mask.h}</small>`;
    item.addEventListener("click", () => {
      state.selectedId = mask.id;
      drawAll();
    });
    els.maskList.appendChild(item);
  }
}

function maskLabel(source) {
  if (source === "onnx") return "ONNX";
  if (source === "auto") return "自動";
  return "手動";
}

async function detectWithOnnx() {
  const session = state.onnx.session;
  const inputSize = Number(els.onnxSizeSelect.value || 640);
  const inputName = session.inputNames?.[0];
  if (!inputName) throw new Error("ONNX input not found");

  const prepared = createYoloInputTensor(inputSize);
  const results = await session.run({ [inputName]: prepared.tensor });
  const outputName = session.outputNames?.[0] || Object.keys(results)[0];
  const output = results[outputName];
  if (!output) throw new Error("ONNX output not found");

  const detections = decodeYoloOutput(output, prepared);
  return nmsDetections(detections, getIouThreshold())
    .slice(0, 64)
    .map((det) => expandDetectionBox(det.box));
}

function createYoloInputTensor(inputSize) {
  const canvas = document.createElement("canvas");
  canvas.width = inputSize;
  canvas.height = inputSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const scale = Math.min(inputSize / state.sourceCanvas.width, inputSize / state.sourceCanvas.height);
  const scaledW = Math.round(state.sourceCanvas.width * scale);
  const scaledH = Math.round(state.sourceCanvas.height * scale);
  const dx = Math.floor((inputSize - scaledW) / 2);
  const dy = Math.floor((inputSize - scaledH) / 2);

  ctx.fillStyle = "rgb(114, 114, 114)";
  ctx.fillRect(0, 0, inputSize, inputSize);
  ctx.drawImage(state.sourceCanvas, 0, 0, state.sourceCanvas.width, state.sourceCanvas.height, dx, dy, scaledW, scaledH);

  const image = ctx.getImageData(0, 0, inputSize, inputSize);
  const data = image.data;
  const plane = inputSize * inputSize;
  const input = new Float32Array(plane * 3);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    input[p] = data[i] / 255;
    input[plane + p] = data[i + 1] / 255;
    input[plane * 2 + p] = data[i + 2] / 255;
  }

  return {
    tensor: new window.ort.Tensor("float32", input, [1, 3, inputSize, inputSize]),
    inputSize,
    scale,
    dx,
    dy,
  };
}

function decodeYoloOutput(output, prepared) {
  const layout = getDetectionLayout(output.dims);
  if (!layout) throw new Error(`Unsupported output shape: ${output.dims.join("x")}`);

  const data = output.data;
  const detections = [];
  const threshold = getThreshold();
  const format = els.modelFormatSelect.value;

  for (let row = 0; row < layout.rows; row++) {
    const values = readDetectionRow(data, layout, row);
    if (!values || values.length < 5) continue;

    const scored = scoreDetection(values, format);
    if (!scored || scored.score < threshold) continue;
    if (TARGET_CLASS_IDS && !TARGET_CLASS_IDS.includes(scored.classId)) continue;

    const box = detectionBoxToSource(values, scored.boxMode, prepared);
    if (!box || box.w < 4 || box.h < 4) continue;
    detections.push({ box, score: scored.score, classId: scored.classId });
  }

  return detections;
}

function getDetectionLayout(dims) {
  const squeezed = dims.map(Number).filter((dim, index) => !(index === 0 && dim === 1));
  if (squeezed.length === 2) {
    const [a, b] = squeezed;
    if (b >= 5) return { rows: a, attrs: b, mode: "row" };
    if (a >= 5) return { rows: b, attrs: a, mode: "column" };
  }
  if (squeezed.length === 3) {
    const [a, b, c] = squeezed;
    if (c >= 5) return { rows: a * b, attrs: c, mode: "row" };
    if (b >= 5) return { rows: a * c, attrs: b, mode: "column" };
  }
  return null;
}

function readDetectionRow(data, layout, row) {
  const values = new Array(layout.attrs);
  if (layout.mode === "row") {
    const offset = row * layout.attrs;
    for (let attr = 0; attr < layout.attrs; attr++) values[attr] = Number(data[offset + attr]);
  } else {
    for (let attr = 0; attr < layout.attrs; attr++) values[attr] = Number(data[attr * layout.rows + row]);
  }
  return values.every(Number.isFinite) ? values : null;
}

function scoreDetection(values, format) {
  if (format === "xyxy") {
    return {
      score: values[4],
      classId: Math.round(values[5] || 0),
      boxMode: "xyxy",
    };
  }

  if (format === "yolov5") {
    const objectness = values[4];
    const classScores = values.slice(5);
    const best = bestClassScore(classScores);
    return {
      score: objectness * best.score,
      classId: best.classId,
      boxMode: "xywh",
    };
  }

  if (values.length === 5) {
    return { score: values[4], classId: 0, boxMode: "xywh" };
  }

  if (values.length === 6 && (format === "auto" || format === "xyxy")) {
    const looksLikeXYXY = values[2] > values[0] && values[3] > values[1];
    return {
      score: values[4],
      classId: Math.round(values[5] || 0),
      boxMode: looksLikeXYXY ? "xyxy" : "xywh",
    };
  }

  const best = bestClassScore(values.slice(4));
  return {
    score: best.score,
    classId: best.classId,
    boxMode: "xywh",
  };
}

function bestClassScore(scores) {
  let classId = 0;
  let score = 0;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > score) {
      score = scores[i];
      classId = i;
    }
  }
  return { classId, score };
}

function detectionBoxToSource(values, boxMode, prepared) {
  let x1;
  let y1;
  let x2;
  let y2;
  const inputSize = prepared.inputSize;
  const normalized = Math.max(Math.abs(values[0]), Math.abs(values[1]), Math.abs(values[2]), Math.abs(values[3])) <= 2;
  const scaleCoord = normalized ? inputSize : 1;

  if (boxMode === "xyxy") {
    x1 = values[0] * scaleCoord;
    y1 = values[1] * scaleCoord;
    x2 = values[2] * scaleCoord;
    y2 = values[3] * scaleCoord;
  } else {
    const cx = values[0] * scaleCoord;
    const cy = values[1] * scaleCoord;
    const w = values[2] * scaleCoord;
    const h = values[3] * scaleCoord;
    x1 = cx - w / 2;
    y1 = cy - h / 2;
    x2 = cx + w / 2;
    y2 = cy + h / 2;
  }

  x1 = (x1 - prepared.dx) / prepared.scale;
  y1 = (y1 - prepared.dy) / prepared.scale;
  x2 = (x2 - prepared.dx) / prepared.scale;
  y2 = (y2 - prepared.dy) / prepared.scale;

  const box = clampPlainBox({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  });
  return box.w > 0 && box.h > 0 ? box : null;
}

function expandDetectionBox(box) {
  const preset = els.presetSelect.value;
  let factor = preset === "wide" ? 1.5 : preset === "strict" ? 1.32 : 1.18;
  if (els.widePadding.checked) factor *= 1.12;
  return scaleAroundCenter(box, factor);
}

function scaleAroundCenter(box, factor) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const w = box.w * factor;
  const h = box.h * factor;
  return clampPlainBox({ x: cx - w / 2, y: cy - h / 2, w, h });
}

function nmsDetections(detections, threshold) {
  const kept = [];
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  while (sorted.length > 0) {
    const current = sorted.shift();
    kept.push(current);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (boxIou(current.box, sorted[i].box) > threshold) sorted.splice(i, 1);
    }
  }
  return kept;
}

function boxIou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

function getThreshold() {
  return Number(els.thresholdRange.value) / 100;
}

function getIouThreshold() {
  return 0.45;
}

function detectSensitiveCandidates() {
  const originalW = state.sourceCanvas.width;
  const originalH = state.sourceCanvas.height;
  const maxAnalyze = 560;
  const scale = Math.min(1, maxAnalyze / Math.max(originalW, originalH));
  const w = Math.max(1, Math.round(originalW * scale));
  const h = Math.max(1, Math.round(originalH * scale));
  const sample = document.createElement("canvas");
  sample.width = w;
  sample.height = h;
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(state.sourceCanvas, 0, 0, w, h);
  const image = sampleCtx.getImageData(0, 0, w, h);
  const pixels = image.data;
  const skin = new Uint8Array(w * h);
  const warm = new Uint8Array(w * h);

  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a < 32) continue;
    if (isSkinPixel(r, g, b)) skin[p] = 1;
    if (isWarmDetailPixel(r, g, b)) warm[p] = 1;
  }

  const preset = els.presetSelect.value;
  const paddingBoost = els.widePadding.checked ? 1.25 : 1;
  const skinComponents = connectedComponents(skin, w, h, Math.max(28, Math.floor(w * h * 0.002)));
  const warmComponents = connectedComponents(warm, w, h, Math.max(8, Math.floor(w * h * 0.00012)));
  const boxes = [];

  for (const comp of skinComponents) {
    const bw = comp.maxX - comp.minX + 1;
    const bh = comp.maxY - comp.minY + 1;
    const areaRatio = comp.count / (w * h);
    if (areaRatio < 0.004 || bw < w * 0.06 || bh < h * 0.08) continue;

    const lowerY = comp.minY + bh * 0.58;
    const centerX = comp.minX + bw * 0.5;
    let boxW = bw * 0.34;
    let boxH = bh * 0.18;
    let boxY = lowerY - boxH * 0.35;

    if (preset === "strict") {
      boxW = bw * 0.43;
      boxH = bh * 0.24;
      boxY = lowerY - boxH * 0.42;
    } else if (preset === "wide") {
      boxW = bw * 0.56;
      boxH = bh * 0.32;
      boxY = lowerY - boxH * 0.45;
    }

    boxes.push(scaleBox({ x: centerX - boxW / 2, y: boxY, w: boxW, h: boxH }, 1 / scale, paddingBoost));

    if (preset !== "balanced" && bh > h * 0.24) {
      const upperH = bh * (preset === "wide" ? 0.18 : 0.13);
      boxes.push(
        scaleBox(
          {
            x: comp.minX + bw * 0.26,
            y: comp.minY + bh * 0.30,
            w: bw * 0.48,
            h: upperH,
          },
          1 / scale,
          paddingBoost * 0.9,
        ),
      );
    }
  }

  for (const comp of warmComponents) {
    const bw = comp.maxX - comp.minX + 1;
    const bh = comp.maxY - comp.minY + 1;
    if (bw > w * 0.55 || bh > h * 0.55) continue;
    if (comp.count < 10 || bw < 2 || bh < 2) continue;
    const pad = preset === "wide" ? 3.4 : preset === "strict" ? 2.8 : 2.2;
    boxes.push(
      scaleBox(
        {
          x: comp.minX,
          y: comp.minY,
          w: bw,
          h: bh,
        },
        1 / scale,
        pad,
      ),
    );
  }

  const merged = mergeBoxes(boxes.map(clampPlainBox), originalW, originalH);
  return merged
    .filter((box) => box.w >= 10 && box.h >= 10)
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .slice(0, 32);
}

function isSkinPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma < 45 || luma > 248 || delta < 8) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const hue = rgbHue(r, g, b);
  const sat = max === 0 ? 0 : delta / max;
  const ycbcrSkin = cb >= 72 && cb <= 142 && cr >= 128 && cr <= 188;
  const hueSkin = (hue <= 54 || hue >= 342) && sat >= 0.08 && sat <= 0.78;
  const animeSkin = r > 112 && g > 72 && b > 55 && r >= g * 0.95 && g >= b * 0.78 && hue <= 65;
  return (ycbcrSkin && hueSkin) || animeSkin;
}

function isWarmDetailPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const hue = rgbHue(r, g, b);
  const redPink = hue <= 24 || hue >= 334;
  const magenta = hue >= 300 && hue <= 334 && r > 130;
  return max > 105 && sat > 0.22 && r > g * 1.06 && r > b * 0.92 && (redPink || magenta);
}

function rgbHue(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let hue;
  if (max === rn) hue = ((gn - bn) / d) % 6;
  else if (max === gn) hue = (bn - rn) / d + 2;
  else hue = (rn - gn) / d + 4;
  return (hue * 60 + 360) % 360;
}

function connectedComponents(mask, w, h, minCount) {
  const seen = new Uint8Array(mask.length);
  const components = [];
  const queue = new Int32Array(mask.length);
  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    let count = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;

    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = Math.floor(p / w);
      count++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx;
        if (mask[np] && !seen[np]) {
          seen[np] = 1;
          queue[tail++] = np;
        }
      }
    }

    if (count >= minCount) {
      components.push({ count, minX, minY, maxX, maxY });
    }
  }
  return components;
}

function scaleBox(box, multiplier, padFactor) {
  const cx = (box.x + box.w / 2) * multiplier;
  const cy = (box.y + box.h / 2) * multiplier;
  const w = Math.max(14, box.w * multiplier * padFactor);
  const h = Math.max(14, box.h * multiplier * padFactor);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function clampPlainBox(box) {
  const maxW = state.sourceCanvas.width;
  const maxH = state.sourceCanvas.height;
  const x = Math.max(0, Math.min(maxW - 1, box.x));
  const y = Math.max(0, Math.min(maxH - 1, box.y));
  const right = Math.max(x + 1, Math.min(maxW, box.x + box.w));
  const bottom = Math.max(y + 1, Math.min(maxH, box.y + box.h));
  return { x, y, w: right - x, h: bottom - y };
}

function mergeBoxes(boxes, imageW, imageH) {
  const list = boxes.filter(Boolean).map((box) => ({ ...box }));
  let mergedSomething = true;
  while (mergedSomething) {
    mergedSomething = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (shouldMerge(list[i], list[j])) {
          const a = list[i];
          const b = list[j];
          const x1 = Math.min(a.x, b.x);
          const y1 = Math.min(a.y, b.y);
          const x2 = Math.max(a.x + a.w, b.x + b.w);
          const y2 = Math.max(a.y + a.h, b.y + b.h);
          list[i] = {
            x: Math.max(0, x1),
            y: Math.max(0, y1),
            w: Math.min(imageW, x2) - Math.max(0, x1),
            h: Math.min(imageH, y2) - Math.max(0, y1),
          };
          list.splice(j, 1);
          mergedSomething = true;
          break;
        }
      }
      if (mergedSomething) break;
    }
  }
  return list;
}

function shouldMerge(a, b) {
  const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const overlapArea = overlapX * overlapY;
  const minArea = Math.min(a.w * a.h, b.w * b.h);
  if (overlapArea > minArea * 0.12) return true;
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const gapX = Math.max(0, Math.abs(ax - bx) - (a.w + b.w) / 2);
  const gapY = Math.max(0, Math.abs(ay - by) - (a.h + b.h) / 2);
  return gapX < Math.max(a.w, b.w) * 0.08 && gapY < Math.max(a.h, b.h) * 0.08;
}

function onPointerDown(event) {
  if (!hasImage()) return;
  const point = getCanvasPoint(event);
  const hit = hitTest(point);
  els.overlayCanvas.setPointerCapture(event.pointerId);

  if (hit) {
    state.selectedId = hit.mask.id;
    state.drag = {
      type: hit.handle || "move",
      start: point,
      original: { ...hit.mask },
    };
  } else {
    const mask = createMask({ x: point.x, y: point.y, w: 1, h: 1 }, "manual");
    state.masks.push(mask);
    state.selectedId = mask.id;
    state.drag = {
      type: "draw",
      start: point,
      original: { ...mask },
    };
  }
  drawAll();
}

function onPointerMove(event) {
  if (!state.drag || !hasImage()) return;
  const point = getCanvasPoint(event);
  const mask = getSelectedMask();
  if (!mask) return;
  const dx = point.x - state.drag.start.x;
  const dy = point.y - state.drag.start.y;
  const original = state.drag.original;

  if (state.drag.type === "draw") {
    mask.x = Math.min(original.x, point.x);
    mask.y = Math.min(original.y, point.y);
    mask.w = Math.abs(point.x - original.x);
    mask.h = Math.abs(point.y - original.y);
  } else if (state.drag.type === "move") {
    mask.x = original.x + dx;
    mask.y = original.y + dy;
  } else {
    resizeMask(mask, original, point, state.drag.type);
  }
  normalizeMask(mask);
  drawAll();
}

function onPointerUp(event) {
  if (!state.drag) return;
  const mask = getSelectedMask();
  if (mask && (mask.w < 8 || mask.h < 8)) {
    state.masks = state.masks.filter((item) => item.id !== mask.id);
    state.selectedId = state.masks[0]?.id ?? null;
  }
  state.drag = null;
  try {
    els.overlayCanvas.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }
  drawAll();
}

function resizeMask(mask, original, point, handle) {
  const x1 = original.x;
  const y1 = original.y;
  const x2 = original.x + original.w;
  const y2 = original.y + original.h;
  let left = x1;
  let right = x2;
  let top = y1;
  let bottom = y2;

  if (handle.includes("w")) left = point.x;
  if (handle.includes("e")) right = point.x;
  if (handle.includes("n")) top = point.y;
  if (handle.includes("s")) bottom = point.y;

  mask.x = Math.min(left, right);
  mask.y = Math.min(top, bottom);
  mask.w = Math.abs(right - left);
  mask.h = Math.abs(bottom - top);
}

function normalizeMask(mask) {
  const clamped = clampRect(mask);
  Object.assign(mask, clamped);
}

function clampRect(mask) {
  const maxW = state.sourceCanvas.width;
  const maxH = state.sourceCanvas.height;
  const x = Math.max(0, Math.min(maxW, mask.x));
  const y = Math.max(0, Math.min(maxH, mask.y));
  const w = Math.max(0, Math.min(mask.w, maxW - x));
  const h = Math.max(0, Math.min(mask.h, maxH - y));
  return { ...mask, x, y, w, h };
}

function getCanvasPoint(event) {
  const rect = els.overlayCanvas.getBoundingClientRect();
  return {
    x: Math.round(((event.clientX - rect.left) / rect.width) * els.overlayCanvas.width),
    y: Math.round(((event.clientY - rect.top) / rect.height) * els.overlayCanvas.height),
  };
}

function hitTest(point) {
  for (let i = state.masks.length - 1; i >= 0; i--) {
    const mask = state.masks[i];
    if (mask.id === state.selectedId) {
      for (const handle of getHandles(mask)) {
        if (Math.abs(point.x - handle.x) <= 9 && Math.abs(point.y - handle.y) <= 9) {
          return { mask, handle: handle.name };
        }
      }
    }
    if (point.x >= mask.x && point.x <= mask.x + mask.w && point.y >= mask.y && point.y <= mask.y + mask.h) {
      return { mask };
    }
  }
  return null;
}

function getHandles(mask) {
  const x1 = mask.x;
  const y1 = mask.y;
  const x2 = mask.x + mask.w;
  const y2 = mask.y + mask.h;
  return [
    { name: "nw", x: x1, y: y1 },
    { name: "ne", x: x2, y: y1 },
    { name: "sw", x: x1, y: y2 },
    { name: "se", x: x2, y: y2 },
  ];
}

function getSelectedMask() {
  return state.masks.find((mask) => mask.id === state.selectedId);
}

function deleteSelectedMask() {
  if (!state.selectedId) return;
  state.masks = state.masks.filter((mask) => mask.id !== state.selectedId);
  state.selectedId = state.masks[0]?.id ?? null;
  drawAll();
}

function clearMasks() {
  state.masks = [];
  state.selectedId = null;
  drawAll();
  setStatus("マスクを全消去");
}

function downloadImage() {
  drawAll();
  els.imageCanvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = state.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }, "image/png");
}

function loadDemoImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 980;
  canvas.height = 1240;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#d9e1dd";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f2c1a3";
  ctx.beginPath();
  ctx.ellipse(490, 250, 118, 132, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(490, 590, 220, 330, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f6c8ad";
  ctx.beginPath();
  ctx.ellipse(300, 620, 72, 260, 0.15, 0, Math.PI * 2);
  ctx.ellipse(680, 620, 72, 260, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#efb18f";
  ctx.beginPath();
  ctx.ellipse(405, 970, 78, 270, 0.1, 0, Math.PI * 2);
  ctx.ellipse(575, 970, 78, 270, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#cc7068";
  ctx.beginPath();
  ctx.ellipse(490, 785, 42, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  createImageBitmap(canvas).then((bitmap) => loadBitmap(bitmap, "demo"));
}
