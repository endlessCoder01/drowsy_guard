import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import AppShell from './src/components/AppShell';
import { StorageBanner } from './src/components';
import DriveFocusSettings, { DriveModeNotice } from './src/components/DriveFocusSettings';
import DashboardScreen from './src/screens/DashboardScreen';
import MonitorScreen from './src/screens/MonitorScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import useEventHistory from './src/hooks/useEventHistory';
import useSettings from './src/hooks/useSettings';
import useDriveSession from './src/hooks/useDriveSession';
import useTestAlert from './src/hooks/useTestAlert';
import { describeDriveStatus, openNotificationPolicySettings, requestBluetoothPermission } from './src/services/driveMode';

export default function App() {
  const [tab, setTab] = useState('home');
  const history = useEventHistory();
  const { settings, setSettings } = useSettings();
  const session = useDriveSession();
  const testAlert = useTestAlert(settings);

  const openFocusSettings = useCallback(async () => {
    try { await openNotificationPolicySettings(); }
    catch (error) { Alert.alert('Unable to open focus settings', error.message); }
  }, []);

  const allowBluetooth = useCallback(async () => {
    try {
      await requestBluetoothPermission();
      await session.refreshStatus();
    } catch (error) { Alert.alert('Bluetooth access', error.message); }
  }, [session.refreshStatus]);

  const beginMonitoring = useCallback(async function begin(enableQuiet) {
    try {
      if (await session.startSession({ enableQuiet })) setTab('monitor');
    } catch (error) {
      if (['E_POLICY_ACCESS', 'E_DRIVE_UNAVAILABLE', 'E_FOCUS_UNSUPPORTED'].includes(error.code)) {
        const actions = [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Monitor only', onPress: () => begin(false) },
        ];
        if (error.code === 'E_POLICY_ACCESS') actions.push({ text: 'Set up focus', onPress: () => { setTab('settings'); openFocusSettings(); } });
        Alert.alert('Quiet drive needs setup', error.message + '\nYou can also monitor with your current notification settings.', actions);
      } else {
        Alert.alert('Unable to start monitoring', error.message || String(error));
      }
    }
  }, [session.startSession, openFocusSettings]);

  const startMonitoring = useCallback(() => { beginMonitoring(settings.quietDriveEnabled); }, [beginMonitoring, settings.quietDriveEnabled]);
  const changeTab = useCallback((nextTab) => {
    if (session.monitoring && nextTab !== 'monitor') session.stopSession();
    setTab(nextTab);
  }, [session.monitoring, session.stopSession]);

  const feedback = <>
    <StorageBanner readError={history.historyReadError} writeError={history.historyWriteError} onRetry={history.retryHistory} />
    <DriveModeNotice error={session.driveError} onOpenSettings={() => changeTab('settings')} />
  </>;
  const focusSettings = <DriveFocusSettings
    enabled={settings.quietDriveEnabled}
    onToggle={() => setSettings((current) => ({ ...current, quietDriveEnabled: !current.quietDriveEnabled }))}
    status={session.driveStatus}
    onOpenSettings={openFocusSettings}
    onBluetoothAccess={allowBluetooth}
    onRefresh={session.refreshStatus}
  />;

  return (
    <AppShell immersive={session.monitoring} tab={tab} onTab={changeTab} onExit={session.stopSession} feedback={feedback}>
      {tab === 'home' ? <DashboardScreen events={history.events} historyLoaded={history.historyLoaded} onStart={startMonitoring} starting={session.starting} onTab={changeTab} /> : null}
      {tab === 'monitor' ? <MonitorScreen monitoring={session.monitoring} starting={session.starting} settings={settings} onStart={startMonitoring} onStop={session.stopSession} onExit={session.stopSession} onNewEvent={history.addEvent} onTestAlert={testAlert} sessionModeLabel={describeDriveStatus(session.driveStatus)} /> : null}
      {tab === 'history' ? <HistoryScreen events={history.events} historyLoaded={history.historyLoaded} historyLoading={history.historyLoading} pendingCount={history.pendingCount} /> : null}
      {tab === 'settings' ? <SettingsScreen settings={settings} setSettings={setSettings} onTestAlert={testAlert} extraContent={focusSettings} /> : null}
    </AppShell>
  );
}
