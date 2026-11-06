import React from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, styles } from '../ui/theme';
import { formatClock, formatDuration } from '../utils/formatters';

export default function EventRow({ event }) {
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
