import { recordGeofenceEvent } from '@/lib/geofence-events';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { UserLocation } from './use-user-locations';

export const GEOFENCE_TASK_NAME = 'bee-better-geofence-task';

type GeofenceTaskData = {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion & { identifier: string };
};

TaskManager.defineTask<GeofenceTaskData>(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Geofence task error:', error);
    return null;
  }

  const { eventType, region } = data;
  if (region?.identifier) await recordGeofenceEvent(region.identifier, eventType === Location.GeofencingEventType.Enter);
  return null;
});

export type GeofenceRegion = Location.LocationRegion & { identifier: string };

export async function registerGeofences(locations: UserLocation[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await TaskManager.isAvailableAsync())) {
      return { success: false, error: 'Background geofencing is unavailable in this app environment' };
    }

    const isAvailable = await Location.hasServicesEnabledAsync();
    if (!isAvailable) {
      return { success: false, error: 'Location services disabled' };
    }

    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== 'granted') {
      return { success: false, error: 'Background location permission not granted' };
    }

    await unregisterAllGeofences();

    const activeLocations = locations.filter((l) => l.is_active);
    if (activeLocations.length === 0) {
      return { success: true };
    }

    const regions: GeofenceRegion[] = activeLocations.map((loc) => ({
      identifier: loc.id,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius: loc.radius,
      notifyOnEnter: true,
      notifyOnExit: true,
    }));

    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
    console.log(`Registered ${regions.length} geofences`);
    return { success: true };
  } catch (err) {
    console.error('Failed to register geofences:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to register geofences' };
  }
}

export async function unregisterAllGeofences(): Promise<void> {
  try {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    }
    console.log('All geofences unregistered');
  } catch (err) {
    console.warn('Error unregistering geofences:', err);
  }
}

export async function getRegisteredGeofences(): Promise<GeofenceRegion[]> {
  try {
    const tasks = await TaskManager.getRegisteredTasksAsync();
    const geofenceTask = tasks.find((task) => task.taskName === GEOFENCE_TASK_NAME);
    return geofenceTask ? (geofenceTask.options?.regions as GeofenceRegion[] ?? []) : [];
  } catch {
    return [];
  }
}

let syncQueue = Promise.resolve();
export function syncGeofences(locations: UserLocation[]): Promise<void> {
  syncQueue = syncQueue.catch(() => {}).then(async () => {
    const result = await registerGeofences(locations);
    if (!result.success && result.error !== 'Background geofencing is unavailable in this app environment') {
      console.warn('Geofence sync skipped:', result.error);
    }
  });
  return syncQueue;
}
