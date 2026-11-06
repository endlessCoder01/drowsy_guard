import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, styles } from '../ui/theme';

export default function PrimaryButton({ title, onPress, disabled = false, secondary = false, compact = false, icon }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled} activeOpacity={0.78}
      style={[secondary ? styles.buttonSecondary : styles.buttonPrimary, compact && styles.buttonCompact, disabled && styles.buttonDisabled]}>
      {icon ? <Ionicons name={icon} size={18} color={disabled ? C.muted : secondary ? C.text : C.darker} /> : null}
      <Text style={[secondary ? styles.buttonSecondaryText : styles.buttonPrimaryText, disabled && styles.buttonTextDisabled]}>{title}</Text>
    </TouchableOpacity>
  );
}
