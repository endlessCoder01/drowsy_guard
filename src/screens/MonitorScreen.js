import React from 'react';
import {
  Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text,
  TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pill, PrimaryButton } from '../components';
import useEyeMonitoring from '../hooks/useEyeMonitoring';
import { isExpoGo, VisionCamera } from '../services/cameraRuntime';
import { C, styles } from '../ui/theme';
import { LiveDot } from '../ui/Visuals';
import { formatDuration } from '../utils/formatters';

function CameraPlaceholder({ monitoring }) {
  return (
    <View style={styles.cameraPlaceholder}>
      <View style={styles.cameraGlyph}><Ionicons name="scan-outline" size={34} color={C.mint} /></View>
      <Text style={styles.cameraPlaceholderTitle}>{monitoring ? 'Opening camera\u2026' : 'Camera is off'}</Text>
      <Text style={styles.cameraPlaceholderText}>
        {monitoring
          ? (isExpoGo ? 'Live monitoring needs the DrowsyGuard development build.' : 'Check the camera permission if your preview does not appear.')
          : 'Start a session to begin face and eye monitoring.'}
      </Text>
    </View>
  );
}

function ClosureMeter({ closureDuration, settings, progress, color, dark = false }) {
  return (
    <View>
      <View style={styles.progressLabels}>
        <Text style={[styles.progressText, dark && monitorStyles.lightMuted]}>Eye-closure timer</Text>
        <Text style={[styles.progressText, dark && monitorStyles.lightMuted]}>
          {formatDuration(closureDuration)} / {formatDuration(settings.closureDurationMs)}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Eye closure duration"
        accessibilityValue={{ min: 0, max: settings.closureDurationMs, now: Math.min(closureDuration, settings.closureDurationMs) }}
        style={[styles.progressTrack, dark && monitorStyles.darkTrack]}>
        <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export default function MonitorScreen({ monitoring, settings, onStart, onStop, onExit, onNewEvent, onTestAlert, sessionModeLabel, starting = false }) {
  const live = useEyeMonitoring({ monitoring, settings, onNewEvent });
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const exitSession = onExit || onStop;
  const liveColor = live.monitorStatus === 'drowsy' ? '#FF8F7D'
    : live.monitorStatus === 'eyes-closing' ? '#FFD17B'
      : live.monitorStatus === 'alert' ? C.mint : '#D1E0EB';

  if (monitoring) {
    return (
      <View style={monitorStyles.fullScreen}>
        {live.device && VisionCamera ? (
          <VisionCamera style={StyleSheet.absoluteFill} device={live.device} isActive={monitoring} frameProcessor={live.frameProcessor} />
        ) : <CameraPlaceholder monitoring />}
        <View pointerEvents="none" style={[monitorStyles.faceGuide, landscape && monitorStyles.faceGuideLandscape]} />
        <SafeAreaView style={[monitorStyles.overlay, landscape && monitorStyles.overlayLandscape]}>
          <View style={[monitorStyles.sessionHeader, landscape && monitorStyles.sessionHeaderLandscape]}>
            <View style={monitorStyles.sessionRow}>
              <View style={monitorStyles.sessionLabel}>
                <LiveDot active color={C.mint} />
                <Text style={monitorStyles.eyebrow}>SESSION ACTIVE</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="End monitoring and exit full screen" onPress={exitSession} activeOpacity={0.8} style={monitorStyles.exitButton}>
                <Ionicons name="contract-outline" size={23} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text accessibilityLiveRegion="polite" style={[monitorStyles.liveStatus, { color: liveColor }]}>{live.statusLabel}</Text>
            <Text style={monitorStyles.cameraLabel}>FRONT CAMERA · {live.modelState === 'loaded' ? 'CUSTOM CNN' : 'ML KIT'}</Text>
            {sessionModeLabel ? <Text style={monitorStyles.modeLabel}>{sessionModeLabel}</Text> : null}
          </View>

          <View style={[monitorStyles.livePanel, landscape && monitorStyles.livePanelLandscape]}>
            <View style={monitorStyles.metrics}>
              <View style={monitorStyles.metric}>
                <Text style={monitorStyles.metricLabel}>EYE OPEN</Text>
                <Text style={monitorStyles.metricValue}>{live.eyeScore === null ? '\u2014' : `${Math.round(live.eyeScore * 100)}%`}</Text>
              </View>
              <View style={monitorStyles.metric}>
                <Text style={monitorStyles.metricLabel}>ALERT AT</Text>
                <Text style={monitorStyles.metricValue}>{formatDuration(settings.closureDurationMs)}</Text>
              </View>
              <View style={monitorStyles.metric}>
                <Text style={monitorStyles.metricLabel}>FACE</Text>
                <Text style={monitorStyles.metricValue}>{live.faceSeen ? 'Found' : '\u2014'}</Text>
              </View>
            </View>
            <ClosureMeter closureDuration={live.closureDuration} settings={settings} progress={live.progress} color={liveColor} dark />
            <Text style={monitorStyles.statusDescription} numberOfLines={landscape ? 2 : 3}>{live.statusDescription}</Text>
            <PrimaryButton title="Stop session" icon="stop-circle-outline" onPress={onStop} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.screenHeaderRow}>
        <View><Text style={styles.screenEyebrow}>LIVE ANALYSIS</Text><Text style={styles.screenTitle}>Monitor</Text></View>
        <Pill label="SESSION OFF" kind="soft" />
      </View>
      <View style={styles.cameraFrame}><CameraPlaceholder monitoring={false} /></View>
      <View style={[styles.statusCard, { backgroundColor: live.statusBackground }]}>
        <View style={styles.statusHeader}>
          <LiveDot color={C.muted} />
          <Text style={styles.statusTitle}>Ready when you are</Text>
        </View>
        <Text style={styles.statusDescription}>Your camera fills the screen during a session. Mount your phone and keep both eyes in view.</Text>
      </View>
      <View style={styles.twoButtons}>
        <View style={styles.buttonCell}><PrimaryButton title={starting ? 'Opening...' : 'Start session'} disabled={starting} icon="scan-outline" onPress={onStart} /></View>
        <View style={styles.buttonCell}><PrimaryButton title="Test alert" icon="volume-high-outline" onPress={onTestAlert} secondary /></View>
      </View>
      <Text style={styles.helperText}>Eye-open scores are model estimates. Sunglasses, darkness, head turns and camera angle may reduce reliability.</Text>
    </ScrollView>
  );
}

const monitorStyles = StyleSheet.create({
  fullScreen: { flex: 1, width: '100%', backgroundColor: C.darker },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 10 : 10,
    paddingBottom: Platform.OS === 'android' ? 24 : 10,
    paddingHorizontal: 18,
  },
  overlayLandscape: { flexDirection: 'row', alignItems: 'stretch', gap: 18, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 18 },
  faceGuide: { position: 'absolute', top: '20%', bottom: '35%', left: '19%', right: '19%', borderWidth: 1.5, borderColor: 'rgba(99,226,194,0.65)', borderRadius: 140 },
  faceGuideLandscape: { top: '13%', bottom: '10%', left: '12%', right: '53%' },
  sessionHeader: { marginTop: 8, padding: 15, borderRadius: 21, backgroundColor: 'rgba(8,26,40,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  sessionHeaderLandscape: { alignSelf: 'flex-start', flex: 1, maxWidth: 360, marginTop: 0 },
  sessionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sessionLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { color: C.mint, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  exitButton: { minWidth: 42, minHeight: 42, marginVertical: -6, marginRight: -4, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  liveStatus: { marginTop: 12, fontSize: 22, fontWeight: '900', letterSpacing: -0.6 },
  cameraLabel: { marginTop: 8, color: '#D1E0EB', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  modeLabel: { marginTop: 7, color: '#D1E0EB', fontSize: 11, lineHeight: 16 },
  livePanel: { marginTop: 24, padding: 18, borderRadius: 25, backgroundColor: 'rgba(8,26,40,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.17)', gap: 14 },
  livePanelLandscape: { width: 310, maxWidth: '48%', alignSelf: 'flex-end', marginTop: 0, padding: 15, gap: 11 },
  metrics: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1 },
  metricLabel: { color: '#BCD1DF', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  metricValue: { marginTop: 6, color: '#FFFFFF', fontSize: 23, fontWeight: '900', fontVariant: ['tabular-nums'] },
  lightMuted: { color: '#D1E0EB' },
  darkTrack: { marginTop: 9, height: 8, backgroundColor: '#344C5F' },
  statusDescription: { color: '#D1E0EB', fontSize: 12, lineHeight: 18 },
});
