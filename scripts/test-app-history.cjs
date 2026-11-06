const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('@babel/parser');
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const ROOT = path.join(__dirname, '..');
const LEGACY_KEY = '@drowsyguard/events-v1';
const SETTINGS_KEY = '@drowsyguard/settings-v1';
const EVENT_PREFIX = '@drowsyguard/event-v2/';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function event(index) {
  return {
    id: `app-alert-${index}`,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    closureDurationMs: 1800,
    eyeOpenProbability: 0.1,
    method: 'cnn',
  };
}

// Keep the real hooks and callbacks, replacing only the final screen JSX with
// observable state. This avoids duplicating the history implementation in tests.
function appUnderTest() {
  const parsed = parser.parse(fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8'), {
    sourceType: 'module', plugins: ['jsx'],
  });
  const app = t.cloneNode(parsed.program.body.find((node) => (
    t.isExportDefaultDeclaration(node) && node.declaration.id?.name === 'App'
  )).declaration, true);
  const finalReturn = app.body.body.findLastIndex((node) => t.isReturnStatement(node));
  assert.ok(finalReturn >= 0 && t.isJSXElement(app.body.body[finalReturn].argument));
  const exposed = [
    'events', 'historyLoaded', 'historyLoading', 'historyReadError', 'historyWriteError',
    'pendingCount', 'addEvent', 'loadHistory', 'retryHistory', 'settings', 'settingsLoaded',
  ];
  app.body.body[finalReturn] = t.returnStatement(t.objectExpression(exposed.map((name) => (
    t.objectProperty(t.identifier(name), t.identifier(name), false, true)
  ))));
  const constants = parsed.program.body.filter((node) => t.isVariableDeclaration(node)
    && node.declarations.some((declaration) => ['DEFAULT_SETTINGS', 'STORAGE_SETTINGS'].includes(declaration.id.name)));
  return generate(t.program([...constants, app])).code;
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
  const source = fs.readFileSync(path.join(ROOT, 'src/storage/eventHistory.js'), 'utf8')
    .replace(/^import AsyncStorage from [^;]+;\s*/m, '').replace(/^export /gm, '');
  const history = vm.runInNewContext(`${source}\n({ readEvents, appendEvent, mergeEvents });`, { AsyncStorage: storage });
  return { storage, history, data, failures, settingsWrites };
}

function mountApp(code, mock, overrides = {}) {
  const slots = [];
  let cursor = 0;
  let dirty = true;
  let effects = [];
  let current;
  let appendCalls = 0;
  let updaterReplays = 0;
  const equalDeps = (left, right) => left && right && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === 'function' ? initial() : initial };
        slot.set = (update) => {
          if (typeof update === 'function') {
            update(slot.value); // React StrictMode may discard and replay an updater.
            updaterReplays += 1;
          }
          const next = typeof update === 'function' ? update(slot.value) : update;
          if (!Object.is(next, slot.value)) { slot.value = next; dirty = true; }
        };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !equalDeps(slots[index].deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || !equalDeps(slots[index].deps, deps)) {
        const oldCleanup = slots[index]?.cleanup;
        slots[index] = { deps };
        effects.push(() => { oldCleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const App = vm.runInNewContext(`${code}\nApp;`, {
    ...hooks,
    AsyncStorage: mock.storage,
    mergeEvents: mock.history.mergeEvents,
    readEvents: overrides.readEvents || mock.history.readEvents,
    appendEvent: (record) => { appendCalls += 1; return mock.history.appendEvent(record); },
    console: { warn() {} },
  });
  function render() {
    dirty = false;
    cursor = 0;
    effects = [];
    current = App();
    effects.forEach((effect) => effect());
  }
  render();
  return {
    get state() { return current; },
    get appendCalls() { return appendCalls; },
    get updaterReplays() { return updaterReplays; },
    async settle() {
      // AsyncStorage mocks resolve on microtasks. Yielding the event loop also
      // lets nested async callbacks finish before inspecting a committed render.
      for (let turn = 0; turn < 8; turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        if (dirty) render();
      }
      assert.equal(dirty, false, 'hook state should settle');
      return current;
    },
  };
}

async function run() {
  const code = appUnderTest();
  const legacy = Array.from({ length: 140 }, (_, index) => event(index));
  const mock = storageMock(legacy);
  const legacyRaw = mock.data.get(LEGACY_KEY);
  const savedSnapshot = await mock.history.readEvents();
  const hydration = deferred();
  const settingsLoad = deferred();
  const getItem = mock.storage.getItem;
  mock.storage.getItem = (key) => key === SETTINGS_KEY ? settingsLoad.promise : getItem(key);
  const app = mountApp(code, mock, { readEvents: () => hydration.promise.then(() => savedSnapshot) });
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
  const recovering = mountApp(code, readFailure);
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
  const unreadSettings = mountApp(code, settingsFailure);
  await unreadSettings.settle();
  assert.equal(unreadSettings.state.settingsLoaded, false);
  assert.equal(settingsFailure.settingsWrites.length, 0, 'failed settings read cannot write defaults');
  assert.equal(settingsFailure.data.get(SETTINGS_KEY), originalSettings);
  console.log('App history integration checks passed: hydration race, updater replay, 140+ alerts, failed-save retry, read recovery, and settings hydration/failure.');
}

module.exports = run;
if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; });
