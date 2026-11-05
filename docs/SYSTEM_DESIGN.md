# DrowsyGuard system design

## Purpose

A low-cost, Android-first research prototype for detecting prolonged eye closure from the front camera and issuing an audible warning. The phone supplies the camera, CPU, display, speaker and optional vibration motor. No dedicated IoT hardware or remote server is required.

## Runtime architecture

1. React Native UI (JavaScript) requests the camera permission and controls the monitoring session.
2. VisionCamera supplies the front-camera preview.
3. `react-native-vision-camera-face-detector` uses Google ML Kit on Android to locate the face in each camera frame.
4. The frame processor crops the two eye regions, converts them to the CNN's 64x64 grayscale input, and runs `assets/eye_state_cnn.tflite`. ML Kit eye probabilities remain a fallback if the model is unavailable.
5. The drowsiness rule marks both eyes closed when both probabilities are below the configured threshold. It tracks how long closure persists.
6. When the duration exceeds the configured setting, the app speaks a warning, optionally vibrates and stores an event in AsyncStorage.
7. The history and settings remain on the device. Camera frames are not saved or uploaded.

## Important terminology

The current working mobile build uses ML Kit face localization plus the bundled custom CNN's eye-open probabilities and temporal decision logic. It does not compute geometric Eye Aspect Ratio. The `ml_training` directory supplies CNN training, evaluation and `.tflite` export scripts.

## Main configurable values

- `eyeClosedProbability`: eye probabilities below this value count as closed; default 0.25.
- `closureDurationMs`: sustained closure duration before warning; default 1500 ms.
- `alertCooldownMs`: minimum interval between repeated alert events; default 15000 ms.
- `audioAlerts` / `vibrationAlerts`: output preferences.

These are engineering defaults only. Tune thresholds using validation data; do not present them as medically validated values.

## Known limitations

- Intended for Android first; the pinned face detector / VisionCamera versions were chosen for a known compatible stack. iOS build is not documented or verified in this package.
- Monitoring is foreground-only. Leaving the Monitor tab or stopping the session shuts the camera session down.
- Performance and classification availability vary with device, lighting, head angle, glasses and camera placement.
- ML Kit face classifications are not a medical diagnosis and are not a replacement for sleep/rest decisions.
- This is a research prototype, not a certified driver-safety system.
