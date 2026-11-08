# DrowsyGuard — React Native JavaScript Android app

A colourful, offline-first driver drowsiness research prototype. It uses a phone's front camera, on-device face/eye classification, a prolonged-closure timer, spoken warning, vibration and persistent local event history. No IoT components, paid API, cloud server or account are needed for the core app.

> **Scope note:** ML Kit locates the face and the bundled TensorFlow Lite model classifies eye crops. ML Kit eye-open scores provide a fallback when the model is unavailable. The `ml_training/` folder contains the training/evaluation/export workflow. This remains a research prototype; model performance needs independent validation.

## What's included

- Reusable React Native components, screens and hooks in JavaScript, plus a small Android Kotlin drive-focus module.
- Refreshed Home, Monitor, Event History and Settings screens.
- Front camera live preview, ML Kit face localization and custom CNN eye-crop classification.
- Configurable eye-closure probability and duration threshold.
- Spoken warning and phone vibration when prolonged closure is detected.
- Append-only alert history in AsyncStorage, with no clear control or record limit, and local settings.
- CNN training/evaluation/export script with accuracy, precision, recall, F1 and confusion-matrix output.
- Functional test plan and system-design notes.

## Full-screen monitoring and quiet drive

The camera fills the display during monitoring, with live metrics and a visible Stop session control. Android hides the system bars and keeps the screen awake for the session. Stop, Back, leaving the app and session teardown restore the app's window settings and end its own focus rule. Return to the app and start again after a call or another foreground interruption.

On Android 10 or later, **Settings → Quiet drive** can silence regular notifications while permitting media audio. Call interruptions are permitted only while a Bluetooth headset capable of calls is connected. Android controls the actual call route; this app does not answer calls or force them onto Bluetooth. Stricter existing Do Not Disturb rules remain effective, and system/DND exceptions can still appear. iPhone users must configure Driving Focus themselves.

This update includes native code, so reload alone is insufficient for drive focus. Regenerate and rebuild your development app without uninstalling it, preserving saved history:

```powershell
npx expo prebuild --platform android
npm run android
```

Then grant **Do Not Disturb access** and **Bluetooth access** through the app's Settings controls. If access is unavailable, the start dialog offers **Monitor only**, which leaves notification settings unchanged. See [drive-mode behavior and limitations](docs/DRIVE_MODE.md).

`App.js` now connects the pieces: `src/screens/` contains pages, `src/components/` contains shared controls and layout, `src/hooks/` contains history/settings/monitoring/session behavior, and `src/services/` contains native interfaces. `plugins/withDriveMode.js` regenerates the native Android code, so it survives Expo prebuild.

Run `npm test` for history, hydration, permission, cancellation and drive-session regression checks. Native notification, Bluetooth, audio and screen behavior still need verification on a phone.

## Requirements

- Windows 10/11 computer (instructions below are PowerShell-specific).
- Node.js 20 or 22; Node 22 is suitable.
- JDK 17. Use `java -version` to confirm; Java 11 and Java 25 may cause Android Gradle build errors with this pinned setup.
- Android Studio with Android SDK and platform tools installed; create an emulator or use a physical Android device.
- A phone with a working front camera and speaker. Android 8/API 26 or newer is the face-detector library's stated minimum.
- Internet for installing packages and the first Gradle build. After installation, monitoring itself works offline.

The project pins the React Native 0.76 / Expo SDK 52 / VisionCamera 4.6.4 stack because the selected face-detector package documents that tested combination. This intentionally prioritises compatibility over using the newest React Native release.

## Run on Windows (PowerShell)

### 1. Extract the ZIP

Extract the ZIP to a short local path, for example:

```text
C:\Work\DrowsyGuard
```

Open PowerShell in that folder.

### 2. Verify the Android toolchain

```powershell
node --version
npm --version
java -version
adb devices
```

If `java -version` does not show JDK 17, install JDK 17 and temporarily set it for this PowerShell window. Adjust the path to the actual JDK installation:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

Install Android Studio if needed, then in **Tools → SDK Manager** install the Android SDK platform/build tools recommended by Android Studio. In **Device Manager**, create an Android emulator, or enable Developer options and USB debugging on your real phone.

### 3. Install JavaScript dependencies

```powershell
npm install
```

`npm start` opens the project in Expo Go for testing the screens, settings, local history and test alerts. Expo Go does not include the native camera and face-detector modules, so live monitoring requires the DrowsyGuard development build described below.

### 4. Generate the Android native project

```powershell
npx expo prebuild --platform android
```

This generates the `android/` directory from the Expo configuration and links native packages. The generated files are local build outputs and are intentionally not duplicated in the ZIP.

### 5. Build and install the app

Start your emulator or connect your Android phone, confirm `adb devices` lists it, then run:

```powershell
npx expo run:android
```

The first build can take several minutes while Gradle downloads dependencies. This is a one-time setup activity, not a runtime subscription. On later runs use `npm run android`.

For a scripted setup from the project root, you can also run `powershell -ExecutionPolicy Bypass -File .\scripts\run-android.ps1`. It runs `npm install`, generates `android/` if needed, then builds and installs the app.

### 6. Use the app

1. Open **DrowsyGuard**.
2. Tap **Start monitoring** and grant camera permission.
3. Put the phone in a secure position while parked; keep your face and both eyes visible.
4. The Monitor page shows the face state and eye-open score when available.
5. The default alert triggers when both eyes appear closed for 1.5 seconds. Adjust the threshold/duration in Settings only for controlled testing; calibrate any research threshold with a validation dataset.
6. Use **Test alert** to verify speech/vibration.
7. See saved events in **History**. Alerts remain across reloads and app restarts; the app never clears or truncates them. No videos are saved.

### Local history retention

Existing saved history from earlier app versions remains available without rewriting or removing its original records. Each new alert is stored separately in AsyncStorage, so saving a new event does not replace older alerts or apply the previous 100-record cap. History displays newest first and safely merges alerts created while saved records load.

If storage fails, the app reports the problem and keeps unsaved alerts visible for retry. A successful retry does not duplicate the same alert. Unsaved alerts still require a successful write before they can survive an app restart.

History stays on this app installation. Uninstalling the app or clearing its data through the operating system can remove it; there is no cloud backup.

To run the storage regression checks:

```powershell
npm run test:history
```

See [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) for reload/restart, legacy-history, concurrent-write and storage-failure checks.

### 7. Start Metro separately (optional)

To test the app screens in **Expo Go**, run this from the project root:

```powershell
npm start
```

Scan the QR code shown by Expo CLI from the Expo Go app while the phone and computer are on the same Wi-Fi network. If the phone cannot reach the computer over the local network, use:

```powershell
npx expo start --tunnel
```

Do not open the Metro bundle URL directly in a browser. Expo Go should scan the QR code and open the project. Expo Go supports the app screens, settings, local history and test alerts; live camera and face detection require the DrowsyGuard development build from step 5.

## Common issues

**`JAVA_HOME` / Gradle error**: use JDK 17 for this pinned project and ensure `%JAVA_HOME%\bin` is before other Java installations in `PATH`.

**No Android device found**: start an emulator in Android Studio Device Manager, or enable USB debugging and accept the RSA prompt on your phone. Check `adb devices`.

**Live monitoring is unavailable in Expo Go**: expected; use `npx expo prebuild --platform android` followed by `npx expo run:android` to install the DrowsyGuard development build.

**Build error after changing dependencies**: keep the pinned package versions initially. If you change versions, check their React Native and VisionCamera compatibility. To regenerate Android output after changing the plugin/native configuration, run `npx expo prebuild --clean --platform android`, then `npx expo run:android`.

**Ninja reports `build.ninja` is still dirty after 100 tries on Windows**: the bundled Ninja can mistake an existing prefab file for a missing file when its combined path exceeds the Windows path limit. The project's `withWindowsNativeBuild` plugin shortens the Worklets and VisionCamera build caches to `android/.cxx/worklets` and `android/.cxx/camera`, preserving these settings through Expo prebuilds. Run `npm run prebuild:android`, then `npm run android` to apply it. Moving the project or clearing app history is unnecessary. See the [upstream Ninja path-length issue](https://github.com/ninja-build/ninja/issues/1535). Check the plugin with `npm run test:android-config`.

**Black camera preview / no face classification**: grant Camera permission in Android Settings, close other apps using the camera, improve front lighting, face the camera and rebuild the native app after dependency changes.

**Eye probabilities show as unavailable**: ML Kit does not always produce eye-open scores, for example when the face is angled or eyes are obscured. The app intentionally does not invent a score for missing classifications.

**Speech does not sound**: raise media volume and test using the in-app alert button. Android's text-to-speech service/voice must be available.

## Create an APK

For local sideload testing, use Android Studio/Gradle to assemble a debug APK after prebuild:

```powershell
cd android
.\gradlew.bat assembleDebug
```

The output normally appears at `android\app\build\outputs\apk\debug\app-debug.apk`. Install it with `adb install -r app\build\outputs\apk\debug\app-debug.apk` from inside the `android` folder, or use `npx expo run:android` which builds and installs for you.

## CNN research workflow

See [`ml_training/README.md`](ml_training/README.md). It explains how to organise labelled open/closed eye crops, train a CNN and export a `.tflite` model. The bundled `assets/eye_state_cnn.tflite` is loaded by the Android development build. ML Kit locates the face, the frame processor crops both eye regions, and the CNN probabilities drive the closure rule. Verify the model on a device after rebuilding the native project.

## Safety & privacy

This is a research prototype, not a certified driver-safety product, and does not determine medical fitness to drive. A phone mount must not obstruct the driver's view. Test with recorded video or while stationary; never deliberately close your eyes or provoke fatigue while driving. The app analyzes video on-device and stores alert metadata locally only.
