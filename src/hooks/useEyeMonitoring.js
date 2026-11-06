import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import * as Speech from 'expo-speech';
import { C } from '../ui/theme';
import {
  EYE_MODEL, Worklets, useCameraDevice, useFaceDetector,
  useFrameProcessor, useResizePlugin, useTensorflowModel,
} from '../services/cameraRuntime';

export default function useEyeMonitoring({ monitoring, settings, onNewEvent }) {
  const device = useCameraDevice('front');
  const cnn = useTensorflowModel(EYE_MODEL);
  const cnnModel = cnn.state === 'loaded' ? cnn.model : null;
  const { resize } = useResizePlugin();
  const faceDetectionOptions = useMemo(() => ({
    performanceMode: 'fast',
    classificationMode: 'all',
    landmarkMode: 'none',
    contourMode: 'none',
  }), []);
  const { detectFaces } = useFaceDetector(faceDetectionOptions);
  const [monitorStatus, setMonitorStatus] = useState('waiting');
  const [eyeScore, setEyeScore] = useState(null);
  const [faceSeen, setFaceSeen] = useState(false);
  const [closureDuration, setClosureDuration] = useState(0);
  const closedSinceRef = useRef(null);
  const lastAlertAtRef = useRef(0);
  const speakingRef = useRef(false);

  useEffect(() => {
    closedSinceRef.current = null;
    lastAlertAtRef.current = 0;
    setMonitorStatus(monitoring ? 'waiting' : 'stopped');
    setEyeScore(null);
    setClosureDuration(0);
    setFaceSeen(false);
    speakingRef.current = false;
  }, [monitoring]);

  const speakWarning = useCallback(() => {
    if (settings.audioAlerts && !speakingRef.current) {
      speakingRef.current = true;
      Speech.speak('Warning. Possible drowsiness detected. Please stop somewhere safe and rest.', {
        rate: 0.88,
        onDone: () => { speakingRef.current = false; },
        onStopped: () => { speakingRef.current = false; },
        onError: () => { speakingRef.current = false; },
      });
    }
    if (settings.vibrationAlerts) Vibration.vibrate([0, 450, 220, 450]);
  }, [settings.audioAlerts, settings.vibrationAlerts]);

  const handleFacesDetected = useCallback((faces) => {
    if (!monitoring) return;
    const face = Array.isArray(faces) && faces.length > 0 ? faces[0] : null;
    if (!face) {
      setFaceSeen(false);
      setEyeScore(null);
      setMonitorStatus('no-face');
      setClosureDuration(0);
      closedSinceRef.current = null;
      return;
    }
    setFaceSeen(true);
    const leftRaw = typeof face.cnnLeftEyeOpenProbability === 'number'
      ? face.cnnLeftEyeOpenProbability
      : face.leftEyeOpenProbability;
    const rightRaw = typeof face.cnnRightEyeOpenProbability === 'number'
      ? face.cnnRightEyeOpenProbability
      : face.rightEyeOpenProbability;
    const left = typeof leftRaw === 'number' ? leftRaw : NaN;
    const right = typeof rightRaw === 'number' ? rightRaw : NaN;
    if (!Number.isFinite(left) || !Number.isFinite(right) || left < 0 || right < 0) {
      setEyeScore(null);
      setMonitorStatus('eyes-unavailable');
      setClosureDuration(0);
      closedSinceRef.current = null;
      return;
    }
    const score = Math.max(0, Math.min(1, (left + right) / 2));
    setEyeScore(score);
    const bothEyesClosed = left < settings.eyeClosedProbability && right < settings.eyeClosedProbability;
    const now = Date.now();
    if (bothEyesClosed) {
      if (closedSinceRef.current === null) closedSinceRef.current = now;
      const duration = now - closedSinceRef.current;
      setClosureDuration(duration);
      if (duration >= settings.closureDurationMs) {
        setMonitorStatus('drowsy');
        if (now - lastAlertAtRef.current >= settings.alertCooldownMs) {
          lastAlertAtRef.current = now;
          speakWarning();
          const event = {
            id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date(now).toISOString(),
            closureDurationMs: duration,
            eyeOpenProbability: score,
            method: face.cnnLeftEyeOpenProbability !== undefined
              ? 'Custom CNN eye-crop classification'
              : 'On-device eye-open classification',
          };
          onNewEvent(event);
        }
      } else {
        setMonitorStatus('eyes-closing');
      }
    } else {
      closedSinceRef.current = null;
      setClosureDuration(0);
      setMonitorStatus('alert');
    }
  }, [monitoring, settings.eyeClosedProbability, settings.closureDurationMs, settings.alertCooldownMs, speakWarning, onNewEvent]);

  const handleFacesDetectedOnJS = useMemo(
    () => (Worklets ? Worklets.createRunOnJS(handleFacesDetected) : handleFacesDetected),
    [handleFacesDetected],
  );
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const faces = detectFaces(frame);
    if (cnnModel && faces.length > 0) {
      const tflite = cnnModel;
      const face = faces[0];
      const bounds = face.bounds;
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        const eyeWidth = Math.max(8, Math.floor(bounds.width * 0.28));
        const eyeHeight = Math.max(8, Math.floor(bounds.height * 0.22));
        const eyeY = Math.max(0, Math.floor(bounds.y + bounds.height * 0.24));
        const leftX = Math.max(0, Math.floor(bounds.x + bounds.width * 0.16));
        const rightX = Math.max(0, Math.floor(bounds.x + bounds.width * 0.56));
        const maxX = Math.max(0, frame.width - eyeWidth);
        const maxY = Math.max(0, frame.height - eyeHeight);

        const classifyEye = (x) => {
          'worklet';
          const crop = resize(frame, {
            crop: {
              x: Math.min(x, maxX),
              y: Math.min(eyeY, maxY),
              width: Math.min(eyeWidth, frame.width),
              height: Math.min(eyeHeight, frame.height),
            },
            scale: { width: 64, height: 64 },
            pixelFormat: 'rgb',
            dataType: 'uint8',
          });
          const input = new Float32Array(64 * 64);
          for (let i = 0; i < input.length; i += 1) {
            const offset = i * 3;
            input[i] = (crop[offset] + crop[offset + 1] + crop[offset + 2]) / 3;
          }
          // fast-tflite expects typed arrays and reads their backing buffers itself.
          const outputs = tflite.runSync([input]);
          return outputs[0][0];
        };

        const enrichedFace = {
          ...face,
          cnnLeftEyeOpenProbability: classifyEye(leftX),
          cnnRightEyeOpenProbability: classifyEye(Math.min(rightX, maxX)),
        };
        handleFacesDetectedOnJS([enrichedFace]);
        return;
      }
    }
    handleFacesDetectedOnJS(faces);
  }, [cnnModel, detectFaces, handleFacesDetectedOnJS, resize]);

  const statusLabel = {
    waiting: 'Waiting for face',
    'no-face': 'Face not detected',
    'eyes-unavailable': 'Eyes not clearly visible',
    alert: 'Eyes appear open',
    'eyes-closing': 'Eye closure detected',
    drowsy: 'Possible drowsiness',
    stopped: 'Monitoring stopped',
  }[monitorStatus] || 'Initialising';

  const statusDescription = {
    waiting: 'Look towards the front camera and keep both eyes visible.',
    'no-face': 'Move into view and improve the lighting. Monitoring is still active.',
    'eyes-unavailable': 'Face detected, but eye-open scores are unavailable. Face the camera directly.',
    alert: 'No prolonged eye closure detected in the latest camera result.',
    'eyes-closing': 'Short closure detected. The alert timer has not reached its threshold.',
    drowsy: 'The configured closure duration has been exceeded. Take a safe break.',
    stopped: 'Start a session to begin camera analysis.',
  }[monitorStatus] || '';

  const statusColor = monitorStatus === 'drowsy' ? C.coral : monitorStatus === 'eyes-closing' ? C.amber : monitorStatus === 'alert' ? C.teal : C.muted;
  const statusBackground = monitorStatus === 'drowsy' ? C.coralSoft : monitorStatus === 'eyes-closing' ? C.amberSoft : C.card;
  const progress = Math.max(0, Math.min(100, closureDuration / settings.closureDurationMs * 100));


  return {
    device, frameProcessor, modelState: cnn.state, monitorStatus, eyeScore,
    faceSeen, closureDuration, statusLabel, statusDescription, statusColor,
    statusBackground, progress,
  };
}
