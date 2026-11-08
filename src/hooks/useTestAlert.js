import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as Speech from 'expo-speech';
import { vibrateAlert } from '../services/driveMode';

export default function useTestAlert(settings) {
  return useCallback(() => {
    if (settings.audioAlerts) {
      Speech.stop();
      Speech.speak('DrowsyGuard test alert. Please keep your attention on the road.', { rate: 0.9 });
    }
    if (settings.vibrationAlerts) vibrateAlert([0, 350, 180, 350]);
    if (!settings.audioAlerts && !settings.vibrationAlerts) Alert.alert('Alerts disabled', 'Enable voice warning or vibration in Settings to test an alert.');
  }, [settings.audioAlerts, settings.vibrationAlerts]);
}
