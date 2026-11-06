import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../ui/theme';

export default function ToggleRow({ label, description, value, onToggle }) {
  return (
    <TouchableOpacity accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={description} accessibilityState={{ checked: value }} style={styles.toggleRow} onPress={onToggle} activeOpacity={0.8}>
      <View style={styles.toggleBody}><Text style={styles.settingTitle}>{label}</Text><Text style={styles.settingDescription}>{description}</Text></View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}><View style={[styles.toggleKnob, value && styles.toggleKnobOn]} /></View>
    </TouchableOpacity>
  );
}
