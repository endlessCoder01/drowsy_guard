import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, styles } from '../ui/theme';

export default function TabBar({ tab, onTab, monitoring }) {
  const tabs = [
    { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { key: 'monitor', label: 'Monitor', icon: 'scan-outline', activeIcon: 'scan' },
    { key: 'history', label: 'Journal', icon: 'albums-outline', activeIcon: 'albums' },
    { key: 'settings', label: 'Settings', icon: 'options-outline', activeIcon: 'options' },
  ];
  return (
    <View style={styles.tabBar} accessibilityRole="tablist">
      {tabs.map((item) => {
        const selected = tab === item.key;
        return <TouchableOpacity key={item.key} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={item.label} style={styles.tabItem} onPress={() => onTab(item.key)} activeOpacity={0.8}><View style={[styles.tabGlyphBox, selected && styles.tabGlyphBoxSelected]}><Ionicons name={selected ? item.activeIcon : item.icon} size={22} color={selected ? C.teal : C.muted} /></View><Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{item.label}</Text>{item.key === 'monitor' && monitoring ? <View style={styles.tabLiveDot} /> : null}</TouchableOpacity>;
      })}
    </View>
  );
}
