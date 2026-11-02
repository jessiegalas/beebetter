import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { MOBILE_GEOFENCING_ENABLED } from '@/constants/features';
import { useUserData } from '@/context/user-data-context';
import { useLocationContext } from '@/context/location-context';
import { clearGeofenceEvents } from '@/lib/geofence-events';
// Static import retains the native task definition in cold/headless startup.
import { syncGeofences, unregisterAllGeofences } from '@/hooks/use-geofencing';

/** Optional background lifecycle; saved places and foreground GPS belong to core. */
export function GeofencingFeature() {
  const { user } = useUserData();
  const { activeLocations, locationsUpdatedAt, permissionStatus } = useLocationContext();
  const locationsReady = locationsUpdatedAt != null;
  const lifetime = useMemo(() => ({ user, permissionStatus }), [user, permissionStatus]);
  const [initializedFor, setInitializedFor] = useState<object | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      await unregisterAllGeofences();
      if (!current) return;
      if (!MOBILE_GEOFENCING_ENABLED) { await clearGeofenceEvents(); return; }
      if (!user || permissionStatus !== 'granted' || Platform.OS === 'web') return;
      if (!(await TaskManager.isAvailableAsync()) || !current) return;
      // Foreground permission is already granted; background failure cannot stop GPS.
      try { await Location.requestBackgroundPermissionsAsync(); } catch { /* Sync checks the current grant. */ }
      if (current) setInitializedFor(lifetime);
    })().catch(error => console.warn('Geofence initialization failed:', error));
    return () => {
      current = false;
      void unregisterAllGeofences().catch(error => console.warn('Geofence cleanup failed:', error));
    };
  }, [user, permissionStatus, lifetime]);

  useEffect(() => {
    if (initializedFor !== lifetime || !user || !locationsReady) return;
    void syncGeofences(activeLocations).catch(error => console.warn('Geofence sync failed:', error));
  }, [activeLocations, initializedFor, lifetime, user, locationsReady]);

  return null;
}
