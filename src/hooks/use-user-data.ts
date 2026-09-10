export { useUserData, UserDataProvider, calculateLevel } from '@/context/user-data-context';
export type { Quest, UserProfile, Category, QuestStatus, LevelProgress } from '@/context/user-data-context';

export { useUserLocations } from './use-user-locations';
export type { UserLocation, NewLocation } from './use-user-locations';

export { useCurrentLocation, isGeofencingSupported } from './use-current-location';

export {
  registerGeofences,
  unregisterAllGeofences,
  getRegisteredGeofences,
  syncGeofences,
  GEOFENCE_TASK_NAME,
} from './use-geofencing';
export type { GeofenceRegion } from './use-geofencing';
