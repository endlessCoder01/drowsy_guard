# CNN training and TensorFlow Lite export

This folder contains a reproducible, lightweight CNN training path for the dissertation objective. It is separate from the current mobile runtime: **the mobile app starts working without this model by using Android ML Kit's on-device eye-open classification**. The exported model from this script is not automatically wired into the app's native live-frame pipeline.

## 1. Install Python dependencies

Use Python 3.10 or 3.11 for the least friction with the pinned TensorFlow range. From this folder:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

On macOS/Linux, activate with `source .venv/bin/activate` instead.

## 2. Prepare labelled eye crops

Create this directory structure, and put cropped eye images inside each class folder:

```text
data/
  train/
    closed/
    open/
  validation/
    closed/
    open/
  test/
    closed/
    open/
```

Use the same class names in every split. Images may be JPG or PNG. Resize and greyscale conversion happen inside the data loader. Keep train/validation/test images separate. Prefer splitting by driver or video session rather than randomly splitting adjacent frames from one video, to reduce leakage. The recommended initial proportions are 70%/15%/15% as described in the dissertation.

Download datasets only from their official or authorised sources and respect their licence and research-use terms. Eye crops from different cameras, lighting conditions, skin tones and glasses should be represented where the dataset permits.

## 3. Train and evaluate

```powershell
python train_eye_cnn.py --data data --output output --epochs 15
```

Outputs:

- `output/eye_state_cnn.keras` — Keras model.
- `output/eye_state_cnn.tflite` — TensorFlow Lite export.
- `output/metrics.json` — accuracy, precision, recall, F1 and confusion matrix.
- `output/labels.json` — class-index mapping.

The class order is alphabetical: `closed = 0`, `open = 1`; the single sigmoid model output is the probability for `open` (class index 1). Verify this mapping if you change class names.

## Important limitation

After training, copy `output/eye_state_cnn.tflite` to `../assets/eye_state_cnn.tflite`. The Android development build uses ML Kit for face localization, crops both eyes in the VisionCamera frame processor, resizes them to 64x64 grayscale and runs the custom CNN. Rebuild the native app after copying the model, then verify classification on the target phone.
