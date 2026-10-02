import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/supabase';
import type { Quest } from '@/context/user-data-context';

export const QUEST_NOTIFICATION_CATEGORY = 'QUEST_ACTIONS';
export const QUEST_OPEN_CATEGORY = 'QUEST_OPEN';
export const COMPLETE_QUEST_ACTION = 'COMPLETE_QUEST';
export const OPEN_QUEST_ACTION = 'OPEN_QUEST';
export const QUEST_CHANNEL_ID = 'quests';
const DEVICE_KEY = 'beebetter:push-device';
const PUSH_TASK = 'beebetter:quest-push';
const PUSH_TRANSPORT = 'quest-push-v1';
type Device = { token: string; ownerId: string; registeredAt: number };
type NotificationStatus = 'checking' | 'ready' | 'denied' | 'unavailable' | 'error';
let status: NotificationStatus = 'checking';
const listeners = new Set<() => void>();
function setStatus(value: NotificationStatus) { status = value; listeners.forEach(listener => listener()); }
export function useQuestNotificationStatus() {
  return useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, () => status, () => 'unavailable' as NotificationStatus);
}
let isConfigured = false;
let generation = 0;
let queue: Promise<void> = Promise.resolve();
const registrations = new Map<string, Promise<void>>();
function hasPushPermission(permission: Notifications.NotificationPermissionsStatus) {
  // Android can retain the runtime grant while notifications are blocked in Settings.
  return permission.granted && permission.status !== 'denied';
}
Notifications.setNotificationHandler({ handleNotification: async notification => {
  // The task presents data-only pushes once with native action buttons.
  const visible = notification.request.content.data?.transport !== PUSH_TRANSPORT;
  return { shouldShowBanner: visible, shouldShowList: visible, shouldPlaySound: visible, shouldSetBadge: false };
} });
if (Platform.OS === 'android' && !TaskManager.isTaskDefined(PUSH_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(PUSH_TASK, async ({ data, error }) => {
    if (error || !data || 'actionIdentifier' in data) return;
    const version = generation;
    try {
      const raw = data.data.dataString ?? data.data.body;
      const payload = typeof raw === 'string' ? JSON.parse(raw) : data.data;
      if (payload?.transport !== PUSH_TRANSPORT || typeof payload.questId !== 'string' ||
          typeof payload.ownerId !== 'string' || typeof payload.notificationId !== 'string' ||
          typeof payload.title !== 'string' || typeof payload.message !== 'string' ||
          ![QUEST_NOTIFICATION_CATEGORY, QUEST_OPEN_CATEGORY].includes(payload.categoryId) ||
          !Number.isFinite(Date.parse(payload.expiresAt)) || Date.parse(payload.expiresAt) <= Date.now()) return;
      const device = await readDevice();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      const permission = await Notifications.getPermissionsAsync();
      if (sessionError || !hasPushPermission(permission) || !device || device.registeredAt <= 0 ||
          device.ownerId !== payload.ownerId || session?.user.id !== payload.ownerId || version !== generation) return;
      await Notifications.scheduleNotificationAsync({
        identifier: 'quest-push-' + payload.notificationId,
        content: { title: payload.title, body: payload.message, sound: 'default', categoryIdentifier: payload.categoryId,
          data: { questId: payload.questId, ownerId: payload.ownerId, notificationId: payload.notificationId, kind: payload.kind } },
        trigger: { channelId: QUEST_CHANNEL_ID },
      });
    } catch { console.warn('Quest push presentation failed'); }
  });
}
export function questNeedsOpen(quest: Pick<Quest, 'requires_proof' | 'status' | 'prerequisite_quest_id'>) {
  return quest.requires_proof || quest.status !== 'active' || Boolean(quest.prerequisite_quest_id);
}
export async function configureQuestNotifications(requestPermission = true): Promise<boolean> {
  if (Platform.OS !== 'android' || Constants.executionEnvironment === 'storeClient') { setStatus('unavailable'); return false; }
  const version = generation;
  try {
    await Notifications.setNotificationChannelAsync(QUEST_CHANNEL_ID, {
      name: 'Quest reminders', importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200], lightColor: '#F6C445',
    });
    let permission = await Notifications.getPermissionsAsync();
    if (!hasPushPermission(permission) && permission.canAskAgain && requestPermission) permission = await Notifications.requestPermissionsAsync();
    if (version !== generation) return false;
    if (!hasPushPermission(permission)) {
      await cancelQuestNotifications().catch(() => {});
      setStatus('denied'); return false;
    }
    if (version !== generation) return false;
    const open = { identifier: OPEN_QUEST_ACTION, buttonTitle: 'Open', options: { opensAppToForeground: true } };
    await Notifications.setNotificationCategoryAsync(QUEST_NOTIFICATION_CATEGORY, [
      { identifier: COMPLETE_QUEST_ACTION, buttonTitle: 'Complete', options: { opensAppToForeground: true } }, open,
    ]);
    await Notifications.setNotificationCategoryAsync(QUEST_OPEN_CATEGORY, [open]);
    if (!await TaskManager.isTaskRegisteredAsync(PUSH_TASK)) await Notifications.registerTaskAsync(PUSH_TASK);
    if (version !== generation) return false;
    isConfigured = true;
    return true;
  } catch (error) {
    if (version === generation) setStatus('error');
    throw error;
  }
}
async function registerDevice(token: string, ownerId: string, enabled: boolean): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const { error } = await supabase.rpc('register_quest_push_device', {
      token_value: token, owner_id_value: ownerId, enabled_value: enabled,
    }).abortSignal(controller.signal);
    if (error) throw error;
  } finally { clearTimeout(timer); }
}
async function getPushToken(projectId: string, devicePushToken?: Notifications.DevicePushToken): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId, ...(devicePushToken ? { devicePushToken } : {}) }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Push registration timed out')), 10_000); }),
    ]);
    return result.data;
  } finally { clearTimeout(timer); }
}
async function readDevice(): Promise<Device | null> {
  const value = await AsyncStorage.getItem(DEVICE_KEY);
  if (!value) return null;
  try {
    const device = JSON.parse(value);
    if (typeof device?.token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(device.token) &&
      typeof device.ownerId === 'string' && device.ownerId.length > 0 && Number.isFinite(device.registeredAt)) return device;
  } catch { /* Discard corrupt or legacy records; obtain a fresh registration. */ }
  await AsyncStorage.removeItem(DEVICE_KEY);
  return null;
}
export function cancelQuestNotifications(): Promise<void> {
  generation += 1;
  isConfigured = false;
  queue = queue.catch(() => {}).then(async () => {
    if (Platform.OS !== 'android') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
    const device = await readDevice();
    if (device) {
      await registerDevice(device.token, device.ownerId, false).catch(error => { setStatus('error'); throw error; });
      await AsyncStorage.removeItem(DEVICE_KEY);
    }
    setStatus('checking');
  });
  return queue;
}
// Replace blanket 18:00 local schedules with cloud registration.
export function scheduleQuestNotifications(_quests: Quest[], isSessionCurrent: () => boolean = () => true, force = false, devicePushToken?: Notifications.DevicePushToken, registrationOwnerId?: string): Promise<void> {
  const version = generation;
  const registrationKey = (registrationOwnerId ?? 'unknown') + ':' + `${version}:${devicePushToken ? JSON.stringify(devicePushToken) : force ? 'fresh' : 'cached'}`;
  const existing = registrations.get(registrationKey);
  if (existing) return existing;
  const task = queue.catch(() => {}).then(async () => {
    if (!isConfigured || Platform.OS !== 'android' || !isSessionCurrent() || version !== generation) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled.filter(item => item.identifier.startsWith('quest-')).map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session || (registrationOwnerId && session.user.id !== registrationOwnerId) || !isSessionCurrent() || version !== generation) return;
    const previous = await readDevice();
    setStatus('checking');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) throw new Error('Push project is not configured');
    // A cached token saves an Expo request, but never substitutes for the server RPC.
    const token = !force && !devicePushToken && previous?.ownerId === session.user.id && Date.now() - previous.registeredAt < 60 * 60_000
      ? previous.token : await getPushToken(projectId, devicePushToken);
    if (!isSessionCurrent() || version !== generation) return;
    // Record the attempted token first so timeout/logout cleanup can still revoke it.
    await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify({ token, ownerId: session.user.id, registeredAt: 0 }));
    if (!isSessionCurrent() || version !== generation) return;
    await registerDevice(token, session.user.id, true);
    if (previous && previous.token !== token && previous.ownerId === session.user.id) {
      await registerDevice(previous.token, session.user.id, false);
    }
    // Save before queued logout cleanup, even if the session ended during this RPC.
    await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify({ token, ownerId: session.user.id, registeredAt: Date.now() }));
    if (isSessionCurrent() && version === generation) setStatus('ready');
  }).catch(error => { if (isSessionCurrent() && version === generation) setStatus('error'); throw error; });
  queue = task;
  registrations.set(registrationKey, task);
  void task.finally(() => { if (registrations.get(registrationKey) === task) registrations.delete(registrationKey); }).catch(() => {});
  return task;
}
export function isQuestNotificationsConfigured() { return isConfigured; }
