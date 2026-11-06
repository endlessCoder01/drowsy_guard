const assert = require('node:assert/strict');
const { deferred, moduleLoader, hookRuntime } = require('./hook-test-utils.cjs');
const LEGACY_KEY = '@drowsyguard/events-v1';
const SETTINGS_KEY = '@drowsyguard/settings-v1';
const EVENT_PREFIX = '@drowsyguard/event-v2/';

function event(index) {
  return {
    id: `app-alert-${index}`,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    closureDurationMs: 1800,
    eyeOpenProbability: 0.1,
    method: 'cnn',
  };
}

function storageMock(legacy) {
  const data = new Map([[LEGACY_KEY, JSON.stringify(legacy)]]);
  const settingsWrites = [];
  const failures = { read: false, write: false };
  const storage = {
    async getItem(key) { return data.get(key) ?? null; },
    async getAllKeys() {
      if (failures.read) throw new Error('Storage read failed');
      return Array.from(data.keys());
    },
    async multiGet(keys) { return keys.map((key) => [key, data.get(key) ?? null]); },
    async setItem(key, raw) {
      if (key === SETTINGS_KEY) settingsWrites.push(JSON.parse(raw));
      else {
        if (failures.write) throw new Error('Storage write failed');
        assert.ok(key.startsWith(EVENT_PREFIX));
        assert.ok(!data.has(key), 'saved alerts must not be replaced');
      }
      data.set(key, raw);
    },
    async removeItem() { assert.fail('history must never be removed'); },
    async clear() { assert.fail('storage must never be cleared'); },
  };
  const history = moduleLoader({ '@react-native-async-storage/async-storage': storage })('src/storage/eventHistory.js');
  return { storage, history, data, failures, settingsWrites };
}

function mountApp(mock, overrides = {}) {
  const runtime = hookRuntime();
  let appendCalls = 0;
  const load = moduleLoader({
    react: runtime.hooks,
    '@react-native-async-storage/async-storage': mock.storage,
  });
  const history = load('src/storage/eventHistory.js');
  history.readEvents = overrides.readEvents || mock.history.readEvents;
  history.appendEvent = (record) => { appendCalls += 1; return mock.history.appendEvent(record); };
  const historyModule = load('src/hooks/useEventHistory.js');
  const settingsModule = load('src/hooks/useSettings.js');
  const useEventHistory = historyModule.default || historyModule.useEventHistory;
  const useSettings = settingsModule.default || settingsModule.useSettings;
  assert.equal(typeof useEventHistory, 'function');
  assert.equal(typeof useSettings, 'function');
  runtime.mount(() => ({ ...useEventHistory(), ...useSettings() }));
  return {
    get state() { return runtime.state; },
    get appendCalls() { return appendCalls; },
    get updaterReplays() { return runtime.updaterReplays; },
    settle: runtime.settle,
    unmount: runtime.unmount,
  };
}

async function run() {
  const legacy = Array.from({ length: 140 }, (_, index) => event(index));
  const mock = storageMock(legacy);
  const legacyRaw = mock.data.get(LEGACY_KEY);
  const savedSnapshot = await mock.history.readEvents();
  const hydration = deferred();
  const settingsLoad = deferred();
  const getItem = mock.storage.getItem;
  mock.storage.getItem = (key) => key === SETTINGS_KEY ? settingsLoad.promise : getItem(key);
  const app = mountApp(mock, { readEvents: () => hydration.promise.then(() => savedSnapshot) });
  assert.equal(app.state.settingsLoaded, false);
  assert.equal(mock.settingsWrites.length, 0, 'defaults must not overwrite settings before hydration');

  app.state.addEvent(event(500));
  await app.settle();
  assert.equal(app.appendCalls, 1, 'updater replay must not append an alert twice');
  assert.ok(app.updaterReplays > 0, 'functional updaters were replayed');
  assert.equal(app.state.events.length, 1);
  assert.equal(mock.settingsWrites.length, 0, 'a live alert cannot trigger an early settings write');
  hydration.resolve();
  settingsLoad.resolve(JSON.stringify({ eyeClosedProbability: 0.42, audioAlerts: false }));
  await app.settle();
  assert.equal(app.state.events.length, 141, 'late hydration keeps all legacy and live alerts');
  assert.equal(app.state.events[0].id, event(500).id);
  assert.equal(app.state.historyLoaded, true);
  assert.equal(app.state.historyLoading, false);
  assert.equal(app.state.pendingCount, 0);
  assert.equal(app.state.settingsLoaded, true);
  assert.equal(mock.settingsWrites.length, 1);
  assert.equal(mock.settingsWrites[0].eyeClosedProbability, 0.42, 'only hydrated settings are written');
  assert.equal(mock.settingsWrites[0].audioAlerts, false);

  mock.failures.write = true;
  app.state.addEvent(event(501));
  await app.settle();
  assert.equal(app.state.events.length, 142, 'failed save keeps the new alert visible');
  assert.equal(app.state.pendingCount, 1);
  assert.ok(app.state.historyWriteError);
  assert.equal(mock.data.has(`${EVENT_PREFIX}${event(501).id}`), false);
  assert.equal(app.appendCalls, 2);
  mock.failures.write = false;
  app.state.retryHistory();
  await app.settle();
  assert.equal(app.state.pendingCount, 0);
  assert.equal(app.state.historyWriteError, null);
  assert.equal(app.state.events.length, 142, 'retry cannot duplicate the visible alert');
  assert.equal((await mock.history.readEvents()).length, 142);
  assert.equal(mock.data.get(LEGACY_KEY), legacyRaw);

  const readFailure = storageMock(legacy);
  readFailure.failures.read = true;
  const recovering = mountApp(readFailure);
  await recovering.settle();
  assert.equal(recovering.state.historyLoaded, false);
  assert.ok(recovering.state.historyReadError);
  recovering.state.addEvent(event(600));
  await recovering.settle();
  assert.equal(recovering.state.events.length, 1);
  await recovering.state.loadHistory();
  await recovering.settle();
  assert.equal(recovering.state.events[0].id, event(600).id, 'a failed read cannot clear the live alert');
  assert.equal(readFailure.data.get(LEGACY_KEY), legacyRaw, 'read failures leave existing records untouched');
  readFailure.failures.read = false;
  recovering.state.retryHistory();
  await recovering.settle();
  assert.equal(recovering.state.events.length, 141, 'retry combines old saved alerts and the new live alert');
  assert.equal(recovering.state.historyLoaded, true);
  assert.equal(recovering.state.historyReadError, null);
  assert.equal(recovering.state.pendingCount, 0);

  const settingsFailure = storageMock([]);
  const originalSettings = JSON.stringify({ eyeClosedProbability: 0.55, audioAlerts: false });
  settingsFailure.data.set(SETTINGS_KEY, originalSettings);
  const readItem = settingsFailure.storage.getItem;
  settingsFailure.storage.getItem = async (key) => {
    if (key === SETTINGS_KEY) throw new Error('Settings read failed');
    return readItem(key);
  };
  const unreadSettings = mountApp(settingsFailure);
  await unreadSettings.settle();
  assert.equal(unreadSettings.state.settingsLoaded, false);
  assert.equal(settingsFailure.settingsWrites.length, 0, 'failed settings read cannot write defaults');
  assert.equal(settingsFailure.data.get(SETTINGS_KEY), originalSettings);
  console.log('App history integration checks passed: hydration race, updater replay, 140+ alerts, failed-save retry, read recovery, and settings hydration/failure.');
}

module.exports = run;
if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; });
