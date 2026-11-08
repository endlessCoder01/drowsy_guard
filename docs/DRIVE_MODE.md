# Full-screen monitoring and Quiet drive

Quiet drive is implemented by the local Expo config plugin in
`plugins/withDriveMode.js`. The tracked Kotlin sources live in
`plugins/drive-mode/android/`; `android/` remains generated and ignored by Git.

Build the native Android app after pulling these changes:

```sh
npm run prebuild:android
npm run android
```

Reloading Metro alone cannot add the native module. Expo Go does not contain it.
Prebuild registers `DriveModePackage`, declares its permissions and condition
provider, and copies the tracked Kotlin files into the generated Android project.
No additional native dependency is required.
The plugin also writes `android.minSdkVersion=26` (preserving any higher minimum)
because the installed face-detector library requires API 26 and Expo's base
template otherwise defaults to API 24. The app's existing minimum in `app.json`
alone does not change generated Gradle properties.

## Behavior

- Monitoring hides Android's status and navigation bars using immersive mode and
  keeps the display awake. A system swipe can reveal the bars temporarily. Stopping
  or leaving the foreground restores the previous window flags and bar visibility.
- Quiet drive requires Android 10/API 29 or newer and the user's Do Not Disturb
  access grant in Android Settings. Android 12/API 31 or newer also asks for Nearby
  devices/Bluetooth access to detect a headset. If Bluetooth access is denied, call
  interruptions stay silenced while media remains allowed.
- Each monitoring session creates one owned `AutomaticZenRule`, using a custom
  `ZenPolicy`. It disallows notification, message, conversation, repeat-caller,
  alarm, and system interruptions; permits media; and permits call interruptions
  only while a call-capable Bluetooth connection is detected.
- Bluetooth detection uses the connected Hands-Free Profile (`HEADSET`) and
  available SCO/BLE communication devices. An A2DP music-only connection does not
  enable calls. Losing a call-capable connection updates the rule immediately; a
  failed update stops the session and removes the owned rule.
- The app changes only its owned automatic rule. It never writes the global
  interruption filter or global user policy, and never removes another app's
  rules. Android combines active policies restrictively, so a stricter user mode
  can still silence music or calls. Disabling the owned rule in Settings is
  preserved when its Bluetooth policy updates.
- The native module emits `DrowsyGuardDriveModeChanged` and exposes requested,
  active, and confirmed state separately. Before Android 15/API 35, Android cannot
  report an individual rule's active state through the public API; the UI describes
  Quiet drive as requested rather than guaranteeing activation.

## Lifecycle and cleanup

`DriveConditionService` runs in the separate `:driveFocus` process. The foreground
React process gives it a Binder lease. If that process dies while the provider
survives, the provider receives lease death, publishes an inactive condition, and
removes the owned rule. A newly connected provider with no live lease also clears
stale owned rules. No monitoring session is persisted.

Normal stop, backgrounding, activity destruction, native module invalidation, and
binding failure all restore the window and remove the owned rule. Session-specific
service connections reject stale callbacks from earlier starts. Alert vibration
and cancellation run on the same main-thread queue, with a generation check that
drops haptics queued before cancellation; the idle test-alert button still works.
Explicit stop verifies that no owned rule remains while policy access is granted.
If cleanup cannot be confirmed, it rejects with `E_FOCUS_STOP` and reports
`cleanupPending` and a reason instead of claiming restoration; lifecycle cleanup
also logs a warning. A new session does not start over unconfirmed cleanup.

Camera access is checked before requesting permission. During camera or Bluetooth
permission setup, the system dialog may pause the activity; startup waits for the
app to return to the foreground instead of treating that pause as a cancellation.
Explicit Stop or unmount still cancels the pending start. Leaving the app during
native activation or active monitoring stops the session as usual.

Android force-stop and some manufacturer process kills can terminate both app
processes without cleanup callbacks. Cleanup cannot be guaranteed in that case;
the next app/provider connection clears stale owned rules. The rule can also be
disabled or removed in Android's Do Not Disturb settings.

## Android boundaries

Quiet drive uses Android interruption policy. It does not reject calls, auto-answer
them, force the phone's audio route, or prevent the system dialer from appearing.
Call audio routing remains under Android and the connected headset. The separate
`bluetoothCallRouteActive` field reports an active communication route without
claiming that every connected headset is currently carrying call audio.

Android's media allowance covers all media, including music, spoken warnings,
podcasts, and other apps using the media stream. Android does not expose an
app-independent music-only filter. System or emergency behavior may still interrupt
the app. Before Android 15/API 35, notification channels explicitly configured to
bypass Do Not Disturb may still break through; API 35 and newer additionally apply
`allowPriorityChannels(false)` to the owned rule. iOS and web do not expose this
Android policy control; on iPhone the user must configure Driving Focus themselves.

## Verification

The implementation was compiled with the existing JDK 17, Kotlin 1.9.25,
Android API 35 SDK, and React Native 0.76.9 classes. Two successive
`expo prebuild --platform android --no-install` runs produced identical drive-mode
manifest, package-registration, and Kotlin files. Validation checked that each
permission, service, and package registration appears once and that copied Kotlin
matches the tracked sources.
The generated app also passed
`gradlew :app:compileDebugKotlin --offline --no-daemon -PreactNativeArchitectures=arm64-v8a`
with JDK 17 after the minimum SDK fix, including manifest merging and the native
package registration. An existing incremental cache referring to an old drive
path triggered Kotlin's automatic non-incremental fallback; the build completed
successfully. The debug APK has since been packaged and its signature verified,
including the required native libraries for `arm64-v8a` and `armeabi-v7a`.
On a connected Samsung SM-T835 running Android 10/API 29, full-screen monitoring
started with the front-camera preview streaming and the CNN model loaded; Stop
returned to the idle monitor. Permission setup, foreground ordering, cancellation,
and repeated starts are also covered by `npm run test:drive`.

Real-device validation is still required for the phone manufacturer's DND and
Bluetooth behavior:

1. Grant Do Not Disturb access and Nearby devices permission; start Quiet drive.
   Confirm regular notifications are silent and music continues.
2. Connect a call-capable headset, then disconnect it during a session. Confirm
   call interruption behavior changes, while music-only Bluetooth does not enable
   calls.
3. Stop monitoring, background the app, and start/stop quickly. Confirm the owned
   rule is removed, system bars return, and no late vibration remains.
4. Enable a stricter user DND mode first. After stopping monitoring, confirm that
   mode and its settings remain in effect. Also test the owned rule's manual
   deactivation and any channels allowed to bypass DND.
5. Exercise camera-process termination and package force-stop separately, then
   reopen the app and check stale-rule cleanup.

Android references:
[NotificationManager](https://developer.android.com/reference/android/app/NotificationManager),
[ConditionProviderService](https://developer.android.com/reference/android/service/notification/ConditionProviderService),
[ZenPolicy](https://developer.android.com/reference/android/service/notification/ZenPolicy),
[AudioManager communication devices](https://developer.android.com/reference/android/media/AudioManager#getAvailableCommunicationDevices()),
[AOSP policy combination](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/service/notification/ZenPolicy.java).
