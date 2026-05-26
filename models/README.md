# Local ONNX Models

Default model:

- `nudenet-320n.onnx`
- Source: NudeNet 3.4.2 PyPI wheel
- SHA256: `c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f`

The app auto-loads `./models/nudenet-320n.onnx` on startup. You can still choose a
different local ONNX file with the `ONNXを読む` button.

Supported detector outputs:

- YOLOv8 style: `[1, N, 4 + classes]` or `[1, 4 + classes, N]`
- YOLOv5 style: `[1, N, 5 + classes]` or `[1, 5 + classes, N]`
- XYXY style: `[N, 6]` or `[1, N, 6]` as `x1, y1, x2, y2, score, class`

The browser preprocessor uses RGB, CHW, float32, `0..1` normalization, square
letterbox input, and the selected input size in the toolbar.

If your model uses a different class layout, edit `TARGET_CLASS_IDS` at the top
of `app.js`. `null` means every detected class is mosaicked.

Current NudeNet target classes in `app.js`:

- `4`: `FEMALE_GENITALIA_EXPOSED`
- `6`: `ANUS_EXPOSED`
- `14`: `MALE_GENITALIA_EXPOSED`
