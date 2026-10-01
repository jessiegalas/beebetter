import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import * as Notifications from 'expo-notifications';
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
Notifications.setNotificationHandler({ handleNotification: async () => ({
  shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
}) });
export function questNeedsOpen(quest: Pick<Quest, 'requires_proof' | 'status' | 'prerequisite_quest_id'>) {
  return quest.requires_proof || quest.status !== 'active' || Boolean(quest.prerequisite_quest_id);
}
export async function configureQuestNotifications(requestPermission = true): Promise<boolean> {
  if (Platform.OS !== 'android') { setStatus('unavailable'); return false; }
  await Notifications.setNotificationChannelAsync(QUEST_CHANNEL_ID, {
    name: 'Quest reminders', importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200], lightColor: '#F6C445',
  });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain && requestPermission) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    await cancelQuestNotifications().catch(() => {});
    setStatus('denied'); return false;
  }
  const open = { identifier: OPEN_QUEST_ACTION, buttonTitle: 'Open', options: { opensAppToForeground: true } };
  await Notifications.setNotificationCategoryAsync(QUEST_NOTIFICATION_CATEGORY, [
    { identifier: COMPLETE_QUEST_ACTION, buttonTitle: 'Complete', options: { opensAppToForeground: true } }, open,
  ]);
  await Notifications.setNotificationCategoryAsync(QUEST_OPEN_CATEGORY, [open]);
  isConfigured = true;
  return true;
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
async function getPushToken(projectId: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Push registration timed out')), 10_000); }),
    ]);
    return result.data;
  } finally { clearTimeout(timer); }
}
async function readDevice(): Promise<Device | null> {
  const value = await AsyncStorage.getItem(DEVICE_KEY);
  return value ? JSON.parse(value) as Device : null;
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
export function scheduleQuestNotifications(_quests: Quest[], isSessionCurrent: () => boolean = () => true, force = false): Promise<void> {
  const version = generation;
  queue = queue.catch(() => {}).then(async () => {
    if (!isConfigured || Platform.OS !== 'android' || !isSessionCurrent() || version !== generation) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled.filter(item => item.identifier.startsWith('quest-')).map(item => Notifications.cancelScheduledNotificationAsync(item.identifier)));
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session || !isSessionCurrent() || version !== generation) return;
    const previous = await readDevice();
    if (!force && previous?.ownerId === session.user.id && Date.now() - previous.registeredAt < 60 * 60_000) { setStatus('ready'); return; }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) throw new Error('Push project is not configured');
    const token = await getPushToken(projectId);
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
  }).catch(error => { setStatus('error'); throw error; });
  return queue;
}
export function isQuestNotificationsConfigured() { return isConfigured; }
