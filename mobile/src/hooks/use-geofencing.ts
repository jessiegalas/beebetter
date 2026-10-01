import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/supabase';
import { configureQuestNotifications, questNeedsOpen, QUEST_CHANNEL_ID, QUEST_NOTIFICATION_CATEGORY, QUEST_OPEN_CATEGORY } from '@/lib/quest-notifications';
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

  const { eventType, region } = data ?? {};
  try {
    if (region?.identifier) {
      await recordGeofenceEvent(region.identifier, eventType === Location.GeofencingEventType.Enter);
      if (eventType === Location.GeofencingEventType.Enter) await notifyGeofenceEntry(region.identifier);
    }
  } catch (error) { console.warn('Could not record geofence event:', error); }
  return null;
});

export type GeofenceRegion = Location.LocationRegion & { identifier: string };

let generation = 0;
let syncQueue: Promise<unknown> = Promise.resolve();

export function registerGeofences(locations: UserLocation[]): Promise<{ success: boolean; error?: string }> {
  const version = ++generation;
  const task = syncQueue.catch(() => {}).then(() => registerCurrentGeofences(locations, () => version === generation));
  syncQueue = task;
  return task;
}

async function registerCurrentGeofences(locations: UserLocation[], isCurrent: () => boolean): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isCurrent()) return { success: true };
    if (!(await TaskManager.isAvailableAsync())) {
      return { success: false, error: 'Background geofencing is unavailable in this app environment' };
    }

    if (!isCurrent()) return { success: true };
    const isAvailable = await Location.hasServicesEnabledAsync();
    if (!isAvailable) {
      return { success: false, error: 'Location services disabled' };
    }

    if (!isCurrent()) return { success: true };
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== 'granted') {
      return { success: false, error: 'Background location permission not granted' };
    }

    if (!isCurrent()) return { success: true };
    await stopGeofences();
    if (!isCurrent()) return { success: true };

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

export function unregisterAllGeofences(): Promise<void> {
  generation += 1;
  const task = syncQueue.catch(() => {}).then(stopGeofences);
  syncQueue = task;
  return task;
}

async function stopGeofences(): Promise<void> {
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

export async function syncGeofences(locations: UserLocation[]): Promise<void> {
  const result = await registerGeofences(locations);
  if (!result.success && result.error !== 'Background geofencing is unavailable in this app environment') {
    console.warn('Geofence sync skipped:', result.error);
  }
}

let entryQueue: Promise<void> = Promise.resolve();
function notifyGeofenceEntry(locationId: string): Promise<void> {
  entryQueue = entryQueue.catch(() => {}).then(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const ownerId = session.user.id;
    const key = 'beebetter:geofence-notice:' + ownerId + ':' + locationId;
    const last = Number(await AsyncStorage.getItem(key));
    if (last && Date.now() - last < 60 * 60_000) return;
    // Fresh owner-scoped data avoids reminding for completed/deleted quests.
    // Offline entry is skipped instead of showing stale cached quest details.
    const [student, place, quests] = await Promise.all([
      supabase.from('students').select('status').eq('id', ownerId).maybeSingle(),
      supabase.from('user_locations').select('id').eq('id', locationId).eq('owner_id', ownerId).eq('is_active', true).maybeSingle(),
      supabase.from('quests').select('id,title,status,requires_proof,prerequisite_quest_id')
        .eq('owner_id', ownerId).eq('location_id', locationId).eq('status', 'active').order('created_at').limit(1),
    ]);
    if (student.error || place.error || quests.error || student.data?.status !== 'Active' || !place.data || !quests.data?.length) return;
    if (!(await configureQuestNotifications(false))) return;
    const { data: current } = await supabase.auth.getSession();
    if (current.session?.user.id !== ownerId) return;
    const quest = quests.data[0];
    await Notifications.scheduleNotificationAsync({
      identifier: 'geofence-' + ownerId + '-' + locationId,
      content: {
        title: 'A quest is nearby', body: quest.title, sound: 'default',
        categoryIdentifier: questNeedsOpen(quest) ? QUEST_OPEN_CATEGORY : QUEST_NOTIFICATION_CATEGORY,
        data: { questId: quest.id, ownerId, kind: 'geofence', notificationId: 'geofence-' + quest.id + '-' + Date.now() },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: QUEST_CHANNEL_ID },
    });
    await AsyncStorage.setItem(key, String(Date.now()));
  });
  return entryQueue;
}
