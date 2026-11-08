# DrowsyGuard test plan

Run tests while parked or with recorded video. Do not deliberately induce drowsiness while driving.

## Functional tests

| ID | Test | Expected result |
|---|---|---|
| F01 | Open app for the first time | Dashboard loads; no camera capture starts without user action. |
| F02 | Tap Start monitoring and grant permission | Monitor screen opens and front-camera preview appears. |
| F03 | Deny camera permission | Clear permission message appears; app does not claim to be monitoring. |
| F04 | Move face out of view | Status changes to Face not detected; closure timer resets. |
| F05 | Face camera with both eyes open | Eye-open score appears when classification is available; no drowsiness alert. |
| F06 | Briefly close both eyes | Closure timer starts but short closure should not normally trigger a warning. |
| F07 | Keep both eyes closed while parked | Warning occurs after configured closure duration; event is saved locally. |
| F08 | Toggle voice/vibration in Settings | Selected alert mechanisms are enabled/disabled. |
| F09 | Test alert button | Spoken warning and/or vibration matches settings. |
| F10 | Reload JavaScript, then force-close and reopen the app | All successfully saved event history and settings persist. |
| F11 | Open History and visit each screen | No Clear history control exists; navigating, starting/stopping monitoring and changing settings never delete saved alerts. |
| F12 | Deny face classification / use poor lighting | App indicates eyes are unavailable or face not detected rather than fabricating a score. |
| F13 | Launch an upgraded installation with existing `@drowsyguard/events-v1` history | Every existing alert appears; the original stored value remains unchanged. |
| F14 | Save more than 100 distinct alerts, then reload and restart | The oldest and newest alerts remain visible, newest first; there is no history cap or automatic pruning. |
| F15 | Queue several alerts before earlier writes finish | Every distinct alert is saved once; no concurrent append replaces another alert. |
| F16 | Simulate an AsyncStorage write failure, restore storage and retry | The alert remains visible as pending/unsaved until successfully stored; retry saves it once and later alerts can still save. |
| F17 | Simulate an AsyncStorage read failure, then retry loading | The app reports the load failure without clearing storage or discarding alerts already in memory; retry recovers saved records. |
| F18 | Produce an alert while saved history is loading | The new alert and previous saved history both remain visible after loading, with no duplicate IDs. |
| F19 | Start and stop a monitoring session | Camera fills the display; header/tabs disappear; live metrics and Stop remain usable; Android system bars and screen-awake behavior restore on exit. |
| F20 | Press Android Back during monitoring | The session ends before navigating away; speech/vibration stop and the app's focus rule is removed. |
| F21 | Start quiet drive without Do Not Disturb access | The app explains setup and offers Monitor only; it never claims notifications are silenced without access. |
| F22 | Deny Bluetooth access, or connect/disconnect a call-capable Bluetooth headset | Music remains permitted by the app's focus rule; calls are permitted only with a detected headset; connection changes update the rule. Verify actual routing separately in phone settings. |
| F23 | Play music, trigger a staged alert, then stop monitoring | Media is not paused by the app; the spoken warning/haptic cue is available subject to volume, device support and stricter system rules; Stop cancels the app's cue. |
| F24 | Enable stricter user DND or manually disable the app's focus rule | DrowsyGuard does not weaken the user's policy; it does not label unconfirmed focus as active. System/channel exceptions may still appear. |
| F25 | Background the app while monitoring or during a delayed native start | No late monitoring session activates; camera monitoring ends and only the app-owned focus rule is cleaned up. Returning requires a new Start action. |
| F26 | Restart the app/provider after process termination | No monitoring session is inherited. Verify focus cleanup on the device; a force-stop that kills both processes can defer cleanup until reconnection. |
| F27 | Start with camera permission already granted, or grant camera/Bluetooth permission in the system dialog | Existing camera access skips the request. A permission dialog's pause/resume does not cancel startup; monitoring waits until the app is active. Explicit Stop/unmount still cancels pending startup. |

## Automated storage regression checks

From the project root, run:

```powershell
npm run test:history
```

The storage checks use a mock AsyncStorage and verify untouched legacy records, more than 100 alerts, concurrent appends, a fresh storage-module instance, duplicate retries, and read/write failures without deleting history. Integration checks execute the actual App hooks and callbacks to cover hydration races, replayed state updaters, pending-save retries, read recovery, and settings hydration. Run the on-device reload/restart checks above as well.

The app never clears or truncates alert history. Uninstalling it or clearing its data in the operating system can still remove local history; AsyncStorage is not a cloud backup.

Run `npm test` to include drive-session and Android configuration tests as well. These exercise the production hooks and bridge with mocked device APIs, including existing camera access, permission-dialog pause/resume, denied permissions, Bluetooth denial, late starts, background/unmount cleanup, failed restoration and native-operation ordering. They do not replace the native phone checks above.

## Research evaluation

Collect independent labelled test sessions. Report precision, recall, F1 and a confusion matrix for alert/non-alert outcomes, plus detection latency, false alarms per minute and approximate frame-processing responsiveness. Keep participant/session splits separate between training and testing. Report failure cases (low light, eyeglasses, head rotation and face loss), not accuracy alone.

## Safety

Do not test by driving while tired. Use a parked vehicle, a consenting participant who is alert, staged eye closures, or recorded video. The system is a prototype and cannot guarantee that a driver is safe to continue driving.
