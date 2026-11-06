import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../ui/theme';

export default function SectionTitle({ title, action, onAction }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <TouchableOpacity accessibilityRole="button" onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></TouchableOpacity> : null}
    </View>
  );
}
