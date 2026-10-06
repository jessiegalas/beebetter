import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { MOBILE_WELLNESS_AND_SUPPORT_ENABLED } from '@/constants/features';
import { useUserData } from './user-data-context';
import { useLocationContext } from './location-context';
import { hasFreshPosition, prioritizeQuests, type RankedQuest } from '@/lib/quest-priority';
import { readGeofenceEvents, subscribeGeofenceEvents, type GeofenceEvents } from '@/lib/geofence-events';
import { getMyRecommendationWellnessContext, subscribeRecommendationContext, type RecommendationWellnessContext } from '@/lib/wellbeing-data';

const QuestPriorityContext = createContext<{ ranked: RankedQuest[]; locationAvailable: boolean; now: number } | null>(null);

export function QuestPriorityProvider({ children }: { children: ReactNode }) {
  const { user, profile, quests, completionHistory } = useUserData();
  const { coords, locationUpdatedAt, locations, permissionStatus } = useLocationContext();
  const [now, setNow] = useState(Date.now);
  const [geofenceSnapshot, setGeofenceSnapshot] = useState<{ user: typeof user; events: GeofenceEvents } | null>(null);
  const geofenceEvents = useMemo(() => geofenceSnapshot?.user === user ? geofenceSnapshot?.events ?? {} : {}, [geofenceSnapshot, user]);
  const [wellness, setWellness] = useState<RecommendationWellnessContext | null>(null);
  useEffect(() => {
    if (!MOBILE_WELLNESS_AND_SUPPORT_ENABLED) return;
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
    let readVersion = 0;
    if (!user) return;
    const update = () => {
      const version = ++readVersion;
      setNow(Date.now());
      void readGeofenceEvents().then(events => { if (alive && version === readVersion) setGeofenceSnapshot({ user, events }); });
    };
    update();
    const timer = setInterval(() => { if (AppState.currentState === 'active') update(); }, 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    const unsubscribe = subscribeGeofenceEvents(events => { readVersion += 1; setGeofenceSnapshot({ user, events }); setNow(Date.now()); });
    return () => { alive = false; clearInterval(timer); subscription.remove(); unsubscribe(); };
  }, [user]);
  const context = useMemo(() => ({
    now: Math.max(now, locationUpdatedAt ?? now), coords: permissionStatus === 'granted' ? coords : null,
    locationUpdatedAt, places: locations, history: completionHistory,
    geofenceEvents: permissionStatus === 'granted' ? geofenceEvents : {}, wellness, personalGoal: profile?.goal ?? null,
  }), [now, coords, permissionStatus, locationUpdatedAt, locations, completionHistory, geofenceEvents, wellness, profile?.goal]);
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
