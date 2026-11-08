const assert = require('node:assert/strict');
const { deferred, moduleLoader, hookRuntime } = require('./hook-test-utils.cjs');

const idleStatus = (overrides = {}) => ({
  available: true, focusSupported: true, policyAccessGranted: true,
  bluetoothPermissionGranted: true, bluetoothCallConnected: true,
  bluetoothCallRouteActive: false, sessionActive: false, focusActive: false,
  focusStateConfirmed: true, ...overrides,
});
const activeStatus = (overrides = {}) => idleStatus({ sessionActive: true, focusActive: true, ...overrides });
async function drainPromises() {
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

function harness(options = {}) {
  const runtime = hookRuntime();
  const calls = [];
  const appListeners = new Set();
  const nativeListeners = new Set();
  let nativeStatus = idleStatus(options.status);
  const camera = {
    getCameraPermissionStatus() {
      calls.push(['cameraStatus']);
      return options.cameraStatus ?? (options.camera ? 'not-determined' : 'granted');
    },
    requestCameraPermission() {
      calls.push(['camera']);
      return options.camera ? options.camera() : Promise.resolve('granted');
    },
  };
  const native = {
    getStatus() { calls.push(['getStatus']); return options.getStatus ? options.getStatus() : Promise.resolve(nativeStatus); },
    start(quiet) {
      calls.push(['start', quiet]);
      if (options.start) return options.start(quiet);
      nativeStatus = activeStatus({ ...options.status, focusActive: quiet });
      return Promise.resolve(nativeStatus);
    },
    stop() {
      calls.push(['stop']);
      if (options.stop) return options.stop();
      nativeStatus = idleStatus(options.status);
      return Promise.resolve(nativeStatus);
    },
    vibrateAlert() { calls.push(['vibrateAlert']); return Promise.resolve(); },
    cancelAlertVibration() { calls.push(['cancelAlertVibration']); },
    openNotificationPolicySettings() { calls.push(['settings']); return Promise.resolve(nativeStatus); },
  };
  const reactNative = {
    Platform: { OS: options.os || 'android', Version: options.version || 35 },
    NativeModules: { DrowsyGuardDriveMode: options.noNative ? undefined : native },
    NativeEventEmitter: class {
      addListener(name, listener) {
        assert.equal(name, 'DrowsyGuardDriveModeChanged');
        nativeListeners.add(listener);
        return { remove() { nativeListeners.delete(listener); } };
      }
    },
    PermissionsAndroid: {
      PERMISSIONS: { BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT' },
      RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
      async check(permission) {
        calls.push(['bluetoothCheck', permission]);
        return options.bluetoothGranted !== false;
      },
      async request(permission) {
        calls.push(['bluetoothRequest', permission]);
        return options.bluetoothRequest ? options.bluetoothRequest() : 'denied';
      },
    },
    AppState: {
      currentState: 'active',
      addEventListener(name, listener) {
        assert.equal(name, 'change');
        appListeners.add(listener);
        return { remove() { appListeners.delete(listener); } };
      },
    },
    Vibration: {
      cancel() { calls.push(['vibrationCancel']); },
      vibrate() { calls.push(['vibration']); },
    },
  };
  const load = moduleLoader({
    react: runtime.hooks,
    'react-native': reactNative,
    'expo-speech': { stop() { calls.push(['speechStop']); } },
    '../services/cameraRuntime': { VisionCamera: camera, nativeCameraModulesAvailable: !options.noCamera },
  });
  const service = load('src/services/driveMode.js');
  const useDriveSession = load('src/hooks/useDriveSession.js').default;
  return {
    runtime, service, calls,
    mount() { runtime.mount(() => useDriveSession()); },
    get state() { return runtime.state; },
    count(name) { return calls.filter(([method]) => method === name).length; },
    appState(state) {
      reactNative.AppState.currentState = state;
      appListeners.forEach((listener) => listener(state));
    },
    emit(status) { nativeListeners.forEach((listener) => listener(status)); },
    listenerCount() { return appListeners.size + nativeListeners.size; },
  };
}

async function mount(options) {
  const app = harness(options);
  app.mount();
  await app.runtime.settle();
  return app;
}

async function serviceChecks() {
  for (const os of ['android', 'ios', 'web']) {
    const app = harness({ os, noNative: true });
    const before = await app.service.getDriveStatus();
    assert.equal(before.available, false);
    assert.equal(before.focusActive, false);
    await assert.rejects(app.service.startDriveMode(true), { code: 'E_DRIVE_UNAVAILABLE' });
    const fullscreen = await app.service.startDriveMode(false);
    assert.equal(fullscreen.sessionActive, true, 'full-screen fallback remains usable');
    assert.equal(fullscreen.focusActive, false, 'a missing native module cannot claim notification suppression');
    assert.equal((await app.service.stopDriveMode()).sessionActive, false);
  }

  const denied = harness({ bluetoothGranted: false });
  assert.equal(await denied.service.requestBluetoothPermission(), false);
  assert.equal(denied.count('bluetoothRequest'), 1);
  const legacyAndroid = harness({ version: 30, bluetoothGranted: false });
  assert.equal(await legacyAndroid.service.requestBluetoothPermission(), true);
  assert.equal(legacyAndroid.count('bluetoothRequest'), 0);

  denied.service.vibrateAlert([0, 200, 100, 200]);
  denied.service.cancelAlertVibration();
  assert.equal(denied.count('vibrateAlert'), 1);
  assert.equal(denied.count('cancelAlertVibration'), 1);
  assert.equal(denied.count('vibrationCancel'), 1);
  const fallback = harness({ noNative: true });
  fallback.service.vibrateAlert([0, 200]);
  fallback.service.cancelAlertVibration();
  assert.equal(fallback.count('vibration'), 1);
  assert.equal(fallback.count('vibrationCancel'), 1);
  assert.match(denied.service.describeDriveStatus(activeStatus({ quietRequested: true })), /Quiet drive active/);
  assert.doesNotMatch(denied.service.describeDriveStatus(activeStatus({ quietRequested: true, focusStateConfirmed: false })), /Quiet drive active/);
  assert.match(denied.service.describeDriveStatus(activeStatus({ quietRequested: true, bluetoothCallConnected: false })), /Call interruptions silenced/);
  assert.match(denied.service.describeDriveStatus(activeStatus({ quietRequested: false })), /Notifications follow your phone settings/);
  assert.match(denied.service.describeDriveStatus(idleStatus({ cleanupPending: true })), /needs attention/);

  const pendingStart = deferred();
  const sequence = harness({ start: () => pendingStart.promise });
  const started = sequence.service.startDriveMode(true);
  const stopped = sequence.service.stopDriveMode();
  await drainPromises();
  assert.equal(sequence.count('start'), 1);
  assert.equal(sequence.count('stop'), 0, 'restoration waits for the pending native start');
  pendingStart.resolve(activeStatus());
  await started;
  await stopped;
  assert.deepEqual(sequence.calls.filter(([name]) => name === 'start' || name === 'stop'), [['start', true], ['stop']]);

  const failedStart = deferred();
  const recovery = harness({ start: () => failedStart.promise });
  const failure = recovery.service.startDriveMode(true);
  const rejection = assert.rejects(failure, /Native start failed/);
  const restoration = recovery.service.stopDriveMode();
  await drainPromises();
  failedStart.reject(new Error('Native start failed'));
  await rejection;
  await restoration;
  assert.equal(recovery.count('stop'), 1, 'a rejected start must not poison the native mutation queue');

  let delivered;
  const unsubscribe = denied.service.subscribeToDriveStatus((value) => { delivered = value; });
  const emitted = activeStatus({ bluetoothCallConnected: false });
  denied.emit(emitted);
  assert.equal(delivered, emitted);
  unsubscribe();
  assert.equal(denied.listenerCount(), 0);
}

async function permissionAndFailureChecks() {
  for (const cameraStatus of ['granted', 'authorized']) {
    const allowedCamera = await mount({ cameraStatus });
    assert.equal(await allowedCamera.state.startSession({ enableQuiet: false }), true);
    await allowedCamera.runtime.settle();
    assert.equal(allowedCamera.count('cameraStatus'), 1, 'check existing camera access before requesting permission');
    assert.equal(allowedCamera.count('camera'), 0, 'already granted camera access cannot open another permission dialog');
    assert.equal(allowedCamera.state.monitoring, true);
    allowedCamera.runtime.unmount();
    await allowedCamera.runtime.settle();
  }

  const deniedCamera = await mount({ camera: async () => 'denied' });
  await assert.rejects(deniedCamera.state.startSession(), { code: 'E_CAMERA_PERMISSION' });
  await deniedCamera.runtime.settle();
  assert.equal(deniedCamera.state.monitoring, false);
  assert.equal(deniedCamera.state.starting, false);
  assert.equal(deniedCamera.state.driveStatus.focusActive, false);
  assert.equal(deniedCamera.count('start'), 0);

  for (const [status, code] of [
    [{ available: false, reason: 'Native build missing' }, 'E_DRIVE_UNAVAILABLE'],
    [{ focusSupported: false }, 'E_FOCUS_UNSUPPORTED'],
    [{ policyAccessGranted: false }, 'E_POLICY_ACCESS'],
  ]) {
    const app = await mount({ status });
    await assert.rejects(app.state.startSession(), { code });
    await app.runtime.settle();
    assert.equal(app.state.monitoring, false);
    assert.equal(app.state.driveStatus.focusActive, false);
    assert.equal(app.count('start'), 0, `${code} must not invoke native quiet drive`);
  }

  const fullscreen = await mount({ status: { policyAccessGranted: false } });
  assert.equal(await fullscreen.state.startSession({ enableQuiet: false }), true);
  await fullscreen.runtime.settle();
  assert.equal(fullscreen.state.monitoring, true);
  assert.equal(fullscreen.state.driveStatus.focusActive, false);
  assert.equal(fullscreen.count('bluetoothRequest'), 0);
  assert.deepEqual(fullscreen.calls.find(([name]) => name === 'start'), ['start', false]);
  await fullscreen.state.stopSession();

  const blockedCalls = activeStatus({ bluetoothPermissionGranted: false, bluetoothCallConnected: false });
  const deniedBluetooth = await mount({ bluetoothGranted: false, start: async () => blockedCalls });
  assert.equal(await deniedBluetooth.state.startSession(), true);
  await deniedBluetooth.runtime.settle();
  assert.equal(deniedBluetooth.count('bluetoothRequest'), 1);
  assert.equal(deniedBluetooth.state.driveStatus, blockedCalls, 'the UI receives the actual native policy result');
  assert.equal(deniedBluetooth.state.driveStatus.bluetoothCallConnected, false, 'permission denial cannot claim Bluetooth calls are allowed');
  assert.equal(deniedBluetooth.state.driveStatus.bluetoothPermissionGranted, false);
  await deniedBluetooth.state.stopSession();

  const nativeFailure = await mount({ start: async () => { throw new Error('Android rejected policy'); } });
  await assert.rejects(nativeFailure.state.startSession(), /Android rejected policy/);
  await nativeFailure.runtime.settle();
  assert.equal(nativeFailure.state.monitoring, false);
  assert.equal(nativeFailure.state.driveStatus.focusActive, false);
  assert.equal(nativeFailure.state.driveError, 'Android rejected policy');
  assert.equal(nativeFailure.count('stop'), 1, 'failed policy application must restore native state');

  const inactive = await mount({ start: async () => idleStatus() });
  await assert.rejects(inactive.state.startSession(), { code: 'E_SESSION_INACTIVE' });
  await inactive.runtime.settle();
  assert.equal(inactive.state.monitoring, false, 'an inactive native session cannot claim monitoring started');

  const noCamera = await mount({ noCamera: true });
  await assert.rejects(noCamera.state.startSession(), { code: 'E_CAMERA_UNAVAILABLE' });
  assert.equal(noCamera.count('camera'), 0);
  assert.equal(noCamera.count('start'), 0);
}

async function lifecycleChecks() {
  const cleanup = await mount({ getStatus: () => Promise.resolve(idleStatus({ cleanupPending: true, reason: 'Check focus cleanup' })) });
  assert.equal(cleanup.state.driveError, 'Check focus cleanup', 'native cleanup uncertainty must be visible');
  cleanup.runtime.unmount();
  await cleanup.runtime.settle();
  for (const action of ['stop', 'unmount']) {
    const permission = deferred();
    const app = await mount({ camera: () => permission.promise });
    const start = app.state.startSession();
    app.runtime.flush();
    assert.equal(app.state.starting, true);
    assert.equal(await app.state.startSession(), false, 'repeated start cannot duplicate a permission prompt');
    if (action === 'stop') await app.state.stopSession();
    if (action === 'unmount') app.runtime.unmount();
    permission.resolve('granted');
    assert.equal(await start, false, `${action} invalidates a pending camera permission`);
    await app.runtime.settle();
    assert.equal(app.count('camera'), 1);
    assert.equal(app.count('start'), 0, `${action} must prevent late native activation`);
    if (action !== 'unmount') {
      assert.equal(app.state.monitoring, false);
      assert.equal(app.state.starting, false);
      app.runtime.unmount();
    }
    assert.equal(app.listenerCount(), 0, 'unmount removes AppState and native status listeners');
  }

  for (const permissionKind of ['camera', 'bluetooth']) {
    for (const resultBeforeActive of [false, true]) {
      const permission = deferred();
      const app = await mount(permissionKind === 'camera'
        ? { camera: () => permission.promise }
        : { bluetoothGranted: false, bluetoothRequest: () => permission.promise });
      let completed = false;
      const start = app.state.startSession().then((result) => { completed = true; return result; });
      await app.runtime.settle();
      assert.equal(app.count(permissionKind === 'camera' ? 'camera' : 'bluetoothRequest'), 1);
      assert.equal(app.state.starting, true);
      app.appState('background');
      app.emit(idleStatus());
      await app.runtime.settle();
      assert.equal(app.count('stop'), 0, `${permissionKind} dialog lifecycle cannot cancel startup`);
      assert.equal(app.state.starting, true);
      assert.equal(app.state.monitoring, false);
      if (resultBeforeActive) {
        permission.resolve('granted');
        await app.runtime.settle();
        assert.equal(completed, false, `${permissionKind} grant waits until the app is active`);
        assert.equal(app.count('start'), 0, 'permission result cannot activate a background camera');
        app.appState('active');
      } else {
        app.appState('active');
        permission.resolve('granted');
      }
      await app.runtime.settle();
      assert.equal(completed, true, `${permissionKind} startup settles after permission and foreground return`);
      assert.equal(await start, true, `${permissionKind} dialog resumes the requested session`);
      await app.runtime.settle();
      assert.equal(app.count('start'), 1);
      assert.equal(app.state.monitoring, true);
      assert.equal(app.state.starting, false);
      app.appState('background');
      await app.runtime.settle();
      assert.equal(app.state.monitoring, false, 'leaving the app after startup still stops monitoring');
      assert.ok(app.count('stop') > 0);
      app.runtime.unmount();
      await app.runtime.settle();
    }

    for (const action of ['stop', 'unmount']) {
      for (const resultBeforeCancellation of [false, true]) {
        const permission = deferred();
        const app = await mount(permissionKind === 'camera'
          ? { camera: () => permission.promise }
          : { bluetoothGranted: false, bluetoothRequest: () => permission.promise });
        let completed = false;
        const start = app.state.startSession().then((result) => { completed = true; return result; });
        await app.runtime.settle();
        app.appState('background');
        if (resultBeforeCancellation) {
          permission.resolve('granted');
          await app.runtime.settle();
          assert.equal(completed, false, 'startup waits for foreground before explicit cancellation');
        }
        if (action === 'stop') await app.state.stopSession();
        else app.runtime.unmount();
        await app.runtime.settle();
        if (!resultBeforeCancellation) permission.resolve('granted');
        await app.runtime.settle();
        assert.equal(completed, true, `${action} releases a startup waiting for foreground`);
        assert.equal(await start, false, `${action} cancels ${permissionKind} permission startup`);
        assert.equal(app.count('start'), 0);
        if (action !== 'unmount') {
          assert.equal(app.state.monitoring, false);
          assert.equal(app.state.starting, false);
          app.appState('active');
          await app.runtime.settle();
          assert.equal(app.count('start'), 0, 'returning later cannot revive a cancelled startup');
          app.runtime.unmount();
          await app.runtime.settle();
        }
        assert.equal(app.listenerCount(), 0);
      }
    }
  }

  const bluetoothDenied = deferred();
  const callsBlocked = activeStatus({ bluetoothPermissionGranted: false, bluetoothCallConnected: false });
  const deniedDuringDialog = await mount({
    bluetoothGranted: false,
    bluetoothRequest: () => bluetoothDenied.promise,
    start: async () => callsBlocked,
  });
  let deniedCompleted = false;
  const deniedStart = deniedDuringDialog.state.startSession().then((result) => { deniedCompleted = true; return result; });
  await deniedDuringDialog.runtime.settle();
  deniedDuringDialog.appState('background');
  bluetoothDenied.resolve('denied');
  await deniedDuringDialog.runtime.settle();
  assert.equal(deniedDuringDialog.count('start'), 0);
  deniedDuringDialog.appState('active');
  await deniedDuringDialog.runtime.settle();
  assert.equal(deniedCompleted, true);
  assert.equal(await deniedStart, true, 'Bluetooth permission denial still permits monitoring after the dialog');
  await deniedDuringDialog.runtime.settle();
  assert.equal(deniedDuringDialog.state.driveStatus, callsBlocked);
  assert.equal(deniedDuringDialog.state.driveStatus.bluetoothCallConnected, false);
  deniedDuringDialog.runtime.unmount();
  await deniedDuringDialog.runtime.settle();

  const statusRead = deferred();
  let startupStatusReads = 0;
  const leavingBeforeNativeStart = await mount({ getStatus: () => ++startupStatusReads === 1 ? Promise.resolve(idleStatus()) : statusRead.promise });
  const cancelledStart = leavingBeforeNativeStart.state.startSession();
  await leavingBeforeNativeStart.runtime.settle();
  leavingBeforeNativeStart.appState('background');
  leavingBeforeNativeStart.appState('active');
  statusRead.resolve(idleStatus());
  assert.equal(await cancelledStart, false, 'background outside a permission phase still cancels startup');
  await leavingBeforeNativeStart.runtime.settle();
  assert.equal(leavingBeforeNativeStart.count('start'), 0);
  assert.equal(leavingBeforeNativeStart.state.monitoring, false);
  leavingBeforeNativeStart.runtime.unmount();
  await leavingBeforeNativeStart.runtime.settle();

  for (const action of ['stop', 'background', 'unmount']) {
    const nativeStart = deferred();
    const app = await mount({ start: () => nativeStart.promise });
    const start = app.state.startSession();
    await app.runtime.settle();
    assert.equal(app.count('start'), 1);
    let stopped;
    if (action === 'stop') stopped = app.state.stopSession();
    if (action === 'background') { app.appState('background'); app.appState('active'); }
    if (action === 'unmount') app.runtime.unmount();
    await app.runtime.settle();
    assert.equal(app.count('stop'), 0, 'pending native start and stop cannot overlap');
    nativeStart.resolve(activeStatus());
    assert.equal(await start, false, `${action} cancels a pending native activation`);
    await stopped;
    await app.runtime.settle();
    assert.ok(app.count('stop') > 0, 'late activation must be restored');
    assert.equal(app.calls.filter(([name]) => name === 'start' || name === 'stop').at(-1)[0], 'stop');
    if (action !== 'unmount') {
      assert.equal(app.state.monitoring, false);
      assert.equal(app.state.starting, false);
      assert.equal(app.state.driveStatus.sessionActive, false);
      app.runtime.unmount();
    }
  }

  const pendingStop = deferred();
  let stopCount = 0;
  const newer = await mount({ stop: () => ++stopCount === 1 ? pendingStop.promise : Promise.resolve(idleStatus()) });
  assert.equal(await newer.state.startSession(), true);
  await newer.runtime.settle();
  const stopping = newer.state.stopSession();
  const restarting = newer.state.startSession();
  await newer.runtime.settle();
  assert.equal(newer.count('start'), 1, 'the new native start waits for prior restoration');
  pendingStop.reject(new Error('Old session restoration failed'));
  await stopping;
  assert.equal(await restarting, true);
  await newer.runtime.settle();
  assert.equal(newer.state.monitoring, true);
  assert.equal(newer.state.driveError, null, 'an old stop rejection cannot overwrite the newer session');
  assert.equal(newer.state.driveStatus.sessionActive, true);

  newer.emit(idleStatus());
  await newer.runtime.settle();
  assert.equal(newer.state.monitoring, false, 'native session loss stops camera monitoring');
  newer.runtime.unmount();
  await newer.runtime.settle();

  const oldRefresh = deferred();
  let statusReads = 0;
  const refreshed = harness({ getStatus: () => ++statusReads === 1 ? oldRefresh.promise : Promise.resolve(idleStatus()) });
  refreshed.mount();
  assert.equal(await refreshed.state.startSession(), true);
  await refreshed.runtime.settle();
  oldRefresh.resolve(idleStatus());
  await refreshed.runtime.settle();
  assert.equal(refreshed.state.driveStatus.sessionActive, true, 'a pre-start status refresh cannot replace the active session status');
  refreshed.runtime.unmount();
  await refreshed.runtime.settle();
}

async function run() {
  await serviceChecks();
  await permissionAndFailureChecks();
  await lifecycleChecks();
  console.log('Drive session checks passed: existing camera access, permission-dialog pause/resume, explicit cancellation, native failures, truthful focus status, Bluetooth denial, restoration races, and serialized native mutations.');
}

module.exports = run;
if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; });
