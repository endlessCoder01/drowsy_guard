import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import * as Speech from 'expo-speech';
import { VisionCamera, nativeCameraModulesAvailable } from '../services/cameraRuntime';
import { getDriveStatus, startDriveMode, stopDriveMode, requestBluetoothPermission, subscribeToDriveStatus } from '../services/driveMode';

function sessionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
const foreground = () => !AppState.currentState || AppState.currentState === 'active';

export default function useDriveSession() {
  const [monitoring, setMonitoring] = useState(false);
  const [starting, setStarting] = useState(false);
  const [driveStatus, setDriveStatus] = useState(null);
  const [driveError, setDriveError] = useState(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const statusRevision = useRef(0);
  const monitoringRef = useRef(false);
  const startingRef = useRef(false);
  const nativeStarting = useRef(false);

  const refreshStatus = useCallback(async () => {
    const revision = ++statusRevision.current;
    try {
      const status = await getDriveStatus();
      if (mounted.current && revision === statusRevision.current) setDriveStatus(status);
      return status;
    } catch (error) {
      if (mounted.current && revision === statusRevision.current) setDriveError(error.message);
      return null;
    }
  }, []);

  const stopSession = useCallback(async () => {
    const stoppedGeneration = ++generation.current;
    ++statusRevision.current;
    monitoringRef.current = false;
    startingRef.current = false;
    nativeStarting.current = false;
    Speech.stop();
    Vibration.cancel();
    if (mounted.current) { setMonitoring(false); setStarting(false); }
    try {
      const status = await stopDriveMode();
      if (mounted.current && stoppedGeneration === generation.current) {
        setDriveStatus(status);
        setDriveError(null);
      }
    } catch (error) {
      if (mounted.current) setDriveError('Could not restore drive focus. Check Do Not Disturb in Android Settings.');
      console.warn('Unable to stop drive mode', error);
    }
  }, []);

  const startSession = useCallback(async ({ enableQuiet = true } = {}) => {
    if (startingRef.current || monitoringRef.current) return false;
    const currentGeneration = ++generation.current;
    ++statusRevision.current;
    const current = () => mounted.current && currentGeneration === generation.current && foreground();
    startingRef.current = true;
    setStarting(true);
    setDriveError(null);
    try {
      if (!nativeCameraModulesAvailable) throw sessionError('E_CAMERA_UNAVAILABLE', 'Live monitoring requires the DrowsyGuard development build.');
      const permission = await VisionCamera.requestCameraPermission();
      if (!current()) return false;
      if (permission !== 'granted' && permission !== 'authorized') throw sessionError('E_CAMERA_PERMISSION', 'Allow camera access in phone Settings to start monitoring.');
      const status = await getDriveStatus();
      if (!current()) return false;
      if (enableQuiet) {
        if (!status.available) throw sessionError('E_DRIVE_UNAVAILABLE', status.reason);
        if (!status.focusSupported) throw sessionError('E_FOCUS_UNSUPPORTED', 'Quiet drive requires Android 10 or later. Full-screen monitoring is still available.');
        if (!status.policyAccessGranted) throw sessionError('E_POLICY_ACCESS', 'Allow Do Not Disturb access to reduce notifications while monitoring.');
        await requestBluetoothPermission();
        if (!current()) return false;
      }
      nativeStarting.current = true;
      const activeStatus = await startDriveMode(enableQuiet);
      nativeStarting.current = false;
      if (!current()) {
        // stopSession already queued restoration; repeat only if no newer session exists.
        if (!startingRef.current && !monitoringRef.current) await stopDriveMode();
        return false;
      }
      if (!activeStatus.sessionActive) throw sessionError('E_SESSION_INACTIVE', 'The monitor could not stay active. Return to the app and try again.');
      ++statusRevision.current;
      monitoringRef.current = true;
      setDriveStatus(activeStatus);
      setMonitoring(true);
      return true;
    } catch (error) {
      if (currentGeneration === generation.current && mounted.current) {
        await stopDriveMode().catch(() => {});
        if (currentGeneration !== generation.current) return false;
        setDriveError(error.message);
        throw error;
      }
      return false;
    } finally {
      if (currentGeneration === generation.current) {
        startingRef.current = false;
        nativeStarting.current = false;
        if (mounted.current) setStarting(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refreshStatus();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        if (monitoringRef.current || nativeStarting.current) stopSession();
      } else {
        refreshStatus();
      }
    });
    const unsubscribe = subscribeToDriveStatus((status) => {
      if (!mounted.current) return;
      ++statusRevision.current;
      setDriveStatus(status);
      if (monitoringRef.current && !status.sessionActive) stopSession();
    });
    return () => {
      mounted.current = false;
      appStateSubscription.remove();
      unsubscribe();
      stopSession();
    };
  }, [refreshStatus, stopSession]);

  return { monitoring, starting, driveStatus, driveError, startSession, stopSession, refreshStatus };
}
