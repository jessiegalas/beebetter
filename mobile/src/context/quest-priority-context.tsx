import { createContext, useContext, useEffect, useMemo, useState, useLayoutEffect, useCallback, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOBILE_WELLNESS_AND_SUPPORT_ENABLED, MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED } from '@/constants/features';
import { useUserData } from './user-data-context';
import { useLocationContext } from './location-context';
import { recommendationSnapshot } from '@/lib/recommendation-snapshot';
import { EMPTY_RECOMMENDATION_DATA } from '@/lib/recommendation-facts';
import { recommendedQuests } from '@/lib/quest-discovery';
import { createSnoozeStore, type Snoozes } from '@/lib/recommendation-snooze';
import { createRecommendationQueue, type RecommendationEvent } from '@/lib/recommendation-measurement';
import { recordRecommendationEventV2 } from '@/lib/recommendation-events';
import { readGeofenceEvents, subscribeGeofenceEvents, type GeofenceEvents } from '@/lib/geofence-events';
import { getMyRecommendationWellnessContext, subscribeRecommendationContext, type RecommendationWellnessContext } from '@/lib/wellbeing-data';

function usePriorityValue() {
  const { user, profile, quests, completionHistory, recommendationData = EMPTY_RECOMMENDATION_DATA, workspaceErrors, retryWorkspace } = useUserData();
  const { coords, locationUpdatedAt, locations, permissionStatus, locationsUpdatedAt, locationsError, refreshLocations } = useLocationContext();
  const [now, setNow] = useState(Date.now);
  const owner = user?.id;

  const [snoozeSnapshot, setSnoozeSnapshot] = useState<{ owner: string; value: Snoozes } | null>(null);
  const [lastSnoozed, setLastSnoozed] = useState<{ owner: string; id: string } | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const lifetime = useMemo(() => {
    if (!owner) return null;
    let active = false;
    const isCurrent = () => active;
    return { owner, isCurrent, activate: () => { active = true; }, invalidate: () => { active = false; },
      store: createSnoozeStore(AsyncStorage, owner),
      queue: MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED ? createRecommendationQueue(AsyncStorage, owner, recordRecommendationEventV2, isCurrent) : null,
    };
  }, [owner]);
  useLayoutEffect(() => { lifetime?.activate(); return () => lifetime?.invalidate(); }, [lifetime]);
  const snoozesReady = !owner || snoozeSnapshot?.owner === owner;
  const snoozes = useMemo(() => snoozeSnapshot?.owner === owner ? snoozeSnapshot?.value ?? {} : {}, [owner, snoozeSnapshot]);
  const [geofenceSnapshot, setGeofenceSnapshot] = useState<{ owner: string; events: GeofenceEvents } | null>(null);
  const geofenceEvents = useMemo(() => geofenceSnapshot?.owner === owner ? geofenceSnapshot?.events ?? {} : {}, [geofenceSnapshot, owner]);
  const [wellnessSnapshot, setWellnessSnapshot] = useState<{ owner: string; value: RecommendationWellnessContext } | null>(null);
  const wellness = MOBILE_WELLNESS_AND_SUPPORT_ENABLED && wellnessSnapshot?.owner === owner ? wellnessSnapshot?.value ?? null : null;
  useEffect(() => {
    if (!MOBILE_WELLNESS_AND_SUPPORT_ENABLED || !owner) return;
    let alive = true;
    const load = () => { void getMyRecommendationWellnessContext(owner).then(value => {
      if (alive && lifetime?.isCurrent()) setWellnessSnapshot({ owner, value });
    }).catch(() => { if (alive) setWellnessSnapshot(null); }); };
    load(); const unsubscribe = subscribeRecommendationContext(load);
    return () => { alive = false; unsubscribe(); };
  }, [owner, lifetime]);
  const saveSnoozes = useCallback(async (operation: 'load' | 'snooze' | 'undo' | 'restore', id?: string) => {
    if (!lifetime?.isCurrent()) return;
    try {
      const value = operation === 'snooze' ? await lifetime.store.snooze(id!) : operation === 'undo' ? await lifetime.store.undo(id!) : operation === 'restore' ? await lifetime.store.restore() : await lifetime.store.load();
      if (lifetime.isCurrent()) {
        setSnoozeSnapshot({ owner: lifetime.owner, value }); setStorageError(null); setNow(Date.now());
        if (operation === 'snooze') setLastSnoozed({ owner: lifetime.owner, id: id! });
        else if (operation !== 'load') setLastSnoozed(null);
      }
    } catch {
      if (lifetime.isCurrent()) {
        setStorageError(operation === 'load' ? 'Snoozes could not be loaded. Retry before viewing recommendations.' : 'Snoozes could not be saved. Try again.');
      }
    }
  }, [lifetime]);
  const [snapshotOwner, setSnapshotOwner] = useState(owner);
  if (snapshotOwner !== owner) {
    setSnapshotOwner(owner); setSnoozeSnapshot(null); setLastSnoozed(null);
    setStorageError(null); setGeofenceSnapshot(null); setWellnessSnapshot(null);
  }
  useEffect(() => { void Promise.resolve().then(() => saveSnoozes('load')); }, [saveSnoozes]);
  useEffect(() => {
    if (!lifetime || !snoozesReady || recommendationData.candidatesUpdatedAt == null) return;
    let alive = true;
    void lifetime.store.prune(new Set(quests.map(q => q.id))).then(value => {
      if (alive && lifetime.isCurrent()) setSnoozeSnapshot({ owner: lifetime.owner, value });
    }).catch(() => { if (alive) setStorageError('Snoozes could not be saved. Try again.'); });
    return () => { alive = false; };
  }, [lifetime, quests, recommendationData.candidatesUpdatedAt, snoozesReady]);
  useEffect(() => {
    const expiry = Math.min(...Object.values(snoozes).filter(until => until > now));
    if (!Number.isFinite(expiry)) return;
    const timer = setTimeout(() => { setNow(Date.now()); void saveSnoozes('load'); }, Math.max(1, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [snoozes, now, saveSnoozes]);
  useEffect(() => {
    let alive = true, readVersion = 0;
    if (!owner) return;
    const update = () => {
      const version = ++readVersion; setNow(Date.now());
      void readGeofenceEvents().then(events => { if (alive && version === readVersion) setGeofenceSnapshot({ owner, events }); }).catch(() => {});
      void saveSnoozes('load');
      void lifetime?.queue?.flush().catch(() => {});
    };
    update();
    const timer = setInterval(() => { if (AppState.currentState === 'active') update(); }, 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    const unsubscribe = subscribeGeofenceEvents(events => { readVersion += 1; setGeofenceSnapshot({ owner, events }); setNow(Date.now()); });
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('online', update);
    return () => { alive = false; clearInterval(timer); subscription.remove(); unsubscribe();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('online', update); };
  }, [owner, lifetime, saveSnoozes]);
  // Successful workspace reads also signal native connectivity recovery.
  useEffect(() => { void lifetime?.queue?.flush().catch(() => {}); }, [lifetime, recommendationData.candidatesUpdatedAt]);
  const context = useMemo(() => ({
    now, coords: permissionStatus === 'granted' ? coords : null, locationUpdatedAt, places: locations,
    placesUpdatedAt: locationsUpdatedAt, history: completionHistory, ...recommendationData,
    geofenceEvents: permissionStatus === 'granted' ? geofenceEvents : {}, wellness,
    personalGoal: profile?.goal ?? null,
  }), [now, coords, permissionStatus, locationUpdatedAt, locations, locationsUpdatedAt, completionHistory, recommendationData, geofenceEvents, wellness, profile?.goal]);
  const snapshot = useMemo(() => recommendationSnapshot(quests, context, {
    quests: recommendationData.error ?? workspaceErrors?.quests, profile: workspaceErrors?.profile, places: locationsError ?? undefined,
  }), [quests, context, recommendationData.error, workspaceErrors?.quests, workspaceErrors?.profile, locationsError]);
  const { ranked } = snapshot;
  const eligible = useMemo(() => recommendedQuests(ranked), [ranked]);
  const recommendations = useMemo(() => snoozesReady ? eligible.filter(item => !(snoozes[item.quest.id] > snapshot.now)) : [], [eligible, snoozes, snapshot.now, snoozesReady]);
  const recordEvent = useCallback((event: RecommendationEvent) => {
    if (!MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED || !lifetime?.queue) return;
    void lifetime.queue.enqueue(event).catch(() => { if (__DEV__) console.warn('Recommendation measurement could not be queued'); });
  }, [lifetime]);
  const snoozeQuest = useCallback((id: string) => { void saveSnoozes('snooze', id); }, [saveSnoozes]);
  const undoSnooze = useCallback(() => { if (lastSnoozed && lastSnoozed.owner === owner) void saveSnoozes('undo', lastSnoozed.id); }, [lastSnoozed, owner, saveSnoozes]);
  const restoreSnoozes = useCallback(() => { void saveSnoozes('restore'); }, [saveSnoozes]);
  const retryContext = useCallback(() => { void Promise.allSettled([retryWorkspace('quests'), retryWorkspace('profile'), refreshLocations(), saveSnoozes('load')]); }, [retryWorkspace, refreshLocations, saveSnoozes]);
  const contextError = storageError || snapshot.contextError;
  return { ranked, recommendations, now: snapshot.now, locationAvailable: snapshot.locationAvailable, snoozesReady,
    snoozedCount: snoozesReady ? eligible.length - recommendations.length : 0, contextError, retryContext,
    snoozeQuest, undoSnooze, restoreSnoozes, lastSnoozedId: lastSnoozed && lastSnoozed.owner === owner && snoozes[lastSnoozed.id] > now ? lastSnoozed.id : null, recordEvent };
}
const QuestPriorityContext = createContext<ReturnType<typeof usePriorityValue> | null>(null);
export function QuestPriorityProvider({ children }: { children: ReactNode }) {
  const value = usePriorityValue();
  return <QuestPriorityContext.Provider value={value}>{children}</QuestPriorityContext.Provider>;
}
export function useQuestPriority() {
  const context = useContext(QuestPriorityContext);
  if (!context) throw new Error('useQuestPriority requires QuestPriorityProvider');
  return context;
}
