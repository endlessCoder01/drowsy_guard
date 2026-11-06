import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  SafeAreaView,
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { readEvents, appendEvent, mergeEvents } from './src/storage/eventHistory';
import { C, styles } from './src/ui/theme';
import { LiveDot, RadarVisual, ScreenEntrance } from './src/ui/Visuals';

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

const STORAGE_SETTINGS = '@drowsyguard/settings-v1';
const DEFAULT_SETTINGS = {
  eyeClosedProbability: 0.25,
  closureDurationMs: 1500,
  alertCooldownMs: 15000,
  audioAlerts: true,
  vibrationAlerts: true,
};
const EYE_MODEL = require('./assets/eye_state_cnn.tflite');



function formatClock(iso) {
  if (!iso) return 'No alerts yet';
  const date = new Date(iso);
  return date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}



function Pill({ label, kind = 'neutral' }) {
  const style = kind === 'dark' ? styles.pillDark : kind === 'soft' ? styles.pillSoft : styles.pill;
  return <View style={style}><Text style={kind === 'dark' ? styles.pillTextLight : styles.pillText}>{label}</Text></View>;
}

function PrimaryButton({ title, onPress, disabled = false, secondary = false, compact = false, icon }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled} activeOpacity={0.78}
      style={[secondary ? styles.buttonSecondary : styles.buttonPrimary, compact && styles.buttonCompact, disabled && styles.buttonDisabled]}>
      {icon ? <Ionicons name={icon} size={18} color={disabled ? C.muted : secondary ? C.text : C.darker} /> : null}
      <Text style={[secondary ? styles.buttonSecondaryText : styles.buttonPrimaryText, disabled && styles.buttonTextDisabled]}>{title}</Text>
    </TouchableOpacity>
  );
}

function SectionTitle({ title, action, onAction }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <TouchableOpacity accessibilityRole="button" onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></TouchableOpacity> : null}
    </View>
  );
}

function StatCard({ label, value, subtitle, icon, color, background }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: background }]}><Ionicons name={icon} size={19} color={color} /></View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSubtitle}>{subtitle}</Text>
    </View>
  );
}

function EventRow({ event }) {
  return (
    <View style={styles.eventRow}>
      <View style={styles.eventIcon}><Ionicons name="alert-outline" size={23} color={C.coral} /></View>
      <View style={styles.eventBody}>
        <Text style={styles.eventTitle}>Eye-closure alert</Text>
        <Text style={styles.eventSub}>{formatClock(event.timestamp)}</Text>
        <Text style={styles.eventSub}>Eye-open score {Math.round((event.eyeOpenProbability || 0) * 100)}%</Text>
      </View>
      <Text style={styles.eventDuration}>{formatDuration(event.closureDurationMs || 0)}</Text>
    </View>
  );
}

function DashboardScreen({ events, historyLoaded, onStart, onTab }) {
  const lastEvent = events[0];
  const today = new Date().toDateString();
  const todayCount = events.filter((event) => new Date(event.timestamp).toDateString() === today).length;
  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View><Text style={styles.greeting}>A little focus. A safer journey.</Text><Text style={styles.greetingTitle}>Hello, road ahead.</Text></View>
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}><Text style={styles.heroEyebrow}>YOUR DAILY CO-PILOT</Text><Pill label="ON DEVICE" kind="dark" /></View>
        <Text style={styles.heroTitle}>Stay present.{'\n'}<Text style={styles.heroAccent}>Go further.</Text></Text>
        <Text style={styles.heroCopy}>A watchful eye for the road ahead. Get a gentle heads-up when your eyes stay closed too long.</Text>
        <RadarVisual />
        <PrimaryButton title="Let's start monitoring" icon="scan-outline" onPress={onStart} />
        <Text style={styles.heroFootnote}>Mount your phone. Keep your face in view.</Text>
      </View>
      <View style={styles.statGrid}>
        <StatCard label="Your alert journal" value={historyLoaded ? String(events.length) : '\u2014'} subtitle="All recorded alerts" icon="albums-outline" color={C.blue} background={C.blueSoft} />
        <StatCard label="Recorded today" value={historyLoaded ? String(todayCount) : '\u2014'} subtitle="A snapshot of your day" icon="sunny-outline" color={C.coral} background={C.coralSoft} />
      </View>
      <View>
        <SectionTitle title="Your latest alert" action="View journal" onAction={() => onTab('history')} />
        {lastEvent ? <View style={styles.card}><EventRow event={lastEvent} /></View> : (
          <View style={styles.card}><View style={styles.infoRow}><View style={[styles.numberChip, { backgroundColor: C.tealSoft }]}><Ionicons name="leaf-outline" size={21} color={C.teal} /></View><View style={styles.infoBody}><Text style={styles.infoTitle}>{historyLoaded ? 'A fresh page awaits' : 'Opening your journal'}</Text><Text style={styles.infoText}>{historyLoaded ? 'Your alerts will appear here and stay in your journal.' : 'Your saved alerts will appear once history has loaded.'}</Text></View></View></View>
        )}
      </View>
      <SectionTitle title="Three steps to stay aware" />
      <View style={styles.card}>
        <InfoRow icon="scan-outline" title="Find your focus" text="The front camera locates your face and checks visible eye activity." />
        <View style={styles.rowDivider} />
        <InfoRow icon="timer-outline" title="Give blinks a moment" text="Brief blinks pass. Longer eye closures start your alert timer." />
        <View style={styles.rowDivider} />
        <InfoRow icon="notifications-outline" title="A nudge when it matters" text="Hear or feel a warning. Each alert is added to your local journal." />
      </View>
      <View style={styles.noticeCard}><Ionicons name="information-circle-outline" size={21} color={C.amber} /><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>A helpful research companion</Text><Text style={styles.noticeText}>This prototype is not a certified safety device. Test while parked and take a break whenever you feel tired.</Text></View></View>
    </ScrollView>
  );
}

function InfoRow({ icon, title, text }) {
  return <View style={styles.infoRow}><View style={styles.numberChip}><Ionicons name={icon} size={21} color={C.blue} /></View><View style={styles.infoBody}><Text style={styles.infoTitle}>{title}</Text><Text style={styles.infoText}>{text}</Text></View></View>;
}

function MonitorScreen({ monitoring, settings, onStart, onStop, onNewEvent, onTestAlert }) {
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
            <View style={styles.cameraGlyph}><Ionicons name="scan-outline" size={34} color={C.mint} /></View>
            <Text style={styles.cameraPlaceholderTitle}>{monitoring ? 'Opening camera…' : 'Camera is off'}</Text>
            <Text style={styles.cameraPlaceholderText}>{monitoring ? (isExpoGo ? 'Expo Go can preview the app, but live monitoring needs the DrowsyGuard development build.' : 'If this stays blank, check the camera permission and restart the app.') : 'Start a session to begin face and eye monitoring.'}</Text>
          </View>
        )}
        {monitoring ? <><View pointerEvents="none" style={styles.cameraGuide} /><View pointerEvents="none" style={styles.cameraOverlayTop}><LiveDot active color={C.mint} /><Text style={styles.cameraOverlayText}>FRONT CAMERA · {cnn.state === 'loaded' ? 'CUSTOM CNN' : 'ML KIT'}</Text></View></> : null}
      </View>

      <View style={[styles.statusCard, { backgroundColor: statusBackground, borderColor: monitorStatus === 'drowsy' ? '#F1C8BE' : C.border }]}>
        <View style={styles.statusHeader}>
          <LiveDot active={monitoring && monitorStatus === 'alert'} color={statusColor} />
          <Text style={[styles.statusTitle, { color: statusColor }]}>{statusLabel}</Text>
          <Text style={styles.statusTime}>{formatDuration(closureDuration)}</Text>
        </View>
        <Text style={styles.statusDescription}>{statusDescription}</Text>
        <View accessibilityRole="progressbar" accessibilityLabel="Eye closure duration" accessibilityValue={{ min: 0, max: settings.closureDurationMs, now: Math.min(closureDuration, settings.closureDurationMs) }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: statusColor }]} /></View>
        <View style={styles.progressLabels}><Text style={styles.progressText}>Closure timer</Text><Text style={styles.progressText}>Alert at {formatDuration(settings.closureDurationMs)}</Text></View>
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
        <View style={styles.buttonCell}>{monitoring ? <PrimaryButton title="Stop session" icon="stop-circle-outline" onPress={onStop} secondary /> : <PrimaryButton title="Start session" icon="scan-outline" onPress={onStart} />}</View>
        <View style={styles.buttonCell}><PrimaryButton title="Test alert" icon="volume-high-outline" onPress={onTestAlert} secondary /></View>
      </View>
      <Text style={styles.helperText}>Eye-open scores are model estimates, not medical measurements. Sunglasses, darkness, head turns and camera angle may reduce reliability.</Text>
    </ScrollView>
  );
}

function HistoryScreen({ events, historyLoaded, historyLoading, pendingCount }) {
  return (
    <FlatList
      data={events}
      keyExtractor={(event, index) => event.id || `${event.timestamp}-${index}`}
      contentContainerStyle={[styles.screenContent, { gap: 0 }]}
      showsVerticalScrollIndicator={false}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      ListHeaderComponent={<View style={styles.historyHeader}>
        <View style={styles.screenHeaderRow}><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.screenEyebrow}>YOUR JOURNEY, REMEMBERED</Text><Text style={styles.screenTitle}>Alert journal</Text></View><Pill label={pendingCount ? 'PENDING' : historyLoaded ? `${events.length} RECORDS` : historyLoading ? 'LOADING' : 'UNAVAILABLE'} kind="soft" /></View>
        <Text style={styles.screenIntro}>Every recorded alert has a place here. Your history stays on this device, with no automatic deletion.</Text>
        <View style={styles.historySummary}><Ionicons name="shield-checkmark-outline" size={31} color={C.mint} /><View style={{ flex: 1 }}><Text style={styles.historySummaryTitle}>Your history stays with you</Text><Text style={styles.historySummaryCopy}>Saved after each alert and restored when you reopen the app. No record limit. No clear button.</Text></View></View>
        <SectionTitle title="Recorded moments" />
      </View>}
      renderItem={({ item }) => <View style={styles.historyItem}><EventRow event={item} /></View>}
      ItemSeparatorComponent={() => <View style={styles.historyGap} />}
      ListEmptyComponent={<View style={styles.emptyCard}><View style={styles.emptyIcon}><Ionicons name="journal-outline" size={32} color={C.teal} /></View><Text style={styles.emptyTitle}>{historyLoading ? 'Opening your journal' : historyLoaded ? 'Your story starts here' : 'History is unavailable'}</Text><Text style={styles.emptyCopy}>{historyLoading ? 'Bringing back your recorded moments.' : historyLoaded ? 'When monitoring detects prolonged eye closure, the alert will be saved here.' : 'Tap Retry above to load your saved records. Existing history is kept untouched.'}</Text></View>}
      ListFooterComponent={<View style={styles.historyFooter}><Ionicons name="lock-closed-outline" size={13} color={C.muted} /><Text style={styles.helperText}>Only alert details are stored. No photos or video.</Text></View>}
    />
  );
}

function Stepper({ label, value, display, onDecrease, onIncrease, description, min, max }) {
  return (
    <View style={styles.settingCard}>
      <Text style={styles.settingTitle}>{label}</Text><Text style={styles.settingDescription}>{description}</Text>
      <View style={styles.stepperRow}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} accessibilityState={{ disabled: value <= min }} disabled={value <= min} style={[styles.stepperButton, value <= min && { opacity: 0.4 }]} onPress={onDecrease}><Ionicons name="remove" size={23} color={C.blue} /></TouchableOpacity>
        <Text accessibilityLiveRegion="polite" style={styles.stepperValue}>{display || value}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Increase ${label}`} accessibilityState={{ disabled: value >= max }} disabled={value >= max} style={[styles.stepperButton, value >= max && { opacity: 0.4 }]} onPress={onIncrease}><Ionicons name="add" size={23} color={C.blue} /></TouchableOpacity>
      </View>
    </View>
  );
}

function ToggleRow({ label, description, value, onToggle }) {
  return (
    <TouchableOpacity accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={description} accessibilityState={{ checked: value }} style={styles.toggleRow} onPress={onToggle} activeOpacity={0.8}>
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
        <View style={styles.settingsHeaderIcon}><Ionicons name="options-outline" size={24} color={C.blue} /></View>
      </View>
      <Text style={styles.screenIntro}>Make your co-pilot feel right for you. Adjust when an eye closure becomes an alert.</Text>
      <Stepper label="Eye-closed probability" description="An eye is considered closed below this probability. Lower values may be less sensitive." value={settings.eyeClosedProbability} min={0.10} max={0.50} display={settings.eyeClosedProbability.toFixed(2)} onDecrease={() => adjust('eyeClosedProbability', -0.05, 0.10, 0.50)} onIncrease={() => adjust('eyeClosedProbability', 0.05, 0.10, 0.50)} />
      <Stepper label="Closure duration" description="How long both eyes must remain below the threshold before an alert." value={settings.closureDurationMs} min={750} max={4000} display={`${(settings.closureDurationMs / 1000).toFixed(1)} seconds`} onDecrease={() => adjust('closureDurationMs', -250, 750, 4000)} onIncrease={() => adjust('closureDurationMs', 250, 750, 4000)} />
      <View style={styles.card}>
        <ToggleRow label="Voice warning" description="Speak a warning through the phone speaker." value={settings.audioAlerts} onToggle={() => setSettings((p) => ({ ...p, audioAlerts: !p.audioAlerts }))} />
        <View style={styles.rowDivider} />
        <ToggleRow label="Vibration" description="Vibrate the phone when an alert is raised." value={settings.vibrationAlerts} onToggle={() => setSettings((p) => ({ ...p, vibrationAlerts: !p.vibrationAlerts }))} />
      </View>
      <View style={styles.noticeCard}><Ionicons name="lock-closed-outline" size={21} color={C.amber} /><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>Private by design</Text><Text style={styles.noticeText}>Analysis happens on your phone. Alert history is kept locally and never automatically deleted. Uninstalling the app or clearing its device storage removes local data. Keep the app open while monitoring.</Text></View></View>
      <PrimaryButton title="Try your alert" icon="volume-high-outline" onPress={onTestAlert} />
    </ScrollView>
  );
}

function TabBar({ tab, onTab, monitoring }) {
  const tabs = [
    { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { key: 'monitor', label: 'Monitor', icon: 'scan-outline', activeIcon: 'scan' },
    { key: 'history', label: 'Journal', icon: 'albums-outline', activeIcon: 'albums' },
    { key: 'settings', label: 'Settings', icon: 'options-outline', activeIcon: 'options' },
  ];
  return (
    <View style={styles.tabBar} accessibilityRole="tablist">
      {tabs.map((item) => {
        const selected = tab === item.key;
        return <TouchableOpacity key={item.key} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={item.label} style={styles.tabItem} onPress={() => onTab(item.key)} activeOpacity={0.8}><View style={[styles.tabGlyphBox, selected && styles.tabGlyphBoxSelected]}><Ionicons name={selected ? item.activeIcon : item.icon} size={22} color={selected ? C.teal : C.muted} /></View><Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{item.label}</Text>{item.key === 'monitor' && monitoring ? <View style={styles.tabLiveDot} /> : null}</TouchableOpacity>;
      })}
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState('home');
  const [monitoring, setMonitoring] = useState(false);
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyReadError, setHistoryReadError] = useState(null);
  const [historyWriteError, setHistoryWriteError] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const pendingEventsRef = useRef(new Map());

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const savedEvents = await readEvents();
      setEvents((current) => mergeEvents(current, savedEvents));
      setHistoryLoaded(true);
      setHistoryReadError(null);
    } catch (error) {
      console.warn('Unable to read event history', error);
      setHistoryReadError('Your saved journal could not be loaded. Existing records are kept untouched.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_SETTINGS);
        const saved = raw ? JSON.parse(raw) : null;
        if (alive && saved && typeof saved === 'object' && !Array.isArray(saved)) {
          setSettings((current) => ({ ...current, ...saved }));
        }
        if (alive) setSettingsLoaded(true);
      } catch (error) {
        console.warn('Unable to read settings', error);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    AsyncStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)).catch((error) => console.warn('Unable to save settings', error));
  }, [settings, settingsLoaded]);

  const persistEvent = useCallback(async (event) => {
    try {
      await appendEvent(event);
      pendingEventsRef.current.delete(event.id);
      setPendingCount(pendingEventsRef.current.size);
      if (pendingEventsRef.current.size === 0) setHistoryWriteError(null);
    } catch (error) {
      console.warn('Unable to save event history', error);
      setHistoryWriteError('Some alerts have not been saved yet. Keep the app open and tap Retry.');
    }
  }, []);

  const addEvent = useCallback((event) => {
    pendingEventsRef.current.set(event.id, event);
    setPendingCount(pendingEventsRef.current.size);
    setEvents((current) => mergeEvents([event], current));
    persistEvent(event);
  }, [persistEvent]);

  const retryHistory = useCallback(() => {
    if (historyReadError) loadHistory();
    pendingEventsRef.current.forEach((event) => { persistEvent(event); });
  }, [historyReadError, loadHistory, persistEvent]);

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
    if (monitoring && nextTab !== 'monitor') stopMonitoring();
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

  return (
    <SafeAreaView style={styles.appRoot}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} translucent={false} />
      <ExpoStatusBar style="dark" backgroundColor={C.bg} translucent={false} />
      <View style={styles.topBar}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="DrowsyGuard home" style={styles.topBrand} onPress={() => changeTab('home')} activeOpacity={0.85}>
          <View style={styles.topBrandMark}><Ionicons name="shield-checkmark" size={24} color={C.mint} /></View>
          <View style={{ flexShrink: 1 }}><Text style={styles.topBrandName}>DrowsyGuard</Text><Text style={styles.topBrandSubtitle}>{monitoring ? 'YOUR FOCUS, LIVE' : 'YOUR EVERYDAY CO-PILOT'}</Text></View>
        </TouchableOpacity>
        <View style={styles.localBadge}><LiveDot active={monitoring} /><Text style={styles.localBadgeText}>{monitoring ? 'Live' : 'On device'}</Text></View>
      </View>
      <View style={styles.mainContent}>
        {historyReadError || historyWriteError ? <View style={styles.storageBanner} accessibilityLiveRegion="polite"><Ionicons name="alert-circle-outline" size={20} color={C.coral} /><Text style={styles.storageBannerText}>{[historyReadError, historyWriteError].filter(Boolean).join(' ')}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry saving or loading history" onPress={retryHistory}><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View> : null}
        <ScreenEntrance key={tab} style={{ flex: 1 }}>
          {tab === 'home' ? <DashboardScreen events={events} historyLoaded={historyLoaded} onStart={startMonitoring} onTab={changeTab} /> : null}
          {tab === 'monitor' ? <MonitorScreen monitoring={monitoring} settings={settings} onStart={startMonitoring} onStop={stopMonitoring} onNewEvent={addEvent} onTestAlert={testAlert} /> : null}
          {tab === 'history' ? <HistoryScreen events={events} historyLoaded={historyLoaded} historyLoading={historyLoading} pendingCount={pendingCount} /> : null}
          {tab === 'settings' ? <SettingsScreen settings={settings} setSettings={setSettings} onTestAlert={testAlert} /> : null}
        </ScreenEntrance>
      </View>
      <TabBar tab={tab} onTab={changeTab} monitoring={monitoring} />
    </SafeAreaView>
  );
}
