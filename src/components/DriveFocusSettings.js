import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import PrimaryButton from './PrimaryButton';
import ToggleRow from './ToggleRow';
import { C, styles } from '../ui/theme';

export function DriveModeNotice({ error, onOpenSettings }) {
  if (!error) return null;
  return <View style={styles.storageBanner} accessibilityLiveRegion="polite"><Ionicons name="information-circle-outline" size={21} color={C.coral} /><Text style={styles.storageBannerText}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={onOpenSettings}><Text style={styles.retryText}>Settings</Text></TouchableOpacity></View>;
}

export default function DriveFocusSettings({ enabled, onToggle, status, onOpenSettings, onBluetoothAccess, onRefresh }) {
  const available = status?.available && status?.focusSupported;
  const message = !status ? 'Checking focus access…'
    : status.cleanupPending ? 'Drive focus cleanup could not be confirmed. Open Do Not Disturb settings to check the DrowsyGuard rule.'
    : !available ? status.reason || 'Quiet drive requires Android 10 or later.'
      : !status.policyAccessGranted ? 'One-time Do Not Disturb access is needed to silence notifications.'
        : !status.bluetoothPermissionGranted ? 'Music is allowed. Calls stay silenced until Bluetooth access is granted and a headset is connected.'
          : status.bluetoothCallConnected ? 'Bluetooth headset connected. Drive focus permits call interruptions and music.'
            : 'No Bluetooth call headset connected. Drive focus silences calls and permits music.';
  return (
    <View style={styles.settingCard}>
      <ToggleRow label="Quiet drive" description="Reduce interruptions during a monitoring session." value={enabled} onToggle={onToggle} />
      <View style={styles.rowDivider} />
      <View style={[styles.infoRow, { paddingBottom: 4 }]}><Ionicons name="shield-checkmark-outline" size={24} color={C.teal} /><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Music and Bluetooth calls</Text><Text style={styles.settingDescription}>{message}</Text></View></View>
      {available && !status.policyAccessGranted ? <View style={{ marginTop: 14 }}><PrimaryButton title="Allow Do Not Disturb access" icon="notifications-off-outline" onPress={onOpenSettings} secondary /></View> : null}
      {available && status.policyAccessGranted ? <View style={{ marginTop: 14 }}><PrimaryButton title="Manage Do Not Disturb" icon="notifications-off-outline" onPress={onOpenSettings} secondary /></View> : null}
      {available && !status.bluetoothPermissionGranted ? <View style={{ marginTop: 12 }}><PrimaryButton title="Allow Bluetooth detection" icon="bluetooth-outline" onPress={onBluetoothAccess} secondary /></View> : null}
      {available ? <View style={{ marginTop: 12 }}><PrimaryButton title="Check connection and access" icon="refresh-outline" onPress={onRefresh} secondary compact /></View> : null}
      <Text style={[styles.helperText, { marginTop: 14 }]}>Your phone controls call routing. Stricter Do Not Disturb rules may still block calls or music, and system exceptions can still appear. Monitoring stops when you leave the app; start again after returning.</Text>
      {Platform.OS === 'ios' ? <Text style={[styles.helperText, { marginTop: 8 }]}>Configure Driving Focus in iPhone Settings. This app cannot switch it on automatically.</Text> : null}
    </View>
  );
}
