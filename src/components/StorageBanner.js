import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, styles } from '../ui/theme';

export default function StorageBanner({ readError, writeError, onRetry }) {
  const message = [readError, writeError].filter(Boolean).join(' ');
  if (!message) return null;
  return (
    <View style={styles.storageBanner} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle-outline" size={20} color={C.coral} />
      <Text style={styles.storageBannerText}>{message}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry saving or loading history" onPress={onRetry}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}
