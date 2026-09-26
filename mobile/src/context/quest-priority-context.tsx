import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useUserData } from './user-data-context';
import { useLocationContext } from './location-context';
import { hasFreshPosition, prioritizeQuests, type RankedQuest } from '@/lib/quest-priority';
import { readGeofenceEvents, subscribeGeofenceEvents, type GeofenceEvents } from '@/lib/geofence-events';
import { getMyRecommendationWellnessContext, subscribeRecommendationContext, type RecommendationWellnessContext } from '@/lib/wellbeing-data';

const QuestPriorityContext = createContext<{ ranked: RankedQuest[]; locationAvailable: boolean; now: number } | null>(null);

export function QuestPriorityProvider({ children }: { children: ReactNode }) {
  const { user, quests, completionHistory } = useUserData();
  const { coords, locationUpdatedAt, locations, permissionStatus } = useLocationContext();
  const [now, setNow] = useState(Date.now);
  const [geofenceEvents, setGeofenceEvents] = useState<GeofenceEvents>({});
  const [wellness, setWellness] = useState<RecommendationWellnessContext | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (!user) { setWellness(null); return; }
      void getMyRecommendationWellnessContext(user.id).then(value => { if (alive) setWellness(value); }).catch(() => { if (alive) setWellness(null); });
    };
    load();
    const unsubscribe = subscribeRecommendationContext(load);
    return () => { alive = false; unsubscribe(); };
  }, [user]);
  useEffect(() => {
    let alive = true;
    const update = () => {
      setNow(Date.now());
      void readGeofenceEvents().then(events => { if (alive) setGeofenceEvents(events); });
    };
    update();
    const timer = setInterval(() => { if (AppState.currentState === 'active') update(); }, 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    const unsubscribe = subscribeGeofenceEvents(events => { setGeofenceEvents(events); setNow(Date.now()); });
    return () => { alive = false; clearInterval(timer); subscription.remove(); unsubscribe(); };
  }, []);
  const context = useMemo(() => ({
    now: Math.max(now, locationUpdatedAt ?? now), coords: permissionStatus === 'granted' ? coords : null,
    locationUpdatedAt, places: locations, history: completionHistory,
    geofenceEvents: permissionStatus === 'granted' ? geofenceEvents : {}, wellness,
  }), [now, coords, permissionStatus, locationUpdatedAt, locations, completionHistory, geofenceEvents, wellness]);
  const value = useMemo(() => ({
    ranked: prioritizeQuests(quests, context),
    now: context.now,
    locationAvailable: hasFreshPosition(context),
  }), [quests, context]);
  return <QuestPriorityContext.Provider value={value}>{children}</QuestPriorityContext.Provider>;
}
export function useQuestPriority() {
  const context = useContext(QuestPriorityContext);
  if (!context) throw new Error('useQuestPriority requires QuestPriorityProvider');
  return context;
}
