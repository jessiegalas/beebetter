import AsyncStorage from '@react-native-async-storage/async-storage';

export type GeofenceEvents = Record<string, { inside: boolean; timestamp: number }>;
const KEY = 'beebetter:geofence-events';
const listeners = new Set<(events: GeofenceEvents) => void>();
let queue = Promise.resolve();
let generation = 0;

export async function readGeofenceEvents(): Promise<GeofenceEvents> {
  try { return JSON.parse(await AsyncStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
export function recordGeofenceEvent(id: string, inside: boolean) {
  const version = generation;
  queue = queue.catch(() => {}).then(async () => {
    const now = Date.now();
    const events = await readGeofenceEvents();
    if (version !== generation) return;
    for (const key of Object.keys(events)) {
      if (now - events[key].timestamp > 300_000) delete events[key];
    }
    events[id] = { inside, timestamp: now };
    await AsyncStorage.setItem(KEY, JSON.stringify(events));
    if (version === generation) listeners.forEach(listener => listener(events));
  });
  return queue;
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
