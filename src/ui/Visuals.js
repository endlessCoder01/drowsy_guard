import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, styles } from './theme';

export function ScreenEntrance({ children, style }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let alive = true;
    let animation;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!alive || reduceMotion) return;
      opacity.setValue(0);
      animation = Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: Platform.OS !== 'web' });
      animation.start();
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (enabled) { animation?.stop(); opacity.setValue(1); }
    });
    return () => { alive = false; animation?.stop(); subscription.remove(); };
  }, [opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

export function LiveDot({ active = false, color = C.teal }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let alive = true;
    let animation;
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!alive || !active || reduceMotion) return;
      animation = Animated.loop(Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
      ]));
      animation.start();
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (enabled) { animation?.stop(); opacity.setValue(1); }
    });
    return () => { alive = false; animation?.stop(); opacity.setValue(1); subscription.remove(); };
  }, [active, opacity]);
  return <Animated.View accessible={false} style={[styles.statusDot, { backgroundColor: color, opacity }]} />;
}

export function RadarVisual() {
  return (
    <View style={styles.heroVisual} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={styles.radarOuter} />
      <View style={styles.radarMiddle} />
      <View style={styles.radarInner}>
        <View style={styles.radarEyes}>
          <View style={styles.radarEye}><View style={styles.radarPupil} /></View>
          <View style={styles.radarEye}><View style={styles.radarPupil} /></View>
        </View>
      </View>
      <View style={styles.radarSpark} />
      <View style={styles.radarCaption}><Ionicons name="shield-checkmark-outline" size={13} color={C.mint} /><Text style={styles.radarCaptionText}>On-device intelligence</Text></View>
    </View>
  );
}
