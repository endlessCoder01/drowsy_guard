import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Vibration,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Speech from 'expo-speech';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

const isExpoGo = Platform.OS !== 'web' && Constants.executionEnvironment === 'storeClient';
const canLoadNativeCamera = Platform.OS !== 'web' && !isExpoGo;
let useCameraDevice = () => null;
let VisionCamera = null;
let useFrameProcessor = () => null;
let useFaceDetector = () => ({ detectFaces: () => [] });
let useTensorflowModel = () => ({ state: 'error', model: undefined });
let useResizePlugin = () => ({ resize: () => null });
let Worklets = null;
let nativeCameraModulesAvailable = false;

if (canLoadNativeCamera) {
  try {
    ({ Camera: VisionCamera, useCameraDevice, useFrameProcessor } = require('react-native-vision-camera'));
    ({ useFaceDetector } = require('react-native-vision-camera-face-detector'));
    ({ Worklets } = require('react-native-worklets-core'));
    ({ useTensorflowModel } = require('react-native-fast-tflite'));
    ({ useResizePlugin } = require('vision-camera-resize-plugin'));
    nativeCameraModulesAvailable = true;
  } catch (error) {
    console.warn('Native camera modules are unavailable. Camera monitoring is disabled.', error);
  }
}

const STORAGE_EVENTS = '@drowsyguard/events-v1';
const STORAGE_SETTINGS = '@drowsyguard/settings-v1';
const DEFAULT_SETTINGS = {
  eyeClosedProbability: 0.25,
  closureDurationMs: 1500,
  alertCooldownMs: 15000,
  audioAlerts: true,
  vibrationAlerts: true,
};
const EYE_MODEL = require('./assets/eye_state_cnn.tflite');

const C = {
  bg: '#ECEFF1',
  card: '#FFFFFF',
  cardSoft: '#F5F6F7',
  text: '#24272B',
  muted: '#6B7077',
  lightMuted: '#92979E',
  border: '#D5D9DE',
  dark: '#34383E',
  darker: '#202328',
  softDark: '#454A51',
  disabled: '#B8BDC3',
  black: '#111315',
};

function formatClock(iso) {
  if (!iso) return 'No alerts yet';
  const date = new Date(iso);
  return date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}

async function readEvents() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_EVENTS);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('Unable to read event history', error);
    return [];
  }
}

async function writeEvents(events) {
  try {
    await AsyncStorage.setItem(STORAGE_EVENTS, JSON.stringify(events.slice(0, 100)));
  } catch (error) {
    console.warn('Unable to save event history', error);
  }
}

function Pill({ label, kind = 'neutral' }) {
  const style = kind === 'dark' ? styles.pillDark : kind === 'soft' ? styles.pillSoft : styles.pill;
  return <View style={style}><Text style={kind === 'dark' ? styles.pillTextLight : styles.pillText}>{label}</Text></View>;
}

function PrimaryButton({ title, onPress, disabled = false, secondary = false, compact = false }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
      style={[
        secondary ? styles.buttonSecondary : styles.buttonPrimary,
        compact && styles.buttonCompact,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={[secondary ? styles.buttonSecondaryText : styles.buttonPrimaryText, disabled && styles.buttonTextDisabled]}>{title}</Text>
    </TouchableOpacity>
  );
}

function SectionTitle({ title, action, onAction }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <TouchableOpacity onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></TouchableOpacity> : null}
    </View>
  );
}

function StatCard({ label, value, subtitle }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSubtitle}>{subtitle}</Text>
    </View>
  );
}

function DashboardScreen({ events, onStart, onTab }) {
  const lastEvent = events[0];
  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>DG</Text></View>
          <Pill label="ON-DEVICE" kind="dark" />
        </View>
        <Text style={styles.heroEyebrow}>DRIVER SAFETY MONITOR</Text>
        <Text style={styles.heroTitle}>Stay alert.{ '\n' }Arrive safely.</Text>
        <Text style={styles.heroCopy}>A camera-based research prototype that checks visible eye-closure indicators and warns when closure lasts longer than your configured threshold.</Text>
        <PrimaryButton title="Start monitoring  →" onPress={onStart} />
        <Text style={styles.heroFootnote}>Keep the phone securely mounted and the driver's face visible.</Text>
      </View>

      <View style={styles.statGrid}>
        <StatCard label="ALERT EVENTS" value={String(events.length)} subtitle="Saved on this phone" />
        <StatCard label="LATEST EVENT" value={lastEvent ? formatClock(lastEvent.timestamp).split(',').slice(-1)[0].trim() : '—'} subtitle={lastEvent ? formatClock(lastEvent.timestamp).split(',')[0] : 'Nothing recorded'} />
      </View>

      <SectionTitle title="How it works" />
      <View style={styles.card}>
        <InfoRow number="01" title="Detect the face" text="On-device ML Kit classification estimates whether each eye appears open." />
        <View style={styles.rowDivider} />
        <InfoRow number="02" title="Track closure duration" text="Short blinks are ignored; persistent low eye-open probabilities trigger a warning." />
        <View style={styles.rowDivider} />
        <InfoRow number="03" title="Warn and log locally" text="The phone can speak an audible warning, vibrate and save an event without internet." />
      </View>

      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Research prototype</Text>
        <Text style={styles.noticeText}>This is not a certified safety device. Test while parked or with recorded video. Never intentionally become drowsy while driving.</Text>
      </View>
      <PrimaryButton title="View event history" onPress={() => onTab('history')} secondary />
    </ScrollView>
  );
}

function InfoRow({ number, title, text }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.numberChip}><Text style={styles.numberChipText}>{number}</Text></View>
      <View style={styles.infoBody}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoText}>{text}</Text>
      </View>
    </View>
  );
}

function MonitorScreen({ monitoring, settings, onStart, onStop, onNewEvent, onTestAlert }) {
  const device = useCameraDevice('front');
  const cnn = useTensorflowModel(EYE_MODEL, []);
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
          const inputBuffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
          const outputs = tflite.runSync([inputBuffer]);
          return new Float32Array(outputs[0])[0];
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

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.screenHeaderRow}>
        <View>
          <Text style={styles.screenEyebrow}>LIVE ANALYSIS</Text>
          <Text style={styles.screenTitle}>Monitor</Text>
        </View>
        <Pill label={monitoring ? 'SESSION ACTIVE' : 'SESSION OFF'} kind={monitoring ? 'dark' : 'soft'} />
      </View>

      <View style={styles.cameraFrame}>
        {monitoring && device && VisionCamera ? (
          <VisionCamera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={monitoring}
            frameProcessor={frameProcessor}
          />
        ) : (
          <View style={styles.cameraPlaceholder}>
            <View style={styles.cameraGlyph}><Text style={styles.cameraGlyphText}>◉</Text></View>
            <Text style={styles.cameraPlaceholderTitle}>{monitoring ? 'Opening camera…' : 'Camera is off'}</Text>
            <Text style={styles.cameraPlaceholderText}>{monitoring ? (isExpoGo ? 'Expo Go can preview the app, but live monitoring needs the DrowsyGuard development build.' : 'If this stays blank, check the camera permission and restart the app.') : 'Start a session to begin face and eye monitoring.'}</Text>
          </View>
        )}
        {monitoring ? <View pointerEvents="none" style={styles.cameraOverlayTop}><Text style={styles.cameraOverlayText}>FRONT CAMERA · {cnn.state === 'loaded' ? 'CUSTOM CNN' : 'ML KIT FALLBACK'}</Text></View> : null}
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={[styles.statusDot, monitorStatus === 'drowsy' ? styles.statusDotDark : monitorStatus === 'alert' ? styles.statusDotLight : styles.statusDotMuted]} />
          <Text style={styles.statusTitle}>{statusLabel}</Text>
          <Text style={styles.statusTime}>{formatDuration(closureDuration)}</Text>
        </View>
        <Text style={styles.statusDescription}>{statusDescription}</Text>
        <View style={styles.metricDivider} />
        <View style={styles.metricRow}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>EYE OPEN SCORE</Text>
            <Text style={styles.metricValue}>{eyeScore === null ? '—' : `${Math.round(eyeScore * 100)}%`}</Text>
          </View>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>ALARM THRESHOLD</Text>
            <Text style={styles.metricValue}>{formatDuration(settings.closureDurationMs)}</Text>
          </View>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>FACE</Text>
            <Text style={styles.metricValue}>{faceSeen ? 'Found' : '—'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.twoButtons}>
        {monitoring ? <PrimaryButton title="Stop session" onPress={onStop} secondary /> : <PrimaryButton title="Start monitoring" onPress={onStart} />}
        <PrimaryButton title="Test alert" onPress={onTestAlert} secondary />
      </View>
      <Text style={styles.helperText}>The eye-open score is an ML Kit classification probability, not a medical measurement. Sunglasses, darkness, head turns and camera angle may reduce reliability.</Text>
    </ScrollView>
  );
}

function HistoryScreen({ events, onClear }) {
  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.screenHeaderRow}>
        <View><Text style={styles.screenEyebrow}>LOCAL RECORDS</Text><Text style={styles.screenTitle}>Event history</Text></View>
        <Pill label={`${events.length} SAVED`} kind="soft" />
      </View>
      <Text style={styles.screenIntro}>Only alert events are saved. Camera frames and video are not stored by this app.</Text>
      {events.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyGlyph}>≋</Text>
          <Text style={styles.emptyTitle}>No events recorded</Text>
          <Text style={styles.emptyCopy}>When the eye-closure threshold is exceeded during monitoring, an event will appear here.</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {events.map((event, index) => (
            <View key={event.id || `${event.timestamp}-${index}`}>
              {index > 0 ? <View style={styles.rowDivider} /> : null}
              <View style={styles.eventRow}>
                <View style={styles.eventIcon}><Text style={styles.eventIconText}>!</Text></View>
                <View style={styles.eventBody}>
                  <Text style={styles.eventTitle}>Prolonged eye closure</Text>
                  <Text style={styles.eventSub}>{formatClock(event.timestamp)}</Text>
                  <Text style={styles.eventSub}>Eye-open score: {Math.round((event.eyeOpenProbability || 0) * 100)}%</Text>
                </View>
                <Text style={styles.eventDuration}>{formatDuration(event.closureDurationMs || 0)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {events.length > 0 ? <PrimaryButton title="Clear local history" onPress={onClear} secondary /> : null}
    </ScrollView>
  );
}

function Stepper({ label, value, display, onDecrease, onIncrease, description }) {
  return (
    <View style={styles.settingCard}>
      <Text style={styles.settingTitle}>{label}</Text>
      <Text style={styles.settingDescription}>{description}</Text>
      <View style={styles.stepperRow}>
        <TouchableOpacity style={styles.stepperButton} onPress={onDecrease}><Text style={styles.stepperGlyph}>−</Text></TouchableOpacity>
        <Text style={styles.stepperValue}>{display || value}</Text>
        <TouchableOpacity style={styles.stepperButton} onPress={onIncrease}><Text style={styles.stepperGlyph}>+</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function ToggleRow({ label, description, value, onToggle }) {
  return (
    <TouchableOpacity style={styles.toggleRow} onPress={onToggle} activeOpacity={0.8}>
      <View style={styles.toggleBody}><Text style={styles.settingTitle}>{label}</Text><Text style={styles.settingDescription}>{description}</Text></View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}><View style={[styles.toggleKnob, value && styles.toggleKnobOn]} /></View>
    </TouchableOpacity>
  );
}

function SettingsScreen({ settings, setSettings, onTestAlert }) {
  const adjust = (key, delta, min, max) => {
    const next = Math.max(min, Math.min(max, Number((settings[key] + delta).toFixed(2))));
    setSettings((previous) => ({ ...previous, [key]: next }));
  };
  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.screenHeaderRow}>
        <View><Text style={styles.screenEyebrow}>PERSONALISE</Text><Text style={styles.screenTitle}>Settings</Text></View>
        <Pill label="LOCAL ONLY" kind="soft" />
      </View>
      <Text style={styles.screenIntro}>These values configure the research prototype. Calibrate them on validation data before reporting performance.</Text>
      <Stepper label="Eye-closed probability" description="An eye is considered closed below this probability. Lower values may be less sensitive." value={settings.eyeClosedProbability} display={settings.eyeClosedProbability.toFixed(2)} onDecrease={() => adjust('eyeClosedProbability', -0.05, 0.10, 0.50)} onIncrease={() => adjust('eyeClosedProbability', 0.05, 0.10, 0.50)} />
      <Stepper label="Closure duration" description="How long both eyes must remain below the threshold before an alert." value={settings.closureDurationMs} display={`${(settings.closureDurationMs / 1000).toFixed(1)} seconds`} onDecrease={() => adjust('closureDurationMs', -250, 750, 4000)} onIncrease={() => adjust('closureDurationMs', 250, 750, 4000)} />
      <View style={styles.card}>
        <ToggleRow label="Voice warning" description="Speak a warning through the phone speaker." value={settings.audioAlerts} onToggle={() => setSettings((p) => ({ ...p, audioAlerts: !p.audioAlerts }))} />
        <View style={styles.rowDivider} />
        <ToggleRow label="Vibration" description="Vibrate the phone when an alert is raised." value={settings.vibrationAlerts} onToggle={() => setSettings((p) => ({ ...p, vibrationAlerts: !p.vibrationAlerts }))} />
      </View>
      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Processing & privacy</Text>
        <Text style={styles.noticeText}>Face analysis happens on the phone. The app stores alert metadata locally and does not upload images or video. A background monitoring service is not included; keep the app open while monitoring.</Text>
      </View>
      <PrimaryButton title="Test audible warning" onPress={onTestAlert} />
    </ScrollView>
  );
}

function TabBar({ tab, onTab, monitoring }) {
  const tabs = [
    { key: 'home', label: 'Home', glyph: '⌂' },
    { key: 'monitor', label: 'Monitor', glyph: '◉' },
    { key: 'history', label: 'History', glyph: '≡' },
    { key: 'settings', label: 'Settings', glyph: '⚙' },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((item) => {
        const selected = tab === item.key;
        return (
          <TouchableOpacity key={item.key} style={styles.tabItem} onPress={() => onTab(item.key)} activeOpacity={0.8}>
            <View style={[styles.tabGlyphBox, selected && styles.tabGlyphBoxSelected]}><Text style={[styles.tabGlyph, selected && styles.tabGlyphSelected]}>{item.glyph}</Text></View>
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{item.label}</Text>
            {item.key === 'monitor' && monitoring ? <View style={styles.tabLiveDot} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState('home');
  const [monitoring, setMonitoring] = useState(false);
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    let alive = true;
    (async () => {
      const savedEvents = await readEvents();
      let savedSettings = null;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_SETTINGS);
        savedSettings = raw ? JSON.parse(raw) : null;
      } catch (error) {
        console.warn('Unable to read settings', error);
      }
      if (alive) {
        setEvents(savedEvents);
        if (savedSettings) setSettings((previous) => ({ ...previous, ...savedSettings }));
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)).catch((error) => console.warn('Unable to save settings', error));
  }, [settings]);

  const addEvent = useCallback((event) => {
    setEvents((previous) => {
      const next = [event, ...previous].slice(0, 100);
      writeEvents(next);
      return next;
    });
  }, []);

  const startMonitoring = useCallback(async () => {
    try {
      if (!nativeCameraModulesAvailable) {
        Alert.alert('Development build required', 'Expo Go can test the app screens, settings and alerts. Live camera and face detection require the DrowsyGuard development build.');
        return;
      }
      const permission = await VisionCamera.requestCameraPermission();
      if (permission !== 'granted' && permission !== 'authorized') {
        Alert.alert('Camera permission required', 'Allow camera access in Android Settings to use live drowsiness monitoring.');
        return;
      }
      setTab('monitor');
      setMonitoring(true);
    } catch (error) {
      Alert.alert('Unable to open camera', String(error && error.message ? error.message : error));
    }
  }, []);

  const stopMonitoring = useCallback(() => {
    setMonitoring(false);
    Speech.stop();
  }, []);

  const changeTab = useCallback((nextTab) => {
    if (monitoring && nextTab !== 'monitor') {
      stopMonitoring();
    }
    setTab(nextTab);
  }, [monitoring, stopMonitoring]);

  const testAlert = useCallback(() => {
    if (settings.audioAlerts) {
      Speech.stop();
      Speech.speak('DrowsyGuard test alert. Please keep your attention on the road.', { rate: 0.9 });
    }
    if (settings.vibrationAlerts) Vibration.vibrate([0, 350, 180, 350]);
    if (!settings.audioAlerts && !settings.vibrationAlerts) Alert.alert('Alerts disabled', 'Enable voice warning or vibration in Settings to test an alert.');
  }, [settings.audioAlerts, settings.vibrationAlerts]);

  const clearHistory = useCallback(() => {
    Alert.alert('Clear event history?', 'This removes saved alert records from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear history', style: 'destructive', onPress: async () => {
        setEvents([]);
        await AsyncStorage.removeItem(STORAGE_EVENTS);
      } },
    ]);
  }, []);

  const headerSubtitle = useMemo(() => monitoring ? 'REAL-TIME SESSION' : 'DRIVER SAFETY / MOBILE AI', [monitoring]);

  return (
    <View style={styles.appRoot}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ExpoStatusBar style="dark" />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBrand} onPress={() => changeTab('home')} activeOpacity={0.85}>
          <View style={styles.topBrandMark}><Text style={styles.topBrandMarkText}>DG</Text></View>
          <View><Text style={styles.topBrandName}>DROWSYGUARD</Text><Text style={styles.topBrandSubtitle}>{headerSubtitle}</Text></View>
        </TouchableOpacity>
        <View style={styles.localBadge}><View style={styles.localDot} /><Text style={styles.localBadgeText}>LOCAL</Text></View>
      </View>

      <View style={styles.mainContent}>
        {tab === 'home' ? <DashboardScreen events={events} onStart={startMonitoring} onTab={changeTab} /> : null}
        {tab === 'monitor' ? <MonitorScreen monitoring={monitoring} settings={settings} onStart={startMonitoring} onStop={stopMonitoring} onNewEvent={addEvent} onTestAlert={testAlert} /> : null}
        {tab === 'history' ? <HistoryScreen events={events} onClear={clearHistory} /> : null}
        {tab === 'settings' ? <SettingsScreen settings={settings} setSettings={setSettings} onTestAlert={testAlert} /> : null}
      </View>
      <TabBar tab={tab} onTab={changeTab} monitoring={monitoring} />
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: C.bg },
  topBar: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bg },
  topBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topBrandMark: { width: 39, height: 39, borderRadius: 12, backgroundColor: C.dark, alignItems: 'center', justifyContent: 'center' },
  topBrandMarkText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
  topBrandName: { color: C.text, fontSize: 13, fontWeight: '900', letterSpacing: 1.15 },
  topBrandSubtitle: { marginTop: 3, color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  localBadge: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 20, backgroundColor: '#E0E3E6', flexDirection: 'row', alignItems: 'center', gap: 6 },
  localDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.softDark },
  localBadgeText: { fontSize: 9, letterSpacing: 1, color: C.dark, fontWeight: '900' },
  mainContent: { flex: 1 },
  screenContent: { padding: 18, paddingBottom: 26, gap: 16 },
  heroCard: { padding: 20, borderRadius: 23, backgroundColor: C.dark, overflow: 'hidden' },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  brandMark: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#555A61', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#696E75' },
  brandMarkText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  pillDark: { backgroundColor: '#4B5057', borderWidth: 1, borderColor: '#666B72', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20 },
  pillSoft: { backgroundColor: '#E1E4E7', borderWidth: 1, borderColor: '#D1D5DA', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20 },
  pill: { backgroundColor: '#E9EBEE', borderWidth: 1, borderColor: C.border, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20 },
  pillText: { color: C.dark, fontSize: 9, fontWeight: '900', letterSpacing: 0.65 },
  pillTextLight: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.65 },
  heroEyebrow: { color: '#C5C9CE', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  heroTitle: { marginTop: 9, color: '#FFFFFF', fontSize: 32, lineHeight: 37, fontWeight: '900', letterSpacing: -0.8 },
  heroCopy: { marginTop: 12, color: '#D3D6DA', fontSize: 13, lineHeight: 20, maxWidth: 330 },
  buttonPrimary: { marginTop: 19, minHeight: 48, paddingHorizontal: 17, paddingVertical: 13, borderRadius: 13, backgroundColor: '#F0F1F2', alignItems: 'center', justifyContent: 'center' },
  buttonPrimaryText: { color: C.darker, fontSize: 13, fontWeight: '900', letterSpacing: 0.15 },
  buttonSecondary: { minHeight: 47, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  buttonSecondaryText: { color: C.text, fontSize: 13, fontWeight: '800' },
  buttonCompact: { minHeight: 38, paddingVertical: 8, marginTop: 0 },
  buttonDisabled: { backgroundColor: C.disabled, borderColor: C.disabled },
  buttonTextDisabled: { color: '#6B7077' },
  heroFootnote: { marginTop: 13, color: '#BFC4CA', fontSize: 10, lineHeight: 15 },
  statGrid: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 14 },
  statLabel: { fontSize: 9, letterSpacing: 1.15, fontWeight: '900', color: C.muted },
  statValue: { marginTop: 10, color: C.text, fontSize: 23, fontWeight: '900' },
  statSubtitle: { marginTop: 4, color: C.lightMuted, fontSize: 10 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },
  sectionAction: { color: C.muted, fontSize: 11, fontWeight: '800' },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 17, paddingHorizontal: 15, paddingVertical: 3 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, gap: 12 },
  numberChip: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EAECF0', alignItems: 'center', justifyContent: 'center' },
  numberChipText: { color: C.dark, fontSize: 10, fontWeight: '900' },
  infoBody: { flex: 1, paddingTop: 1 },
  infoTitle: { fontSize: 12, color: C.text, fontWeight: '900' },
  infoText: { marginTop: 5, fontSize: 11, lineHeight: 17, color: C.muted },
  rowDivider: { height: 1, backgroundColor: '#E8EAED' },
  noticeCard: { borderRadius: 15, borderWidth: 1, borderColor: '#C9CDD2', backgroundColor: '#E3E6E9', padding: 15 },
  noticeTitle: { fontSize: 12, color: C.dark, fontWeight: '900' },
  noticeText: { marginTop: 5, fontSize: 11, lineHeight: 17, color: '#555B62' },
  screenHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  screenEyebrow: { color: C.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  screenTitle: { marginTop: 4, color: C.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  screenIntro: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: -5 },
  cameraFrame: { width: '100%', height: 320, borderRadius: 21, overflow: 'hidden', backgroundColor: '#16181B', borderWidth: 1, borderColor: '#42464C' },
  cameraPlaceholder: { flex: 1, padding: 25, alignItems: 'center', justifyContent: 'center' },
  cameraGlyph: { width: 65, height: 65, borderRadius: 22, borderWidth: 1, borderColor: '#5A6068', backgroundColor: '#292D32', alignItems: 'center', justifyContent: 'center' },
  cameraGlyphText: { color: '#E1E4E7', fontSize: 38, fontWeight: '300' },
  cameraPlaceholderTitle: { marginTop: 17, color: '#F4F5F6', fontSize: 15, fontWeight: '900' },
  cameraPlaceholderText: { marginTop: 8, color: '#B9BEC5', fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 250 },
  cameraOverlayTop: { position: 'absolute', top: 12, left: 12, right: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(28,30,33,0.72)' },
  cameraOverlayText: { color: '#F3F4F6', fontSize: 9, letterSpacing: 1, fontWeight: '900' },
  statusCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 15 },
  statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusDotDark: { backgroundColor: '#22262B' },
  statusDotLight: { backgroundColor: '#9299A1' },
  statusDotMuted: { backgroundColor: '#C5CAD0' },
  statusTitle: { flex: 1, color: C.text, fontSize: 13, fontWeight: '900' },
  statusTime: { color: C.dark, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statusDescription: { marginTop: 8, color: C.muted, fontSize: 11, lineHeight: 17 },
  metricDivider: { marginTop: 13, marginBottom: 12, height: 1, backgroundColor: '#E6E8EB' },
  metricRow: { flexDirection: 'row', gap: 7 },
  metricBlock: { flex: 1 },
  metricLabel: { color: C.lightMuted, fontSize: 8, letterSpacing: 0.6, fontWeight: '900' },
  metricValue: { marginTop: 5, color: C.text, fontSize: 14, fontWeight: '900' },
  twoButtons: { flexDirection: 'row', gap: 9 },
  helperText: { marginTop: -4, color: C.muted, fontSize: 10, lineHeight: 16 },
  emptyCard: { paddingHorizontal: 24, paddingVertical: 35, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 17 },
  emptyGlyph: { fontSize: 38, color: C.lightMuted },
  emptyTitle: { marginTop: 9, color: C.text, fontSize: 15, fontWeight: '900' },
  emptyCopy: { marginTop: 7, textAlign: 'center', color: C.muted, fontSize: 11, lineHeight: 17 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14 },
  eventIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#E6E8EB', alignItems: 'center', justifyContent: 'center' },
  eventIconText: { color: C.dark, fontWeight: '900', fontSize: 17 },
  eventBody: { flex: 1 },
  eventTitle: { color: C.text, fontSize: 12, fontWeight: '900' },
  eventSub: { marginTop: 3, color: C.muted, fontSize: 10 },
  eventDuration: { color: C.dark, fontSize: 12, fontWeight: '900' },
  settingCard: { padding: 15, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16 },
  settingTitle: { color: C.text, fontSize: 12, fontWeight: '900' },
  settingDescription: { color: C.muted, fontSize: 10, lineHeight: 16, marginTop: 5 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, gap: 12 },
  stepperButton: { height: 39, width: 48, borderRadius: 12, backgroundColor: '#E6E8EB', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  stepperGlyph: { fontSize: 22, color: C.dark, fontWeight: '600', marginTop: -1 },
  stepperValue: { flex: 1, color: C.text, textAlign: 'center', fontSize: 14, fontWeight: '900' },
  toggleRow: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleBody: { flex: 1 },
  toggleTrack: { width: 44, height: 26, padding: 3, borderRadius: 20, backgroundColor: '#D4D8DD', justifyContent: 'center' },
  toggleTrackOn: { backgroundColor: '#4C5158' },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B9BEC5' },
  toggleKnobOn: { alignSelf: 'flex-end', borderColor: '#FFFFFF' },
  tabBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 9, paddingBottom: 9, paddingHorizontal: 8, backgroundColor: '#F8F9FA', borderTopWidth: 1, borderTopColor: C.border },
  tabItem: { position: 'relative', alignItems: 'center', justifyContent: 'center', minWidth: 59, gap: 3 },
  tabGlyphBox: { width: 36, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabGlyphBoxSelected: { backgroundColor: '#E1E4E8' },
  tabGlyph: { color: C.muted, fontSize: 19, fontWeight: '700' },
  tabGlyphSelected: { color: C.darker },
  tabLabel: { color: C.muted, fontSize: 9, fontWeight: '700' },
  tabLabelSelected: { color: C.text, fontWeight: '900' },
  tabLiveDot: { position: 'absolute', top: 1, right: 7, width: 6, height: 6, borderRadius: 3, backgroundColor: C.dark },
});
