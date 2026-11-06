import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS, STORAGE_SETTINGS } from '../config/settings';

export default function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_SETTINGS);
        const saved = raw ? JSON.parse(raw) : null;
        if (alive && saved && typeof saved === 'object' && !Array.isArray(saved)) {
          setSettings((current) => ({ ...current, ...saved }));
        }
        if (alive) setSettingsLoaded(true);
      } catch (error) {
        console.warn('Unable to read settings', error);
      }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!settingsLoaded) return;
    AsyncStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)).catch((error) => console.warn('Unable to save settings', error));
  }, [settings, settingsLoaded]);
  return { settings, setSettings, settingsLoaded };
}
