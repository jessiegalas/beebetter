import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useUserData } from '@/context/user-data-context';
import { useLocationContext } from '@/context/location-context';
import { questBrowsingSnapshot } from '@/lib/quest-context';

/** Read-only projection of the provider-owned workspace; no additional quest requests or state. */
export function useQuestBrowsing() {
  const { user, quests, recommendationData, retryWorkspace } = useUserData();
  const { coords, locationUpdatedAt, locations, locationsUpdatedAt, permissionStatus, geofenceEvents } = useLocationContext();
  const [tick, setTick] = useState(Date.now);
  const owner = user?.id;
  useEffect(() => {
    if (!owner) return;
    const update = () => { if (AppState.currentState === 'active') setTick(Date.now()); };
    const timer = setInterval(update, 30_000);
    const subscription = AppState.addEventListener('change', update);
    return () => { clearInterval(timer); subscription.remove(); };
  }, [owner]);
  const snapshot = useMemo(() => questBrowsingSnapshot(quests.filter(quest => quest.owner_id === owner),
    recommendationData.facts, recommendationData.factsUpdatedAt, {
      now: tick, coords: permissionStatus === 'granted' ? coords : null, locationUpdatedAt,
      places: locations, placesUpdatedAt: locationsUpdatedAt,
      geofenceEvents: permissionStatus === 'granted' ? geofenceEvents : {},
    }, Date.now), [owner, quests, recommendationData.facts, recommendationData.factsUpdatedAt, coords, permissionStatus, locationUpdatedAt, locations, locationsUpdatedAt, geofenceEvents, tick]);
  return { ...snapshot, retryPrerequisites: () => { void retryWorkspace('quests'); } };
}
