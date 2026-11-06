import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, styles } from '../ui/theme';
import { LiveDot } from '../ui/Visuals';

export default function AppHeader({ monitoring, onHome }) {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="DrowsyGuard home" style={styles.topBrand} onPress={onHome} activeOpacity={0.85}>
        <View style={styles.topBrandMark}><Ionicons name="shield-checkmark" size={24} color={C.mint} /></View>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.topBrandName}>DrowsyGuard</Text>
          <Text style={styles.topBrandSubtitle}>{monitoring ? 'YOUR FOCUS, LIVE' : 'YOUR EVERYDAY CO-PILOT'}</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.localBadge}>
        <LiveDot active={monitoring} />
        <Text style={styles.localBadgeText}>{monitoring ? 'Live' : 'On device'}</Text>
      </View>
    </View>
  );
}
