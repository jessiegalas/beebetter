import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Quest } from '@/context/user-data-context';

export const QUEST_NOTIFICATION_CATEGORY = 'QUEST_ACTIONS';
export const COMPLETE_QUEST_ACTION = 'COMPLETE_QUEST';
export const OPEN_QUEST_ACTION = 'OPEN_QUEST';
export const QUEST_CHANNEL_ID = 'quests';

let isConfigured = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function configureQuestNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(QUEST_CHANNEL_ID, {
      name: 'Quest reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200],
      lightColor: '#FFC530',
    });
  }

  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) {
    const requested = await Notifications.requestPermissionsAsync();
    if (!requested.granted) return false;
  }

  await Notifications.setNotificationCategoryAsync(QUEST_NOTIFICATION_CATEGORY, [
    {
      identifier: COMPLETE_QUEST_ACTION,
      buttonTitle: 'Complete',
      options: { opensAppToForeground: true },
    },
    {
      identifier: OPEN_QUEST_ACTION,
      buttonTitle: 'Open quest',
      options: { opensAppToForeground: true },
    },
  ]);

  isConfigured = true;
  return true;
}

let notificationGeneration = 0;
let notificationQueue: Promise<void> = Promise.resolve();

export function cancelQuestNotifications(): Promise<void> {
  notificationGeneration += 1;
  notificationQueue = notificationQueue.catch(() => {}).then(async () => {
    if (Platform.OS !== 'web') await Notifications.cancelAllScheduledNotificationsAsync();
  });
  return notificationQueue.catch(error => { console.warn('Could not cancel reminders:', error); });
}

export function scheduleQuestNotifications(quests: Quest[], isSessionCurrent: () => boolean = () => true): Promise<void> {
  const generation = ++notificationGeneration;
  const isCurrent = () => generation === notificationGeneration && isSessionCurrent();
  notificationQueue = notificationQueue.catch(() => {}).then(() => scheduleCurrentQuestNotifications(quests, isCurrent));
  return notificationQueue;
}

async function scheduleCurrentQuestNotifications(quests: Quest[], isCurrent: () => boolean): Promise<void> {
  if (!isConfigured || Platform.OS === 'web' || !isCurrent()) return;

  await Notifications.cancelAllScheduledNotificationsAsync();
  const activeQuests = quests.filter((quest) => quest.status === 'active').slice(0, 3);

  for (const quest of activeQuests) {
    if (!isCurrent()) return;
    const nextReminder = new Date();
    nextReminder.setHours(18, 0, 0, 0);
    if (nextReminder.getTime() <= Date.now()) {
      nextReminder.setDate(nextReminder.getDate() + 1);
    }

    await Notifications.scheduleNotificationAsync({
      identifier: `quest-${quest.id}`,
      content: {
        title: 'A small win is waiting',
        body: `${quest.title} · +${quest.xp} XP`,
        categoryIdentifier: quest.requires_proof ? undefined : QUEST_NOTIFICATION_CATEGORY,
        data: { questId: quest.id, requiresProof: quest.requires_proof },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: nextReminder,
        ...(Platform.OS === 'android' ? { channelId: QUEST_CHANNEL_ID } : {}),
      },
    });
  }
}

export function isQuestNotificationsConfigured() {
  return isConfigured;
}
