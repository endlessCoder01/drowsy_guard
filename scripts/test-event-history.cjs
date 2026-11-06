const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const LEGACY_KEY = '@drowsyguard/events-v1';
const EVENT_PREFIX = '@drowsyguard/event-v2/';
const source = fs.readFileSync(path.join(__dirname, '../src/storage/eventHistory.js'), 'utf8')
  .replace(/^import AsyncStorage from [^;]+;\s*/m, '')
  .replace(/^export /gm, '');

function loadHistory(storage) {
  return vm.runInNewContext(`${source}\n({ readEvents, appendEvent, mergeEvents });`, {
    AsyncStorage: storage,
  });
}

function createStorage(entries = []) {
  const data = new Map(entries);
  const calls = { writes: 0, largestBatch: 0, mutations: 0 };
  const failures = {};
  const storage = {
    async getItem(key) {
      if (failures.getItem) throw new Error('getItem failed');
      return data.has(key) ? data.get(key) : null;
    },
    async getAllKeys() {
      if (failures.getAllKeys) throw new Error('getAllKeys failed');
      return Array.from(data.keys());
    },
    async multiGet(keys) {
      if (failures.multiGet) throw new Error('multiGet failed');
      calls.largestBatch = Math.max(calls.largestBatch, keys.length);
      return keys.map((key) => [key, data.get(key) ?? null]);
    },
    async setItem(key, value) {
      if (failures.setItem) throw new Error('setItem failed');
      assert.ok(key.startsWith(EVENT_PREFIX), 'only individual event keys may be written');
      assert.ok(!data.has(key), 'existing values must never be overwritten');
      calls.writes += 1;
      data.set(key, value);
    },
    async removeItem() { calls.mutations += 1; throw new Error('deletion is forbidden'); },
    async multiRemove() { calls.mutations += 1; throw new Error('deletion is forbidden'); },
    async clear() { calls.mutations += 1; throw new Error('clearing is forbidden'); },
  };
  return { data, calls, failures, storage };
}

function event(index) {
  return {
    id: `alert-${index}`,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    closureDurationMs: 1500 + index,
    eyeOpenProbability: 0.1,
    method: 'cnn',
  };
}

async function run() {
  const legacy = Array.from({ length: 125 }, (_, index) => event(index));
  const legacyRaw = JSON.stringify(legacy);
  const mock = createStorage([[LEGACY_KEY, legacyRaw], ['unrelated-settings', 'keep']]);
  let history = loadHistory(mock.storage);
  assert.equal((await history.readEvents()).length, 125, 'all legacy alerts remain visible');
  assert.equal(mock.calls.writes, 0, 'reading legacy records must not migrate or rewrite them');

  const newEvents = Array.from({ length: 150 }, (_, index) => event(index + 125));
  await Promise.all(newEvents.map((record) => history.appendEvent(record)));
  const allEvents = await history.readEvents();
  assert.equal(allEvents.length, 275, 'history must not be limited to 100 alerts');
  assert.equal(new Set(allEvents.map((record) => record.id)).size, 275, 'concurrent writes retain every ID');
  assert.equal(allEvents[0].id, 'alert-274', 'most recent alert comes first');
  assert.equal(allEvents[274].id, 'alert-0');
  assert.equal(mock.data.get(LEGACY_KEY), legacyRaw, 'legacy storage bytes are untouched');
  assert.equal(mock.data.get('unrelated-settings'), 'keep');
  assert.ok(mock.calls.largestBatch <= 100, 'large histories are read in small batches');

  history = loadHistory(mock.storage);
  assert.equal((await history.readEvents()).length, 275, 'all history survives a fresh module instance');
  await Promise.all([history.appendEvent(event(275)), history.appendEvent(event(275))]);
  assert.equal(mock.calls.writes, 151, 'retrying an alert is idempotent');
  await history.appendEvent(event(0));
  assert.equal((await history.readEvents()).length, 276, 'legacy and per-alert duplicates appear once');
  await assert.rejects(history.appendEvent({ ...event(275), closureDurationMs: 9999 }), /different alert/);
  assert.equal(JSON.parse(mock.data.get(`${EVENT_PREFIX}alert-275`)).closureDurationMs, 1775);

  const duringHydration = event(300);
  const merged = history.mergeEvents([duringHydration], await history.readEvents());
  assert.equal(merged.length, 277, 'hydration keeps alerts produced while storage loads');
  assert.equal(merged[0].id, duringHydration.id);
  assert.equal(history.mergeEvents([duringHydration], [{ ...duringHydration, method: 'old' }])[0].method, 'cnn');

  const snapshot = event(301);
  const savingSnapshot = history.appendEvent(snapshot);
  snapshot.method = 'changed by caller';
  await savingSnapshot;
  assert.equal(JSON.parse(mock.data.get(`${EVENT_PREFIX}alert-301`)).method, 'cnn');

  const savedBeforeFailures = new Map(mock.data);
  for (const failure of ['getItem', 'getAllKeys', 'multiGet']) {
    mock.failures[failure] = true;
    await assert.rejects(history.readEvents(), new RegExp(`${failure} failed`));
    delete mock.failures[failure];
    assert.deepEqual(mock.data, savedBeforeFailures, 'a failed read cannot change saved records');
  }
  mock.failures.setItem = true;
  await assert.rejects(history.appendEvent(event(302)), /setItem failed/);
  assert.deepEqual(mock.data, savedBeforeFailures, 'a failed append cannot replace existing history');
  delete mock.failures.setItem;
  await history.appendEvent(event(302));
  await history.appendEvent(event(303));
  assert.equal((await history.readEvents()).length, 279, 'failed write queue recovers for retries and later events');

  mock.data.set(`${EVENT_PREFIX}broken`, '{invalid json');
  await assert.rejects(history.readEvents(), { name: 'SyntaxError' });
  assert.equal(mock.data.get(`${EVENT_PREFIX}broken`), '{invalid json', 'unreadable records are never removed');
  assert.equal(mock.data.get(LEGACY_KEY), legacyRaw);
  assert.equal(mock.calls.mutations, 0, 'no deletes or clears are permitted');
  await assert.rejects(history.appendEvent({ timestamp: 'missing ID' }), /unique ID/);
  console.log('Event history regression checks passed: legacy preservation, 275+ records, concurrent writes, restart, retries, hydration, and failure safety.');
}

module.exports = run;
if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; });
