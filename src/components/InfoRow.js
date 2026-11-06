import React from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, styles } from '../ui/theme';

export default function InfoRow({ icon, title, text }) {
  return <View style={styles.infoRow}><View style={styles.numberChip}><Ionicons name={icon} size={21} color={C.blue} /></View><View style={styles.infoBody}><Text style={styles.infoTitle}>{title}</Text><Text style={styles.infoText}>{text}</Text></View></View>;
}
