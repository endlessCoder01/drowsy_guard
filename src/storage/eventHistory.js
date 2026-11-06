import AsyncStorage from '@react-native-async-storage/async-storage';

const LEGACY_EVENTS_KEY = '@drowsyguard/events-v1';
const EVENT_KEY_PREFIX = '@drowsyguard/event-v2/';
const READ_BATCH_SIZE = 100;
let writeQueue = Promise.resolve();

function assertEvent(event) {
  if (!event || typeof event !== 'object' || typeof event.id !== 'string' || !event.id) {
    throw new Error('Saved alerts must have a unique ID.');
  }
}

function eventSignature(event) {
  return JSON.stringify(Object.keys(event).sort().map((key) => [key, event[key]]));
}

// Existing records win during hydration, including alerts created while storage loads.
export function mergeEvents(existing = [], incoming = []) {
  const eventsById = new Map();
  for (const event of [...existing, ...incoming]) {
    assertEvent(event);
    if (!eventsById.has(event.id)) eventsById.set(event.id, event);
  }
  return Array.from(eventsById.values()).sort((left, right) => (
    (Date.parse(right.timestamp) || 0) - (Date.parse(left.timestamp) || 0)
    || right.id.localeCompare(left.id)
  ));
}

export async function readEvents() {
  await writeQueue;
  const [legacyRaw, keys] = await Promise.all([
    AsyncStorage.getItem(LEGACY_EVENTS_KEY),
    AsyncStorage.getAllKeys(),
  ]);
  const legacyEvents = legacyRaw == null ? [] : JSON.parse(legacyRaw);
  if (!Array.isArray(legacyEvents)) throw new Error('Saved alert history is not a list.');

  const savedEvents = [];
  const eventKeys = keys.filter((key) => key.startsWith(EVENT_KEY_PREFIX));
  for (let index = 0; index < eventKeys.length; index += READ_BATCH_SIZE) {
    const batch = await AsyncStorage.multiGet(eventKeys.slice(index, index + READ_BATCH_SIZE));
    for (const [, raw] of batch) {
      if (raw != null) savedEvents.push(JSON.parse(raw));
    }
  }
  // The legacy value stays intact; loading never migrates, replaces, or deletes it.
  return mergeEvents(legacyEvents, savedEvents);
}

export async function appendEvent(event) {
  assertEvent(event);
  // Capture the event now so a caller cannot change it while its write is queued.
  const raw = JSON.stringify(event);
  const snapshot = JSON.parse(raw);
  const key = `${EVENT_KEY_PREFIX}${encodeURIComponent(snapshot.id)}`;
  const operation = writeQueue.then(async () => {
    const savedRaw = await AsyncStorage.getItem(key);
    if (savedRaw != null) {
      const saved = JSON.parse(savedRaw);
      if (eventSignature(saved) !== eventSignature(snapshot)) {
        throw new Error('A different alert already uses this ID.');
      }
      return saved;
    }
    // One small value per alert avoids an ever-growing JSON value and lost updates.
    await AsyncStorage.setItem(key, raw);
    return snapshot;
  });
  // A failed write rejects its caller without preventing later alerts or retries.
  writeQueue = operation.catch(() => {});
  return operation;
}
