export type LocalStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export type Snoozes = Record<string, number>;
export const SNOOZE_DURATION = 3_600_000;
const storageQueues = new WeakMap<LocalStorage, Map<string, Promise<void>>>();
/** Serializes read/modify/write across account lifetimes, including logout/relogin of the same owner. */
export function serializeStorage<T>(storage: LocalStorage, key: string, operation: () => Promise<T>): Promise<T> {
  let queues = storageQueues.get(storage);
  if (!queues) { queues = new Map(); storageQueues.set(storage, queues); }
  const task = (queues.get(key) ?? Promise.resolve()).then(operation);
  queues.set(key, task.then(() => {}, () => {}));
  return task;
}
export function pruneSnoozes(value: Snoozes, now: number, ids?: Set<string>): Snoozes {
  return Object.fromEntries(Object.entries(value).filter(([id, until]) => typeof until === 'number' && Number.isFinite(until) && until > now && until <= now + SNOOZE_DURATION && (!ids || ids.has(id))));
}
export function createSnoozeStore(storage: LocalStorage, owner: string, clock = Date.now) {
  const key = 'beebetter:recommendation-snoozes:v2:' + owner;
  const run = (change: (value: Snoozes) => Snoozes) => serializeStorage(storage, key, async () => {
    const stored = await storage.getItem(key);
    let value: Snoozes = {};
    try { const parsed = JSON.parse(stored ?? '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed; } catch { /* Corrupt state has no valid snoozes. */ }
    value = change(pruneSnoozes(value, clock()));
    const encoded = JSON.stringify(value);
    if (encoded !== stored) await storage.setItem(key, encoded);
    return value;
  });
  return {
    load: () => run(value => value),
    snooze: (id: string) => run(value => ({ ...value, [id]: clock() + SNOOZE_DURATION })),
    undo: (id: string) => run(value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== id))),
    restore: () => run(() => ({})),
    prune: (ids: Set<string>) => run(value => pruneSnoozes(value, clock(), ids)),
  };
}
