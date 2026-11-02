import AsyncStorage from '@react-native-async-storage/async-storage';

export type GeofenceEvents = Record<string, { inside: boolean; timestamp: number }>;
const KEY = 'beebetter:geofence-events';
const listeners = new Set<(events: GeofenceEvents) => void>();
let queue = Promise.resolve();
let generation = 0;

export type GeofenceEntry = { locationId: string; isCurrent: () => boolean };
let entryHandler: ((entry: GeofenceEntry) => Promise<void>) | undefined;
/** Optional presentation integration. Install at module scope for headless tasks. */
export function setGeofenceEntryHandler(handler: typeof entryHandler) {
  entryHandler = handler;
}

export async function readGeofenceEvents(): Promise<GeofenceEvents> {
  try { return JSON.parse(await AsyncStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
export function recordGeofenceEvent(id: string, inside: boolean) {
  const version = generation;
  let recorded = false;
  queue = queue.catch(() => {}).then(async () => {
    const now = Date.now();
    const events = await readGeofenceEvents();
    if (version !== generation) return;
    for (const key of Object.keys(events)) {
      if (now - events[key].timestamp > 300_000) delete events[key];
    }
    events[id] = { inside, timestamp: now };
    await AsyncStorage.setItem(KEY, JSON.stringify(events));
    if (version === generation) { recorded = true; listeners.forEach(listener => listener(events)); }
  });
  // Presentation does not hold the storage queue or block logout's event clear.
  return queue.then(() => {
    if (recorded && inside && version === generation) {
      return entryHandler?.({ locationId: id, isCurrent: () => version === generation });
    }
  });
}
export function subscribeGeofenceEvents(listener: (events: GeofenceEvents) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function clearGeofenceEvents(): Promise<void> {
  generation += 1;
  listeners.forEach(listener => listener({}));
  queue = queue.catch(() => {}).then(() => AsyncStorage.removeItem(KEY));
  return queue;
}
