import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

const native = Platform.OS === 'android' ? NativeModules.DrowsyGuardDriveMode : null;
let nativeQueue = Promise.resolve();
const unsupportedStatus = () => ({
  available: false, focusSupported: false, policyAccessGranted: false,
  bluetoothPermissionGranted: false, bluetoothCallConnected: false,
  bluetoothCallRouteActive: false, sessionActive: false, focusActive: false,
  focusStateConfirmed: false,
  reason: Platform.OS === 'ios'
    ? 'Use Driving Focus in iPhone Settings to silence notifications.'
    : Platform.OS === 'web' ? 'Quiet drive is available in the Android app.'
      : 'Quiet drive is not available in this build.',
});

// Serialize native mutations so a late start cannot outlive a newer stop.
function enqueue(operation) {
  const result = nativeQueue.then(operation);
  nativeQueue = result.catch(() => {});
  return result;
}
export function getDriveStatus() {
  return native ? native.getStatus() : Promise.resolve(unsupportedStatus());
}
export function startDriveMode(enableQuiet) {
  return enqueue(async () => {
    if (native) return native.start(enableQuiet);
    if (enableQuiet) {
      const error = new Error(unsupportedStatus().reason);
      error.code = 'E_DRIVE_UNAVAILABLE';
      throw error;
    }
    return { ...unsupportedStatus(), sessionActive: true };
  });
}
export function stopDriveMode() {
  return enqueue(() => native ? native.stop() : Promise.resolve(unsupportedStatus()));
}
export function subscribeToDriveStatus(listener) {
  if (!native) return () => {};
  const subscription = new NativeEventEmitter(native).addListener('DrowsyGuardDriveModeChanged', listener);
  return () => subscription.remove();
}
export async function requestBluetoothPermission() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) return true;
  const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  if (await PermissionsAndroid.check(permission)) return true;
  return await PermissionsAndroid.request(permission, {
    title: 'Allow Bluetooth call detection',
    message: 'Quiet drive allows call interruptions only while a Bluetooth headset is connected. Music can continue without this permission.',
    buttonPositive: 'Continue', buttonNegative: 'Not now',
  }) === PermissionsAndroid.RESULTS.GRANTED;
}
export function openNotificationPolicySettings() {
  if (!native) return Promise.resolve(unsupportedStatus());
  return native.openNotificationPolicySettings();
}
