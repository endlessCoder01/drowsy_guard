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
| F10 | Close and reopen app | Event history and settings persist. |
| F11 | Clear history | Local event list is empty after confirmation. |
| F12 | Deny face classification / use poor lighting | App indicates eyes are unavailable or face not detected rather than fabricating a score. |

## Research evaluation

Collect independent labelled test sessions. Report precision, recall, F1 and a confusion matrix for alert/non-alert outcomes, plus detection latency, false alarms per minute and approximate frame-processing responsiveness. Keep participant/session splits separate between training and testing. Report failure cases (low light, eyeglasses, head rotation and face loss), not accuracy alone.

## Safety

Do not test by driving while tired. Use a parked vehicle, a consenting participant who is alert, staged eye closures, or recorded video. The system is a prototype and cannot guarantee that a driver is safe to continue driving.
