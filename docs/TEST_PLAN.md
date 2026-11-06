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

## Automated storage regression checks

From the project root, run:

```powershell
npm run test:history
```

The storage checks use a mock AsyncStorage and verify untouched legacy records, more than 100 alerts, concurrent appends, a fresh storage-module instance, duplicate retries, and read/write failures without deleting history. Integration checks execute the actual App hooks and callbacks to cover hydration races, replayed state updaters, pending-save retries, read recovery, and settings hydration. Run the on-device reload/restart checks above as well.

The app never clears or truncates alert history. Uninstalling it or clearing its data in the operating system can still remove local history; AsyncStorage is not a cloud backup.

## Research evaluation

Collect independent labelled test sessions. Report precision, recall, F1 and a confusion matrix for alert/non-alert outcomes, plus detection latency, false alarms per minute and approximate frame-processing responsiveness. Keep participant/session splits separate between training and testing. Report failure cases (low light, eyeglasses, head rotation and face loss), not accuracy alone.

## Safety

Do not test by driving while tired. Use a parked vehicle, a consenting participant who is alert, staged eye closures, or recorded video. The system is a prototype and cannot guarantee that a driver is safe to continue driving.
