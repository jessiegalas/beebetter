import AsyncStorage from '@react-native-async-storage/async-storage';
import { serializeStorage } from './recommendation-snooze';

export type GrowthMarker = { id: string; completed_at: string };
type SeenGrowth = { initialized: boolean; marker: GrowthMarker | null; immediate: string[] };
const storageKey = (owner: string) => 'beebetter:tree-growth:' + owner;
const empty: SeenGrowth = { initialized: false, marker: null, immediate: [] };

function isNewer(a: GrowthMarker, b: GrowthMarker) {
  const difference = Date.parse(a.completed_at) - Date.parse(b.completed_at);
  if (difference) return difference > 0;
  // Postgres timestamps can differ beyond JS Date's millisecond precision.
  const fraction = (date: string) => (date.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0');
  const left = fraction(a.completed_at), right = fraction(b.completed_at);
  return left === right ? a.id < b.id : left > right;
}

async function read(key: string): Promise<SeenGrowth> {
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return empty;
  try {
    const value = JSON.parse(stored) as SeenGrowth;
    return Array.isArray(value?.immediate) ? value : empty;
  } catch { return empty; }
}

export function unseenGrowth<T extends GrowthMarker>(owner: string, rows: T[], isCurrent: () => boolean): Promise<T[]> {
  const key = storageKey(owner);
  return serializeStorage(AsyncStorage, key, async () => {
    const seen = await read(key);
    if (!isCurrent()) return [];
    if (!seen.initialized) {
      const first = rows[0];
      const marker = first ? { id: first.id, completed_at: first.completed_at } : null;
      await AsyncStorage.setItem(key, JSON.stringify({ initialized: true, marker, immediate: [] }));
      return [];
    }
    const marker = seen.marker;
    return rows.filter(row => (!marker || isNewer(row, marker)) && !seen.immediate.includes(row.id));
  });
}

export function acknowledgeGrowth(owner: string, row: GrowthMarker, windowIds: string[], isCurrent: () => boolean) {
  const key = storageKey(owner);
  return serializeStorage(AsyncStorage, key, async () => {
    const seen = await read(key);
    if (!isCurrent()) return;
    const marker = !seen.marker || isNewer(row, seen.marker) ? { id: row.id, completed_at: row.completed_at } : seen.marker;
    const immediate = seen.immediate.filter(id => !windowIds.includes(id));
    await AsyncStorage.setItem(key, JSON.stringify({ initialized: true, marker, immediate }));
  });
}

export function acknowledgeImmediateGrowth(owner: string, id: string, isCurrent: () => boolean) {
  const key = storageKey(owner);
  return serializeStorage(AsyncStorage, key, async () => {
    const seen = await read(key);
    if (!isCurrent() || seen.immediate.includes(id)) return;
    await AsyncStorage.setItem(key, JSON.stringify({ ...seen, immediate: [...seen.immediate.slice(-99), id] }));
  });
}
