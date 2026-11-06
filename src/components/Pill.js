import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../ui/theme';

export default function Pill({ label, kind = 'neutral' }) {
  const style = kind === 'dark' ? styles.pillDark : kind === 'soft' ? styles.pillSoft : styles.pill;
  return <View style={style}><Text style={kind === 'dark' ? styles.pillTextLight : styles.pillText}>{label}</Text></View>;
}
