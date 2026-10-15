import type { RankedQuest } from './quest-priority';
import { recommendationGroup, type RecommendationGroup } from './quest-discovery';
import type { EvidenceCode } from './recommendation-reasons';
import { serializeStorage, type LocalStorage } from './recommendation-snooze';
export type RecommendationEvent = {
  questId: string; impressionId: string; sessionId: string; surface: 'home' | 'quest_board';
  group: RecommendationGroup; rank: number; reasonCodes: EvidenceCode[]; version: 'rules-v2';
  eventType: 'exposure' | 'selection' | 'snooze'; occurredAt: string;
};
export function recommendationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
export function decisionSignature(item: RankedQuest, rank: number): string {
  return JSON.stringify([item.quest.id, item.quest.updated_at, recommendationGroup(item), rank, item.reasons, item.constraints, item.reasonCodes]);
}
type Timer = ReturnType<typeof setTimeout>;
export function createImpressionTracker(surface: RecommendationEvent['surface'], sessionId: string,
  emit: (event: RecommendationEvent) => void, options: {
    clock?: () => number; id?: () => string;
    schedule?: (fn: () => void, delay: number) => Timer; cancel?: (timer: Timer) => void;
  } = {}) {
  const clock = options.clock ?? Date.now, id = options.id ?? recommendationId;
  const schedule = options.schedule ?? setTimeout, cancel = options.cancel ?? clearTimeout;
  const impressions = new Map<string, { signature: string; base: Omit<RecommendationEvent, 'eventType' | 'occurredAt'>; exposed: boolean; timer?: Timer }>();
  let active = false;
  const event = (entry: typeof impressions extends Map<string, infer T> ? T : never, eventType: RecommendationEvent['eventType']) =>
    emit({ ...entry.base, eventType, occurredAt: new Date(clock()).toISOString() });
  const entryFor = (item: RankedQuest, rank: number) => {
    const signature = decisionSignature(item, rank), old = impressions.get(item.quest.id);
    if (old?.signature === signature) return old;
    if (old?.timer != null) cancel(old.timer);
    const entry = { signature, base: { questId: item.quest.id, impressionId: id(), sessionId, surface, group: recommendationGroup(item), rank, reasonCodes: [...item.reasonCodes], version: 'rules-v2' as const }, exposed: false, timer: undefined as Timer | undefined };
    impressions.set(item.quest.id, entry); return entry;
  };
  return {
    update(items: RankedQuest[], visibleIds: Set<string>, enabled: boolean) {
      active = enabled;
      const liveIds = new Set(items.map(i => i.quest.id));
      for (const [key, entry] of impressions) if (!liveIds.has(key)) { if (entry.timer != null) cancel(entry.timer); impressions.delete(key); }
      items.forEach((item, index) => {
        const entry = entryFor(item, index + 1), visible = enabled && visibleIds.has(item.quest.id);
        if (!visible && entry.timer != null) { cancel(entry.timer); entry.timer = undefined; }
        if (visible && !entry.exposed && entry.timer == null) entry.timer = schedule(() => {
          entry.timer = undefined;
          if (active && impressions.get(item.quest.id) === entry) { entry.exposed = true; event(entry, 'exposure'); }
        }, 1000);
      });
    },
    action(item: RankedQuest, rank: number, type: 'selection' | 'snooze') { event(entryFor(item, rank), type); },
    dispose() { active = false; impressions.forEach(e => { if (e.timer != null) cancel(e.timer); }); impressions.clear(); },
  };
}
export function createRecommendationQueue(storage: LocalStorage, owner: string,
  send: (event: RecommendationEvent) => Promise<void>, isCurrent: () => boolean, clock = Date.now) {
  const key = 'beebetter:recommendation-events:v2:' + owner;
  let draining: Promise<void> | null = null;
  const prune = (events: RecommendationEvent[]) => events.filter(e => {
    if (!e || typeof e !== 'object' || typeof e.questId !== 'string' || typeof e.impressionId !== 'string' || !['exposure','selection','snooze'].includes(e.eventType) || !Array.isArray(e.reasonCodes)) return false;
    const at = Date.parse(e.occurredAt); return Number.isFinite(at) && at <= clock() && at >= clock() - 86_400_000;
  }).slice(-100);
  const change = (update: (events: RecommendationEvent[]) => RecommendationEvent[]) => serializeStorage(storage, key, async () => {
    if (!isCurrent()) return [];
    const stored = await storage.getItem(key);
    if (!isCurrent()) return [];
    let values: RecommendationEvent[] = [];
    try { const value = JSON.parse(stored ?? '[]'); if (Array.isArray(value)) values = value; } catch { /* Invalid queue entries are discarded. */ }
    const pending = prune(update(prune(values))), encoded = JSON.stringify(pending);
    if (encoded !== stored) await storage.setItem(key, encoded);
    return pending;
  });
  const flush = (): Promise<void> => {
    if (draining) return draining;
    const task = (async () => {
      while (isCurrent()) {
        const pending = await change(events => events), event = pending[0];
        if (!event || !isCurrent()) return;
        try { await send(event); } catch (error) {
          const code = (error as { code?: string } | null)?.code;
          if (!code || !['P0001','42501','23503','23514','23502','22P02'].includes(code)) return;
        }
        if (!isCurrent()) return;
        await change(events => events.filter(e => e.impressionId !== event.impressionId || e.eventType !== event.eventType));
      }
    })();
    draining = task;
    void task.then(() => { draining = null; }, () => { draining = null; });
    return task;
  };
  return { flush, enqueue: async (event: RecommendationEvent) => {
    await change(events => events.some(e => e.impressionId === event.impressionId && e.eventType === event.eventType) ? events : [...events, event]);
    await flush();
  } };
}
