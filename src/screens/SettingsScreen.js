import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, styles } from '../ui/theme';
import { Stepper, ToggleRow, PrimaryButton } from '../components';

export default function SettingsScreen({ settings, setSettings, onTestAlert, extraContent }) {
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
      {extraContent}
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
