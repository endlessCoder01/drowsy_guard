import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, styles } from '../ui/theme';

export default function Stepper({ label, value, display, onDecrease, onIncrease, description, min, max }) {
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
